const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
const { separarArgumentos, interpretarArgumento, executarAcaoDeclarativa } = require('../../frontend/core/acoes.js');

test('separa argumentos sem quebrar vírgulas dentro de texto', () => {
  assert.deepEqual(separarArgumentos("'um, dois', 3, true"), ["'um, dois'", '3', 'true']);
});

test('interpreta somente tipos declarativos conhecidos', () => {
  const elemento={id:'alvo'};
  assert.equal(interpretarArgumento("'texto'",elemento),'texto');
  assert.equal(interpretarArgumento('-2.5',elemento),-2.5);
  assert.equal(interpretarArgumento('this',elemento),elemento);
  assert.throws(()=>interpretarArgumento('window.localStorage',elemento),/inválido/);
});

test('executa uma ação permitida com argumentos', () => {
  let recebido;
  window.abrir=(valor)=>{ recebido=valor; };
  executarAcaoDeclarativa("abrir('painel')",{},{});
  assert.equal(recebido,'painel');
});

test('bloqueia código arbitrário e funções fora da lista', () => {
  assert.throws(()=>executarAcaoDeclarativa('eval(\'1\')',{},{}),/não permitida/);
  assert.throws(()=>executarAcaoDeclarativa('alert(\'x\')',{},{}),/não permitida/);
  assert.throws(()=>executarAcaoDeclarativa('abrir(window.location)',{},{}),/inválido/);
});
