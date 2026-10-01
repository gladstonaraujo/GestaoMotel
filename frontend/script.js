/* =========== CLIENTE DA API (back-end) =========== */
// caminho relativo — funciona não importa por qual IP/porta o navegador acessou o sistema
// (localhost, IP da rede local, etc.), já que o próprio back-end serve esse arquivo também
const API_BASE = '/api';

// chama a API, manda o token salvo (se tiver) e já devolve o JSON — lança erro com a
// mensagem que o back-end mandou, pra quem chamou poder mostrar pro usuário
async function api(caminho, opcoes = {}) {
  const token = localStorage.getItem('token');
  const cabecalhos = { 'Content-Type': 'application/json', ...(opcoes.headers || {}) };
  if (token) cabecalhos['Authorization'] = 'Bearer ' + token;

  let resp;
  try {
    resp = await fetch(API_BASE + caminho, { ...opcoes, headers: cabecalhos });
  } catch (e) {
    throw new Error('Não consegui falar com o servidor. Confira sua conexão e tente de novo.');
  }

  if (resp.status === 401) {
    // sessão expirou ou token inválido — derruba pra tela de login
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    if (usuario) { usuario = null; sair(); }
    throw new Error('Sessão expirada, faça login de novo.');
  }

  const temCorpo = resp.status !== 204;
  const dados = temCorpo ? await resp.json().catch(() => null) : null;
  if (!resp.ok) {
    throw new Error((dados && dados.erro) || 'Ocorreu um erro ao falar com o servidor.');
  }
  return dados;
}

// o back-end manda os dados do usuário em snake_case (todas_unidades, pode_ver_dashboards...);
// o resto do sistema aqui espera o formato de sempre (camelCase, unidades:'todas' ou array) —
// essa função traduz uma vez só, no login, pra não precisar mexer no resto do código
function normalizarUsuarioApi(u) {
  return {
    id: u.id,
    login: u.login,
    nome: u.nome,
    papel: u.papel,
    unidades: u.todas_unidades ? 'todas' : u.unidades,
    abas: u.abas,
    podeVerDashboards: u.pode_ver_dashboards,
    escopoComprovantes: u.escopo_comprovantes,
    secoesComprovantes: u.secoes_comprovantes,
    permissoesFinanceiras: u.permissoes_financeiras,
  };
}

// converte uma linha da tabela "lancamentos" (snake_case) pro formato que o resto do
// sistema aqui já usa (camelCase) — assim as funções de tela não precisam mudar
// o back-end não tem colunas próprias pra descrição/total/parcela da compra parcelada —
// isso sempre viajou embutido no texto da observação (o mesmo texto que aparece pro usuário
// no Extrato), então reconstrói a partir dali. O molde é sempre gerado por código
// (só a descrição e a observação livre nas pontas são texto do usuário), então é seguro.
function parseCompraParcelada(obs){
  const m = /^(.*) — parcela (\d+)\/(\d+) de R\$\s?([\d.,]+)/.exec(obs || '');
  if(!m) return undefined;
  return {
    descricao: m[1],
    parcelaAtual: parseInt(m[2],10),
    totalParcelas: parseInt(m[3],10),
    valorTotalCompra: parseFloat(m[4].replace(/\./g,'').replace(',','.')),
  };
}

function lancamentoApiParaLocal(row){
  const local = {
    id: row.id,
    unidade: row.unidade_id,
    data: row.data,
    turno: row.turno,
    tipo: row.tipo,
    categoria: row.categoria_id,
    valor: parseFloat(row.valor),
    obs: row.observacao,
    por: row.lancado_por_nome || row.lancado_por,
    foto: row.foto_url,
    dataAlterada: row.data_alterada,
    registradoEm: row.registrado_em,
    formaPagamentoSaida: row.forma_pagamento_saida,
    rateio: row.rateio_valor_total!=null ? {valorTotal: parseFloat(row.rateio_valor_total)} : undefined,
    editadoPor: row.editado_por_nome || row.editado_por || undefined,
    editadoEm: row.editado_em || undefined,
  };
  if(local.categoria==='parcelado'){
    local.compraParcelada = parseCompraParcelada(local.obs);
  }
  return local;
}

// caminho inverso, pra mandar um lançamento novo pra API
function lancamentoLocalParaApi(l){
  return {
    unidade_id: l.unidade,
    data: l.data,
    turno: l.turno,
    tipo: l.tipo,
    categoria_id: l.categoria,
    valor: l.valor,
    observacao: l.obs || null,
    foto_url: l.foto || null,
    forma_pagamento_saida: l.formaPagamentoSaida || null,
    rateio_valor_total: l.rateio ? l.rateio.valorTotal : null,
  };
}

// busca de novo, na API, os lançamentos de todas as unidades que o usuário logado acessa
async function recarregarLancamentos(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/lancamentos?unidade_id='+encodeURIComponent(id))));
  LANCAMENTOS = listas.flat().map(lancamentoApiParaLocal);
}

function boletoApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    descricao: row.descricao,
    valor: parseFloat(row.valor),
    vencimento: row.vencimento,
    status: row.status,
    foto: row.foto_url,
    codigoBarras: row.codigo_barras,
    pixCopiaCola: row.pix_copia_cola,
    criadoPor: row.criado_por_nome || row.criado_por,
    dataPagamento: row.data_pagamento,
    compraConjuntaId: row.compra_conjunta_id || undefined,
    valorTotalConjunto: row.valor_total_conjunto!=null ? parseFloat(row.valor_total_conjunto) : undefined,
  };
}

async function recarregarBoletos(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/boletos?unidade_id='+encodeURIComponent(id))));
  const todos = listas.flat().map(boletoApiParaLocal);
  // reconstrói o agrupamento de compra conjunta (quais outras unidades entraram) a partir
  // do que veio de cada unidade acessível — a API não devolve isso pronto
  todos.forEach(b=>{
    if(b.compraConjuntaId){
      const doGrupo = todos.filter(x=>x.compraConjuntaId===b.compraConjuntaId);
      b.compraConjunta = { id:b.compraConjuntaId, valorTotalConjunto:b.valorTotalConjunto, unidades: doGrupo.map(x=>x.unidade) };
    }
  });
  BOLETOS = todos;
}

function boletoAdminApiParaLocal(row){
  return {
    id: row.id,
    descricao: row.descricao,
    valor: parseFloat(row.valor),
    vencimento: row.vencimento,
    foto: row.foto_url,
    codigoBarras: row.codigo_barras,
    pixCopiaCola: row.pix_copia_cola,
    status: row.status,
    unidadesLancadas: (row.unidadesLancadas||[]).map(u=>u.unidade_id),
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarBoletosAdmin(){
  if(!usuario || usuario.papel!=='admin') return;
  const lista = await api('/boletos-admin');
  BOLETOS_ADMIN = lista.map(boletoAdminApiParaLocal);
}

function contaFixaApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    tipo: row.tipo,
    competencia: row.competencia,
    descricao: row.descricao,
    valor: parseFloat(row.valor),
    vencimento: row.vencimento,
    status: row.status,
    foto: row.foto_url,
    criadoPor: row.criado_por,
    dataPagamento: row.data_pagamento,
  };
}

async function recarregarContasFixas(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/contas-fixas?unidade_id='+encodeURIComponent(id))));
  CONTAS_FIXAS = listas.flat().map(contaFixaApiParaLocal);
}

function notaFiscalApiParaLocal(row){
  return {
    id: row.id,
    descricao: row.descricao,
    valorTotal: parseFloat(row.valor_total),
    data: row.data,
    foto: row.foto_url,
    unidades: (row.unidades||[]).map(u=>({unidade:u.unidade_id, valor:parseFloat(u.valor)})),
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarNotasFiscais(){
  if(!usuario || usuario.papel!=='admin') return;
  const lista = await api('/notas-fiscais');
  NOTAS_FISCAIS = lista.map(notaFiscalApiParaLocal);
}

function funcionarioApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    nome: row.nome,
    cargo: row.cargo,
    telefone: row.telefone,
    documento: row.documento,
    dataAdmissao: row.data_admissao,
    criadoPor: row.criado_por,
  };
}

async function recarregarFuncionarios(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/funcionarios?unidade_id='+encodeURIComponent(id))));
  FUNCIONARIOS = listas.flat().map(funcionarioApiParaLocal);
}

function faltaApiParaLocal(row){
  return {
    id: row.id,
    funcionarioId: row.funcionario_id,
    unidade: row.unidade_id,
    data: row.data,
    motivo: row.motivo,
    justificada: row.justificada,
    fotos: row.fotos_url || [],
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarFaltas(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/faltas?unidade_id='+encodeURIComponent(id))));
  FALTAS = listas.flat().map(faltaApiParaLocal);
}

function trocaApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    turno: row.turno,
    funcionario1Id: row.funcionario1_id,
    data1: row.data1,
    funcionario2Id: row.funcionario2_id,
    data2: row.data2,
    motivo: row.motivo,
    foto: row.foto_url,
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarTrocas(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/trocas?unidade_id='+encodeURIComponent(id))));
  TROCAS = listas.flat().map(trocaApiParaLocal);
}

function vistoriaApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    suite: row.suite,
    data: row.data,
    turno: row.turno,
    tipoVistoria: row.tipo_vistoria,
    observacaoGeral: row.observacao_geral,
    feitoPor: row.feito_por_nome || row.feito_por,
    registradoEm: row.registrado_em,
    fotos: row.fotos || [],
    itens: (row.itens||[]).map(it=>{
      const def = ITENS_VISTORIA.find(x=>x.id===it.item_id);
      return { id: it.item_id, nome: def?def.nome:it.item_id, status: it.status, obs: it.observacao||'' };
    }),
  };
}

async function recarregarVistorias(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/vistorias?unidade_id='+encodeURIComponent(id))));
  VISTORIAS = listas.flat().map(vistoriaApiParaLocal);
}

function produtoVencidoApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    produto: row.produto,
    motivoTipo: row.motivo_tipo,
    quantidade: row.quantidade,
    validade: row.validade,
    prejuizo: parseFloat(row.prejuizo)||0,
    foto: row.foto_url,
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarProdutosVencidos(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/produtos-vencidos?unidade_id='+encodeURIComponent(id))));
  PRODUTOS_VENCIDOS = listas.flat().map(produtoVencidoApiParaLocal);
}

function suiteConfigApiParaLocal(row){
  return { id: row.id, unidade: row.unidade_id, categoria: row.categoria, quantidade: row.quantidade };
}

async function recarregarSuitesConfig(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/revpar/suites?unidade_id='+encodeURIComponent(id))));
  SUITES_CONFIG = listas.flat().map(suiteConfigApiParaLocal);
}

// a API só guarda os totais brutos; ocupação média, ticket médio e RevPAR por categoria
// são derivados aqui, com a mesma fórmula que o back-end usa pros totais gerais
function revparApiParaLocal(row){
  const dias = diasEntre(row.inicio, row.fim) + 1;
  const porCategoria = (row.porCategoria||[]).map(c=>{
    const faturado = parseFloat(c.faturado);
    return {
      categoria: c.categoria, quantidade: c.quantidade, usos: c.usos, faturado,
      ocupacaoMedia: (c.quantidade>0 && dias>0) ? c.usos/(c.quantidade*dias) : 0,
      ticketMedio: c.usos>0 ? faturado/c.usos : 0,
      revpar: calcularRevpar(faturado, c.quantidade, dias)
    };
  });
  const quantidadeTotal = row.quantidade_total;
  const usosTotal = row.usos_total;
  const faturadoTotal = parseFloat(row.faturado_total);
  return {
    id: row.id,
    unidade: row.unidade_id,
    inicio: row.inicio,
    fim: row.fim,
    dias,
    porCategoria, quantidadeTotal, usosTotal, faturadoTotal,
    ocupacaoMediaGeral: (quantidadeTotal>0 && dias>0) ? usosTotal/(quantidadeTotal*dias) : 0,
    ticketMedioGeral: usosTotal>0 ? faturadoTotal/usosTotal : 0,
    revparGeral: parseFloat(row.revpar_geral),
    receitaExtra: parseFloat(row.receita_extra),
    trevpar: parseFloat(row.trevpar),
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarRevpar(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/revpar?unidade_id='+encodeURIComponent(id))));
  REVPAR_REGISTROS = listas.flat().map(revparApiParaLocal);
}

function manutencaoApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    servico: row.servico,
    especificacao: row.especificacao,
    prestador: row.prestador,
    suite: row.suite,
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarManutencoes(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/manutencao?unidade_id='+encodeURIComponent(id))));
  MANUTENCOES = listas.flat().map(manutencaoApiParaLocal);
}

function consumoPlantaoApiParaLocal(row){
  return {
    id: row.id,
    unidade: row.unidade_id,
    turno: row.turno,
    data: row.data,
    itens: (row.itens||[]).map(it=>({produto: it.produto, quantidade: it.quantidade})),
    criadoPor: row.criado_por,
    registradoEm: row.registrado_em,
  };
}

async function recarregarConsumosPlantao(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/consumo-plantao?unidade_id='+encodeURIComponent(id))));
  CONSUMOS_PLANTAO = listas.flat().map(consumoPlantaoApiParaLocal);
}

function usuarioApiParaLocal(row){
  return {
    id: row.id,
    login: row.login,
    nome: row.nome,
    papel: row.papel,
    unidades: row.todas_unidades ? 'todas' : row.unidades,
    abas: row.abas,
    podeVerDashboards: row.pode_ver_dashboards,
    escopoComprovantes: row.escopo_comprovantes,
    secoesComprovantes: row.secoes_comprovantes,
    permissoesFinanceiras: row.permissoes_financeiras,
  };
}

async function recarregarUsuarios(){
  if(!usuario || usuario.papel!=='admin') return;
  const lista = await api('/usuarios');
  USUARIOS = lista.map(usuarioApiParaLocal);
}

function historicoExclusaoApiParaLocal(row){
  return {
    id: row.id,
    tipo: row.tipo,
    descricao: row.descricao,
    unidade: row.unidade_id,
    excluidoPor: row.excluido_por_nome,
    quando: row.criado_em.slice(0,10),
    horaCompleta: row.criado_em,
  };
}

async function recarregarHistoricoExclusoes(){
  if(!usuario || usuario.papel!=='admin') return;
  const lista = await api('/historico-exclusoes');
  HISTORICO_EXCLUSOES = lista.map(historicoExclusaoApiParaLocal);
}

// sobe uma foto (capturada como base64) pro servidor e devolve o link salvo em disco —
// é isso que vai no campo foto_url, em vez do base64 inteiro
async function enviarFoto(dataUrl){
  if(!dataUrl) return null;
  const resp = await api('/uploads', { method:'POST', body: JSON.stringify({ dataUrl }) });
  return resp.url;
}

/* =========== CAPTURA DE ERRO VISÍVEL NA TELA (ajuda a depurar sem depender do console) =========== */
function mostrarErroVisivel(msg){
  try{
    let caixa=document.getElementById('caixa-erro-visivel');
    if(!caixa){
      caixa=document.createElement('div');
      caixa.id='caixa-erro-visivel';
      caixa.style.cssText='position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;background:#B3261E;color:#fff;padding:12px 14px;border-radius:6px;font:12.5px monospace;box-shadow:0 8px 24px rgba(0,0,0,.4);max-height:40vh;overflow:auto;white-space:pre-wrap;';
      document.body.appendChild(caixa);
    }
    const linha=document.createElement('div');
    linha.style.marginBottom='8px';
    linha.style.borderBottom='1px solid rgba(255,255,255,.25)';
    linha.style.paddingBottom='6px';
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

/* =========== DADOS BASE =========== */
const UNIDADES = [
  {id:'beirol1',  nome:'Beirol 1'},
  {id:'beirol2',  nome:'Beirol 2'},
  {id:'jardim',   nome:'Jardim'},
  {id:'pacoval',  nome:'Pacoval'},
  {id:'nova',     nome:'Nova Esperança'},
  {id:'santana',  nome:'Santana'}
];

/* papel: funcionario | gerente | admin */
/* Abas que o diretor pode marcar/desmarcar por usuário — Usuários e acessos fica de fora,
   isso é sempre exclusivo do administrador geral, não é configurável. */
const TABS_DISPONIVEIS = [
  {id:'painel',       nome:'Painel'},
  {id:'lancar',       nome:'Lançar movimento'},
  {id:'consumo-plantao', nome:'Consumo do Plantão'},
  {id:'vistoria',     nome:'Vistoria de suítes'},
  {id:'extrato',      nome:'Extrato do dia'},
  {id:'comprovantes', nome:'Comprovantes'},
  {id:'boletos',      nome:'Boletos e Pix'},
  {id:'fechamento',   nome:'Fechamento'},
  {id:'impostos',     nome:'Impostos e Energia'},
  {id:'funcionarios', nome:'Funcionários'},
  {id:'vencidos',     nome:'Produtos Vencidos'},
  {id:'revpar',       nome:'RevPAR'},
  {id:'boletos-admin', nome:'Boletos Administrativo'},
  {id:'notas-fiscais', nome:'Notas Fiscais'},
  {id:'manutencao',   nome:'Manutenção de Terceiros'},
  {id:'relatorio',    nome:'Relatório'},
  {id:'rede',         nome:'Comparativo da rede'}
];

function abasPadraoPorPapel(papel){
  return {
    funcionario: ['lancar','consumo-plantao','vistoria'],
    inspetor:    ['vistoria'],
    gerente:     ['lancar','consumo-plantao','vistoria','extrato','comprovantes','boletos','fechamento','impostos','funcionarios','vencidos','revpar','manutencao','rede'],
    admin:       ['painel','lancar','consumo-plantao','vistoria','extrato','comprovantes','boletos','fechamento','impostos','funcionarios','vencidos','revpar','manutencao','boletos-admin','notas-fiscais','relatorio','rede']
  }[papel] || [];
}
// se o usuário não tiver 'abas' definido explicitamente, cai no padrão do nível dele
function abasDoUsuario(u){
  return u.abas || abasPadraoPorPapel(u.papel);
}

// permissão separada das abas: "pode ver dashboards" (produtos vencidos, faltas e trocas)
// admin sempre pode; os demais dependem do que o diretor marcar nesse usuário
function podeVerDashboardsUsuario(u){
  if(u.papel==='admin') return true;
  if(typeof u.podeVerDashboards==='boolean') return u.podeVerDashboards;
  return u.papel==='gerente'; // padrão: gerente sim, funcionário/inspetor não
}

const SETORES_COMPROVANTES = [
  {id:'lancamentos',   nome:'Lançamentos do dia a dia'},
  {id:'boletos',       nome:'Boletos e Pix'},
  {id:'boletos-admin', nome:'Boletos Administrativo'},
  {id:'impostos',      nome:'Impostos e Energia'}
];
function setoresComprovantesPadraoPorPapel(papel){
  return {
    funcionario: [],
    inspetor:    [],
    gerente:     ['lancamentos','boletos','impostos'],
    admin:       ['lancamentos','boletos','boletos-admin','impostos']
  }[papel] || [];
}
function setoresComprovantesDoUsuario(u){
  return u.secoesComprovantes || setoresComprovantesPadraoPorPapel(u.papel);
}

// além do setor, controla se a pessoa vê só o comprovante do dia atual ou de qualquer período
function escopoComprovantesPadraoPorPapel(papel){
  return {funcionario:'dia', inspetor:'dia', gerente:'dia', admin:'tudo'}[papel] || 'dia';
}
function escopoComprovantesDoUsuario(u){
  return u.escopoComprovantes || escopoComprovantesPadraoPorPapel(u.papel);
}

const PERMISSOES_FINANCEIRAS = [
  {id:'excluir_lancamentos', nome:'Excluir lançamentos (entrada/saída)'},
  {id:'editar_valores',      nome:'Editar valores de lançamentos já salvos'},
  {id:'apagar_comprovantes', nome:'Apagar fotos de comprovantes'},
  {id:'excluir_boletos',     nome:'Excluir boletos e contas fixas (Impostos/Energia)'}
];
// por padrão, ninguém além do diretor mexe em dado financeiro já salvo —
// só quem o diretor autorizar explicitamente ganha essas permissões
function permissoesFinanceirasDoUsuario(u){
  if(u.papel==='admin') return PERMISSOES_FINANCEIRAS.map(p=>p.id);
  return u.permissoesFinanceiras || [];
}
function temPermissaoFinanceira(u, id){
  return permissoesFinanceirasDoUsuario(u).includes(id);
}

let USUARIOS = [];

const ENTRADAS = [
  {id:'dinheiro', nome:'Dinheiro'},
  {id:'debito',   nome:'Cartão de débito'},
  {id:'credito',  nome:'Cartão de crédito'},
  {id:'pix',      nome:'Pix'}
];

const SAIDAS = [
  {id:'quebra',     nome:'Falta de caixa / quebra'},
  {id:'produtos',   nome:'Produtos para revenda'},
  {id:'manutencao', nome:'Manutenção, enxoval e limpeza'},
  {id:'servicos',   nome:'Serviços e terceiros'},
  {id:'pessoal',    nome:'Pessoal (folha, diárias, bônus)'},
  {id:'fixas',      nome:'Contas fixas (energia, internet, sistema)'},
  {id:'impostos',   nome:'Impostos e taxas de cartão'},
  {id:'boletos',    nome:'Boletos e notas (Pix)'},
  {id:'parcelado',  nome:'Compras parceladas'},
  {id:'retirada',   nome:'Retirada em espécie (sangria/diretor)'},
  {id:'notas_fiscais', nome:'Notas fiscais (rateio administrativo)'},
  {id:'outras',     nome:'Outras despesas'}
];

let ITENS_VISTORIA = [
  // ---- Quarto ----
  {id:'roupa_cama',    categoria:'quarto', nome:'Roupa de cama sem furos ou manchas'},
  {id:'travesseiros',  categoria:'quarto', nome:'Travesseiros com capa'},
  {id:'cama_feita',    categoria:'quarto', nome:'Cama feita corretamente'},
  {id:'base_cama',     categoria:'quarto', nome:'Base da cama sem marcas'},
  {id:'colchao',       categoria:'quarto', nome:'Colchão em boa condição'},
  {id:'mdf_cama',      categoria:'quarto', nome:'MDF da cama sem arranhões ou manchas'},
  {id:'paredes_limpas',categoria:'quarto', nome:'Paredes limpas e livres de teias de aranha'},
  {id:'paredes_dano',  categoria:'quarto', nome:'Paredes livres de arranhões e cortes'},
  {id:'pintura',       categoria:'quarto', nome:'Pintura das paredes em boas condições'},
  {id:'janelas',       categoria:'quarto', nome:'Vidros das janelas limpos e sem danos'},
  {id:'portas',        categoria:'quarto', nome:'Portas abrindo e fechando corretamente'},
  {id:'moveis',        categoria:'quarto', nome:'Sofá/mesa/cadeira em boas condições'},
  {id:'balcao_mdf',    categoria:'quarto', nome:'Balcão de MDF em boa condição'},
  {id:'espelhos',      categoria:'quarto', nome:'Espelhos em bom estado e limpos'},
  {id:'interruptores', categoria:'quarto', nome:'Interruptores de luz funcionando'},
  {id:'telefone',      categoria:'quarto', nome:'Telefone em boas condições de funcionamento'},
  {id:'controles',     categoria:'quarto', nome:'Controles do ar-condicionado/som/TV funcionando'},
  {id:'iluminacao',    categoria:'quarto', nome:'Iluminação do quarto correta, sem lâmpada queimada'},
  {id:'cheiro',        categoria:'quarto', nome:'Suíte com cheiro bom ou agradável'},
  {id:'cardapio',      categoria:'quarto', nome:'Cardápio limpo'},
  // ---- Banheiro ----
  {id:'assento',       categoria:'banheiro', nome:'Assento sanitário limpo (ambos os lados)'},
  {id:'odor_banheiro', categoria:'banheiro', nome:'Banheiro sem odores'},
  {id:'chao_banheiro', categoria:'banheiro', nome:'Chão do banheiro limpo'},
  {id:'rejunte',       categoria:'banheiro', nome:'Chuveiro/banheira com rejunte em bom estado'},
  {id:'vidro_banheiro',categoria:'banheiro', nome:'Vidro do banheiro limpo'},
  {id:'banheira',      categoria:'banheiro', nome:'Banheira limpa'},
  {id:'fios_chuveiro', categoria:'banheiro', nome:'Chuveiro sem fios expostos'},
  {id:'borda_banheira',categoria:'banheiro', nome:'Borda da banheira limpa'},
  {id:'parede_banheiro',categoria:'banheiro', nome:'Parede do banheiro sem manchas'},
  {id:'espelho_banheiro',categoria:'banheiro', nome:'Espelho do banheiro limpo e sem manchas'},
  {id:'vaso',          categoria:'banheiro', nome:'Vaso sanitário limpo'},
  {id:'luz_banheiro',  categoria:'banheiro', nome:'Iluminação do banheiro funcionando'},
  // ---- Garagem ----
  {id:'garagem_limpa', categoria:'garagem', nome:'Garagem limpa'},
  {id:'forro_garagem', categoria:'garagem', nome:'Forro da garagem em bom estado'},
  {id:'luz_garagem',   categoria:'garagem', nome:'Iluminação da garagem funcionando'},
  {id:'entrada_cliente',categoria:'garagem', nome:'Entrada do cliente limpa'},
  // ---- Consumo ----
  {id:'frigobar',        categoria:'consumo', nome:'Frigobar/minibar completo e reposto'},
  {id:'toalhas_consumo', categoria:'consumo', nome:'Toalhas repostas'},
  {id:'higiene',         categoria:'consumo', nome:'Sabonete e produtos de higiene repostos'},
  {id:'conveniencia',    categoria:'consumo', nome:'Preservativos e itens de conveniência repostos'},
  {id:'consumo_conferido',categoria:'consumo', nome:'Consumo do frigobar conferido'}
];
const CATEGORIAS_VISTORIA = [
  {id:'garagem', nome:'Garagem'},
  {id:'banheiro', nome:'Banheiro'},
  {id:'quarto', nome:'Suíte'},
  {id:'consumo', nome:'Consumo'}
];
const ITENS_VISTORIA_RAPIDA = [
  'garagem_limpa','entrada_cliente','chao_banheiro','vaso','odor_banheiro',
  'cama_feita','iluminacao','frigobar','consumo_conferido'
];

let LANCAMENTOS = [];
let BOLETOS = []; // {unidade, descricao, valor, vencimento, status, foto, criadoPor, dataPagamento}
let CONTAS_FIXAS = []; // {unidade, tipo, competencia, descricao, valor, vencimento, status, foto, criadoPor, dataPagamento}
let FUNCIONARIOS = []; // {id, unidade, nome, cargo, telefone, documento, dataAdmissao, criadoPor}
let FALTAS = []; // {funcionarioId, unidade, data, motivo, justificada, foto, criadoPor, registradoEm}
let TROCAS = []; // {id, unidade, turno, funcionario1Id, data1, funcionario2Id, data2, motivo, foto, criadoPor, registradoEm}
let PRODUTOS_VENCIDOS = []; // {id, unidade, produto, motivoTipo, quantidade, validade, prejuizo, foto, criadoPor, registradoEm}
let SUITES_CONFIG = []; // {id, unidade, categoria, quantidade}
let REVPAR_REGISTROS = []; // {id, unidade, inicio, fim, quartos, receitaDiarias, receitaTotal, revpar, trevpar, criadoPor, registradoEm}
let MANUTENCOES = []; // {id, unidade, servico, especificacao, prestador, suite, criadoPor, registradoEm}
let BOLETOS_ADMIN = []; // {id, descricao, valor, vencimento, foto, codigoBarras, pixCopiaCola, status, unidadesLancadas, criadoPor, registradoEm}
let CONSUMOS_PLANTAO = []; // {id, unidade, turno, data, itens:[{produto,quantidade}], criadoPor, registradoEm}
let itensConsumoPendente = [];
let HISTORICO_EXCLUSOES = []; // {id, tipo, descricao, unidade, excluidoPor, quando, horaCompleta}
function registrarExclusao(tipo, descricao, unidade){
  HISTORICO_EXCLUSOES.push({
    id:'exc'+Date.now()+Math.random().toString(36).slice(2),
    tipo, descricao, unidade: unidade||null,
    excluidoPor: usuario.nome, quando: hoje(), horaCompleta: new Date().toISOString()
  });
}
let NOTAS_FISCAIS = []; // {id, descricao, valorTotal, data, foto, unidades:[{unidade,valor}], criadoPor, registradoEm}
let fotoPendenteNotaFiscal = null;
let fotoPendenteBoletoAdmin = null;
let boletoAdminEmLancamento = null;
let fotoPendenteVencido = null;
let fotosPendentesAtestado = [];
let fotoPendenteImposto = null;
let VISTORIAS = []; // {unidade, suite, data, turno, itens, fotos, observacaoGeral, feitoPor, registradoEm}
let fotosPendentesVistoria = [];
let usuario = null;
let tipoAtual = 'entrada';
let fotoPendente = null; // {dataUrl, nome} — formulário de lançar movimento
let fotoPendenteBoleto = null;
let fotoPendenteParcela = null;

/* =========== FOTO DO COMPROVANTE =========== */
function prevejaFoto(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto da nota ou do comprovante).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendente = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-img').src = fotoPendente.dataUrl;
    document.getElementById('previa-foto-nome').textContent = arq.name;
    document.getElementById('previa-foto').classList.remove('oculto');
    document.getElementById('previa-foto-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFoto(){
  fotoPendente = null;
  document.getElementById('f-foto').value='';
  document.getElementById('previa-foto').classList.add('oculto');
  document.getElementById('previa-foto-vazia').classList.remove('oculto');
}

function prevejaFotoBoleto(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto do boleto ou da nota).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendenteBoleto = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-boleto-img').src = fotoPendenteBoleto.dataUrl;
    document.getElementById('previa-foto-boleto-nome').textContent = arq.name;
    document.getElementById('previa-foto-boleto').classList.remove('oculto');
    document.getElementById('previa-foto-boleto-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoBoleto(){
  fotoPendenteBoleto = null;
  document.getElementById('fb-foto').value='';
  document.getElementById('previa-foto-boleto').classList.add('oculto');
  document.getElementById('previa-foto-boleto-vazia').classList.remove('oculto');
}

function prevejaFotoParcela(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto da nota).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendenteParcela = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-parcela-img').src = fotoPendenteParcela.dataUrl;
    document.getElementById('previa-foto-parcela-nome').textContent = arq.name;
    document.getElementById('previa-foto-parcela').classList.remove('oculto');
    document.getElementById('previa-foto-parcela-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoParcela(){
  fotoPendenteParcela = null;
  document.getElementById('fp-foto').value='';
  document.getElementById('previa-foto-parcela').classList.add('oculto');
  document.getElementById('previa-foto-parcela-vazia').classList.remove('oculto');
}
function abrirLightbox(dataUrl,legenda){
  document.getElementById('lightbox-img').src = dataUrl;
  document.getElementById('lightbox-legenda').textContent = legenda || '';
  document.getElementById('lightbox').classList.add('aberto');
}
function fecharLightbox(){
  document.getElementById('lightbox').classList.remove('aberto');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') fecharLightbox(); });

/* =========== UTILIDADES =========== */
const fmt = v => 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const hoje = () => new Date().toISOString().slice(0,10);
function diaMenos(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function dataBr(iso){ const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; }
function nomeUnidade(id){ return (UNIDADES.find(u=>u.id===id)||{}).nome || id; }
function nomeCategoria(id){
  const t=[...ENTRADAS,...SAIDAS].find(c=>c.id===id); return t?t.nome:id;
}
function unidadesDoUsuario(){
  return usuario.unidades==='todas' ? UNIDADES.map(u=>u.id) : usuario.unidades;
}
function rotuloPapel(p){
  return {admin:'Administrador geral',gerente:'Gerente de unidade',funcionario:'Funcionário',inspetor:'Vistoria de suítes'}[p];
}

/* =========== MODAIS PRÓPRIOS (confirm/alert/prompt nativos não funcionam neste sandbox) =========== */
function confirmarAcao(mensagem){
  return new Promise(resolve=>{
    document.getElementById('modal-confirmacao-texto').textContent=mensagem;
    document.getElementById('modal-confirmacao').classList.remove('oculto');
    const limpar=()=>document.getElementById('modal-confirmacao').classList.add('oculto');
    document.getElementById('modal-confirmacao-ok').onclick=()=>{ limpar(); resolve(true); };
    document.getElementById('modal-confirmacao-cancelar').onclick=()=>{ limpar(); resolve(false); };
  });
}

function avisar(mensagem){
  document.getElementById('modal-aviso-texto').textContent=mensagem;
  document.getElementById('modal-aviso').classList.remove('oculto');
  document.getElementById('modal-aviso-ok').onclick=()=>document.getElementById('modal-aviso').classList.add('oculto');
}

function pedirValor(mensagem, valorPadrao){
  return new Promise(resolve=>{
    document.getElementById('modal-prompt-texto').textContent=mensagem;
    const input=document.getElementById('modal-prompt-input');
    input.value=valorPadrao||'';
    document.getElementById('modal-prompt').classList.remove('oculto');
    setTimeout(()=>{ input.focus(); input.select(); },50);
    const limpar=()=>document.getElementById('modal-prompt').classList.add('oculto');
    document.getElementById('modal-prompt-ok').onclick=()=>{ limpar(); resolve(input.value); };
    document.getElementById('modal-prompt-cancelar').onclick=()=>{ limpar(); resolve(null); };
  });
}

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
  mudarTipo('entrada');
  limparFormUsuario();
  ajustarParcelaAtual();
  montarChecklistVistoria();
  Promise.all([recarregarLancamentos(), recarregarBoletos(), recarregarBoletosAdmin(), recarregarContasFixas(), recarregarNotasFiscais(), recarregarFuncionarios(), recarregarFaltas(), recarregarTrocas(), recarregarVistorias(), recarregarProdutosVencidos(), recarregarSuitesConfig(), recarregarRevpar(), recarregarManutencoes(), recarregarConsumosPlantao(), recarregarUsuarios(), recarregarHistoricoExclusoes()]).then(desenhar);
  if(document.getElementById('fnf-unidades-valores')) montarUnidadesNotaFiscal();
  if(document.getElementById('rel-de')){
    document.getElementById('rel-de').value = hoje().slice(0,8)+'01';
    document.getElementById('rel-ate').value = hoje();
  }
  const ordemPreferida = ['painel','lancar','consumo-plantao','vistoria','extrato','comprovantes','boletos','fechamento','impostos','funcionarios','vencidos','revpar','manutencao','boletos-admin','notas-fiscais','relatorio','rede'];
  const primeiraAba = ordemPreferida.find(t=>abasDoUsuario(usuario).includes(t)) || 'vistoria';
  abrir(primeiraAba);
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

  // data: só gerente e diretor podem escolher outra data; funcionário e inspetor ficam presos ao dia de hoje
  const podeEditarData = usuario.papel==='admin' || usuario.papel==='gerente';
  const campoData=document.getElementById('sel-data');
  campoData.disabled = !podeEditarData;
  campoData.classList.toggle('sel-data-travada', !podeEditarData);
  if(!podeEditarData) campoData.value=hoje();
  document.getElementById('aviso-data-travada').classList.toggle('oculto', podeEditarData);
  atualizarVisibilidadeModoDespesa();
}

/* =========== NAVEGAÇÃO =========== */
function abrir(tela){
  ['painel','lancar','consumo-plantao','vistoria','extrato','comprovantes','boletos','fechamento','impostos','funcionarios','vencidos','revpar','manutencao','boletos-admin','notas-fiscais','relatorio','rede','usuarios','historico-exclusoes'].forEach(t=>{
    document.getElementById('tela-'+t).classList.toggle('oculto', t!==tela);
    document.getElementById('aba-'+t).classList.toggle('ativa', t===tela);
  });
  desenhar();
}

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
  return LANCAMENTOS.filter(l =>
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
  desenharPainel();
  desenharLancar();
  desenharVistorias();
  desenharExtrato();
  desenharComprovantes();
  desenharBoletos();
  desenharFechamento();
  desenharImpostos();
  desenharFuncionarios();
  desenharProdutosVencidos();
  desenharRevpar();
  desenharManutencao();
  desenharConsumoPlantao();
  desenharTrocas();
  desenharRede();
  if(usuario.papel==='admin'){
    desenharUsuarios();
    desenharAlertas();
    desenharRelatorio();
    desenharBoletosAdmin();
    desenharNotasFiscais();
    desenharHistoricoExclusoes();
  }
}

// desenha um gráfico de linha simples em SVG: pontos reais (linha cheia) + projeção (linha tracejada)
function diasDoMes(mes){
  const [ano,m]=mes.split('-').map(Number);
  return new Date(ano, m, 0).getDate();
}

function graficoTendenciaSvg(pontosReais, valorProjetado, diaFinal){
  const largura=760, altura=200, margemE=54, margemD=16, margemV=20;
  const areaW=largura-margemE-margemD, areaH=altura-margemV*2;
  const todosValores=[...pontosReais.map(p=>p.valor), valorProjetado, 0];
  const minV=Math.min(...todosValores), maxV=Math.max(...todosValores);
  const escalaY = v => margemV + areaH - ((v-minV)/((maxV-minV)||1))*areaH;
  const escalaX = dia => margemE + ((dia-1)/((diaFinal-1)||1))*areaW;

  const pontosLinha = pontosReais.map(p=>`${escalaX(p.dia)},${escalaY(p.valor)}`).join(' ');
  const ultimoPonto = pontosReais[pontosReais.length-1];
  const linhaProjecao = ultimoPonto
    ? `${escalaX(ultimoPonto.dia)},${escalaY(ultimoPonto.valor)} ${escalaX(diaFinal)},${escalaY(valorProjetado)}`
    : '';
  const yZero=escalaY(0);

  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%;height:auto;font-family:inherit">
    <line x1="${margemE}" y1="${yZero}" x2="${largura-margemD}" y2="${yZero}" stroke="var(--line)" stroke-width="1"/>
    <text x="4" y="${escalaY(maxV)+4}" font-size="10" fill="var(--slate)">${fmt(maxV)}</text>
    <text x="4" y="${yZero+4}" font-size="10" fill="var(--slate)">R$ 0</text>
    <text x="4" y="${escalaY(minV)+4}" font-size="10" fill="var(--slate)">${fmt(minV)}</text>
    ${linhaProjecao ? `<polyline points="${linhaProjecao}" fill="none" stroke="var(--noite)" stroke-width="2" stroke-dasharray="5,5"/>` : ''}
    <polyline points="${pontosLinha}" fill="none" stroke="var(--acento)" stroke-width="2.5"/>
    ${pontosReais.map(p=>`<circle cx="${escalaX(p.dia)}" cy="${escalaY(p.valor)}" r="2.5" fill="var(--acento)"/>`).join('')}
    ${ultimoPonto ? `<circle cx="${escalaX(diaFinal)}" cy="${escalaY(valorProjetado)}" r="3.5" fill="var(--noite)"/>` : ''}
    <text x="${margemE}" y="${altura-4}" font-size="10" fill="var(--slate)">dia 1</text>
    <text x="${largura-margemD-40}" y="${altura-4}" font-size="10" fill="var(--slate)">dia ${diaFinal} (projeção)</text>
  </svg>`;
}

function desenharTendenciaProjecao(){
  const cont=document.getElementById('grafico-tendencia');
  if(!cont) return;
  const un=unidadeAtual();
  const mesAtual=hoje().slice(0,7);
  const diaHoje=parseInt(hoje().slice(8,10),10);
  const diasNoMes=diasDoMes(mesAtual);

  let acumulado=0;
  const pontosReais=[];
  for(let d=1; d<=diaHoje; d++){
    const dataStr=`${mesAtual}-${String(d).padStart(2,'0')}`;
    const doDia=LANCAMENTOS.filter(l=>l.unidade===un && l.data===dataStr);
    acumulado += somar(doDia.filter(l=>l.tipo==='entrada')) - somar(doDia.filter(l=>l.tipo==='saida'));
    pontosReais.push({dia:d, valor:acumulado});
  }

  const mediaDiaria = diaHoje>0 ? acumulado/diaHoje : 0;
  const projecaoFimMes = mediaDiaria*diasNoMes;

  if(pontosReais.length<2){
    cont.innerHTML='<div class="vazio">Ainda não há lançamentos suficientes este mês pra desenhar a tendência.</div>';
  }else{
    cont.innerHTML=graficoTendenciaSvg(pontosReais, projecaoFimMes, diasNoMes);
  }

  document.getElementById('grade-projecao').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${fmt(acumulado)}</div><div class="rotulo-stat">Saldo acumulado até hoje (dia ${diaHoje})</div></div>
    <div class="stat-vistoria"><div class="num-stat">${fmt(mediaDiaria)}</div><div class="rotulo-stat">Média diária no mês</div></div>
    <div class="stat-vistoria"><div class="num-stat ${projecaoFimMes>=0?'verde':'vermelho'}">${fmt(projecaoFimMes)}</div><div class="rotulo-stat">Projeção pro fim do mês (dia ${diasNoMes})</div></div>
  `;
}

function barras(itens,total,classe,mostrarValor=true){
  if(!itens.length || total<=0) return '<div class="vazio">Nada lançado neste período.</div>';
  return itens.map(i=>`
    <div class="linha-barra">
      <div class="topo-linha"><span>${i.nome}</span>${mostrarValor?`<span class="num">${fmt(i.valor)}</span>`:''}</div>
      <div class="trilho"><div class="preenche ${classe}" style="width:${Math.max(2,(i.valor/total)*100)}%"></div></div>
    </div>`).join('');
}

function desenharPainel(){
  desenharTendenciaProjecao();
  const un=unidadeAtual(), datas=listaDatas();
  const movs=filtrar({unidade:un,datas});
  const ent=movs.filter(l=>l.tipo==='entrada'), sai=movs.filter(l=>l.tipo==='saida');
  const totE=somar(ent), totS=somar(sai), saldo=totE-totS;

  document.getElementById('titulo-painel').textContent=nomeUnidade(un);
  const per=diasPeriodo();
  document.getElementById('sub-painel').textContent =
    per===1 ? 'Movimento de '+dataBr(dataAtual())
            : `De ${dataBr(datas[0])} a ${dataBr(datas[datas.length-1])} · ${per} dias`;

  const g=document.getElementById('saldo-grande');
  g.textContent=fmt(saldo);
  g.className='valorao num '+(saldo>=0?'positivo':'negativo');

  document.getElementById('tot-entradas').textContent=fmt(totE);
  document.getElementById('tot-saidas').textContent=fmt(totS);
  document.getElementById('tot-dinheiro').textContent=
    fmt(somar(ent.filter(l=>l.categoria==='dinheiro')) - somarSaidasEmDinheiro(sai));
  document.getElementById('tot-cartoes').textContent=
    fmt(somar(ent.filter(l=>l.categoria==='debito'||l.categoria==='credito')));

  const porEnt=ENTRADAS.map(c=>({nome:c.nome,valor:somar(ent.filter(l=>l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  document.getElementById('graf-entradas').innerHTML=barras(porEnt,totE,'e');

  const porSai=SAIDAS.map(c=>({nome:c.nome,valor:somar(sai.filter(l=>l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  document.getElementById('graf-saidas').innerHTML=barras(porSai,totS,'s');

  const linhas=datas.slice().reverse().map(d=>{
    const doDia=movs.filter(l=>l.data===d);
    const e=somar(doDia.filter(l=>l.tipo==='entrada')), s=somar(doDia.filter(l=>l.tipo==='saida'));
    const qtdAlteradas=doDia.filter(l=>l.dataAlterada).length;
    const avisoDia = qtdAlteradas
      ? `<span class="aviso-editado" title="${qtdAlteradas} lançamento(s) neste dia foram registrados em outra data pelo gerente ou diretor">data alterada</span>`
      : '';
    return `<tr>
      <td>${dataBr(d)}${avisoDia}</td>
      <td class="n verde num">${fmt(e)}</td>
      <td class="n vermelho num">${fmt(s)}</td>
      <td class="n neutro-forte num">${fmt(e-s)}</td>
    </tr>`;
  }).join('');
  document.getElementById('tab-dias').innerHTML =
    linhas || '<tr><td colspan="4" class="vazio">Nada lançado neste período.</td></tr>';
}

function atualizarDicaCategoria(){
  const cat=document.getElementById('f-categoria').value;
  const ehQuebra = tipoAtual==='saida' && cat==='quebra';
  const ehRetirada = tipoAtual==='saida' && cat==='retirada';
  const ehEspecial = ehQuebra || ehRetirada;

  document.getElementById('lbl-obs').textContent = ehEspecial
    ? (ehQuebra ? 'Descrição (obrigatório para falta de caixa)' : 'Descrição (obrigatório — quem autorizou/recebeu)')
    : 'Descrição (opcional)';
  document.getElementById('f-obs').placeholder = ehQuebra
    ? 'ex.: contei o caixa no fim do turno e faltaram R$ 30, troco errado com hóspede do quarto 4'
    : ehRetirada
      ? 'ex.: retirada autorizada pelo diretor Fulano, referente a...'
      : 'ex.: diária suíte 12, compra de sabonete, adiantamento';
  const dica=document.getElementById('dica-obs');
  dica.classList.toggle('oculto', !ehEspecial);
  dica.textContent = ehQuebra
    ? 'Explique o que houve — isso ajuda o gerente e o diretor a entenderem a falta.'
    : ehRetirada ? 'Deixe registrado quem autorizou e recebeu a retirada, pra ter rastro depois.' : '';

  const lblFoto=document.getElementById('lbl-foto');
  if(lblFoto){
    const obrigaFoto = tipoAtual==='saida' && !ehEspecial;
    lblFoto.textContent = obrigaFoto
      ? 'Foto da nota fiscal (obrigatório — só gerente e diretor anexam)'
      : 'Foto da nota fiscal ou comprovante (só gerente e diretor anexam)';
  }

  const blocoForma=document.getElementById('bloco-forma-pagamento-saida');
  const selForma=document.getElementById('f-forma-pagamento-saida');
  if(blocoForma && selForma){
    blocoForma.classList.toggle('oculto', tipoAtual!=='saida');
    if(ehEspecial){
      selForma.value='dinheiro';
      selForma.disabled=true;
    }else{
      selForma.disabled=false;
    }
  }
}

function mudarTipo(t){
  tipoAtual=t;
  document.getElementById('bt-entrada').className = t==='entrada' ? 'on-e' : '';
  document.getElementById('bt-saida').className   = t==='saida'   ? 'on-s' : '';
  document.getElementById('lbl-categoria').textContent =
    t==='entrada' ? 'Forma de pagamento' : 'Categoria da despesa';
  const lista = t==='entrada' ? ENTRADAS : SAIDAS;
  document.getElementById('f-categoria').innerHTML =
    lista.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  removerFoto();
  atualizarDicaCategoria();
  atualizarVisibilidadeModoDespesa();
}

/* =========== MODO DE DESPESA DENTRO DE LANÇAR MOVIMENTO (parcelada / rateada) =========== */
function atualizarVisibilidadeModoDespesa(){
  const bloco=document.getElementById('bloco-modo-despesa');
  if(!bloco || !usuario) return;
  const mostra = tipoAtual==='saida' && usuario.papel!=='funcionario';
  bloco.classList.toggle('oculto', !mostra);
  if(!mostra){
    document.getElementById('f-modo-despesa').value='normal';
    mudarModoDespesa();
  }

  // foto de nota fiscal/comprovante: só gerente e diretor podem anexar
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  const blocoFoto=document.getElementById('bloco-foto-lancar');
  if(blocoFoto){
    blocoFoto.classList.toggle('oculto', !podeAnexarFoto);
    if(!podeAnexarFoto) removerFoto();
  }
}

function mudarModoDespesa(){
  const modo=document.getElementById('f-modo-despesa').value;
  document.getElementById('bloco-parcelada-lancar').classList.toggle('oculto', modo!=='parcelada');
  document.getElementById('bloco-rateio-lancar').classList.toggle('oculto', modo!=='rateada');
  const blocoCategoria=document.getElementById('f-categoria').closest('div');
  if(blocoCategoria) blocoCategoria.classList.toggle('oculto', modo==='parcelada');
  document.getElementById('lbl-valor').textContent = modo==='rateada' ? 'Valor de '+nomeUnidade(unidadeAtual())+' (R$)' : 'Valor (R$)';
  const txtUn=document.getElementById('txt-unidade-rateio');
  if(txtUn) txtUn.textContent = nomeUnidade(unidadeAtual());
  if(modo==='parcelada'){ ajustarParcelaAtualLancar(); }
}

function ajustarParcelaAtualLancar(){
  const total=Math.max(1, parseInt(document.getElementById('f-parc-parcelas').value,10)||1);
  const sel=document.getElementById('f-parc-atual');
  const anterior=sel.value;
  sel.innerHTML='';
  for(let n=1;n<=total;n++){
    sel.innerHTML += `<option value="${n}">${n} de ${total}</option>`;
  }
  if(anterior && anterior<=total) sel.value=anterior;
  recalcularValorParcelaLancar();
}
function recalcularValorParcelaLancar(){
  const totalCompra=parseFloat(document.getElementById('f-parc-valor-total').value)||0;
  const parcelas=Math.max(1, parseInt(document.getElementById('f-parc-parcelas').value,10)||1);
  document.getElementById('f-valor').value = totalCompra>0 ? (totalCompra/parcelas).toFixed(2) : '';
}

async function salvarLancamento(){
  const msg=document.getElementById('msg-lanc');
  const dataEscolhida=dataAtual();
  const registradoEm=hoje();
  const dataAlterada = dataEscolhida !== registradoEm;
  const turno=document.getElementById('f-turno').value;
  const obs=document.getElementById('f-obs').value.trim();
  const foto = fotoPendente ? await enviarFoto(fotoPendente.dataUrl) : null;
  const modo = (tipoAtual==='saida' && usuario.papel!=='funcionario')
    ? document.getElementById('f-modo-despesa').value : 'normal';
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  const formaPagamentoSaida = tipoAtual==='saida'
    ? (document.getElementById('f-forma-pagamento-saida').value || 'dinheiro') : undefined;

  /* ---- modo parcelada: uma única saída, categoria fixa 'parcelado' ---- */
  if(modo==='parcelada'){
    const valorTotalCompra=parseFloat(document.getElementById('f-parc-valor-total').value);
    const totalParcelas=Math.max(1, parseInt(document.getElementById('f-parc-parcelas').value,10)||1);
    const parcelaAtual=parseInt(document.getElementById('f-parc-atual').value,10)||1;
    const valorParcela=parseFloat(document.getElementById('f-valor').value);
    if(!obs){
      msg.style.color='var(--saida)';
      msg.textContent='Descreva a compra (ex.: "roupa de cama") — ajuda a identificar as parcelas depois.';
      return;
    }
    if(!valorTotalCompra || valorTotalCompra<=0 || !valorParcela || valorParcela<=0){
      msg.style.color='var(--saida)';
      msg.textContent='Preencha o valor total da compra e confira o valor da parcela.';
      return;
    }
    if(podeAnexarFoto && !foto){
      msg.style.color='var(--saida)';
      msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
      return;
    }
    try{
      await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
        unidade:unidadeAtual(), data:dataEscolhida, turno, tipo:'saida', categoria:'parcelado',
        valor:valorParcela, obs:`${obs} — parcela ${parcelaAtual}/${totalParcelas} de ${fmt(valorTotalCompra)}`,
        foto, formaPagamentoSaida
      })) });
      await recarregarLancamentos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent=`Parcela ${parcelaAtual}/${totalParcelas} de "${obs}" salva em `+nomeUnidade(unidadeAtual())+'.';
    limparCamposLancamento();
    setTimeout(()=>{ msg.textContent=''; },6000);
    desenhar();
    return;
  }

  /* ---- modo rateada: uma única saída, só nesta unidade — o valor total é só referência ---- */
  if(modo==='rateada'){
    const categoria=document.getElementById('f-categoria').value;
    const valorUnidade=parseFloat(document.getElementById('f-valor').value);
    const valorTotalNota=parseFloat(document.getElementById('f-rateio-valor-total').value);
    if(!valorUnidade || valorUnidade<=0){
      msg.style.color='var(--saida)';
      msg.textContent='Informe o valor da parte de '+nomeUnidade(unidadeAtual())+'.';
      return;
    }
    if(!valorTotalNota || valorTotalNota<=0){
      msg.style.color='var(--saida)';
      msg.textContent='Informe o valor total da nota (só pra referência).';
      return;
    }
    if(podeAnexarFoto && categoria!=='quebra' && categoria!=='retirada' && !foto){
      msg.style.color='var(--saida)';
      msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
      return;
    }
    try{
      await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
        unidade:unidadeAtual(), data:dataEscolhida, turno, tipo:'saida', categoria,
        valor:valorUnidade, obs, foto, formaPagamentoSaida,
        rateio:{valorTotal:valorTotalNota}
      })) });
      await recarregarLancamentos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent=`Salvo: ${fmt(valorUnidade)} de `+nomeUnidade(unidadeAtual())+` (nota total de ${fmt(valorTotalNota)}). As outras unidades não são afetadas.`;
    limparCamposLancamento();
    setTimeout(()=>{ msg.textContent=''; },6500);
    desenhar();
    return;
  }

  /* ---- modo normal ---- */
  const valor=parseFloat(document.getElementById('f-valor').value);
  if(!valor || valor<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Informe um valor maior que zero.';
    return;
  }
  const categoria=document.getElementById('f-categoria').value;
  if(tipoAtual==='saida' && categoria==='quebra' && !obs){
    msg.style.color='var(--saida)';
    msg.textContent='Descreva o que aconteceu — obrigatório para lançar falta de caixa.';
    return;
  }
  if(tipoAtual==='saida' && categoria==='retirada' && !obs){
    msg.style.color='var(--saida)';
    msg.textContent='Descreva quem autorizou e recebeu a retirada — obrigatório.';
    return;
  }
  if(tipoAtual==='saida' && categoria!=='quebra' && categoria!=='retirada' && podeAnexarFoto && !foto){
    msg.style.color='var(--saida)';
    msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
    return;
  }
  try{
    await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
      unidade:unidadeAtual(), data:dataEscolhida, turno,
      tipo:tipoAtual, categoria,
      valor, obs, foto, formaPagamentoSaida
    })) });
    await recarregarLancamentos();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }
  msg.style.color='var(--entrada)';
  msg.textContent='Lançamento salvo em '+nomeUnidade(unidadeAtual())+', dia '+dataBr(dataEscolhida)
    +(dataAlterada ? ' — data alterada (registrado hoje, '+dataBr(registradoEm)+'), isso fica marcado no extrato.' : '.');
  limparCamposLancamento();
  setTimeout(()=>{ msg.textContent=''; },6000);
  desenhar();
}

function limparCamposLancamento(){
  document.getElementById('f-valor').value='';
  document.getElementById('f-obs').value='';
  document.getElementById('f-parc-valor-total').value='';
  document.getElementById('f-parc-parcelas').value='1';
  document.getElementById('f-rateio-valor-total').value='';
  if(document.getElementById('f-forma-pagamento-saida')) document.getElementById('f-forma-pagamento-saida').value='dinheiro';
  if(document.getElementById('f-modo-despesa')){
    document.getElementById('f-modo-despesa').value='normal';
    mudarModoDespesa();
  }
  removerFoto();
}

function desenharLancar(){
  if(document.getElementById('f-modo-despesa')) mudarModoDespesa();
  document.getElementById('sub-lancar').textContent =
    `${nomeUnidade(unidadeAtual())} · ${dataBr(dataAtual())} — troque a unidade ou a data na barra acima.`;

  const meus=LANCAMENTOS.filter(l=>l.por===usuario.nome).slice(-10).reverse();
  document.getElementById('tab-meus').innerHTML = meus.length ? meus.map(l=>`
    <tr>
      <td>${dataBr(l.data)}</td>
      <td><span class="selo ${l.turno}">${l.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${nomeCategoria(l.categoria)}</td>
      <td>${l.obs||'—'}</td>
      <td class="n num ${l.tipo==='entrada'?'verde':'vermelho'}">${l.tipo==='saida'?'−':''}${fmt(l.valor)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Você ainda não lançou nada. Use o formulário acima.</td></tr>';

  const painelRateio=document.getElementById('painel-notas-rateadas');
  const podeVerRateio = usuario.papel==='admin' || usuario.papel==='gerente';
  painelRateio.classList.toggle('oculto', !podeVerRateio);
  if(podeVerRateio){
    const un=unidadeAtual();
    const rateadas=LANCAMENTOS.filter(l=>l.unidade===un && l.rateio)
      .slice().sort((a,b)=> a.data<b.data?1:-1);
    document.getElementById('sub-notas-rateadas').textContent =
      `${nomeUnidade(un)} · ${rateadas.length} nota(s) rateada(s) registrada(s) — mostrando só a parte desta unidade.`;
    document.getElementById('tab-notas-rateadas').innerHTML = rateadas.length ? rateadas.map(l=>`
      <tr>
        <td>${dataBr(l.data)}</td>
        <td>${nomeCategoria(l.categoria)}</td>
        <td>${l.obs||'—'}</td>
        <td class="n num">${fmt(l.rateio.valorTotal)}</td>
        <td class="n num vermelho">${fmt(l.valor)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="vazio">Nenhuma nota rateada registrada para esta unidade ainda.</td></tr>';
  }
}

function desenharExtrato(){
  const un=unidadeAtual(), d=dataAtual();
  const movs=filtrar({unidade:un,datas:[d]});
  const qtdAlteradas=movs.filter(l=>l.dataAlterada).length;
  document.getElementById('sub-extrato').textContent =
    `${nomeUnidade(un)} · ${dataBr(d)} — ${movs.length} lançamento(s) nos dois turnos.`
    + (qtdAlteradas ? ` ${qtdAlteradas} com data alterada.` : '');

  const entradasDia=movs.filter(l=>l.tipo==='entrada'), saidasDia=movs.filter(l=>l.tipo==='saida');
  const totE=somar(entradasDia), totS=somar(saidasDia);
  const gEl=document.getElementById('ex-saldo-dia');
  gEl.textContent=fmt(totE-totS);
  gEl.className='valorao num '+(totE-totS>=0?'positivo':'negativo');
  document.getElementById('ex-total-entradas').textContent=fmt(totE);
  document.getElementById('ex-total-saidas').textContent=fmt(totS);
  document.getElementById('ex-qtd-lancamentos').textContent=movs.length;
  document.getElementById('ex-dinheiro-caixa').textContent=
    fmt(somar(entradasDia.filter(l=>l.categoria==='dinheiro')) - somarSaidasEmDinheiro(saidasDia));

  document.getElementById('tab-ex-turno').innerHTML = ['dia','noite'].map(t=>{
    const doTurno=movs.filter(l=>l.turno===t);
    const e=somar(doTurno.filter(l=>l.tipo==='entrada')), s=somar(doTurno.filter(l=>l.tipo==='saida'));
    return `<tr>
      <td><span class="selo ${t}">${t==='dia'?'Dia':'Noite'}</span></td>
      <td class="n verde num">${fmt(e)}</td>
      <td class="n vermelho num">${fmt(s)}</td>
      <td class="n neutro-forte num">${fmt(e-s)}</td>
    </tr>`;
  }).join('');

  const porFormaPagamento = ENTRADAS.map(c=>({nome:c.nome, valor:somar(entradasDia.filter(l=>l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  document.getElementById('ex-graf-entradas').innerHTML = porFormaPagamento.length
    ? barras(porFormaPagamento, totE, 'e')
    : '<div class="vazio">Nenhuma entrada registrada neste dia.</div>';

  const podeApagar = temPermissaoFinanceira(usuario,'excluir_lancamentos');
  const podeEditarValor = temPermissaoFinanceira(usuario,'editar_valores');
  const ordem={dia:0,noite:1};
  const linhas=movs.slice().sort((a,b)=>ordem[a.turno]-ordem[b.turno]).map(l=>{
    const i=LANCAMENTOS.indexOf(l);
    const legenda=`${nomeCategoria(l.categoria)} · ${dataBr(l.data)} · ${fmt(l.valor)}`;
    const avisoData = l.dataAlterada
      ? `<span class="aviso-editado" title="Registrado em ${dataBr(l.registradoEm)}, lançado para o dia ${dataBr(l.data)}">data alterada</span>`
      : '';
    const subRateio = l.rateio
      ? `<div class="sub-boleto">Parte de uma nota rateada de ${fmt(l.rateio.valorTotal)} — só o valor desta unidade entrou no caixa.</div>`
      : '';
    return `<tr>
      <td><span class="selo ${l.turno}">${l.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${nomeCategoria(l.categoria)}</td>
      <td>${l.obs||'—'}${subRateio}</td>
      <td>${l.por==='sistema'?'—':l.por}${avisoData}</td>
      <td>${l.foto?`<img class="miniatura-tab" src="${l.foto}" alt="Comprovante" onclick="abrirLightbox('${l.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n num ${l.tipo==='entrada'?'verde':'vermelho'}">${l.tipo==='saida'?'−':''}${fmt(l.valor)}</td>
      <td class="n">
        ${podeEditarValor?`<button class="btn-mini" onclick="editarValorLancamento(${i})">Editar</button>`:''}
        ${podeApagar?`<button class="btn-mini" onclick="apagar(${i})">Excluir</button>`:''}
        ${!podeEditarValor && !podeApagar ? '—' : ''}
      </td>
    </tr>`;
  }).join('');
  document.getElementById('tab-extrato').innerHTML =
    linhas || '<tr><td colspan="7" class="vazio">Nenhum lançamento neste dia.</td></tr>';
}

function cartaoComprovanteHTML(foto, legenda, valorTxt, meta, classeValor, onApagar){
  const podeApagar = temPermissaoFinanceira(usuario,'apagar_comprovantes') && onApagar;
  return `<div class="cartao-comprovante">
    <img src="${foto}" alt="Comprovante" onclick="abrirLightbox('${foto}','${legenda.replace(/'/g,"\\'")}')">
    <div class="info">
      <div class="val num ${classeValor}">${valorTxt}</div>
      <div class="meta">${meta}</div>
      ${podeApagar?`<button class="btn-mini" onclick="event.stopPropagation(); ${onApagar}">Apagar foto</button>`:''}
    </div>
  </div>`;
}

async function apagarFotoComprovante(origem, indice){
  if(!temPermissaoFinanceira(usuario,'apagar_comprovantes')){
    avisar('Você não tem permissão pra apagar comprovantes. Fale com o diretor.');
    return;
  }
  if(!await confirmarAcao('Apagar essa foto? Essa ação não pode ser desfeita.')) return;
  const origens={lancamentos:LANCAMENTOS, boletos:BOLETOS, 'boletos-admin':BOLETOS_ADMIN, impostos:CONTAS_FIXAS};
  const arr=origens[origem];
  if(arr && arr[indice]){
    const nomesOrigem={lancamentos:'Lançamento', boletos:'Boletos e Pix', 'boletos-admin':'Boletos Administrativo', impostos:'Impostos e Energia'};
    if(origem==='lancamentos'){
      try{
        await api('/lancamentos/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].obs||nomeCategoria(arr[indice].categoria)||''}`, arr[indice].unidade);
      await recarregarLancamentos();
    }else if(origem==='boletos'){
      try{
        await api('/boletos/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao}`, arr[indice].unidade);
      await recarregarBoletos();
    }else if(origem==='boletos-admin'){
      try{
        await api('/boletos-admin/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao}`, null);
      await recarregarBoletosAdmin();
    }else if(origem==='impostos'){
      try{
        await api('/contas-fixas/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao}`, arr[indice].unidade);
      await recarregarContasFixas();
    }else{
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao||arr[indice].obs||nomeCategoria(arr[indice].categoria)||''}`, arr[indice].unidade);
      arr[indice].foto=null;
    }
  }
  desenharComprovantes();
}

function desenharComprovantes(){
  const un=unidadeAtual(), datas=listaDatas();
  const setores=setoresComprovantesDoUsuario(usuario);
  const temSetor = s => setores.includes(s);
  const escopo=escopoComprovantesDoUsuario(usuario);
  const soHoje = escopo==='dia';
  const bateHoje = data => data===dataAtual();

  document.getElementById('sub-comprovantes').textContent = soHoje
    ? `${nomeUnidade(un)} · fotos de ${dataBr(dataAtual())}, separadas por setor.`
    : `${nomeUnidade(un)} · fotos anexadas nos últimos ${diasPeriodo()} dia(s), separadas por setor.`;

  // Lançamentos do dia a dia
  document.getElementById('setor-comp-lancamentos').classList.toggle('oculto', !temSetor('lancamentos'));
  if(temSetor('lancamentos')){
    const movs=filtrar({unidade:un,datas: soHoje?[dataAtual()]:datas}).filter(l=>l.foto).slice().sort((a,b)=> a.data<b.data?1:-1);
    document.getElementById('grade-comprovantes').innerHTML = movs.length
      ? movs.map(l=>cartaoComprovanteHTML(l.foto,
          `${nomeCategoria(l.categoria)} · ${dataBr(l.data)} · ${fmt(l.valor)}`,
          `${l.tipo==='saida'?'−':''}${fmt(l.valor)}`,
          `${nomeCategoria(l.categoria)} · ${dataBr(l.data)} · ${l.turno==='dia'?'Dia':'Noite'}`,
          l.tipo==='entrada'?'verde':'vermelho',
          `apagarFotoComprovante('lancamentos',${LANCAMENTOS.indexOf(l)})`)).join('')
      : `<div class="vazio">Nenhuma foto anexada ${soHoje?'hoje':'neste período'}.</div>`;
  }

  // Boletos e Pix
  document.getElementById('setor-comp-boletos').classList.toggle('oculto', !temSetor('boletos'));
  if(temSetor('boletos')){
    const lista=BOLETOS.filter(b=>b.unidade===un && b.foto && (!soHoje || bateHoje(b.vencimento) || bateHoje(b.dataPagamento)));
    document.getElementById('grade-comprovantes-boletos').innerHTML = lista.length
      ? lista.map(b=>cartaoComprovanteHTML(b.foto, `${b.descricao} · ${fmt(b.valor)}`, fmt(b.valor),
          `${b.descricao} · venc. ${dataBr(b.vencimento)}`, 'vermelho',
          `apagarFotoComprovante('boletos',${BOLETOS.indexOf(b)})`)).join('')
      : `<div class="vazio">Nenhum boleto com foto ${soHoje?'com vencimento ou pagamento hoje':'nesta unidade'}.</div>`;
  }

  // Boletos Administrativo (só quem tem o setor liberado, normalmente só o diretor)
  document.getElementById('setor-comp-boletos-admin').classList.toggle('oculto', !temSetor('boletos-admin'));
  if(temSetor('boletos-admin')){
    const lista=BOLETOS_ADMIN.filter(b=>b.foto && (!soHoje || bateHoje(b.vencimento)));
    document.getElementById('grade-comprovantes-boletos-admin').innerHTML = lista.length
      ? lista.map(b=>cartaoComprovanteHTML(b.foto, `${b.descricao} · ${fmt(b.valor)}`, fmt(b.valor),
          `${b.descricao} · venc. ${dataBr(b.vencimento)}`, 'vermelho',
          `apagarFotoComprovante('boletos-admin',${BOLETOS_ADMIN.indexOf(b)})`)).join('')
      : '<div class="vazio">Nenhum boleto administrativo com foto.</div>';
  }

  // Impostos e Energia
  document.getElementById('setor-comp-impostos').classList.toggle('oculto', !temSetor('impostos'));
  if(temSetor('impostos')){
    const lista=CONTAS_FIXAS.filter(c=>c.unidade===un && c.foto && (!soHoje || bateHoje(c.vencimento) || bateHoje(c.dataPagamento)));
    document.getElementById('grade-comprovantes-impostos').innerHTML = lista.length
      ? lista.map(c=>cartaoComprovanteHTML(c.foto, `${nomeTipoConta(c.tipo)} · ${fmt(c.valor)}`, fmt(c.valor),
          `${nomeTipoConta(c.tipo)} · ${c.descricao} · venc. ${dataBr(c.vencimento)}`, 'vermelho',
          `apagarFotoComprovante('impostos',${CONTAS_FIXAS.indexOf(c)})`)).join('')
      : '<div class="vazio">Nenhuma conta com foto nesta unidade.</div>';
  }
}

/* =========== ALERTAS DE DESPESAS (duplicadas / fora do padrão) =========== */
function diasEntre(d1,d2){
  return Math.round((new Date(d2+'T12:00:00') - new Date(d1+'T12:00:00')) / 86400000);
}

function calcularAlertas(){
  const ids = unidadesDoUsuario();
  const desde = diaMenos(29);
  const saidas = LANCAMENTOS.filter(l => l.tipo==='saida' && ids.includes(l.unidade) && l.data>=desde);
  const alertas = [];
  const jaAlertado = new Set();
  const marcar = (l,tipo,motivo) => {
    const chave = tipo+'|'+LANCAMENTOS.indexOf(l);
    if(jaAlertado.has(chave)) return;
    jaAlertado.add(chave);
    alertas.push({item:l, tipo, motivo});
  };

  // 1) Falta de caixa: qualquer lançamento nessa categoria entra direto no alerta
  saidas.filter(l=>l.categoria==='quebra').forEach(l=>{
    marcar(l,'quebra', l.obs ? l.obs : 'Falta de caixa registrada pelo funcionário, sem detalhes adicionais.');
  });

  // 1b) Retirada em espécie: também entra direto, pro diretor sempre ficar sabendo
  saidas.filter(l=>l.categoria==='retirada').forEach(l=>{
    marcar(l,'retirada', l.obs ? l.obs : 'Retirada em espécie registrada, sem detalhes adicionais.');
  });

  // 2) Despesas repetidas: mesma unidade + categoria + valor, em datas próximas (mesmo dia ou dia seguinte)
  const grupos1 = {};
  saidas.forEach(l=>{
    const chave = l.unidade+'|'+l.categoria+'|'+l.valor.toFixed(2);
    (grupos1[chave] = grupos1[chave] || []).push(l);
  });
  Object.values(grupos1).forEach(lista=>{
    if(lista.length<2) return;
    lista.sort((a,b)=> a.data<b.data ? -1 : 1);
    for(let i=1;i<lista.length;i++){
      if(diasEntre(lista[i-1].data, lista[i].data) <= 1){
        const mesmoDia = lista[i-1].data===lista[i].data;
        const motivo = `Mesmo valor (${fmt(lista[i].valor)}) lançado em ${nomeCategoria(lista[i].categoria)} `
          + (mesmoDia ? 'duas vezes no mesmo dia.' : 'em dias seguidos.');
        marcar(lista[i-1],'duplicado',motivo);
        marcar(lista[i],'duplicado',motivo);
      }
    }
  });

  // 3) Despesas fora do padrão: valor bem acima da média da própria categoria naquela unidade
  const grupos2 = {};
  saidas.forEach(l=>{
    const chave = l.unidade+'|'+l.categoria;
    (grupos2[chave] = grupos2[chave] || []).push(l);
  });
  Object.values(grupos2).forEach(lista=>{
    if(lista.length<4) return; // amostra pequena demais pra comparar com segurança
    const valores = lista.map(l=>l.valor);
    const media = valores.reduce((a,b)=>a+b,0)/valores.length;
    const desvio = Math.sqrt(valores.reduce((a,b)=>a+Math.pow(b-media,2),0)/valores.length);
    lista.forEach(l=>{
      if(desvio>0 && l.valor > media + 2*desvio && l.valor > media*1.6){
        marcar(l,'atipico',`Valor bem acima do costume em ${nomeCategoria(l.categoria)} nesta unidade — a média gira em torno de ${fmt(media)}.`);
      }
    });
  });

  return alertas.sort((a,b)=> a.item.data<b.item.data ? 1 : a.item.data>b.item.data ? -1 : 0);
}

function irParaLancamento(unidade,data){
  document.getElementById('sel-unidade').value=unidade;
  document.getElementById('sel-data').value=data;
  abrir('extrato');
}

function desenharAlertas(){
  const alertas=calcularAlertas();
  const rotulosAlerta={quebra:'Falta de caixa',retirada:'Retirada em espécie',duplicado:'Repetida',atipico:'Fora do padrão'};
  document.getElementById('contagem-alertas').textContent=alertas.length;
  document.getElementById('lista-alertas').innerHTML = alertas.length ? alertas.map(a=>{
    const l=a.item;
    return `<div class="alerta-item" onclick="irParaLancamento('${l.unidade}','${l.data}')">
      <span class="selo-alerta ${a.tipo}">${rotulosAlerta[a.tipo]}</span>
      <div class="alerta-corpo">
        <div class="alerta-titulo">${nomeUnidade(l.unidade)} · ${nomeCategoria(l.categoria)} · ${dataBr(l.data)}</div>
        <div class="alerta-motivo">${a.motivo}</div>
      </div>
      <div class="alerta-valor num vermelho">${fmt(l.valor)}</div>
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma despesa duplicada, fora do padrão, falta de caixa ou retirada nos últimos 30 dias.</div>';
}

/* =========== VISTORIA DE SUÍTES =========== */
function linhaChecklistHTML(it){
  return `<div class="linha-checklist" data-item="${it.id}" data-status="ok">
    <div class="topo-item">
      <span class="nome-item">${it.nome}</span>
      <div class="opcoes-item">
        <button type="button" class="on-ok" onclick="marcarItemVistoria('${it.id}','ok')">OK</button>
        <button type="button" onclick="marcarItemVistoria('${it.id}','problema')">Problema</button>
      </div>
    </div>
    <div class="detalhe-problema oculto">
      <input type="text" placeholder="Descreva o problema (ex.: mancha no lençol, controle da TV sem pilha)">
    </div>
  </div>`;
}

/* =========== GERENCIAR PERGUNTAS DO CHECKLIST (só diretor) =========== */
function limparFormItemVistoria(){
  document.getElementById('giv-id-original').value='';
  document.getElementById('giv-nome').value='';
  document.getElementById('giv-categoria').value='garagem';
  document.getElementById('giv-rapida').checked=false;
  document.getElementById('btn-cancelar-item-vistoria').classList.add('oculto');
  document.getElementById('msg-item-vistoria').textContent='';
}

function editarItemVistoria(id){
  const it=ITENS_VISTORIA.find(i=>i.id===id);
  if(!it) return;
  document.getElementById('giv-id-original').value=it.id;
  document.getElementById('giv-nome').value=it.nome;
  document.getElementById('giv-categoria').value=it.categoria;
  document.getElementById('giv-rapida').checked=ITENS_VISTORIA_RAPIDA.includes(it.id);
  document.getElementById('btn-cancelar-item-vistoria').classList.remove('oculto');
  document.getElementById('msg-item-vistoria').textContent='';
}

async function excluirItemVistoria(id){
  if(!await confirmarAcao('Remover essa pergunta do checklist? Vistorias já feitas continuam guardando a resposta antiga.')) return;
  const it=ITENS_VISTORIA.find(i=>i.id===id);
  registrarExclusao('Pergunta do checklist de vistoria', it?it.nome:id, null);
  ITENS_VISTORIA=ITENS_VISTORIA.filter(i=>i.id!==id);
  const idxRapida=ITENS_VISTORIA_RAPIDA.indexOf(id);
  if(idxRapida>-1) ITENS_VISTORIA_RAPIDA.splice(idxRapida,1);
  montarChecklistVistoria();
  desenharGerenciarItensVistoria();
}

function salvarItemVistoria(){
  const idOriginal=document.getElementById('giv-id-original').value;
  const nome=document.getElementById('giv-nome').value.trim();
  const categoria=document.getElementById('giv-categoria').value;
  const naRapida=document.getElementById('giv-rapida').checked;
  const msg=document.getElementById('msg-item-vistoria');

  if(!nome){
    msg.style.color='var(--saida)';
    msg.textContent='Escreva o texto da pergunta.';
    return;
  }

  if(idOriginal){
    const it=ITENS_VISTORIA.find(i=>i.id===idOriginal);
    if(it){ it.nome=nome; it.categoria=categoria; }
    const idxRapida=ITENS_VISTORIA_RAPIDA.indexOf(idOriginal);
    if(naRapida && idxRapida===-1) ITENS_VISTORIA_RAPIDA.push(idOriginal);
    if(!naRapida && idxRapida>-1) ITENS_VISTORIA_RAPIDA.splice(idxRapida,1);
    msg.style.color='var(--entrada)';
    msg.textContent='Pergunta atualizada.';
  }else{
    const novoId='iv_'+Date.now();
    ITENS_VISTORIA.push({id:novoId, categoria, nome});
    if(naRapida) ITENS_VISTORIA_RAPIDA.push(novoId);
    msg.style.color='var(--entrada)';
    msg.textContent='Pergunta adicionada.';
  }

  limparFormItemVistoria();
  setTimeout(()=>{ msg.textContent=''; },4000);
  montarChecklistVistoria();
  desenharGerenciarItensVistoria();
}

function desenharGerenciarItensVistoria(){
  const painel=document.getElementById('painel-gerenciar-checklist');
  if(!painel || !usuario) return;
  const podeVer = usuario.papel==='admin';
  painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const ordenados=ITENS_VISTORIA.slice().sort((a,b)=> a.categoria<b.categoria?-1:a.categoria>b.categoria?1:0);
  document.getElementById('tab-itens-vistoria').innerHTML = ordenados.length ? ordenados.map(it=>{
    const cat=CATEGORIAS_VISTORIA.find(c=>c.id===it.categoria);
    return `<tr>
      <td>${cat?cat.nome:it.categoria}</td>
      <td>${it.nome}</td>
      <td class="n">${ITENS_VISTORIA_RAPIDA.includes(it.id)?'Sim':'—'}</td>
      <td class="n">
        <button class="btn-mini" onclick="editarItemVistoria('${it.id}')">Editar</button>
        <button class="btn-mini" onclick="excluirItemVistoria('${it.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="vazio">Nenhuma pergunta cadastrada.</td></tr>';
}

function modoVistoriaAtual(){
  return (usuario && usuario.papel==='funcionario') ? 'rapida' : 'completa';
}

function montarChecklistVistoria(){
  const cont=document.getElementById('checklist-vistoria');
  if(!cont) return;
  const modo = modoVistoriaAtual();

  const aviso=document.getElementById('aviso-tipo-vistoria');
  if(aviso){
    aviso.textContent = modo==='rapida'
      ? 'Vistoria rápida de início de plantão — 9 itens essenciais.'
      : 'Vistoria completa — todas as categorias e itens.';
  }

  if(modo==='rapida'){
    const itensRapidos = ITENS_VISTORIA.filter(it=>ITENS_VISTORIA_RAPIDA.includes(it.id));
    cont.innerHTML = `<div class="grupo-checklist">
      <div class="corpo-grupo-checklist" style="padding-top:10px">
        ${itensRapidos.map(linhaChecklistHTML).join('')}
      </div>
    </div>`;
    return;
  }

  cont.innerHTML = CATEGORIAS_VISTORIA.map((cat,i)=>{
    const itensCat = ITENS_VISTORIA.filter(it=>it.categoria===cat.id);
    return `<div class="grupo-checklist">
      <button type="button" class="titulo-grupo-checklist" onclick="alternarGrupoChecklist('${cat.id}')">
        <span>${cat.nome}</span><span class="contagem-grupo">${itensCat.length} itens</span>
      </button>
      <div class="corpo-grupo-checklist${i===0?'':' oculto'}" id="corpo-grupo-${cat.id}">
        ${itensCat.map(linhaChecklistHTML).join('')}
      </div>
    </div>`;
  }).join('');
}

function alternarGrupoChecklist(catId){
  document.getElementById('corpo-grupo-'+catId).classList.toggle('oculto');
}

function marcarItemVistoria(itemId, status){
  const linha=document.querySelector(`.linha-checklist[data-item="${itemId}"]`);
  linha.dataset.status=status;
  const botoes=linha.querySelectorAll('.opcoes-item button');
  botoes[0].className = status==='ok' ? 'on-ok' : '';
  botoes[1].className = status==='problema' ? 'on-problema' : '';
  linha.querySelector('.detalhe-problema').classList.toggle('oculto', status!=='problema');
}

function prevejaFotoVistoria(input){
  const arquivos=[...(input.files||[])];
  arquivos.forEach(arq=>{
    if(!arq.type.startsWith('image/')) return;
    const leitor=new FileReader();
    leitor.onload = e=>{
      fotosPendentesVistoria.push({dataUrl:e.target.result, nome:arq.name});
      renderizarFotosPendentesVistoria();
    };
    leitor.readAsDataURL(arq);
  });
  input.value='';
}
function removerFotoVistoria(idx){
  fotosPendentesVistoria.splice(idx,1);
  renderizarFotosPendentesVistoria();
}
function renderizarFotosPendentesVistoria(){
  document.getElementById('fotos-pendentes-vistoria').innerHTML = fotosPendentesVistoria.map((f,i)=>
    `<div class="foto-anexada"><img src="${f.dataUrl}" alt=""><button type="button" onclick="removerFotoVistoria(${i})">×</button></div>`
  ).join('');
  document.getElementById('vistoria-fotos-vazia').classList.toggle('oculto', fotosPendentesVistoria.length>0);
}

async function salvarVistoria(){
  const suite=document.getElementById('fv-suite').value.trim();
  const turno=document.getElementById('fv-turno').value;
  const observacaoGeral=document.getElementById('fv-obs').value.trim();
  const msg=document.getElementById('msg-vistoria');

  if(!suite){
    msg.style.color='var(--saida)';
    msg.textContent='Informe o número ou nome da suíte.';
    return;
  }

  const tipoVistoria = modoVistoriaAtual();
  const itens = [...document.querySelectorAll('#checklist-vistoria .linha-checklist')].map(linha=>{
    const id=linha.dataset.item;
    const def=ITENS_VISTORIA.find(it=>it.id===id);
    const status=linha.dataset.status||'ok';
    const obs = status==='problema' ? linha.querySelector('.detalhe-problema input').value.trim() : '';
    return {id, nome:def?def.nome:id, status, obs};
  });

  const problemas=itens.filter(i=>i.status==='problema');
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  if(problemas.length && podeAnexarFoto && fotosPendentesVistoria.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Foto obrigatória: anexe ao menos uma foto, já que foi marcado "Problema" em '+problemas.length+' item(ns).';
    return;
  }

  try{
    await api('/vistorias', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), suite, data: dataAtual(), turno, tipo_vistoria: tipoVistoria,
      observacao_geral: observacaoGeral || null,
      itens: itens.map(i=>({id:i.id, status:i.status, observacao:i.obs||null})),
      fotos_url: await Promise.all(fotosPendentesVistoria.map(f=>enviarFoto(f.dataUrl)))
    }) });
    await recarregarVistorias();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fv-suite').value='';
  document.getElementById('fv-obs').value='';
  fotosPendentesVistoria=[];
  renderizarFotosPendentesVistoria();
  montarChecklistVistoria();
  msg.style.color='var(--entrada)';
  msg.textContent = problemas.length
    ? `Vistoria da suíte ${suite} salva com ${problemas.length} problema(s) sinalizado(s).`
    : `Vistoria da suíte ${suite} salva — tudo certo.`;
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharVistorias();
}

function desenharDashboardFuncionarioVistoria(){
  const painel=document.getElementById('painel-dashboard-funcionario-vistoria');
  const podeVer = usuario.papel==='gerente';
  if(painel) painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=VISTORIAS.filter(v=>v.unidade===un && v.data>=desde);

  document.getElementById('sub-dashboard-funcionario-vistoria').textContent =
    `${nomeUnidade(un)} · últimos 30 dias, por quem fez a vistoria`;

  const porPessoa={};
  lista.forEach(v=>{
    const p=porPessoa[v.feitoPor] || (porPessoa[v.feitoPor]={total:0, comProblema:0, ultima:v.data});
    p.total++;
    if(v.itens.some(i=>i.status==='problema')) p.comProblema++;
    if(v.data>p.ultima) p.ultima=v.data;
  });

  const linhas=Object.entries(porPessoa).sort((a,b)=>b[1].total-a[1].total);
  document.getElementById('tab-dashboard-funcionario-vistoria').innerHTML = linhas.length
    ? linhas.map(([nome,p])=>`
      <tr>
        <td>${nome}</td>
        <td class="n num">${p.total}</td>
        <td class="n verde num">${p.total-p.comProblema}</td>
        <td class="n vermelho num">${p.comProblema}</td>
        <td class="n">${dataBr(p.ultima)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Nenhuma vistoria registrada nesta unidade no período.</td></tr>';
}

function desenharDashboardVistoria(){
  desenharDashboardFuncionarioVistoria();
  const painel=document.getElementById('painel-dashboard-vistoria');
  const podeVer = usuario.papel==='admin';
  if(painel) painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=VISTORIAS.filter(v=>v.unidade===un && v.data>=desde);
  const total=lista.length;
  const comProblema=lista.filter(v=>v.itens.some(i=>i.status==='problema')).length;
  const pctOk = total ? Math.round(((total-comProblema)/total)*100) : 0;
  const suitesDistintas = new Set(lista.map(v=>v.suite)).size;
  const totalFotos = lista.reduce((s,v)=>s+(v.fotos?v.fotos.length:0),0);
  const rapidas = lista.filter(v=>v.tipoVistoria==='rapida').length;

  document.getElementById('sub-dashboard-vistoria').textContent = `${nomeUnidade(un)} · últimos 30 dias`;

  document.getElementById('grade-stats-vistoria').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${total}</div><div class="rotulo-stat">Vistorias registradas</div></div>
    <div class="stat-vistoria"><div class="num-stat verde">${pctOk}%</div><div class="rotulo-stat">Sem nenhum problema</div></div>
    <div class="stat-vistoria"><div class="num-stat vermelho">${comProblema}</div><div class="rotulo-stat">Vistorias com problema</div></div>
    <div class="stat-vistoria"><div class="num-stat">${suitesDistintas}</div><div class="rotulo-stat">Suítes distintas vistoriadas</div></div>
    <div class="stat-vistoria"><div class="num-stat">${rapidas}/${total}</div><div class="rotulo-stat">Vistorias rápidas (plantão)</div></div>
    <div class="stat-vistoria"><div class="num-stat">${totalFotos}</div><div class="rotulo-stat">Fotos anexadas no período</div></div>
  `;

  // ranking de itens mais reportados
  const contagemItens={};
  lista.forEach(v=> v.itens.filter(i=>i.status==='problema').forEach(i=>{
    contagemItens[i.nome]=(contagemItens[i.nome]||0)+1;
  }));
  const rankingItens=Object.entries(contagemItens).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maiorItem=rankingItens.length ? rankingItens[0][1] : 1;
  document.getElementById('ranking-problemas-vistoria').innerHTML = rankingItens.length
    ? barras(rankingItens.map(([nome,valor])=>({nome,valor})), maiorItem, 's')
    : '<div class="vazio">Nenhum problema reportado no período.</div>';

  // problemas por categoria
  const contagemCategoria={};
  CATEGORIAS_VISTORIA.forEach(c=> contagemCategoria[c.id]=0);
  lista.forEach(v=> v.itens.filter(i=>i.status==='problema').forEach(i=>{
    const def=ITENS_VISTORIA.find(it=>it.id===i.id);
    if(def) contagemCategoria[def.categoria]=(contagemCategoria[def.categoria]||0)+1;
  }));
  const rankingCategoria=CATEGORIAS_VISTORIA.map(c=>({nome:c.nome,valor:contagemCategoria[c.id]}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  const maiorCategoria=rankingCategoria.length ? rankingCategoria[0].valor : 1;
  document.getElementById('ranking-categoria-vistoria').innerHTML = rankingCategoria.length
    ? barras(rankingCategoria, maiorCategoria, 's', false)
    : '<div class="vazio">Nenhum problema reportado no período.</div>';

  // suítes com mais problemas
  const contagemSuite={};
  lista.forEach(v=>{
    const qtd=v.itens.filter(i=>i.status==='problema').length;
    if(qtd>0) contagemSuite[v.suite]=(contagemSuite[v.suite]||0)+qtd;
  });
  const rankingSuites=Object.entries(contagemSuite).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maiorSuite=rankingSuites.length ? rankingSuites[0][1] : 1;
  document.getElementById('ranking-suites-vistoria').innerHTML = rankingSuites.length
    ? barras(rankingSuites.map(([nome,valor])=>({nome:'Suíte '+nome,valor})), maiorSuite, 's')
    : '<div class="vazio">Nenhuma suíte com problema no período.</div>';

  // últimas vistorias com problema
  const comProblemaLista = lista.filter(v=>v.itens.some(i=>i.status==='problema'))
    .slice().sort((a,b)=> a.data<b.data?1:-1).slice(0,8);
  document.getElementById('tab-ultimas-problemas-vistoria').innerHTML = comProblemaLista.length
    ? comProblemaLista.map(v=>{
        const qtd=v.itens.filter(i=>i.status==='problema').length;
        return `<tr>
          <td>${dataBr(v.data)}</td>
          <td>${v.suite}</td>
          <td><span class="selo ${v.turno}">${v.turno==='dia'?'Dia':'Noite'}</span></td>
          <td>${v.feitoPor}</td>
          <td>${v.tipoVistoria==='rapida'?'Rápida':'Completa'}</td>
          <td class="n vermelho num">${qtd}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="vazio">Nenhuma vistoria com problema no período.</td></tr>';

  const alertasPrioridade=calcularAlertasVistoria(un);
  document.getElementById('alertas-prioridade-vistoria').innerHTML = alertasPrioridade.length
    ? alertasPrioridade.map(a=>`<div class="alerta-item" style="cursor:default">
        <span class="selo-alerta atipico">Prioridade</span>
        <div class="alerta-corpo"><div class="alerta-titulo">${a.item} — Suíte ${a.suite}</div>
        <div class="alerta-motivo">${a.motivo}</div></div>
      </div>`).join('')
    : '<div class="vazio">Nenhum problema recorrente no momento.</div>';
}

function atualizarVisibilidadeFotoVistoria(){
  const bloco=document.getElementById('bloco-foto-vistoria');
  if(!bloco || !usuario) return;
  const pode = usuario.papel==='admin' || usuario.papel==='gerente';
  bloco.classList.toggle('oculto', !pode);
  if(!pode){
    fotosPendentesVistoria=[];
    renderizarFotosPendentesVistoria();
  }
}

function calcularAlertasVistoria(un){
  const desde=diaMenos(29);
  const comProblema=VISTORIAS.filter(v=>v.unidade===un && v.data>=desde && v.itens.some(i=>i.status==='problema'));
  const grupos={};
  comProblema.forEach(v=>{
    v.itens.filter(i=>i.status==='problema').forEach(i=>{
      const chave=i.id+'|'+v.suite;
      (grupos[chave]=grupos[chave]||[]).push({data:v.data, obs:i.obs, nome:i.nome, suite:v.suite});
    });
  });
  const alertas=[];
  Object.values(grupos).forEach(g=>{
    if(g.length>=2){
      alertas.push({
        item:g[0].nome, suite:g[0].suite, quantidade:g.length,
        motivo:`"${g[0].nome}" reportado como problema na suíte ${g[0].suite}, ${g.length} vezes nos últimos 30 dias — recomenda-se manutenção com prioridade.`
      });
    }
  });
  return alertas.sort((a,b)=>b.quantidade-a.quantidade);
}

function desenharVistorias(){
  atualizarVisibilidadeFotoVistoria();
  desenharDashboardVistoria();
  desenharGerenciarItensVistoria();
  const un=unidadeAtual();
  const lista=VISTORIAS.filter(v=>v.unidade===un && v.itens.some(i=>i.status==='problema'))
    .slice().sort((a,b)=> a.data<b.data?1:a.data>b.data?-1:0);

  document.getElementById('sub-vistorias').textContent =
    `${nomeUnidade(un)} · ${lista.length} vistoria(s) com problema (o histórico não guarda as que ficaram "tudo OK").`;

  document.getElementById('lista-vistorias').innerHTML = lista.length ? lista.map(v=>{
    const problemas=v.itens.filter(i=>i.status==='problema');
    const selo = `<span class="selo-status atrasado">${problemas.length} problema(s)</span>`;
    const listaProblemas = `<ul class="lista-problemas">${problemas.map(p=>`<li>${p.nome}${p.obs?': '+p.obs:''}</li>`).join('')}</ul>`;
    const fotos = v.fotos && v.fotos.length
      ? `<div class="grade-fotos-cartao">${v.fotos.map(f=>`<img src="${f}" alt="Foto da suíte" onclick="abrirLightbox('${f}','Suíte ${v.suite} · ${dataBr(v.data)}')">`).join('')}</div>`
      : '';
    return `<div class="cartao-vistoria">
      <div class="topo-vistoria">
        <div><div class="titulo-vistoria">Suíte ${v.suite}${v.tipoVistoria==='rapida'?' <span class="voce-selo">(vistoria rápida)</span>':''}</div>
        <div class="sub-vistoria">${dataBr(v.data)} · ${v.turno==='dia'?'Dia':'Noite'} · vistoriado por ${v.feitoPor}</div></div>
        ${selo}
      </div>
      ${listaProblemas}
      ${v.observacaoGeral?`<div class="sub-boleto">${v.observacaoGeral}</div>`:''}
      ${fotos}
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma vistoria com problema registrada nesta unidade.</div>';
}

async function apagar(i){
  if(!temPermissaoFinanceira(usuario,'excluir_lancamentos')){
    avisar('Você não tem permissão pra excluir lançamentos. Fale com o diretor.');
    return;
  }
  if(!await confirmarAcao('Excluir esse lançamento? Essa ação não pode ser desfeita.')) return;
  const l=LANCAMENTOS[i];
  if(!l) return;
  try{
    await api('/lancamentos/'+l.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Lançamento', `${l.tipo==='entrada'?'Entrada':'Saída'} — ${nomeCategoria(l.categoria)} — ${fmt(l.valor)} (${dataBr(l.data)})`, l.unidade);
  await recarregarLancamentos();
  desenhar();
}

function abrirModalEditarLancamento(l){
  return new Promise(resolve=>{
    const categorias = l.tipo==='entrada' ? ENTRADAS : SAIDAS;
    document.getElementById('ml-categoria').innerHTML = categorias.map(c=>
      `<option value="${c.id}" ${c.id===l.categoria?'selected':''}>${c.nome}</option>`).join('');
    document.getElementById('ml-turno').value = l.turno;
    document.getElementById('ml-valor').value = l.valor.toFixed(2);
    document.getElementById('ml-obs').value = l.obs||'';
    document.getElementById('modal-editar-lancamento-erro').classList.add('oculto');
    document.getElementById('modal-editar-lancamento').classList.remove('oculto');
    const limpar=()=>document.getElementById('modal-editar-lancamento').classList.add('oculto');
    document.getElementById('modal-editar-lancamento-ok').onclick=()=>{
      const valor=parseFloat(document.getElementById('ml-valor').value);
      if(!valor || valor<=0){
        const erro=document.getElementById('modal-editar-lancamento-erro');
        erro.textContent='Informe um valor válido.';
        erro.classList.remove('oculto');
        return;
      }
      const resultado={
        categoria: document.getElementById('ml-categoria').value,
        turno: document.getElementById('ml-turno').value,
        valor, obs: document.getElementById('ml-obs').value.trim()
      };
      limpar();
      resolve(resultado);
    };
    document.getElementById('modal-editar-lancamento-cancelar').onclick=()=>{ limpar(); resolve(null); };
  });
}

async function editarValorLancamento(i){
  if(!temPermissaoFinanceira(usuario,'editar_valores')){
    avisar('Você não tem permissão pra editar valores. Fale com o diretor.');
    return;
  }
  const l=LANCAMENTOS[i];
  if(!l) return;
  const resultado=await abrirModalEditarLancamento(l);
  if(!resultado) return;
  try{
    await api('/lancamentos/'+l.id, { method:'PUT', body: JSON.stringify({
      categoria_id: resultado.categoria, turno: resultado.turno,
      valor: resultado.valor, observacao: resultado.obs
    }) });
  }catch(e){
    avisar(e.message);
    return;
  }
  await recarregarLancamentos();
  desenhar();
}

/* =========== BOLETOS E NOTAS (Pix) =========== */
function alternarCompraConjunta(){
  const on=document.getElementById('fb-conjunta').checked;
  document.getElementById('bloco-conjunta').classList.toggle('oculto', !on);
  document.getElementById('bloco-valor-simples').classList.toggle('oculto', on);
  if(on) montarUnidadesConjunta();
}

function montarUnidadesConjunta(){
  const ids=unidadesDoUsuario();
  document.getElementById('fb-unidades-valores').innerHTML = ids.map(id=>`
    <div class="linha-unidade-valor">
      <label><input type="checkbox" class="chk-unidade-conjunta" value="${id}" checked onchange="dividirValorConjunta()"> ${nomeUnidade(id)}</label>
      <input type="number" class="valor-unidade-conjunta" data-unidade="${id}" min="0" step="0.01" placeholder="0,00">
    </div>`).join('');
  dividirValorConjunta();
}

function dividirValorConjunta(){
  const total=parseFloat(document.getElementById('fb-valor-total-conjunta').value)||0;
  const marcadas=[...document.querySelectorAll('.chk-unidade-conjunta:checked')];
  const valorCada = marcadas.length ? Math.round((total/marcadas.length)*100)/100 : 0;
  document.querySelectorAll('.valor-unidade-conjunta').forEach(inp=>{
    const chk=document.querySelector(`.chk-unidade-conjunta[value="${inp.dataset.unidade}"]`);
    inp.disabled = !chk.checked;
    if(chk.checked) inp.value = valorCada.toFixed(2);
  });
}

async function salvarBoleto(){
  const descricao=document.getElementById('fb-descricao').value.trim();
  const conjunta=document.getElementById('fb-conjunta').checked;
  const codigoBarras=document.getElementById('fb-codigo-barras').value.trim();
  const pixCopiaCola=document.getElementById('fb-pix-copia-cola').value.trim();
  const msg=document.getElementById('msg-boleto');

  if(!descricao){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha a descrição do boleto ou nota.';
    return;
  }

  if(conjunta){
    const totalConjunto=parseFloat(document.getElementById('fb-valor-total-conjunta').value);
    const vencimento=document.getElementById('fb-vencimento-conjunta').value;
    const marcadas=[...document.querySelectorAll('.chk-unidade-conjunta:checked')].map(c=>c.value);
    if(!totalConjunto || totalConjunto<=0 || !vencimento || marcadas.length===0){
      msg.style.color='var(--saida)';
      msg.textContent='Preencha o valor total, o vencimento e marque pelo menos uma unidade.';
      return;
    }
    const foto = fotoPendenteBoleto ? await enviarFoto(fotoPendenteBoleto.dataUrl) : null;
    const unidadesPayload = marcadas.map(uid=>({
      unidade_id: uid,
      valor: parseFloat(document.querySelector(`.valor-unidade-conjunta[data-unidade="${uid}"]`).value)||0
    }));
    try{
      await api('/boletos/conjunta', { method:'POST', body: JSON.stringify({
        descricao, vencimento, foto_url:foto, codigo_barras:codigoBarras||null, pix_copia_cola:pixCopiaCola||null,
        unidades: unidadesPayload
      }) });
      await recarregarBoletos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent=`Compra conjunta salva, dividida entre ${marcadas.length} unidade(s).`;
  }else{
    const valor=parseFloat(document.getElementById('fb-valor').value);
    const vencimento=document.getElementById('fb-vencimento').value;
    if(!valor || valor<=0 || !vencimento){
      msg.style.color='var(--saida)';
      msg.textContent='Preencha valor e vencimento.';
      return;
    }
    try{
      const fotoUrl = fotoPendenteBoleto ? await enviarFoto(fotoPendenteBoleto.dataUrl) : null;
      await api('/boletos', { method:'POST', body: JSON.stringify({
        unidade_id: unidadeAtual(), descricao, valor, vencimento,
        foto_url: fotoUrl,
        codigo_barras: codigoBarras||null, pix_copia_cola: pixCopiaCola||null
      }) });
      await recarregarBoletos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent='Boleto/nota salvo. Marque como pago quando o Pix for feito.';
  }

  document.getElementById('fb-descricao').value='';
  document.getElementById('fb-valor').value='';
  document.getElementById('fb-vencimento').value='';
  document.getElementById('fb-valor-total-conjunta').value='';
  document.getElementById('fb-vencimento-conjunta').value='';
  document.getElementById('fb-codigo-barras').value='';
  document.getElementById('fb-pix-copia-cola').value='';
  document.getElementById('fb-conjunta').checked=false;
  alternarCompraConjunta();
  removerFotoBoleto();
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharBoletos();
}

async function marcarBoletoPago(i){
  const b=BOLETOS[i];
  if(!await confirmarAcao(`Marcar "${b.descricao}" (${fmt(b.valor)}) como pago via Pix hoje?`)) return;
  try{
    await api('/boletos/'+b.id+'/marcar-pago', { method:'POST' });
  }catch(e){
    avisar(e.message);
    return;
  }
  // marcar como pago gera automaticamente a saída correspondente no caixa, do lado do servidor
  await Promise.all([recarregarBoletos(), recarregarLancamentos()]);
  desenhar();
}

function desenharBoletos(){
  const un=unidadeAtual();
  const podeExcluir = temPermissaoFinanceira(usuario,'excluir_boletos');
  document.getElementById('titulo-boletos').textContent='Boletos e notas de '+nomeUnidade(un);
  const lista=BOLETOS.filter(b=>b.unidade===un)
    .map((b,idxFiltro)=>({...b, indiceReal:BOLETOS.indexOf(b)}))
    .sort((a,b)=> a.status===b.status ? (a.vencimento<b.vencimento?-1:1) : (a.status==='pendente'?-1:1));

  document.getElementById('tab-boletos').innerHTML = lista.length ? lista.map(b=>{
    const atrasado = b.status==='pendente' && b.vencimento < hoje();
    const selo = b.status==='pago'
      ? '<span class="selo-status pago">Pago</span>'
      : atrasado ? '<span class="selo-status atrasado">Atrasado</span>' : '<span class="selo-status pendente">Pendente</span>';
    const legenda=`${b.descricao} · vencimento ${dataBr(b.vencimento)} · ${fmt(b.valor)}`;
    const outras = b.compraConjunta ? b.compraConjunta.unidades.filter(u=>u!==b.unidade).map(nomeUnidade) : [];
    const subConjunta = b.compraConjunta
      ? `<div class="sub-boleto">Compra conjunta de ${fmt(b.compraConjunta.valorTotalConjunto)}${outras.length?', dividida com '+outras.join(', '):''} — esta unidade paga só a parte dela.</div>`
      : '';
    const temCodigo = b.pixCopiaCola || b.codigoBarras;
    const colCodigo = temCodigo
      ? `<button class="btn-mini" onclick="copiarCodigoBoleto(${b.indiceReal})">${b.pixCopiaCola?'Copiar Pix':'Copiar código'}</button>`
      : '<span class="tracinho">—</span>';
    return `<tr>
      <td>${dataBr(b.vencimento)}</td>
      <td>${b.descricao}${subConjunta}</td>
      <td>${b.foto?`<img class="miniatura-tab" src="${b.foto}" alt="Boleto" onclick="abrirLightbox('${b.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td>${colCodigo}</td>
      <td class="n num">${fmt(b.valor)}</td>
      <td class="n">${selo}</td>
      <td class="n">${b.status==='pendente'?`<button class="btn-marcar-pago" onclick="marcarBoletoPago(${b.indiceReal})">Marcar como pago</button>`:'—'}
        ${podeExcluir?`<button class="btn-mini" onclick="excluirBoleto(${b.indiceReal})">Excluir</button>`:''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="vazio">Nenhum boleto ou nota cadastrado para esta unidade.</td></tr>';
}

async function excluirBoleto(i){
  if(!temPermissaoFinanceira(usuario,'excluir_boletos')){
    avisar('Você não tem permissão pra excluir boletos. Fale com o diretor.');
    return;
  }
  const b=BOLETOS[i];
  if(!b) return;
  const avisoPago = b.status==='pago' ? ' Esse boleto já foi pago — a saída lançada no caixa continua lá, só o registro do boleto some.' : '';
  if(!await confirmarAcao(`Excluir o boleto "${b.descricao}" (${fmt(b.valor)})? Essa ação não pode ser desfeita.${avisoPago}`)) return;
  try{
    await api('/boletos/'+b.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Boleto', `${b.descricao} — ${fmt(b.valor)} — ${b.status==='pago'?'já estava pago':'pendente'}`, b.unidade);
  await recarregarBoletos();
  desenharBoletos();
}

async function copiarCodigoBoleto(i){
  const b=BOLETOS[i];
  const texto = b.pixCopiaCola || b.codigoBarras;
  if(!texto) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(()=>{
      avisar((b.pixCopiaCola?'Código Pix':'Código de barras')+' copiado!');
    }).catch(async ()=>{
      await pedirValor('Copie manualmente:', texto);
    });
  }else{
    await pedirValor('Copie manualmente:', texto);
  }
}

/* =========== IMPOSTOS E ENERGIA =========== */
function prevejaFotoImposto(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto da guia ou da conta).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendenteImposto = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-imposto-img').src = fotoPendenteImposto.dataUrl;
    document.getElementById('previa-foto-imposto-nome').textContent = arq.name;
    document.getElementById('previa-foto-imposto').classList.remove('oculto');
    document.getElementById('previa-foto-imposto-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoImposto(){
  fotoPendenteImposto = null;
  document.getElementById('fi-foto').value='';
  document.getElementById('previa-foto-imposto').classList.add('oculto');
  document.getElementById('previa-foto-imposto-vazia').classList.remove('oculto');
}

function nomeTipoConta(t){
  return {imposto:'Imposto', energia:'Energia elétrica', agua:'Água', internet:'Internet/sistema', outra:'Outra conta fixa'}[t] || t;
}
function competenciaBr(c){
  if(!c) return '—';
  const [a,m]=c.split('-');
  const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return meses[parseInt(m,10)-1]+'/'+a;
}

async function salvarImposto(){
  const tipo=document.getElementById('fi-tipo').value;
  const competencia=document.getElementById('fi-competencia').value;
  const descricao=document.getElementById('fi-descricao').value.trim();
  const valor=parseFloat(document.getElementById('fi-valor').value);
  const vencimento=document.getElementById('fi-vencimento').value;
  const msg=document.getElementById('msg-imposto');

  if(!descricao || !valor || valor<=0 || !vencimento){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição, valor e vencimento.';
    return;
  }

  try{
    const fotoUrl = fotoPendenteImposto ? await enviarFoto(fotoPendenteImposto.dataUrl) : null;
    await api('/contas-fixas', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), tipo, competencia: competencia||null, descricao, valor, vencimento,
      foto_url: fotoUrl
    }) });
    await recarregarContasFixas();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fi-descricao').value='';
  document.getElementById('fi-valor').value='';
  document.getElementById('fi-vencimento').value='';
  document.getElementById('fi-competencia').value='';
  removerFotoImposto();
  msg.style.color='var(--entrada)';
  msg.textContent='Conta salva. Marque como paga quando fizer o pagamento.';
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharImpostos();
}

async function marcarImpostoPago(i){
  const c=CONTAS_FIXAS[i];
  if(!await confirmarAcao(`Marcar "${c.descricao}" (${fmt(c.valor)}) como paga hoje?`)) return;
  try{
    await api('/contas-fixas/'+c.id+'/marcar-pago', { method:'POST' });
  }catch(e){
    avisar(e.message);
    return;
  }
  await Promise.all([recarregarContasFixas(), recarregarLancamentos()]);
  desenhar();
}

function desenharImpostos(){
  const un=unidadeAtual();
  const podeExcluir = temPermissaoFinanceira(usuario,'excluir_boletos');
  document.getElementById('titulo-impostos').textContent='Contas de '+nomeUnidade(un);
  const lista=CONTAS_FIXAS.filter(c=>c.unidade===un)
    .map(c=>({...c, indiceReal:CONTAS_FIXAS.indexOf(c)}))
    .sort((a,b)=> a.status===b.status ? (a.vencimento<b.vencimento?-1:1) : (a.status==='pendente'?-1:1));

  document.getElementById('tab-impostos').innerHTML = lista.length ? lista.map(c=>{
    const atrasado = c.status==='pendente' && c.vencimento < hoje();
    const selo = c.status==='pago'
      ? '<span class="selo-status pago">Paga</span>'
      : atrasado ? '<span class="selo-status atrasado">Atrasada</span>' : '<span class="selo-status pendente">Pendente</span>';
    const legenda=`${nomeTipoConta(c.tipo)} · ${c.descricao} · ${fmt(c.valor)}`;
    return `<tr>
      <td>${competenciaBr(c.competencia)}</td>
      <td>${dataBr(c.vencimento)}</td>
      <td>${nomeTipoConta(c.tipo)}</td>
      <td>${c.descricao}</td>
      <td>${c.foto?`<img class="miniatura-tab" src="${c.foto}" alt="Conta" onclick="abrirLightbox('${c.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n num">${fmt(c.valor)}</td>
      <td class="n">${selo}</td>
      <td class="n">${c.status==='pendente'?`<button class="btn-marcar-pago" onclick="marcarImpostoPago(${c.indiceReal})">Marcar como paga</button>`:'—'}
        ${podeExcluir?`<button class="btn-mini" onclick="excluirContaFixa(${c.indiceReal})">Excluir</button>`:''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="vazio">Nenhuma conta cadastrada para esta unidade.</td></tr>';
}

async function excluirContaFixa(i){
  if(!temPermissaoFinanceira(usuario,'excluir_boletos')){
    avisar('Você não tem permissão pra excluir contas. Fale com o diretor.');
    return;
  }
  const c=CONTAS_FIXAS[i];
  if(!c) return;
  const avisoPago = c.status==='pago' ? ' Essa conta já foi paga — a saída lançada no caixa continua lá, só o registro da conta some.' : '';
  if(!await confirmarAcao(`Excluir "${c.descricao}" (${fmt(c.valor)})? Essa ação não pode ser desfeita.${avisoPago}`)) return;
  try{
    await api('/contas-fixas/'+c.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Imposto/Conta fixa', `${nomeTipoConta(c.tipo)} — ${c.descricao} — ${fmt(c.valor)} — ${c.status==='pago'?'já estava paga':'pendente'}`, c.unidade);
  await recarregarContasFixas();
  desenharImpostos();
}

/* =========== FUNCIONÁRIOS E FALTAS =========== */
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
  const f=FUNCIONARIOS.find(x=>x.id===id);
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
  const daUnidade=FUNCIONARIOS.filter(f=>f.unidade===un);
  sel.innerHTML = daUnidade.length
    ? daUnidade.map(f=>`<option value="${f.id}">${f.nome}</option>`).join('')
    : '<option value="">Cadastre um funcionário primeiro</option>';
}

function prevejaFotoAtestado(input){
  const arquivos=[...(input.files||[])];
  arquivos.forEach(arq=>{
    if(!arq.type.startsWith('image/')) return;
    const leitor = new FileReader();
    leitor.onload = e => {
      fotosPendentesAtestado.push({dataUrl:e.target.result, nome:arq.name});
      renderizarFotosPendentesAtestado();
    };
    leitor.readAsDataURL(arq);
  });
  input.value='';
}
function removerFotoAtestado(idx){
  fotosPendentesAtestado.splice(idx,1);
  renderizarFotosPendentesAtestado();
}
function renderizarFotosPendentesAtestado(){
  document.getElementById('fotos-pendentes-atestado').innerHTML = fotosPendentesAtestado.map((f,i)=>
    `<div class="foto-anexada"><img src="${f.dataUrl}" alt=""><button type="button" onclick="removerFotoAtestado(${i})">×</button></div>`
  ).join('');
  document.getElementById('previa-foto-atestado-vazia').classList.toggle('oculto', fotosPendentesAtestado.length>0);
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
  if(justificada && fotosPendentesAtestado.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Anexe o atestado ou comprovante — obrigatório pra marcar como justificada.';
    return;
  }

  try{
    await api('/faltas', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), funcionario_id: funcionarioId, data, motivo, justificada,
      fotos_url: await Promise.all(fotosPendentesAtestado.map(f=>enviarFoto(f.dataUrl)))
    }) });
    await recarregarFaltas();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('ffalta-motivo').value='';
  document.getElementById('ffalta-justificada').checked=false;
  fotosPendentesAtestado=[];
  renderizarFotosPendentesAtestado();
  atualizarRotuloAtestado();
  msg.style.color='var(--entrada)';
  msg.textContent='Falta registrada.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharFuncionarios();
}

async function excluirFalta(i){
  const fa=FALTAS[i];
  if(!fa) return;
  if(!await confirmarAcao('Excluir esse registro de falta?')) return;
  try{
    await api('/faltas/'+fa.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  const func=FUNCIONARIOS.find(x=>x.id===fa.funcionarioId);
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
  const equipe=FUNCIONARIOS.filter(f=>f.unidade===un);
  const faltasPeriodo=FALTAS.filter(f=>f.unidade===un && f.data>=desde);
  const justificadas=faltasPeriodo.filter(f=>f.justificada).length;
  const naoJustificadas=faltasPeriodo.length-justificadas;
  const trocasPeriodo=TROCAS.filter(t=>t.unidade===un && t.registradoEm>=desde);

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
    const func=FUNCIONARIOS.find(x=>x.id===f.funcionarioId);
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
  const equipe=FUNCIONARIOS.filter(f=>f.unidade===un);
  document.getElementById('tab-funcionarios').innerHTML = equipe.length ? equipe.map(f=>{
    const qtdFaltas=FALTAS.filter(fa=>fa.funcionarioId===f.id && fa.data>=desde).length;
    return `<tr>
      <td>${f.nome}</td>
      <td>${nomeCargo(f.cargo)}</td>
      <td>${f.telefone||'—'}</td>
      <td>${f.dataAdmissao?dataBr(f.dataAdmissao):'—'}</td>
      <td class="n ${qtdFaltas>0?'vermelho':''} num">${qtdFaltas}</td>
      <td class="n"><button class="btn-mini" onclick="excluirFuncionario('${f.id}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum funcionário cadastrado para esta unidade.</td></tr>';

  const faltasUnidade = FALTAS
    .map((fa,i)=>({...fa, indiceReal:i}))
    .filter(fa=>fa.unidade===un)
    .sort((a,b)=> a.data<b.data?1:-1);
  document.getElementById('tab-faltas').innerHTML = faltasUnidade.length ? faltasUnidade.map(fa=>{
    const f=FUNCIONARIOS.find(x=>x.id===fa.funcionarioId);
    const selo = fa.justificada
      ? '<span class="selo-status pago">Justificada</span>'
      : '<span class="selo-status atrasado">Não justificada</span>';
    const legenda=`Atestado · ${f?f.nome:''} · ${dataBr(fa.data)}`;
    return `<tr>
      <td>${dataBr(fa.data)}</td>
      <td>${f?f.nome:'(removido)'}</td>
      <td>${fa.motivo}</td>
      <td>${fa.fotos && fa.fotos.length ? fa.fotos.map(f=>`<img class="miniatura-tab" src="${f}" alt="Atestado" onclick="abrirLightbox('${f}','${legenda.replace(/'/g,"\\'")}')" style="margin-right:3px">`).join('') : '<span class="tracinho">—</span>'}</td>
      <td class="n">${selo}</td>
      <td class="n"><button class="btn-mini" onclick="excluirFalta(${fa.indiceReal})">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhuma falta registrada nesta unidade.</td></tr>';
}

/* =========== TROCA DE PLANTÃO =========== */
let fotoPendenteTroca = null;

function montarSelectsFuncionariosTroca(){
  const un=unidadeAtual();
  const equipe=FUNCIONARIOS.filter(f=>f.unidade===un);
  const opcoes = equipe.length
    ? equipe.map(f=>`<option value="${f.id}">${f.nome}</option>`).join('')
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
  const t=TROCAS.find(x=>x.id===id);
  if(!t) return;
  try{
    await api('/trocas/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  const f1=FUNCIONARIOS.find(x=>x.id===t.funcionario1Id), f2=FUNCIONARIOS.find(x=>x.id===t.funcionario2Id);
  registrarExclusao('Troca de plantão', `${f1?f1.nome:'—'} x ${f2?f2.nome:'—'} (${t.turno==='dia'?'Dia':'Noite'})`, t.unidade);
  await recarregarTrocas();
  desenharTrocas();
}

function desenharTrocas(){
  montarSelectsFuncionariosTroca();
  const un=unidadeAtual();
  const nomeFunc = id => { const f=FUNCIONARIOS.find(x=>x.id===id); return f?f.nome:'(removido)'; };

  const lista=TROCAS.filter(t=>t.unidade===un)
    .slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);

  document.getElementById('tab-trocas').innerHTML = lista.length ? lista.map(t=>{
    const legenda=`Troca · ${nomeFunc(t.funcionario1Id)} x ${nomeFunc(t.funcionario2Id)}`;
    return `<tr>
      <td><span class="selo ${t.turno}">${t.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${nomeFunc(t.funcionario1Id)}</td>
      <td>${dataBr(t.data1)}</td>
      <td>${nomeFunc(t.funcionario2Id)}</td>
      <td>${dataBr(t.data2)}</td>
      <td>${t.motivo}</td>
      <td>${t.foto?`<img class="miniatura-tab" src="${t.foto}" alt="Documento" onclick="abrirLightbox('${t.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td>${t.criadoPor}</td>
      <td class="n"><button class="btn-mini" onclick="excluirTroca('${t.id}')">Excluir</button></td>
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
    fotoPendenteVencido = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-vencido-img').src = fotoPendenteVencido.dataUrl;
    document.getElementById('previa-foto-vencido-nome').textContent = arq.name;
    document.getElementById('previa-foto-vencido').classList.remove('oculto');
    document.getElementById('previa-foto-vencido-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoVencido(){
  fotoPendenteVencido = null;
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
    const fotoUrl = fotoPendenteVencido ? await enviarFoto(fotoPendenteVencido.dataUrl) : null;
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
  const p=PRODUTOS_VENCIDOS.find(x=>x.id===id);
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
  const lista=PRODUTOS_VENCIDOS.filter(p=>p.unidade===un && p.registradoEm>=desde);
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
  const lista=PRODUTOS_VENCIDOS.filter(p=>p.unidade===un)
    .slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);

  document.getElementById('tab-vencidos').innerHTML = lista.length ? lista.map(p=>{
    const legenda=`${p.produto} · ${nomeMotivoVencido(p.motivoTipo)} · qtd ${p.quantidade}`;
    return `<tr>
      <td>${dataBr(p.registradoEm)}</td>
      <td>${p.produto}</td>
      <td><span class="selo-status ${p.motivoTipo}">${nomeMotivoVencido(p.motivoTipo)}</span></td>
      <td class="n num">${p.quantidade}</td>
      <td>${p.validade?dataBr(p.validade):'—'}</td>
      <td class="n num">${p.prejuizo?fmt(p.prejuizo):'—'}</td>
      <td>${p.foto?`<img class="miniatura-tab" src="${p.foto}" alt="Produto" onclick="abrirLightbox('${p.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n"><button class="btn-mini" onclick="excluirProdutoVencido('${p.id}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="vazio">Nenhum produto vencido registrado nesta unidade.</td></tr>';
}

/* =========== CONFIGURAÇÃO DE SUÍTES =========== */
function totalSuitesUnidade(un){
  return SUITES_CONFIG.filter(s=>s.unidade===un).reduce((s,c)=>s+c.quantidade,0);
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
  const s=SUITES_CONFIG.find(x=>x.id===id);
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

  const lista=SUITES_CONFIG.filter(s=>s.unidade===un);
  document.getElementById('tab-config-suites').innerHTML = lista.length ? lista.map(s=>`
    <tr>
      <td>${s.categoria}</td>
      <td class="n num">${s.quantidade}</td>
      <td class="n">${podeEditar?`<button class="btn-mini" onclick="excluirCategoriaSuite('${s.id}')">Excluir</button>`:'—'}</td>
    </tr>`).join('') : '<tr><td colspan="3" class="vazio">Nenhuma categoria cadastrada ainda.</td></tr>';

  const total=totalSuitesUnidade(un);
  document.getElementById('total-suites-unidade').textContent=total;
  montarLinhasCategoriaRevpar();
}

/* =========== REVPAR E TREVPAR (por categoria de suíte) =========== */
function calcularRevpar(receita, quartos, dias){
  return (quartos>0 && dias>0) ? receita/(quartos*dias) : 0;
}

function montarLinhasCategoriaRevpar(){
  const un=unidadeAtual();
  const categorias=SUITES_CONFIG.filter(s=>s.unidade===un);
  const cont=document.getElementById('linhas-categoria-revpar');
  if(!cont) return;
  cont.innerHTML = categorias.length ? categorias.map(c=>`
    <div class="form-linha" data-categoria-id="${c.id}">
      <div style="grid-column:span 2">
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
  const categorias=SUITES_CONFIG.filter(s=>s.unidade===un);
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
  const r=REVPAR_REGISTROS.find(x=>x.id===id);
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
  const registros=REVPAR_REGISTROS.filter(r=>r.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
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
    const registros=REVPAR_REGISTROS.filter(r=>r.unidade===id).sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
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
  const lista=REVPAR_REGISTROS.filter(r=>r.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-revpar').innerHTML = lista.length ? lista.map(r=>`
    <tr>
      <td>${dataBr(r.inicio)} a ${dataBr(r.fim)}</td>
      <td class="n num">${r.quantidadeTotal}</td>
      <td class="n num">${fmt(r.faturadoTotal)}</td>
      <td class="n neutro-forte num">${fmt(r.revparGeral)}</td>
      <td class="n neutro-forte num">${fmt(r.trevpar)}</td>
      <td class="n"><button class="btn-mini" onclick="excluirRevpar('${r.id}')">Excluir</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum período registrado ainda.</td></tr>';
}

/* =========== MANUTENÇÃO DE TERCEIROS =========== */
function nomeServicoManutencao(s){
  return {maquina_lavar:'Máquina de lavar', maquina_secar:'Máquina de secar', maquina_passar:'Máquina de passar',
    camera:'Câmera', banheira:'Banheira', ar_condicionado:'Ar condicionado', internet:'Internet', outros:'Outros'}[s] || s;
}

async function salvarManutencao(){
  const servico=document.getElementById('fm-servico').value;
  const suite=document.getElementById('fm-suite').value.trim();
  const especificacao=document.getElementById('fm-especificacao').value.trim();
  const prestador=document.getElementById('fm-prestador').value.trim();
  const msg=document.getElementById('msg-manutencao');

  if(!especificacao || !prestador){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha a especificação do serviço e o prestador.';
    return;
  }

  try{
    await api('/manutencao', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), servico, especificacao, prestador, suite: suite||null
    }) });
    await recarregarManutencoes();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fm-suite').value='';
  document.getElementById('fm-especificacao').value='';
  document.getElementById('fm-prestador').value='';
  msg.style.color='var(--entrada)';
  msg.textContent='Chamado registrado.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharManutencao();
}

async function excluirManutencao(id){
  if(!await confirmarAcao('Excluir esse chamado?')) return;
  const m=MANUTENCOES.find(x=>x.id===id);
  if(!m) return;
  try{
    await api('/manutencao/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Manutenção de terceiros', `${nomeServicoManutencao(m.servico)} — ${m.especificacao}${m.suite?' (suíte '+m.suite+')':''}`, m.unidade);
  await recarregarManutencoes();
  desenharManutencao();
}

// critério de alerta: mesmo serviço na mesma unidade — 2+ vezes em 30 dias (com ou sem suíte igual, mas destaca se a suíte bater também)
function calcularAlertasManutencao(un){
  const desde=diaMenos(29);
  const lista=MANUTENCOES.filter(m=>m.unidade===un && m.registradoEm>=desde);
  const grupos={};
  lista.forEach(m=>{
    const chave=m.servico+'|'+(m.suite||'sem-suite');
    (grupos[chave]=grupos[chave]||[]).push(m);
  });
  const alertas=[];
  Object.values(grupos).forEach(g=>{
    if(g.length>=2){
      alertas.push({
        servico:g[0].servico, suite:g[0].suite, quantidade:g.length,
        motivo:`${nomeServicoManutencao(g[0].servico)}${g[0].suite?' na suíte '+g[0].suite:''} chamado ${g.length} vezes nos últimos 30 dias — recomenda-se manutenção com prioridade.`
      });
    }
  });
  return alertas.sort((a,b)=>b.quantidade-a.quantidade);
}

function desenharDashboardManutencao(){
  const painel=document.getElementById('painel-dashboard-manutencao');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=MANUTENCOES.filter(m=>m.unidade===un && m.registradoEm>=desde);
  const suitesDistintas=new Set(lista.filter(m=>m.suite).map(m=>m.suite)).size;
  const alertas=calcularAlertasManutencao(un);

  document.getElementById('sub-dashboard-manutencao').textContent = `${nomeUnidade(un)} · últimos 30 dias`;
  document.getElementById('grade-stats-manutencao').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${lista.length}</div><div class="rotulo-stat">Chamados no período</div></div>
    <div class="stat-vistoria"><div class="num-stat">${suitesDistintas}</div><div class="rotulo-stat">Suítes distintas atendidas</div></div>
    <div class="stat-vistoria"><div class="num-stat ${alertas.length?'vermelho':''}">${alertas.length}</div><div class="rotulo-stat">Alertas de prioridade</div></div>
  `;

  const contagemServico={};
  lista.forEach(m=> contagemServico[nomeServicoManutencao(m.servico)]=(contagemServico[nomeServicoManutencao(m.servico)]||0)+1);
  const rankingServico=Object.entries(contagemServico).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('ranking-servico-manutencao').innerHTML = rankingServico.length
    ? barras(rankingServico.map(([nome,valor])=>({nome,valor})), rankingServico[0][1], 's', false)
    : '<div class="vazio">Nenhum chamado no período.</div>';

  const contagemSuite={};
  lista.filter(m=>m.suite).forEach(m=> contagemSuite[m.suite]=(contagemSuite[m.suite]||0)+1);
  const rankingSuite=Object.entries(contagemSuite).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('ranking-suite-manutencao').innerHTML = rankingSuite.length
    ? barras(rankingSuite.map(([nome,valor])=>({nome:'Suíte '+nome,valor})), rankingSuite[0][1], 's', false)
    : '<div class="vazio">Nenhum chamado em suíte no período.</div>';

  document.getElementById('alertas-manutencao').innerHTML = alertas.length
    ? alertas.map(a=>`<div class="alerta-item" style="cursor:default">
        <span class="selo-alerta atipico">Prioridade</span>
        <div class="alerta-corpo"><div class="alerta-titulo">${nomeServicoManutencao(a.servico)}${a.suite?' — Suíte '+a.suite:''}</div>
        <div class="alerta-motivo">${a.motivo}</div></div>
      </div>`).join('')
    : '<div class="vazio">Nenhum alerta de prioridade no momento.</div>';
}

function desenharManutencao(){
  desenharDashboardManutencao();
  const un=unidadeAtual();
  document.getElementById('titulo-manutencao').textContent='Chamados de '+nomeUnidade(un);
  const lista=MANUTENCOES.filter(m=>m.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-manutencao').innerHTML = lista.length ? lista.map(m=>`
    <tr>
      <td>${dataBr(m.registradoEm)}</td>
      <td>${nomeServicoManutencao(m.servico)}</td>
      <td>${m.especificacao}</td>
      <td>${m.prestador}</td>
      <td>${m.suite||'—'}</td>
      <td class="n"><button class="btn-mini" onclick="excluirManutencao('${m.id}')">Excluir</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum chamado registrado nesta unidade.</td></tr>';
}

/* =========== CONSUMO DO PLANTÃO =========== */
function ajustarQtdConsumo(delta){
  const campo=document.getElementById('fcp-quantidade');
  const atual=parseInt(campo.value,10)||1;
  campo.value=Math.max(1, atual+delta);
}

function adicionarItemConsumoPlantao(){
  const produto=document.getElementById('fcp-produto').value.trim();
  const quantidade=parseInt(document.getElementById('fcp-quantidade').value,10);
  const msg=document.getElementById('msg-consumo-plantao');

  if(!produto || !quantidade || quantidade<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Informe o produto e uma quantidade maior que zero.';
    return;
  }
  itensConsumoPendente.push({produto, quantidade});
  document.getElementById('fcp-produto').value='';
  document.getElementById('fcp-quantidade').value='1';
  document.getElementById('fcp-produto').focus();
  msg.textContent='';
  renderizarItensConsumoPendente();
}

function removerItemConsumoPendente(idx){
  itensConsumoPendente.splice(idx,1);
  renderizarItensConsumoPendente();
}

function renderizarItensConsumoPendente(){
  document.getElementById('lista-itens-consumo-pendente').innerHTML = itensConsumoPendente.map((it,i)=>`
    <div class="item-pendente">
      <span>${it.quantidade}x ${it.produto}</span>
      <button type="button" onclick="removerItemConsumoPendente(${i})">remover</button>
    </div>`).join('');
}

async function salvarConsumoPlantao(){
  const turno=document.getElementById('fcp-turno').value;
  const msg=document.getElementById('msg-consumo-plantao');

  if(!itensConsumoPendente.length){
    msg.style.color='var(--saida)';
    msg.textContent='Adicione pelo menos um item antes de salvar.';
    return;
  }

  try{
    await api('/consumo-plantao', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), turno, data: dataAtual(), itens: itensConsumoPendente
    }) });
    await recarregarConsumosPlantao();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  itensConsumoPendente=[];
  renderizarItensConsumoPendente();
  msg.style.color='var(--entrada)';
  msg.textContent='Registro do plantão salvo.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharConsumoPlantao();
}

async function excluirConsumoPlantao(id){
  if(!await confirmarAcao('Excluir esse registro?')) return;
  const c=CONSUMOS_PLANTAO.find(x=>x.id===id);
  if(!c) return;
  try{
    await api('/consumo-plantao/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Consumo do plantão', `${dataBr(c.data)} — ${c.itens.map(it=>`${it.quantidade}x ${it.produto}`).join(', ')}`, c.unidade);
  await recarregarConsumosPlantao();
  desenharConsumoPlantao();
}

function desenharDashboardConsumoPlantao(){
  const painel=document.getElementById('painel-dashboard-consumo-plantao');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=CONSUMOS_PLANTAO.filter(c=>c.unidade===un && c.registradoEm>=desde);
  const totalItens=lista.reduce((s,c)=>s+c.itens.reduce((s2,it)=>s2+it.quantidade,0),0);

  document.getElementById('sub-dashboard-consumo-plantao').textContent = `${nomeUnidade(un)} · últimos 30 dias`;
  document.getElementById('grade-stats-consumo-plantao').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${lista.length}</div><div class="rotulo-stat">Registros no período</div></div>
    <div class="stat-vistoria"><div class="num-stat">${totalItens}</div><div class="rotulo-stat">Itens consumidos (total)</div></div>
  `;

  const contagemProduto={};
  lista.forEach(c=> c.itens.forEach(it=>{
    contagemProduto[it.produto]=(contagemProduto[it.produto]||0)+it.quantidade;
  }));
  const ranking=Object.entries(contagemProduto).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('ranking-consumo-plantao').innerHTML = ranking.length
    ? barras(ranking.map(([nome,valor])=>({nome,valor})), ranking[0][1], 's', false)
    : '<div class="vazio">Nenhum consumo registrado no período.</div>';
}

function desenharConsumoPlantao(){
  desenharDashboardConsumoPlantao();
  const un=unidadeAtual();
  document.getElementById('titulo-consumo-plantao').textContent='Registros de '+nomeUnidade(un);
  const lista=CONSUMOS_PLANTAO.filter(c=>c.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-consumo-plantao').innerHTML = lista.length ? lista.map(c=>{
    const itensTxt=c.itens.map(it=>`${it.quantidade}x ${it.produto}`).join(', ');
    return `<tr>
      <td>${dataBr(c.data)}</td>
      <td><span class="selo ${c.turno}">${c.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${itensTxt}</td>
      <td>${c.criadoPor}</td>
      <td class="n"><button class="btn-mini" onclick="excluirConsumoPlantao('${c.id}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="vazio">Nenhum consumo registrado nesta unidade.</td></tr>';
}

/* =========== NOTAS FISCAIS (rateio administrativo) =========== */
function montarUnidadesNotaFiscal(){
  document.getElementById('fnf-unidades-valores').innerHTML = UNIDADES.map(u=>`
    <div class="linha-unidade-valor">
      <label><input type="checkbox" class="chk-unidade-nf" value="${u.id}" checked onchange="dividirValorNotaFiscal()"> ${u.nome}</label>
      <input type="number" class="valor-unidade-nf" data-unidade="${u.id}" min="0" step="0.01" placeholder="0,00">
    </div>`).join('');
  dividirValorNotaFiscal();
}
function dividirValorNotaFiscal(){
  const total=parseFloat(document.getElementById('fnf-valor-total').value)||0;
  const marcadas=[...document.querySelectorAll('.chk-unidade-nf:checked')];
  const valorCada = marcadas.length ? Math.round((total/marcadas.length)*100)/100 : 0;
  document.querySelectorAll('.valor-unidade-nf').forEach(inp=>{
    const chk=document.querySelector(`.chk-unidade-nf[value="${inp.dataset.unidade}"]`);
    inp.disabled = !chk.checked;
    if(chk.checked) inp.value=valorCada.toFixed(2);
  });
}

function prevejaFotoNotaFiscal(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){ avisar('Escolha um arquivo de imagem.'); input.value=''; return; }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendenteNotaFiscal = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-nf-img').src = fotoPendenteNotaFiscal.dataUrl;
    document.getElementById('previa-foto-nf-nome').textContent = arq.name;
    document.getElementById('previa-foto-nf').classList.remove('oculto');
    document.getElementById('previa-foto-nf-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoNotaFiscal(){
  fotoPendenteNotaFiscal = null;
  document.getElementById('fnf-foto').value='';
  document.getElementById('previa-foto-nf').classList.add('oculto');
  document.getElementById('previa-foto-nf-vazia').classList.remove('oculto');
}

async function salvarNotaFiscal(){
  const descricao=document.getElementById('fnf-descricao').value.trim();
  const valorTotal=parseFloat(document.getElementById('fnf-valor-total').value);
  const data=document.getElementById('fnf-data').value || hoje();
  const marcadas=[...document.querySelectorAll('.chk-unidade-nf:checked')].map(c=>c.value);
  const msg=document.getElementById('msg-nota-fiscal');

  if(!descricao || !valorTotal || valorTotal<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição e valor total.';
    return;
  }
  if(!marcadas.length){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma unidade pro rateio.';
    return;
  }

  const foto = fotoPendenteNotaFiscal ? await enviarFoto(fotoPendenteNotaFiscal.dataUrl) : null;
  const unidadesPayload = marcadas.map(uid=>({
    unidade_id: uid,
    valor: parseFloat(document.querySelector(`.valor-unidade-nf[data-unidade="${uid}"]`).value)||0
  }));

  try{
    await api('/notas-fiscais', { method:'POST', body: JSON.stringify({
      descricao, valor_total: valorTotal, data, foto_url: foto, unidades: unidadesPayload
    }) });
    await Promise.all([recarregarNotasFiscais(), recarregarLancamentos()]);
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fnf-descricao').value='';
  document.getElementById('fnf-valor-total').value='';
  document.getElementById('fnf-data').value='';
  removerFotoNotaFiscal();
  montarUnidadesNotaFiscal();
  msg.style.color='var(--entrada)';
  msg.textContent=`Nota lançada e dividida entre ${marcadas.length} unidade(s).`;
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharNotasFiscais();
  desenhar();
}

async function excluirNotaFiscal(id){
  if(!await confirmarAcao('Excluir essa nota fiscal? Isso remove os lançamentos gerados em todas as unidades.')) return;
  const n=NOTAS_FISCAIS.find(x=>x.id===id);
  if(!n) return;
  try{
    await api('/notas-fiscais/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Nota fiscal', `${n.descricao} — ${fmt(n.valorTotal)} (rateada entre ${n.unidades.length} unidade(s))`, null);
  await Promise.all([recarregarNotasFiscais(), recarregarLancamentos()]);
  desenharNotasFiscais();
  desenhar();
}

function desenharNotasFiscais(){
  const lista=NOTAS_FISCAIS.slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-notas-fiscais').innerHTML = lista.length ? lista.map(n=>{
    const legenda=`${n.descricao} · ${fmt(n.valorTotal)}`;
    const unidadesTxt=n.unidades.map(u=>`${nomeUnidade(u.unidade)} (${fmt(u.valor)})`).join(', ');
    return `<tr>
      <td>${dataBr(n.data)}</td>
      <td>${n.descricao}</td>
      <td class="n num">${fmt(n.valorTotal)}</td>
      <td>${unidadesTxt}</td>
      <td>${n.foto?`<img class="miniatura-tab" src="${n.foto}" alt="Nota" onclick="abrirLightbox('${n.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n"><button class="btn-mini" onclick="excluirNotaFiscal('${n.id}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhuma nota fiscal lançada ainda.</td></tr>';
}


function baixarPdfConsumoPlantao(){
  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=CONSUMOS_PLANTAO.filter(c=>c.unidade===un && c.registradoEm>=desde)
    .slice().sort((a,b)=> a.data<b.data?1:a.data>b.data?-1:0);

  const contagemProduto={};
  lista.forEach(c=> c.itens.forEach(it=>{
    contagemProduto[it.produto]=(contagemProduto[it.produto]||0)+it.quantidade;
  }));
  const ranking=Object.entries(contagemProduto).sort((a,b)=>b[1]-a[1]);
  const totalItens=lista.reduce((s,c)=>s+c.itens.reduce((s2,it)=>s2+it.quantidade,0),0);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Consumo do plantão — ${nomeUnidade(un)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#000;background:#fff;max-width:720px;margin:0 auto;padding:28px 20px;font-size:14px}
  h1{font-size:19px;margin:0 0 2px;color:#000}
  .sub{color:#000;font-size:12.5px;margin:0 0 20px}
  .destaque{background:#fff;color:#000;border:1.5px solid #000;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;gap:26px;flex-wrap:wrap}
  .destaque div span{display:block;font-size:11.5px;color:#000}
  .destaque div b{font-size:20px;color:#000}
  h2{font-size:14.5px;margin:22px 0 10px;border-bottom:2px solid #000;padding-bottom:5px;color:#000}
  table{width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:6px}
  th{text-align:left;color:#000;font-weight:600;font-size:11.5px;padding:0 8px 7px;border-bottom:1.5px solid #000}
  td{padding:9px 8px;border-bottom:1px solid #ccc;vertical-align:top;color:#000}
  tr:last-child td{border-bottom:0}
  .selo{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid #000;color:#000}
  .selo.dia{background:#fff}
  .selo.noite{background:#fff}
  .rodape{color:#000;font-size:11px;margin-top:26px;border-top:1px solid #000;padding-top:10px}
  @media print{ body{padding:0} }
</style></head>
<body>
  <h1>Consumo do plantão — ${nomeUnidade(un)}</h1>
  <p class="sub">Últimos 30 dias · gerado em ${dataBr(hoje())} por ${usuario.nome}</p>

  <div class="destaque">
    <div><span>Registros</span><b>${lista.length}</b></div>
    <div><span>Itens consumidos</span><b>${totalItens}</b></div>
    <div><span>Produtos distintos</span><b>${ranking.length}</b></div>
  </div>

  <h2>Produtos mais consumidos</h2>
  <table>
    <thead><tr><th>Produto</th><th style="text-align:right">Quantidade</th></tr></thead>
    <tbody>${ranking.length ? ranking.map(([nome,qtd])=>`<tr><td>${nome}</td><td style="text-align:right">${qtd}</td></tr>`).join('') : '<tr><td colspan="2">Sem dados.</td></tr>'}</tbody>
  </table>

  <h2>Registros do período</h2>
  <table>
    <thead><tr><th>Data</th><th>Turno</th><th>Itens</th><th>Registrado por</th></tr></thead>
    <tbody>${lista.length ? lista.map(c=>`
      <tr>
        <td>${dataBr(c.data)}</td>
        <td><span class="selo ${c.turno}">${c.turno==='dia'?'Dia':'Noite'}</span></td>
        <td>${c.itens.map(it=>`${it.quantidade}x ${it.produto}`).join(', ')}</td>
        <td>${c.criadoPor}</td>
      </tr>`).join('') : '<tr><td colspan="4">Nenhum registro no período.</td></tr>'}</tbody>
  </table>

  <p class="rodape">Gerado automaticamente pelo sistema de gestão A2 Pousada. Pra salvar como PDF, use Imprimir → Salvar como PDF.</p>
</body></html>`;

  const blob=new Blob([html], {type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`consumo-plantao-${un}-${hoje()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========== BOLETOS ADMINISTRATIVO (central, o diretor lança pras unidades) =========== */
function prevejaFotoBoletoAdmin(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem.');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    fotoPendenteBoletoAdmin = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-boleto-admin-img').src = fotoPendenteBoletoAdmin.dataUrl;
    document.getElementById('previa-foto-boleto-admin-nome').textContent = arq.name;
    document.getElementById('previa-foto-boleto-admin').classList.remove('oculto');
    document.getElementById('previa-foto-boleto-admin-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoBoletoAdmin(){
  fotoPendenteBoletoAdmin = null;
  document.getElementById('fba-foto').value='';
  document.getElementById('previa-foto-boleto-admin').classList.add('oculto');
  document.getElementById('previa-foto-boleto-admin-vazia').classList.remove('oculto');
}

async function salvarBoletoAdmin(){
  const descricao=document.getElementById('fba-descricao').value.trim();
  const valor=parseFloat(document.getElementById('fba-valor').value);
  const vencimento=document.getElementById('fba-vencimento').value;
  const codigoBarras=document.getElementById('fba-codigo-barras').value.trim();
  const pixCopiaCola=document.getElementById('fba-pix-copia-cola').value.trim();
  const msg=document.getElementById('msg-boleto-admin');

  if(!descricao || !valor || valor<=0 || !vencimento){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição, valor e vencimento.';
    return;
  }

  try{
    const fotoUrl = fotoPendenteBoletoAdmin ? await enviarFoto(fotoPendenteBoletoAdmin.dataUrl) : null;
    await api('/boletos-admin', { method:'POST', body: JSON.stringify({
      descricao, valor, vencimento,
      foto_url: fotoUrl,
      codigo_barras: codigoBarras||null, pix_copia_cola: pixCopiaCola||null
    }) });
    await recarregarBoletosAdmin();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fba-descricao').value='';
  document.getElementById('fba-valor').value='';
  document.getElementById('fba-vencimento').value='';
  document.getElementById('fba-codigo-barras').value='';
  document.getElementById('fba-pix-copia-cola').value='';
  removerFotoBoletoAdmin();
  msg.style.color='var(--entrada)';
  msg.textContent='Boleto central salvo. Agora é só lançar pras unidades quando quiser.';
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharBoletosAdmin();
}

async function excluirBoletoAdmin(id){
  if(!await confirmarAcao('Excluir esse boleto central?')) return;
  const b=BOLETOS_ADMIN.find(x=>x.id===id);
  if(!b) return;
  try{
    await api('/boletos-admin/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Boleto Administrativo', `${b.descricao} — ${fmt(b.valor)}`, null);
  await recarregarBoletosAdmin();
  desenharBoletosAdmin();
}

function iniciarLancamentoBoletoAdmin(id){
  const b=BOLETOS_ADMIN.find(x=>x.id===id);
  if(!b) return;
  boletoAdminEmLancamento=id;
  document.getElementById('nome-boleto-lancando').textContent=b.descricao;
  const todas=UNIDADES.map(u=>u.id);
  document.getElementById('unidades-lancar-boleto-admin').innerHTML = todas.map(uid=>`
    <div class="linha-unidade-valor">
      <label><input type="checkbox" class="chk-unidade-boleto-admin" value="${uid}" ${b.unidadesLancadas.includes(uid)?'disabled':'checked'} onchange="dividirValorBoletoAdmin()"> ${nomeUnidade(uid)}${b.unidadesLancadas.includes(uid)?' (já lançado)':''}</label>
      <input type="number" class="valor-unidade-boleto-admin" data-id="${uid}" min="0" step="0.01" ${b.unidadesLancadas.includes(uid)?'disabled':''}>
    </div>`).join('');
  dividirValorBoletoAdmin();
  document.getElementById('painel-lancar-boleto-admin').classList.remove('oculto');
  document.getElementById('painel-lancar-boleto-admin').scrollIntoView({behavior:'smooth',block:'start'});
}

function dividirValorBoletoAdmin(){
  const b=BOLETOS_ADMIN.find(x=>x.id===boletoAdminEmLancamento);
  if(!b) return;
  const marcadas=[...document.querySelectorAll('.chk-unidade-boleto-admin:checked')];
  const valorCada = marcadas.length ? Math.round((b.valor/marcadas.length)*100)/100 : 0;
  document.querySelectorAll('.valor-unidade-boleto-admin').forEach(inp=>{
    const chk=document.querySelector(`.chk-unidade-boleto-admin[value="${inp.dataset.id}"]`);
    if(chk.checked) inp.value=valorCada.toFixed(2);
  });
}

function cancelarLancamentoBoletoAdmin(){
  boletoAdminEmLancamento=null;
  document.getElementById('painel-lancar-boleto-admin').classList.add('oculto');
}

async function confirmarLancamentoBoletoAdmin(){
  const b=BOLETOS_ADMIN.find(x=>x.id===boletoAdminEmLancamento);
  const msg=document.getElementById('msg-lancar-boleto-admin');
  if(!b) return;
  const marcadas=[...document.querySelectorAll('.chk-unidade-boleto-admin:checked')].map(c=>c.value);
  if(!marcadas.length){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma unidade.';
    return;
  }
  const unidadesPayload = marcadas.map(uid=>({
    unidade_id: uid,
    valor: parseFloat(document.querySelector(`.valor-unidade-boleto-admin[data-id="${uid}"]`).value)||0
  }));
  try{
    await api('/boletos-admin/'+b.id+'/lancar', { method:'POST', body: JSON.stringify({ unidades: unidadesPayload }) });
    await Promise.all([recarregarBoletosAdmin(), recarregarBoletos()]);
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }
  cancelarLancamentoBoletoAdmin();
  desenharBoletosAdmin();
  desenharBoletos();
}

function desenharBoletosAdmin(){
  const lista=BOLETOS_ADMIN.slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-boletos-admin').innerHTML = lista.length ? lista.map(b=>{
    const legenda=`${b.descricao} · ${fmt(b.valor)}`;
    const rotuloStatus = {
      nao_lancado:'<span class="selo-status pendente">Não lançado</span>',
      lancado_parcial:'<span class="selo-status pendente">Lançado em parte</span>',
      lancado_completo:'<span class="selo-status pago">Lançado em todas</span>'
    }[b.status];
    return `<tr>
      <td>${dataBr(b.vencimento)}</td>
      <td>${b.descricao}${b.unidadesLancadas.length?`<div class="sub-boleto">Já lançado em: ${b.unidadesLancadas.map(nomeUnidade).join(', ')}</div>`:''}</td>
      <td class="n num">${fmt(b.valor)}</td>
      <td>${b.foto?`<img class="miniatura-tab" src="${b.foto}" alt="Boleto" onclick="abrirLightbox('${b.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td>${rotuloStatus}</td>
      <td class="n">
        ${b.status!=='lancado_completo'?`<button class="btn-marcar-pago" onclick="iniciarLancamentoBoletoAdmin('${b.id}')">Lançar</button>`:''}
        <button class="btn-mini" onclick="excluirBoletoAdmin('${b.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum boleto central cadastrado ainda.</td></tr>';
}


function intervaloRelatorio(){
  const sel=document.getElementById('sel-periodo-relatorio');
  const valor=sel?sel.value:'30';
  if(valor==='custom'){
    const de=document.getElementById('rel-de').value;
    const ate=document.getElementById('rel-ate').value;
    if(de && ate && de<=ate){
      const datas=[]; let d=new Date(de+'T12:00:00');
      const fimData=new Date(ate+'T12:00:00');
      while(d<=fimData){ datas.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
      return {inicio:de, fim:ate, dias:datas.length, datas:datas.reverse(), diario:datas.length===1};
    }
    // sem data válida ainda: usa hoje como fallback
    return {inicio:hoje(), fim:hoje(), dias:1, datas:[hoje()], diario:true};
  }
  const diasPreset=parseInt(valor,10)||30;
  const fim=hoje();
  const datas=[]; let d=new Date(fim+'T12:00:00');
  for(let i=0;i<diasPreset;i++){ datas.push(new Date(d).toISOString().slice(0,10)); d.setDate(d.getDate()-1); }
  return {inicio:datas[datas.length-1], fim, dias:diasPreset, datas, diario:diasPreset===1};
}

function mudarPeriodoRelatorio(){
  const sel=document.getElementById('sel-periodo-relatorio');
  const bloco=document.getElementById('bloco-periodo-personalizado');
  const custom=sel.value==='custom';
  bloco.classList.toggle('oculto', !custom);
  if(!custom){
    const {inicio,fim}=intervaloRelatorio();
    document.getElementById('rel-de').value=inicio;
    document.getElementById('rel-ate').value=fim;
  }
  desenharRelatorio();
}

function secoesRelatorioSelecionadas(){
  return [...document.querySelectorAll('.chk-secao-relatorio:checked')].map(c=>c.value);
}

function calcularDadosRelatorio(){
  const {inicio, fim, dias, datas} = intervaloRelatorio();

  const ids=unidadesDoUsuario();
  const movsPeriodo = LANCAMENTOS.filter(l=> ids.includes(l.unidade) && datas.includes(l.data));
  const totE=somar(movsPeriodo.filter(l=>l.tipo==='entrada'));
  const totS=somar(movsPeriodo.filter(l=>l.tipo==='saida'));

  const porUnidade = ids.map(id=>{
    const m=movsPeriodo.filter(l=>l.unidade===id);
    const e=somar(m.filter(l=>l.tipo==='entrada')), s=somar(m.filter(l=>l.tipo==='saida'));
    return {id, nome:nomeUnidade(id), e, s, saldo:e-s};
  }).sort((a,b)=>b.saldo-a.saldo);

  const porCategoria = SAIDAS.map(c=>({nome:c.nome, valor:somar(movsPeriodo.filter(l=>l.tipo==='saida'&&l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor).slice(0,5);

  const alertas = calcularAlertas();
  const vistoriasPeriodo = VISTORIAS.filter(v=> ids.includes(v.unidade) && datas.includes(v.data));
  const vistoriasComProblema = vistoriasPeriodo.filter(v=>v.itens.some(i=>i.status==='problema'));

  const faltasPeriodo = FALTAS.filter(f=> ids.includes(f.unidade) && datas.includes(f.data));
  const faltasJustificadas = faltasPeriodo.filter(f=>f.justificada).length;
  const faltasNaoJustificadas = faltasPeriodo.length - faltasJustificadas;
  const contagemFaltaPessoa={};
  faltasPeriodo.forEach(f=>{
    const func=FUNCIONARIOS.find(x=>x.id===f.funcionarioId);
    const nome=func?func.nome:'(removido)';
    contagemFaltaPessoa[nome]=(contagemFaltaPessoa[nome]||0)+1;
  });
  const rankingFaltas=Object.entries(contagemFaltaPessoa).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const trocasPeriodo = TROCAS.filter(t=> ids.includes(t.unidade) && datas.includes(t.registradoEm));
  const trocasDia = trocasPeriodo.filter(t=>t.turno==='dia').length;
  const trocasNoite = trocasPeriodo.filter(t=>t.turno==='noite').length;

  // detalhe linha a linha — só usado no relatório diário (dias===1), mas calculado sempre por ser barato
  const lancamentosDetalhados = movsPeriodo.slice().sort((a,b)=> a.unidade<b.unidade?-1:1);
  const boletosVencendo = BOLETOS.filter(b=> ids.includes(b.unidade) && b.status==='pendente' && datas.includes(b.vencimento));
  const contasVencendo = CONTAS_FIXAS.filter(c=> ids.includes(c.unidade) && c.status==='pendente' && datas.includes(c.vencimento));

  const produtosVencidosPeriodo = PRODUTOS_VENCIDOS.filter(p=> ids.includes(p.unidade) && datas.includes(p.registradoEm));
  const produtosVencidosPrejuizo = produtosVencidosPeriodo.reduce((s,p)=>s+p.prejuizo,0);
  const produtosVencidosItens = produtosVencidosPeriodo.reduce((s,p)=>s+p.quantidade,0);
  const contagemProdutoVencido={};
  produtosVencidosPeriodo.forEach(p=>{
    contagemProdutoVencido[p.produto]=(contagemProdutoVencido[p.produto]||0)+p.quantidade;
  });
  const rankingProdutosVencidos=Object.entries(contagemProdutoVencido).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // ranking de unidades por mais usos, e categoria de suíte com maior faturamento médio — usa o período mais recente de RevPAR de cada unidade
  const revparMaisRecentePorUnidade = ids.map(id=>{
    const registros=REVPAR_REGISTROS.filter(r=>r.unidade===id).sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
    return registros[0] ? {...registros[0], unidadeId:id} : null;
  }).filter(Boolean);

  const rankingUsosUnidade = revparMaisRecentePorUnidade
    .map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.usosTotal}))
    .sort((a,b)=>b.valor-a.valor);

  const somaFaturadoCategoria={}, contagemCategoriaUnidades={};
  revparMaisRecentePorUnidade.forEach(r=>{
    r.porCategoria.forEach(c=>{
      somaFaturadoCategoria[c.categoria]=(somaFaturadoCategoria[c.categoria]||0)+c.faturado;
      contagemCategoriaUnidades[c.categoria]=(contagemCategoriaUnidades[c.categoria]||0)+1;
    });
  });
  const rankingCategoriaFaturamentoMedio = Object.keys(somaFaturadoCategoria)
    .map(cat=>({nome:cat, valor:somaFaturadoCategoria[cat]/contagemCategoriaUnidades[cat]}))
    .sort((a,b)=>b.valor-a.valor);

  // ranking de avaliação de vistoria, separado por papel de quem vistoriou
  // fórmula: cada item "OK" = +1 ponto, cada item "problema" = -1 ponto
  // aproveitamento% = itens OK / total de itens avaliados — isso deixa justo comparar
  // vistoria completa (~40 itens) com vistoria rápida (9 itens)
  const porPessoaVistoria={};
  vistoriasPeriodo.forEach(v=>{
    const nome=v.feitoPor;
    if(!porPessoaVistoria[nome]) porPessoaVistoria[nome]={nome, vistorias:0, itensOk:0, itensProblema:0};
    porPessoaVistoria[nome].vistorias++;
    v.itens.forEach(i=>{
      if(i.status==='problema') porPessoaVistoria[nome].itensProblema++;
      else porPessoaVistoria[nome].itensOk++;
    });
  });
  const listaPessoasVistoria = Object.values(porPessoaVistoria).map(p=>{
    const totalItens=p.itensOk+p.itensProblema;
    return {
      ...p,
      pontos: p.itensOk - p.itensProblema,
      aproveitamento: totalItens ? Math.round((p.itensOk/totalItens)*1000)/10 : 0,
      papel: (USUARIOS.find(u=>u.nome===p.nome) || {}).papel || 'funcionario'
    };
  });
  const rankingVistoriaGerentes = listaPessoasVistoria.filter(p=>p.papel==='gerente' || p.papel==='admin')
    .sort((a,b)=> b.aproveitamento-a.aproveitamento || b.vistorias-a.vistorias);
  const rankingVistoriaFuncionarios = listaPessoasVistoria.filter(p=>p.papel==='funcionario' || p.papel==='inspetor')
    .sort((a,b)=> b.aproveitamento-a.aproveitamento || b.vistorias-a.vistorias);

  return {dias, inicio, fim, totE, totS, porUnidade, porCategoria, alertas, vistoriasPeriodo, vistoriasComProblema,
    faltasPeriodo, faltasJustificadas, faltasNaoJustificadas, rankingFaltas,
    trocasPeriodo, trocasDia, trocasNoite,
    lancamentosDetalhados, boletosVencendo, contasVencendo,
    produtosVencidosPeriodo, produtosVencidosPrejuizo, produtosVencidosItens, rankingProdutosVencidos,
    rankingUsosUnidade, rankingCategoriaFaturamentoMedio,
    rankingVistoriaGerentes, rankingVistoriaFuncionarios};
}

function desenharRelatorio(){
  const cont=document.getElementById('corpo-relatorio');
  if(!cont) return;
  const r=calcularDadosRelatorio();
  const saldo=r.totE-r.totS;
  const secoes=secoesRelatorioSelecionadas();
  const tem = s => secoes.includes(s);

  const blocoFaturamento = tem('faturamento') ? `
    <div class="painel" style="margin:16px 0">
      <h3>Saldo por unidade</h3>
      <table class="dados">
        <thead><tr><th>Unidade</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Saldo</th></tr></thead>
        <tbody>${r.porUnidade.map(u=>`<tr>
          <td>${u.nome}</td>
          <td class="n verde num">${fmt(u.e)}</td>
          <td class="n vermelho num">${fmt(u.s)}</td>
          <td class="n neutro-forte num">${fmt(u.saldo)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="painel" style="margin-bottom:16px">
      <h3>Maiores categorias de despesa</h3>
      ${r.porCategoria.length ? barras(r.porCategoria, r.porCategoria[0].valor, 's') : '<div class="vazio">Nenhuma despesa no período.</div>'}
    </div>` : '';

  const blocoFaltasTrocasVencidos = (tem('faltas')||tem('trocas')||tem('vencidos')) ? `
    <div class="grade">
      ${tem('faltas') ? `<div class="painel">
        <h3>Faltas da equipe</h3>
        <p class="secao-sub" style="margin:0 0 10px">${r.faltasPeriodo.length} falta(s) — ${r.faltasJustificadas} justificada(s), ${r.faltasNaoJustificadas} não justificada(s)</p>
        ${r.rankingFaltas.length
          ? barras(r.rankingFaltas.map(([nome,valor])=>({nome,valor})), r.rankingFaltas[0][1], 's', false)
          : '<div class="vazio">Nenhuma falta no período.</div>'}
      </div>` : ''}
      ${tem('trocas') ? `<div class="painel">
        <h3>Trocas de plantão</h3>
        <p class="secao-sub" style="margin:0 0 10px">${r.trocasPeriodo.length} troca(s) registrada(s) no período</p>
        <table class="dados">
          <tbody>
            <tr><td>Turno Dia</td><td class="n num">${r.trocasDia}</td></tr>
            <tr><td>Turno Noite</td><td class="n num">${r.trocasNoite}</td></tr>
            <tr><td class="neutro-forte">Total</td><td class="n neutro-forte num">${r.trocasPeriodo.length}</td></tr>
          </tbody>
        </table>
      </div>` : ''}
      ${tem('vencidos') ? `<div class="painel">
        <h3>Produtos vencidos</h3>
        <p class="secao-sub" style="margin:0 0 10px">${r.produtosVencidosPeriodo.length} registro(s) — ${r.produtosVencidosItens} item(ns) — prejuízo de ${fmt(r.produtosVencidosPrejuizo)}</p>
        ${r.rankingProdutosVencidos.length
          ? barras(r.rankingProdutosVencidos.map(([nome,valor])=>({nome,valor})), r.rankingProdutosVencidos[0][1], 's', false)
          : '<div class="vazio">Nenhum produto vencido no período.</div>'}
      </div>` : ''}
    </div>` : '';

  const blocoRevpar = tem('revpar') ? `
    <div class="grade" style="margin-bottom:16px">
      <div class="painel">
        <h3>Ranking — unidades com mais usos</h3>
        <p class="secao-sub" style="margin:0 0 10px">Do período de RevPAR mais recente de cada unidade</p>
        ${r.rankingUsosUnidade.length
          ? barras(r.rankingUsosUnidade, Math.max(...r.rankingUsosUnidade.map(d=>d.valor),1), 'e', false)
          : '<div class="vazio">Nenhum RevPAR registrado ainda.</div>'}
      </div>
      <div class="painel">
        <h3>Categoria com maior faturamento médio</h3>
        <p class="secao-sub" style="margin:0 0 10px">Média entre as unidades que têm essa categoria cadastrada</p>
        ${r.rankingCategoriaFaturamentoMedio.length
          ? barras(r.rankingCategoriaFaturamentoMedio, Math.max(...r.rankingCategoriaFaturamentoMedio.map(d=>d.valor),1), 'e')
          : '<div class="vazio">Nenhum RevPAR registrado ainda.</div>'}
      </div>
    </div>` : '';

  const linhaRankingVistoria = p => `<tr>
      <td>${p.nome}</td>
      <td class="n num">${p.vistorias}</td>
      <td class="n verde num">${p.itensOk}</td>
      <td class="n vermelho num">${p.itensProblema}</td>
      <td class="n num">${p.aproveitamento}%</td>
      <td class="n neutro-forte num">${p.pontos}</td>
    </tr>`;
  const cabecalhoRankingVistoria = `<thead><tr>
      <th>Nome</th><th class="n">Vistorias</th><th class="n">Itens OK</th>
      <th class="n">Itens problema</th><th class="n">Aproveitamento</th><th class="n">Pontos</th>
    </tr></thead>`;
  const blocoRankingVistoria = tem('vistorias') ? `
    <h3 style="margin:20px 0 10px">Ranking de avaliação de vistoria</h3>
    <p class="secao-sub" style="margin:0 0 10px">Fórmula: cada item "OK" soma 1 ponto, cada item "problema" tira 1 ponto. Aproveitamento = itens OK ÷ total de itens avaliados.</p>
    <div class="grade" style="margin-bottom:16px">
      <div class="painel">
        <h3>Gerentes</h3>
        <table class="dados">${cabecalhoRankingVistoria}
          <tbody>${r.rankingVistoriaGerentes.length ? r.rankingVistoriaGerentes.map(linhaRankingVistoria).join('') : '<tr><td colspan="6" class="vazio">Nenhuma vistoria de gerente no período.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="painel">
        <h3>Funcionários</h3>
        <table class="dados">${cabecalhoRankingVistoria}
          <tbody>${r.rankingVistoriaFuncionarios.length ? r.rankingVistoriaFuncionarios.map(linhaRankingVistoria).join('') : '<tr><td colspan="6" class="vazio">Nenhuma vistoria de funcionário no período.</td></tr>'}</tbody>
        </table>
      </div>
    </div>` : '';

  const blocoDetalheDiario = r.dias===1 ? `
    <h3 style="margin:20px 0 10px">Detalhe completo do dia — ${dataBr(r.fim)}</h3>

    ${tem('faturamento') ? `<div class="painel" style="margin-bottom:16px">
      <h3>Lançamentos do dia (${r.lancamentosDetalhados.length})</h3>
      <table class="dados">
        <thead><tr><th>Unidade</th><th>Turno</th><th>Categoria</th><th>Descrição</th><th class="n">Valor</th></tr></thead>
        <tbody>${r.lancamentosDetalhados.length ? r.lancamentosDetalhados.map(l=>`
          <tr>
            <td>${nomeUnidade(l.unidade)}</td>
            <td><span class="selo ${l.turno}">${l.turno==='dia'?'Dia':'Noite'}</span></td>
            <td>${nomeCategoria(l.categoria)}</td>
            <td>${l.obs||'—'}</td>
            <td class="n num ${l.tipo==='entrada'?'verde':'vermelho'}">${l.tipo==='saida'?'−':''}${fmt(l.valor)}</td>
          </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhum lançamento hoje.</td></tr>'}</tbody>
      </table>
    </div>` : ''}

    ${(tem('vistorias')||tem('faltas')||tem('trocas')) ? `<div class="grade" style="margin-bottom:16px">
      ${tem('vistorias') ? `<div class="painel">
        <h3>Vistorias do dia (${r.vistoriasPeriodo.length})</h3>
        ${r.vistoriasPeriodo.length ? `<table class="dados">
          <thead><tr><th>Unidade</th><th>Suíte</th><th>Turno</th><th>Feita por</th><th class="n">Status</th></tr></thead>
          <tbody>${r.vistoriasPeriodo.map(v=>{
            const problemas=v.itens.filter(i=>i.status==='problema').length;
            return `<tr>
              <td>${nomeUnidade(v.unidade)}</td><td>${v.suite}</td>
              <td><span class="selo ${v.turno}">${v.turno==='dia'?'Dia':'Noite'}</span></td>
              <td>${v.feitoPor}</td>
              <td class="n">${problemas?`<span class="selo-status atrasado">${problemas} problema(s)</span>`:'<span class="selo-status pago">OK</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : '<div class="vazio">Nenhuma vistoria hoje.</div>'}
      </div>` : ''}
      ${(tem('faltas')||tem('trocas')) ? `<div class="painel">
        <h3>Faltas e trocas do dia</h3>
        ${tem('faltas') ? (r.faltasPeriodo.length ? r.faltasPeriodo.map(f=>{
          const func=FUNCIONARIOS.find(x=>x.id===f.funcionarioId);
          return `<div class="sub-boleto" style="margin-bottom:6px">Falta: <strong>${func?func.nome:'(removido)'}</strong> — ${f.motivo} (${f.justificada?'justificada':'não justificada'})</div>`;
        }).join('') : '<div class="vazio">Nenhuma falta hoje.</div>') : ''}
        ${tem('trocas') ? (r.trocasPeriodo.length ? r.trocasPeriodo.map(t=>{
          const f1=FUNCIONARIOS.find(x=>x.id===t.funcionario1Id), f2=FUNCIONARIOS.find(x=>x.id===t.funcionario2Id);
          return `<div class="sub-boleto" style="margin-bottom:6px">Troca (${t.turno==='dia'?'Dia':'Noite'}): <strong>${f1?f1.nome:'—'}</strong> x <strong>${f2?f2.nome:'—'}</strong> — ${t.motivo}</div>`;
        }).join('') : '<div class="vazio">Nenhuma troca hoje.</div>') : ''}
      </div>` : ''}
    </div>` : ''}

    ${tem('vencidos') ? `<div class="painel" style="margin-bottom:16px">
      <h3>Produtos vencidos hoje (${r.produtosVencidosPeriodo.length})</h3>
      ${r.produtosVencidosPeriodo.length ? `<table class="dados">
        <thead><tr><th>Unidade</th><th>Produto</th><th>Motivo</th><th class="n">Qtd</th><th class="n">Prejuízo</th></tr></thead>
        <tbody>${r.produtosVencidosPeriodo.map(p=>`
          <tr>
            <td>${nomeUnidade(p.unidade)}</td>
            <td>${p.produto}</td>
            <td><span class="selo-status ${p.motivoTipo}">${nomeMotivoVencido(p.motivoTipo)}</span></td>
            <td class="n num">${p.quantidade}</td>
            <td class="n num">${p.prejuizo?fmt(p.prejuizo):'—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="vazio">Nenhum produto vencido hoje.</div>'}
    </div>` : ''}

    ${tem('faturamento') ? `<div class="painel">
      <h3>Boletos e contas vencendo hoje</h3>
      ${(r.boletosVencendo.length + r.contasVencendo.length) ? `<table class="dados">
        <thead><tr><th>Unidade</th><th>Descrição</th><th class="n">Valor</th></tr></thead>
        <tbody>
          ${r.boletosVencendo.map(b=>`<tr><td>${nomeUnidade(b.unidade)}</td><td>${b.descricao}</td><td class="n num">${fmt(b.valor)}</td></tr>`).join('')}
          ${r.contasVencendo.map(c=>`<tr><td>${nomeUnidade(c.unidade)}</td><td>${nomeTipoConta(c.tipo)} — ${c.descricao}</td><td class="n num">${fmt(c.valor)}</td></tr>`).join('')}
        </tbody>
      </table>` : '<div class="vazio">Nada vencendo hoje.</div>'}
    </div>` : ''}` : '';

  cont.innerHTML = `
    <div class="destaque">
      <div class="rotulo">Saldo da rede · ${r.dias===1 ? 'hoje, '+dataBr(r.fim) : dataBr(r.inicio)+' a '+dataBr(r.fim)}</div>
      <div class="valorao num ${saldo>=0?'positivo':'negativo'}">${fmt(saldo)}</div>
      <div class="apoio">
        <div><span>Entradas</span><strong class="num verde">${fmt(r.totE)}</strong></div>
        <div><span>Saídas</span><strong class="num vermelho">${fmt(r.totS)}</strong></div>
        <div><span>Alertas ativos</span><strong class="num">${r.alertas.length}</strong></div>
        <div><span>Vistorias c/ problema</span><strong class="num">${r.vistoriasComProblema.length} de ${r.vistoriasPeriodo.length}</strong></div>
      </div>
    </div>
    ${blocoFaturamento}
    ${blocoFaltasTrocasVencidos}
    ${blocoRevpar}
    ${blocoRankingVistoria}
    ${blocoDetalheDiario}
  `;
}

function baixarRelatorioResumido(){
  const r=calcularDadosRelatorio();
  const saldo=r.totE-r.totS;
  const secoes=secoesRelatorioSelecionadas();
  const tem = s => secoes.includes(s);
  const tituloPeriodo = r.dias===1 ? 'Diário — '+dataBr(r.fim) : dataBr(r.inicio)+' a '+dataBr(r.fim);

  const linhaMini = (rotulo,valor,cor='') => `<div class="mi"><span>${rotulo}</span><strong class="${cor}">${valor}</strong></div>`;
  const listaMini = (itens, formatarValor) => itens.length
    ? '<ul class="lm">'+itens.map(i=>`<li><span>${i.nome}</span><b>${formatarValor(i.valor)}</b></li>`).join('')+'</ul>'
    : '<p class="vz">Sem dados no período.</p>';

  const blocoFaturamento = tem('faturamento') ? `
    <section>
      <h2>Faturamento por unidade</h2>
      <table><thead><tr><th>Unidade</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>
      <tbody>${r.porUnidade.map(u=>`<tr><td>${u.nome}</td><td class="v">${fmt(u.e)}</td><td class="r">${fmt(u.s)}</td><td class="v b">${fmt(u.saldo)}</td></tr>`).join('')}</tbody></table>
      ${r.porCategoria.length ? `<h3>Maiores despesas</h3>${listaMini(r.porCategoria, fmt)}` : ''}
    </section>` : '';

  const blocoRevpar = tem('revpar') ? `
    <section>
      <h2>RevPAR — unidades com mais usos</h2>
      ${listaMini(r.rankingUsosUnidade, v=>v+' usos')}
      <h3>Categoria com maior faturamento médio</h3>
      ${listaMini(r.rankingCategoriaFaturamentoMedio, fmt)}
    </section>` : '';

  const linhaMiniRankingVistoria = p => `<li><span>${p.nome} (${p.vistorias} vistoria(s))</span><b>${p.aproveitamento}% · ${p.pontos} pts</b></li>`;
  const blocoRankingVistoria = tem('vistorias') ? `
    <section>
      <h2>Ranking de avaliação de vistoria</h2>
      <h3>Gerentes</h3>
      ${r.rankingVistoriaGerentes.length ? '<ul class="lm">'+r.rankingVistoriaGerentes.map(linhaMiniRankingVistoria).join('')+'</ul>' : '<p class="vz">Sem dados no período.</p>'}
      <h3>Funcionários</h3>
      ${r.rankingVistoriaFuncionarios.length ? '<ul class="lm">'+r.rankingVistoriaFuncionarios.map(linhaMiniRankingVistoria).join('')+'</ul>' : '<p class="vz">Sem dados no período.</p>'}
    </section>` : '';

  const blocoFaltas = tem('faltas') ? `
    <section>
      <h2>Faltas</h2>
      <p class="mut">${r.faltasPeriodo.length} falta(s) — ${r.faltasJustificadas} justificada(s), ${r.faltasNaoJustificadas} não justificada(s)</p>
      ${listaMini(r.rankingFaltas.map(([nome,valor])=>({nome,valor})), v=>v+'x')}
    </section>` : '';

  const blocoTrocas = tem('trocas') ? `
    <section>
      <h2>Trocas de plantão</h2>
      <p class="mut">${r.trocasPeriodo.length} registrada(s) — ${r.trocasDia} de turno Dia, ${r.trocasNoite} de turno Noite</p>
    </section>` : '';

  const blocoVencidos = tem('vencidos') ? `
    <section>
      <h2>Produtos vencidos</h2>
      <p class="mut">${r.produtosVencidosPeriodo.length} registro(s) — ${r.produtosVencidosItens} item(ns) — prejuízo de ${fmt(r.produtosVencidosPrejuizo)}</p>
      ${listaMini(r.rankingProdutosVencidos.map(([nome,valor])=>({nome,valor})), v=>v+'x')}
    </section>` : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório resumido — ${tituloPeriodo}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#000;background:#fff;max-width:720px;margin:0 auto;padding:28px 20px;font-size:13.5px}
  h1{font-size:19px;margin:0 0 2px;color:#000}
  .sub{color:#000;font-size:12.5px;margin:0 0 20px}
  .destaque{background:#fff;color:#000;border:1.5px solid #000;border-radius:8px;padding:18px 20px;margin-bottom:18px}
  .destaque .rot{font-size:12px;color:#000}
  .destaque .val{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:2px 0 10px;color:#000}
  .destaque .grid{display:flex;gap:22px;flex-wrap:wrap;font-size:12.5px;color:#000}
  .destaque .grid b{display:block;font-size:15px;color:#000}
  section{margin-bottom:18px;page-break-inside:avoid}
  h2{font-size:14px;margin:0 0 8px;border-bottom:2px solid #000;padding-bottom:4px;color:#000}
  h3{font-size:12.5px;color:#000;margin:10px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;color:#000;font-weight:600;font-size:11.5px;padding:0 6px 5px;border-bottom:1.5px solid #000}
  td{padding:5px 6px;border-bottom:1px solid #ccc;color:#000}
  td.v{color:#000}
  td.r{color:#000}
  td.b{font-weight:700}
  ul.lm{list-style:none;margin:0;padding:0}
  ul.lm li{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ccc;font-size:12.5px;color:#000}
  .mi{display:inline-block;margin-right:18px}
  .mut{color:#000;font-size:12px;margin:0 0 6px}
  .vz{color:#000;font-size:12px;font-style:italic;margin:0}
  .rodape{color:#000;font-size:11px;margin-top:24px;border-top:1px solid #000;padding-top:10px}
  @media print{ body{padding:0} }
</style></head>
<body>
  <h1>Relatório resumido — Rede A2</h1>
  <p class="sub">${tituloPeriodo} · gerado em ${dataBr(hoje())} por ${usuario.nome}</p>

  <div class="destaque">
    <div class="rot">Saldo da rede</div>
    <div class="val">${fmt(saldo)}</div>
    <div class="grid">
      <div><span>Entradas</span><b>${fmt(r.totE)}</b></div>
      <div><span>Saídas</span><b>${fmt(r.totS)}</b></div>
      <div><span>Alertas ativos</span><b>${r.alertas.length}</b></div>
      <div><span>Vistorias c/ problema</span><b>${r.vistoriasComProblema.length} de ${r.vistoriasPeriodo.length}</b></div>
    </div>
  </div>

  ${blocoFaturamento}
  ${blocoRevpar}
  ${blocoRankingVistoria}
  ${blocoFaltas}
  ${blocoTrocas}
  ${blocoVencidos}

  <p class="rodape">Gerado automaticamente pelo sistema de gestão A2 Pousada. Pra salvar como PDF, use Imprimir → Salvar como PDF.</p>
</body></html>`;

  const blob=new Blob([html], {type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`relatorio-resumido-A2-${r.fim}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copiarRelatorio(){
  const r=calcularDadosRelatorio();
  const saldo=r.totE-r.totS;
  const linhas=[];
  const secoes=secoesRelatorioSelecionadas();
  const tem = s => secoes.includes(s);

  linhas.push(r.dias===1 ? `RELATÓRIO DIÁRIO COMPLETO — ${dataBr(r.fim)}` : `RELATÓRIO DA REDE — ${dataBr(r.inicio)} a ${dataBr(r.fim)}`);
  linhas.push('');
  linhas.push(`Saldo geral: ${fmt(saldo)}`);
  linhas.push(`Entradas: ${fmt(r.totE)}  |  Saídas: ${fmt(r.totS)}`);
  linhas.push(`Alertas ativos: ${r.alertas.length}  |  Vistorias com problema: ${r.vistoriasComProblema.length} de ${r.vistoriasPeriodo.length}`);

  if(tem('faturamento')){
    linhas.push('');
    linhas.push('Por unidade:');
    r.porUnidade.forEach(u=> linhas.push(`  ${u.nome} — entradas ${fmt(u.e)}, saídas ${fmt(u.s)}, saldo ${fmt(u.saldo)}`));
    if(r.porCategoria.length){
      linhas.push('');
      linhas.push('Maiores despesas:');
      r.porCategoria.forEach(c=> linhas.push(`  ${c.nome}: ${fmt(c.valor)}`));
    }
  }
  if(tem('faltas')){
    linhas.push('');
    linhas.push(`Faltas: ${r.faltasPeriodo.length} (${r.faltasJustificadas} justificada(s), ${r.faltasNaoJustificadas} não justificada(s))`);
    if(r.rankingFaltas.length){
      r.rankingFaltas.forEach(([nome,qtd])=> linhas.push(`  ${nome}: ${qtd} falta(s)`));
    }
  }
  if(tem('trocas')){
    linhas.push('');
    linhas.push(`Trocas de plantão: ${r.trocasPeriodo.length} registrada(s) — ${r.trocasDia} de turno Dia, ${r.trocasNoite} de turno Noite`);
  }
  if(tem('vencidos')){
    linhas.push('');
    linhas.push(`Produtos vencidos: ${r.produtosVencidosPeriodo.length} registro(s), ${r.produtosVencidosItens} item(ns), prejuízo de ${fmt(r.produtosVencidosPrejuizo)}`);
    if(r.rankingProdutosVencidos.length){
      r.rankingProdutosVencidos.forEach(([nome,qtd])=> linhas.push(`  ${nome}: ${qtd} unidade(s)`));
    }
  }
  if(tem('revpar')){
  linhas.push('');
  linhas.push('Ranking — unidades com mais usos:');
  if(r.rankingUsosUnidade.length){
    r.rankingUsosUnidade.forEach(u=> linhas.push(`  ${u.nome}: ${u.valor} uso(s)`));
  }else{
    linhas.push('  Nenhum RevPAR registrado ainda.');
  }
  linhas.push('');
  linhas.push('Categoria com maior faturamento médio:');
  if(r.rankingCategoriaFaturamentoMedio.length){
    r.rankingCategoriaFaturamentoMedio.forEach(c=> linhas.push(`  ${c.nome}: ${fmt(c.valor)}`));
  }else{
    linhas.push('  Nenhum RevPAR registrado ainda.');
  }
  }

  if(tem('vistorias')){
    linhas.push('');
    linhas.push('Ranking de avaliação de vistoria — Gerentes:');
    if(r.rankingVistoriaGerentes.length){
      r.rankingVistoriaGerentes.forEach(p=> linhas.push(`  ${p.nome}: ${p.vistorias} vistoria(s), ${p.aproveitamento}% de aproveitamento, ${p.pontos} pontos`));
    }else{
      linhas.push('  Sem dados no período.');
    }
    linhas.push('');
    linhas.push('Ranking de avaliação de vistoria — Funcionários:');
    if(r.rankingVistoriaFuncionarios.length){
      r.rankingVistoriaFuncionarios.forEach(p=> linhas.push(`  ${p.nome}: ${p.vistorias} vistoria(s), ${p.aproveitamento}% de aproveitamento, ${p.pontos} pontos`));
    }else{
      linhas.push('  Sem dados no período.');
    }
  }

  if(r.dias===1){
    if(tem('faturamento')){
      linhas.push('');
      linhas.push(`--- LANÇAMENTOS DO DIA (${r.lancamentosDetalhados.length}) ---`);
      r.lancamentosDetalhados.forEach(l=>
        linhas.push(`  ${nomeUnidade(l.unidade)} · ${l.turno==='dia'?'Dia':'Noite'} · ${nomeCategoria(l.categoria)} · ${l.obs||'—'} · ${l.tipo==='saida'?'-':''}${fmt(l.valor)}`));
    }

    if(tem('vistorias')){
      linhas.push('');
      linhas.push(`--- VISTORIAS DO DIA (${r.vistoriasPeriodo.length}) ---`);
      r.vistoriasPeriodo.forEach(v=>{
        const problemas=v.itens.filter(i=>i.status==='problema').length;
        linhas.push(`  ${nomeUnidade(v.unidade)} · Suíte ${v.suite} · ${v.turno==='dia'?'Dia':'Noite'} · ${v.feitoPor} · ${problemas?problemas+' problema(s)':'OK'}`);
      });
    }

    if(tem('faltas') && r.faltasPeriodo.length){
      linhas.push('');
      linhas.push('--- FALTAS DO DIA ---');
      r.faltasPeriodo.forEach(f=>{
        const func=FUNCIONARIOS.find(x=>x.id===f.funcionarioId);
        linhas.push(`  ${func?func.nome:'(removido)'} — ${f.motivo} (${f.justificada?'justificada':'não justificada'})`);
      });
    }

    if(tem('trocas') && r.trocasPeriodo.length){
      linhas.push('');
      linhas.push('--- TROCAS DO DIA ---');
      r.trocasPeriodo.forEach(t=>{
        const f1=FUNCIONARIOS.find(x=>x.id===t.funcionario1Id), f2=FUNCIONARIOS.find(x=>x.id===t.funcionario2Id);
        linhas.push(`  ${t.turno==='dia'?'Dia':'Noite'}: ${f1?f1.nome:'—'} x ${f2?f2.nome:'—'} — ${t.motivo}`);
      });
    }

    if(tem('vencidos') && r.produtosVencidosPeriodo.length){
      linhas.push('');
      linhas.push('--- PRODUTOS VENCIDOS HOJE ---');
      r.produtosVencidosPeriodo.forEach(p=>
        linhas.push(`  ${nomeUnidade(p.unidade)} · ${p.produto} · ${nomeMotivoVencido(p.motivoTipo)} · qtd ${p.quantidade}${p.prejuizo?' · '+fmt(p.prejuizo):''}`));
    }

    if(tem('faturamento') && (r.boletosVencendo.length || r.contasVencendo.length)){
      linhas.push('');
      linhas.push('--- VENCENDO HOJE ---');
      r.boletosVencendo.forEach(b=> linhas.push(`  ${nomeUnidade(b.unidade)} · ${b.descricao} · ${fmt(b.valor)}`));
      r.contasVencendo.forEach(c=> linhas.push(`  ${nomeUnidade(c.unidade)} · ${nomeTipoConta(c.tipo)} — ${c.descricao} · ${fmt(c.valor)}`));
    }
  }

  const texto=linhas.join('\n');
  const msg=document.getElementById('msg-relatorio-copia');

  const avisar=(ok)=>{
    if(!msg) return;
    msg.style.color = ok ? 'var(--entrada)' : 'var(--saida)';
    msg.textContent = ok ? 'Relatório copiado!' : 'Não deu pra copiar automático — veja o texto na caixa que abriu.';
    setTimeout(()=>{ msg.textContent=''; },4000);
  };

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(()=>avisar(true)).catch(async ()=>{
      await pedirValor('Copie manualmente:', texto);
      avisar(false);
    });
  }else{
    await pedirValor('Copie manualmente:', texto);
    avisar(false);
  }
}

/* =========== FECHAMENTO: COMPRAS PARCELADAS =========== */
function ajustarParcelaAtual(){
  const total=Math.max(1, parseInt(document.getElementById('fp-parcelas').value,10)||1);
  const sel=document.getElementById('fp-parcela-atual');
  const anterior=sel.value;
  sel.innerHTML='';
  for(let n=1;n<=total;n++){
    sel.innerHTML += `<option value="${n}">${n} de ${total}</option>`;
  }
  if(anterior && anterior<=total) sel.value=anterior;
  recalcularValorParcela();
}
function recalcularValorParcela(){
  const totalCompra=parseFloat(document.getElementById('fp-valor-total').value)||0;
  const parcelas=Math.max(1, parseInt(document.getElementById('fp-parcelas').value,10)||1);
  document.getElementById('fp-valor-parcela').value = totalCompra>0 ? (totalCompra/parcelas).toFixed(2) : '';
}

async function salvarParcela(){
  const descricao=document.getElementById('fp-descricao').value.trim();
  const valorTotalCompra=parseFloat(document.getElementById('fp-valor-total').value);
  const totalParcelas=Math.max(1, parseInt(document.getElementById('fp-parcelas').value,10)||1);
  const parcelaAtual=parseInt(document.getElementById('fp-parcela-atual').value,10)||1;
  const valorParcela=parseFloat(document.getElementById('fp-valor-parcela').value);
  const data=document.getElementById('fp-data').value || hoje();
  const obsLivre=document.getElementById('fp-obs').value.trim();
  const formaPagamentoSaida=document.getElementById('fp-forma-pagamento').value || 'dinheiro';
  const msg=document.getElementById('msg-parcela');

  if(!descricao || !valorTotalCompra || valorTotalCompra<=0 || !valorParcela || valorParcela<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição, valor total da compra e valor desta parcela.';
    return;
  }
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  if(podeAnexarFoto && !fotoPendenteParcela){
    msg.style.color='var(--saida)';
    msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
    return;
  }

  try{
    const fotoUrl = fotoPendenteParcela ? await enviarFoto(fotoPendenteParcela.dataUrl) : null;
    await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
      unidade:unidadeAtual(), data, turno:'dia', tipo:'saida', categoria:'parcelado',
      valor:valorParcela, obs:`${descricao} — parcela ${parcelaAtual}/${totalParcelas} de ${fmt(valorTotalCompra)}`+(obsLivre?` · ${obsLivre}`:''),
      foto:fotoUrl, formaPagamentoSaida
    })) });
    await recarregarLancamentos();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fp-descricao').value='';
  document.getElementById('fp-valor-total').value='';
  document.getElementById('fp-parcelas').value='1';
  document.getElementById('fp-valor-parcela').value='';
  document.getElementById('fp-data').value='';
  document.getElementById('fp-obs').value='';
  document.getElementById('fp-forma-pagamento').value='dinheiro';
  ajustarParcelaAtual();
  removerFotoParcela();
  msg.style.color='var(--entrada)';
  msg.textContent=`Parcela ${parcelaAtual}/${totalParcelas} de "${descricao}" salva e lançada como saída.`;
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenhar();
}

function desenharFechamento(){
  const un=unidadeAtual();
  const parcelasUnidade = LANCAMENTOS
    .map((l,i)=>({...l, indiceReal:i}))
    .filter(l=>l.unidade===un && l.categoria==='parcelado' && l.compraParcelada);

  // agrupar por descrição da compra pra mostrar o progresso
  const grupos={};
  parcelasUnidade.forEach(l=>{
    const chave=l.compraParcelada.descricao.toLowerCase().trim();
    (grupos[chave]=grupos[chave]||[]).push(l);
  });

  const resumos=Object.values(grupos).map(lista=>{
    lista.sort((a,b)=> a.data<b.data?-1:1);
    const ultima=lista[lista.length-1].compraParcelada;
    const pago=lista.reduce((s,l)=>s+l.valor,0);
    const restante=Math.max(0, ultima.valorTotalCompra - pago);
    const parcelasRegistradas=lista.length;
    return {descricao:lista[0].compraParcelada.descricao, valorTotalCompra:ultima.valorTotalCompra,
      totalParcelas:ultima.totalParcelas, parcelasRegistradas, pago, restante};
  }).sort((a,b)=> b.restante-a.restante);

  document.getElementById('lista-compras-parceladas').innerHTML = resumos.length ? resumos.map(r=>{
    const pct=Math.min(100, Math.round((r.parcelasRegistradas/r.totalParcelas)*100));
    return `<div class="cartao-parcela">
      <div class="topo-parcela">
        <div><div class="titulo-compra">${r.descricao}</div>
        <div class="sub-compra">${r.parcelasRegistradas} de ${r.totalParcelas} parcela(s) lançada(s)</div></div>
        <div class="neutro-forte num">${fmt(r.valorTotalCompra)}</div>
      </div>
      <div class="barra-progresso-parcela"><div class="preenchida" style="width:${pct}%"></div></div>
      <div class="linha-valores-parcela">
        <span>Pago até agora: <strong class="num">${fmt(r.pago)}</strong></span>
        <span>Restante estimado: <strong class="num">${fmt(r.restante)}</strong></span>
      </div>
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma compra parcelada registrada para esta unidade.</div>';

  const linhas=parcelasUnidade.slice().sort((a,b)=> a.data<b.data?1:-1).map(l=>{
    const legenda=`${l.compraParcelada.descricao} · parcela ${l.compraParcelada.parcelaAtual}/${l.compraParcelada.totalParcelas} · ${fmt(l.valor)}`;
    return `<tr>
      <td>${dataBr(l.data)}</td>
      <td>${l.compraParcelada.descricao}</td>
      <td>${l.compraParcelada.parcelaAtual} de ${l.compraParcelada.totalParcelas}</td>
      <td>${l.foto?`<img class="miniatura-tab" src="${l.foto}" alt="Nota" onclick="abrirLightbox('${l.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n num vermelho">${fmt(l.valor)}</td>
    </tr>`;
  }).join('');
  document.getElementById('tab-parcelas').innerHTML =
    linhas || '<tr><td colspan="5" class="vazio">Nenhuma parcela lançada ainda.</td></tr>';
}

/* =========== USUÁRIOS E ACESSOS (só admin) =========== */
function montarCheckboxesUnidades(marcadas){
  const marcado = id => (marcadas==='todas' || (Array.isArray(marcadas)&&marcadas.includes(id))) ? 'checked' : '';
  document.getElementById('fu-unidades').innerHTML = UNIDADES.map(u=>
    `<label><input type="checkbox" value="${u.id}" ${marcado(u.id)}> ${u.nome}</label>`
  ).join('');
}

function montarCheckboxesAbas(marcadas){
  document.getElementById('fu-abas').innerHTML = TABS_DISPONIVEIS.map(t=>
    `<label><input type="checkbox" value="${t.id}" ${marcadas.includes(t.id)?'checked':''}> ${t.nome}</label>`
  ).join('');
}

function montarCheckboxesSetoresComprovantes(marcadas){
  document.getElementById('fu-setores-comprovantes').innerHTML = SETORES_COMPROVANTES.map(s=>
    `<label><input type="checkbox" class="chk-setor-comp" value="${s.id}" ${marcadas.includes(s.id)?'checked':''}> ${s.nome}</label>`
  ).join('');
}

function montarCheckboxesPermissoesFinanceiras(marcadas){
  document.getElementById('fu-permissoes-financeiras').innerHTML = PERMISSOES_FINANCEIRAS.map(p=>
    `<label><input type="checkbox" class="chk-permissao-fin" value="${p.id}" ${marcadas.includes(p.id)?'checked':''}> ${p.nome}</label>`
  ).join('');
}

function usarAbasPadrao(){
  const papel=document.getElementById('fu-papel').value;
  montarCheckboxesAbas(abasPadraoPorPapel(papel));
}

function mudarPapelForm(){
  const papel=document.getElementById('fu-papel').value;
  const bloco=document.getElementById('bloco-unidades-form');
  if(papel==='admin'){
    bloco.classList.add('oculto');
  }else{
    bloco.classList.remove('oculto');
  }
}

function limparFormUsuario(){
  document.getElementById('fu-login-original').value='';
  document.getElementById('fu-nome').value='';
  document.getElementById('fu-login').value='';
  document.getElementById('fu-senha').value='';
  document.getElementById('fu-senha').placeholder='defina uma senha';
  document.getElementById('fu-papel').value='funcionario';
  montarCheckboxesUnidades([]);
  montarCheckboxesAbas(abasPadraoPorPapel('funcionario'));
  montarCheckboxesSetoresComprovantes(setoresComprovantesPadraoPorPapel('funcionario'));
  document.getElementById('fu-escopo-comprovantes').value=escopoComprovantesPadraoPorPapel('funcionario');
  montarCheckboxesPermissoesFinanceiras([]);
  document.getElementById('fu-ve-dashboards').checked=false;
  mudarPapelForm();
  document.getElementById('titulo-form-usuario').textContent='Adicionar usuário';
  document.getElementById('btn-cancelar-usuario').classList.add('oculto');
  document.getElementById('msg-usuario').textContent='';
}

function editarUsuario(login){
  const u=USUARIOS.find(x=>x.login===login);
  if(!u) return;
  document.getElementById('fu-login-original').value=u.id;
  document.getElementById('fu-nome').value=u.nome;
  document.getElementById('fu-login').value=u.login;
  document.getElementById('fu-senha').value='';
  document.getElementById('fu-senha').placeholder='deixe em branco para manter a senha atual';
  document.getElementById('fu-papel').value=u.papel;
  montarCheckboxesUnidades(u.unidades);
  montarCheckboxesAbas(abasDoUsuario(u));
  montarCheckboxesSetoresComprovantes(setoresComprovantesDoUsuario(u));
  document.getElementById('fu-escopo-comprovantes').value=escopoComprovantesDoUsuario(u);
  montarCheckboxesPermissoesFinanceiras(permissoesFinanceirasDoUsuario(u));
  document.getElementById('fu-ve-dashboards').checked=podeVerDashboardsUsuario(u);
  mudarPapelForm();
  document.getElementById('titulo-form-usuario').textContent='Editar usuário — '+u.nome;
  document.getElementById('btn-cancelar-usuario').classList.remove('oculto');
  document.getElementById('msg-usuario').textContent='';
  document.getElementById('tela-usuarios').scrollIntoView({behavior:'smooth',block:'end'});
}

async function excluirUsuario(login){
  if(login===usuario.login){
    avisar('Você não pode excluir o usuário com que está logado agora.');
    return;
  }
  const u=USUARIOS.find(x=>x.login===login);
  if(!u) return;
  if(!await confirmarAcao(`Excluir o acesso de ${u.nome} (${u.login})?`)) return;
  try{
    await api('/usuarios/'+u.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Usuário', `${u.nome} (${u.login}) — ${rotuloPapel(u.papel)}`, null);
  await recarregarUsuarios();
  desenharUsuarios();
}

function desenharHistoricoExclusoes(){
  const cont=document.getElementById('tab-historico-exclusoes');
  if(!cont || usuario.papel!=='admin') return;

  const lista=HISTORICO_EXCLUSOES.slice().sort((a,b)=> a.horaCompleta<b.horaCompleta?1:-1);
  const desde=diaMenos(29);
  const noPeriodo=lista.filter(h=>h.quando>=desde);
  const porPessoa={};
  noPeriodo.forEach(h=> porPessoa[h.excluidoPor]=(porPessoa[h.excluidoPor]||0)+1);
  const pessoaMaisAtiva=Object.entries(porPessoa).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('grade-stats-exclusoes').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${lista.length}</div><div class="rotulo-stat">Exclusões registradas (total)</div></div>
    <div class="stat-vistoria"><div class="num-stat">${noPeriodo.length}</div><div class="rotulo-stat">Nos últimos 30 dias</div></div>
    <div class="stat-vistoria"><div class="num-stat">${pessoaMaisAtiva?pessoaMaisAtiva[0]:'—'}</div><div class="rotulo-stat">${pessoaMaisAtiva?'Quem mais excluiu ('+pessoaMaisAtiva[1]+')':'Ninguém excluiu ainda'}</div></div>
  `;

  cont.innerHTML = lista.length ? lista.map(h=>`
    <tr>
      <td>${dataBr(h.quando)}</td>
      <td>${h.excluidoPor}</td>
      <td>${h.tipo}</td>
      <td>${h.descricao}</td>
      <td>${h.unidade?nomeUnidade(h.unidade):'—'}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhuma exclusão registrada ainda.</td></tr>';
}

async function salvarUsuario(){
  const idOriginal=document.getElementById('fu-login-original').value;
  const nome=document.getElementById('fu-nome').value.trim();
  const login=document.getElementById('fu-login').value.trim().toLowerCase();
  const senha=document.getElementById('fu-senha').value;
  const papel=document.getElementById('fu-papel').value;
  const marcadas=[...document.querySelectorAll('#fu-unidades input:checked')].map(c=>c.value);
  const abasMarcadas=[...document.querySelectorAll('#fu-abas input:checked')].map(c=>c.value);
  const setoresComprovantesMarcados=[...document.querySelectorAll('.chk-setor-comp:checked')].map(c=>c.value);
  const escopoComprovantesEscolhido=document.getElementById('fu-escopo-comprovantes').value;
  const permissoesFinanceirasMarcadas=[...document.querySelectorAll('.chk-permissao-fin:checked')].map(c=>c.value);
  const podeVerDashboards=document.getElementById('fu-ve-dashboards').checked;
  const msg=document.getElementById('msg-usuario');

  if(!nome || !login || (!idOriginal && !senha)){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha nome, usuário e senha.';
    return;
  }
  if(papel!=='admin' && marcadas.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma unidade para este nível de acesso.';
    return;
  }
  if(abasMarcadas.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma aba visível pra esse usuário.';
    return;
  }

  const payload={
    nome, login, papel, todas_unidades: papel==='admin',
    unidades: papel==='admin' ? [] : marcadas,
    abas: abasMarcadas,
    pode_ver_dashboards: podeVerDashboards,
    escopo_comprovantes: escopoComprovantesEscolhido,
    secoes_comprovantes: setoresComprovantesMarcados,
    permissoes_financeiras: permissoesFinanceirasMarcadas,
  };
  if(senha) payload.senha=senha;

  try{
    if(idOriginal){
      await api('/usuarios/'+idOriginal, { method:'PUT', body: JSON.stringify(payload) });
    }else{
      await api('/usuarios', { method:'POST', body: JSON.stringify(payload) });
    }
    await recarregarUsuarios();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  if(idOriginal && usuario.id===idOriginal){
    // editou o próprio usuário logado — atualiza os dados usados na tela agora mesmo
    // (o token continua com as permissões antigas até o próximo login)
    const atualizado=USUARIOS.find(u=>u.id===idOriginal);
    if(atualizado) usuario=atualizado;
  }

  msg.style.color='var(--entrada)';
  msg.textContent=(idOriginal?'Usuário atualizado: ':'Usuário criado: ')+nome+'.';
  limparFormUsuario();
  desenharUsuarios();
  atualizarCabecalho();
}

function desenharUsuarios(){
  document.getElementById('tab-usuarios').innerHTML = USUARIOS.map(u=>{
    const unidadesTxt = u.unidades==='todas' ? 'Todas as unidades' : u.unidades.map(nomeUnidade).join(', ');
    const voceTxt = u.login===usuario.login ? '<span class="voce-selo">(você)</span>' : '';
    const minhasAbas=abasDoUsuario(u);
    const nomesAbas=minhasAbas.map(id=>{
      const t=TABS_DISPONIVEIS.find(x=>x.id===id);
      return t?t.nome:id;
    });
    const abasTxt = `<span title="${nomesAbas.join(', ')}">${minhasAbas.length} aba(s)</span>`;
    const dashTxt = podeVerDashboardsUsuario(u)
      ? '<span class="selo-status pago">Vê</span>'
      : '<span class="selo-status atrasado">Não vê</span>';
    const minhasPermissoesFin=permissoesFinanceirasDoUsuario(u);
    const nomesPermissoesFin=minhasPermissoesFin.map(id=>{
      const p=PERMISSOES_FINANCEIRAS.find(x=>x.id===id);
      return p?p.nome:id;
    });
    const finTxt = minhasPermissoesFin.length
      ? `<span class="selo-status pago" title="${nomesPermissoesFin.join(', ')}">${minhasPermissoesFin.length} permissão(ões)</span>`
      : '<span class="selo-status atrasado">Nenhuma</span>';
    return `<tr>
      <td>${u.nome}${voceTxt}</td>
      <td>${u.login}</td>
      <td><span class="selo-papel ${u.papel}">${rotuloPapel(u.papel)}</span></td>
      <td>${unidadesTxt}</td>
      <td>${abasTxt}</td>
      <td class="n">${dashTxt}</td>
      <td class="n">${finTxt}</td>
      <td class="n">
        <button class="btn-mini" onclick="editarUsuario('${u.login}')">Editar</button>
        ${u.login!==usuario.login?` <button class="btn-mini" onclick="excluirUsuario('${u.login}')">Excluir</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function desenharRede(){
  const ids=unidadesDoUsuario();
  if(ids.length<2) return;
  const datas=listaDatas();
  document.getElementById('sub-rede').textContent =
    diasPeriodo()===1 ? 'Comparação em '+dataBr(dataAtual())
      : `De ${dataBr(datas[0])} a ${dataBr(datas[datas.length-1])}`;

  const dados=ids.map(id=>{
    const m=filtrar({unidade:id,datas});
    const e=somar(m.filter(l=>l.tipo==='entrada'));
    const s=somar(m.filter(l=>l.tipo==='saida'));
    const din=somar(m.filter(l=>l.tipo==='entrada'&&l.categoria==='dinheiro'))-somarSaidasEmDinheiro(m.filter(l=>l.tipo==='saida'));
    return {id,nome:nomeUnidade(id),e,s,saldo:e-s,din};
  }).sort((a,b)=>b.saldo-a.saldo);

  const tot=dados.reduce((a,d)=>({e:a.e+d.e,s:a.s+d.s,saldo:a.saldo+d.saldo,din:a.din+d.din}),{e:0,s:0,saldo:0,din:0});

  document.getElementById('tab-rede').innerHTML =
    dados.map(d=>`<tr>
      <td>${d.nome}</td>
      <td class="n verde num">${fmt(d.e)}</td>
      <td class="n vermelho num">${fmt(d.s)}</td>
      <td class="n neutro-forte num">${fmt(d.saldo)}</td>
      <td class="n num">${fmt(d.din)}</td>
    </tr>`).join('') +
    `<tr style="border-top:2px solid var(--line)">
      <td class="neutro-forte">Total da rede</td>
      <td class="n verde num">${fmt(tot.e)}</td>
      <td class="n vermelho num">${fmt(tot.s)}</td>
      <td class="n neutro-forte num">${fmt(tot.saldo)}</td>
      <td class="n neutro-forte num">${fmt(tot.din)}</td>
    </tr>`;

  const maior=Math.max(...dados.map(d=>d.saldo),1);
  document.getElementById('graf-rede').innerHTML =
    barras(dados.map(d=>({nome:d.nome,valor:d.saldo})),maior,'e');
}

/* proteção movida para logo após a definição de protegido(), no início do script */

restaurarSessao();
