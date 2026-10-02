/* =========== HTML SEGURO =========== */
// Escapa texto vindo de usuário/API antes de entrar em um template HTML (conteúdo ou atributo).
const ESCAPES_HTML = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(valor){
  return String(valor ?? '').replace(/[&<>"']/g, c=>ESCAPES_HTML[c]);
}
// Argumento textual de uma ação declarativa (data-click="acao('...')"): escapa \ e ' para o
// interpretador de ações e depois o HTML do atributo.
function escArg(valor){
  return esc(String(valor ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
}
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

/* =========== TEMA CLARO / ESCURO =========== */
function temaAtual(){
  return document.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : 'claro';
}

function aplicarTema(tema, salvar=true){
  const modo = (tema === 'escuro' || tema === 'dark') ? 'escuro' : 'claro';
  document.documentElement.setAttribute('data-tema', modo);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if(metaTheme) metaTheme.setAttribute('content', modo === 'escuro' ? '#111827' : '#ffffff');
  const btnTema = document.getElementById('btn-tema');
  if(btnTema){
    const label = modo === 'escuro' ? 'Ativar tema claro' : 'Ativar tema escuro';
    btnTema.setAttribute('aria-label', label);
    btnTema.setAttribute('title', label);
    const spanLabel = document.getElementById('label-btn-tema');
    if(spanLabel){
      spanLabel.textContent = modo === 'escuro' ? 'Tema claro' : 'Tema escuro';
    }
  }
  if(salvar){
    try{ localStorage.setItem('temaPreferido', modo); }catch(e){}
  }
}

function alternarTema(){
  const proximo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  aplicarTema(proximo, true);
}

function inicializarTema(){
  let salvo = null;
  try{ salvo = localStorage.getItem('temaPreferido'); }catch(e){}
  if(salvo === 'escuro' || salvo === 'claro'){
    aplicarTema(salvo, false);
    return;
  }
  const prefereEscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  aplicarTema(prefereEscuro ? 'escuro' : 'claro', false);
}

// Inicializa o tema imediatamente para evitar flash de tela clara
if(typeof document !== 'undefined'){
  inicializarTema();
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

/* =========== AUXILIARES COMPARTILHADOS ENTRE MÓDULOS ===========
 * Usados por mais de um domínio; ficam no núcleo para não dependerem da ordem de carregamento. */
function barras(itens,total,classe,mostrarValor=true){
  if(!itens.length || total<=0) return '<div class="vazio">Nada lançado neste período.</div>';
  return itens.map(i=>`
    <div class="linha-barra">
      <div class="topo-linha"><span>${esc(i.nome)}</span>${mostrarValor?`<span class="num">${fmt(i.valor)}</span>`:''}</div>
      <div class="trilho"><div class="preenche ${classe}" style="width:${Math.max(2,(i.valor/total)*100)}%"></div></div>
    </div>`).join('');
}

function nomeTipoConta(t){
  return {imposto:'Imposto', energia:'Energia elétrica', agua:'Água', internet:'Internet/sistema', outra:'Outra conta fixa'}[t] || t;
}

function nomeMotivoVencido(m){
  return {vencido:'Vencido', avariado:'Avariado', perdido:'Perdido'}[m] || m;
}

/* =========== CARTÕES DE KPI (usados em vários módulos) =========== */
function deslocarData(dataStr,dias){
  const d=new Date(dataStr+'T12:00:00');
  d.setDate(d.getDate()+dias);
  return d.toISOString().slice(0,10);
}

// Indicadores de um conjunto de dias: totais, caixa em dinheiro, cartões e a série diária.
function indicadoresDoPeriodo(un,datas){
  const movs=filtrar({unidade:un,datas});
  const ent=movs.filter(l=>l.tipo==='entrada'), sai=movs.filter(l=>l.tipo==='saida');
  const totE=somar(ent), totS=somar(sai);
  const serie=datas.map(d=>{
    const doDia=movs.filter(l=>l.data===d);
    const e=somar(doDia.filter(l=>l.tipo==='entrada')), s=somar(doDia.filter(l=>l.tipo==='saida'));
    return {dia:d,e,s,saldo:e-s};
  });
  return {
    entradas:totE, saidas:totS, saldo:totE-totS,
    margem: totE>0 ? (totE-totS)/totE*100 : null,
    dinheiro: somar(ent.filter(l=>l.categoria==='dinheiro')) - somarSaidasEmDinheiro(sai),
    cartoes: somar(ent.filter(l=>l.categoria==='debito'||l.categoria==='credito')),
    serie
  };
}

function miniGrafico(valores,rotulos=[]){
  if(valores.length<2 || valores.every(v=>v===0)) return '';
  const w=120, h=32, min=Math.min(...valores), max=Math.max(...valores);
  const y=v=>h-2-((v-min)/((max-min)||1))*(h-4);
  const x=i=>(i/(valores.length-1))*w;
  const linha=valores.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
  const dica=rotulos.length ? rotulos.map((r,i)=>r+': '+fmt(valores[i])).join('\n') : 'Evolução dia a dia no período';
  // O texto do popover vem de data-dica e é exibido por CSS (.kpi-spark-wrap:hover::after).
  return `<span class="kpi-spark-wrap" tabindex="0" data-dica="${dica}">
    <svg class="kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${dica}">
      <polyline points="${linha}" class="kpi-spark-linha"/>
    </svg>
  </span>`;
}

// Variação contra o período anterior. subirEhBom=false inverte a cor (ex.: saídas).
function variacaoKpi(atual,anterior,subirEhBom){
  if(anterior===0 && atual===0) return '<span class="kpi-delta neutro">sem variação</span>';
  if(anterior===0) return '<span class="kpi-delta neutro">sem base anterior</span>';
  const pct=(atual-anterior)/Math.abs(anterior)*100;
  if(Math.abs(pct)<0.05) return '<span class="kpi-delta neutro">= estável</span>';
  const sobe=pct>0, bom=sobe===subirEhBom;
  const txt=Math.abs(pct).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  return `<span class="kpi-delta ${bom?'bom':'ruim'}">${sobe?'▲':'▼'} ${txt}</span>`;
}

function cartaoKpi({rotulo,valor,classeValor='',delta='',apoio='',grafico='',destaque=false}){
  return `<div class="kpi${destaque?' kpi-destaque':''}">
    <div class="kpi-rotulo">${rotulo}</div>
    <div class="kpi-linha-valor"><div class="kpi-valor num ${classeValor}">${valor}</div>${grafico}</div>
    ${(delta||apoio) ? `<div class="kpi-rodape">${delta}<span class="kpi-apoio">${apoio}</span></div>` : ''}
  </div>`;
}
