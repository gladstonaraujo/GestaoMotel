-- Migração 2026-10-02 — unidades passam a poder ser desativadas pela tela "Unidades".
-- Pode rodar mais de uma vez.
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT true;
