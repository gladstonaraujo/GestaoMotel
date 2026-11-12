const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade, exigirPapel, exigirAcessoAoRegistro } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');
const { hoje: hojeBelem, dataDoPlantao, turnoAtual } = require('../utils/data');
const { dataValida, valorPositivo, texto, primeiroErro } = require('../utils/validar');

const router = express.Router();
router.use(autenticar);

// Tipos de boleto (o cliente citou esses e disse que existem outros — esses caem em "outro",
// detalhados na descrição). Para incluir um tipo novo basta acrescentar aqui e no front (TIPOS_BOLETO).
const TIPOS_BOLETO = {
  fornecedor: 'Fornecedor', energia: 'Energia', agua: 'Água', internet: 'Internet',
  imposto: 'Imposto', aluguel: 'Aluguel', outro: 'Outro'
};

// Gera a saída do boleto no caixa e marca o boleto como pago. Sempre cai no plantão e no turno
// em andamento (regra do cliente: boleto pago em dinheiro sai do caixa do turno em que foi pago).
// Roda dentro da transação de quem chama. Devolve false se o boleto já estava pago — o UPDATE
// condicional trava a linha, então dois cliques simultâneos não geram duas saídas no caixa.
async function pagarBoleto(client, boleto, formaPagamento, usuarioId) {
  const hoje = hojeBelem();
  const { rowCount } = await client.query(
    "UPDATE boletos SET status='pago', data_pagamento=$1 WHERE id=$2 AND status='pendente'",
    [hoje, boleto.id]
  );
  if (!rowCount) return false;
  const tipo = TIPOS_BOLETO[boleto.tipo] || TIPOS_BOLETO.outro;
  const { rows: lanc } = await client.query(
    `INSERT INTO lancamentos (unidade_id, data, turno, tipo, categoria_id, valor, observacao, lancado_por, foto_url,
                              forma_pagamento_saida, registrado_em)
     VALUES ($1,$2,$3,'saida','boletos',$4,$5,$6,$7,$8,$9) RETURNING id`,
    [boleto.unidade_id, dataDoPlantao(), turnoAtual(), boleto.valor,
     `${formaPagamento === 'pix' ? 'Pix' : 'Dinheiro'} — Boleto ${tipo}: ${boleto.descricao} (venc. ${boleto.vencimento})`,
     usuarioId, boleto.foto_url, formaPagamento, hoje]
  );
  await client.query('UPDATE boletos SET lancamento_id=$1 WHERE id=$2', [lanc[0].id, boleto.id]);
  return true;
}

function erroDoBoleto({ descricao, valor, vencimento, tipo, codigo_barras, pix_copia_cola }, exigirValor = true) {
  return primeiroErro([
    [typeof descricao === 'string' && descricao.trim() && texto(descricao, 300), 'Preencha a descrição (máximo 300 caracteres).'],
    [!exigirValor || valorPositivo(valor), 'Informe um valor maior que zero.'],
    [dataValida(vencimento), 'Informe a data de vencimento.'],
    [tipo == null || Object.hasOwn(TIPOS_BOLETO, tipo), 'Tipo de boleto inválido.'],
    [codigo_barras == null || texto(codigo_barras, 200), 'Código de barras muito longo.'],
    [pix_copia_cola == null || texto(pix_copia_cola, 1000), 'Código Pix muito longo.'],
  ]);
}

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

// Cadastro do boleto — feito pela tela "Lançar movimento". Com pago_agora=true o boleto já nasce
// pago e a saída entra no caixa do turno atual, tudo na mesma transação.
router.post('/', exigirUnidade, exigirPapel('gerente', 'admin'), async (req, res) => {
  const { unidade_id, descricao, valor, vencimento, tipo, foto_url, codigo_barras, pix_copia_cola,
          compra_conjunta_id, pago_agora, forma_pagamento } = req.body;
  const erro = erroDoBoleto(req.body) || (pago_agora && !['dinheiro', 'pix'].includes(forma_pagamento) ? 'Forma de pagamento inválida.' : null);
  if (erro) return res.status(400).json({ erro });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO boletos (unidade_id, descricao, valor, vencimento, tipo, foto_url, codigo_barras, pix_copia_cola, compra_conjunta_id, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [unidade_id, descricao.trim(), valor, vencimento, tipo || 'outro', foto_url || null, codigo_barras || null,
       pix_copia_cola || null, compra_conjunta_id || null, req.usuario.id]
    );
    if (pago_agora) await pagarBoleto(client, rows[0], forma_pagamento, req.usuario.id);
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], status: pago_agora ? 'pago' : rows[0].status });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Compra conjunta: cria o registro de agrupamento e um boleto por unidade, todos ligados a ele
router.post('/conjunta', exigirPapel('gerente', 'admin'), async (req, res) => {
  const { descricao, vencimento, tipo, foto_url, codigo_barras, pix_copia_cola, unidades } = req.body;
  if (!Array.isArray(unidades) || !unidades.length) {
    return res.status(400).json({ erro: 'Marque pelo menos uma unidade.' });
  }
  const erro = erroDoBoleto(req.body, false);
  if (erro) return res.status(400).json({ erro });
  if (unidades.some(u => !u.unidade_id || !(u.valor > 0))) {
    return res.status(400).json({ erro: 'Informe o valor de cada unidade marcada.' });
  }
  const semAcesso = unidades.some(u => !req.usuario.todas_unidades && !req.usuario.unidades.includes(u.unidade_id));
  if (semAcesso) {
    return res.status(403).json({ erro: 'Você não tem acesso a uma das unidades marcadas.' });
  }
  const valorTotal = unidades.reduce((s, u) => s + Number(u.valor), 0);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: conjuntaRows } = await client.query(
      `INSERT INTO compras_conjuntas (descricao, valor_total_conjunto) VALUES ($1,$2) RETURNING id`,
      [descricao, valorTotal]
    );
    const compraConjuntaId = conjuntaRows[0].id;

    const criados = [];
    for (const u of unidades) {
      const { rows } = await client.query(
        `INSERT INTO boletos (unidade_id, descricao, valor, vencimento, tipo, foto_url, codigo_barras, pix_copia_cola, compra_conjunta_id, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [u.unidade_id, descricao, u.valor, vencimento, tipo || 'outro', foto_url || null, codigo_barras || null, pix_copia_cola || null, compraConjuntaId, req.usuario.id]
      );
      criados.push(rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json(criados);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Marca como pago e já gera a saída correspondente no caixa, no plantão em andamento.
// A forma de pagamento decide se a saída mexe no dinheiro físico do caixa (dinheiro) ou não (pix).
router.post('/:id/marcar-pago', exigirAcessoAoRegistro('boletos'), exigirPapel('gerente', 'admin'), async (req, res) => {
  const formaPagamento = req.body?.forma_pagamento || 'pix';
  if (!['dinheiro', 'pix'].includes(formaPagamento)) {
    return res.status(400).json({ erro: 'Forma de pagamento inválida.' });
  }
  const { rows } = await db.query('SELECT * FROM boletos WHERE id=$1', [req.params.id]);
  const boleto = rows[0];
  if (!boleto) return res.status(404).json({ erro: 'Boleto não encontrado.' });
  if (boleto.status === 'pago') return res.status(409).json({ erro: 'Esse boleto já está pago.' });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const pagou = await pagarBoleto(client, boleto, formaPagamento, req.usuario.id);
    await client.query(pagou ? 'COMMIT' : 'ROLLBACK');
    if (!pagou) return res.status(409).json({ erro: 'Esse boleto já está pago.' });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
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
module.exports.TIPOS_BOLETO = TIPOS_BOLETO;
