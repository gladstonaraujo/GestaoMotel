# Back-end — Gestão Financeira A2 (rede de motéis)

API em Node.js + Express + PostgreSQL. Cobre login, caixa (lançamentos),
boletos, contas fixas, notas fiscais, funcionários, faltas, trocas de
plantão, vistoria de suítes, produtos vencidos, RevPAR, manutenção de
terceiros, consumo do plantão, histórico de exclusões e o relatório
consolidado do diretor. Também serve o front-end (mesmo processo, mesma
porta) e recebe upload de fotos, salvando em disco.

Pra colocar isso rodando num computador de verdade (fora do ambiente de
desenvolvimento), use `../deploy/instalar.ps1` — ele faz tudo isso aqui
automaticamente. Este README é pro modo de desenvolvimento.

## 1. Pré-requisitos
- Node.js 18+
- Um banco PostgreSQL (local, Supabase, Neon, RDS — qualquer um serve)

## 2. Instalação
```bash
cd backend
npm install
cp .env.example .env
```
Abra o `.env` e preencha `DATABASE_URL` com a conexão do seu banco, e troque
o `JWT_SECRET` por uma chave aleatória (pode gerar uma com `openssl rand -hex 32`).

## 3. Criar as tabelas
Rode o schema uma vez no seu banco:
```bash
psql "$DATABASE_URL" -f ../database/schema.sql
```
(No Supabase, pode colar o conteúdo de `database/schema.sql` no SQL Editor e rodar.)

## 4. Criar o usuário inicial
```bash
node seed.js
```
Isso cria o login `diretor` (senha `123`) com acesso total, e a configuração
real de suítes por unidade. **Troque a senha antes de usar em produção de
verdade.** Rodar de novo não duplica nada (atualiza o usuário se já existir).

## 5. Rodar o sistema
```bash
npm start
```
Sobe em `http://localhost:3001` (ou a porta que você definir em `PORT`) —
esse endereço já serve tanto a API quanto a tela (front-end).

## Estrutura
```
backend/
  server.js          -> junta todas as rotas e serve o front-end (../frontend)
  db.js              -> conexão com o Postgres
  middleware/auth.js -> confere login (JWT) e permissões
  utils/patchAsyncRoutes.js -> evita que um erro numa rota derrube a API inteira
  routes/            -> uma rota por área do sistema (auth, unidades, usuarios,
                        lancamentos, boletos, contasFixas, notasFiscais,
                        funcionarios, faltas, trocas, vistorias, produtosVencidos,
                        revpar, manutencao, boletosAdmin, consumoPlantao,
                        historicoExclusoes, relatorio, uploads)
  seed.js            -> cria o usuário inicial (diretor) e a config. de suítes
  uploads/           -> fotos enviadas pelo sistema (criado sozinho, não versionar)
```

## Autenticação
Login em `POST /api/auth/login` com `{ "login": "...", "senha": "..." }`.
Retorna um token — mande ele em todas as próximas chamadas, no cabeçalho:
```
Authorization: Bearer SEU_TOKEN_AQUI
```

## Fotos e arquivos
`POST /api/uploads` recebe a foto em base64 (`{ "dataUrl": "data:image/png;base64,..." }`),
salva como arquivo de verdade em `backend/uploads/` e devolve o link
(`{ "url": "..." }`). Esse link é o que vai no campo `foto_url` de cada
recurso — o banco nunca guarda a foto inteira, só o link.

## Próximos passos sugeridos
- Trocar `CORS_ORIGIN=*` por um domínio específico se algum dia isso sair
  da rede local pra internet
- Adicionar rate limiting no login (ex.: `express-rate-limit`)
- Ativar SSL na conexão do Postgres (descomente a linha em `db.js`) se o
  banco não for mais local
- Ver `../deploy/backup.ps1` pra backup automático do banco
