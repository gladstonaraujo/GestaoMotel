const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const router = express.Router();
router.use(autenticar, exigirPapel('gerente', 'admin')); // só gerência e diretor mexem aqui

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM produtos_vencidos WHERE unidade_id=$1 ORDER BY registrado_em DESC',
    [req.query.unidade_id]
  );
  res.json(rows);
});

router.post('/', exigirUnidade, async (req, res) => {
  const { unidade_id, produto, motivo_tipo, quantidade, validade, prejuizo, foto_url } = req.body;
  if (!produto) return res.status(400).json({ erro: 'Informe o produto.' });
  const { rows } = await db.query(
    `INSERT INTO produtos_vencidos (unidade_id, produto, motivo_tipo, quantidade, validade, prejuizo, foto_url, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [unidade_id, produto, motivo_tipo || 'vencido', quantidade || 1, validade || null, prejuizo || 0, foto_url || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('produtos_vencidos'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM produtos_vencidos WHERE id=$1', [req.params.id]);
  const p = rows[0];
  await db.query('DELETE FROM produtos_vencidos WHERE id=$1', [req.params.id]);
  if (p) {
    await registrarExclusao({
      tipo: 'Produto vencido', descricao: `${p.produto} — ${p.motivo_tipo} (qtd ${p.quantidade})`,
      unidade_id: p.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

// ranking dos produtos que mais vencem, últimos N dias (padrão 30)
router.get('/ranking', exigirUnidade, async (req, res) => {
  const dias = parseInt(req.query.dias || '30', 10);
  const { rows } = await db.query(
    `SELECT produto, SUM(quantidade)::int AS total_quantidade, COALESCE(SUM(prejuizo),0)::numeric(12,2) AS total_prejuizo
     FROM produtos_vencidos
     WHERE unidade_id=$1 AND registrado_em >= CURRENT_DATE - ($2 || ' days')::interval
     GROUP BY produto ORDER BY total_quantidade DESC LIMIT 6`,
    [req.query.unidade_id, dias]
  );
  res.json(rows);
});

module.exports = router;
