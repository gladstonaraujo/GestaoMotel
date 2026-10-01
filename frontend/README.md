# Front-end — Gestão Financeira A2

`index.html` + `styles.css` + `script.js`.

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
- `API_BASE` no topo do `script.js` é um caminho relativo (`/api`) — funciona
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
a pessoa logada (`restaurarSessao()`, chamada no fim do `script.js`).
