const express = require('express');
const db = require('../db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Lista só as unidades que o usuário logado pode ver
router.get('/', async (req, res) => {
  if (req.usuario.todas_unidades) {
    const { rows } = await db.query('SELECT * FROM unidades ORDER BY nome');
    return res.json(rows);
  }
  const { rows } = await db.query(
    'SELECT * FROM unidades WHERE id = ANY($1) ORDER BY nome',
    [req.usuario.unidades]
  );
  res.json(rows);
});

module.exports = router;
