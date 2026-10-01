# Front-end — Gestão Financeira A2

`index.html` + estilos compartilhados e módulos de domínio. O núcleo da
aplicação fica em `core/`; não existe mais um `script.js` monolítico.

## Navegação por módulos

As telas são agrupadas por domínio (Visão geral, Caixa, Operação, Financeiro,
Gestão e Sistema). Cada tela possui uma rota por hash, por exemplo
`#/lancar`, `#/vistoria` e `#/usuarios`. Isso permite usar voltar/avançar do
navegador e abrir um módulo por endereço sem exigir configuração adicional no
Express.

O catálogo em `core/modulos.js` é a fonte única para a lista de telas e seus
grupos. Ao abrir uma rota, `core/views.js` baixa somente a view, o CSS e o
JavaScript daquele domínio. Os dados necessários para a tela também são
buscados sob demanda e `desenhar()` atualiza somente a tela ativa. As permissões
existentes por papel e por aba continuam sendo verificadas antes de aceitar uma rota.

Os estilos estáticos também ficam centralizados em `styles.css`. O HTML não
possui mais atributos `style`; nos templates JavaScript permanecem somente as
larguras percentuais calculadas em tempo de execução para barras de gráficos e
de progresso.

## Módulos físicos

O módulo Caixa está em `modulos/caixa/` e concentra lançamentos, extrato,
comprovantes e fechamento parcelado.

O módulo Operação está em `modulos/operacao/` e reúne vistorias, manutenção de
terceiros e consumo do plantão, incluindo seus adaptadores de API e estilos
exclusivos.

O módulo Financeiro está em `modulos/financeiro/` e reúne boletos, impostos,
notas fiscais e boletos administrativos.

O módulo Gestão está em `modulos/gestao/` e reúne funcionários, faltas, trocas
de plantão, produtos vencidos, configuração de suítes e RevPAR/TrevPAR. No menu,
essas telas aparecem nos grupos Pessoas, Estoque e Desempenho (`core/modulos.js`).

O módulo Sistema está em `modulos/sistema/` e reúne usuários, permissões e
histórico de exclusões. Autenticação e sessão permanecem no núcleo comum.

O módulo Visão Geral está em `modulos/visao-geral/` e reúne painel, alertas,
relatórios e comparativo consolidado da rede.

O núcleo está separado em:

- `api.js`: cliente HTTP, sessão enviada à API e uploads;
- `estado.js`: catálogos, permissões e o estado mutável centralizado em `AppEstado`;
- `ui.js`: anexos, lightbox, formatação e modais;
- `views.js`: carregamento sob demanda de HTML, CSS e JavaScript de cada domínio;
- `app.js`: login, navegação, filtros e despacho de renderização;
- `erros.js`: captura e proteção dos manipuladores;
- `acoes.js`: delegação segura dos eventos declarativos, com lista explícita de ações;
- `bootstrap.js`: restauração da sessão; o primeiro módulo é carregado depois do login.

O `index.html` contém somente login, modais, cabeçalho, navegação e o contêiner
principal. As 19 telas ficam nos arquivos `view.html` dos respectivos módulos.

## Estado atual
O sistema está **totalmente integrado com o back-end** — não guarda mais
nada só em memória do navegador. Todas as áreas (caixa, boletos, contas
fixas, notas fiscais, funcionários, faltas, trocas de plantão, vistorias,
produtos vencidos, RevPAR, manutenção, consumo do plantão, usuários e
histórico de exclusões) chamam a API de verdade.

Por isso, **não abra mais o `index.html` direto** — o `backend/server.js` é
quem serve esses arquivos (frontend e API pela mesma porta). Rode o
back-end (`npm start` dentro de `backend/`) e acesse pelo endereço que ele
mostrar no terminal (`http://localhost:3001` por padrão).

## Como o front-end fala com a API
- `API_BASE` em `core/api.js` é um caminho relativo (`/api`) — funciona
  em qualquer IP/porta que o servidor esteja rodando, já que o próprio
  back-end serve este arquivo também.
- A função `api(caminho, opcoes)` centraliza toda chamada: manda o token
  salvo no `localStorage`, trata erro de sessão expirada (401) e erros de
  rede.
- Cada área tem um par de funções `recarregarX()` / `xApiParaLocal(row)` que
  busca os dados da API e traduz do formato do banco (snake_case) pro
  formato que o resto do código usa (camelCase) — assim as funções de tela
  não precisaram ser reescritas do zero.
- Fotos: `enviarFoto(dataUrl)` sobe a imagem pra `/api/uploads` primeiro e
  devolve o link, que é o que de fato vai salvo no lançamento/boleto/etc.

## Sessão
Login guarda `token` e `usuario` no `localStorage` — por isso um F5 mantém
a pessoa logada (`restaurarSessao()`, chamada por `core/bootstrap.js`).

## Segurança e testes

HTML produzido pelos módulos passa por sanitização central, que remove tags,
URLs e atributos perigosos. Os antigos atributos `onclick`/`onchange` foram
substituídos por delegação `data-*`; o interpretador não usa `eval` e aceita
somente ações de uma lista explícita. Rode `npm test` em `backend/` para validar
essas regras e os invariantes da arquitetura antes do build.
