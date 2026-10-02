const test = require('node:test');
const assert = require('node:assert/strict');
const { hoje } = require('../utils/data');
const { temAcessoAUnidade, exigirAcessoAoRegistro } = require('../middleware/auth');

test('hoje() retorna data no formato YYYY-MM-DD para o fuso America/Belem', () => {
  const d = hoje();
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test('temAcessoAUnidade permite usuário com todas_unidades=true', () => {
  const u = { todas_unidades: true, unidades: [] };
  assert.equal(temAcessoAUnidade(u, 'jardim'), true);
  assert.equal(temAcessoAUnidade(u, 'santana'), true);
});

test('temAcessoAUnidade restringe usuário com lista específica de unidades', () => {
  const u = { todas_unidades: false, unidades: ['jardim', 'pacoval'] };
  assert.equal(temAcessoAUnidade(u, 'jardim'), true);
  assert.equal(temAcessoAUnidade(u, 'pacoval'), true);
  assert.equal(temAcessoAUnidade(u, 'santana'), false);
  assert.equal(temAcessoAUnidade(u, 'beirol1'), false);
});

test('exigirAcessoAoRegistro bloqueia acesso a unidade não autorizada e devolve 403', async () => {
  const mockDb = require('../db');
  const queryOriginal = mockDb.query;

  try {
    // Simula registro existente pertencente à unidade 'santana'
    mockDb.query = async (sql, params) => {
      if (sql.includes('FROM lancamentos WHERE id=$1')) {
        return { rows: [{ unidade_id: 'santana' }] };
      }
      return { rows: [] };
    };

    const middleware = exigirAcessoAoRegistro('lancamentos');

    // Usuário sem acesso a 'santana'
    const req = {
      params: { id: '123' },
      usuario: { todas_unidades: false, unidades: ['jardim'] }
    };
    let statusRetornado = null;
    let jsonRetornado = null;
    const res = {
      status: (code) => {
        statusRetornado = code;
        return {
          json: (data) => { jsonRetornado = data; }
        };
      }
    };
    let nextChamado = false;
    await middleware(req, res, () => { nextChamado = true; });

    assert.equal(nextChamado, false);
    assert.equal(statusRetornado, 403);
    assert.equal(jsonRetornado.erro, 'Você não tem acesso a essa unidade.');

    // Usuário com acesso a 'santana'
    const reqAutorizado = {
      params: { id: '123' },
      usuario: { todas_unidades: false, unidades: ['santana'] }
    };
    nextChamado = false;
    statusRetornado = null;
    await middleware(reqAutorizado, res, () => { nextChamado = true; });

    assert.equal(nextChamado, true);
    assert.equal(statusRetornado, null);

    // Registro inexistente devolve 404
    mockDb.query = async () => ({ rows: [] });
    nextChamado = false;
    statusRetornado = null;
    await middleware(reqAutorizado, res, () => { nextChamado = true; });

    assert.equal(nextChamado, false);
    assert.equal(statusRetornado, 404);
    assert.equal(jsonRetornado.erro, 'Registro não encontrado.');
  } finally {
    mockDb.query = queryOriginal;
  }
});
