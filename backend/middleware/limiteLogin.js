// Limite simples de tentativas de login, em memória (basta pra um servidor só).
// Conta falhas por IP+login; depois de MAX_FALHAS erradas, bloqueia por BLOQUEIO_MS.
const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;

const tentativas = new Map(); // chave -> { falhas, primeira, bloqueadoAte }

function chave(req) {
  const login = String((req.body && req.body.login) || '').toLowerCase().slice(0, 100);
  return `${req.ip}|${login}`;
}

function verificarBloqueio(req, res, next) {
  const t = tentativas.get(chave(req));
  if (t && t.bloqueadoAte && t.bloqueadoAte > Date.now()) {
    const minutos = Math.ceil((t.bloqueadoAte - Date.now()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas erradas. Tente de novo em ${minutos} minuto(s).` });
  }
  next();
}

function registrarFalha(req) {
  const k = chave(req);
  const agora = Date.now();
  let t = tentativas.get(k);
  if (!t || agora - t.primeira > JANELA_MS) t = { falhas: 0, primeira: agora, bloqueadoAte: 0 };
  t.falhas += 1;
  if (t.falhas >= MAX_FALHAS) t.bloqueadoAte = agora + BLOQUEIO_MS;
  tentativas.set(k, t);
}

function registrarSucesso(req) {
  tentativas.delete(chave(req));
}

// limpeza periódica pra o mapa não crescer sem fim
setInterval(() => {
  const agora = Date.now();
  for (const [k, t] of tentativas) {
    if (agora - t.primeira > JANELA_MS && (!t.bloqueadoAte || t.bloqueadoAte < agora)) tentativas.delete(k);
  }
}, 10 * 60 * 1000).unref();

module.exports = { verificarBloqueio, registrarFalha, registrarSucesso };
