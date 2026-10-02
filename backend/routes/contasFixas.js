const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM contas_fixas WHERE unidade_id=$1 ORDER BY (status=\'pendente\') DESC, vencimento',
    [req.query.unidade_id]
  );
  res.json(rows);
});

router.post('/', exigirUnidade, exigirPapel('gerente', 'admin'), async (req, res) => {
  const { unidade_id, tipo, competencia, descricao, valor, vencimento, foto_url } = req.body;
  if (!tipo || !descricao || !valor || !vencimento) {
    return res.status(400).json({ erro: 'Preencha tipo, descrição, valor e vencimento.' });
  }
  // o formulário manda "AAAA-MM" (campo tipo mês); a coluna é DATE, então completa com o dia 1
  const competenciaData = competencia ? (competencia.length === 7 ? competencia + '-01' : competencia) : null;
  const { rows } = await db.query(
    `INSERT INTO contas_fixas (unidade_id, tipo, competencia, descricao, valor, vencimento, foto_url, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [unidade_id, tipo, competenciaData, descricao, valor, vencimento, foto_url || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.post('/:id/marcar-pago', exigirAcessoAoRegistro('contas_fixas'), exigirPapel('gerente', 'admin'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM contas_fixas WHERE id=$1', [req.params.id]);
  const conta = rows[0];
  if (!conta) return res.status(404).json({ erro: 'Conta não encontrada.' });
  const hoje = hojeBelem();
  const categoria = conta.tipo === 'imposto' ? 'impostos' : 'fixas';

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: lanc } = await client.query(
      `INSERT INTO lancamentos (unidade_id, data, turno, tipo, categoria_id, valor, observacao, lancado_por, foto_url, registrado_em)
       VALUES ($1,$2,'dia','saida',$3,$4,$5,$6,$7,$2) RETURNING id`,
      [conta.unidade_id, hoje, categoria, conta.valor, `${conta.tipo} — ${conta.descricao}`, req.usuario.id, conta.foto_url]
    );
    await client.query(
      'UPDATE contas_fixas SET status=\'pago\', data_pagamento=$1, lancamento_id=$2 WHERE id=$3',
      [hoje, lanc[0].id, req.params.id]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Apagar só a foto do comprovante — exige a permissão 'apagar_comprovantes'
router.delete('/:id/foto', exigirAcessoAoRegistro('contas_fixas'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('apagar_comprovantes')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra apagar comprovantes. Fale com o diretor.' });
  }
  const { rows } = await db.query('UPDATE contas_fixas SET foto_url=NULL WHERE id=$1 RETURNING *', [req.params.id]);
  const c = rows[0];
  if (c) {
    await registrarExclusao({
      tipo: 'Comprovante', descricao: `Foto apagada — Impostos e Energia: ${c.descricao}`,
      unidade_id: c.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json(c);
});

// Excluir — exige a permissão 'excluir_boletos' (o diretor sempre tem)
router.delete('/:id', exigirAcessoAoRegistro('contas_fixas'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('excluir_boletos')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra excluir contas. Fale com o diretor.' });
  }
  const { rows } = await db.query('SELECT * FROM contas_fixas WHERE id=$1', [req.params.id]);
  const c = rows[0];
  await db.query('DELETE FROM contas_fixas WHERE id=$1', [req.params.id]);
  if (c) {
    await registrarExclusao({
      tipo: 'Imposto/Conta fixa', descricao: `${c.tipo} — ${c.descricao} — R$ ${c.valor} — ${c.status === 'pago' ? 'já estava paga' : 'pendente'}`,
      unidade_id: c.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
