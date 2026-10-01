const jwt = require('jsonwebtoken');
const db = require('../db');

// Confere se o token é válido e coloca os dados do usuário em req.usuario
function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization;
  if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Faça login pra continuar.' });
  }
  const token = cabecalho.slice('Bearer '.length);
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ erro: 'Sessão expirada, faça login de novo.' });
  }
}

// Uso: exigirPapel('admin') ou exigirPapel('admin','gerente')
function exigirPapel(...papeisPermitidos) {
  return (req, res, next) => {
    if (!papeisPermitidos.includes(req.usuario.papel)) {
      return res.status(403).json({ erro: 'Você não tem acesso a essa parte do sistema.' });
    }
    next();
  };
}

// Confere se o usuário tem acesso à unidade pedida (na query ?unidade_id= ou no corpo da requisição)
function exigirUnidade(req, res, next) {
  const unidadeId = req.query.unidade_id || (req.body && req.body.unidade_id);
  if (!unidadeId || typeof unidadeId !== 'string') return res.status(400).json({ erro: 'Informe a unidade (unidade_id).' });
  if (temAcessoAUnidade(req.usuario, unidadeId)) {
    return next();
  }
  return res.status(403).json({ erro: 'Você não tem acesso a essa unidade.' });
}

function temAcessoAUnidade(usuario, unidadeId) {
  return usuario.todas_unidades || (Array.isArray(usuario.unidades) && usuario.unidades.includes(unidadeId));
}

// Rotas por /:id (editar, excluir, marcar como pago...) não recebem unidade_id: busca o registro,
// confere se ele existe e se o usuário tem acesso à unidade dele. O nome da tabela vem só de
// constantes no código das rotas (nunca da requisição), por isso pode ser interpolado.
const TABELAS_COM_UNIDADE = new Set([
  'lancamentos', 'boletos', 'contas_fixas', 'faltas', 'funcionarios', 'manutencoes_terceiros',
  'produtos_vencidos', 'trocas_plantao', 'consumos_plantao', 'revpar_registros', 'suites_config',
]);
function exigirAcessoAoRegistro(tabela) {
  if (!TABELAS_COM_UNIDADE.has(tabela)) throw new Error(`Tabela não permitida em exigirAcessoAoRegistro: ${tabela}`);
  return async (req, res, next) => {
    let rows;
    try {
      ({ rows } = await db.query(`SELECT unidade_id FROM ${tabela} WHERE id=$1`, [req.params.id]));
    } catch (e) {
      if (e.code === '22P02') return res.status(404).json({ erro: 'Registro não encontrado.' }); // id com formato inválido
      throw e;
    }
    if (!rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    if (!temAcessoAUnidade(req.usuario, rows[0].unidade_id)) {
      return res.status(403).json({ erro: 'Você não tem acesso a essa unidade.' });
    }
    next();
  };
}

module.exports = { autenticar, exigirPapel, exigirUnidade, exigirAcessoAoRegistro, temAcessoAUnidade };
