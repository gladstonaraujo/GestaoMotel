const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const router = express.Router();
router.use(autenticar);

// ---- Configuração de suítes (só o diretor edita, todo mundo com acesso lê) ----
router.get('/suites', exigirUnidade, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM suites_config WHERE unidade_id=$1 ORDER BY categoria', [req.query.unidade_id]);
  res.json(rows);
});
router.post('/suites', exigirUnidade, exigirPapel('admin'), async (req, res) => {
  const { unidade_id, categoria, quantidade } = req.body;
  const { rows } = await db.query(
    'INSERT INTO suites_config (unidade_id, categoria, quantidade) VALUES ($1,$2,$3) RETURNING *',
    [unidade_id, categoria, quantidade]
  );
  res.status(201).json(rows[0]);
});
router.delete('/suites/:id', exigirAcessoAoRegistro('suites_config'), exigirPapel('admin'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM suites_config WHERE id=$1', [req.params.id]);
  const s = rows[0];
  await db.query('DELETE FROM suites_config WHERE id=$1', [req.params.id]);
  if (s) {
    await registrarExclusao({
      tipo: 'Categoria de suíte', descricao: `${s.categoria} (${s.quantidade} suíte(s))`,
      unidade_id: s.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

// ---- Registros de RevPAR ----
router.get('/', exigirUnidade, async (req, res) => {
  const { rows: registros } = await db.query(
    'SELECT * FROM revpar_registros WHERE unidade_id=$1 ORDER BY registrado_em DESC', [req.query.unidade_id]
  );
  for (const r of registros) {
    const { rows: cats } = await db.query('SELECT * FROM revpar_categorias WHERE revpar_id=$1', [r.id]);
    r.porCategoria = cats;
  }
  res.json(registros);
});

router.post('/', exigirUnidade, async (req, res) => {
  const { unidade_id, inicio, fim, receita_extra = 0, porCategoria } = req.body;
  if (!inicio || !fim || !Array.isArray(porCategoria) || !porCategoria.length) {
    return res.status(400).json({ erro: 'Preencha o período e ao menos uma categoria.' });
  }
  const dias = Math.round((new Date(fim) - new Date(inicio)) / 86400000) + 1;
  const quantidadeTotal = porCategoria.reduce((s, c) => s + c.quantidade, 0);
  const usosTotal = porCategoria.reduce((s, c) => s + c.usos, 0);
  const faturadoTotal = porCategoria.reduce((s, c) => s + c.faturado, 0);
  const revparGeral = quantidadeTotal && dias ? faturadoTotal / (quantidadeTotal * dias) : 0;
  const trevpar = quantidadeTotal && dias ? (faturadoTotal + receita_extra) / (quantidadeTotal * dias) : 0;

  const { rows } = await db.query(
    `INSERT INTO revpar_registros (unidade_id, inicio, fim, quantidade_total, usos_total, faturado_total, receita_extra, revpar_geral, trevpar, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [unidade_id, inicio, fim, quantidadeTotal, usosTotal, faturadoTotal, receita_extra, revparGeral, trevpar, req.usuario.id]
  );
  for (const c of porCategoria) {
    await db.query(
      'INSERT INTO revpar_categorias (revpar_id, categoria, quantidade, usos, faturado) VALUES ($1,$2,$3,$4,$5)',
      [rows[0].id, c.categoria, c.quantidade, c.usos, c.faturado]
    );
  }
  res.status(201).json(rows[0]);
});

router.delete('/:id', exigirAcessoAoRegistro('revpar_registros'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM revpar_registros WHERE id=$1', [req.params.id]);
  const r = rows[0];
  await db.query('DELETE FROM revpar_registros WHERE id=$1', [req.params.id]);
  if (r) {
    await registrarExclusao({
      tipo: 'RevPAR', descricao: `Período ${r.inicio} a ${r.fim}`,
      unidade_id: r.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
