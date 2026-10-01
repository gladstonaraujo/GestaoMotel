const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM funcionarios WHERE unidade_id=$1 AND ativo=true ORDER BY nome',
    [req.query.unidade_id]
  );
  res.json(rows);
});

router.post('/', exigirUnidade, exigirPapel('gerente', 'admin'), async (req, res) => {
  const { unidade_id, nome, cargo, telefone, documento, data_admissao } = req.body;
  if (!nome || !cargo) return res.status(400).json({ erro: 'Informe nome e cargo.' });
  const { rows } = await db.query(
    `INSERT INTO funcionarios (unidade_id, nome, cargo, telefone, documento, data_admissao, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [unidade_id, nome, cargo, telefone || null, documento || null, data_admissao || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('funcionarios'), exigirPapel('gerente', 'admin'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM funcionarios WHERE id=$1', [req.params.id]);
  const f = rows[0];
  await db.query('UPDATE funcionarios SET ativo=false WHERE id=$1', [req.params.id]);
  if (f) {
    await registrarExclusao({
      tipo: 'Funcionário', descricao: `${f.nome} — ${f.cargo}`,
      unidade_id: f.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
