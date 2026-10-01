/*
 * Adia a restauração para o próximo ciclo. Além de aguardar o DOM, isso garante
 * que todas as constantes do núcleo estejam inicializadas antes de abrir a rota
 * persistida pelo usuário.
 */
window.addEventListener('DOMContentLoaded',()=>{
  setTimeout(()=>{
    try{ restaurarSessao(); }
    catch(erro){ mostrarErroVisivel('Erro ao iniciar o sistema: '+erro.message); }
  },0);
},{once:true});
