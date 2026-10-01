const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM manutencoes_terceiros WHERE unidade_id=$1 ORDER BY registrado_em DESC',
    [req.query.unidade_id]
  );
  res.json(rows);
});

router.post('/', exigirUnidade, async (req, res) => {
  const { unidade_id, servico, especificacao, prestador, suite } = req.body;
  if (!especificacao || !prestador) {
    return res.status(400).json({ erro: 'Preencha a especificação e o prestador.' });
  }
  const { rows } = await db.query(
    `INSERT INTO manutencoes_terceiros (unidade_id, servico, especificacao, prestador, suite, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [unidade_id, servico, especificacao, prestador, suite || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('manutencoes_terceiros'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM manutencoes_terceiros WHERE id=$1', [req.params.id]);
  const m = rows[0];
  await db.query('DELETE FROM manutencoes_terceiros WHERE id=$1', [req.params.id]);
  if (m) {
    await registrarExclusao({
      tipo: 'Manutenção de terceiros',
      descricao: `${m.servico} — ${m.especificacao}${m.suite ? ' (suíte ' + m.suite + ')' : ''}`,
      unidade_id: m.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

// alerta de prioridade: mesmo serviço + mesma suíte, 2+ vezes em 30 dias
router.get('/alertas', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    `SELECT servico, suite, COUNT(*)::int AS quantidade
     FROM manutencoes_terceiros
     WHERE unidade_id=$1 AND registrado_em >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY servico, suite HAVING COUNT(*) >= 2 ORDER BY quantidade DESC`,
    [req.query.unidade_id]
  );
  res.json(rows);
});

module.exports = router;
