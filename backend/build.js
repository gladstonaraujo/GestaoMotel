// Gera frontend/dist (JS e CSS minificados) e backend/dist/server.js (backend empacotado e minificado) (uso: npm run build)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const src = path.join(__dirname, '..', 'frontend');
const dist = path.join(src, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(src, 'script.js'), path.join(src, 'styles.css')],
  outdir: dist,
  minify: true,
  legalComments: 'none',
});
fs.copyFileSync(path.join(src, 'index.html'), path.join(dist, 'index.html'));
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
console.log('Front-end gerado em', dist);
console.log('Back-end gerado em', path.join(__dirname, 'dist', 'server.js'));
