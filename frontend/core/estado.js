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

const AppEstado = {
  dados: {
    usuarios: [], lancamentos: [], boletos: [], contasFixas: [], funcionarios: [],
    faltas: [], trocas: [], produtosVencidos: [], suitesConfig: [], revparRegistros: [],
    manutencoes: [], boletosAdmin: [], consumosPlantao: [], historicoExclusoes: [],
    notasFiscais: [], vistorias: [], itensVistoria: [], itensVistoriaRapida: []
  },
  ui: {
    itensConsumoPendente: [], fotoPendenteNotaFiscal: null,
    fotoPendenteBoletoAdmin: null, boletoAdminEmLancamento: null,
    fotoPendenteVencido: null, fotosPendentesAtestado: [],
    fotoPendenteImposto: null, fotosPendentesVistoria: [],
    tipoAtual: 'entrada', fotoPendente: null, fotoPendenteBoleto: null,
    fotoPendenteParcela: null
  },
  sessao: { usuario: null }
};

/* Compatibilidade temporária para funções legadas; o valor canônico fica no estado. */
Object.defineProperty(window, 'usuario', {
  configurable: false,
  get: () => AppEstado.sessao.usuario,
  set: valor => { AppEstado.sessao.usuario = valor; }
});

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

const ITENS_VISTORIA_PADRAO = [
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
AppEstado.dados.itensVistoria = ITENS_VISTORIA_PADRAO;
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
AppEstado.dados.itensVistoriaRapida = ITENS_VISTORIA_RAPIDA;
