// Validações pequenas e reutilizáveis. Cada uma devolve a mensagem de erro (texto) ou null se estiver ok.
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(valor) {
  if (typeof valor !== 'string' || !DATA_ISO.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function valorPositivo(valor, max = 10000000) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 && n <= max;
}

function texto(valor, max) {
  return typeof valor === 'string' && valor.length <= max;
}

// Usa assim: const erro = primeiroErro([ [cond, 'mensagem'], ... ]); if (erro) return res.status(400).json({ erro });
function primeiroErro(regras) {
  const falha = regras.find(([ok]) => !ok);
  return falha ? falha[1] : null;
}

module.exports = { dataValida, valorPositivo, texto, primeiroErro };
