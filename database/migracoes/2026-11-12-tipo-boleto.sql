-- Migração 2026-11-12 — boletos passam a ter um tipo (fornecedor, energia, água, internet,
-- imposto, aluguel ou outro). Os boletos já cadastrados ficam como "outro".
-- Pode rodar mais de uma vez.
--   psql "<DATABASE_URL>" -f database/migracoes/2026-11-12-tipo-boleto.sql
ALTER TABLE boletos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'outro';
