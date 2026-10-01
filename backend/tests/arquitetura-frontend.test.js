const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend=path.resolve(__dirname,'../../frontend');
const ler=arquivo=>fs.readFileSync(path.join(frontend,arquivo),'utf8');

test('as 19 telas vivem nas views dos módulos sem duplicidade', () => {
  const modulos=['visao-geral','caixa','operacao','financeiro','gestao','sistema'];
  const ids=modulos.flatMap(modulo=>[...ler(`modulos/${modulo}/view.html`).matchAll(/<section\s+id="(tela-[^"]+)"/g)].map(m=>m[1]));
  assert.equal(ids.length,19);
  assert.equal(new Set(ids).size,19);
  assert.doesNotMatch(ler('index.html'),/<section\s+id="tela-/);
});

test('não há handlers HTML inline nem eval no front-end', () => {
  const arquivos=[];
  const visitar=dir=>fs.readdirSync(dir,{withFileTypes:true}).forEach(item=>{
    const destino=path.join(dir,item.name);
    if(item.name==='dist') return;
    if(item.isDirectory()) visitar(destino);
    else if(/\.(?:html|js)$/.test(item.name)) arquivos.push(destino);
  });
  visitar(frontend);
  const codigo=arquivos.map(arquivo=>fs.readFileSync(arquivo,'utf8')).join('\n');
  assert.doesNotMatch(codigo,/\son(?:click|change|input|submit|keydown)\s*=/i);
  assert.doesNotMatch(codigo,/\beval\s*\(|new\s+Function\s*\(/);
});

test('scripts e estilos de domínio são carregados sob demanda', () => {
  const index=ler('index.html');
  assert.doesNotMatch(index,/<script[^>]+src="modulos\//);
  assert.doesNotMatch(index,/<link[^>]+href="modulos\//);
  assert.match(ler('core/views.js'),/carregarModuloDaTela/);
});

test('a sessão restaurada só abre a rota após inicialização completa do núcleo', () => {
  const app=ler('core/app.js');
  const bootstrap=ler('core/bootstrap.js');
  assert.match(app,/window\.atualizarVisibilidadeModoDespesa\?\.\(\)/);
  assert.match(bootstrap,/DOMContentLoaded/);
  assert.match(bootstrap,/setTimeout/);
});

test('o carregamento de dados não depende de mapa global sujeito a TDZ', () => {
  const app=ler('core/app.js');
  assert.doesNotMatch(app,/\b(?:const|let)\s+DADOS_POR_TELA\b/);
  assert.doesNotMatch(app,/\b(?:const|let)\s+(?:dadosCarregados|carregamentosAtivos|CARREGADORES_DADOS)\b/);
  assert.match(app,/function nomesDeDadosDaTela\(tela\)/);
  assert.match(app,/AppEstado\.cacheDeDados/);
  assert.match(app,/nomesDeDadosDaTela\(tela\)\.map\(carregarConjuntoDeDados\)/);
});

test('carregadores de dados pertencem ao núcleo e não aos módulos visuais', () => {
  const api=ler('core/api.js');
  const modulos=['caixa','operacao','financeiro','gestao','sistema']
    .map(modulo=>ler(`modulos/${modulo}/${modulo}.js`)).join('\n');
  for(const nome of ['recarregarLancamentos','recarregarBoletos','recarregarVistorias','recarregarFuncionarios','recarregarUsuarios']){
    assert.match(api,new RegExp(`async function ${nome}\\(`));
    assert.doesNotMatch(modulos,new RegExp(`function ${nome}\\(`));
  }
  assert.match(api,/function calcularRevpar\(/);
  assert.doesNotMatch(modulos,/function calcularRevpar\(/);
  assert.match(api,/function diasEntre\(/);
  assert.doesNotMatch(modulos,/function diasEntre\(/);
});

test('o build descobre arquivos do core e módulos pelas pastas', () => {
  const build=fs.readFileSync(path.resolve(__dirname,'../build.js'),'utf8');
  assert.match(build,/listarArquivos\(coreSrc,\s*'\.js'\)/);
  assert.match(build,/fs\.readdirSync\(modulosSrc/);
  assert.doesNotMatch(build,/\['modulos\.js',\s*'api\.js'/);
  assert.doesNotMatch(build,/\['visao-geral',\s*'caixa'/);
});
