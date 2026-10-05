-- ============================================================
-- Migração 2026-10-02 — corrige dados gravados antes das correções de fotos e boletos
-- Pode rodar mais de uma vez sem problema (só mexe no que ainda está errado).
--   psql "<DATABASE_URL>" -f database/migracoes/2026-10-02-fotos-e-boletos.sql
-- ============================================================
BEGIN;

-- 1) Fotos: o upload gravava o link como "http://localhost:3001/uploads/...", que só abre no
--    próprio servidor. Troca pelo caminho relativo "/uploads/...", que abre em qualquer aparelho.
UPDATE lancamentos        SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE boletos            SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE contas_fixas       SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE vistoria_fotos     SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE falta_fotos        SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE trocas_plantao     SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE produtos_vencidos  SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE boletos_admin      SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';
UPDATE notas_fiscais      SET foto_url = regexp_replace(foto_url, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/', '/uploads/') WHERE foto_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';

-- 2) Boletos pagos: a saída gerada ficava sem forma de pagamento, e o caixa trata "sem forma" como
--    dinheiro — um boleto pago por Pix diminuía o "Dinheiro em caixa". Até agora todo boleto era
--    marcado como "pago via Pix" (a descrição gravada começa com "Pix —"), então marca essas saídas como Pix.
UPDATE lancamentos l
   SET forma_pagamento_saida = 'pix'
  FROM boletos b
 WHERE b.lancamento_id = l.id
   AND l.forma_pagamento_saida IS NULL;

COMMIT;
