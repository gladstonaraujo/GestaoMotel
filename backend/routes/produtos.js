const express = require('express');
const db = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { texto } = require('../utils/validar');

const router = express.Router();
router.use(autenticar);

// Listar produtos
// Operadores e gerentes recebem apenas os ativos para lançamentos;
// Administrador/Diretor recebe todos (inclusive inativos para gestão) quando solicitado
router.get('/', async (req, res) => {
  const todos = req.query.todos === 'true' && req.usuario.papel === 'admin';
  const sql = todos
    ? 'SELECT * FROM produtos ORDER BY categoria, nome'
    : 'SELECT * FROM produtos WHERE ativo = true ORDER BY categoria, nome';
  const { rows } = await db.query(sql);
  res.json(rows);
});

// Cadastrar novo produto (Diretor/Admin ou Gerente)
router.post('/', exigirPapel('gerente', 'admin'), async (req, res) => {
  const nome = (req.body.nome || '').trim();
  const categoria = (req.body.categoria || 'Geral').trim();
  const precoCusto = parseFloat(req.body.preco_custo) || 0;
  const precoVenda = parseFloat(req.body.preco_venda) || 0;

  if (!nome || !texto(nome, 100)) {
    return res.status(400).json({ erro: 'Informe o nome do produto (até 100 caracteres).' });
  }

  const { rows: existente } = await db.query(
    'SELECT id FROM produtos WHERE lower(trim(nome)) = lower(trim($1))',
    [nome]
  );
  if (existente.length) {
    return res.status(409).json({ erro: 'Já existe um produto cadastrado com esse nome.' });
  }

  const { rows } = await db.query(
    `INSERT INTO produtos (nome, categoria, preco_custo, preco_venda, ativo)
     VALUES ($1, $2, $3, $4, true)
     RETURNING *`,
    [nome, categoria, precoCusto, precoVenda]
  );
  res.status(201).json(rows[0]);
});

// Atualizar produto (nome, categoria, preços, ativo)
router.put('/:id', exigirPapel('gerente', 'admin'), async (req, res) => {
  const { nome, categoria, preco_custo, preco_venda, ativo } = req.body;
  const campos = [];
  const valores = [];

  if (nome !== undefined) {
    const limpo = String(nome).trim();
    if (!limpo || !texto(limpo, 100)) {
      return res.status(400).json({ erro: 'Informe o nome do produto (até 100 caracteres).' });
    }
    const { rows: igual } = await db.query(
      'SELECT id FROM produtos WHERE lower(trim(nome)) = lower(trim($1)) AND id <> $2',
      [limpo, req.params.id]
    );
    if (igual.length) {
      return res.status(409).json({ erro: 'Já existe outro produto cadastrado com esse nome.' });
    }
    valores.push(limpo);
    campos.push(`nome = $${valores.length}`);
  }

  if (categoria !== undefined) {
    const limpa = String(categoria).trim() || 'Geral';
    valores.push(limpa);
    campos.push(`categoria = $${valores.length}`);
  }

  if (preco_custo !== undefined) {
    valores.push(Math.max(0, parseFloat(preco_custo) || 0));
    campos.push(`preco_custo = $${valores.length}`);
  }

  if (preco_venda !== undefined) {
    valores.push(Math.max(0, parseFloat(preco_venda) || 0));
    campos.push(`preco_venda = $${valores.length}`);
  }

  if (ativo !== undefined && typeof ativo === 'boolean') {
    valores.push(ativo);
    campos.push(`ativo = $${valores.length}`);
  }

  if (!campos.length) {
    return res.status(400).json({ erro: 'Nenhum dado informado para alteração.' });
  }

  valores.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE produtos SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING *`,
    valores
  );

  if (!rows[0]) {
    return res.status(404).json({ erro: 'Produto não encontrado.' });
  }
  res.json(rows[0]);
});

// Exclusão / Inativação de produto
router.delete('/:id', exigirPapel('admin'), async (req, res) => {
  // Se já foi usado em lançamentos, desativa em vez de deletar para manter integridade
  const { rows } = await db.query('SELECT * FROM produtos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Produto não encontrado.' });

  // Como o histórico guarda o nome, tentamos deletar diretamente ou inativar
  try {
    await db.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);
    res.json({ ok: true, mensagem: 'Produto excluído com sucesso.' });
  } catch (e) {
    await db.query('UPDATE produtos SET ativo = false WHERE id = $1', [req.params.id]);
    res.json({ ok: true, mensagem: 'Produto inativado pois possui histórico.' });
  }
});

// ================= CATEGORIAS DE PRODUTOS =================
// Listar categorias
router.get('/categorias/todas', async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.nome, c.criado_em,
            COUNT(p.id)::int AS total_produtos
     FROM produtos_categorias c
     LEFT JOIN produtos p ON lower(trim(p.categoria)) = lower(trim(c.nome))
     GROUP BY c.id, c.nome, c.criado_em
     ORDER BY c.nome ASC`
  );
  res.json(rows);
});

// Cadastrar nova categoria
router.post('/categorias', exigirPapel('gerente', 'admin'), async (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome || !texto(nome, 60)) {
    return res.status(400).json({ erro: 'Informe o nome da categoria (até 60 caracteres).' });
  }

  const { rows: existente } = await db.query(
    'SELECT id FROM produtos_categorias WHERE lower(trim(nome)) = lower(trim($1))',
    [nome]
  );
  if (existente.length) {
    return res.status(409).json({ erro: 'Já existe uma categoria cadastrada com esse nome.' });
  }

  const { rows } = await db.query(
    'INSERT INTO produtos_categorias (nome) VALUES ($1) RETURNING *',
    [nome]
  );
  res.status(201).json(rows[0]);
});

// Renomear categoria (atualiza produtos vinculados em cascata)
router.put('/categorias/:id', exigirPapel('gerente', 'admin'), async (req, res) => {
  const novoNome = (req.body.nome || '').trim();
  if (!novoNome || !texto(novoNome, 60)) {
    return res.status(400).json({ erro: 'Informe o novo nome da categoria (até 60 caracteres).' });
  }

  const { rows: atual } = await db.query('SELECT * FROM produtos_categorias WHERE id = $1', [req.params.id]);
  if (!atual[0]) {
    return res.status(404).json({ erro: 'Categoria não encontrada.' });
  }

  const nomeAntigo = atual[0].nome;

  const { rows: igual } = await db.query(
    'SELECT id FROM produtos_categorias WHERE lower(trim(nome)) = lower(trim($1)) AND id <> $2',
    [novoNome, req.params.id]
  );
  if (igual.length) {
    return res.status(409).json({ erro: 'Já existe outra categoria com esse nome.' });
  }

  // Atualiza na tabela de categorias
  const { rows } = await db.query(
    'UPDATE produtos_categorias SET nome = $1 WHERE id = $2 RETURNING *',
    [novoNome, req.params.id]
  );

  // Atualiza produtos que estavam com o nome antigo
  await db.query(
    'UPDATE produtos SET categoria = $1 WHERE lower(trim(categoria)) = lower(trim($2))',
    [novoNome, nomeAntigo]
  );

  res.json(rows[0]);
});

// Excluir categoria
router.delete('/categorias/:id', exigirPapel('admin'), async (req, res) => {
  const { rows: cat } = await db.query('SELECT * FROM produtos_categorias WHERE id = $1', [req.params.id]);
  if (!cat[0]) {
    return res.status(404).json({ erro: 'Categoria não encontrada.' });
  }

  const nomeCat = cat[0].nome;

  // Verificar se há produtos vinculados
  const { rows: prods } = await db.query(
    'SELECT count(*)::int AS qtd FROM produtos WHERE lower(trim(categoria)) = lower(trim($1))',
    [nomeCat]
  );

  if (prods[0] && prods[0].qtd > 0) {
    return res.status(400).json({
      erro: `Não é possível excluir: existem ${prods[0].qtd} produto(s) vinculados a esta categoria.`
    });
  }

  await db.query('DELETE FROM produtos_categorias WHERE id = $1', [req.params.id]);
  res.json({ ok: true, mensagem: 'Categoria excluída com sucesso.' });
});

module.exports = router;

