-- ============================================================
-- SCHEMA DO BANCO DE DADOS — Gestão Financeira de Motéis (Rede A2)
-- PostgreSQL 14+  (funciona também no Supabase, que roda Postgres)
-- ============================================================

-- Extensão pra gerar UUID automaticamente
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- UNIDADES (as filiais da rede)
-- ============================================================
CREATE TABLE unidades (
  id            TEXT PRIMARY KEY,          -- ex.: 'beirol1', 'jardim'
  nome          TEXT NOT NULL,             -- ex.: 'Beirol 1'
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USUÁRIOS (login do sistema)
-- ============================================================
CREATE TABLE usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login           TEXT UNIQUE NOT NULL,
  senha_hash      TEXT NOT NULL,             -- bcrypt, nunca texto puro
  nome            TEXT NOT NULL,
  papel           TEXT NOT NULL CHECK (papel IN ('funcionario','inspetor','gerente','admin')),
  todas_unidades  BOOLEAN NOT NULL DEFAULT false,   -- true só pra admin
  pode_ver_dashboards  BOOLEAN,                -- NULL = usa o padrão do papel (gerente=true, resto=false); admin sempre true
  escopo_comprovantes  TEXT CHECK (escopo_comprovantes IN ('dia','tudo')), -- NULL = usa o padrão do papel (admin='tudo', resto='dia')
  ativo           BOOLEAN NOT NULL DEFAULT true,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- unidades que cada usuário acessa (N:N) — ignorado se todas_unidades=true
CREATE TABLE usuario_unidades (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  unidade_id  TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, unidade_id)
);

-- abas visíveis por usuário (permissão granular, feita pelo admin)
CREATE TABLE usuario_abas (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  aba         TEXT NOT NULL,   -- 'painel','lancar','vistoria','extrato', etc.
  PRIMARY KEY (usuario_id, aba)
);

-- setores de comprovantes visíveis por usuário (lancamentos/boletos/boletos-admin/impostos)
CREATE TABLE usuario_setores_comprovantes (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  setor       TEXT NOT NULL,
  PRIMARY KEY (usuario_id, setor)
);

-- permissões financeiras (excluir lançamentos, editar valores, apagar comprovantes, excluir boletos)
CREATE TABLE usuario_permissoes_financeiras (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao   TEXT NOT NULL,
  PRIMARY KEY (usuario_id, permissao)
);

-- ============================================================
-- CATEGORIAS (listas fixas, mas guardadas em tabela pra poder editar sem alterar código)
-- ============================================================
CREATE TABLE categorias_entrada (
  id    TEXT PRIMARY KEY,   -- 'dinheiro','debito','credito','pix'
  nome  TEXT NOT NULL
);

CREATE TABLE categorias_saida (
  id    TEXT PRIMARY KEY,   -- 'quebra','produtos','manutencao', etc.
  nome  TEXT NOT NULL
);

-- ============================================================
-- LANÇAMENTOS (o caixa: entradas e saídas do turno)
-- ============================================================
CREATE TABLE lancamentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id        TEXT NOT NULL REFERENCES unidades(id),
  data              DATE NOT NULL,
  turno             TEXT NOT NULL CHECK (turno IN ('dia','noite')),
  tipo              TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  categoria_id      TEXT NOT NULL,          -- refere-se a categorias_entrada OU categorias_saida conforme "tipo"
  valor             NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  observacao        TEXT,
  lancado_por       UUID REFERENCES usuarios(id),
  foto_url          TEXT,                   -- link no storage (S3/Supabase Storage), não a imagem em si
  forma_pagamento_saida TEXT CHECK (forma_pagamento_saida IN ('dinheiro','pix')), -- só relevante quando tipo='saida'
  data_alterada     BOOLEAN NOT NULL DEFAULT false,   -- true se a "data" foi diferente do dia do lançamento
  registrado_em     DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  editado_por       UUID REFERENCES usuarios(id),      -- preenchido só se o lançamento foi editado depois de criado
  editado_em        DATE,

  -- referência opcional a uma compra parcelada (várias saídas apontam pro mesmo grupo)
  compra_parcelada_id   UUID,
  parcela_numero        INT,

  -- referência opcional a rateio entre unidades (informativo, cada unidade só entra com sua parte)
  rateio_valor_total     NUMERIC(12,2),
  nota_fiscal_id         UUID   -- referência opcional a notas_fiscais(id), ver mais abaixo
);
CREATE INDEX idx_lancamentos_unidade_data ON lancamentos(unidade_id, data);

-- Grupo de compra parcelada (o "cabeçalho" — cada parcela é uma linha em lancamentos)
CREATE TABLE compras_parceladas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id          TEXT NOT NULL REFERENCES unidades(id),
  descricao           TEXT NOT NULL,
  valor_total          NUMERIC(12,2) NOT NULL,
  total_parcelas       INT NOT NULL,
  observacao          TEXT,
  criado_por          UUID REFERENCES usuarios(id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_compra_parcelada
  FOREIGN KEY (compra_parcelada_id) REFERENCES compras_parceladas(id);

-- ============================================================
-- BOLETOS E NOTAS (Pix) — inclusive compra conjunta entre unidades
-- ============================================================
CREATE TABLE compras_conjuntas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao             TEXT NOT NULL,
  valor_total_conjunto  NUMERIC(12,2) NOT NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE boletos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id          TEXT NOT NULL REFERENCES unidades(id),
  descricao           TEXT NOT NULL,
  valor               NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  vencimento          DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  foto_url            TEXT,
  codigo_barras       TEXT,
  pix_copia_cola      TEXT,
  compra_conjunta_id  UUID REFERENCES compras_conjuntas(id),
  criado_por          UUID REFERENCES usuarios(id),
  data_pagamento      DATE,
  lancamento_id       UUID REFERENCES lancamentos(id),  -- saída gerada quando marcado como pago
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_boletos_unidade_status ON boletos(unidade_id, status);

-- ============================================================
-- IMPOSTOS E CONTAS FIXAS (energia, água, internet...)
-- ============================================================
CREATE TABLE contas_fixas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('imposto','energia','agua','internet','outra')),
  competencia     DATE,                     -- guardamos como dia 1 do mês de referência
  descricao       TEXT NOT NULL,
  valor           NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  vencimento      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  foto_url        TEXT,
  criado_por      UUID REFERENCES usuarios(id),
  data_pagamento  DATE,
  lancamento_id   UUID REFERENCES lancamentos(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- VISTORIA DE SUÍTES
-- ============================================================
CREATE TABLE itens_vistoria_catalogo (
  id          TEXT PRIMARY KEY,   -- 'garagem_limpa','chao_banheiro', etc.
  categoria   TEXT NOT NULL CHECK (categoria IN ('garagem','banheiro','quarto','consumo')),
  nome        TEXT NOT NULL,
  na_rapida   BOOLEAN NOT NULL DEFAULT false  -- entra na vistoria rápida de início de plantão?
);

CREATE TABLE vistorias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id          TEXT NOT NULL REFERENCES unidades(id),
  suite               TEXT NOT NULL,
  data                DATE NOT NULL,
  turno               TEXT NOT NULL CHECK (turno IN ('dia','noite')),
  tipo_vistoria        TEXT NOT NULL DEFAULT 'completa' CHECK (tipo_vistoria IN ('completa','rapida')),
  observacao_geral    TEXT,
  feito_por           UUID REFERENCES usuarios(id),
  registrado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vistorias_unidade_data ON vistorias(unidade_id, data);

CREATE TABLE vistoria_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vistoria_id   UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES itens_vistoria_catalogo(id),
  status        TEXT NOT NULL CHECK (status IN ('ok','problema')),
  observacao    TEXT
);

CREATE TABLE vistoria_fotos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vistoria_id   UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
  foto_url      TEXT NOT NULL
);

-- ============================================================
-- FUNCIONÁRIOS (cadastro da equipe — separado do login)
-- ============================================================
CREATE TABLE funcionarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  nome            TEXT NOT NULL,
  cargo           TEXT NOT NULL CHECK (cargo IN
    ('recepcao','caixa_volante','cozinha','camareira','fiscal_apoio','lavanderia','manutencao','gerente','outro')),
  telefone        TEXT,
  documento       TEXT,          -- CPF
  data_admissao   DATE,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  criado_por      UUID REFERENCES usuarios(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faltas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  data            DATE NOT NULL,
  motivo          TEXT NOT NULL,
  justificada     BOOLEAN NOT NULL DEFAULT false,
  criado_por      UUID REFERENCES usuarios(id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE falta_fotos (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  falta_id  UUID NOT NULL REFERENCES faltas(id) ON DELETE CASCADE,
  foto_url  TEXT NOT NULL
);

-- ============================================================
-- TROCA DE PLANTÃO (registrado só por gerente/admin)
-- ============================================================
CREATE TABLE trocas_plantao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id        TEXT NOT NULL REFERENCES unidades(id),
  turno             TEXT NOT NULL CHECK (turno IN ('dia','noite')),  -- vale pros dois lados
  funcionario1_id   UUID NOT NULL REFERENCES funcionarios(id),
  data1             DATE NOT NULL,
  funcionario2_id   UUID NOT NULL REFERENCES funcionarios(id),
  data2             DATE NOT NULL,
  motivo            TEXT NOT NULL,
  foto_url          TEXT,
  criado_por        UUID REFERENCES usuarios(id),
  registrado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (funcionario1_id <> funcionario2_id)
);

-- ============================================================
-- ALERTAS (calculados, mas também podem ser guardados como histórico)
-- ============================================================
CREATE TABLE alertas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  lancamento_id   UUID REFERENCES lancamentos(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('quebra','duplicado','atipico')),
  motivo          TEXT NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DADOS INICIAIS (seed) — as 6 unidades e as categorias fixas
-- ============================================================
INSERT INTO unidades (id, nome) VALUES
  ('beirol1','Beirol 1'), ('beirol2','Beirol 2'), ('jardim','Jardim'),
  ('pacoval','Pacoval'), ('nova','Nova Esperança'), ('santana','Santana');

INSERT INTO categorias_entrada (id, nome) VALUES
  ('dinheiro','Dinheiro'), ('debito','Cartão de débito'),
  ('credito','Cartão de crédito'), ('pix','Pix');

INSERT INTO categorias_saida (id, nome) VALUES
  ('quebra','Falta de caixa / quebra'), ('produtos','Produtos para revenda'),
  ('manutencao','Manutenção, enxoval e limpeza'), ('servicos','Serviços e terceiros'),
  ('pessoal','Pessoal (folha, diárias, bônus)'), ('fixas','Contas fixas (energia, internet, sistema)'),
  ('impostos','Impostos e taxas de cartão'), ('boletos','Boletos e notas (Pix)'),
  ('parcelado','Compras parceladas'), ('retirada','Retirada em espécie (sangria/diretor)'),
  ('notas_fiscais','Notas fiscais (rateio administrativo)'), ('outras','Outras despesas');

INSERT INTO itens_vistoria_catalogo (id, categoria, nome, na_rapida) VALUES
  ('garagem_limpa','garagem','Garagem limpa', true),
  ('forro_garagem','garagem','Forro da garagem em bom estado', false),
  ('luz_garagem','garagem','Iluminação da garagem funcionando', false),
  ('entrada_cliente','garagem','Entrada do cliente limpa', true),
  ('assento','banheiro','Assento sanitário limpo (ambos os lados)', false),
  ('odor_banheiro','banheiro','Banheiro sem odores', true),
  ('chao_banheiro','banheiro','Chão do banheiro limpo', true),
  ('rejunte','banheiro','Chuveiro/banheira com rejunte em bom estado', false),
  ('vidro_banheiro','banheiro','Vidro do banheiro limpo', false),
  ('banheira','banheiro','Banheira limpa', false),
  ('fios_chuveiro','banheiro','Chuveiro sem fios expostos', false),
  ('borda_banheira','banheiro','Borda da banheira limpa', false),
  ('parede_banheiro','banheiro','Parede do banheiro sem manchas', false),
  ('espelho_banheiro','banheiro','Espelho do banheiro limpo e sem manchas', false),
  ('vaso','banheiro','Vaso sanitário limpo', true),
  ('luz_banheiro','banheiro','Iluminação do banheiro funcionando', false),
  ('roupa_cama','quarto','Roupa de cama sem furos ou manchas', false),
  ('travesseiros','quarto','Travesseiros com capa', false),
  ('cama_feita','quarto','Cama feita corretamente', true),
  ('base_cama','quarto','Base da cama sem marcas', false),
  ('colchao','quarto','Colchão em boa condição', false),
  ('mdf_cama','quarto','MDF da cama sem arranhões ou manchas', false),
  ('paredes_limpas','quarto','Paredes limpas e livres de teias de aranha', false),
  ('paredes_dano','quarto','Paredes livres de arranhões e cortes', false),
  ('pintura','quarto','Pintura das paredes em boas condições', false),
  ('janelas','quarto','Vidros das janelas limpos e sem danos', false),
  ('portas','quarto','Portas abrindo e fechando corretamente', false),
  ('moveis','quarto','Sofá/mesa/cadeira em boas condições', false),
  ('balcao_mdf','quarto','Balcão de MDF em boa condição', false),
  ('espelhos','quarto','Espelhos em bom estado e limpos', false),
  ('interruptores','quarto','Interruptores de luz funcionando', false),
  ('telefone','quarto','Telefone em boas condições de funcionamento', false),
  ('controles','quarto','Controles do ar-condicionado/som/TV funcionando', false),
  ('iluminacao','quarto','Iluminação do quarto correta, sem lâmpada queimada', true),
  ('cheiro','quarto','Suíte com cheiro bom ou agradável', false),
  ('cardapio','quarto','Cardápio limpo', false),
  ('frigobar','consumo','Frigobar/minibar completo e reposto', true),
  ('toalhas_consumo','consumo','Toalhas repostas', false),
  ('higiene','consumo','Sabonete e produtos de higiene repostos', false),
  ('conveniencia','consumo','Preservativos e itens de conveniência repostos', false),
  ('consumo_conferido','consumo','Consumo do frigobar conferido', true);

-- ============================================================
-- PRODUTOS VENCIDOS, AVARIADOS OU PERDIDOS
-- ============================================================
CREATE TABLE produtos_vencidos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  produto         TEXT NOT NULL,
  motivo_tipo     TEXT NOT NULL CHECK (motivo_tipo IN ('vencido','avariado','perdido')),
  quantidade      INT NOT NULL CHECK (quantidade > 0),
  validade        DATE,
  prejuizo        NUMERIC(12,2) DEFAULT 0,
  foto_url        TEXT,
  criado_por      UUID REFERENCES usuarios(id),
  registrado_em   DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_produtos_vencidos_unidade_data ON produtos_vencidos(unidade_id, registrado_em);

-- ============================================================
-- Índices adicionais úteis pros relatórios
-- ============================================================
CREATE INDEX idx_faltas_unidade_data ON faltas(unidade_id, data);
CREATE INDEX idx_trocas_unidade_registrado ON trocas_plantao(unidade_id, registrado_em);
CREATE INDEX idx_contas_fixas_unidade_status ON contas_fixas(unidade_id, status);

-- ============================================================
-- CONFIGURAÇÃO DE SUÍTES E REVPAR/TREVPAR
-- ============================================================
CREATE TABLE suites_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  TEXT NOT NULL REFERENCES unidades(id),
  categoria   TEXT NOT NULL,          -- ex.: '1 estrela', '2 estrelas'...
  quantidade  INT NOT NULL CHECK (quantidade > 0)
);

CREATE TABLE revpar_registros (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id        TEXT NOT NULL REFERENCES unidades(id),
  inicio            DATE NOT NULL,
  fim               DATE NOT NULL,
  quantidade_total  INT NOT NULL,
  usos_total        INT NOT NULL,
  faturado_total    NUMERIC(12,2) NOT NULL,
  receita_extra     NUMERIC(12,2) NOT NULL DEFAULT 0,
  revpar_geral      NUMERIC(12,2) NOT NULL,
  trevpar           NUMERIC(12,2) NOT NULL,
  criado_por        UUID REFERENCES usuarios(id),
  registrado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- detalhe por categoria de suíte dentro de cada período de RevPAR
CREATE TABLE revpar_categorias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revpar_id         UUID NOT NULL REFERENCES revpar_registros(id) ON DELETE CASCADE,
  categoria         TEXT NOT NULL,
  quantidade        INT NOT NULL,
  usos              INT NOT NULL,
  faturado          NUMERIC(12,2) NOT NULL
);

-- ============================================================
-- MANUTENÇÃO DE TERCEIROS
-- ============================================================
CREATE TABLE manutencoes_terceiros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  servico         TEXT NOT NULL CHECK (servico IN
    ('maquina_lavar','maquina_secar','maquina_passar','camera','banheira','ar_condicionado','internet','outros')),
  especificacao   TEXT NOT NULL,
  prestador       TEXT NOT NULL,
  suite           TEXT,
  criado_por      UUID REFERENCES usuarios(id),
  registrado_em   DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX idx_manutencoes_unidade_data ON manutencoes_terceiros(unidade_id, registrado_em);

-- ============================================================
-- BOLETOS ADMINISTRATIVO (central, o diretor cadastra e depois lança pras unidades)
-- ============================================================
CREATE TABLE boletos_admin (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao           TEXT NOT NULL,
  valor               NUMERIC(12,2) NOT NULL,
  vencimento          DATE NOT NULL,
  foto_url            TEXT,
  codigo_barras       TEXT,
  pix_copia_cola      TEXT,
  status              TEXT NOT NULL DEFAULT 'nao_lancado'
    CHECK (status IN ('nao_lancado','lancado_parcial','lancado_completo')),
  criado_por          UUID REFERENCES usuarios(id),
  registrado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quais unidades já receberam o lançamento desse boleto central, e por qual valor
CREATE TABLE boletos_admin_lancamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boleto_admin_id UUID NOT NULL REFERENCES boletos_admin(id) ON DELETE CASCADE,
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  valor           NUMERIC(12,2) NOT NULL,
  boleto_id       UUID REFERENCES boletos(id),   -- o boleto real criado na unidade
  lancado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONSUMO DO PLANTÃO
-- ============================================================
CREATE TABLE consumos_plantao (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id    TEXT NOT NULL REFERENCES unidades(id),
  turno         TEXT NOT NULL CHECK (turno IN ('dia','noite')),
  data          DATE NOT NULL,
  criado_por    UUID REFERENCES usuarios(id),
  registrado_em DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE consumo_plantao_itens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumo_plantao_id  UUID NOT NULL REFERENCES consumos_plantao(id) ON DELETE CASCADE,
  produto             TEXT NOT NULL,
  quantidade          INT NOT NULL CHECK (quantidade > 0)
);
CREATE INDEX idx_consumos_unidade_data ON consumos_plantao(unidade_id, registrado_em);

-- ============================================================
-- NOTAS FISCAIS (rateio administrativo — só o diretor lança)
-- ============================================================
CREATE TABLE notas_fiscais (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao     TEXT NOT NULL,
  valor_total   NUMERIC(12,2) NOT NULL,
  data          DATE NOT NULL,
  foto_url      TEXT,
  criado_por    UUID REFERENCES usuarios(id),
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- como a nota foi dividida entre as unidades (cada linha também gera um lancamento próprio)
CREATE TABLE notas_fiscais_unidades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id  UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  unidade_id      TEXT NOT NULL REFERENCES unidades(id),
  valor           NUMERIC(12,2) NOT NULL,
  lancamento_id   UUID REFERENCES lancamentos(id)
);

ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_nota_fiscal
  FOREIGN KEY (nota_fiscal_id) REFERENCES notas_fiscais(id);

-- ============================================================
-- HISTÓRICO DE EXCLUSÕES (auditoria — só o diretor vê)
-- ============================================================
CREATE TABLE historico_exclusoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            TEXT NOT NULL,     -- 'Lançamento', 'Comprovante', 'Funcionário', 'Boleto', etc.
  descricao       TEXT NOT NULL,     -- o que era, num texto legível (o registro original já não existe mais)
  unidade_id      TEXT REFERENCES unidades(id),
  excluido_por    UUID NOT NULL REFERENCES usuarios(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_exclusoes_data ON historico_exclusoes(criado_em);
