-- Migração 2026-11-13 — cria a tabela de categorias de produtos, usada pela tela de
-- categorias (backend/routes/produtos.js), que faltava no schema.sql. Já cadastra as
-- categorias que os produtos existentes usam. Pode rodar mais de uma vez.
--   psql "<DATABASE_URL>" -f database/migracoes/2026-11-13-produtos-categorias.sql
CREATE TABLE IF NOT EXISTS produtos_categorias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_categorias_nome_lower
  ON produtos_categorias (lower(trim(nome)));

INSERT INTO produtos_categorias (nome)
SELECT DISTINCT ON (lower(trim(categoria))) trim(categoria)
FROM produtos
WHERE categoria IS NOT NULL AND trim(categoria) <> ''
ORDER BY lower(trim(categoria)), trim(categoria)
ON CONFLICT DO NOTHING;
