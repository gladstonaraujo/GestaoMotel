const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = arquivo => fs.readFileSync(path.join(frontend, arquivo), 'utf8');
const modulos = ['visao-geral', 'caixa', 'operacao', 'financeiro', 'gestao', 'sistema'];

// Carrega só as funções de escape de core/ui.js (o resto do arquivo depende do navegador).
function carregarEscapes() {
  const ui = ler('core/ui.js');
  const trecho = ui.slice(ui.indexOf('const ESCAPES_HTML'), ui.indexOf('const DESCRITOR_INNER_HTML'));
  const contexto = {};
  vm.runInNewContext(`${trecho}; this.esc = esc; this.escArg = escArg;`, contexto);
  return contexto;
}

test('esc neutraliza tags, aspas e nulos', () => {
  const { esc } = carregarEscapes();
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('a" data-click="sair()'), 'a&quot; data-click=&quot;sair()');
  assert.equal(esc("it's & co"), 'it&#39;s &amp; co');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(12.5), '12.5');
});

test('escArg protege o texto dentro de data-click="acao(\'...\')"', () => {
  const { escArg } = carregarEscapes();
  // O navegador decodifica o atributo antes do interpretador de ações; o apóstrofo e a barra
  // precisam chegar escapados (\' e \\) e as aspas duplas não podem fechar o atributo.
  assert.equal(escArg("x',sair()//"), "x\\&#39;,sair()//");
  assert.equal(escArg('a"b'), 'a&quot;b');
  assert.equal(escArg('c:\\pasta'), 'c:\\\\pasta');
});

test('argumentos textuais de data-click/data-change usam escArg', () => {
  for (const modulo of modulos) {
    const codigo = ler(`modulos/${modulo}/${modulo}.js`);
    const cruas = [...codigo.matchAll(/data-(?:click|change)="[^"\n]*'\$\{(?!escArg\()[^}]*\}'/g)].map(m => m[0]);
    assert.deepEqual(cruas, [], `${modulo}: interpolação sem escArg em data-click`);
  }
});

test('campos de texto livre não entram crus em linhas com HTML', () => {
  const campos = 'descricao|obs|observacao|observacaoGeral|motivo|produto|suite|prestador|especificacao|feitoPor|criadoPor|por|login|telefone|documento|excluidoPor|foto|dataUrl|nome|item';
  const crua = new RegExp(`\\$\\{(?!esc\\(|escArg\\()[^{}]*\\.(?:${campos})\\b[^{}]*\\}`);
  // categoria de suíte é texto livre (nomeCategoria() é só catálogo e não entra aqui)
  const categoriaCrua = /\$\{[a-z]+\.categoria\}/;
  for (const modulo of modulos) {
    ler(`modulos/${modulo}/${modulo}.js`).split('\n').forEach((linha, i) => {
      if (/<[a-zA-Z]/.test(linha) && (crua.test(linha) || categoriaCrua.test(linha))) {
        assert.fail(`${modulo}.js:${i + 1} interpola campo de texto livre sem esc(): ${linha.trim().slice(0, 120)}`);
      }
    });
  }
});

test('o sanitizador continua removendo scripts e handlers inline', () => {
  const ui = ler('core/ui.js');
  assert.match(ui, /querySelectorAll\('script,iframe,object,embed,base,link,meta,foreignObject'\)/);
  assert.match(ui, /nome\.startsWith\('on'\)/);
});
