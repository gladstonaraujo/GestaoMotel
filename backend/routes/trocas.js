const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM trocas_plantao WHERE unidade_id=$1 ORDER BY registrado_em DESC',
    [req.query.unidade_id]
  );
  res.json(rows);
});

// só gerente/admin lançam (regra do front-end)
router.post('/', exigirUnidade, exigirPapel('gerente', 'admin'), async (req, res) => {
  const { unidade_id, turno, funcionario1_id, data1, funcionario2_id, data2, motivo, foto_url } = req.body;
  if (!funcionario1_id || !funcionario2_id || funcionario1_id === funcionario2_id) {
    return res.status(400).json({ erro: 'Escolha dois funcionários diferentes.' });
  }
  if (!data1 || !data2) return res.status(400).json({ erro: 'Preencha as duas datas de plantão.' });
  if (!motivo) return res.status(400).json({ erro: 'Motivo é obrigatório.' });

  const { rows } = await db.query(
    `INSERT INTO trocas_plantao (unidade_id, turno, funcionario1_id, data1, funcionario2_id, data2, motivo, foto_url, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [unidade_id, turno, funcionario1_id, data1, funcionario2_id, data2, motivo, foto_url || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('trocas_plantao'), exigirPapel('gerente', 'admin'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, f1.nome AS funcionario1_nome, f2.nome AS funcionario2_nome FROM trocas_plantao t
     LEFT JOIN funcionarios f1 ON f1.id = t.funcionario1_id
     LEFT JOIN funcionarios f2 ON f2.id = t.funcionario2_id
     WHERE t.id=$1`,
    [req.params.id]
  );
  const t = rows[0];
  await db.query('DELETE FROM trocas_plantao WHERE id=$1', [req.params.id]);
  if (t) {
    await registrarExclusao({
      tipo: 'Troca de plantão',
      descricao: `${t.funcionario1_nome || '—'} x ${t.funcionario2_nome || '—'} (${t.turno === 'dia' ? 'Dia' : 'Noite'})`,
      unidade_id: t.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
