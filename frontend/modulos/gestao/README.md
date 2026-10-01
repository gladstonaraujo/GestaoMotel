# Módulo Gestão

Responsável por:

- funcionários, faltas e trocas de plantão;
- produtos vencidos, avariados ou perdidos;
- configuração das categorias de suítes;
- indicadores RevPAR e TrevPAR.

`gestao.js` contém adaptadores da API, regras, ações, dashboards e renderização
dessas áreas. `gestao.css` concentra os estados visuais específicos das perdas
de estoque. Formulários, tabelas, anexos e indicadores compartilhados continuam
no núcleo visual comum.

O módulo é carregado antes do bootstrap para preservar os manipuladores globais
usados pelo HTML e pelos relatórios atuais.
