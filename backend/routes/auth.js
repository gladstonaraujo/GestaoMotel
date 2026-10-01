const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verificarBloqueio, registrarFalha, registrarSucesso } = require('../middleware/limiteLogin');

const router = express.Router();

router.post('/login', verificarBloqueio, async (req, res) => {
  const { login, senha } = req.body;
  if (typeof login !== 'string' || typeof senha !== 'string' || !login || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  const { rows } = await db.query(
    'SELECT * FROM usuarios WHERE login = $1 AND ativo = true',
    [login.toLowerCase()]
  );
  const usuario = rows[0];
  if (!usuario) {
    registrarFalha(req);
    return res.status(401).json({ erro: 'Usuário ou senha não confere.' });
  }

  const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaCorreta) {
    registrarFalha(req);
    return res.status(401).json({ erro: 'Usuário ou senha não confere.' });
  }

  registrarSucesso(req);

  // busca tudo que define o que esse usuário pode ver/fazer
  const { rows: unidadesRows } = await db.query('SELECT unidade_id FROM usuario_unidades WHERE usuario_id = $1', [usuario.id]);
  const { rows: abasRows } = await db.query('SELECT aba FROM usuario_abas WHERE usuario_id = $1', [usuario.id]);
  const { rows: setoresRows } = await db.query('SELECT setor FROM usuario_setores_comprovantes WHERE usuario_id = $1', [usuario.id]);
  const { rows: permissoesRows } = await db.query('SELECT permissao FROM usuario_permissoes_financeiras WHERE usuario_id = $1', [usuario.id]);

  const payload = {
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    papel: usuario.papel,
    todas_unidades: usuario.todas_unidades,
    unidades: unidadesRows.map(r => r.unidade_id),
    abas: abasRows.map(r => r.aba),
    pode_ver_dashboards: usuario.pode_ver_dashboards,
    escopo_comprovantes: usuario.escopo_comprovantes,
    secoes_comprovantes: setoresRows.map(r => r.setor),
    permissoes_financeiras: usuario.papel === 'admin'
      ? ['excluir_lancamentos', 'editar_valores', 'apagar_comprovantes', 'excluir_boletos']
      : permissoesRows.map(r => r.permissao),
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, usuario: payload });
});

module.exports = router;
