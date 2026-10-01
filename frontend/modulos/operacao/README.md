# Módulo Operação

Responsável por:

- vistorias de suítes, checklist, fotos e dashboards;
- chamados de manutenção de terceiros;
- consumo de produtos por plantão.

`operacao.js` contém adaptadores da API, regras, ações e renderização dessas
áreas. `operacao.css` concentra os componentes exclusivos de vistoria e
consumo. Elementos compartilhados, como formulários, anexos, tabelas e modais,
continuam no núcleo visual comum.

O módulo é carregado antes do bootstrap para preservar os manipuladores globais
usados pelo HTML atual.
