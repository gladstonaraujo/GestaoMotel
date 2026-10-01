const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    `SELECT f.*, COALESCE(array_agg(ff.foto_url) FILTER (WHERE ff.foto_url IS NOT NULL), '{}') AS fotos_url
     FROM faltas f
     LEFT JOIN falta_fotos ff ON ff.falta_id = f.id
     WHERE f.unidade_id=$1
     GROUP BY f.id
     ORDER BY f.data DESC`,
    [req.query.unidade_id]
  );
  res.json(rows);
});

router.post('/', exigirUnidade, async (req, res) => {
  const { unidade_id, funcionario_id, data, motivo, justificada, fotos_url } = req.body;
  if (!funcionario_id || !motivo) {
    return res.status(400).json({ erro: 'Escolha o funcionário e descreva o motivo.' });
  }
  if (justificada && (!fotos_url || fotos_url.length === 0)) {
    return res.status(400).json({ erro: 'Anexe o atestado — obrigatório pra falta justificada.' });
  }
  const { rows } = await db.query(
    `INSERT INTO faltas (funcionario_id, unidade_id, data, motivo, justificada, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [funcionario_id, unidade_id, data || hojeBelem(), motivo, !!justificada, req.usuario.id]
  );
  for (const url of fotos_url || []) {
    await db.query('INSERT INTO falta_fotos (falta_id, foto_url) VALUES ($1,$2)', [rows[0].id, url]);
  }
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('faltas'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT f.*, fu.nome AS funcionario_nome FROM faltas f
     LEFT JOIN funcionarios fu ON fu.id = f.funcionario_id WHERE f.id=$1`,
    [req.params.id]
  );
  const falta = rows[0];
  await db.query('DELETE FROM faltas WHERE id=$1', [req.params.id]);
  if (falta) {
    await registrarExclusao({
      tipo: 'Falta', descricao: `${falta.funcionario_nome || '(removido)'} — ${falta.motivo} (${falta.data})`,
      unidade_id: falta.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
