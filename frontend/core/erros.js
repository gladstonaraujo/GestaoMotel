/* =========== CAPTURA DE ERRO VISÍVEL NA TELA (ajuda a depurar sem depender do console) =========== */
function mostrarErroVisivel(msg){
  try{
    let caixa=document.getElementById('caixa-erro-visivel');
    if(!caixa){
      caixa=document.createElement('div');
      caixa.id='caixa-erro-visivel';
      document.body.appendChild(caixa);
    }
    const linha=document.createElement('div');
    linha.className='linha-erro-visivel';
    linha.textContent = msg;
    caixa.appendChild(linha);
  }catch(e){ /* nunca deixar o próprio capturador quebrar a página */ }
}

// pega o erro "de fora" (rede, recursos) — costuma vir sem detalhe em pré-visualizações isoladas
window.addEventListener('error', function(ev){
  mostrarErroVisivel('Erro (global): ' + (ev.message||'desconhecido') + ' — ' + (ev.filename?ev.filename.split('/').pop():'?') + ':' + (ev.lineno||'?') + ':' + (ev.colno||'?'));
});

// envolve toda função clicável num try/catch que PEGA o erro de verdade, por dentro,
// mesmo quando a pré-visualização esconde os detalhes do erro global
function protegido(fn, nome){
  return function(...args){
    try{
      const resultado = fn.apply(this, args);
      if(resultado && typeof resultado.catch==='function'){
        resultado.catch(e=>{
          mostrarErroVisivel('Erro em ' + nome + '(): ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,3).join('\n'));
        });
      }
      return resultado;
    }catch(e){
      mostrarErroVisivel('Erro em ' + nome + '(): ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,3).join('\n'));
    }
  };
}

/* Protege TODAS as funções do sistema, feito logo aqui no início — antes de qualquer
   dado de exemplo ser gerado — pra funcionar mesmo se algo mais abaixo no carregamento falhar. */
['prevejaFoto','removerFoto','prevejaFotoBoleto','removerFotoBoleto','prevejaFotoParcela','removerFotoParcela',
 'abrirLightbox','fecharLightbox','diaMenos','dataBr','nomeUnidade','nomeCategoria','unidadesDoUsuario','rotuloPapel',
 'entrar','sair','iniciarApp','atualizarCabecalho','abrir','unidadeAtual','dataAtual',
 'diasPeriodo','listaDatas','filtrar','desenhar','diasDoMes','graficoTendenciaSvg','desenharTendenciaProjecao','barras','desenharPainel','atualizarDicaCategoria','mudarTipo',
 'atualizarVisibilidadeModoDespesa','mudarModoDespesa','ajustarParcelaAtualLancar','recalcularValorParcelaLancar',
 'salvarLancamento','limparCamposLancamento','desenharLancar','desenharExtrato','desenharComprovantes','diasEntre',
 'calcularAlertas','irParaLancamento','desenharAlertas','montarChecklistVistoria','marcarItemVistoria',
 'prevejaFotoVistoria','removerFotoVistoria','renderizarFotosPendentesVistoria','salvarVistoria','desenharVistorias',
 'apagar','alternarCompraConjunta','montarUnidadesConjunta','dividirValorConjunta','salvarBoleto','marcarBoletoPago',
 'desenharBoletos','ajustarParcelaAtual','recalcularValorParcela','salvarParcela','desenharFechamento',
 'montarCheckboxesUnidades','mudarPapelForm','limparFormUsuario','editarUsuario','excluirUsuario','salvarUsuario',
 'desenharUsuarios','desenharRede','alternarGrupoChecklist','desenharDashboardVistoria',
 'prevejaFotoImposto','removerFotoImposto','nomeTipoConta','competenciaBr','salvarImposto',
 'marcarImpostoPago','desenharImpostos','intervaloRelatorio','mudarPeriodoRelatorio','secoesRelatorioSelecionadas',
 'calcularDadosRelatorio','desenharRelatorio','baixarRelatorioResumido','copiarRelatorio',
 'linhaChecklistHTML','atualizarVisibilidadeFotoVistoria','modoVistoriaAtual',
 'abasPadraoPorPapel','abasDoUsuario','podeVerDashboardsUsuario','montarCheckboxesAbas','usarAbasPadrao','desenharDashboardFuncionarioVistoria','copiarCodigoBoleto',
 'nomeCargo','salvarFuncionario','excluirFuncionario','montarSelectFaltaFuncionario','salvarFalta','excluirFalta','desenharFuncionarios','desenharDashboardFuncionarios',
 'prevejaFotoAtestado','removerFotoAtestado','renderizarFotosPendentesAtestado','atualizarRotuloAtestado',
 'montarSelectsFuncionariosTroca','prevejaFotoTroca','removerFotoTroca','registrarTroca','excluirTroca','desenharTrocas',
 'nomeMotivoVencido','prevejaFotoVencido','removerFotoVencido','salvarProdutoVencido','excluirProdutoVencido',
 'desenharDashboardVencidos','desenharProdutosVencidos',
 'totalSuitesUnidade','salvarCategoriaSuite','excluirCategoriaSuite','desenharConfigSuites',
 'calcularRevpar','montarLinhasCategoriaRevpar','salvarRevpar','excluirRevpar','linhaAnaliseRevparHTML',
 'nomeServicoManutencao','salvarManutencao','excluirManutencao','calcularAlertasManutencao','desenharDashboardManutencao','desenharManutencao',
 'ajustarQtdConsumo','adicionarItemConsumoPlantao','removerItemConsumoPendente','renderizarItensConsumoPendente','salvarConsumoPlantao',
 'excluirConsumoPlantao','desenharDashboardConsumoPlantao','desenharConsumoPlantao','baixarPdfConsumoPlantao',
 'montarUnidadesNotaFiscal','dividirValorNotaFiscal','prevejaFotoNotaFiscal','removerFotoNotaFiscal','salvarNotaFiscal','excluirNotaFiscal','desenharNotasFiscais',
 'setoresComprovantesPadraoPorPapel','setoresComprovantesDoUsuario','escopoComprovantesPadraoPorPapel','escopoComprovantesDoUsuario','cartaoComprovanteHTML','montarCheckboxesSetoresComprovantes',
 'permissoesFinanceirasDoUsuario','temPermissaoFinanceira','apagarFotoComprovante','editarValorLancamento','montarCheckboxesPermissoesFinanceiras',
 'registrarExclusao','desenharHistoricoExclusoes','excluirBoleto','excluirContaFixa','abrirModalEditarLancamento',
 'limparFormItemVistoria','editarItemVistoria','excluirItemVistoria','salvarItemVistoria','desenharGerenciarItensVistoria','calcularAlertasVistoria',
 'prevejaFotoBoletoAdmin','removerFotoBoletoAdmin','salvarBoletoAdmin','excluirBoletoAdmin','iniciarLancamentoBoletoAdmin',
 'dividirValorBoletoAdmin','cancelarLancamentoBoletoAdmin','confirmarLancamentoBoletoAdmin','desenharBoletosAdmin',
 'desenharAnaliseRevpar','desenharComparativoRevpar','desenharRevpar'
].forEach(nome=>{
  if(typeof window[nome]==='function'){
    window[nome]=protegido(window[nome], nome);
  }
});
