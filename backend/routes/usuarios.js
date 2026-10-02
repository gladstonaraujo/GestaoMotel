const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { registrarExclusao } = require('./historicoExclusoes');

const PAPEIS = ['funcionario', 'inspetor', 'gerente', 'admin'];

const router = express.Router();
router.use(autenticar, exigirPapel('admin')); // só o diretor mexe aqui

router.get('/', async (req, res) => {
  const { rows: usuarios } = await db.query(
    'SELECT id, login, nome, papel, todas_unidades, pode_ver_dashboards, escopo_comprovantes FROM usuarios WHERE ativo = true ORDER BY nome'
  );
  for (const u of usuarios) {
    const { rows: unidades } = await db.query('SELECT unidade_id FROM usuario_unidades WHERE usuario_id=$1', [u.id]);
    const { rows: abas } = await db.query('SELECT aba FROM usuario_abas WHERE usuario_id=$1', [u.id]);
    const { rows: setores } = await db.query('SELECT setor FROM usuario_setores_comprovantes WHERE usuario_id=$1', [u.id]);
    const { rows: permissoes } = await db.query('SELECT permissao FROM usuario_permissoes_financeiras WHERE usuario_id=$1', [u.id]);
    u.unidades = unidades.map(r => r.unidade_id);
    u.abas = abas.map(r => r.aba);
    u.secoes_comprovantes = setores.map(r => r.setor);
    u.permissoes_financeiras = permissoes.map(r => r.permissao);
  }
  res.json(usuarios);
});

router.post('/', async (req, res) => {
  const {
    login, senha, nome, papel, unidades = [], abas = [], todas_unidades = false,
    pode_ver_dashboards = null, escopo_comprovantes = null,
    secoes_comprovantes = [], permissoes_financeiras = []
  } = req.body;
  if (!login || !senha || !nome || !papel) {
    return res.status(400).json({ erro: 'Preencha login, senha, nome e papel.' });
  }
  if (!PAPEIS.includes(papel)) return res.status(400).json({ erro: 'Papel inválido.' });
  if (typeof senha !== 'string' || senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  const senha_hash = await bcrypt.hash(senha, 10);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO usuarios (login, senha_hash, nome, papel, todas_unidades, pode_ver_dashboards, escopo_comprovantes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [login.toLowerCase(), senha_hash, nome, papel, todas_unidades, pode_ver_dashboards, escopo_comprovantes]
    );
    const usuarioId = rows[0].id;
    for (const u of unidades) {
      await client.query('INSERT INTO usuario_unidades (usuario_id, unidade_id) VALUES ($1,$2)', [usuarioId, u]);
    }
    for (const a of abas) {
      await client.query('INSERT INTO usuario_abas (usuario_id, aba) VALUES ($1,$2)', [usuarioId, a]);
    }
    for (const s of secoes_comprovantes) {
      await client.query('INSERT INTO usuario_setores_comprovantes (usuario_id, setor) VALUES ($1,$2)', [usuarioId, s]);
    }
    for (const p of permissoes_financeiras) {
      await client.query('INSERT INTO usuario_permissoes_financeiras (usuario_id, permissao) VALUES ($1,$2)', [usuarioId, p]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: usuarioId });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    throw e;
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const {
    login, nome, papel, senha, unidades, abas, todas_unidades, pode_ver_dashboards,
    escopo_comprovantes, secoes_comprovantes, permissoes_financeiras
  } = req.body;
  if (papel !== undefined && !PAPEIS.includes(papel)) return res.status(400).json({ erro: 'Papel inválido.' });
  if (senha && (typeof senha !== 'string' || senha.length < 6)) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  // não deixa o sistema ficar sem nenhum diretor: nem rebaixando nem desativando o último admin
  if (papel && papel !== 'admin') {
    const { rows } = await db.query("SELECT papel FROM usuarios WHERE id=$1", [req.params.id]);
    if (rows[0]?.papel === 'admin') {
      const { rows: outros } = await db.query("SELECT 1 FROM usuarios WHERE papel='admin' AND ativo=true AND id<>$1", [req.params.id]);
      if (!outros.length) return res.status(400).json({ erro: 'Precisa existir pelo menos um diretor (admin) ativo.' });
    }
  }
  const campos = [];
  const valores = [];
  let i = 1;
  if (login) { campos.push(`login=$${i++}`); valores.push(login.toLowerCase()); }
  if (nome) { campos.push(`nome=$${i++}`); valores.push(nome); }
  if (papel) { campos.push(`papel=$${i++}`); valores.push(papel); }
  if (typeof todas_unidades === 'boolean') { campos.push(`todas_unidades=$${i++}`); valores.push(todas_unidades); }
  if (typeof pode_ver_dashboards === 'boolean' || pode_ver_dashboards === null) {
    campos.push(`pode_ver_dashboards=$${i++}`); valores.push(pode_ver_dashboards);
  }
  if (escopo_comprovantes === 'dia' || escopo_comprovantes === 'tudo' || escopo_comprovantes === null) {
    campos.push(`escopo_comprovantes=$${i++}`); valores.push(escopo_comprovantes);
  }
  if (senha) { campos.push(`senha_hash=$${i++}`); valores.push(await bcrypt.hash(senha, 10)); }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (campos.length) {
      valores.push(req.params.id);
      await client.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id=$${i}`, valores);
    }
    if (Array.isArray(unidades)) {
      await client.query('DELETE FROM usuario_unidades WHERE usuario_id=$1', [req.params.id]);
      for (const u of unidades) await client.query('INSERT INTO usuario_unidades (usuario_id, unidade_id) VALUES ($1,$2)', [req.params.id, u]);
    }
    if (Array.isArray(abas)) {
      await client.query('DELETE FROM usuario_abas WHERE usuario_id=$1', [req.params.id]);
      for (const a of abas) await client.query('INSERT INTO usuario_abas (usuario_id, aba) VALUES ($1,$2)', [req.params.id, a]);
    }
    if (Array.isArray(secoes_comprovantes)) {
      await client.query('DELETE FROM usuario_setores_comprovantes WHERE usuario_id=$1', [req.params.id]);
      for (const s of secoes_comprovantes) await client.query('INSERT INTO usuario_setores_comprovantes (usuario_id, setor) VALUES ($1,$2)', [req.params.id, s]);
    }
    if (Array.isArray(permissoes_financeiras)) {
      await client.query('DELETE FROM usuario_permissoes_financeiras WHERE usuario_id=$1', [req.params.id]);
      for (const p of permissoes_financeiras) await client.query('INSERT INTO usuario_permissoes_financeiras (usuario_id, permissao) VALUES ($1,$2)', [req.params.id, p]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    throw e;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  if (req.params.id === req.usuario.id) {
    return res.status(400).json({ erro: 'Você não pode excluir o próprio usuário logado.' });
  }
  const { rows } = await db.query('SELECT nome, login, papel FROM usuarios WHERE id=$1', [req.params.id]);
  const u = rows[0];
  if (u?.papel === 'admin') {
    const { rows: outros } = await db.query("SELECT 1 FROM usuarios WHERE papel='admin' AND ativo=true AND id<>$1", [req.params.id]);
    if (!outros.length) return res.status(400).json({ erro: 'Precisa existir pelo menos um diretor (admin) ativo.' });
  }
  await db.query('UPDATE usuarios SET ativo=false WHERE id=$1', [req.params.id]);
  if (u) {
    await registrarExclusao({
      tipo: 'Usuário', descricao: `${u.nome} (${u.login}) — ${u.papel}`,
      unidade_id: null, excluido_por: req.usuario.id
    });
  }
  res.json({ ok: true });
});

module.exports = router;
