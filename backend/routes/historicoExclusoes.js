const express = require('express');
const db = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar, exigirPapel('admin')); // só o diretor vê

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT h.*, u.nome AS excluido_por_nome
     FROM historico_exclusoes h
     JOIN usuarios u ON u.id = h.excluido_por
     ORDER BY h.criado_em DESC LIMIT 500`
  );
  res.json(rows);
});

// chamada internamente pelas outras rotas sempre que algo é excluído — não é exposta como endpoint próprio de escrita pro front-end
async function registrarExclusao({ tipo, descricao, unidade_id, excluido_por }) {
  await db.query(
    'INSERT INTO historico_exclusoes (tipo, descricao, unidade_id, excluido_por) VALUES ($1,$2,$3,$4)',
    [tipo, descricao, unidade_id || null, excluido_por]
  );
}

module.exports = router;
module.exports.registrarExclusao = registrarExclusao;
