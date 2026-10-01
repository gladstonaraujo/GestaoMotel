/* Módulo Operação
 * Vistorias de suítes, manutenção de terceiros e consumo do plantão.
 */

/* =========== VISTORIA DE SUÍTES =========== */
function linhaChecklistHTML(it){
  return `<div class="linha-checklist" data-item="${it.id}" data-status="ok">
    <div class="topo-item">
      <span class="nome-item">${it.nome}</span>
      <div class="opcoes-item">
        <button type="button" class="on-ok" data-click="marcarItemVistoria('${it.id}','ok')">OK</button>
        <button type="button" data-click="marcarItemVistoria('${it.id}','problema')">Problema</button>
      </div>
    </div>
    <div class="detalhe-problema oculto">
      <input type="text" placeholder="Descreva o problema (ex.: mancha no lençol, controle da TV sem pilha)">
    </div>
  </div>`;
}

/* =========== GERENCIAR PERGUNTAS DO CHECKLIST (só diretor) =========== */
function limparFormItemVistoria(){
  document.getElementById('giv-id-original').value='';
  document.getElementById('giv-nome').value='';
  document.getElementById('giv-categoria').value='garagem';
  document.getElementById('giv-rapida').checked=false;
  document.getElementById('btn-cancelar-item-vistoria').classList.add('oculto');
  document.getElementById('msg-item-vistoria').textContent='';
}

function editarItemVistoria(id){
  const it=AppEstado.dados.itensVistoria.find(i=>i.id===id);
  if(!it) return;
  document.getElementById('giv-id-original').value=it.id;
  document.getElementById('giv-nome').value=it.nome;
  document.getElementById('giv-categoria').value=it.categoria;
  document.getElementById('giv-rapida').checked=AppEstado.dados.itensVistoriaRapida.includes(it.id);
  document.getElementById('btn-cancelar-item-vistoria').classList.remove('oculto');
  document.getElementById('msg-item-vistoria').textContent='';
}

async function excluirItemVistoria(id){
  if(!await confirmarAcao('Remover essa pergunta do checklist? Vistorias já feitas continuam guardando a resposta antiga.')) return;
  const it=AppEstado.dados.itensVistoria.find(i=>i.id===id);
  registrarExclusao('Pergunta do checklist de vistoria', it?it.nome:id, null);
  AppEstado.dados.itensVistoria=AppEstado.dados.itensVistoria.filter(i=>i.id!==id);
  const idxRapida=AppEstado.dados.itensVistoriaRapida.indexOf(id);
  if(idxRapida>-1) AppEstado.dados.itensVistoriaRapida.splice(idxRapida,1);
  montarChecklistVistoria();
  desenharGerenciarItensVistoria();
}

function salvarItemVistoria(){
  const idOriginal=document.getElementById('giv-id-original').value;
  const nome=document.getElementById('giv-nome').value.trim();
  const categoria=document.getElementById('giv-categoria').value;
  const naRapida=document.getElementById('giv-rapida').checked;
  const msg=document.getElementById('msg-item-vistoria');

  if(!nome){
    msg.style.color='var(--saida)';
    msg.textContent='Escreva o texto da pergunta.';
    return;
  }

  if(idOriginal){
    const it=AppEstado.dados.itensVistoria.find(i=>i.id===idOriginal);
    if(it){ it.nome=nome; it.categoria=categoria; }
    const idxRapida=AppEstado.dados.itensVistoriaRapida.indexOf(idOriginal);
    if(naRapida && idxRapida===-1) AppEstado.dados.itensVistoriaRapida.push(idOriginal);
    if(!naRapida && idxRapida>-1) AppEstado.dados.itensVistoriaRapida.splice(idxRapida,1);
    msg.style.color='var(--entrada)';
    msg.textContent='Pergunta atualizada.';
  }else{
    const novoId='iv_'+Date.now();
    AppEstado.dados.itensVistoria.push({id:novoId, categoria, nome});
    if(naRapida) AppEstado.dados.itensVistoriaRapida.push(novoId);
    msg.style.color='var(--entrada)';
    msg.textContent='Pergunta adicionada.';
  }

  limparFormItemVistoria();
  setTimeout(()=>{ msg.textContent=''; },4000);
  montarChecklistVistoria();
  desenharGerenciarItensVistoria();
}

function desenharGerenciarItensVistoria(){
  const painel=document.getElementById('painel-gerenciar-checklist');
  if(!painel || !usuario) return;
  const podeVer = usuario.papel==='admin';
  painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const ordenados=AppEstado.dados.itensVistoria.slice().sort((a,b)=> a.categoria<b.categoria?-1:a.categoria>b.categoria?1:0);
  document.getElementById('tab-itens-vistoria').innerHTML = ordenados.length ? ordenados.map(it=>{
    const cat=CATEGORIAS_VISTORIA.find(c=>c.id===it.categoria);
    return `<tr>
      <td>${cat?cat.nome:it.categoria}</td>
      <td>${it.nome}</td>
      <td class="n">${AppEstado.dados.itensVistoriaRapida.includes(it.id)?'Sim':'—'}</td>
      <td class="n">
        <button class="btn-mini" data-click="editarItemVistoria('${it.id}')">Editar</button>
        <button class="btn-mini" data-click="excluirItemVistoria('${it.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="vazio">Nenhuma pergunta cadastrada.</td></tr>';
}

function modoVistoriaAtual(){
  return (usuario && usuario.papel==='funcionario') ? 'rapida' : 'completa';
}

function montarChecklistVistoria(){
  const cont=document.getElementById('checklist-vistoria');
  if(!cont) return;
  const modo = modoVistoriaAtual();

  const aviso=document.getElementById('aviso-tipo-vistoria');
  if(aviso){
    aviso.textContent = modo==='rapida'
      ? 'Vistoria rápida de início de plantão — 9 itens essenciais.'
      : 'Vistoria completa — todas as categorias e itens.';
  }

  if(modo==='rapida'){
    const itensRapidos = AppEstado.dados.itensVistoria.filter(it=>AppEstado.dados.itensVistoriaRapida.includes(it.id));
    cont.innerHTML = `<div class="grupo-checklist">
      <div class="corpo-grupo-checklist u-padding-top-10">
        ${itensRapidos.map(linhaChecklistHTML).join('')}
      </div>
    </div>`;
    return;
  }

  cont.innerHTML = CATEGORIAS_VISTORIA.map((cat,i)=>{
    const itensCat = AppEstado.dados.itensVistoria.filter(it=>it.categoria===cat.id);
    return `<div class="grupo-checklist">
      <button type="button" class="titulo-grupo-checklist" data-click="alternarGrupoChecklist('${cat.id}')">
        <span>${cat.nome}</span><span class="contagem-grupo">${itensCat.length} itens</span>
      </button>
      <div class="corpo-grupo-checklist${i===0?'':' oculto'}" id="corpo-grupo-${cat.id}">
        ${itensCat.map(linhaChecklistHTML).join('')}
      </div>
    </div>`;
  }).join('');
}

function alternarGrupoChecklist(catId){
  document.getElementById('corpo-grupo-'+catId).classList.toggle('oculto');
}

function marcarItemVistoria(itemId, status){
  const linha=document.querySelector(`.linha-checklist[data-item="${itemId}"]`);
  linha.dataset.status=status;
  const botoes=linha.querySelectorAll('.opcoes-item button');
  botoes[0].className = status==='ok' ? 'on-ok' : '';
  botoes[1].className = status==='problema' ? 'on-problema' : '';
  linha.querySelector('.detalhe-problema').classList.toggle('oculto', status!=='problema');
}

function prevejaFotoVistoria(input){
  const arquivos=[...(input.files||[])];
  arquivos.forEach(arq=>{
    if(!arq.type.startsWith('image/')) return;
    const leitor=new FileReader();
    leitor.onload = e=>{
      AppEstado.ui.fotosPendentesVistoria.push({dataUrl:e.target.result, nome:arq.name});
      renderizarFotosPendentesVistoria();
    };
    leitor.readAsDataURL(arq);
  });
  input.value='';
}
function removerFotoVistoria(idx){
  AppEstado.ui.fotosPendentesVistoria.splice(idx,1);
  renderizarFotosPendentesVistoria();
}
function renderizarFotosPendentesVistoria(){
  document.getElementById('fotos-pendentes-vistoria').innerHTML = AppEstado.ui.fotosPendentesVistoria.map((f,i)=>
    `<div class="foto-anexada"><img src="${f.dataUrl}" alt=""><button type="button" data-click="removerFotoVistoria(${i})">×</button></div>`
  ).join('');
  document.getElementById('vistoria-fotos-vazia').classList.toggle('oculto', AppEstado.ui.fotosPendentesVistoria.length>0);
}

async function salvarVistoria(){
  const suite=document.getElementById('fv-suite').value.trim();
  const turno=document.getElementById('fv-turno').value;
  const observacaoGeral=document.getElementById('fv-obs').value.trim();
  const msg=document.getElementById('msg-vistoria');

  if(!suite){
    msg.style.color='var(--saida)';
    msg.textContent='Informe o número ou nome da suíte.';
    return;
  }

  const tipoVistoria = modoVistoriaAtual();
  const itens = [...document.querySelectorAll('#checklist-vistoria .linha-checklist')].map(linha=>{
    const id=linha.dataset.item;
    const def=AppEstado.dados.itensVistoria.find(it=>it.id===id);
    const status=linha.dataset.status||'ok';
    const obs = status==='problema' ? linha.querySelector('.detalhe-problema input').value.trim() : '';
    return {id, nome:def?def.nome:id, status, obs};
  });

  const problemas=itens.filter(i=>i.status==='problema');
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  if(problemas.length && podeAnexarFoto && AppEstado.ui.fotosPendentesVistoria.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Foto obrigatória: anexe ao menos uma foto, já que foi marcado "Problema" em '+problemas.length+' item(ns).';
    return;
  }

  try{
    await api('/vistorias', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), suite, data: dataAtual(), turno, tipo_vistoria: tipoVistoria,
      observacao_geral: observacaoGeral || null,
      itens: itens.map(i=>({id:i.id, status:i.status, observacao:i.obs||null})),
      fotos_url: await Promise.all(AppEstado.ui.fotosPendentesVistoria.map(f=>enviarFoto(f.dataUrl)))
    }) });
    await recarregarVistorias();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fv-suite').value='';
  document.getElementById('fv-obs').value='';
  AppEstado.ui.fotosPendentesVistoria=[];
  renderizarFotosPendentesVistoria();
  montarChecklistVistoria();
  msg.style.color='var(--entrada)';
  msg.textContent = problemas.length
    ? `Vistoria da suíte ${suite} salva com ${problemas.length} problema(s) sinalizado(s).`
    : `Vistoria da suíte ${suite} salva — tudo certo.`;
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharVistorias();
}

function desenharDashboardFuncionarioVistoria(){
  const painel=document.getElementById('painel-dashboard-funcionario-vistoria');
  const podeVer = usuario.papel==='gerente';
  if(painel) painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=AppEstado.dados.vistorias.filter(v=>v.unidade===un && v.data>=desde);

  document.getElementById('sub-dashboard-funcionario-vistoria').textContent =
    `${nomeUnidade(un)} · últimos 30 dias, por quem fez a vistoria`;

  const porPessoa={};
  lista.forEach(v=>{
    const p=porPessoa[v.feitoPor] || (porPessoa[v.feitoPor]={total:0, comProblema:0, ultima:v.data});
    p.total++;
    if(v.itens.some(i=>i.status==='problema')) p.comProblema++;
    if(v.data>p.ultima) p.ultima=v.data;
  });

  const linhas=Object.entries(porPessoa).sort((a,b)=>b[1].total-a[1].total);
  document.getElementById('tab-dashboard-funcionario-vistoria').innerHTML = linhas.length
    ? linhas.map(([nome,p])=>`
      <tr>
        <td>${nome}</td>
        <td class="n num">${p.total}</td>
        <td class="n verde num">${p.total-p.comProblema}</td>
        <td class="n vermelho num">${p.comProblema}</td>
        <td class="n">${dataBr(p.ultima)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Nenhuma vistoria registrada nesta unidade no período.</td></tr>';
}

function desenharDashboardVistoria(){
  desenharDashboardFuncionarioVistoria();
  const painel=document.getElementById('painel-dashboard-vistoria');
  const podeVer = usuario.papel==='admin';
  if(painel) painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=AppEstado.dados.vistorias.filter(v=>v.unidade===un && v.data>=desde);
  const total=lista.length;
  const comProblema=lista.filter(v=>v.itens.some(i=>i.status==='problema')).length;
  const pctOk = total ? Math.round(((total-comProblema)/total)*100) : 0;
  const suitesDistintas = new Set(lista.map(v=>v.suite)).size;
  const totalFotos = lista.reduce((s,v)=>s+(v.fotos?v.fotos.length:0),0);
  const rapidas = lista.filter(v=>v.tipoVistoria==='rapida').length;

  document.getElementById('sub-dashboard-vistoria').textContent = `${nomeUnidade(un)} · últimos 30 dias`;

  document.getElementById('grade-stats-vistoria').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${total}</div><div class="rotulo-stat">Vistorias registradas</div></div>
    <div class="stat-vistoria"><div class="num-stat verde">${pctOk}%</div><div class="rotulo-stat">Sem nenhum problema</div></div>
    <div class="stat-vistoria"><div class="num-stat vermelho">${comProblema}</div><div class="rotulo-stat">Vistorias com problema</div></div>
    <div class="stat-vistoria"><div class="num-stat">${suitesDistintas}</div><div class="rotulo-stat">Suítes distintas vistoriadas</div></div>
    <div class="stat-vistoria"><div class="num-stat">${rapidas}/${total}</div><div class="rotulo-stat">Vistorias rápidas (plantão)</div></div>
    <div class="stat-vistoria"><div class="num-stat">${totalFotos}</div><div class="rotulo-stat">Fotos anexadas no período</div></div>
  `;

  // ranking de itens mais reportados
  const contagemItens={};
  lista.forEach(v=> v.itens.filter(i=>i.status==='problema').forEach(i=>{
    contagemItens[i.nome]=(contagemItens[i.nome]||0)+1;
  }));
  const rankingItens=Object.entries(contagemItens).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maiorItem=rankingItens.length ? rankingItens[0][1] : 1;
  document.getElementById('ranking-problemas-vistoria').innerHTML = rankingItens.length
    ? barras(rankingItens.map(([nome,valor])=>({nome,valor})), maiorItem, 's')
    : '<div class="vazio">Nenhum problema reportado no período.</div>';

  // problemas por categoria
  const contagemCategoria={};
  CATEGORIAS_VISTORIA.forEach(c=> contagemCategoria[c.id]=0);
  lista.forEach(v=> v.itens.filter(i=>i.status==='problema').forEach(i=>{
    const def=AppEstado.dados.itensVistoria.find(it=>it.id===i.id);
    if(def) contagemCategoria[def.categoria]=(contagemCategoria[def.categoria]||0)+1;
  }));
  const rankingCategoria=CATEGORIAS_VISTORIA.map(c=>({nome:c.nome,valor:contagemCategoria[c.id]}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  const maiorCategoria=rankingCategoria.length ? rankingCategoria[0].valor : 1;
  document.getElementById('ranking-categoria-vistoria').innerHTML = rankingCategoria.length
    ? barras(rankingCategoria, maiorCategoria, 's', false)
    : '<div class="vazio">Nenhum problema reportado no período.</div>';

  // suítes com mais problemas
  const contagemSuite={};
  lista.forEach(v=>{
    const qtd=v.itens.filter(i=>i.status==='problema').length;
    if(qtd>0) contagemSuite[v.suite]=(contagemSuite[v.suite]||0)+qtd;
  });
  const rankingSuites=Object.entries(contagemSuite).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maiorSuite=rankingSuites.length ? rankingSuites[0][1] : 1;
  document.getElementById('ranking-suites-vistoria').innerHTML = rankingSuites.length
    ? barras(rankingSuites.map(([nome,valor])=>({nome:'Suíte '+nome,valor})), maiorSuite, 's')
    : '<div class="vazio">Nenhuma suíte com problema no período.</div>';

  // últimas vistorias com problema
  const comProblemaLista = lista.filter(v=>v.itens.some(i=>i.status==='problema'))
    .slice().sort((a,b)=> a.data<b.data?1:-1).slice(0,8);
  document.getElementById('tab-ultimas-problemas-vistoria').innerHTML = comProblemaLista.length
    ? comProblemaLista.map(v=>{
        const qtd=v.itens.filter(i=>i.status==='problema').length;
        return `<tr>
          <td>${dataBr(v.data)}</td>
          <td>${v.suite}</td>
          <td><span class="selo ${v.turno}">${v.turno==='dia'?'Dia':'Noite'}</span></td>
          <td>${v.feitoPor}</td>
          <td>${v.tipoVistoria==='rapida'?'Rápida':'Completa'}</td>
          <td class="n vermelho num">${qtd}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="vazio">Nenhuma vistoria com problema no período.</td></tr>';

  const alertasPrioridade=calcularAlertasVistoria(un);
  document.getElementById('alertas-prioridade-vistoria').innerHTML = alertasPrioridade.length
    ? alertasPrioridade.map(a=>`<div class="alerta-item cursor-padrao">
        <span class="selo-alerta atipico">Prioridade</span>
        <div class="alerta-corpo"><div class="alerta-titulo">${a.item} — Suíte ${a.suite}</div>
        <div class="alerta-motivo">${a.motivo}</div></div>
      </div>`).join('')
    : '<div class="vazio">Nenhum problema recorrente no momento.</div>';
}

function atualizarVisibilidadeFotoVistoria(){
  const bloco=document.getElementById('bloco-foto-vistoria');
  if(!bloco || !usuario) return;
  const pode = usuario.papel==='admin' || usuario.papel==='gerente';
  bloco.classList.toggle('oculto', !pode);
  if(!pode){
    AppEstado.ui.fotosPendentesVistoria=[];
    renderizarFotosPendentesVistoria();
  }
}

function calcularAlertasVistoria(un){
  const desde=diaMenos(29);
  const comProblema=AppEstado.dados.vistorias.filter(v=>v.unidade===un && v.data>=desde && v.itens.some(i=>i.status==='problema'));
  const grupos={};
  comProblema.forEach(v=>{
    v.itens.filter(i=>i.status==='problema').forEach(i=>{
      const chave=i.id+'|'+v.suite;
      (grupos[chave]=grupos[chave]||[]).push({data:v.data, obs:i.obs, nome:i.nome, suite:v.suite});
    });
  });
  const alertas=[];
  Object.values(grupos).forEach(g=>{
    if(g.length>=2){
      alertas.push({
        item:g[0].nome, suite:g[0].suite, quantidade:g.length,
        motivo:`"${g[0].nome}" reportado como problema na suíte ${g[0].suite}, ${g.length} vezes nos últimos 30 dias — recomenda-se manutenção com prioridade.`
      });
    }
  });
  return alertas.sort((a,b)=>b.quantidade-a.quantidade);
}

function desenharVistorias(){
  atualizarVisibilidadeFotoVistoria();
  desenharDashboardVistoria();
  desenharGerenciarItensVistoria();
  const un=unidadeAtual();
  const lista=AppEstado.dados.vistorias.filter(v=>v.unidade===un && v.itens.some(i=>i.status==='problema'))
    .slice().sort((a,b)=> a.data<b.data?1:a.data>b.data?-1:0);

  document.getElementById('sub-vistorias').textContent =
    `${nomeUnidade(un)} · ${lista.length} vistoria(s) com problema (o histórico não guarda as que ficaram "tudo OK").`;

  document.getElementById('lista-vistorias').innerHTML = lista.length ? lista.map(v=>{
    const problemas=v.itens.filter(i=>i.status==='problema');
    const selo = `<span class="selo-status atrasado">${problemas.length} problema(s)</span>`;
    const listaProblemas = `<ul class="lista-problemas">${problemas.map(p=>`<li>${p.nome}${p.obs?': '+p.obs:''}</li>`).join('')}</ul>`;
    const fotos = v.fotos && v.fotos.length
      ? `<div class="grade-fotos-cartao">${v.fotos.map(f=>`<img src="${f}" alt="Foto da suíte" data-click="abrirLightbox('${f}','Suíte ${v.suite} · ${dataBr(v.data)}')">`).join('')}</div>`
      : '';
    return `<div class="cartao-vistoria">
      <div class="topo-vistoria">
        <div><div class="titulo-vistoria">Suíte ${v.suite}${v.tipoVistoria==='rapida'?' <span class="voce-selo">(vistoria rápida)</span>':''}</div>
        <div class="sub-vistoria">${dataBr(v.data)} · ${v.turno==='dia'?'Dia':'Noite'} · vistoriado por ${v.feitoPor}</div></div>
        ${selo}
      </div>
      ${listaProblemas}
      ${v.observacaoGeral?`<div class="sub-boleto">${v.observacaoGeral}</div>`:''}
      ${fotos}
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma vistoria com problema registrada nesta unidade.</div>';
}

async function apagar(i){
  if(!temPermissaoFinanceira(usuario,'excluir_lancamentos')){
    avisar('Você não tem permissão pra excluir lançamentos. Fale com o diretor.');
    return;
  }
  if(!await confirmarAcao('Excluir esse lançamento? Essa ação não pode ser desfeita.')) return;
  const l=AppEstado.dados.lancamentos[i];
  if(!l) return;
  try{
    await api('/lancamentos/'+l.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Lançamento', `${l.tipo==='entrada'?'Entrada':'Saída'} — ${nomeCategoria(l.categoria)} — ${fmt(l.valor)} (${dataBr(l.data)})`, l.unidade);
  await recarregarLancamentos();
  desenhar();
}

function abrirModalEditarLancamento(l){
  return new Promise(resolve=>{
    const categorias = l.tipo==='entrada' ? ENTRADAS : SAIDAS;
    document.getElementById('ml-categoria').innerHTML = categorias.map(c=>
      `<option value="${c.id}" ${c.id===l.categoria?'selected':''}>${c.nome}</option>`).join('');
    document.getElementById('ml-turno').value = l.turno;
    document.getElementById('ml-valor').value = l.valor.toFixed(2);
    document.getElementById('ml-obs').value = l.obs||'';
    document.getElementById('modal-editar-lancamento-erro').classList.add('oculto');
    document.getElementById('modal-editar-lancamento').classList.remove('oculto');
    const limpar=()=>document.getElementById('modal-editar-lancamento').classList.add('oculto');
    document.getElementById('modal-editar-lancamento-ok').onclick=()=>{
      const valor=parseFloat(document.getElementById('ml-valor').value);
      if(!valor || valor<=0){
        const erro=document.getElementById('modal-editar-lancamento-erro');
        erro.textContent='Informe um valor válido.';
        erro.classList.remove('oculto');
        return;
      }
      const resultado={
        categoria: document.getElementById('ml-categoria').value,
        turno: document.getElementById('ml-turno').value,
        valor, obs: document.getElementById('ml-obs').value.trim()
      };
      limpar();
      resolve(resultado);
    };
    document.getElementById('modal-editar-lancamento-cancelar').onclick=()=>{ limpar(); resolve(null); };
  });
}

async function editarValorLancamento(i){
  if(!temPermissaoFinanceira(usuario,'editar_valores')){
    avisar('Você não tem permissão pra editar valores. Fale com o diretor.');
    return;
  }
  const l=AppEstado.dados.lancamentos[i];
  if(!l) return;
  const resultado=await abrirModalEditarLancamento(l);
  if(!resultado) return;
  try{
    await api('/lancamentos/'+l.id, { method:'PUT', body: JSON.stringify({
      categoria_id: resultado.categoria, turno: resultado.turno,
      valor: resultado.valor, observacao: resultado.obs
    }) });
  }catch(e){
    avisar(e.message);
    return;
  }
  await recarregarLancamentos();
  desenhar();
}

/* =========== MANUTENÇÃO DE TERCEIROS =========== */
function nomeServicoManutencao(s){
  return {maquina_lavar:'Máquina de lavar', maquina_secar:'Máquina de secar', maquina_passar:'Máquina de passar',
    camera:'Câmera', banheira:'Banheira', ar_condicionado:'Ar condicionado', internet:'Internet', outros:'Outros'}[s] || s;
}

async function salvarManutencao(){
  const servico=document.getElementById('fm-servico').value;
  const suite=document.getElementById('fm-suite').value.trim();
  const especificacao=document.getElementById('fm-especificacao').value.trim();
  const prestador=document.getElementById('fm-prestador').value.trim();
  const msg=document.getElementById('msg-manutencao');

  if(!especificacao || !prestador){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha a especificação do serviço e o prestador.';
    return;
  }

  try{
    await api('/manutencao', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), servico, especificacao, prestador, suite: suite||null
    }) });
    await recarregarManutencoes();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fm-suite').value='';
  document.getElementById('fm-especificacao').value='';
  document.getElementById('fm-prestador').value='';
  msg.style.color='var(--entrada)';
  msg.textContent='Chamado registrado.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharManutencao();
}

async function excluirManutencao(id){
  if(!await confirmarAcao('Excluir esse chamado?')) return;
  const m=AppEstado.dados.manutencoes.find(x=>x.id===id);
  if(!m) return;
  try{
    await api('/manutencao/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Manutenção de terceiros', `${nomeServicoManutencao(m.servico)} — ${m.especificacao}${m.suite?' (suíte '+m.suite+')':''}`, m.unidade);
  await recarregarManutencoes();
  desenharManutencao();
}

// critério de alerta: mesmo serviço na mesma unidade — 2+ vezes em 30 dias (com ou sem suíte igual, mas destaca se a suíte bater também)
function calcularAlertasManutencao(un){
  const desde=diaMenos(29);
  const lista=AppEstado.dados.manutencoes.filter(m=>m.unidade===un && m.registradoEm>=desde);
  const grupos={};
  lista.forEach(m=>{
    const chave=m.servico+'|'+(m.suite||'sem-suite');
    (grupos[chave]=grupos[chave]||[]).push(m);
  });
  const alertas=[];
  Object.values(grupos).forEach(g=>{
    if(g.length>=2){
      alertas.push({
        servico:g[0].servico, suite:g[0].suite, quantidade:g.length,
        motivo:`${nomeServicoManutencao(g[0].servico)}${g[0].suite?' na suíte '+g[0].suite:''} chamado ${g.length} vezes nos últimos 30 dias — recomenda-se manutenção com prioridade.`
      });
    }
  });
  return alertas.sort((a,b)=>b.quantidade-a.quantidade);
}

function desenharDashboardManutencao(){
  const painel=document.getElementById('painel-dashboard-manutencao');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=AppEstado.dados.manutencoes.filter(m=>m.unidade===un && m.registradoEm>=desde);
  const suitesDistintas=new Set(lista.filter(m=>m.suite).map(m=>m.suite)).size;
  const alertas=calcularAlertasManutencao(un);

  document.getElementById('sub-dashboard-manutencao').textContent = `${nomeUnidade(un)} · últimos 30 dias`;
  document.getElementById('grade-stats-manutencao').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${lista.length}</div><div class="rotulo-stat">Chamados no período</div></div>
    <div class="stat-vistoria"><div class="num-stat">${suitesDistintas}</div><div class="rotulo-stat">Suítes distintas atendidas</div></div>
    <div class="stat-vistoria"><div class="num-stat ${alertas.length?'vermelho':''}">${alertas.length}</div><div class="rotulo-stat">Alertas de prioridade</div></div>
  `;

  const contagemServico={};
  lista.forEach(m=> contagemServico[nomeServicoManutencao(m.servico)]=(contagemServico[nomeServicoManutencao(m.servico)]||0)+1);
  const rankingServico=Object.entries(contagemServico).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('ranking-servico-manutencao').innerHTML = rankingServico.length
    ? barras(rankingServico.map(([nome,valor])=>({nome,valor})), rankingServico[0][1], 's', false)
    : '<div class="vazio">Nenhum chamado no período.</div>';

  const contagemSuite={};
  lista.filter(m=>m.suite).forEach(m=> contagemSuite[m.suite]=(contagemSuite[m.suite]||0)+1);
  const rankingSuite=Object.entries(contagemSuite).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('ranking-suite-manutencao').innerHTML = rankingSuite.length
    ? barras(rankingSuite.map(([nome,valor])=>({nome:'Suíte '+nome,valor})), rankingSuite[0][1], 's', false)
    : '<div class="vazio">Nenhum chamado em suíte no período.</div>';

  document.getElementById('alertas-manutencao').innerHTML = alertas.length
    ? alertas.map(a=>`<div class="alerta-item cursor-padrao">
        <span class="selo-alerta atipico">Prioridade</span>
        <div class="alerta-corpo"><div class="alerta-titulo">${nomeServicoManutencao(a.servico)}${a.suite?' — Suíte '+a.suite:''}</div>
        <div class="alerta-motivo">${a.motivo}</div></div>
      </div>`).join('')
    : '<div class="vazio">Nenhum alerta de prioridade no momento.</div>';
}

function desenharManutencao(){
  desenharDashboardManutencao();
  const un=unidadeAtual();
  document.getElementById('titulo-manutencao').textContent='Chamados de '+nomeUnidade(un);
  const lista=AppEstado.dados.manutencoes.filter(m=>m.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-manutencao').innerHTML = lista.length ? lista.map(m=>`
    <tr>
      <td>${dataBr(m.registradoEm)}</td>
      <td>${nomeServicoManutencao(m.servico)}</td>
      <td>${m.especificacao}</td>
      <td>${m.prestador}</td>
      <td>${m.suite||'—'}</td>
      <td class="n"><button class="btn-mini" data-click="excluirManutencao('${m.id}')">Excluir</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum chamado registrado nesta unidade.</td></tr>';
}

/* =========== CONSUMO DO PLANTÃO =========== */
function ajustarQtdConsumo(delta){
  const campo=document.getElementById('fcp-quantidade');
  const atual=parseInt(campo.value,10)||1;
  campo.value=Math.max(1, atual+delta);
}

function adicionarItemConsumoPlantao(){
  const produto=document.getElementById('fcp-produto').value.trim();
  const quantidade=parseInt(document.getElementById('fcp-quantidade').value,10);
  const msg=document.getElementById('msg-consumo-plantao');

  if(!produto || !quantidade || quantidade<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Informe o produto e uma quantidade maior que zero.';
    return;
  }
  AppEstado.ui.itensConsumoPendente.push({produto, quantidade});
  document.getElementById('fcp-produto').value='';
  document.getElementById('fcp-quantidade').value='1';
  document.getElementById('fcp-produto').focus();
  msg.textContent='';
  renderizarItensConsumoPendente();
}

function removerItemConsumoPendente(idx){
  AppEstado.ui.itensConsumoPendente.splice(idx,1);
  renderizarItensConsumoPendente();
}

function renderizarItensConsumoPendente(){
  document.getElementById('lista-itens-consumo-pendente').innerHTML = AppEstado.ui.itensConsumoPendente.map((it,i)=>`
    <div class="item-pendente">
      <span>${it.quantidade}x ${it.produto}</span>
      <button type="button" data-click="removerItemConsumoPendente(${i})">remover</button>
    </div>`).join('');
}

async function salvarConsumoPlantao(){
  const turno=document.getElementById('fcp-turno').value;
  const msg=document.getElementById('msg-consumo-plantao');

  if(!AppEstado.ui.itensConsumoPendente.length){
    msg.style.color='var(--saida)';
    msg.textContent='Adicione pelo menos um item antes de salvar.';
    return;
  }

  try{
    await api('/consumo-plantao', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), turno, data: dataAtual(), itens: AppEstado.ui.itensConsumoPendente
    }) });
    await recarregarConsumosPlantao();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  AppEstado.ui.itensConsumoPendente=[];
  renderizarItensConsumoPendente();
  msg.style.color='var(--entrada)';
  msg.textContent='Registro do plantão salvo.';
  setTimeout(()=>{ msg.textContent=''; },4000);
  desenharConsumoPlantao();
}

async function excluirConsumoPlantao(id){
  if(!await confirmarAcao('Excluir esse registro?')) return;
  const c=AppEstado.dados.consumosPlantao.find(x=>x.id===id);
  if(!c) return;
  try{
    await api('/consumo-plantao/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Consumo do plantão', `${dataBr(c.data)} — ${c.itens.map(it=>`${it.quantidade}x ${it.produto}`).join(', ')}`, c.unidade);
  await recarregarConsumosPlantao();
  desenharConsumoPlantao();
}

function desenharDashboardConsumoPlantao(){
  const painel=document.getElementById('painel-dashboard-consumo-plantao');
  if(!painel || !usuario) return;
  const podeVer = podeVerDashboardsUsuario(usuario);
  painel.classList.toggle('oculto', !podeVer);
  if(!podeVer) return;

  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=AppEstado.dados.consumosPlantao.filter(c=>c.unidade===un && c.registradoEm>=desde);
  const totalItens=lista.reduce((s,c)=>s+c.itens.reduce((s2,it)=>s2+it.quantidade,0),0);

  document.getElementById('sub-dashboard-consumo-plantao').textContent = `${nomeUnidade(un)} · últimos 30 dias`;
  document.getElementById('grade-stats-consumo-plantao').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${lista.length}</div><div class="rotulo-stat">Registros no período</div></div>
    <div class="stat-vistoria"><div class="num-stat">${totalItens}</div><div class="rotulo-stat">Itens consumidos (total)</div></div>
  `;

  const contagemProduto={};
  lista.forEach(c=> c.itens.forEach(it=>{
    contagemProduto[it.produto]=(contagemProduto[it.produto]||0)+it.quantidade;
  }));
  const ranking=Object.entries(contagemProduto).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('ranking-consumo-plantao').innerHTML = ranking.length
    ? barras(ranking.map(([nome,valor])=>({nome,valor})), ranking[0][1], 's', false)
    : '<div class="vazio">Nenhum consumo registrado no período.</div>';
}

function desenharConsumoPlantao(){
  desenharDashboardConsumoPlantao();
  const un=unidadeAtual();
  document.getElementById('titulo-consumo-plantao').textContent='Registros de '+nomeUnidade(un);
  const lista=AppEstado.dados.consumosPlantao.filter(c=>c.unidade===un).slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-consumo-plantao').innerHTML = lista.length ? lista.map(c=>{
    const itensTxt=c.itens.map(it=>`${it.quantidade}x ${it.produto}`).join(', ');
    return `<tr>
      <td>${dataBr(c.data)}</td>
      <td><span class="selo ${c.turno}">${c.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${itensTxt}</td>
      <td>${c.criadoPor}</td>
      <td class="n"><button class="btn-mini" data-click="excluirConsumoPlantao('${c.id}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="vazio">Nenhum consumo registrado nesta unidade.</td></tr>';
}
