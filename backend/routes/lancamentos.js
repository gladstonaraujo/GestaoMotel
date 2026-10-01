const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem } = require('../utils/data');
const { dataValida, valorPositivo, texto, primeiroErro } = require('../utils/validar');

const router = express.Router();
router.use(autenticar);

// Lista lançamentos de uma unidade num intervalo de datas (?unidade_id=&de=&ate=)
router.get('/', exigirUnidade, async (req, res) => {
  const { unidade_id, de, ate } = req.query;
  const { rows } = await db.query(
    `SELECT l.*, u.nome AS lancado_por_nome, ue.nome AS editado_por_nome
     FROM lancamentos l
     LEFT JOIN usuarios u ON u.id = l.lancado_por
     LEFT JOIN usuarios ue ON ue.id = l.editado_por
     WHERE l.unidade_id=$1 AND l.data BETWEEN $2 AND $3
     ORDER BY l.data DESC, l.criado_em DESC`,
    [unidade_id, de || '1900-01-01', ate || '2999-12-31']
  );
  res.json(rows);
});

router.post('/', exigirUnidade, async (req, res) => {
  const {
    unidade_id, data, turno, tipo, categoria_id, valor, observacao,
    foto_url, forma_pagamento_saida, compra_parcelada_id, parcela_numero, rateio_valor_total
  } = req.body;

  if (!data || !turno || !tipo || !categoria_id || !valor) {
    return res.status(400).json({ erro: 'Preencha data, turno, tipo, categoria e valor.' });
  }
  const erroEntrada = primeiroErro([
    [dataValida(data), 'Data inválida.'],
    [['dia', 'noite'].includes(turno), 'Turno inválido.'],
    [['entrada', 'saida'].includes(tipo), 'Tipo inválido.'],
    [valorPositivo(valor), 'Informe um valor maior que zero.'],
    [texto(categoria_id, 60), 'Categoria inválida.'],
    [observacao == null || texto(observacao, 500), 'Observação muito longa (máximo 500 caracteres).'],
    [forma_pagamento_saida == null || ['dinheiro', 'pix'].includes(forma_pagamento_saida), 'Forma de pagamento inválida.'],
  ]);
  if (erroEntrada) return res.status(400).json({ erro: erroEntrada });
  // regra: só gerente/admin escolhem data diferente de hoje
  const hoje = hojeBelem();
  const dataAlterada = data !== hoje;
  if (dataAlterada && !['gerente', 'admin'].includes(req.usuario.papel)) {
    return res.status(403).json({ erro: 'Só gerente e diretor podem lançar em outra data.' });
  }
  // regra: falta de caixa e retirada em espécie exigem observação; qualquer outra saída (gerente/admin) exige foto
  const categoriasSemFotoObrigatoria = ['quebra', 'retirada'];
  if (tipo === 'saida' && categoriasSemFotoObrigatoria.includes(categoria_id) && !observacao) {
    return res.status(400).json({ erro: 'Descreva o motivo — obrigatório pra essa categoria.' });
  }
  const podeAnexarFoto = ['gerente', 'admin'].includes(req.usuario.papel);
  if (tipo === 'saida' && !categoriasSemFotoObrigatoria.includes(categoria_id) && podeAnexarFoto && !foto_url) {
    return res.status(400).json({ erro: 'Anexe a foto da nota fiscal — obrigatório em toda saída.' });
  }
  // retirada em espécie e falta de caixa são sempre em dinheiro, nunca Pix
  const formaPagamento = categoriasSemFotoObrigatoria.includes(categoria_id) ? 'dinheiro' : (forma_pagamento_saida || 'dinheiro');

  const { rows } = await db.query(
    `INSERT INTO lancamentos
       (unidade_id, data, turno, tipo, categoria_id, valor, observacao, lancado_por, foto_url,
        forma_pagamento_saida, data_alterada, registrado_em, compra_parcelada_id, parcela_numero, rateio_valor_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [unidade_id, data, turno, tipo, categoria_id, valor, observacao || null, req.usuario.id, foto_url || null,
     tipo === 'saida' ? formaPagamento : null, dataAlterada, hoje, compra_parcelada_id || null, parcela_numero || null, rateio_valor_total || null]
  );
  res.status(201).json(rows[0]);
});

// Editar um lançamento já salvo (categoria, turno, valor, observação) — exige a permissão 'editar_valores'
router.put('/:id', exigirAcessoAoRegistro('lancamentos'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('editar_valores')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra editar valores. Fale com o diretor.' });
  }
  const { categoria_id, turno, valor, observacao } = req.body;
  const erroEdicao = primeiroErro([
    [valorPositivo(valor), 'Informe um valor válido.'],
    [['dia', 'noite'].includes(turno), 'Turno inválido.'],
    [texto(categoria_id, 60), 'Categoria inválida.'],
    [observacao == null || texto(observacao, 500), 'Observação muito longa (máximo 500 caracteres).'],
  ]);
  if (erroEdicao) return res.status(400).json({ erro: erroEdicao });
  const hoje = hojeBelem();
  const { rows } = await db.query(
    `UPDATE lancamentos SET categoria_id=$1, turno=$2, valor=$3, observacao=$4, editado_por=$5, editado_em=$6
     WHERE id=$7 RETURNING *`,
    [categoria_id, turno, valor, observacao || null, req.usuario.id, hoje, req.params.id]
  );
  res.json(rows[0]);
});

// Apagar só a foto do comprovante — exige a permissão 'apagar_comprovantes'
router.delete('/:id/foto', exigirAcessoAoRegistro('lancamentos'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('apagar_comprovantes')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra apagar comprovantes. Fale com o diretor.' });
  }
  const { rows } = await db.query('UPDATE lancamentos SET foto_url=NULL WHERE id=$1 RETURNING *', [req.params.id]);
  const l = rows[0];
  if (l) {
    await registrarExclusao({
      tipo: 'Comprovante', descricao: `Foto apagada — Lançamento: ${l.observacao || l.categoria_id}`,
      unidade_id: l.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json(l);
});

// Excluir — exige a permissão 'excluir_lancamentos' (o diretor sempre tem)
router.delete('/:id', exigirAcessoAoRegistro('lancamentos'), async (req, res) => {
  if (!req.usuario.permissoes_financeiras?.includes('excluir_lancamentos')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra excluir lançamentos. Fale com o diretor.' });
  }
  const { rows } = await db.query('SELECT * FROM lancamentos WHERE id=$1', [req.params.id]);
  const l = rows[0];
  await db.query('DELETE FROM lancamentos WHERE id=$1', [req.params.id]);
  if (l) {
    await registrarExclusao({
      tipo: 'Lançamento',
      descricao: `${l.tipo === 'entrada' ? 'Entrada' : 'Saída'} — ${l.categoria_id} — R$ ${l.valor} (${l.data})`,
      unidade_id: l.unidade_id, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

// Resumo do dia — usado no destaque do Extrato
router.get('/resumo-dia', exigirUnidade, async (req, res) => {
  const { unidade_id, data } = req.query;
  const { rows } = await db.query(
    `SELECT tipo, categoria_id, SUM(valor)::numeric(12,2) AS total, COUNT(*)::int AS qtd
     FROM lancamentos WHERE unidade_id=$1 AND data=$2
     GROUP BY tipo, categoria_id`,
    [unidade_id, data]
  );
  res.json(rows);
});

module.exports = router;
