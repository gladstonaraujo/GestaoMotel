/* Delegação declarativa de eventos, sem eval/new Function. */
const ACOES_PERMITIDAS = new Set([
  'abrir','abrirLightbox','adicionarItemConsumoPlantao','ajustarParcelaAtual',
  'ajustarParcelaAtualLancar','ajustarQtdConsumo','alternarCompraConjunta',
  'alternarGrupoChecklist','apagar','atualizarDicaCategoria','atualizarRotuloAtestado',
  'baixarPdfConsumoPlantao','baixarRelatorioResumido','cancelarLancamentoBoletoAdmin',
  'confirmarLancamentoBoletoAdmin','copiarCodigoBoleto','copiarRelatorio','desenhar',
  'desenharRelatorio','dividirValorBoletoAdmin','dividirValorConjunta',
  'dividirValorNotaFiscal','editarItemVistoria','editarUsuario','editarValorLancamento',
  'entrar','excluirBoleto','excluirBoletoAdmin','excluirCategoriaSuite',
  'excluirConsumoPlantao','excluirContaFixa','excluirFalta','excluirFuncionario',
  'excluirItemVistoria','excluirManutencao','excluirNotaFiscal','excluirProdutoVencido',
  'excluirRevpar','excluirTroca','excluirUsuario','fecharLightbox',
  'iniciarLancamentoBoletoAdmin','irParaLancamento','limparFormItemVistoria',
  'limparFormUsuario','marcarBoletoPago','marcarImpostoPago','marcarItemVistoria',
  'mudarModoDespesa','mudarPapelForm','mudarPeriodoRelatorio','mudarTipo',
  'prevejaFoto','prevejaFotoAtestado','prevejaFotoBoleto','prevejaFotoBoletoAdmin',
  'prevejaFotoImposto','prevejaFotoNotaFiscal','prevejaFotoParcela','prevejaFotoTroca',
  'prevejaFotoVencido','prevejaFotoVistoria','recalcularValorParcela',
  'recalcularValorParcelaLancar','registrarTroca','removerFoto','removerFotoAtestado',
  'removerFotoBoleto','removerFotoBoletoAdmin','removerFotoImposto',
  'removerFotoNotaFiscal','removerFotoParcela','removerFotoTroca','removerFotoVencido',
  'removerFotoVistoria','removerItemConsumoPendente','sair','salvarBoleto',
  'salvarBoletoAdmin','salvarCategoriaSuite','salvarConsumoPlantao','salvarFalta',
  'salvarFuncionario','salvarImposto','salvarItemVistoria','salvarLancamento',
  'salvarManutencao','salvarNotaFiscal','salvarParcela','salvarProdutoVencido',
  'salvarRevpar','salvarUsuario','salvarVistoria','usarAbasPadrao'
]);

function separarArgumentos(texto){
  const partes=[];
  let atual='', aspas='', escape=false;
  for(const caractere of texto){
    if(escape){ atual+=caractere; escape=false; continue; }
    if(caractere==='\\'){ atual+=caractere; escape=true; continue; }
    if(aspas){ atual+=caractere; if(caractere===aspas) aspas=''; continue; }
    if(caractere==='\'' || caractere==='"'){ aspas=caractere; atual+=caractere; continue; }
    if(caractere===','){ partes.push(atual.trim()); atual=''; continue; }
    atual+=caractere;
  }
  if(atual.trim()) partes.push(atual.trim());
  return partes;
}

function interpretarArgumento(valor, elemento){
  if(valor==='this') return elemento;
  if(valor==='true') return true;
  if(valor==='false') return false;
  if(valor==='null') return null;
  if(/^-?\d+(?:\.\d+)?$/.test(valor)) return Number(valor);
  if((valor.startsWith('\'') && valor.endsWith('\'')) || (valor.startsWith('"') && valor.endsWith('"'))){
    const conteudo=valor.slice(1,-1);
    return conteudo.replace(/\\(['"\\nrt])/g,(_,c)=>({n:'\n',r:'\r',t:'\t'}[c]||c));
  }
  throw new Error('Argumento declarativo inválido.');
}

function executarAcaoDeclarativa(expressao, elemento, evento){
  let codigo=String(expressao||'').trim();
  const cliqueAlvo=/^document\.getElementById\('([^']+)'\)\.click\(\)$/.exec(codigo);
  if(cliqueAlvo){ document.getElementById(cliqueAlvo[1])?.click(); return; }

  const somenteProprio=/^if\(event\.target===this\)\s+(.+)$/.exec(codigo);
  if(somenteProprio){ if(evento.target!==elemento) return; codigo=somenteProprio[1]; }
  if(codigo.startsWith('event.stopPropagation();')){
    evento.stopPropagation();
    codigo=codigo.slice('event.stopPropagation();'.length).trim();
  }

  const chamada=/^([A-Za-z_$][\w$]*)\((.*)\)$/.exec(codigo);
  if(!chamada || !ACOES_PERMITIDAS.has(chamada[1])) throw new Error('Ação declarativa não permitida.');
  const funcao=window[chamada[1]];
  if(typeof funcao!=='function') throw new Error(`Ação ${chamada[1]} indisponível.`);
  const argumentos=chamada[2].trim() ? separarArgumentos(chamada[2]).map(v=>interpretarArgumento(v,elemento)) : [];
  return funcao(...argumentos);
}

if(typeof document!=='undefined'){
  for(const [evento,atributo] of Object.entries({click:'data-click',change:'data-change',input:'data-input',submit:'data-submit',keydown:'data-keydown'})){
    document.addEventListener(evento, ev=>{
      const alvo=ev.target.closest?.(`[${atributo}]`);
      if(!alvo) return;
      if(evento==='submit') ev.preventDefault();
      try{
        const resultado=executarAcaoDeclarativa(alvo.getAttribute(atributo),alvo,ev);
        if(resultado?.catch) resultado.catch(erro=>mostrarErroVisivel(erro.message));
      }catch(erro){ mostrarErroVisivel(erro.message); }
    });
  }
}

if(typeof module!=='undefined') module.exports={separarArgumentos,interpretarArgumento,executarAcaoDeclarativa};
