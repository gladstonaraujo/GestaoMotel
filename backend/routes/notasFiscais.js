const express = require('express');
const db = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem } = require('../utils/data');

const router = express.Router();
router.use(autenticar, exigirPapel('admin')); // só o diretor/administrativo lança

router.get('/', async (req, res) => {
  const { rows: notas } = await db.query('SELECT * FROM notas_fiscais ORDER BY registrado_em DESC');
  for (const n of notas) {
    const { rows: unidades } = await db.query(
      'SELECT unidade_id, valor FROM notas_fiscais_unidades WHERE nota_fiscal_id=$1', [n.id]
    );
    n.unidades = unidades;
  }
  res.json(notas);
});

// cria a nota central E já gera um lançamento de saída em cada unidade rateada
router.post('/', async (req, res) => {
  const { descricao, valor_total, data, foto_url, unidades } = req.body;
  if (!descricao || !valor_total || !Array.isArray(unidades) || !unidades.length) {
    return res.status(400).json({ erro: 'Preencha descrição, valor total e marque pelo menos uma unidade.' });
  }
  const { rows } = await db.query(
    `INSERT INTO notas_fiscais (descricao, valor_total, data, foto_url, criado_por)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [descricao, valor_total, data || hojeBelem(), foto_url || null, req.usuario.id]
  );
  const nota = rows[0];

  for (const u of unidades) { // [{ unidade_id, valor }]
    const { rows: lanc } = await db.query(
      `INSERT INTO lancamentos (unidade_id, data, turno, tipo, categoria_id, valor, observacao, lancado_por, foto_url, registrado_em, nota_fiscal_id)
       VALUES ($1,$2,'dia','saida','notas_fiscais',$3,$4,$5,$6,$2,$7) RETURNING id`,
      [u.unidade_id, nota.data, u.valor, `Nota fiscal: ${descricao}`, req.usuario.id, foto_url || null, nota.id]
    );
    await db.query(
      'INSERT INTO notas_fiscais_unidades (nota_fiscal_id, unidade_id, valor, lancamento_id) VALUES ($1,$2,$3,$4)',
      [nota.id, u.unidade_id, u.valor, lanc[0].id]
    );
  }
  res.status(201).json(nota);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM notas_fiscais WHERE id=$1', [req.params.id]);
  const n = rows[0];
  const { rows: unidades } = await db.query('SELECT unidade_id FROM notas_fiscais_unidades WHERE nota_fiscal_id=$1', [req.params.id]);
  // apaga também os lançamentos gerados em cada unidade, igual o front-end faz —
  // precisa soltar a referência em notas_fiscais_unidades antes, senão a FK barra o DELETE dos lançamentos
  await db.query('DELETE FROM notas_fiscais_unidades WHERE nota_fiscal_id=$1', [req.params.id]);
  await db.query('DELETE FROM lancamentos WHERE nota_fiscal_id=$1', [req.params.id]);
  await db.query('DELETE FROM notas_fiscais WHERE id=$1', [req.params.id]);
  if (n) {
    await registrarExclusao({
      tipo: 'Nota fiscal', descricao: `${n.descricao} — R$ ${n.valor_total} (rateada entre ${unidades.length} unidade(s))`,
      unidade_id: null, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
