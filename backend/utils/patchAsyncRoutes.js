// Sem isso, um erro dentro de uma rota "async (req,res)=>{...}" derruba o processo inteiro da
// API (o Express 4 não pega rejeições de Promise sozinho) — em vez de responder 500 só pra quem
// fez aquela requisição, o servidor cai pra todo mundo. Isso envolve toda rota registrada nos
// routers do Express, automaticamente, pra qualquer erro assíncrono virar um next(erro) normal.
const { Router } = require('express');

const metodosHttp = ['get', 'post', 'put', 'delete', 'patch', 'all', 'use'];

function protegerHandler(fn) {
  if (typeof fn !== 'function' || fn.length > 3) return fn; // deixa passar middleware de erro (4 argumentos) e não-funções
  return function (req, res, next) {
    try {
      const resultado = fn(req, res, next);
      if (resultado && typeof resultado.catch === 'function') resultado.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

// no Express 4, get/post/put/delete/use não ficam em Router.prototype — o próprio objeto
// Router (a função-fábrica) carrega esses métodos, e toda instância criada com Router()
// aponta pra ele via prototype chain (Object.getPrototypeOf(instancia) === Router)
metodosHttp.forEach(metodo => {
  const original = Router[metodo];
  Router[metodo] = function (...args) {
    const argsProtegidos = args.map(a => (typeof a === 'function' ? protegerHandler(a) : a));
    return original.apply(this, argsProtegidos);
  };
});
