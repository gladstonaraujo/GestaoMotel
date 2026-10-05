const express = require('express');
const db = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { texto } = require('../utils/validar');

const router = express.Router();
router.use(autenticar);

// "Nova Esperança" -> "novaesperanca": id curto e estável, gerado do nome
function gerarId(nome) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
}

// O diretor recebe todas (inclusive as desativadas, pra poder reativar); os demais, só as ativas que acessam
router.get('/', async (req, res) => {
  if (req.usuario.papel === 'admin') {
    const { rows } = await db.query('SELECT id, nome, ativa FROM unidades ORDER BY nome');
    return res.json(rows);
  }
  const { rows } = await db.query(
    'SELECT id, nome, ativa FROM unidades WHERE ativa AND (id = ANY($1) OR $2) ORDER BY nome',
    [req.usuario.unidades || [], !!req.usuario.todas_unidades]
  );
  res.json(rows);
});

router.post('/', exigirPapel('admin'), async (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome || !texto(nome, 60)) return res.status(400).json({ erro: 'Informe o nome da unidade (até 60 caracteres).' });
  const base = gerarId(nome);
  if (!base) return res.status(400).json({ erro: 'O nome precisa ter pelo menos uma letra ou número.' });

  const { rows: existentes } = await db.query('SELECT id, nome FROM unidades');
  if (existentes.some(u => u.nome.toLowerCase() === nome.toLowerCase())) {
    return res.status(409).json({ erro: 'Já existe uma unidade com esse nome.' });
  }
  const ids = new Set(existentes.map(u => u.id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}${n}`;

  const { rows } = await db.query('INSERT INTO unidades (id, nome) VALUES ($1,$2) RETURNING id, nome, ativa', [id, nome]);
  res.status(201).json(rows[0]);
});

// Renomear e/ou ativar/desativar. Não existe exclusão: a unidade tem histórico (lançamentos, boletos...).
router.put('/:id', exigirPapel('admin'), async (req, res) => {
  const { nome, ativa } = req.body;
  const campos = [];
  const valores = [];
  if (nome !== undefined) {
    const limpo = String(nome).trim();
    if (!limpo || !texto(limpo, 60)) return res.status(400).json({ erro: 'Informe o nome da unidade (até 60 caracteres).' });
    const { rows: igual } = await db.query('SELECT 1 FROM unidades WHERE lower(nome)=lower($1) AND id<>$2', [limpo, req.params.id]);
    if (igual.length) return res.status(409).json({ erro: 'Já existe uma unidade com esse nome.' });
    valores.push(limpo); campos.push(`nome=$${valores.length}`);
  }
  if (typeof ativa === 'boolean') {
    if (!ativa) {
      const { rows: restantes } = await db.query('SELECT 1 FROM unidades WHERE ativa AND id<>$1', [req.params.id]);
      if (!restantes.length) return res.status(400).json({ erro: 'Precisa existir pelo menos uma unidade ativa.' });
    }
    valores.push(ativa); campos.push(`ativa=$${valores.length}`);
  }
  if (!campos.length) return res.status(400).json({ erro: 'Nada para alterar.' });
  valores.push(req.params.id);
  const { rows } = await db.query(`UPDATE unidades SET ${campos.join(', ')} WHERE id=$${valores.length} RETURNING id, nome, ativa`, valores);
  if (!rows[0]) return res.status(404).json({ erro: 'Unidade não encontrada.' });
  res.json(rows[0]);
});

module.exports = router;
