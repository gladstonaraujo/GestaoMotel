(function iniciarCatalogoDeModulos(global) {
  const grupos = [
    { id: 'visao-geral', nome: 'Visão geral', telas: ['painel', 'rede', 'relatorio'] },
    { id: 'caixa', nome: 'Caixa', telas: ['lancar', 'extrato', 'comprovantes', 'fechamento'] },
    { id: 'operacao', nome: 'Operação', telas: ['consumo-plantao', 'vistoria', 'manutencao'] },
    { id: 'financeiro', nome: 'Financeiro', telas: ['boletos', 'impostos', 'boletos-admin', 'notas-fiscais'] },
    { id: 'pessoas', nome: 'Pessoas', telas: ['funcionarios'] },
    { id: 'estoque', nome: 'Estoque', telas: ['vencidos'] },
    { id: 'desempenho', nome: 'Desempenho', telas: ['revpar'] },
    { id: 'sistema', nome: 'Sistema', telas: ['usuarios', 'historico-exclusoes'] }
  ];

  const telas = {
    painel: { nome: 'Painel', desenhar: ['desenharPainel', 'desenharAlertas'] },
    lancar: { nome: 'Lançar movimento', desenhar: ['desenharLancar'] },
    'consumo-plantao': { nome: 'Consumo do plantão', desenhar: ['desenharConsumoPlantao'] },
    vistoria: { nome: 'Vistoria de suítes', desenhar: ['desenharVistorias'] },
    extrato: { nome: 'Extrato do dia', desenhar: ['desenharExtrato'] },
    comprovantes: { nome: 'Comprovantes', desenhar: ['desenharComprovantes'] },
    boletos: { nome: 'Boletos e Pix', desenhar: ['desenharBoletos'] },
    manutencao: { nome: 'Manutenção de terceiros', desenhar: ['desenharManutencao'] },
    'boletos-admin': { nome: 'Boletos administrativo', desenhar: ['desenharBoletosAdmin'], somenteAdmin: true },
    'notas-fiscais': { nome: 'Notas fiscais', desenhar: ['desenharNotasFiscais'], somenteAdmin: true },
    fechamento: { nome: 'Fechamento', desenhar: ['desenharFechamento'] },
    impostos: { nome: 'Impostos e energia', desenhar: ['desenharImpostos'] },
    funcionarios: { nome: 'Funcionários', desenhar: ['desenharFuncionarios', 'desenharTrocas'] },
    vencidos: { nome: 'Produtos vencidos', desenhar: ['desenharProdutosVencidos'] },
    revpar: { nome: 'RevPAR', desenhar: ['desenharRevpar'] },
    relatorio: { nome: 'Relatório', desenhar: ['desenharRelatorio'], somenteAdmin: true },
    rede: { nome: 'Comparativo da rede', desenhar: ['desenharRede'] },
    usuarios: { nome: 'Usuários e acessos', desenhar: ['desenharUsuarios'], somenteAdmin: true },
    'historico-exclusoes': { nome: 'Histórico de exclusões', desenhar: ['desenharHistoricoExclusoes'], somenteAdmin: true }
  };

  const grupoDaTela = tela => grupos.find(grupo => grupo.telas.includes(tela));
  const arquivosPorTela = Object.freeze({
    painel:'visao-geral', rede:'visao-geral', relatorio:'visao-geral',
    lancar:'caixa', extrato:'caixa', comprovantes:'caixa', fechamento:'caixa',
    'consumo-plantao':'operacao', vistoria:'operacao', manutencao:'operacao',
    boletos:'financeiro', impostos:'financeiro', 'boletos-admin':'financeiro', 'notas-fiscais':'financeiro',
    funcionarios:'gestao', vencidos:'gestao', revpar:'gestao',
    usuarios:'sistema', 'historico-exclusoes':'sistema'
  });
  const rotaAtual = () => decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]);

  const arquivoDaTela = tela => arquivosPorTela[tela];
  global.AppModulos = Object.freeze({ grupos, telas, grupoDaTela, arquivoDaTela, rotaAtual });
})(window);
