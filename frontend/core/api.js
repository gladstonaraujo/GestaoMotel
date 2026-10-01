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
// sobe uma foto (capturada como base64) pro servidor e devolve o link salvo em disco —
// é isso que vai no campo foto_url, em vez do base64 inteiro
async function enviarFoto(dataUrl){
  if(!dataUrl) return null;
  const resp = await api('/uploads', { method:'POST', body: JSON.stringify({ dataUrl }) });
  return resp.url;
}

/* =========== DADOS DO MÓDULO CAIXA =========== */
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

/* Regra compartilhada por adaptadores, relatórios e pela tela de desempenho. */
function calcularRevpar(receita, quartos, dias){
  return (quartos>0 && dias>0) ? receita/(quartos*dias) : 0;
}

function diasEntre(d1,d2){
  return Math.round((new Date(d2+'T12:00:00') - new Date(d1+'T12:00:00')) / 86400000);
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
  AppEstado.dados.lancamentos = listas.flat().map(lancamentoApiParaLocal);
}



/* =========== DADOS DO MÓDULO FINANCEIRO =========== */
/* =========== ADAPTADORES DA API =========== */
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
  AppEstado.dados.boletos = todos;
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
  AppEstado.dados.boletosAdmin = lista.map(boletoAdminApiParaLocal);
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
  AppEstado.dados.contasFixas = listas.flat().map(contaFixaApiParaLocal);
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
  AppEstado.dados.notasFiscais = lista.map(notaFiscalApiParaLocal);
}



/* =========== DADOS DO MÓDULO OPERACAO =========== */
/* =========== ADAPTADORES DA API =========== */
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
      const def = AppEstado.dados.itensVistoria.find(x=>x.id===it.item_id);
      return { id: it.item_id, nome: def?def.nome:it.item_id, status: it.status, obs: it.observacao||'' };
    }),
  };
}

async function recarregarVistorias(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/vistorias?unidade_id='+encodeURIComponent(id))));
  AppEstado.dados.vistorias = listas.flat().map(vistoriaApiParaLocal);
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
  AppEstado.dados.manutencoes = listas.flat().map(manutencaoApiParaLocal);
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
  AppEstado.dados.consumosPlantao = listas.flat().map(consumoPlantaoApiParaLocal);
}



/* =========== DADOS DO MÓDULO GESTAO =========== */
/* =========== ADAPTADORES DA API =========== */
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
  AppEstado.dados.funcionarios = listas.flat().map(funcionarioApiParaLocal);
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
  AppEstado.dados.faltas = listas.flat().map(faltaApiParaLocal);
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
  AppEstado.dados.trocas = listas.flat().map(trocaApiParaLocal);
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
  AppEstado.dados.produtosVencidos = listas.flat().map(produtoVencidoApiParaLocal);
}

function suiteConfigApiParaLocal(row){
  return { id: row.id, unidade: row.unidade_id, categoria: row.categoria, quantidade: row.quantidade };
}

async function recarregarSuitesConfig(){
  if(!usuario) return;
  const ids = unidadesDoUsuario();
  const listas = await Promise.all(ids.map(id => api('/revpar/suites?unidade_id='+encodeURIComponent(id))));
  AppEstado.dados.suitesConfig = listas.flat().map(suiteConfigApiParaLocal);
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
  AppEstado.dados.revparRegistros = listas.flat().map(revparApiParaLocal);
}



/* =========== DADOS DO MÓDULO SISTEMA =========== */
/* =========== ADAPTADORES DA API =========== */
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
  AppEstado.dados.usuarios = lista.map(usuarioApiParaLocal);
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
  AppEstado.dados.historicoExclusoes = lista.map(historicoExclusaoApiParaLocal);
}

/* Compatibilidade com registros locais durante operações otimistas. */
function registrarExclusao(tipo, descricao, unidade){
  AppEstado.dados.historicoExclusoes.push({
    id:'exc'+Date.now()+Math.random().toString(36).slice(2),
    tipo, descricao, unidade: unidade||null,
    excluidoPor: usuario.nome, quando: hoje(), horaCompleta: new Date().toISOString()
  });
}


