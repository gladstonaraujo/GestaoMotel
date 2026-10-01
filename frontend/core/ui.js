/* =========== HTML SEGURO =========== */
const DESCRITOR_INNER_HTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

function urlPermitida(valor){
  const url=String(valor||'').trim().replace(/[\u0000-\u001F\u007F\s]+/g,'');
  if(!url) return true;
  if(/^(?:https?:|\/|\.\/|\.\.\/|#)/i.test(url)) return true;
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(url);
}

function sanitizarHtml(html){
  const template=document.createElement('template');
  DESCRITOR_INNER_HTML.set.call(template, String(html??''));

  template.content.querySelectorAll('script,iframe,object,embed,base,link,meta,foreignObject').forEach(no=>no.remove());
  template.content.querySelectorAll('*').forEach(no=>{
    [...no.attributes].forEach(atributo=>{
      const nome=atributo.name.toLowerCase();
      if(nome.startsWith('on') || nome==='srcdoc' || nome==='formaction' || nome==='action'){
        no.removeAttribute(atributo.name);
        return;
      }
      if(['href','src','xlink:href','poster'].includes(nome) && !urlPermitida(atributo.value)){
        no.removeAttribute(atributo.name);
        return;
      }
      // Os únicos estilos dinâmicos legítimos são percentuais das barras.
      if(nome==='style' && !/^width:\s*(?:100|\d{1,2})(?:\.\d+)?%\s*;?$/i.test(atributo.value)){
        no.removeAttribute(atributo.name);
      }
    });
  });
  return DESCRITOR_INNER_HTML.get.call(template);
}

function definirHtmlConfiavel(elemento, html){
  DESCRITOR_INNER_HTML.set.call(elemento, String(html??''));
}

// Mantém os muitos componentes existentes protegidos enquanto são migrados
// gradualmente para criação explícita de nós e textContent.
Object.defineProperty(Element.prototype, 'innerHTML', {
  configurable: DESCRITOR_INNER_HTML.configurable,
  enumerable: DESCRITOR_INNER_HTML.enumerable,
  get: DESCRITOR_INNER_HTML.get,
  set(valor){ DESCRITOR_INNER_HTML.set.call(this, sanitizarHtml(valor)); }
});

/* =========== FOTO DO COMPROVANTE =========== */
function prevejaFoto(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto da nota ou do comprovante).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendente = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-img').src = AppEstado.ui.fotoPendente.dataUrl;
    document.getElementById('previa-foto-nome').textContent = arq.name;
    document.getElementById('previa-foto').classList.remove('oculto');
    document.getElementById('previa-foto-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFoto(){
  AppEstado.ui.fotoPendente = null;
  document.getElementById('f-foto').value='';
  document.getElementById('previa-foto').classList.add('oculto');
  document.getElementById('previa-foto-vazia').classList.remove('oculto');
}

function prevejaFotoBoleto(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto do boleto ou da nota).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendenteBoleto = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-boleto-img').src = AppEstado.ui.fotoPendenteBoleto.dataUrl;
    document.getElementById('previa-foto-boleto-nome').textContent = arq.name;
    document.getElementById('previa-foto-boleto').classList.remove('oculto');
    document.getElementById('previa-foto-boleto-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoBoleto(){
  AppEstado.ui.fotoPendenteBoleto = null;
  document.getElementById('fb-foto').value='';
  document.getElementById('previa-foto-boleto').classList.add('oculto');
  document.getElementById('previa-foto-boleto-vazia').classList.remove('oculto');
}

function prevejaFotoParcela(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto da nota).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendenteParcela = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-parcela-img').src = AppEstado.ui.fotoPendenteParcela.dataUrl;
    document.getElementById('previa-foto-parcela-nome').textContent = arq.name;
    document.getElementById('previa-foto-parcela').classList.remove('oculto');
    document.getElementById('previa-foto-parcela-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoParcela(){
  AppEstado.ui.fotoPendenteParcela = null;
  document.getElementById('fp-foto').value='';
  document.getElementById('previa-foto-parcela').classList.add('oculto');
  document.getElementById('previa-foto-parcela-vazia').classList.remove('oculto');
}
function abrirLightbox(dataUrl,legenda){
  document.getElementById('lightbox-img').src = dataUrl;
  document.getElementById('lightbox-legenda').textContent = legenda || '';
  document.getElementById('lightbox').classList.add('aberto');
}
function fecharLightbox(){
  document.getElementById('lightbox').classList.remove('aberto');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') fecharLightbox(); });

/* =========== UTILIDADES =========== */
const fmt = v => 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const hoje = () => new Date().toISOString().slice(0,10);
function diaMenos(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function dataBr(iso){ const [a,m,d]=iso.split('-'); return `${d}/${m}/${a}`; }
function nomeUnidade(id){ return (UNIDADES.find(u=>u.id===id)||{}).nome || id; }
function nomeCategoria(id){
  const t=[...ENTRADAS,...SAIDAS].find(c=>c.id===id); return t?t.nome:id;
}
function unidadesDoUsuario(){
  return usuario.unidades==='todas' ? UNIDADES.map(u=>u.id) : usuario.unidades;
}
function rotuloPapel(p){
  return {admin:'Administrador geral',gerente:'Gerente de unidade',funcionario:'Funcionário',inspetor:'Vistoria de suítes'}[p];
}

/* =========== MODAIS PRÓPRIOS (confirm/alert/prompt nativos não funcionam neste sandbox) =========== */
function confirmarAcao(mensagem){
  return new Promise(resolve=>{
    document.getElementById('modal-confirmacao-texto').textContent=mensagem;
    document.getElementById('modal-confirmacao').classList.remove('oculto');
    const limpar=()=>document.getElementById('modal-confirmacao').classList.add('oculto');
    document.getElementById('modal-confirmacao-ok').onclick=()=>{ limpar(); resolve(true); };
    document.getElementById('modal-confirmacao-cancelar').onclick=()=>{ limpar(); resolve(false); };
  });
}

function avisar(mensagem){
  document.getElementById('modal-aviso-texto').textContent=mensagem;
  document.getElementById('modal-aviso').classList.remove('oculto');
  document.getElementById('modal-aviso-ok').onclick=()=>document.getElementById('modal-aviso').classList.add('oculto');
}

function pedirValor(mensagem, valorPadrao){
  return new Promise(resolve=>{
    document.getElementById('modal-prompt-texto').textContent=mensagem;
    const input=document.getElementById('modal-prompt-input');
    input.value=valorPadrao||'';
    document.getElementById('modal-prompt').classList.remove('oculto');
    setTimeout(()=>{ input.focus(); input.select(); },50);
    const limpar=()=>document.getElementById('modal-prompt').classList.add('oculto');
    document.getElementById('modal-prompt-ok').onclick=()=>{ limpar(); resolve(input.value); };
    document.getElementById('modal-prompt-cancelar').onclick=()=>{ limpar(); resolve(null); };
  });
}
