const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows: consumos } = await db.query(
    'SELECT * FROM consumos_plantao WHERE unidade_id=$1 ORDER BY registrado_em DESC', [req.query.unidade_id]
  );
  for (const c of consumos) {
    const { rows: itens } = await db.query('SELECT produto, quantidade FROM consumo_plantao_itens WHERE consumo_plantao_id=$1', [c.id]);
    c.itens = itens;
  }
  res.json(consumos);
});

router.post('/', exigirUnidade, async (req, res) => {
  const { unidade_id, turno, data, itens } = req.body;
  if (!Array.isArray(itens) || !itens.length) {
    return res.status(400).json({ erro: 'Adicione pelo menos um item.' });
  }
  const { rows } = await db.query(
    'INSERT INTO consumos_plantao (unidade_id, turno, data, criado_por) VALUES ($1,$2,$3,$4) RETURNING *',
    [unidade_id, turno, data || hojeBelem(), req.usuario.id]
  );
  for (const it of itens) {
    await db.query(
      'INSERT INTO consumo_plantao_itens (consumo_plantao_id, produto, quantidade) VALUES ($1,$2,$3)',
      [rows[0].id, it.produto, it.quantidade]
    );
  }
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('consumos_plantao'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM consumos_plantao WHERE id=$1', [req.params.id]);
  const c = rows[0];
  const { rows: itens } = await db.query('SELECT produto, quantidade FROM consumo_plantao_itens WHERE consumo_plantao_id=$1', [req.params.id]);
  await db.query('DELETE FROM consumos_plantao WHERE id=$1', [req.params.id]);
  if (c) {
    await registrarExclusao({
      tipo: 'Consumo do plantão',
      descricao: `${c.data} — ${itens.map(it => `${it.quantidade}x ${it.produto}`).join(', ')}`,
      unidade_id: c.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

// ranking dos produtos mais consumidos nos últimos 30 dias
router.get('/ranking', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.produto, SUM(i.quantidade)::int AS total
     FROM consumo_plantao_itens i
     JOIN consumos_plantao c ON c.id = i.consumo_plantao_id
     WHERE c.unidade_id=$1 AND c.registrado_em >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY i.produto ORDER BY total DESC`,
    [req.query.unidade_id]
  );
  res.json(rows);
});

module.exports = router;
