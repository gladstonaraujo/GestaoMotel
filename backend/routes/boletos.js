const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, cc.valor_total_conjunto, u.nome AS criado_por_nome
     FROM boletos b
     LEFT JOIN compras_conjuntas cc ON cc.id = b.compra_conjunta_id
     LEFT JOIN usuarios u ON u.id = b.criado_por
     WHERE b.unidade_id=$1
     ORDER BY (b.status='pendente') DESC, b.vencimento`,
    [req.query.unidade_id]
  );
  res.json(rows);
});

router.post('/', exigirUnidade, exigirPapel('gerente', 'admin'), async (req, res) => {
  const { unidade_id, descricao, valor, vencimento, foto_url, codigo_barras, pix_copia_cola, compra_conjunta_id } = req.body;
  if (!descricao || !valor || !vencimento) {
    return res.status(400).json({ erro: 'Preencha descrição, valor e vencimento.' });
  }
  const { rows } = await db.query(
    `INSERT INTO boletos (unidade_id, descricao, valor, vencimento, foto_url, codigo_barras, pix_copia_cola, compra_conjunta_id, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [unidade_id, descricao, valor, vencimento, foto_url || null, codigo_barras || null, pix_copia_cola || null, compra_conjunta_id || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

// Compra conjunta: cria o registro de agrupamento e um boleto por unidade, todos ligados a ele
router.post('/conjunta', exigirPapel('gerente', 'admin'), async (req, res) => {
  const { descricao, vencimento, foto_url, codigo_barras, pix_copia_cola, unidades } = req.body;
  if (!descricao || !vencimento || !Array.isArray(unidades) || !unidades.length) {
    return res.status(400).json({ erro: 'Preencha descrição, vencimento e pelo menos uma unidade.' });
  }
  if (unidades.some(u => !u.unidade_id || !(u.valor > 0))) {
    return res.status(400).json({ erro: 'Informe o valor de cada unidade marcada.' });
  }
  const semAcesso = unidades.some(u => !req.usuario.todas_unidades && !req.usuario.unidades.includes(u.unidade_id));
  if (semAcesso) {
    return res.status(403).json({ erro: 'Você não tem acesso a uma das unidades marcadas.' });
  }
  const valorTotal = unidades.reduce((s, u) => s + Number(u.valor), 0);

  const { rows: conjuntaRows } = await db.query(
    `INSERT INTO compras_conjuntas (descricao, valor_total_conjunto) VALUES ($1,$2) RETURNING id`,
    [descricao, valorTotal]
  );
  const compraConjuntaId = conjuntaRows[0].id;

  const criados = [];
  for (const u of unidades) {
    const { rows } = await db.query(
      `INSERT INTO boletos (unidade_id, descricao, valor, vencimento, foto_url, codigo_barras, pix_copia_cola, compra_conjunta_id, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [u.unidade_id, descricao, u.valor, vencimento, foto_url || null, codigo_barras || null, pix_copia_cola || null, compraConjuntaId, req.usuario.id]
    );
    criados.push(rows[0]);
  }
  res.status(201).json(criados);
});

// Marca como pago e já gera a saída correspondente no caixa
router.post('/:id/marcar-pago', exigirAcessoAoRegistro('boletos'), exigirPapel('gerente', 'admin'), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM boletos WHERE id=$1', [req.params.id]);
  const boleto = rows[0];
  if (!boleto) return res.status(404).json({ erro: 'Boleto não encontrado.' });
  const hoje = hojeBelem();

  const { rows: lanc } = await db.query(
    `INSERT INTO lancamentos (unidade_id, data, turno, tipo, categoria_id, valor, observacao, lancado_por, foto_url, registrado_em)
     VALUES ($1,$2,'dia','saida','boletos',$3,$4,$5,$6,$2) RETURNING id`,
    [boleto.unidade_id, hoje, boleto.valor, `Pix — ${boleto.descricao} (venc. ${boleto.vencimento})`, req.usuario.id, boleto.foto_url]
  );
  await db.query(
    'UPDATE boletos SET status=\'pago\', data_pagamento=$1, lancamento_id=$2 WHERE id=$3',
    [hoje, lanc[0].id, req.params.id]
  );
  res.json({ ok: true });
});

// Apagar só a foto do comprovante — exige a permissão 'apagar_comprovantes'
router.delete('/:id/foto', exigirAcessoAoRegistro('boletos'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('apagar_comprovantes')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra apagar comprovantes. Fale com o diretor.' });
  }
  const { rows } = await db.query('UPDATE boletos SET foto_url=NULL WHERE id=$1 RETURNING *', [req.params.id]);
  const b = rows[0];
  if (b) {
    await registrarExclusao({
      tipo: 'Comprovante', descricao: `Foto apagada — Boletos e Pix: ${b.descricao}`,
      unidade_id: b.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json(b);
});

// Excluir — exige a permissão 'excluir_boletos' (o diretor sempre tem)
router.delete('/:id', exigirAcessoAoRegistro('boletos'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('excluir_boletos')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra excluir boletos. Fale com o diretor.' });
  }
  const { rows } = await db.query('SELECT * FROM boletos WHERE id=$1', [req.params.id]);
  const b = rows[0];
  await db.query('DELETE FROM boletos WHERE id=$1', [req.params.id]);
  if (b) {
    await registrarExclusao({
      tipo: 'Boleto', descricao: `${b.descricao} — R$ ${b.valor} — ${b.status === 'pago' ? 'já estava pago' : 'pendente'}`,
      unidade_id: b.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
