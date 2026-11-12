# Changelog

Mudanças significativas do sistema de gestão financeira da rede A2.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), agrupado por data de publicação.

Seções usadas: **Adicionado**, **Alterado**, **Corrigido**, **Segurança**, **Removido**.
Quando houver migração de banco, ela aparece em **Banco de dados** com o comando para aplicar —
os instaladores só rodam o `schema.sql` em banco novo, então migrações são aplicadas à mão.

## [Não publicado]

### Adicionado
- Cadastro de boleto na tela **Lançar movimento** (Saída → "Boleto (cadastrar)"), com tipo
  (Fornecedor, Energia, Água, Internet, Imposto, Aluguel, Outro), vencimento, código de barras,
  Pix copia e cola e foto. Só gerente e diretor.
- Opção **"Pago agora"** no cadastro do boleto: a saída entra no caixa do plantão e do turno em
  andamento (em dinheiro, diminui o caixa físico).
- Coluna **Tipo** na lista de boletos e tipo também na compra conjunta.
- **Período personalizado** no "Período do painel": opção com data inicial e data final. Vale
  para Comparativo da rede, Painel e Comprovantes.
- **"Todas as unidades"** no seletor de unidade do Comparativo da rede (padrão da tela). Escolher
  uma unidade mostra só ela; a opção existe apenas nessa tela.

### Alterado
- Tela **Boletos e Pix** passa a ter só a lista, o "Marcar como pago" e a compra conjunta; o
  cadastro simples foi para Lançar movimento (há um botão que leva direto ao formulário).
- Funcionário e inspetor veem apenas os **últimos 7 dias** (plantão atual + 6 anteriores). A lista
  "Seus lançamentos dos últimos 7 dias" substitui "os 10 últimos", e a API aplica o mesmo limite.
- Vistoria e consumo do plantão sem data informada usam a **data do plantão** (de madrugada, o dia
  em que o plantão da noite começou).
- A saída gerada ao pagar um boleto passa a registrar o tipo na descrição
  (ex.: "Dinheiro — Boleto Energia: conta de outubro").

- Em desenvolvimento (`npm run dev` / `npm start`) o servidor entrega sempre o front-end do
  código-fonte; `frontend/dist` só é usado em produção (`dist/server.js` ou `NODE_ENV=production`).
  Antes, um `dist` antigo esquecido escondia as mudanças do front.

### Corrigido
- Lançamento feito de madrugada no plantão da noite não aparece mais como "data alterada".
- Funcionário com a tela aberta desde o plantão anterior não consegue mais lançar na data antiga:
  a data é recalculada ao salvar.
- Boleto não pode mais ser pago duas vezes com dois cliques simultâneos (geraria duas saídas no caixa).

### Banco de dados
- `2026-11-12-tipo-boleto.sql` — adiciona a coluna `tipo` em `boletos` (existentes ficam como "outro").
  `psql "<DATABASE_URL>" -f database/migracoes/2026-11-12-tipo-boleto.sql`

## 2026-10-05

### Adicionado
- Cadastro de produtos com categorias.
- Unidades podem ser desativadas pela tela **Unidades** (somem dos seletores, mas os registros
  antigos continuam com o nome).
- Design system documentado em `docs/design-system`.

### Alterado
- Formulário de usuários reorganizado.
- Datas e fuso: plantão da noite (20h–08h) conta no dia em que começou; "hoje" calculado em
  `America/Belem`, não em UTC.
- Instaladores aceitam pacote só com `dist` e empacotam o seed.

### Corrigido
- Logo duplicada no login no tema claro.
- Botão "Salvar usuário" no tema escuro.

### Banco de dados
- `2026-10-02-unidades-ativas.sql` — coluna `ativa` em `unidades`.
- `2026-10-02-fotos-e-boletos.sql` — links de foto passam a ser relativos (`/uploads/...`) e
  boletos já pagos marcados como Pix.

## 2026-10-02

### Adicionado
- Novo layout com menu lateral recolhível, menu do usuário e identidade visual.
- Indicadores (KPIs) nas telas.

### Corrigido
- Operações em várias etapas (pagar boleto/conta, compra conjunta, vistoria, usuários) agora são
  transações atômicas.
- Parâmetros de consulta validados; upload de foto assíncrono.

## 2026-10-01

### Adicionado
- Primeira versão do sistema de gestão financeira da rede de motéis.
- Build com esbuild (front-end e back-end minificados) e documentação de publicação
  (`deploy/BUILD.md`).
- Testes automatizados, incluindo testes de arquitetura do front-end.

### Alterado
- Front-end dividido em núcleo (`core/`) e módulos por domínio (`modulos/`).

### Segurança
- Texto digitado por usuários escapado nos templates HTML, inclusive categorias de suíte no RevPAR.
