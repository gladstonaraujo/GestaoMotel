const express = require('express');
const db = require('../db');
const { autenticar, exigirUnidade } = require('../middleware/auth');
const { hoje: hojeBelem } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

router.get('/', exigirUnidade, async (req, res) => {
  const { rows: vistorias } = await db.query(
    `SELECT v.*, u.nome AS feito_por_nome
     FROM vistorias v
     LEFT JOIN usuarios u ON u.id = v.feito_por
     WHERE v.unidade_id=$1
     ORDER BY v.data DESC, v.registrado_em DESC`,
    [req.query.unidade_id]
  );
  for (const v of vistorias) {
    const { rows: itens } = await db.query('SELECT * FROM vistoria_itens WHERE vistoria_id=$1', [v.id]);
    const { rows: fotos } = await db.query('SELECT foto_url FROM vistoria_fotos WHERE vistoria_id=$1', [v.id]);
    v.itens = itens;
    v.fotos = fotos.map(f => f.foto_url);
  }
  res.json(vistorias);
});

router.get('/catalogo-itens', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM itens_vistoria_catalogo ORDER BY categoria, nome');
  res.json(rows);
});

router.post('/', exigirUnidade, async (req, res) => {
  const { unidade_id, suite, data, turno, tipo_vistoria, observacao_geral, itens, fotos_url } = req.body;
  if (!suite || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'Informe a suíte e o checklist.' });
  }
  const temProblema = itens.some(i => i.status === 'problema');
  const podeAnexarFoto = ['gerente', 'admin'].includes(req.usuario.papel);
  if (temProblema && podeAnexarFoto && (!fotos_url || fotos_url.length === 0)) {
    return res.status(400).json({ erro: 'Anexe ao menos uma foto — obrigatório quando há item marcado como problema.' });
  }

  const { rows } = await db.query(
    `INSERT INTO vistorias (unidade_id, suite, data, turno, tipo_vistoria, observacao_geral, feito_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [unidade_id, suite, data || hojeBelem(), turno, tipo_vistoria || 'completa', observacao_geral || null, req.usuario.id]
  );
  for (const item of itens) {
    await db.query(
      'INSERT INTO vistoria_itens (vistoria_id, item_id, status, observacao) VALUES ($1,$2,$3,$4)',
      [rows[0].id, item.id, item.status, item.observacao || null]
    );
  }
  for (const url of fotos_url || []) {
    await db.query('INSERT INTO vistoria_fotos (vistoria_id, foto_url) VALUES ($1,$2)', [rows[0].id, url]);
  }
  res.status(201).json(rows[0]);
});

module.exports = router;
