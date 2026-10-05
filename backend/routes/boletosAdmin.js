const express = require('express');
const db = require('../db');
const { autenticar, temAcessoAUnidade } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const router = express.Router();

// O diretor sempre acessa; os demais só se o diretor liberou a aba "Boletos Administrativo" pra eles
function exigirAbaBoletosAdmin(req, res, next) {
  const u = req.usuario;
  if (u.papel === 'admin' || (Array.isArray(u.abas) && u.abas.includes('boletos-admin'))) return next();
  return res.status(403).json({ erro: 'Você não tem acesso aos boletos administrativos. Fale com o diretor.' });
}
const temPermissao = (req, permissao) => req.usuario.permissoes_financeiras?.includes(permissao);

router.use(autenticar, exigirAbaBoletosAdmin);

router.get('/', async (req, res) => {
  const { rows: boletos } = await db.query('SELECT * FROM boletos_admin ORDER BY registrado_em DESC');
  for (const b of boletos) {
    const { rows: lancados } = await db.query(
      'SELECT unidade_id, valor FROM boletos_admin_lancamentos WHERE boleto_admin_id=$1', [b.id]
    );
    b.unidadesLancadas = lancados;
  }
  res.json(boletos);
});

router.post('/', async (req, res) => {
  const { descricao, valor, vencimento, foto_url, codigo_barras, pix_copia_cola } = req.body;
  if (!descricao || !valor || !vencimento) {
    return res.status(400).json({ erro: 'Preencha descrição, valor e vencimento.' });
  }
  const { rows } = await db.query(
    `INSERT INTO boletos_admin (descricao, valor, vencimento, foto_url, codigo_barras, pix_copia_cola, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [descricao, valor, vencimento, foto_url || null, codigo_barras || null, pix_copia_cola || null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

// lança o boleto central pras unidades escolhidas, dividindo o valor (editável por unidade)
router.post('/:id/lancar', async (req, res) => {
  const { unidades } = req.body; // [{ unidade_id, valor }]
  const { rows } = await db.query('SELECT * FROM boletos_admin WHERE id=$1', [req.params.id]);
  const central = rows[0];
  if (!central) return res.status(404).json({ erro: 'Boleto central não encontrado.' });
  if (!Array.isArray(unidades) || !unidades.length) {
    return res.status(400).json({ erro: 'Marque pelo menos uma unidade.' });
  }
  if (unidades.some(u => !temAcessoAUnidade(req.usuario, u.unidade_id))) {
    return res.status(403).json({ erro: 'Você não tem acesso a uma das unidades marcadas.' });
  }

  for (const u of unidades) {
    const { rows: novoBoleto } = await db.query(
      `INSERT INTO boletos (unidade_id, descricao, valor, vencimento, foto_url, codigo_barras, pix_copia_cola, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [u.unidade_id, central.descricao, u.valor, central.vencimento, central.foto_url,
       central.codigo_barras, central.pix_copia_cola, req.usuario.id]
    );
    await db.query(
      'INSERT INTO boletos_admin_lancamentos (boleto_admin_id, unidade_id, valor, boleto_id) VALUES ($1,$2,$3,$4)',
      [central.id, u.unidade_id, u.valor, novoBoleto[0].id]
    );
  }

  const { rows: totalUnidades } = await db.query('SELECT COUNT(*)::int AS n FROM unidades');
  const { rows: totalLancado } = await db.query(
    'SELECT COUNT(DISTINCT unidade_id)::int AS n FROM boletos_admin_lancamentos WHERE boleto_admin_id=$1', [central.id]
  );
  const status = totalLancado[0].n >= totalUnidades[0].n ? 'lancado_completo' : 'lancado_parcial';
  await db.query('UPDATE boletos_admin SET status=$1 WHERE id=$2', [status, central.id]);

  res.json({ ok: true, status });
});

router.delete('/:id/foto', async (req, res) => {
  if (!temPermissao(req, 'apagar_comprovantes')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra apagar comprovantes. Fale com o diretor.' });
  }
  const { rows } = await db.query('UPDATE boletos_admin SET foto_url=NULL WHERE id=$1 RETURNING *', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  if (!temPermissao(req, 'excluir_boletos')) {
    return res.status(403).json({ erro: 'Você não tem permissão pra excluir boletos. Fale com o diretor.' });
  }
  const { rows } = await db.query('SELECT * FROM boletos_admin WHERE id=$1', [req.params.id]);
  const b = rows[0];
  await db.query('DELETE FROM boletos_admin WHERE id=$1', [req.params.id]);
  if (b) {
    await registrarExclusao({
      tipo: 'Boleto Administrativo', descricao: `${b.descricao} — R$ ${b.valor}`,
      unidade_id: null, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
