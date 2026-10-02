// Gera frontend/dist (JS e CSS minificados) e backend/dist/server.js (backend empacotado e minificado)
// Uso: npm run build
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const src = path.join(__dirname, '..', 'frontend');
const dist = path.join(src, 'dist');
const coreSrc = path.join(src, 'core');
const modulosSrc = path.join(src, 'modulos');

const listarArquivos = (dir, extensao) => fs.readdirSync(dir).filter(f => f.endsWith(extensao));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// Os scripts do front-end são carregados como scripts clássicos (funções globais, chamadas via
// window[nome]), então os identificadores não podem ser renomeados — só espaços e sintaxe.
function minificarJs(entrada, saida) {
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  esbuild.buildSync({
    entryPoints: [entrada],
    outfile: saida,
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    legalComments: 'none',
  });
}

function minificarCss(entrada, saida) {
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  esbuild.buildSync({ entryPoints: [entrada], outfile: saida, minify: true, legalComments: 'none' });
}

// Raiz: index.html e estilos compartilhados
minificarCss(path.join(src, 'styles.css'), path.join(dist, 'styles.css'));
fs.copyFileSync(path.join(src, 'index.html'), path.join(dist, 'index.html'));
fs.copyFileSync(path.join(src, 'logo-a2.png'), path.join(dist, 'logo-a2.png'));
if (fs.existsSync(path.join(src, 'logo-a2-dark.png'))) {
  fs.copyFileSync(path.join(src, 'logo-a2-dark.png'), path.join(dist, 'logo-a2-dark.png'));
}

// Núcleo: todos os .js de core/
for (const arquivo of listarArquivos(coreSrc, '.js')) {
  minificarJs(path.join(coreSrc, arquivo), path.join(dist, 'core', arquivo));
}

// Módulos: cada pasta de modulos/ com <nome>.js, <nome>.css (opcionais) e view.html
const modulos = fs.readdirSync(modulosSrc, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);
for (const nome of modulos) {
  const de = path.join(modulosSrc, nome);
  const para = path.join(dist, 'modulos', nome);
  fs.mkdirSync(para, { recursive: true });
  if (fs.existsSync(path.join(de, `${nome}.js`))) minificarJs(path.join(de, `${nome}.js`), path.join(para, `${nome}.js`));
  if (fs.existsSync(path.join(de, `${nome}.css`))) minificarCss(path.join(de, `${nome}.css`), path.join(para, `${nome}.css`));
  if (fs.existsSync(path.join(de, 'view.html'))) fs.copyFileSync(path.join(de, 'view.html'), path.join(para, 'view.html'));
}

// Back-end: um arquivo só; módulos nativos/opcionais ficam de fora e vêm do node_modules
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'server.js')],
  outfile: path.join(__dirname, 'dist', 'server.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  minify: true,
  legalComments: 'none',
  external: ['bcrypt', 'pg-native'],
});

console.log('Front-end gerado em', dist, `(${modulos.length} módulos)`);
console.log('Back-end gerado em', path.join(__dirname, 'dist', 'server.js'));
