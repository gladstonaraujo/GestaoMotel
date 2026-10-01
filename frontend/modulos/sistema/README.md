# Módulo Sistema

Responsável por:

- usuários, papéis e unidades permitidas;
- abas, dashboards e permissões financeiras;
- escopo e setores de comprovantes;
- histórico de exclusões.

`sistema.js` contém adaptadores da API, regras, ações e renderização dessas
áreas. `sistema.css` contém os controles e indicadores visuais exclusivos da
administração de acessos.

Autenticação, restauração de sessão e cliente HTTP permanecem no núcleo
compartilhado. O módulo é carregado antes do bootstrap para preservar os
manipuladores globais usados pelo HTML atual.
