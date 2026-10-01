# Módulo Visão Geral

Responsável por:

- painel financeiro e projeção mensal;
- alertas de despesas duplicadas, atípicas, retiradas e quebras;
- relatórios operacionais e financeiros;
- comparativo consolidado da rede.

`visao-geral.js` contém cálculos, geração de gráficos, relatórios e renderização
dessas telas. Algumas funções de agregação permanecem públicas temporariamente
porque dashboards de outros módulos reutilizam o mesmo comportamento.

`visao-geral.css` contém a apresentação exclusiva do saldo principal. Grades,
cards, tabelas e barras permanecem entre os componentes compartilhados.
