require('dotenv').config();
require('./utils/patchAsyncRoutes'); // precisa vir antes de qualquer require('./routes/...')
const path = require('path');
const express = require('express');
const cors = require('cors');

// Sem um segredo forte, qualquer um consegue forjar um login. Em produção o servidor nem sobe.
const segredo = process.env.JWT_SECRET || '';
const segredoFraco = segredo.length < 32 || /dev-|nao-usar|troque|changeme|secret/i.test(segredo);
if (segredoFraco) {
  const comando = `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;
  const aviso = `JWT_SECRET ausente, curto (<32 caracteres) ou de exemplo. Gere um com:\n  ${comando}`;
  if (process.env.NODE_ENV === 'production') {
    console.error(`ERRO: ${aviso}`);
    process.exit(1);
  }
  console.warn(`ATENÇÃO: ${aviso}`);
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '15mb' })); // limite maior por causa das fotos em base64, se enviadas assim

// Fotos enviadas via /api/uploads ficam salvas aqui e são servidas como arquivo estático
// Quando roda empacotado (backend/dist/server.js), a raiz do backend é a pasta acima
const RAIZ = path.basename(__dirname) === 'dist' ? path.join(__dirname, '..') : __dirname;
app.use('/uploads', express.static(path.join(RAIZ, 'uploads')));

// O front-end (HTML/CSS/JS) é servido pelo próprio back-end — um processo só, uma porta só,
// sem precisar de outro servidor (nem sofrer com CORS, já que tudo vem da mesma origem)
// Em produção serve frontend/dist (gerado por `npm run build`); sem build, cai no código-fonte
const fs = require('fs');
const frontendDist = path.join(RAIZ, '..', 'frontend', 'dist');
app.use(express.static(fs.existsSync(frontendDist) ? frontendDist : path.join(RAIZ, '..', 'frontend')));

// Rotas
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/unidades', require('./routes/unidades'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/lancamentos', require('./routes/lancamentos'));
app.use('/api/boletos', require('./routes/boletos'));
app.use('/api/contas-fixas', require('./routes/contasFixas'));
app.use('/api/funcionarios', require('./routes/funcionarios'));
app.use('/api/faltas', require('./routes/faltas'));
app.use('/api/trocas', require('./routes/trocas'));
app.use('/api/vistorias', require('./routes/vistorias'));
app.use('/api/produtos-vencidos', require('./routes/produtosVencidos'));
app.use('/api/revpar', require('./routes/revpar'));
app.use('/api/manutencao', require('./routes/manutencao'));
app.use('/api/boletos-admin', require('./routes/boletosAdmin'));
app.use('/api/consumo-plantao', require('./routes/consumoPlantao'));
app.use('/api/notas-fiscais', require('./routes/notasFiscais'));
app.use('/api/historico-exclusoes', require('./routes/historicoExclusoes'));
app.use('/api/relatorio', require('./routes/relatorio'));

app.get('/api/saude', (req, res) => res.json({ ok: true }));

// Captura erros que os handlers não trataram, pra nunca devolver uma página de erro genérica
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

const porta = process.env.PORT || 3001;
// 0.0.0.0 (não só "localhost") pra outros computadores/tablets da mesma rede local conseguirem
// acessar pelo IP desta máquina, não só por quem está rodando o servidor
app.listen(porta, '0.0.0.0', () => console.log(`Sistema rodando em http://localhost:${porta} (e no IP desta máquina, pra outros dispositivos da rede)`));
