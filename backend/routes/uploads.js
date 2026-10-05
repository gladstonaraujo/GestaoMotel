// Recebe uma foto em base64 (o jeito que o front-end já captura do input de arquivo),
// salva como arquivo de verdade em disco e devolve o link — assim o banco guarda só a
// URL (texto curto) em vez da foto inteira em base64 (texto gigante).
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

const PASTA_UPLOADS = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

const EXTENSAO_POR_TIPO = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif',
};

router.post('/', async (req, res) => {
  const { dataUrl } = req.body;
  const casamento = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!casamento) {
    return res.status(400).json({ erro: 'Envie uma foto válida (dataUrl no formato data:image/...;base64,...).' });
  }
  const [, tipo, base64] = casamento;
  const extensao = EXTENSAO_POR_TIPO[tipo];
  if (!extensao) {
    return res.status(400).json({ erro: 'Formato de imagem não aceito. Use JPEG, PNG, WEBP ou GIF.' });
  }
  const buffer = Buffer.from(base64, 'base64');
  const LIMITE_15MB = 15 * 1024 * 1024;
  if (buffer.length > LIMITE_15MB) {
    return res.status(400).json({ erro: 'Foto muito grande (máximo 15MB).' });
  }
  const nomeArquivo = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extensao}`;
  await fs.promises.writeFile(path.join(PASTA_UPLOADS, nomeArquivo), buffer);
  // Link relativo: o navegador busca a foto no mesmo endereço por onde abriu o sistema (IP da rede,
  // nome da máquina...). Um "http://localhost:3001" absoluto só funcionava no próprio servidor —
  // no celular ou tablet "localhost" é o próprio aparelho, e a foto não abria.
  const base = process.env.URL_BASE_UPLOADS || '';
  res.status(201).json({ url: `${base}/uploads/${nomeArquivo}` });
});

module.exports = router;
