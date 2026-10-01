/* Módulo Gestão
 * Pessoas, estoque de perdas e indicadores RevPAR/TrevPAR.
 */

/* =========== FUNCIONÁRIOS E AppEstado.dados.faltas =========== */
function nomeCargo(c){
  return {recepcao:'Recepção', caixa_volante:'Operador(a) de caixa volante', cozinha:'Cozinha',
    camareira:'Camareira', fiscal_apoio:'Fiscal de apoio', lavanderia:'Lavanderia',
    manutencao:'Manutenção', gerente:'Gerente', outro:'Outro'}[c] || c;
}

async function salvarFuncionario(){
  const nome=document.getElementById('ff-nome').value.trim();
  const cargo=document.getElementById('ff-cargo').value;
  const telefone=document.getElementById('ff-telefone').value.trim();
  const documento=document.getElementById('ff-documento').value.trim();
  const dataAdmissao=document.getElementById('ff-admissao').value;
  const msg=document.getElementById('msg-funcionario');

  if(!nome){
    msg.style.color='var(--saida)';
    msg.textContent='Informe o nome do funcionário.';
    return;
  }

  try{
    await api('/funcionarios', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), nome, cargo, telefone: telefone||null, documento: documento||null,
      data_admissao: dataAdmissao||null
    }) });
    await recarregarFuncionarios();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('ff-nome').value='';
  document.getElementById('ff-telefone').value='';
  document.getElementById('ff-documento').value='';
  document.getElementById('ff-admissao').value='';
  msg.style.color='var(--entrada)';
  msg.textContent='Funcionário cadastrado.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharFuncionarios();
}

async function excluirFuncionario(id){
  const f=AppEstado.dados.funcionarios.find(x=>x.id===id);
  if(!f) return;
  if(!await confirmarAcao(`Remover "${f.nome}" da lista de funcionários? O histórico de faltas dela continua registrado.`)) return;
  try{
    await api('/funcionarios/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Funcionário', `${f.nome} — ${nomeCargo(f.cargo)}`, f.unidade);
  await recarregarFuncionarios();
  desenharFuncionarios();
}

function montarSelectFaltaFuncionario(){
  const un=unidadeAtual();
  const sel=document.getElementById('ffalta-funcionario');
  if(!sel) return;
  const daUnidade=AppEstado.dados.funcionarios.filter(f=>f.unidade===un);
  sel.innerHTML = daUnidade.length
    ? daUnidade.map(f=>`<option value="${f.id}">${esc(f.nome)}</option>`).join('')
    : '<option value="">Cadastre um funcionário primeiro</option>';
}

function prevejaFotoAtestado(input){
  const arquivos=[...(input.files||[])];
  arquivos.forEach(arq=>{
    if(!arq.type.startsWith('image/')) return;
    const leitor = new FileReader();
    leitor.onload = e => {
      AppEstado.ui.fotosPendentesAtestado.push({dataUrl:e.target.result, nome:arq.name});
      renderizarFotosPendentesAtestado();
    };
    leitor.readAsDataURL(arq);
  });
  input.value='';
}
function removerFotoAtestado(idx){
  AppEstado.ui.fotosPendentesAtestado.splice(idx,1);
  renderizarFotosPendentesAtestado();
}
function renderizarFotosPendentesAtestado(){
  document.getElementById('fotos-pendentes-atestado').innerHTML = AppEstado.ui.fotosPendentesAtestado.map((f,i)=>
    `<div class="foto-anexada"><img src="${esc(f.dataUrl)}" alt=""><button type="button" data-click="removerFotoAtestado(${i})">×</button></div>`
  ).join('');
  document.getElementById('previa-foto-atestado-vazia').classList.toggle('oculto', AppEstado.ui.fotosPendentesAtestado.length>0);
}
function atualizarRotuloAtestado(){
  const justificada=document.getElementById('ffalta-justificada').checked;
  document.getElementById('lbl-atestado').textContent = justificada
    ? 'Anexar atestado ou comprovante (obrigatório pra falta justificada)'
    : 'Anexar atestado ou comprovante (opcional)';
}

async function salvarFalta(){
  const funcionarioId=document.getElementById('ffalta-funcionario').value;
  const data=document.getElementById('ffalta-data').value || hoje();
  const motivo=document.getElementById('ffalta-motivo').value.trim();
  const justificada=document.getElementById('ffalta-justificada').checked;
  const msg=document.getElementById('msg-falta');

  if(!funcionarioId){
    msg.style.color='var(--saida)';
    msg.textContent='Cadastre e escolha um funcionário primeiro.';
    return;
  }
  if(!motivo){
    msg.style.color='var(--saida)';
    msg.textContent='Descreva o motivo da falta.';
    return;
  }
  if(justificada && AppEstado.ui.fotosPendentesAtestado.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Anexe o atestado ou comprovante — obrigatório pra marcar como justificada.';
    return;
  }

  try{
    await api('/faltas', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), funcionario_id: funcionarioId, data, motivo, justificada,
      fotos_url: await Promise.all(AppEstado.ui.fotosPendentesAtestado.map(f=>enviarFoto(f.dataUrl)))
    }) });
    await recarregarFaltas();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('ffalta-motivo').value='';
  document.getElementById('ffalta-justificada').checked=false;
  AppEstado.ui.fotosPendentesAtestado=[];
  renderizarFotosPendentesAtestado();
  atualizarRotuloAtestado();
  msg.style.color='var(--entrada)';
  msg.textContent='Falta registrada.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharFuncionarios();
}

async function excluirFalta(i){
  const fa=AppEstado.dados.faltas[i];
  if(!fa) return;
  if(!await confirmarAcao('Excluir esse registro de falta?')) return;
  try{
    await api('/faltas/'+fa.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  const func=AppEstado.dados.funcionarios.find(x=>x.id===fa.funcionarioId);
  registrarExclusao('Falta', `${func?func.nome:'(removido)'} — ${fa.motivo} (${dataBr(fa.data)})`, fa.unidade);
  await recarregarFaltas();
  desenharFuncionarios();
}

function desenharDashboardFuncionarios(){
  const painel=document.getElementById('grade-stats-funcionarios');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  const secao=painel.closest('.painel');
  if(secao) secao.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const equipe=AppEstado.dados.funcionarios.filter(f=>f.unidade===un);
  const faltasPeriodo=AppEstado.dados.faltas.filter(f=>f.unidade===un && f.data>=desde);
  const justificadas=faltasPeriodo.filter(f=>f.justificada).length;
  const naoJustificadas=faltasPeriodo.length-justificadas;
  const trocasPeriodo=AppEstado.dados.trocas.filter(t=>t.unidade===un && t.registradoEm>=desde);

  document.getElementById('sub-dashboard-funcionarios').textContent = `${nomeUnidade(un)} · últimos 30 dias`;

  painel.innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${equipe.length}</div><div class="rotulo-stat">Funcionários cadastrados</div></div>
    <div class="stat-vistoria"><div class="num-stat vermelho">${faltasPeriodo.length}</div><div class="rotulo-stat">Faltas no período</div></div>
    <div class="stat-vistoria"><div class="num-stat verde">${justificadas}</div><div class="rotulo-stat">Faltas justificadas</div></div>
    <div class="stat-vistoria"><div class="num-stat vermelho">${naoJustificadas}</div><div class="rotulo-stat">Não justificadas</div></div>
    <div class="stat-vistoria"><div class="num-stat">${trocasPeriodo.length}</div><div class="rotulo-stat">Trocas de plantão registradas</div></div>
  `;

  const contagemPorPessoa={};
  faltasPeriodo.forEach(f=>{
    const func=AppEstado.dados.funcionarios.find(x=>x.id===f.funcionarioId);
    const nome=func?func.nome:'(removido)';
    contagemPorPessoa[nome]=(contagemPorPessoa[nome]||0)+1;
  });
  const rankingFaltas=Object.entries(contagemPorPessoa).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maiorFalta=rankingFaltas.length ? rankingFaltas[0][1] : 1;
  document.getElementById('ranking-faltas-funcionarios').innerHTML = rankingFaltas.length
    ? barras(rankingFaltas.map(([nome,valor])=>({nome,valor})), maiorFalta, 's', false)
    : '<div class="vazio">Nenhuma falta no período.</div>';

  const contagemPorTurno={dia:0, noite:0};
  trocasPeriodo.forEach(t=> contagemPorTurno[t.turno]=(contagemPorTurno[t.turno]||0)+1);
  document.getElementById('tab-resumo-trocas-funcionarios').innerHTML = `
    <tr><td>Trocas de turno Dia</td><td class="n num">${contagemPorTurno.dia}</td></tr>
    <tr><td>Trocas de turno Noite</td><td class="n num">${contagemPorTurno.noite}</td></tr>
    <tr><td class="neutro-forte">Total</td><td class="n neutro-forte num">${trocasPeriodo.length}</td></tr>
  `;
}

function desenharFuncionarios(){
  desenharDashboardFuncionarios();
  const un=unidadeAtual();
  document.getElementById('titulo-funcionarios').textContent='Equipe de '+nomeUnidade(un);
  montarSelectFaltaFuncionario();

  const desde=diaMenos(29);
  const equipe=AppEstado.dados.funcionarios.filter(f=>f.unidade===un);
  document.getElementById('tab-funcionarios').innerHTML = equipe.length ? equipe.map(f=>{
    const qtdFaltas=AppEstado.dados.faltas.filter(fa=>fa.funcionarioId===f.id && fa.data>=desde).length;
    return `<tr>
      <td>${esc(f.nome)}</td>
      <td>${nomeCargo(f.cargo)}</td>
      <td>${esc(f.telefone||'—')}</td>
      <td>${f.dataAdmissao?dataBr(f.dataAdmissao):'—'}</td>
      <td class="n ${qtdFaltas>0?'vermelho':''} num">${qtdFaltas}</td>
      <td class="n"><button class="btn-mini" data-click="excluirFuncionario('${escArg(f.id)}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum funcionário cadastrado para esta unidade.</td></tr>';

  const faltasUnidade = AppEstado.dados.faltas
    .map((fa,i)=>({...fa, indiceReal:i}))
    .filter(fa=>fa.unidade===un)
    .sort((a,b)=> a.data<b.data?1:-1);
  document.getElementById('tab-faltas').innerHTML = faltasUnidade.length ? faltasUnidade.map(fa=>{
    const f=AppEstado.dados.funcionarios.find(x=>x.id===fa.funcionarioId);
    const selo = fa.justificada
      ? '<span class="selo-status pago">Justificada</span>'
      : '<span class="selo-status atrasado">Não justificada</span>';
    const legenda=`Atestado · ${f?f.nome:''} · ${dataBr(fa.data)}`;
    return `<tr>
      <td>${dataBr(fa.data)}</td>
      <td>${esc(f?f.nome:'(removido)')}</td>
      <td>${esc(fa.motivo)}</td>
      <td>${fa.fotos && fa.fotos.length ? fa.fotos.map(f=>`<img class="miniatura-tab espaco-miniatura" src="${esc(f)}" alt="Atestado" data-click="abrirLightbox('${escArg(f)}','${escArg(legenda)}')">`).join('') : '<span class="tracinho">—</span>'}</td>
      <td class="n">${selo}</td>
      <td class="n"><button class="btn-mini" data-click="excluirFalta(${fa.indiceReal})">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhuma falta registrada nesta unidade.</td></tr>';
}

/* =========== TROCA DE PLANTÃO =========== */
let fotoPendenteTroca = null;

function montarSelectsFuncionariosTroca(){
  const un=unidadeAtual();
  const equipe=AppEstado.dados.funcionarios.filter(f=>f.unidade===un);
  const opcoes = equipe.length
    ? equipe.map(f=>`<option value="${f.id}">${esc(f.nome)}</option>`).join('')
    : '<option value="">Cadastre funcionários na aba Funcionários</option>';
  const s1=document.getElementById('ft-funcionario1');
  const s2=document.getElementById('ft-funcionario2');
  if(s1) s1.innerHTML=opcoes;
  if(s2) s2.innerHTML=opcoes;
}

function prevejaFotoTroca(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto do documento).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendenteTroca = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-troca-img').src = fotoPendenteTroca.dataUrl;
    document.getElementById('previa-foto-troca-nome').textContent = arq.name;
    document.getElementById('previa-foto-troca').classList.remove('oculto');
    document.getElementById('previa-foto-troca-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoTroca(){
  fotoPendenteTroca = null;
  document.getElementById('ft-foto').value='';
  document.getElementById('previa-foto-troca').classList.add('oculto');
  document.getElementById('previa-foto-troca-vazia').classList.remove('oculto');
}

async function registrarTroca(){
  const msg=document.getElementById('msg-troca');
  const podeLancar = usuario.papel==='admin' || usuario.papel==='gerente';
  if(!podeLancar){
    msg.style.color='var(--saida)';
    msg.textContent='Só gerente e diretor podem lançar troca de plantão.';
    return;
  }

  const turno=document.getElementById('ft-turno').value;
  const funcionario1Id=document.getElementById('ft-funcionario1').value;
  const data1=document.getElementById('ft-data1').value;
  const funcionario2Id=document.getElementById('ft-funcionario2').value;
  const data2=document.getElementById('ft-data2').value;
  const motivo=document.getElementById('ft-motivo').value.trim();

  if(!funcionario1Id || !funcionario2Id){
    msg.style.color='var(--saida)';
    msg.textContent='Escolha os dois funcionários envolvidos na troca.';
    return;
  }
  if(funcionario1Id===funcionario2Id){
    msg.style.color='var(--saida)';
    msg.textContent='Escolha dois funcionários diferentes.';
    return;
  }
  if(!data1 || !data2){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha a data do plantão dos dois funcionários.';
    return;
  }
  if(!motivo){
    msg.style.color='var(--saida)';
    msg.textContent='Descreva o motivo — obrigatório pra lançar a troca.';
    return;
  }

  try{
    const fotoUrl = fotoPendenteTroca ? await enviarFoto(fotoPendenteTroca.dataUrl) : null;
    await api('/trocas', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), turno, funcionario1_id: funcionario1Id, data1,
      funcionario2_id: funcionario2Id, data2, motivo,
      foto_url: fotoUrl
    }) });
    await recarregarTrocas();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('ft-data1').value='';
  document.getElementById('ft-data2').value='';
  document.getElementById('ft-motivo').value='';
  removerFotoTroca();
  msg.style.color='var(--entrada)';
  msg.textContent='Troca registrada — só é permitido dia por dia ou noite por noite, e assim foi lançada.';
  setTimeout(()=>{ msg.textContent=''; },5500);
  desenharTrocas();
}

async function excluirTroca(id){
  if(!await confirmarAcao('Excluir esse registro de troca?')) return;
  const t=AppEstado.dados.trocas.find(x=>x.id===id);
  if(!t) return;
  try{
    await api('/trocas/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  const f1=AppEstado.dados.funcionarios.find(x=>x.id===t.funcionario1Id), f2=AppEstado.dados.funcionarios.find(x=>x.id===t.funcionario2Id);
  registrarExclusao('Troca de plantão', `${f1?f1.nome:'—'} x ${f2?f2.nome:'—'} (${t.turno==='dia'?'Dia':'Noite'})`, t.unidade);
  await recarregarTrocas();
  desenharTrocas();
}

function desenharTrocas(){
  montarSelectsFuncionariosTroca();
  const un=unidadeAtual();
  const nomeFunc = id => { const f=AppEstado.dados.funcionarios.find(x=>x.id===id); return f?f.nome:'(removido)'; };

  const lista=AppEstado.dados.trocas.filter(t=>t.unidade===un)
    .slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);

  document.getElementById('tab-trocas').innerHTML = lista.length ? lista.map(t=>{
    const legenda=`Troca · ${nomeFunc(t.funcionario1Id)} x ${nomeFunc(t.funcionario2Id)}`;
    return `<tr>
      <td><span class="selo ${t.turno}">${t.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${esc(nomeFunc(t.funcionario1Id))}</td>
      <td>${dataBr(t.data1)}</td>
      <td>${esc(nomeFunc(t.funcionario2Id))}</td>
      <td>${dataBr(t.data2)}</td>
      <td>${esc(t.motivo)}</td>
      <td>${t.foto?`<img class="miniatura-tab" src="${esc(t.foto)}" alt="Documento" data-click="abrirLightbox('${escArg(t.foto)}','${escArg(legenda)}')">`:'<span class="tracinho">—</span>'}</td>
      <td>${esc(t.criadoPor)}</td>
      <td class="n"><button class="btn-mini" data-click="excluirTroca('${escArg(t.id)}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="vazio">Nenhuma troca registrada nesta unidade.</td></tr>';
}

/* =========== PRODUTOS VENCIDOS =========== */
function nomeMotivoVencido(m){
  return {vencido:'Vencido', avariado:'Avariado', perdido:'Perdido'}[m] || m;
}

function prevejaFotoVencido(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem.');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendenteVencido = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-vencido-img').src = AppEstado.ui.fotoPendenteVencido.dataUrl;
    document.getElementById('previa-foto-vencido-nome').textContent = arq.name;
    document.getElementById('previa-foto-vencido').classList.remove('oculto');
    document.getElementById('previa-foto-vencido-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoVencido(){
  AppEstado.ui.fotoPendenteVencido = null;
  document.getElementById('fv-foto-vencido').value='';
  document.getElementById('previa-foto-vencido').classList.add('oculto');
  document.getElementById('previa-foto-vencido-vazia').classList.remove('oculto');
}

async function salvarProdutoVencido(){
  const produto=document.getElementById('fv-produto').value.trim();
  const motivoTipo=document.getElementById('fv-motivo-tipo').value;
  const quantidade=parseInt(document.getElementById('fv-quantidade').value,10)||1;
  const validade=document.getElementById('fv-validade').value;
  const prejuizo=parseFloat(document.getElementById('fv-prejuizo').value)||0;
  const msg=document.getElementById('msg-vencido');

  if(!produto){
    msg.style.color='var(--saida)';
    msg.textContent='Informe o nome do produto.';
    return;
  }

  try{
    const fotoUrl = AppEstado.ui.fotoPendenteVencido ? await enviarFoto(AppEstado.ui.fotoPendenteVencido.dataUrl) : null;
    await api('/produtos-vencidos', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), produto, motivo_tipo: motivoTipo, quantidade,
      validade: validade||null, prejuizo,
      foto_url: fotoUrl
    }) });
    await recarregarProdutosVencidos();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fv-produto').value='';
  document.getElementById('fv-quantidade').value='1';
  document.getElementById('fv-validade').value='';
  document.getElementById('fv-prejuizo').value='';
  removerFotoVencido();
  msg.style.color='var(--entrada)';
  msg.textContent='Produto registrado.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharProdutosVencidos();
}

async function excluirProdutoVencido(id){
  if(!await confirmarAcao('Excluir esse registro?')) return;
  const p=AppEstado.dados.produtosVencidos.find(x=>x.id===id);
  if(!p) return;
  try{
    await api('/produtos-vencidos/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Produto vencido', `${p.produto} — ${nomeMotivoVencido(p.motivoTipo)} (qtd ${p.quantidade})`, p.unidade);
  await recarregarProdutosVencidos();
  desenharProdutosVencidos();
}

function desenharDashboardVencidos(){
  const painel=document.getElementById('grade-stats-vencidos');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  const secao=painel.closest('.painel');
  if(secao) secao.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=AppEstado.dados.produtosVencidos.filter(p=>p.unidade===un && p.registradoEm>=desde);
  const totalItens=lista.reduce((s,p)=>s+p.quantidade,0);
  const totalPrejuizo=lista.reduce((s,p)=>s+p.prejuizo,0);
  const porVencido=lista.filter(p=>p.motivoTipo==='vencido').length;

  document.getElementById('sub-dashboard-vencidos').textContent = `${nomeUnidade(un)} · últimos 30 dias`;
  painel.innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${lista.length}</div><div class="rotulo-stat">Registros no período</div></div>
    <div class="stat-vistoria"><div class="num-stat">${totalItens}</div><div class="rotulo-stat">Itens perdidos (quantidade)</div></div>
    <div class="stat-vistoria"><div class="num-stat vermelho">${fmt(totalPrejuizo)}</div><div class="rotulo-stat">Prejuízo estimado</div></div>
    <div class="stat-vistoria"><div class="num-stat">${porVencido}</div><div class="rotulo-stat">Por vencimento</div></div>
  `;

  const contagemProduto={};
  lista.forEach(p=>{
    contagemProduto[p.produto]=(contagemProduto[p.produto]||0)+p.quantidade;
  });
  const ranking=Object.entries(contagemProduto).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maior=ranking.length ? ranking[0][1] : 1;
  document.getElementById('ranking-produtos-vencidos').innerHTML = ranking.length
    ? barras(ranking.map(([nome,valor])=>({nome,valor})), maior, 's', false)
    : '<div class="vazio">Nenhum produto vencido no período.</div>';
}

function desenharProdutosVencidos(){
  desenharDashboardVencidos();
  const un=unidadeAtual();
  const lista=AppEstado.dados.produtosVencidos.filter(p=>p.unidade===un)
    .slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);

  document.getElementById('tab-vencidos').innerHTML = lista.length ? lista.map(p=>{
    const legenda=`${p.produto} · ${nomeMotivoVencido(p.motivoTipo)} · qtd ${p.quantidade}`;
    return `<tr>
      <td>${dataBr(p.registradoEm)}</td>
      <td>${esc(p.produto)}</td>
      <td><span class="selo-status ${p.motivoTipo}">${nomeMotivoVencido(p.motivoTipo)}</span></td>
      <td class="n num">${p.quantidade}</td>
      <td>${p.validade?dataBr(p.validade):'—'}</td>
      <td class="n num">${p.prejuizo?fmt(p.prejuizo):'—'}</td>
      <td>${p.foto?`<img class="miniatura-tab" src="${esc(p.foto)}" alt="Produto" data-click="abrirLightbox('${escArg(p.foto)}','${escArg(legenda)}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n"><button class="btn-mini" data-click="excluirProdutoVencido('${escArg(p.id)}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="vazio">Nenhum produto vencido registrado nesta unidade.</td></tr>';
}

/* =========== CONFIGURAÇÃO DE SUÍTES =========== */
function totalSuitesUnidade(un){
  return AppEstado.dados.suitesConfig.filter(s=>s.unidade===un).reduce((s,c)=>s+c.quantidade,0);
}

async function salvarCategoriaSuite(){
  const categoria=document.getElementById('rs-categoria').value.trim();
  const quantidade=parseInt(document.getElementById('rs-quantidade').value,10);
  const msg=document.getElementById('msg-config-suites');

  if(usuario.papel!=='admin'){
    msg.style.color='var(--saida)';
    msg.textContent='Só o diretor adiciona ou edita categorias de suíte.';
    return;
  }
  if(!categoria || !quantidade || quantidade<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Informe a categoria e uma quantidade maior que zero.';
    return;
  }

  try{
    await api('/revpar/suites', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), categoria, quantidade
    }) });
    await recarregarSuitesConfig();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }
  document.getElementById('rs-categoria').value='';
  document.getElementById('rs-quantidade').value='';
  msg.style.color='var(--entrada)';
  msg.textContent='Categoria adicionada.';
  setTimeout(()=>{ msg.textContent=''; },3500);
  desenharConfigSuites();
}

async function excluirCategoriaSuite(id){
  if(usuario.papel!=='admin'){ avisar('Só o diretor pode remover categorias de suíte.'); return; }
  if(!await confirmarAcao('Remover essa categoria de suíte?')) return;
  const s=AppEstado.dados.suitesConfig.find(x=>x.id===id);
  if(!s) return;
  try{
    await api('/revpar/suites/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Categoria de suíte', `${s.categoria} (${s.quantidade} suíte(s))`, s.unidade);
  await recarregarSuitesConfig();
  desenharConfigSuites();
}

function desenharConfigSuites(){
  const un=unidadeAtual();
  const podeEditar = usuario.papel==='admin';
  document.getElementById('bloco-editar-suites').classList.toggle('oculto', !podeEditar);
  document.getElementById('aviso-suites-somente-diretor').classList.toggle('oculto', podeEditar);

  const lista=AppEstado.dados.suitesConfig.filter(s=>s.unidade===un);
  document.getElementById('tab-config-suites').innerHTML = lista.length ? lista.map(s=>`
    <tr>
      <td>${s.categoria}</td>
      <td class="n num">${s.quantidade}</td>
      <td class="n">${podeEditar?`<button class="btn-mini" data-click="excluirCategoriaSuite('${escArg(s.id)}')">Excluir</button>`:'—'}</td>
    </tr>`).join('') : '<tr><td colspan="3" class="vazio">Nenhuma categoria cadastrada ainda.</td></tr>';

  const total=totalSuitesUnidade(un);
  document.getElementById('total-suites-unidade').textContent=total;
  montarLinhasCategoriaRevpar();
}

/* =========== REVPAR E TREVPAR (por categoria de suíte) =========== */
function montarLinhasCategoriaRevpar(){
  const un=unidadeAtual();
  const categorias=AppEstado.dados.suitesConfig.filter(s=>s.unidade===un);
  const cont=document.getElementById('linhas-categoria-revpar');
  if(!cont) return;
  cont.innerHTML = categorias.length ? categorias.map(c=>`
    <div class="form-linha" data-categoria-id="${c.id}">
      <div class="u-coluna-dupla">
        <label>${c.categoria} (${c.quantidade} suíte${c.quantidade>1?'s':''})</label>
      </div>
      <div>
        <input type="number" class="rp-cat-usos" data-id="${c.id}" min="0" step="1" placeholder="qt. de usos">
      </div>
      <div>
        <input type="number" class="rp-cat-faturado" data-id="${c.id}" min="0" step="0.01" placeholder="faturado R$">
      </div>
    </div>`).join('')
    : '<div class="vazio">Cadastre categorias de suíte no bloco acima primeiro.</div>';
}

async function salvarRevpar(){
  const inicio=document.getElementById('rp-inicio').value;
  const fim=document.getElementById('rp-fim').value;
  const receitaExtra=parseFloat(document.getElementById('rp-receita-extra').value)||0;
  const msg=document.getElementById('msg-revpar');
  const un=unidadeAtual();

  if(!inicio || !fim){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha o início e o fim do período.';
    return;
  }
  if(fim<inicio){
    msg.style.color='var(--saida)';
    msg.textContent='O fim do período não pode ser antes do início.';
    return;
  }
  const categorias=AppEstado.dados.suitesConfig.filter(s=>s.unidade===un);
  if(!categorias.length){
    msg.style.color='var(--saida)';
    msg.textContent='Cadastre ao menos uma categoria de suíte antes de preencher o período.';
    return;
  }

  const dias=diasEntre(inicio,fim)+1;
  const porCategoria=categorias.map(c=>{
    const usos=parseInt((document.querySelector(`.rp-cat-usos[data-id="${c.id}"]`)||{}).value,10)||0;
    const faturado=parseFloat((document.querySelector(`.rp-cat-faturado[data-id="${c.id}"]`)||{}).value)||0;
    return {
      categoria:c.categoria, quantidade:c.quantidade, usos, faturado,
      ocupacaoMedia: (c.quantidade>0 && dias>0) ? usos/(c.quantidade*dias) : 0,
      ticketMedio: usos>0 ? faturado/usos : 0,
      revpar: calcularRevpar(faturado, c.quantidade, dias)
    };
  });

  if(porCategoria.every(c=>c.usos===0 && c.faturado===0)){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha os usos e o faturado de pelo menos uma categoria.';
    return;
  }

  const quantidadeTotal=porCategoria.reduce((s,c)=>s+c.quantidade,0);
  const usosTotal=porCategoria.reduce((s,c)=>s+c.usos,0);
  const faturadoTotal=porCategoria.reduce((s,c)=>s+c.faturado,0);
  const revparGeral=calcularRevpar(faturadoTotal, quantidadeTotal, dias);
  const trevpar=calcularRevpar(faturadoTotal+receitaExtra, quantidadeTotal, dias);

  try{
    await api('/revpar', { method:'POST', body: JSON.stringify({
      unidade_id: un, inicio, fim, receita_extra: receitaExtra,
      porCategoria: porCategoria.map(c=>({categoria:c.categoria, quantidade:c.quantidade, usos:c.usos, faturado:c.faturado}))
    }) });
    await recarregarRevpar();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('rp-inicio').value='';
  document.getElementById('rp-fim').value='';
  document.getElementById('rp-receita-extra').value='';
  montarLinhasCategoriaRevpar();
  msg.style.color='var(--entrada)';
  msg.textContent=`Calculado: RevPAR geral ${fmt(revparGeral)} · TrevPAR ${fmt(trevpar)}.`;
  setTimeout(()=>{ msg.textContent=''; },6000);
  desenharRevpar();
}

async function excluirRevpar(id){
  if(!await confirmarAcao('Excluir esse registro?')) return;
  const r=AppEstado.dados.revparRegistros.find(x=>x.id===id);
  if(!r) return;
  try{
    await api('/revpar/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('RevPAR', `Período ${dataBr(r.inicio)} a ${dataBr(r.fim)}`, r.unidade);
  await recarregarRevpar();
  desenharRevpar();
}

function linhaAnaliseRevparHTML(c){
  return `<tr>
    <td>${c.categoria} (${c.quantidade})</td>
    <td class="n num">${c.usos}</td>
    <td class="n num">${c.ocupacaoMedia.toFixed(2)}</td>
    <td class="n num">${fmt(c.faturado)}</td>
    <td class="n num">${fmt(c.ticketMedio)}</td>
    <td class="n neutro-forte num">${fmt(c.revpar)}</td>
  </tr>`;
}

function desenharAnaliseRevpar(){
  const un=unidadeAtual();
  const registros=AppEstado.dados.revparRegistros.filter(r=>r.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  const ultimo=registros[0];
  const tab=document.getElementById('tab-analise-revpar');
  if(!tab) return;

  if(!ultimo){
    document.getElementById('sub-analise-revpar').textContent = nomeUnidade(un)+' · nenhum período registrado ainda.';
    tab.innerHTML='<tr><td colspan="6" class="vazio">Preencha um período acima pra ver a análise por categoria.</td></tr>';
    return;
  }

  document.getElementById('sub-analise-revpar').textContent =
    `${nomeUnidade(un)} · ${dataBr(ultimo.inicio)} a ${dataBr(ultimo.fim)} (${ultimo.dias} dia${ultimo.dias>1?'s':''})`;

  const linhaTotal=`<tr>
    <td class="neutro-forte">Total (${ultimo.quantidadeTotal})</td>
    <td class="n neutro-forte num">${ultimo.usosTotal}</td>
    <td class="n neutro-forte num">${ultimo.ocupacaoMediaGeral.toFixed(2)}</td>
    <td class="n neutro-forte num">${fmt(ultimo.faturadoTotal)}</td>
    <td class="n neutro-forte num">${fmt(ultimo.ticketMedioGeral)}</td>
    <td class="n neutro-forte num">${fmt(ultimo.revparGeral)}</td>
  </tr>`;
  tab.innerHTML = ultimo.porCategoria.map(linhaAnaliseRevparHTML).join('') + linhaTotal;
}

function desenharComparativoRevpar(){
  const painel=document.getElementById('painel-comparativo-revpar');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  const ids=unidadesDoUsuario();
  painel.classList.toggle('oculto', !podeVer || ids.length<2);
  if(!podeVer || ids.length<2) return;

  const maisRecentePorUnidade = ids.map(id=>{
    const registros=AppEstado.dados.revparRegistros.filter(r=>r.unidade===id).sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
    return registros[0] ? {...registros[0], unidadeId:id} : null;
  }).filter(Boolean);

  document.getElementById('sub-comparativo-revpar').textContent =
    maisRecentePorUnidade.length ? 'Último período registrado de cada unidade' : 'Nenhuma unidade com RevPAR registrado ainda';

  document.getElementById('tab-comparativo-revpar').innerHTML = maisRecentePorUnidade.length
    ? maisRecentePorUnidade.sort((a,b)=>b.revparGeral-a.revparGeral).map(r=>`
      <tr>
        <td>${nomeUnidade(r.unidadeId)}</td>
        <td class="n num">${r.quantidadeTotal}</td>
        <td class="n num">${fmt(r.faturadoTotal)}</td>
        <td class="n num">${fmt(r.faturadoTotal+(r.receitaExtra||0))}</td>
        <td class="n num">${fmt(r.ticketMedioGeral)}</td>
        <td class="n neutro-forte num">${fmt(r.revparGeral)}</td>
        <td class="n neutro-forte num">${fmt(r.trevpar)}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="vazio">Sem dados ainda.</td></tr>';

  const dadosRevpar=maisRecentePorUnidade.map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.revparGeral}));
  const dadosTrevpar=maisRecentePorUnidade.map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.trevpar}));
  const maiorRevpar=Math.max(...dadosRevpar.map(d=>d.valor),1);
  const maiorTrevpar=Math.max(...dadosTrevpar.map(d=>d.valor),1);
  document.getElementById('graf-revpar').innerHTML = dadosRevpar.length ? barras(dadosRevpar,maiorRevpar,'e') : '<div class="vazio">Sem dados.</div>';
  document.getElementById('graf-trevpar').innerHTML = dadosTrevpar.length ? barras(dadosTrevpar,maiorTrevpar,'e') : '<div class="vazio">Sem dados.</div>';

  const dadosUsos=maisRecentePorUnidade.map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.usosTotal}))
    .sort((a,b)=>b.valor-a.valor);
  const dadosTicket=maisRecentePorUnidade.map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.ticketMedioGeral}))
    .sort((a,b)=>b.valor-a.valor);
  const dadosFaturamento=maisRecentePorUnidade.map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.faturadoTotal}))
    .sort((a,b)=>b.valor-a.valor);
  const maiorUsos=Math.max(...dadosUsos.map(d=>d.valor),1);
  const maiorTicket=Math.max(...dadosTicket.map(d=>d.valor),1);
  const maiorFaturamento=Math.max(...dadosFaturamento.map(d=>d.valor),1);
  document.getElementById('graf-ranking-usos-revpar').innerHTML = dadosUsos.length ? barras(dadosUsos,maiorUsos,'e',false) : '<div class="vazio">Sem dados.</div>';
  document.getElementById('graf-ranking-ticket-revpar').innerHTML = dadosTicket.length ? barras(dadosTicket,maiorTicket,'e') : '<div class="vazio">Sem dados.</div>';
  document.getElementById('graf-ranking-faturamento-revpar').innerHTML = dadosFaturamento.length ? barras(dadosFaturamento,maiorFaturamento,'e') : '<div class="vazio">Sem dados.</div>';
}

function desenharRevpar(){
  desenharConfigSuites();
  montarLinhasCategoriaRevpar();
  desenharAnaliseRevpar();
  desenharComparativoRevpar();
  const un=unidadeAtual();
  document.getElementById('titulo-revpar').textContent='Períodos registrados — '+nomeUnidade(un);
  const lista=AppEstado.dados.revparRegistros.filter(r=>r.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-revpar').innerHTML = lista.length ? lista.map(r=>`
    <tr>
      <td>${dataBr(r.inicio)} a ${dataBr(r.fim)}</td>
      <td class="n num">${r.quantidadeTotal}</td>
      <td class="n num">${fmt(r.faturadoTotal)}</td>
      <td class="n neutro-forte num">${fmt(r.revparGeral)}</td>
      <td class="n neutro-forte num">${fmt(r.trevpar)}</td>
      <td class="n"><button class="btn-mini" data-click="excluirRevpar('${escArg(r.id)}')">Excluir</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum período registrado ainda.</td></tr>';
}
