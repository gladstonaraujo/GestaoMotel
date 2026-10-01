/* Módulo Financeiro
 * Boletos e Pix, impostos e energia, notas fiscais e boletos administrativos.
 */

/* =========== AppEstado.dados.boletos E NOTAS (Pix) =========== */
function alternarCompraConjunta(){
  const on=document.getElementById('fb-conjunta').checked;
  document.getElementById('bloco-conjunta').classList.toggle('oculto', !on);
  document.getElementById('bloco-valor-simples').classList.toggle('oculto', on);
  if(on) montarUnidadesConjunta();
}

function montarUnidadesConjunta(){
  const ids=unidadesDoUsuario();
  document.getElementById('fb-unidades-valores').innerHTML = ids.map(id=>`
    <div class="linha-unidade-valor">
      <label><input type="checkbox" class="chk-unidade-conjunta" value="${id}" checked data-change="dividirValorConjunta()"> ${nomeUnidade(id)}</label>
      <input type="number" class="valor-unidade-conjunta" data-unidade="${id}" min="0" step="0.01" placeholder="0,00">
    </div>`).join('');
  dividirValorConjunta();
}

function dividirValorConjunta(){
  const total=parseFloat(document.getElementById('fb-valor-total-conjunta').value)||0;
  const marcadas=[...document.querySelectorAll('.chk-unidade-conjunta:checked')];
  const valorCada = marcadas.length ? Math.round((total/marcadas.length)*100)/100 : 0;
  document.querySelectorAll('.valor-unidade-conjunta').forEach(inp=>{
    const chk=document.querySelector(`.chk-unidade-conjunta[value="${inp.dataset.unidade}"]`);
    inp.disabled = !chk.checked;
    if(chk.checked) inp.value = valorCada.toFixed(2);
  });
}

async function salvarBoleto(){
  const descricao=document.getElementById('fb-descricao').value.trim();
  const conjunta=document.getElementById('fb-conjunta').checked;
  const codigoBarras=document.getElementById('fb-codigo-barras').value.trim();
  const pixCopiaCola=document.getElementById('fb-pix-copia-cola').value.trim();
  const msg=document.getElementById('msg-boleto');

  if(!descricao){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha a descrição do boleto ou nota.';
    return;
  }

  if(conjunta){
    const totalConjunto=parseFloat(document.getElementById('fb-valor-total-conjunta').value);
    const vencimento=document.getElementById('fb-vencimento-conjunta').value;
    const marcadas=[...document.querySelectorAll('.chk-unidade-conjunta:checked')].map(c=>c.value);
    if(!totalConjunto || totalConjunto<=0 || !vencimento || marcadas.length===0){
      msg.style.color='var(--saida)';
      msg.textContent='Preencha o valor total, o vencimento e marque pelo menos uma unidade.';
      return;
    }
    const foto = AppEstado.ui.fotoPendenteBoleto ? await enviarFoto(AppEstado.ui.fotoPendenteBoleto.dataUrl) : null;
    const unidadesPayload = marcadas.map(uid=>({
      unidade_id: uid,
      valor: parseFloat(document.querySelector(`.valor-unidade-conjunta[data-unidade="${uid}"]`).value)||0
    }));
    try{
      await api('/boletos/conjunta', { method:'POST', body: JSON.stringify({
        descricao, vencimento, foto_url:foto, codigo_barras:codigoBarras||null, pix_copia_cola:pixCopiaCola||null,
        unidades: unidadesPayload
      }) });
      await recarregarBoletos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent=`Compra conjunta salva, dividida entre ${marcadas.length} unidade(s).`;
  }else{
    const valor=parseFloat(document.getElementById('fb-valor').value);
    const vencimento=document.getElementById('fb-vencimento').value;
    if(!valor || valor<=0 || !vencimento){
      msg.style.color='var(--saida)';
      msg.textContent='Preencha valor e vencimento.';
      return;
    }
    try{
      const fotoUrl = AppEstado.ui.fotoPendenteBoleto ? await enviarFoto(AppEstado.ui.fotoPendenteBoleto.dataUrl) : null;
      await api('/boletos', { method:'POST', body: JSON.stringify({
        unidade_id: unidadeAtual(), descricao, valor, vencimento,
        foto_url: fotoUrl,
        codigo_barras: codigoBarras||null, pix_copia_cola: pixCopiaCola||null
      }) });
      await recarregarBoletos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent='Boleto/nota salvo. Marque como pago quando o Pix for feito.';
  }

  document.getElementById('fb-descricao').value='';
  document.getElementById('fb-valor').value='';
  document.getElementById('fb-vencimento').value='';
  document.getElementById('fb-valor-total-conjunta').value='';
  document.getElementById('fb-vencimento-conjunta').value='';
  document.getElementById('fb-codigo-barras').value='';
  document.getElementById('fb-pix-copia-cola').value='';
  document.getElementById('fb-conjunta').checked=false;
  alternarCompraConjunta();
  removerFotoBoleto();
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharBoletos();
}

async function marcarBoletoPago(i){
  const b=AppEstado.dados.boletos[i];
  if(!await confirmarAcao(`Marcar "${b.descricao}" (${fmt(b.valor)}) como pago via Pix hoje?`)) return;
  try{
    await api('/boletos/'+b.id+'/marcar-pago', { method:'POST' });
  }catch(e){
    avisar(e.message);
    return;
  }
  // marcar como pago gera automaticamente a saída correspondente no caixa, do lado do servidor
  await Promise.all([recarregarBoletos(), recarregarLancamentos()]);
  desenhar();
}

function desenharBoletos(){
  const un=unidadeAtual();
  const podeExcluir = temPermissaoFinanceira(usuario,'excluir_boletos');
  document.getElementById('titulo-boletos').textContent='Boletos e notas de '+nomeUnidade(un);
  const lista=AppEstado.dados.boletos.filter(b=>b.unidade===un)
    .map((b,idxFiltro)=>({...b, indiceReal:AppEstado.dados.boletos.indexOf(b)}))
    .sort((a,b)=> a.status===b.status ? (a.vencimento<b.vencimento?-1:1) : (a.status==='pendente'?-1:1));

  document.getElementById('tab-boletos').innerHTML = lista.length ? lista.map(b=>{
    const atrasado = b.status==='pendente' && b.vencimento < hoje();
    const selo = b.status==='pago'
      ? '<span class="selo-status pago">Pago</span>'
      : atrasado ? '<span class="selo-status atrasado">Atrasado</span>' : '<span class="selo-status pendente">Pendente</span>';
    const legenda=`${b.descricao} · vencimento ${dataBr(b.vencimento)} · ${fmt(b.valor)}`;
    const outras = b.compraConjunta ? b.compraConjunta.unidades.filter(u=>u!==b.unidade).map(nomeUnidade) : [];
    const subConjunta = b.compraConjunta
      ? `<div class="sub-boleto">Compra conjunta de ${fmt(b.compraConjunta.valorTotalConjunto)}${outras.length?', dividida com '+outras.join(', '):''} — esta unidade paga só a parte dela.</div>`
      : '';
    const temCodigo = b.pixCopiaCola || b.codigoBarras;
    const colCodigo = temCodigo
      ? `<button class="btn-mini" data-click="copiarCodigoBoleto(${b.indiceReal})">${b.pixCopiaCola?'Copiar Pix':'Copiar código'}</button>`
      : '<span class="tracinho">—</span>';
    return `<tr>
      <td>${dataBr(b.vencimento)}</td>
      <td>${b.descricao}${subConjunta}</td>
      <td>${b.foto?`<img class="miniatura-tab" src="${b.foto}" alt="Boleto" data-click="abrirLightbox('${b.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td>${colCodigo}</td>
      <td class="n num">${fmt(b.valor)}</td>
      <td class="n">${selo}</td>
      <td class="n">${b.status==='pendente'?`<button class="btn-marcar-pago" data-click="marcarBoletoPago(${b.indiceReal})">Marcar como pago</button>`:'—'}
        ${podeExcluir?`<button class="btn-mini" data-click="excluirBoleto(${b.indiceReal})">Excluir</button>`:''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="vazio">Nenhum boleto ou nota cadastrado para esta unidade.</td></tr>';
}

async function excluirBoleto(i){
  if(!temPermissaoFinanceira(usuario,'excluir_boletos')){
    avisar('Você não tem permissão pra excluir boletos. Fale com o diretor.');
    return;
  }
  const b=AppEstado.dados.boletos[i];
  if(!b) return;
  const avisoPago = b.status==='pago' ? ' Esse boleto já foi pago — a saída lançada no caixa continua lá, só o registro do boleto some.' : '';
  if(!await confirmarAcao(`Excluir o boleto "${b.descricao}" (${fmt(b.valor)})? Essa ação não pode ser desfeita.${avisoPago}`)) return;
  try{
    await api('/boletos/'+b.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Boleto', `${b.descricao} — ${fmt(b.valor)} — ${b.status==='pago'?'já estava pago':'pendente'}`, b.unidade);
  await recarregarBoletos();
  desenharBoletos();
}

async function copiarCodigoBoleto(i){
  const b=AppEstado.dados.boletos[i];
  const texto = b.pixCopiaCola || b.codigoBarras;
  if(!texto) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(()=>{
      avisar((b.pixCopiaCola?'Código Pix':'Código de barras')+' copiado!');
    }).catch(async ()=>{
      await pedirValor('Copie manualmente:', texto);
    });
  }else{
    await pedirValor('Copie manualmente:', texto);
  }
}

/* =========== IMPOSTOS E ENERGIA =========== */
function prevejaFotoImposto(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem (foto da guia ou da conta).');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendenteImposto = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-imposto-img').src = AppEstado.ui.fotoPendenteImposto.dataUrl;
    document.getElementById('previa-foto-imposto-nome').textContent = arq.name;
    document.getElementById('previa-foto-imposto').classList.remove('oculto');
    document.getElementById('previa-foto-imposto-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoImposto(){
  AppEstado.ui.fotoPendenteImposto = null;
  document.getElementById('fi-foto').value='';
  document.getElementById('previa-foto-imposto').classList.add('oculto');
  document.getElementById('previa-foto-imposto-vazia').classList.remove('oculto');
}

function nomeTipoConta(t){
  return {imposto:'Imposto', energia:'Energia elétrica', agua:'Água', internet:'Internet/sistema', outra:'Outra conta fixa'}[t] || t;
}
function competenciaBr(c){
  if(!c) return '—';
  const [a,m]=c.split('-');
  const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return meses[parseInt(m,10)-1]+'/'+a;
}

async function salvarImposto(){
  const tipo=document.getElementById('fi-tipo').value;
  const competencia=document.getElementById('fi-competencia').value;
  const descricao=document.getElementById('fi-descricao').value.trim();
  const valor=parseFloat(document.getElementById('fi-valor').value);
  const vencimento=document.getElementById('fi-vencimento').value;
  const msg=document.getElementById('msg-imposto');

  if(!descricao || !valor || valor<=0 || !vencimento){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição, valor e vencimento.';
    return;
  }

  try{
    const fotoUrl = AppEstado.ui.fotoPendenteImposto ? await enviarFoto(AppEstado.ui.fotoPendenteImposto.dataUrl) : null;
    await api('/contas-fixas', { method:'POST', body: JSON.stringify({
      unidade_id: unidadeAtual(), tipo, competencia: competencia||null, descricao, valor, vencimento,
      foto_url: fotoUrl
    }) });
    await recarregarContasFixas();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fi-descricao').value='';
  document.getElementById('fi-valor').value='';
  document.getElementById('fi-vencimento').value='';
  document.getElementById('fi-competencia').value='';
  removerFotoImposto();
  msg.style.color='var(--entrada)';
  msg.textContent='Conta salva. Marque como paga quando fizer o pagamento.';
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharImpostos();
}

async function marcarImpostoPago(i){
  const c=AppEstado.dados.contasFixas[i];
  if(!await confirmarAcao(`Marcar "${c.descricao}" (${fmt(c.valor)}) como paga hoje?`)) return;
  try{
    await api('/contas-fixas/'+c.id+'/marcar-pago', { method:'POST' });
  }catch(e){
    avisar(e.message);
    return;
  }
  await Promise.all([recarregarContasFixas(), recarregarLancamentos()]);
  desenhar();
}

function desenharImpostos(){
  const un=unidadeAtual();
  const podeExcluir = temPermissaoFinanceira(usuario,'excluir_boletos');
  document.getElementById('titulo-impostos').textContent='Contas de '+nomeUnidade(un);
  const lista=AppEstado.dados.contasFixas.filter(c=>c.unidade===un)
    .map(c=>({...c, indiceReal:AppEstado.dados.contasFixas.indexOf(c)}))
    .sort((a,b)=> a.status===b.status ? (a.vencimento<b.vencimento?-1:1) : (a.status==='pendente'?-1:1));

  document.getElementById('tab-impostos').innerHTML = lista.length ? lista.map(c=>{
    const atrasado = c.status==='pendente' && c.vencimento < hoje();
    const selo = c.status==='pago'
      ? '<span class="selo-status pago">Paga</span>'
      : atrasado ? '<span class="selo-status atrasado">Atrasada</span>' : '<span class="selo-status pendente">Pendente</span>';
    const legenda=`${nomeTipoConta(c.tipo)} · ${c.descricao} · ${fmt(c.valor)}`;
    return `<tr>
      <td>${competenciaBr(c.competencia)}</td>
      <td>${dataBr(c.vencimento)}</td>
      <td>${nomeTipoConta(c.tipo)}</td>
      <td>${c.descricao}</td>
      <td>${c.foto?`<img class="miniatura-tab" src="${c.foto}" alt="Conta" data-click="abrirLightbox('${c.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n num">${fmt(c.valor)}</td>
      <td class="n">${selo}</td>
      <td class="n">${c.status==='pendente'?`<button class="btn-marcar-pago" data-click="marcarImpostoPago(${c.indiceReal})">Marcar como paga</button>`:'—'}
        ${podeExcluir?`<button class="btn-mini" data-click="excluirContaFixa(${c.indiceReal})">Excluir</button>`:''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="vazio">Nenhuma conta cadastrada para esta unidade.</td></tr>';
}

async function excluirContaFixa(i){
  if(!temPermissaoFinanceira(usuario,'excluir_boletos')){
    avisar('Você não tem permissão pra excluir contas. Fale com o diretor.');
    return;
  }
  const c=AppEstado.dados.contasFixas[i];
  if(!c) return;
  const avisoPago = c.status==='pago' ? ' Essa conta já foi paga — a saída lançada no caixa continua lá, só o registro da conta some.' : '';
  if(!await confirmarAcao(`Excluir "${c.descricao}" (${fmt(c.valor)})? Essa ação não pode ser desfeita.${avisoPago}`)) return;
  try{
    await api('/contas-fixas/'+c.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Imposto/Conta fixa', `${nomeTipoConta(c.tipo)} — ${c.descricao} — ${fmt(c.valor)} — ${c.status==='pago'?'já estava paga':'pendente'}`, c.unidade);
  await recarregarContasFixas();
  desenharImpostos();
}

/* =========== NOTAS FISCAIS (rateio administrativo) =========== */
function montarUnidadesNotaFiscal(){
  document.getElementById('fnf-unidades-valores').innerHTML = UNIDADES.map(u=>`
    <div class="linha-unidade-valor">
      <label><input type="checkbox" class="chk-unidade-nf" value="${u.id}" checked data-change="dividirValorNotaFiscal()"> ${u.nome}</label>
      <input type="number" class="valor-unidade-nf" data-unidade="${u.id}" min="0" step="0.01" placeholder="0,00">
    </div>`).join('');
  dividirValorNotaFiscal();
}
function dividirValorNotaFiscal(){
  const total=parseFloat(document.getElementById('fnf-valor-total').value)||0;
  const marcadas=[...document.querySelectorAll('.chk-unidade-nf:checked')];
  const valorCada = marcadas.length ? Math.round((total/marcadas.length)*100)/100 : 0;
  document.querySelectorAll('.valor-unidade-nf').forEach(inp=>{
    const chk=document.querySelector(`.chk-unidade-nf[value="${inp.dataset.unidade}"]`);
    inp.disabled = !chk.checked;
    if(chk.checked) inp.value=valorCada.toFixed(2);
  });
}

function prevejaFotoNotaFiscal(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){ avisar('Escolha um arquivo de imagem.'); input.value=''; return; }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendenteNotaFiscal = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-nf-img').src = AppEstado.ui.fotoPendenteNotaFiscal.dataUrl;
    document.getElementById('previa-foto-nf-nome').textContent = arq.name;
    document.getElementById('previa-foto-nf').classList.remove('oculto');
    document.getElementById('previa-foto-nf-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoNotaFiscal(){
  AppEstado.ui.fotoPendenteNotaFiscal = null;
  document.getElementById('fnf-foto').value='';
  document.getElementById('previa-foto-nf').classList.add('oculto');
  document.getElementById('previa-foto-nf-vazia').classList.remove('oculto');
}

async function salvarNotaFiscal(){
  const descricao=document.getElementById('fnf-descricao').value.trim();
  const valorTotal=parseFloat(document.getElementById('fnf-valor-total').value);
  const data=document.getElementById('fnf-data').value || hoje();
  const marcadas=[...document.querySelectorAll('.chk-unidade-nf:checked')].map(c=>c.value);
  const msg=document.getElementById('msg-nota-fiscal');

  if(!descricao || !valorTotal || valorTotal<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição e valor total.';
    return;
  }
  if(!marcadas.length){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma unidade pro rateio.';
    return;
  }

  const foto = AppEstado.ui.fotoPendenteNotaFiscal ? await enviarFoto(AppEstado.ui.fotoPendenteNotaFiscal.dataUrl) : null;
  const unidadesPayload = marcadas.map(uid=>({
    unidade_id: uid,
    valor: parseFloat(document.querySelector(`.valor-unidade-nf[data-unidade="${uid}"]`).value)||0
  }));

  try{
    await api('/notas-fiscais', { method:'POST', body: JSON.stringify({
      descricao, valor_total: valorTotal, data, foto_url: foto, unidades: unidadesPayload
    }) });
    await Promise.all([recarregarNotasFiscais(), recarregarLancamentos()]);
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fnf-descricao').value='';
  document.getElementById('fnf-valor-total').value='';
  document.getElementById('fnf-data').value='';
  removerFotoNotaFiscal();
  montarUnidadesNotaFiscal();
  msg.style.color='var(--entrada)';
  msg.textContent=`Nota lançada e dividida entre ${marcadas.length} unidade(s).`;
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharNotasFiscais();
  desenhar();
}

async function excluirNotaFiscal(id){
  if(!await confirmarAcao('Excluir essa nota fiscal? Isso remove os lançamentos gerados em todas as unidades.')) return;
  const n=AppEstado.dados.notasFiscais.find(x=>x.id===id);
  if(!n) return;
  try{
    await api('/notas-fiscais/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Nota fiscal', `${n.descricao} — ${fmt(n.valorTotal)} (rateada entre ${n.unidades.length} unidade(s))`, null);
  await Promise.all([recarregarNotasFiscais(), recarregarLancamentos()]);
  desenharNotasFiscais();
  desenhar();
}

function desenharNotasFiscais(){
  const lista=AppEstado.dados.notasFiscais.slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-notas-fiscais').innerHTML = lista.length ? lista.map(n=>{
    const legenda=`${n.descricao} · ${fmt(n.valorTotal)}`;
    const unidadesTxt=n.unidades.map(u=>`${nomeUnidade(u.unidade)} (${fmt(u.valor)})`).join(', ');
    return `<tr>
      <td>${dataBr(n.data)}</td>
      <td>${n.descricao}</td>
      <td class="n num">${fmt(n.valorTotal)}</td>
      <td>${unidadesTxt}</td>
      <td>${n.foto?`<img class="miniatura-tab" src="${n.foto}" alt="Nota" data-click="abrirLightbox('${n.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n"><button class="btn-mini" data-click="excluirNotaFiscal('${n.id}')">Excluir</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhuma nota fiscal lançada ainda.</td></tr>';
}


function baixarPdfConsumoPlantao(){
  const un=unidadeAtual();
  const desde=diaMenos(29);
  const lista=AppEstado.dados.consumosPlantao.filter(c=>c.unidade===un && c.registradoEm>=desde)
    .slice().sort((a,b)=> a.data<b.data?1:a.data>b.data?-1:0);

  const contagemProduto={};
  lista.forEach(c=> c.itens.forEach(it=>{
    contagemProduto[it.produto]=(contagemProduto[it.produto]||0)+it.quantidade;
  }));
  const ranking=Object.entries(contagemProduto).sort((a,b)=>b[1]-a[1]);
  const totalItens=lista.reduce((s,c)=>s+c.itens.reduce((s2,it)=>s2+it.quantidade,0),0);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Consumo do plantão — ${nomeUnidade(un)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#000;background:#fff;max-width:720px;margin:0 auto;padding:28px 20px;font-size:14px}
  h1{font-size:19px;margin:0 0 2px;color:#000}
  .sub{color:#000;font-size:12.5px;margin:0 0 20px}
  .destaque{background:#fff;color:#000;border:1.5px solid #000;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;gap:26px;flex-wrap:wrap}
  .destaque div span{display:block;font-size:11.5px;color:#000}
  .destaque div b{font-size:20px;color:#000}
  h2{font-size:14.5px;margin:22px 0 10px;border-bottom:2px solid #000;padding-bottom:5px;color:#000}
  table{width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:6px}
  th{text-align:left;color:#000;font-weight:600;font-size:11.5px;padding:0 8px 7px;border-bottom:1.5px solid #000}
  td{padding:9px 8px;border-bottom:1px solid #ccc;vertical-align:top;color:#000}
  tr:last-child td{border-bottom:0}
  .selo{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid #000;color:#000}
  .selo.dia{background:#fff}
  .selo.noite{background:#fff}
  .rodape{color:#000;font-size:11px;margin-top:26px;border-top:1px solid #000;padding-top:10px}
  @media print{ body{padding:0} }
</style></head>
<body>
  <h1>Consumo do plantão — ${nomeUnidade(un)}</h1>
  <p class="sub">Últimos 30 dias · gerado em ${dataBr(hoje())} por ${usuario.nome}</p>

  <div class="destaque">
    <div><span>Registros</span><b>${lista.length}</b></div>
    <div><span>Itens consumidos</span><b>${totalItens}</b></div>
    <div><span>Produtos distintos</span><b>${ranking.length}</b></div>
  </div>

  <h2>Produtos mais consumidos</h2>
  <table>
    <thead><tr><th>Produto</th><th class="u-texto-direita">Quantidade</th></tr></thead>
    <tbody>${ranking.length ? ranking.map(([nome,qtd])=>`<tr><td>${nome}</td><td class="u-texto-direita">${qtd}</td></tr>`).join('') : '<tr><td colspan="2">Sem dados.</td></tr>'}</tbody>
  </table>

  <h2>Registros do período</h2>
  <table>
    <thead><tr><th>Data</th><th>Turno</th><th>Itens</th><th>Registrado por</th></tr></thead>
    <tbody>${lista.length ? lista.map(c=>`
      <tr>
        <td>${dataBr(c.data)}</td>
        <td><span class="selo ${c.turno}">${c.turno==='dia'?'Dia':'Noite'}</span></td>
        <td>${c.itens.map(it=>`${it.quantidade}x ${it.produto}`).join(', ')}</td>
        <td>${c.criadoPor}</td>
      </tr>`).join('') : '<tr><td colspan="4">Nenhum registro no período.</td></tr>'}</tbody>
  </table>

  <p class="rodape">Gerado automaticamente pelo sistema de gestão A2 Pousada. Pra salvar como PDF, use Imprimir → Salvar como PDF.</p>
</body></html>`;

  const blob=new Blob([html], {type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`consumo-plantao-${un}-${hoje()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========== AppEstado.dados.boletos ADMINISTRATIVO (central, o diretor lança pras unidades) =========== */
function prevejaFotoBoletoAdmin(input){
  const arq = input.files && input.files[0];
  if(!arq) return;
  if(!arq.type.startsWith('image/')){
    avisar('Escolha um arquivo de imagem.');
    input.value='';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = e => {
    AppEstado.ui.fotoPendenteBoletoAdmin = {dataUrl:e.target.result, nome:arq.name};
    document.getElementById('previa-foto-boleto-admin-img').src = AppEstado.ui.fotoPendenteBoletoAdmin.dataUrl;
    document.getElementById('previa-foto-boleto-admin-nome').textContent = arq.name;
    document.getElementById('previa-foto-boleto-admin').classList.remove('oculto');
    document.getElementById('previa-foto-boleto-admin-vazia').classList.add('oculto');
  };
  leitor.readAsDataURL(arq);
}
function removerFotoBoletoAdmin(){
  AppEstado.ui.fotoPendenteBoletoAdmin = null;
  document.getElementById('fba-foto').value='';
  document.getElementById('previa-foto-boleto-admin').classList.add('oculto');
  document.getElementById('previa-foto-boleto-admin-vazia').classList.remove('oculto');
}

async function salvarBoletoAdmin(){
  const descricao=document.getElementById('fba-descricao').value.trim();
  const valor=parseFloat(document.getElementById('fba-valor').value);
  const vencimento=document.getElementById('fba-vencimento').value;
  const codigoBarras=document.getElementById('fba-codigo-barras').value.trim();
  const pixCopiaCola=document.getElementById('fba-pix-copia-cola').value.trim();
  const msg=document.getElementById('msg-boleto-admin');

  if(!descricao || !valor || valor<=0 || !vencimento){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição, valor e vencimento.';
    return;
  }

  try{
    const fotoUrl = AppEstado.ui.fotoPendenteBoletoAdmin ? await enviarFoto(AppEstado.ui.fotoPendenteBoletoAdmin.dataUrl) : null;
    await api('/boletos-admin', { method:'POST', body: JSON.stringify({
      descricao, valor, vencimento,
      foto_url: fotoUrl,
      codigo_barras: codigoBarras||null, pix_copia_cola: pixCopiaCola||null
    }) });
    await recarregarBoletosAdmin();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fba-descricao').value='';
  document.getElementById('fba-valor').value='';
  document.getElementById('fba-vencimento').value='';
  document.getElementById('fba-codigo-barras').value='';
  document.getElementById('fba-pix-copia-cola').value='';
  removerFotoBoletoAdmin();
  msg.style.color='var(--entrada)';
  msg.textContent='Boleto central salvo. Agora é só lançar pras unidades quando quiser.';
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenharBoletosAdmin();
}

async function excluirBoletoAdmin(id){
  if(!await confirmarAcao('Excluir esse boleto central?')) return;
  const b=AppEstado.dados.boletosAdmin.find(x=>x.id===id);
  if(!b) return;
  try{
    await api('/boletos-admin/'+id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Boleto Administrativo', `${b.descricao} — ${fmt(b.valor)}`, null);
  await recarregarBoletosAdmin();
  desenharBoletosAdmin();
}

function iniciarLancamentoBoletoAdmin(id){
  const b=AppEstado.dados.boletosAdmin.find(x=>x.id===id);
  if(!b) return;
  AppEstado.ui.boletoAdminEmLancamento=id;
  document.getElementById('nome-boleto-lancando').textContent=b.descricao;
  const todas=UNIDADES.map(u=>u.id);
  document.getElementById('unidades-lancar-boleto-admin').innerHTML = todas.map(uid=>`
    <div class="linha-unidade-valor">
      <label><input type="checkbox" class="chk-unidade-boleto-admin" value="${uid}" ${b.unidadesLancadas.includes(uid)?'disabled':'checked'} data-change="dividirValorBoletoAdmin()"> ${nomeUnidade(uid)}${b.unidadesLancadas.includes(uid)?' (já lançado)':''}</label>
      <input type="number" class="valor-unidade-boleto-admin" data-id="${uid}" min="0" step="0.01" ${b.unidadesLancadas.includes(uid)?'disabled':''}>
    </div>`).join('');
  dividirValorBoletoAdmin();
  document.getElementById('painel-lancar-boleto-admin').classList.remove('oculto');
  document.getElementById('painel-lancar-boleto-admin').scrollIntoView({behavior:'smooth',block:'start'});
}

function dividirValorBoletoAdmin(){
  const b=AppEstado.dados.boletosAdmin.find(x=>x.id===AppEstado.ui.boletoAdminEmLancamento);
  if(!b) return;
  const marcadas=[...document.querySelectorAll('.chk-unidade-boleto-admin:checked')];
  const valorCada = marcadas.length ? Math.round((b.valor/marcadas.length)*100)/100 : 0;
  document.querySelectorAll('.valor-unidade-boleto-admin').forEach(inp=>{
    const chk=document.querySelector(`.chk-unidade-boleto-admin[value="${inp.dataset.id}"]`);
    if(chk.checked) inp.value=valorCada.toFixed(2);
  });
}

function cancelarLancamentoBoletoAdmin(){
  AppEstado.ui.boletoAdminEmLancamento=null;
  document.getElementById('painel-lancar-boleto-admin').classList.add('oculto');
}

async function confirmarLancamentoBoletoAdmin(){
  const b=AppEstado.dados.boletosAdmin.find(x=>x.id===AppEstado.ui.boletoAdminEmLancamento);
  const msg=document.getElementById('msg-lancar-boleto-admin');
  if(!b) return;
  const marcadas=[...document.querySelectorAll('.chk-unidade-boleto-admin:checked')].map(c=>c.value);
  if(!marcadas.length){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma unidade.';
    return;
  }
  const unidadesPayload = marcadas.map(uid=>({
    unidade_id: uid,
    valor: parseFloat(document.querySelector(`.valor-unidade-boleto-admin[data-id="${uid}"]`).value)||0
  }));
  try{
    await api('/boletos-admin/'+b.id+'/lancar', { method:'POST', body: JSON.stringify({ unidades: unidadesPayload }) });
    await Promise.all([recarregarBoletosAdmin(), recarregarBoletos()]);
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }
  cancelarLancamentoBoletoAdmin();
  desenharBoletosAdmin();
  desenharBoletos();
}

function desenharBoletosAdmin(){
  const lista=AppEstado.dados.boletosAdmin.slice().sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
  document.getElementById('tab-boletos-admin').innerHTML = lista.length ? lista.map(b=>{
    const legenda=`${b.descricao} · ${fmt(b.valor)}`;
    const rotuloStatus = {
      nao_lancado:'<span class="selo-status pendente">Não lançado</span>',
      lancado_parcial:'<span class="selo-status pendente">Lançado em parte</span>',
      lancado_completo:'<span class="selo-status pago">Lançado em todas</span>'
    }[b.status];
    return `<tr>
      <td>${dataBr(b.vencimento)}</td>
      <td>${b.descricao}${b.unidadesLancadas.length?`<div class="sub-boleto">Já lançado em: ${b.unidadesLancadas.map(nomeUnidade).join(', ')}</div>`:''}</td>
      <td class="n num">${fmt(b.valor)}</td>
      <td>${b.foto?`<img class="miniatura-tab" src="${b.foto}" alt="Boleto" data-click="abrirLightbox('${b.foto}','${legenda.replace(/'/g,"\\'")}')">`:'<span class="tracinho">—</span>'}</td>
      <td>${rotuloStatus}</td>
      <td class="n">
        ${b.status!=='lancado_completo'?`<button class="btn-marcar-pago" data-click="iniciarLancamentoBoletoAdmin('${b.id}')">Lançar</button>`:''}
        <button class="btn-mini" data-click="excluirBoletoAdmin('${b.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum boleto central cadastrado ainda.</td></tr>';
}
