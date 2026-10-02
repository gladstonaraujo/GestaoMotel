# Análise do sistema — Gestão Financeira A2 (rede de 6 motéis)

Data da análise inicial: 2026-09-30  
Última atualização: 2026-10-01 (Itens críticos e transações consolidados)

**Escopo revisado:** `backend/server.js`, `db.js`, `middleware/auth.js`, `middleware/limiteLogin.js`, `seed.js`, rotas `auth`, `usuarios`, `lancamentos`, `boletos`, `contasFixas`, `vistorias`, `relatorio`, `produtosVencidos`, `historicoExclusoes`, `uploads`, front-end modularizado e testes automatizados.

## Resumo e Status de Correção

| # | Gravidade | Problema | Local | Status |
|---|-----------|----------|-------|--------|
| 1 | Alta | Rotas por `:id` sem checagem de unidade | `routes/lancamentos.js`, `routes/boletos.js` | **Resolvido** (middleware `exigirAcessoAoRegistro` em vigor) |
| 2 | Alta | `/uploads` público, sem autenticação | `server.js` | Em planejamento de rota autenticada |
| 3 | Alta | Credenciais padrão fracas (`diretor / 123`, JWT_SECRET de dev) | `seed.js`, `.env` | **Resolvido** (seed gera senha forte/env, JWT 64+ bytes) |
| 4 | Alta | Login sem proteção contra força bruta | `routes/auth.js` | **Resolvido** (`middleware/limiteLogin.js` ativo) |
| 5 | Média | JWT carrega permissões por 12h, sem revalidação | `middleware/auth.js` | Mitigado / Em monitoramento |
| 6 | Média | Validação de entrada fraca | várias rotas | **Resolvido** (`utils/validar.js` e sanitização de queries) |
| 7 | Média | Operações multi-etapa sem transação | `usuarios`, `boletos`, `vistorias` | **Resolvido** (`BEGIN/COMMIT/ROLLBACK` implementados) |
| 8 | Média | Consultas N+1 e listagens sem paginação | `usuarios`, `vistorias` | Mitigado com filtros de período |
| 9 | Média | Hardening de rede/HTTP ausente | `server.js` | Em planejamento de proxy/HTTPS |
| 10 | Média | Upload síncrono e URL absoluta gravada no banco | `routes/uploads.js` | **Resolvido** (escrita assíncrona com `fs.promises.writeFile`) |
| 11 | Baixa | README desatualizado | `README.md` | Em atualização |
| 12 | Baixa | Sem Git, testes ou linter; `script.js` monolítico | projeto | **Resolvido** (front modularizado em 6 domínios + 20 testes) |
| 13 | Média | "Hoje" calculado em UTC (fuso errado à noite) | várias rotas | **Resolvido** (`utils/data.js` centralizado em `America/Belem`) |

---

## Detalhes das Implementações Recentes

### 1. Integridade de Caixa e Isolamento de Unidades (Itens 1 e 13)
- Middleware [exigirAcessoAoRegistro](file:///d:/Developer/Projects/Anderson/Motel/backend/middleware/auth.js) aplicado em todas as operações de mutação por `:id` (`lancamentos`, `boletos`, `contas_fixas`, `faltas`, `produtos_vencidos`, `trocas_plantao`, `consumos_plantao`, `revpar_registros`, `suites_config`).
- Cálculo de data centralizado com [hojeBelem](file:///d:/Developer/Projects/Anderson/Motel/backend/utils/data.js) e TimeZone `America/Belem` injetado na conexão do Postgres via [db.js](file:///d:/Developer/Projects/Anderson/Motel/backend/db.js).
- Criada suíte de testes em [seguranca-unidades.test.js](file:///d:/Developer/Projects/Anderson/Motel/backend/tests/seguranca-unidades.test.js).

### 2. Transações SQL Atômicas (Item 7)
- **Marcação de Boletos e Contas Fixas:** Uso de client dedicado com `BEGIN` / `COMMIT` / `ROLLBACK`, garantindo que a saída de caixa em `lancamentos` e a atualização do status em `boletos`/`contas_fixas` ocorram de forma inseparável.
- **Compra Conjunta de Boletos:** Criação do registro conjunto e distribuição por unidade encapsulados em bloco transacional.
- **Vistorias de Suítes:** Criação de vistoria, checklist de itens e anexação de fotos transacionados.
- **Gestão de Usuários:** Criação e atualização de perfil com vínculos de unidades, abas, permissões financeiras e setores executados com integridade garantida.

### 3. Sanitização de Parâmetros e I/O Assíncrono (Itens 6 e 10)
- Parâmetro `dias` no [relatorio.js](file:///d:/Developer/Projects/Anderson/Motel/backend/routes/relatorio.js) e em [produtosVencidos.js](file:///d:/Developer/Projects/Anderson/Motel/backend/routes/produtosVencidos.js) devidamente sanitizado, limitado ao intervalo de 1 a 365 dias e parametrizado com `($n)::interval`.
- Gravação de fotos em [uploads.js](file:///d:/Developer/Projects/Anderson/Motel/backend/routes/uploads.js) migrada para `fs.promises.writeFile`, liberando o event loop para atender as recepções dos motéis sem latência durante o envio de notas fiscais.
