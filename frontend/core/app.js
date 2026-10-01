/* =========== LOGIN =========== */
async function entrar(){
  const l=document.getElementById('in-login').value.trim().toLowerCase();
  const s=document.getElementById('in-senha').value;
  const erro=document.getElementById('erro-login');
  const botao=document.querySelector('#tela-login .btn-principal');

  if(!l || !s){
    erro.textContent='Preencha usuário e senha.';
    erro.classList.remove('oculto');
    return;
  }
  erro.classList.add('oculto');
  if(botao){ botao.disabled=true; botao.textContent='Entrando...'; }
  try{
    const dados = await api('/auth/login', { method:'POST', body: JSON.stringify({ login:l, senha:s }) });
    localStorage.setItem('token', dados.token);
    localStorage.setItem('usuario', JSON.stringify(dados.usuario));
    usuario = normalizarUsuarioApi(dados.usuario);
    iniciarApp();
  }catch(e){
    erro.textContent = e.message;
    erro.classList.remove('oculto');
  }finally{
    if(botao){ botao.disabled=false; botao.textContent='Entrar'; }
  }
}
document.getElementById('in-senha').addEventListener('keydown',e=>{ if(e.key==='Enter') entrar(); });

function sair(){
  usuario=null;
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  document.getElementById('app').style.display='none';
  document.getElementById('tela-login').style.display='grid';
  document.getElementById('in-senha').value='';
}

// se já tinha uma sessão salva (login anterior), pula a tela de login direto
function restaurarSessao(){
  const token = localStorage.getItem('token');
  const usuarioSalvo = localStorage.getItem('usuario');
  if(!token || !usuarioSalvo) return;
  try{
    usuario = normalizarUsuarioApi(JSON.parse(usuarioSalvo));
    iniciarApp();
  }catch(e){
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }
}

function iniciarApp(){
  document.getElementById('tela-login').style.display='none';
  document.getElementById('app').style.display='block';
  atualizarCabecalho();
  document.getElementById('sel-data').value=hoje();
  const ordemPreferida = ['painel','lancar','consumo-plantao','vistoria','extrato','comprovantes','boletos','fechamento','impostos','funcionarios','vencidos','revpar','manutencao','boletos-admin','notas-fiscais','relatorio','rede'];
  const primeiraAba = ordemPreferida.find(t=>abasDoUsuario(usuario).includes(t)) || 'vistoria';
  const rotaSolicitada=AppModulos.rotaAtual();
  abrir(podeAbrirTela(rotaSolicitada) ? rotaSolicitada : primeiraAba);
}

function atualizarCabecalho(){
  document.getElementById('nome-usuario').textContent=usuario.nome;

  const ids=unidadesDoUsuario();
  const escopo = usuario.unidades==='todas' ? 'todas as unidades'
    : ids.length>1 ? ids.map(nomeUnidade).join(', ') : nomeUnidade(ids[0]);
  document.getElementById('papel-usuario').textContent=rotuloPapel(usuario.papel)+' · '+escopo;

  const sel=document.getElementById('sel-unidade');
  const selecaoAnterior=sel.value;
  sel.innerHTML=ids.map(id=>`<option value="${id}">${nomeUnidade(id)}</option>`).join('');
  sel.disabled = ids.length===1;
  if(ids.includes(selecaoAnterior)) sel.value=selecaoAnterior;

  const minhasAbas = abasDoUsuario(usuario);
  const temAba = id => minhasAbas.includes(id);

  document.getElementById('aba-painel').classList.toggle('oculto', !temAba('painel'));
  document.getElementById('aba-lancar').classList.toggle('oculto', !temAba('lancar'));
  document.getElementById('aba-consumo-plantao').classList.toggle('oculto', !temAba('consumo-plantao'));
  document.getElementById('aba-vistoria').classList.toggle('oculto', !temAba('vistoria'));
  document.getElementById('aba-extrato').classList.toggle('oculto', !temAba('extrato'));
  document.getElementById('aba-comprovantes').classList.toggle('oculto', !temAba('comprovantes'));
  document.getElementById('aba-boletos').classList.toggle('oculto', !temAba('boletos'));
  document.getElementById('aba-fechamento').classList.toggle('oculto', !temAba('fechamento'));
  document.getElementById('aba-impostos').classList.toggle('oculto', !temAba('impostos'));
  document.getElementById('aba-funcionarios').classList.toggle('oculto', !temAba('funcionarios'));
  document.getElementById('aba-vencidos').classList.toggle('oculto', !temAba('vencidos'));
  document.getElementById('aba-revpar').classList.toggle('oculto', !temAba('revpar'));
  document.getElementById('aba-manutencao').classList.toggle('oculto', !temAba('manutencao'));
  document.getElementById('aba-boletos-admin').classList.toggle('oculto', !temAba('boletos-admin'));
  document.getElementById('aba-notas-fiscais').classList.toggle('oculto', !temAba('notas-fiscais'));
  document.getElementById('aba-relatorio').classList.toggle('oculto', !temAba('relatorio'));
  // comparativo da rede: além de estar marcada, só faz sentido com mais de uma unidade
  document.getElementById('aba-rede').classList.toggle('oculto', !temAba('rede') || ids.length<2);
  // gestão de usuários: sempre exclusiva do administrador geral, não é configurável por aba
  document.getElementById('aba-usuarios').classList.toggle('oculto', usuario.papel!=='admin');
  document.getElementById('aba-historico-exclusoes').classList.toggle('oculto', usuario.papel!=='admin');
  atualizarGruposDoMenu();

  // data: só gerente e diretor podem escolher outra data; funcionário e inspetor ficam presos ao dia de hoje
  const podeEditarData = usuario.papel==='admin' || usuario.papel==='gerente';
  const campoData=document.getElementById('sel-data');
  campoData.disabled = !podeEditarData;
  campoData.classList.toggle('sel-data-travada', !podeEditarData);
  if(!podeEditarData) campoData.value=hoje();
  document.getElementById('aviso-data-travada').classList.toggle('oculto', podeEditarData);
  // Esta função pertence ao módulo Caixa, que pode ainda não ter sido carregado.
  window.atualizarVisibilidadeModoDespesa?.();
}

/* =========== NAVEGAÇÃO =========== */
let telaAtual='';

function atualizarGruposDoMenu(){
  document.querySelectorAll('nav.abas .grupo-menu').forEach(rotulo=>{
    let proximo=rotulo.nextElementSibling;
    let temItemVisivel=false;
    while(proximo && !proximo.classList.contains('grupo-menu')){
      if(proximo.tagName==='BUTTON' && !proximo.classList.contains('oculto')) temItemVisivel=true;
      proximo=proximo.nextElementSibling;
    }
    rotulo.classList.toggle('oculto', !temItemVisivel);
  });
}

function podeAbrirTela(tela){
  if(!usuario || !AppModulos.telas[tela]) return false;
  if(tela==='usuarios' || tela==='historico-exclusoes') return usuario.papel==='admin';
  if(tela==='rede' && unidadesDoUsuario().length<2) return false;
  return abasDoUsuario(usuario).includes(tela);
}

function carregadorDeDados(nome){
  return {
    lancamentos: recarregarLancamentos,
    boletos: recarregarBoletos,
    boletosAdmin: recarregarBoletosAdmin,
    contasFixas: recarregarContasFixas,
    notasFiscais: recarregarNotasFiscais,
    funcionarios: recarregarFuncionarios,
    faltas: recarregarFaltas,
    trocas: recarregarTrocas,
    vistorias: recarregarVistorias,
    produtosVencidos: recarregarProdutosVencidos,
    suites: recarregarSuitesConfig,
    revpar: recarregarRevpar,
    manutencoes: recarregarManutencoes,
    consumoPlantao: recarregarConsumosPlantao,
    usuarios: recarregarUsuarios,
    historicoExclusoes: recarregarHistoricoExclusoes
  }[nome];
}

function nomesDeDadosDaTela(tela){
  const porTela={
    painel:['lancamentos'], lancar:['lancamentos'], extrato:['lancamentos'],
    comprovantes:['lancamentos','boletos','boletosAdmin','contasFixas'],
    fechamento:['lancamentos'], rede:['lancamentos'],
    boletos:['boletos'], impostos:['contasFixas'],
    'boletos-admin':['boletosAdmin'], 'notas-fiscais':['notasFiscais'],
    vistoria:['vistorias'], manutencao:['manutencoes'], 'consumo-plantao':['consumoPlantao'],
    funcionarios:['funcionarios','faltas','trocas'], vencidos:['produtosVencidos'],
    revpar:['suites','revpar'], usuarios:['usuarios'],
    'historico-exclusoes':['historicoExclusoes']
  };
  return tela==='relatorio'
    ? ['lancamentos','boletos','boletosAdmin','contasFixas','notasFiscais','funcionarios','faltas','trocas','vistorias','produtosVencidos','suites','revpar','manutencoes','consumoPlantao','usuarios','historicoExclusoes']
    : (porTela[tela]||[]);
}

function cacheDeCarregamento(){
  if(!AppEstado.cacheDeDados){
    AppEstado.cacheDeDados={carregados:new Set(),ativos:new Map()};
  }
  return AppEstado.cacheDeDados;
}

async function carregarConjuntoDeDados(nome){
  const cache=cacheDeCarregamento();
  if(cache.carregados.has(nome)) return;
  if(cache.ativos.has(nome)) return cache.ativos.get(nome);
  const carregador=carregadorDeDados(nome);
  if(typeof carregador!=='function') throw new Error(`Carregador de dados ${nome} não encontrado.`);
  const promessa=Promise.resolve(carregador())
    .then(()=>cache.carregados.add(nome))
    .finally(()=>cache.ativos.delete(nome));
  cache.ativos.set(nome,promessa);
  return promessa;
}

async function carregarDadosDaTela(tela){
  await Promise.all(nomesDeDadosDaTela(tela).map(carregarConjuntoDeDados));
}

async function abrir(tela){
  if(!podeAbrirTela(tela)) return;
  await carregarModuloDaTela(tela);
  telaAtual=tela;
  Object.keys(AppModulos.telas).forEach(t=>{
    document.getElementById('tela-'+t)?.classList.toggle('oculto', t!==tela);
    document.getElementById('aba-'+t)?.classList.toggle('ativa', t===tela);
  });
  const grupo=AppModulos.grupoDaTela(tela);
  document.body.dataset.modulo=grupo ? grupo.id : '';
  const novaRota='#/'+tela;
  if(location.hash!==novaRota) history.pushState(null, '', novaRota);
  const secao=document.getElementById('tela-'+tela);
  secao?.setAttribute('aria-busy','true');
  await carregarDadosDaTela(tela);
  secao?.removeAttribute('aria-busy');
  desenhar();
}

window.addEventListener('hashchange', ()=>{
  const rota=AppModulos.rotaAtual();
  if(!usuario || rota===telaAtual) return;
  if(podeAbrirTela(rota)) abrir(rota);
  else if(telaAtual) history.replaceState(null, '', '#/'+telaAtual);
});

/* =========== FILTROS =========== */
function unidadeAtual(){ return document.getElementById('sel-unidade').value; }
function dataAtual(){ return document.getElementById('sel-data').value || hoje(); }
function diasPeriodo(){ return parseInt(document.getElementById('sel-periodo').value,10); }

function listaDatas(){
  const n=diasPeriodo(), fim=dataAtual(), out=[];
  const d=new Date(fim+'T12:00:00');
  for(let i=0;i<n;i++){ out.push(new Date(d).toISOString().slice(0,10)); d.setDate(d.getDate()-1); }
  return out.reverse();
}

function filtrar({unidade,datas}){
  return AppEstado.dados.lancamentos.filter(l =>
    (!unidade || l.unidade===unidade) && (!datas || datas.includes(l.data))
  );
}
const somar = arr => arr.reduce((s,l)=>s+l.valor,0);
// só conta como saída de dinheiro físico quando NÃO foi marcado como Pix/transferência
// (lançamentos antigos sem esse campo continuam contando como dinheiro, pra não mudar retroativamente)
const somarSaidasEmDinheiro = arr => arr.filter(l=>l.formaPagamentoSaida!=='pix').reduce((s,l)=>s+l.valor,0);

/* =========== DESENHO =========== */
function desenhar(){
  if(!usuario) return;
  for(const nome of AppModulos.telas[telaAtual]?.desenhar||[]){
    if(nome==='desenharAlertas' && usuario.papel!=='admin') continue;
    window[nome]?.();
  }
}

// desenha um gráfico de linha simples em SVG: pontos reais (linha cheia) + projeção (linha tracejada)
