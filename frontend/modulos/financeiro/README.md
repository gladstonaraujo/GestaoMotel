# Módulo Financeiro

Responsável por:

- boletos e pagamentos via Pix;
- impostos, energia e contas fixas;
- notas fiscais e rateios entre unidades;
- boletos administrativos e seu lançamento nas unidades.

`financeiro.js` contém adaptadores da API, regras, ações e renderização dessas
áreas. `financeiro.css` reúne as ações de pagamento e os controles de valores
por unidade. Status, tabelas, formulários, comprovantes e anexos continuam como
componentes visuais compartilhados.

O módulo é carregado antes do bootstrap para preservar os manipuladores globais
usados pelo HTML atual.
