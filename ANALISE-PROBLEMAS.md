# Análise do sistema — Gestão Financeira A2 (rede de 6 motéis)

Data da análise: 2026-09-30

**Escopo revisado:** `backend/server.js`, `db.js`, `middleware/auth.js`, `seed.js`, rotas `auth`, `usuarios`, `lancamentos`, `boletos`, `vistorias`, `relatorio`, `historicoExclusoes`, `uploads`, estrutura do projeto e README.
**Não revisado:** `database/schema.sql`, `frontend/script.js` (5.059 linhas), scripts da pasta `deploy/` e as demais rotas (contasFixas, faltas, trocas, revpar etc.). Alguns problemas abaixo provavelmente se repetem nelas.

## Resumo

| # | Gravidade | Problema | Local |
|---|-----------|----------|-------|
| 1 | Alta | Rotas por `:id` sem checagem de unidade | `routes/lancamentos.js`, `routes/boletos.js` |
| 2 | Alta | `/uploads` público, sem autenticação | `server.js` |
| 3 | Alta | Credenciais padrão fracas (`diretor / 123`, JWT_SECRET de dev) | `seed.js`, `.env` |
| 4 | Alta | Login sem proteção contra força bruta | `routes/auth.js` |
| 5 | Média | JWT carrega permissões por 12h, sem revalidação | `middleware/auth.js` |
| 6 | Média | Validação de entrada fraca | várias rotas |
| 7 | Média | Operações multi-etapa sem transação | `usuarios`, `boletos`, `vistorias` |
| 8 | Média | Consultas N+1 e listagens sem paginação | `usuarios`, `vistorias` |
| 9 | Média | Hardening de rede/HTTP ausente | `server.js` |
| 10 | Média | Upload síncrono e URL absoluta gravada no banco | `routes/uploads.js` |
| 11 | Baixa | README desatualizado | `README.md` |
| 12 | Baixa | Sem Git, testes ou linter; `script.js` monolítico | projeto |
| 13 | Média | "Hoje" calculado em UTC (fuso errado à noite) | várias rotas |

---

## Gravidade alta

### 1. Rotas por `:id` sem checagem de unidade
**Onde:** `lancamentos` (`PUT /:id`, `DELETE /:id`, `DELETE /:id/foto`) e `boletos` (`DELETE /:id`, `DELETE /:id/foto`, `POST /:id/marcar-pago`).
**Problema:** o middleware `exigirUnidade` só é aplicado nas rotas que recebem `unidade_id`. Nas rotas por `:id` basta ter a permissão (ou o papel gerente/admin) para agir sobre qualquer registro, de qualquer unidade.
**Impacto:** um gerente da unidade A pode editar, excluir ou marcar como pago um registro da unidade B conhecendo o id. `marcar-pago` ainda cria uma saída de caixa na unidade do boleto.
**Correção sugerida:** buscar o registro, comparar `unidade_id` com `req.usuario.todas_unidades` / `req.usuario.unidades` e responder 403 se não houver acesso. Também retornar 404 quando o registro não existe (hoje o `PUT` devolve `undefined`).

### 2. `/uploads` é público
**Onde:** `server.js` (`express.static` em `/uploads`).
**Problema:** notas fiscais, comprovantes e fotos de vistoria podem ser abertos por qualquer pessoa com o link, sem login. Os nomes são aleatórios, mas o link vaza facilmente (conversas, histórico de navegador).
**Correção sugerida:** servir por uma rota autenticada, que valide a unidade do registro dono da foto. O front precisa enviar o token (por exemplo via `fetch` + blob).

### 3. Credenciais padrão fracas
**Onde:** `seed.js` cria `diretor / 123`; `backend/.env` tem `JWT_SECRET=dev-local-chave-secreta-motel-a2-nao-usar-em-producao`.
**Impacto:** quem souber o padrão entra como administrador com todas as permissões. Com o segredo JWT conhecido, é possível forjar tokens.
**Correção sugerida:** confirmar que produção usa segredo aleatório longo (≥ 32 bytes) e que a senha do diretor foi trocada. Fazer o `seed.js` gerar uma senha aleatória (ou exigir uma por variável de ambiente) e forçar troca no primeiro login. Não versionar o `.env`.

### 4. Login sem proteção contra força bruta
**Onde:** `routes/auth.js`.
**Problema:** sem rate limit, sem bloqueio temporário por tentativas, sem log de falhas. O sistema fica acessível na rede local (`0.0.0.0`).
**Correção sugerida:** `express-rate-limit` no `/api/auth/login` e atraso ou bloqueio após N falhas por login/IP.

---

## Gravidade média

### 5. JWT carrega permissões por 12h
**Onde:** `middleware/auth.js`, `routes/auth.js`.
**Problema:** papel, unidades e permissões financeiras ficam dentro do token. Se o diretor remover uma permissão, trocar o papel ou desativar um usuário, o token antigo continua valendo até expirar.
**Correção sugerida:** reduzir a validade (com refresh) ou, no `autenticar`, consultar o usuário e suas permissões no banco (com cache curto).

### 6. Validação de entrada fraca
- `POST /usuarios`: `papel` não é validado contra a lista permitida.
- `POST /lancamentos`: `!valor` aceita valores negativos; só o `PUT` checa `valor > 0`. Também não valida `tipo`, `turno`, formato de `data` nem se `categoria_id` existe.
- `exigirUnidade`: `unidade_id` pode chegar como array (`?unidade_id[]=x`), o que faz `includes` se comportar de forma inesperada.
- `GET /relatorio`: `dias` é interpolado na SQL (`INTERVAL '${dias - 1} days'`). Passa por `parseInt`, então não há injeção, mas um valor inválido vira `NaN` e gera erro 500. Falta limitar o intervalo.
- `PUT /usuarios/:id`: não impede o admin de rebaixar o próprio papel nem de desativar o último admin.
**Correção sugerida:** validar o corpo e a query com uma biblioteca de schema (por exemplo `zod`) e usar parâmetro (`make_interval(days => $n)`) no relatório.

### 7. Operações multi-etapa sem transação
**Onde:** `POST/PUT /usuarios` (usuário + unidades + abas + setores + permissões), `POST /boletos/conjunta` (registro conjunto + N boletos), `POST /vistorias` (vistoria + itens + fotos), `marcar-pago` (lançamento + atualização do boleto), exclusões (`DELETE` + histórico).
**Impacto:** uma falha no meio deixa dados incompletos, por exemplo usuário sem unidades, boleto pago sem lançamento ou exclusão sem registro no histórico.
**Correção sugerida:** usar `pool.connect()` com `BEGIN` / `COMMIT` / `ROLLBACK`.

### 8. Consultas N+1 e listagens sem paginação
**Onde:** `GET /usuarios` (4 consultas por usuário), `GET /vistorias` (2 consultas por vistoria, sem filtro de data nem limite), `GET /boletos`.
**Impacto:** a lentidão cresce com o histórico. Vistorias são registradas todo dia em 6 unidades.
**Correção sugerida:** agregar com `JOIN` + `array_agg` ou consultas `ANY($1)`; adicionar filtros de período e paginação.

### 9. Hardening de rede/HTTP ausente
- CORS cai em `*` se `CORS_ORIGIN` não estiver definido.
- Sem `helmet` (cabeçalhos de segurança).
- Limite de JSON de 15 MB aplicado a todas as rotas.
- Sem HTTPS: login e token trafegam em texto puro na rede local.
- Servidor escuta em `0.0.0.0`; confirmar regras do firewall do Windows.
**Correção sugerida:** exigir `CORS_ORIGIN` em produção, adicionar `helmet`, limitar o corpo grande só à rota de upload, colocar um proxy reverso com HTTPS.

### 10. Upload síncrono e URL absoluta no banco
**Onde:** `routes/uploads.js`.
- `fs.writeFileSync` bloqueia o event loop durante uploads de até 15 MB.
- A URL completa (`http://<host>:<porta>/uploads/...`) fica gravada no banco. Trocar o IP ou a porta da máquina quebra todas as fotos antigas.
- O tipo é validado só pelo prefixo `data:image/...`, sem verificar o conteúdo real do arquivo.
**Correção sugerida:** `fs.promises.writeFile`, gravar só o caminho relativo (`/uploads/arquivo.jpg`) e, se possível, conferir os bytes iniciais (assinatura do arquivo).

### 13. "Hoje" calculado em UTC
**Onde:** `new Date().toISOString().slice(0, 10)` em `lancamentos`, `boletos`, `vistorias` e outras.
**Problema:** em Belém (UTC-3), a partir das 21h o servidor já considera o dia seguinte. Isso afeta a regra "só gerente/admin lança em outra data", o campo `data_alterada`, a data de pagamento do boleto e a data da vistoria. Funcionário que lança no turno da noite pode ser bloqueado, ou a data gravada sai errada.
**Correção sugerida:** calcular a data no fuso `America/Belem` (por exemplo `toLocaleDateString('sv-SE', { timeZone: 'America/Belem' })`) e centralizar isso numa função única.

---

## Gravidade baixa / organização

### 11. README desatualizado
O `README.md` cita `deploy/instalar.ps1`, `backup.ps1` e `DEPLOY.md`. A pasta `deploy/` contém `windows-instalar.ps1`, `windows-backup.ps1`, `windows-DEPLOY.md`, `instalar.sh`, `backup.sh` e `DEPLOY.md`. Atualizar os nomes e explicar a diferença entre as versões Windows e Linux.

### 12. Sem Git, testes ou linter; front monolítico
- O diretório não é um repositório Git: sem histórico nem como reverter alterações.
- Não há testes automatizados, nem para as regras financeiras e de permissão.
- `frontend/script.js` tem mais de 5 mil linhas em um único arquivo, o que dificulta a manutenção.
**Correção sugerida:** `git init` com `.gitignore` (`node_modules`, `.env`, `uploads`), testes das regras de permissão e caixa, e divisão gradual do `script.js` em módulos.

---

## Ordem de correção sugerida

1. Itens 1 e 13 (podem causar erro real no caixa e acesso indevido entre unidades).
2. Itens 3 e 4 (trocar senha e segredo, rate limit no login).
3. Item 2 (autenticar os uploads).
4. Item 12 (Git) antes de mexer em mais código.
5. Itens 5 a 10 (transações, validação, desempenho e hardening).
6. Item 11 (documentação).
