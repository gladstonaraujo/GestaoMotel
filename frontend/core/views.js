/* Views, estilos e scripts são carregados somente ao entrar no domínio. */
const modulosCarregados=new Set();
const carregamentoDeModulos=new Map();
const VERSAO_RECURSOS='20261001-23';

function carregarRecursoScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;
    script.onload=resolve;
    script.onerror=()=>reject(new Error(`Não foi possível carregar ${src}.`));
    document.body.appendChild(script);
  });
}

async function carregarModuloDaTela(tela){
  const modulo=AppModulos.arquivoDaTela(tela);
  if(!modulo) throw new Error(`Módulo da tela ${tela} não encontrado.`);
  if(modulosCarregados.has(modulo)) return;
  if(carregamentoDeModulos.has(modulo)) return carregamentoDeModulos.get(modulo);

  const tarefa=(async()=>{
    const resposta=await fetch(`/modulos/${modulo}/view.html?v=${VERSAO_RECURSOS}`);
    if(!resposta.ok) throw new Error(`Não foi possível carregar o módulo ${modulo}.`);
    const template=document.createElement('template');
    definirHtmlConfiavel(template,await resposta.text());
    document.getElementById('conteudo-modulos').appendChild(template.content);

    const estilo=document.createElement('link');
    estilo.rel='stylesheet';
    estilo.href=`/modulos/${modulo}/${modulo}.css?v=${VERSAO_RECURSOS}`;
    document.head.appendChild(estilo);
    await carregarRecursoScript(`/modulos/${modulo}/${modulo}.js?v=${VERSAO_RECURSOS}`);

    const inicializadores={
      caixa:()=>{ mudarTipo('entrada'); ajustarParcelaAtual(); },
      operacao:()=>montarChecklistVistoria(),
      financeiro:()=>montarUnidadesNotaFiscal(),
      sistema:()=>limparFormUsuario()
    };
    inicializadores[modulo]?.();
    modulosCarregados.add(modulo);
  })().finally(()=>carregamentoDeModulos.delete(modulo));
  carregamentoDeModulos.set(modulo,tarefa);
  return tarefa;
}
