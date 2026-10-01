/* Módulo Caixa
 * Lançamentos, extrato, comprovantes e fechamento de compras parceladas.
 * Carregado antes do núcleo legado para manter compatibilidade durante a migração gradual.
 */

/* =========== LANÇAMENTOS / EXTRATO / COMPROVANTES =========== */
function atualizarDicaCategoria(){
  const cat=document.getElementById('f-categoria').value;
  const ehQuebra = AppEstado.ui.tipoAtual==='saida' && cat==='quebra';
  const ehRetirada = AppEstado.ui.tipoAtual==='saida' && cat==='retirada';
  const ehEspecial = ehQuebra || ehRetirada;

  document.getElementById('lbl-obs').textContent = ehEspecial
    ? (ehQuebra ? 'Descrição (obrigatório para falta de caixa)' : 'Descrição (obrigatório — quem autorizou/recebeu)')
    : 'Descrição (opcional)';
  document.getElementById('f-obs').placeholder = ehQuebra
    ? 'ex.: contei o caixa no fim do turno e faltaram R$ 30, troco errado com hóspede do quarto 4'
    : ehRetirada
      ? 'ex.: retirada autorizada pelo diretor Fulano, referente a...'
      : 'ex.: diária suíte 12, compra de sabonete, adiantamento';
  const dica=document.getElementById('dica-obs');
  dica.classList.toggle('oculto', !ehEspecial);
  dica.textContent = ehQuebra
    ? 'Explique o que houve — isso ajuda o gerente e o diretor a entenderem a falta.'
    : ehRetirada ? 'Deixe registrado quem autorizou e recebeu a retirada, pra ter rastro depois.' : '';

  const lblFoto=document.getElementById('lbl-foto');
  if(lblFoto){
    const obrigaFoto = AppEstado.ui.tipoAtual==='saida' && !ehEspecial;
    lblFoto.textContent = obrigaFoto
      ? 'Foto da nota fiscal (obrigatório — só gerente e diretor anexam)'
      : 'Foto da nota fiscal ou comprovante (só gerente e diretor anexam)';
  }

  const blocoForma=document.getElementById('bloco-forma-pagamento-saida');
  const selForma=document.getElementById('f-forma-pagamento-saida');
  if(blocoForma && selForma){
    blocoForma.classList.toggle('oculto', AppEstado.ui.tipoAtual!=='saida');
    if(ehEspecial){
      selForma.value='dinheiro';
      selForma.disabled=true;
    }else{
      selForma.disabled=false;
    }
  }
}

function mudarTipo(t){
  AppEstado.ui.tipoAtual=t;
  document.getElementById('bt-entrada').className = t==='entrada' ? 'on-e' : '';
  document.getElementById('bt-saida').className   = t==='saida'   ? 'on-s' : '';
  document.getElementById('lbl-categoria').textContent =
    t==='entrada' ? 'Forma de pagamento' : 'Categoria da despesa';
  const lista = t==='entrada' ? ENTRADAS : SAIDAS;
  document.getElementById('f-categoria').innerHTML =
    lista.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  removerFoto();
  atualizarDicaCategoria();
  atualizarVisibilidadeModoDespesa();
}

/* =========== MODO DE DESPESA DENTRO DE LANÇAR MOVIMENTO (parcelada / rateada) =========== */
function atualizarVisibilidadeModoDespesa(){
  const bloco=document.getElementById('bloco-modo-despesa');
  if(!bloco || !usuario) return;
  const mostra = AppEstado.ui.tipoAtual==='saida' && usuario.papel!=='funcionario';
  bloco.classList.toggle('oculto', !mostra);
  if(!mostra){
    document.getElementById('f-modo-despesa').value='normal';
    mudarModoDespesa();
  }

  // foto de nota fiscal/comprovante: só gerente e diretor podem anexar
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  const blocoFoto=document.getElementById('bloco-foto-lancar');
  if(blocoFoto){
    blocoFoto.classList.toggle('oculto', !podeAnexarFoto);
    if(!podeAnexarFoto) removerFoto();
  }
}

function mudarModoDespesa(){
  const modo=document.getElementById('f-modo-despesa').value;
  document.getElementById('bloco-parcelada-lancar').classList.toggle('oculto', modo!=='parcelada');
  document.getElementById('bloco-rateio-lancar').classList.toggle('oculto', modo!=='rateada');
  const blocoCategoria=document.getElementById('f-categoria').closest('div');
  if(blocoCategoria) blocoCategoria.classList.toggle('oculto', modo==='parcelada');
  document.getElementById('lbl-valor').textContent = modo==='rateada' ? 'Valor de '+nomeUnidade(unidadeAtual())+' (R$)' : 'Valor (R$)';
  const txtUn=document.getElementById('txt-unidade-rateio');
  if(txtUn) txtUn.textContent = nomeUnidade(unidadeAtual());
  if(modo==='parcelada'){ ajustarParcelaAtualLancar(); }
}

function ajustarParcelaAtualLancar(){
  const total=Math.max(1, parseInt(document.getElementById('f-parc-parcelas').value,10)||1);
  const sel=document.getElementById('f-parc-atual');
  const anterior=sel.value;
  sel.innerHTML='';
  for(let n=1;n<=total;n++){
    sel.innerHTML += `<option value="${n}">${n} de ${total}</option>`;
  }
  if(anterior && anterior<=total) sel.value=anterior;
  recalcularValorParcelaLancar();
}
function recalcularValorParcelaLancar(){
  const totalCompra=parseFloat(document.getElementById('f-parc-valor-total').value)||0;
  const parcelas=Math.max(1, parseInt(document.getElementById('f-parc-parcelas').value,10)||1);
  document.getElementById('f-valor').value = totalCompra>0 ? (totalCompra/parcelas).toFixed(2) : '';
}

async function salvarLancamento(){
  const msg=document.getElementById('msg-lanc');
  const dataEscolhida=dataAtual();
  const registradoEm=hoje();
  const dataAlterada = dataEscolhida !== registradoEm;
  const turno=document.getElementById('f-turno').value;
  const obs=document.getElementById('f-obs').value.trim();
  const foto = AppEstado.ui.fotoPendente ? await enviarFoto(AppEstado.ui.fotoPendente.dataUrl) : null;
  const modo = (AppEstado.ui.tipoAtual==='saida' && usuario.papel!=='funcionario')
    ? document.getElementById('f-modo-despesa').value : 'normal';
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  const formaPagamentoSaida = AppEstado.ui.tipoAtual==='saida'
    ? (document.getElementById('f-forma-pagamento-saida').value || 'dinheiro') : undefined;

  /* ---- modo parcelada: uma única saída, categoria fixa 'parcelado' ---- */
  if(modo==='parcelada'){
    const valorTotalCompra=parseFloat(document.getElementById('f-parc-valor-total').value);
    const totalParcelas=Math.max(1, parseInt(document.getElementById('f-parc-parcelas').value,10)||1);
    const parcelaAtual=parseInt(document.getElementById('f-parc-atual').value,10)||1;
    const valorParcela=parseFloat(document.getElementById('f-valor').value);
    if(!obs){
      msg.style.color='var(--saida)';
      msg.textContent='Descreva a compra (ex.: "roupa de cama") — ajuda a identificar as parcelas depois.';
      return;
    }
    if(!valorTotalCompra || valorTotalCompra<=0 || !valorParcela || valorParcela<=0){
      msg.style.color='var(--saida)';
      msg.textContent='Preencha o valor total da compra e confira o valor da parcela.';
      return;
    }
    if(podeAnexarFoto && !foto){
      msg.style.color='var(--saida)';
      msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
      return;
    }
    try{
      await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
        unidade:unidadeAtual(), data:dataEscolhida, turno, tipo:'saida', categoria:'parcelado',
        valor:valorParcela, obs:`${obs} — parcela ${parcelaAtual}/${totalParcelas} de ${fmt(valorTotalCompra)}`,
        foto, formaPagamentoSaida
      })) });
      await recarregarLancamentos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent=`Parcela ${parcelaAtual}/${totalParcelas} de "${obs}" salva em `+nomeUnidade(unidadeAtual())+'.';
    limparCamposLancamento();
    setTimeout(()=>{ msg.textContent=''; },6000);
    desenhar();
    return;
  }

  /* ---- modo rateada: uma única saída, só nesta unidade — o valor total é só referência ---- */
  if(modo==='rateada'){
    const categoria=document.getElementById('f-categoria').value;
    const valorUnidade=parseFloat(document.getElementById('f-valor').value);
    const valorTotalNota=parseFloat(document.getElementById('f-rateio-valor-total').value);
    if(!valorUnidade || valorUnidade<=0){
      msg.style.color='var(--saida)';
      msg.textContent='Informe o valor da parte de '+nomeUnidade(unidadeAtual())+'.';
      return;
    }
    if(!valorTotalNota || valorTotalNota<=0){
      msg.style.color='var(--saida)';
      msg.textContent='Informe o valor total da nota (só pra referência).';
      return;
    }
    if(podeAnexarFoto && categoria!=='quebra' && categoria!=='retirada' && !foto){
      msg.style.color='var(--saida)';
      msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
      return;
    }
    try{
      await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
        unidade:unidadeAtual(), data:dataEscolhida, turno, tipo:'saida', categoria,
        valor:valorUnidade, obs, foto, formaPagamentoSaida,
        rateio:{valorTotal:valorTotalNota}
      })) });
      await recarregarLancamentos();
    }catch(e){
      msg.style.color='var(--saida)';
      msg.textContent=e.message;
      return;
    }
    msg.style.color='var(--entrada)';
    msg.textContent=`Salvo: ${fmt(valorUnidade)} de `+nomeUnidade(unidadeAtual())+` (nota total de ${fmt(valorTotalNota)}). As outras unidades não são afetadas.`;
    limparCamposLancamento();
    setTimeout(()=>{ msg.textContent=''; },6500);
    desenhar();
    return;
  }

  /* ---- modo normal ---- */
  const valor=parseFloat(document.getElementById('f-valor').value);
  if(!valor || valor<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Informe um valor maior que zero.';
    return;
  }
  const categoria=document.getElementById('f-categoria').value;
  if(AppEstado.ui.tipoAtual==='saida' && categoria==='quebra' && !obs){
    msg.style.color='var(--saida)';
    msg.textContent='Descreva o que aconteceu — obrigatório para lançar falta de caixa.';
    return;
  }
  if(AppEstado.ui.tipoAtual==='saida' && categoria==='retirada' && !obs){
    msg.style.color='var(--saida)';
    msg.textContent='Descreva quem autorizou e recebeu a retirada — obrigatório.';
    return;
  }
  if(AppEstado.ui.tipoAtual==='saida' && categoria!=='quebra' && categoria!=='retirada' && podeAnexarFoto && !foto){
    msg.style.color='var(--saida)';
    msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
    return;
  }
  try{
    await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
      unidade:unidadeAtual(), data:dataEscolhida, turno,
      tipo:AppEstado.ui.tipoAtual, categoria,
      valor, obs, foto, formaPagamentoSaida
    })) });
    await recarregarLancamentos();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }
  msg.style.color='var(--entrada)';
  msg.textContent='Lançamento salvo em '+nomeUnidade(unidadeAtual())+', dia '+dataBr(dataEscolhida)
    +(dataAlterada ? ' — data alterada (registrado hoje, '+dataBr(registradoEm)+'), isso fica marcado no extrato.' : '.');
  limparCamposLancamento();
  setTimeout(()=>{ msg.textContent=''; },6000);
  desenhar();
}

function limparCamposLancamento(){
  document.getElementById('f-valor').value='';
  document.getElementById('f-obs').value='';
  document.getElementById('f-parc-valor-total').value='';
  document.getElementById('f-parc-parcelas').value='1';
  document.getElementById('f-rateio-valor-total').value='';
  if(document.getElementById('f-forma-pagamento-saida')) document.getElementById('f-forma-pagamento-saida').value='dinheiro';
  if(document.getElementById('f-modo-despesa')){
    document.getElementById('f-modo-despesa').value='normal';
    mudarModoDespesa();
  }
  removerFoto();
}

function desenharLancar(){
  if(document.getElementById('f-modo-despesa')) mudarModoDespesa();
  document.getElementById('sub-lancar').textContent =
    `${nomeUnidade(unidadeAtual())} · ${dataBr(dataAtual())} — troque a unidade ou a data na barra acima.`;

  const meus=AppEstado.dados.lancamentos.filter(l=>l.por===usuario.nome).slice(-10).reverse();
  document.getElementById('tab-meus').innerHTML = meus.length ? meus.map(l=>`
    <tr>
      <td>${dataBr(l.data)}</td>
      <td><span class="selo ${l.turno}">${l.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${nomeCategoria(l.categoria)}</td>
      <td>${esc(l.obs||'—')}</td>
      <td class="n num ${l.tipo==='entrada'?'verde':'vermelho'}">${l.tipo==='saida'?'−':''}${fmt(l.valor)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Você ainda não lançou nada. Use o formulário acima.</td></tr>';

  const painelRateio=document.getElementById('painel-notas-rateadas');
  const podeVerRateio = usuario.papel==='admin' || usuario.papel==='gerente';
  painelRateio.classList.toggle('oculto', !podeVerRateio);
  if(podeVerRateio){
    const un=unidadeAtual();
    const rateadas=AppEstado.dados.lancamentos.filter(l=>l.unidade===un && l.rateio)
      .slice().sort((a,b)=> a.data<b.data?1:-1);
    document.getElementById('sub-notas-rateadas').textContent =
      `${nomeUnidade(un)} · ${rateadas.length} nota(s) rateada(s) registrada(s) — mostrando só a parte desta unidade.`;
    document.getElementById('tab-notas-rateadas').innerHTML = rateadas.length ? rateadas.map(l=>`
      <tr>
        <td>${dataBr(l.data)}</td>
        <td>${nomeCategoria(l.categoria)}</td>
        <td>${esc(l.obs||'—')}</td>
        <td class="n num">${fmt(l.rateio.valorTotal)}</td>
        <td class="n num vermelho">${fmt(l.valor)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="vazio">Nenhuma nota rateada registrada para esta unidade ainda.</td></tr>';
  }
}

function desenharExtrato(){
  const un=unidadeAtual(), d=dataAtual();
  const movs=filtrar({unidade:un,datas:[d]});
  const qtdAlteradas=movs.filter(l=>l.dataAlterada).length;
  document.getElementById('sub-extrato').textContent =
    `${nomeUnidade(un)} · ${dataBr(d)} — ${movs.length} lançamento(s) nos dois turnos.`
    + (qtdAlteradas ? ` ${qtdAlteradas} com data alterada.` : '');

  const entradasDia=movs.filter(l=>l.tipo==='entrada'), saidasDia=movs.filter(l=>l.tipo==='saida');
  const totE=somar(entradasDia), totS=somar(saidasDia);
  const gEl=document.getElementById('ex-saldo-dia');
  gEl.textContent=fmt(totE-totS);
  gEl.className='valorao num '+(totE-totS>=0?'positivo':'negativo');
  document.getElementById('ex-total-entradas').textContent=fmt(totE);
  document.getElementById('ex-total-saidas').textContent=fmt(totS);
  document.getElementById('ex-qtd-lancamentos').textContent=movs.length;
  document.getElementById('ex-dinheiro-caixa').textContent=
    fmt(somar(entradasDia.filter(l=>l.categoria==='dinheiro')) - somarSaidasEmDinheiro(saidasDia));

  document.getElementById('tab-ex-turno').innerHTML = ['dia','noite'].map(t=>{
    const doTurno=movs.filter(l=>l.turno===t);
    const e=somar(doTurno.filter(l=>l.tipo==='entrada')), s=somar(doTurno.filter(l=>l.tipo==='saida'));
    return `<tr>
      <td><span class="selo ${t}">${t==='dia'?'Dia':'Noite'}</span></td>
      <td class="n verde num">${fmt(e)}</td>
      <td class="n vermelho num">${fmt(s)}</td>
      <td class="n neutro-forte num">${fmt(e-s)}</td>
    </tr>`;
  }).join('');

  const porFormaPagamento = ENTRADAS.map(c=>({nome:c.nome, valor:somar(entradasDia.filter(l=>l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  document.getElementById('ex-graf-entradas').innerHTML = porFormaPagamento.length
    ? barras(porFormaPagamento, totE, 'e')
    : '<div class="vazio">Nenhuma entrada registrada neste dia.</div>';

  const podeApagar = temPermissaoFinanceira(usuario,'excluir_lancamentos');
  const podeEditarValor = temPermissaoFinanceira(usuario,'editar_valores');
  const ordem={dia:0,noite:1};
  const linhas=movs.slice().sort((a,b)=>ordem[a.turno]-ordem[b.turno]).map(l=>{
    const i=AppEstado.dados.lancamentos.indexOf(l);
    const legenda=`${nomeCategoria(l.categoria)} · ${dataBr(l.data)} · ${fmt(l.valor)}`;
    const avisoData = l.dataAlterada
      ? `<span class="aviso-editado" title="Registrado em ${dataBr(l.registradoEm)}, lançado para o dia ${dataBr(l.data)}">data alterada</span>`
      : '';
    const subRateio = l.rateio
      ? `<div class="sub-boleto">Parte de uma nota rateada de ${fmt(l.rateio.valorTotal)} — só o valor desta unidade entrou no caixa.</div>`
      : '';
    return `<tr>
      <td><span class="selo ${l.turno}">${l.turno==='dia'?'Dia':'Noite'}</span></td>
      <td>${nomeCategoria(l.categoria)}</td>
      <td>${esc(l.obs||'—')}${subRateio}</td>
      <td>${esc(l.por==='sistema'?'—':l.por)}${avisoData}</td>
      <td>${l.foto?`<img class="miniatura-tab" src="${esc(l.foto)}" alt="Comprovante" data-click="abrirLightbox('${escArg(l.foto)}','${escArg(legenda)}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n num ${l.tipo==='entrada'?'verde':'vermelho'}">${l.tipo==='saida'?'−':''}${fmt(l.valor)}</td>
      <td class="n">
        ${podeEditarValor?`<button class="btn-mini" data-click="editarValorLancamento(${i})">Editar</button>`:''}
        ${podeApagar?`<button class="btn-mini" data-click="apagar(${i})">Excluir</button>`:''}
        ${!podeEditarValor && !podeApagar ? '—' : ''}
      </td>
    </tr>`;
  }).join('');
  document.getElementById('tab-extrato').innerHTML =
    linhas || '<tr><td colspan="7" class="vazio">Nenhum lançamento neste dia.</td></tr>';
}

function cartaoComprovanteHTML(foto, legenda, valorTxt, meta, classeValor, onApagar){
  const podeApagar = temPermissaoFinanceira(usuario,'apagar_comprovantes') && onApagar;
  return `<div class="cartao-comprovante">
    <img src="${esc(foto)}" alt="Comprovante" data-click="abrirLightbox('${escArg(foto)}','${escArg(legenda)}')">
    <div class="info">
      <div class="val num ${classeValor}">${esc(valorTxt)}</div>
      <div class="meta">${esc(meta)}</div>
      ${podeApagar?`<button class="btn-mini" data-click="event.stopPropagation(); ${onApagar}">Apagar foto</button>`:''}
    </div>
  </div>`;
}

async function apagarFotoComprovante(origem, indice){
  if(!temPermissaoFinanceira(usuario,'apagar_comprovantes')){
    avisar('Você não tem permissão pra apagar comprovantes. Fale com o diretor.');
    return;
  }
  if(!await confirmarAcao('Apagar essa foto? Essa ação não pode ser desfeita.')) return;
  const origens={lancamentos:AppEstado.dados.lancamentos, boletos:AppEstado.dados.boletos, 'boletos-admin':AppEstado.dados.boletosAdmin, impostos:AppEstado.dados.contasFixas};
  const arr=origens[origem];
  if(arr && arr[indice]){
    const nomesOrigem={lancamentos:'Lançamento', boletos:'Boletos e Pix', 'boletos-admin':'Boletos Administrativo', impostos:'Impostos e Energia'};
    if(origem==='lancamentos'){
      try{
        await api('/lancamentos/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].obs||nomeCategoria(arr[indice].categoria)||''}`, arr[indice].unidade);
      await recarregarLancamentos();
    }else if(origem==='boletos'){
      try{
        await api('/boletos/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao}`, arr[indice].unidade);
      await recarregarBoletos();
    }else if(origem==='boletos-admin'){
      try{
        await api('/boletos-admin/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao}`, null);
      await recarregarBoletosAdmin();
    }else if(origem==='impostos'){
      try{
        await api('/contas-fixas/'+arr[indice].id+'/foto', { method:'DELETE' });
      }catch(e){
        avisar(e.message);
        return;
      }
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao}`, arr[indice].unidade);
      await recarregarContasFixas();
    }else{
      registrarExclusao('Comprovante', `Foto apagada — ${nomesOrigem[origem]}: ${arr[indice].descricao||arr[indice].obs||nomeCategoria(arr[indice].categoria)||''}`, arr[indice].unidade);
      arr[indice].foto=null;
    }
  }
  desenharComprovantes();
}

function desenharComprovantes(){
  const un=unidadeAtual(), datas=listaDatas();
  const setores=setoresComprovantesDoUsuario(usuario);
  const temSetor = s => setores.includes(s);
  const escopo=escopoComprovantesDoUsuario(usuario);
  const soHoje = escopo==='dia';
  const bateHoje = data => data===dataAtual();

  document.getElementById('sub-comprovantes').textContent = soHoje
    ? `${nomeUnidade(un)} · fotos de ${dataBr(dataAtual())}, separadas por setor.`
    : `${nomeUnidade(un)} · fotos anexadas nos últimos ${diasPeriodo()} dia(s), separadas por setor.`;

  // Lançamentos do dia a dia
  document.getElementById('setor-comp-lancamentos').classList.toggle('oculto', !temSetor('lancamentos'));
  if(temSetor('lancamentos')){
    const movs=filtrar({unidade:un,datas: soHoje?[dataAtual()]:datas}).filter(l=>l.foto).slice().sort((a,b)=> a.data<b.data?1:-1);
    document.getElementById('grade-comprovantes').innerHTML = movs.length
      ? movs.map(l=>cartaoComprovanteHTML(l.foto,
          `${nomeCategoria(l.categoria)} · ${dataBr(l.data)} · ${fmt(l.valor)}`,
          `${l.tipo==='saida'?'−':''}${fmt(l.valor)}`,
          `${nomeCategoria(l.categoria)} · ${dataBr(l.data)} · ${l.turno==='dia'?'Dia':'Noite'}`,
          l.tipo==='entrada'?'verde':'vermelho',
          `apagarFotoComprovante('lancamentos',${AppEstado.dados.lancamentos.indexOf(l)})`)).join('')
      : `<div class="vazio">Nenhuma foto anexada ${soHoje?'hoje':'neste período'}.</div>`;
  }

  // Boletos e Pix
  document.getElementById('setor-comp-boletos').classList.toggle('oculto', !temSetor('boletos'));
  if(temSetor('boletos')){
    const lista=AppEstado.dados.boletos.filter(b=>b.unidade===un && b.foto && (!soHoje || bateHoje(b.vencimento) || bateHoje(b.dataPagamento)));
    document.getElementById('grade-comprovantes-boletos').innerHTML = lista.length
      ? lista.map(b=>cartaoComprovanteHTML(b.foto, `${b.descricao} · ${fmt(b.valor)}`, fmt(b.valor),
          `${b.descricao} · venc. ${dataBr(b.vencimento)}`, 'vermelho',
          `apagarFotoComprovante('boletos',${AppEstado.dados.boletos.indexOf(b)})`)).join('')
      : `<div class="vazio">Nenhum boleto com foto ${soHoje?'com vencimento ou pagamento hoje':'nesta unidade'}.</div>`;
  }

  // Boletos Administrativo (só quem tem o setor liberado, normalmente só o diretor)
  document.getElementById('setor-comp-boletos-admin').classList.toggle('oculto', !temSetor('boletos-admin'));
  if(temSetor('boletos-admin')){
    const lista=AppEstado.dados.boletosAdmin.filter(b=>b.foto && (!soHoje || bateHoje(b.vencimento)));
    document.getElementById('grade-comprovantes-boletos-admin').innerHTML = lista.length
      ? lista.map(b=>cartaoComprovanteHTML(b.foto, `${b.descricao} · ${fmt(b.valor)}`, fmt(b.valor),
          `${b.descricao} · venc. ${dataBr(b.vencimento)}`, 'vermelho',
          `apagarFotoComprovante('boletos-admin',${AppEstado.dados.boletosAdmin.indexOf(b)})`)).join('')
      : '<div class="vazio">Nenhum boleto administrativo com foto.</div>';
  }

  // Impostos e Energia
  document.getElementById('setor-comp-impostos').classList.toggle('oculto', !temSetor('impostos'));
  if(temSetor('impostos')){
    const lista=AppEstado.dados.contasFixas.filter(c=>c.unidade===un && c.foto && (!soHoje || bateHoje(c.vencimento) || bateHoje(c.dataPagamento)));
    document.getElementById('grade-comprovantes-impostos').innerHTML = lista.length
      ? lista.map(c=>cartaoComprovanteHTML(c.foto, `${nomeTipoConta(c.tipo)} · ${fmt(c.valor)}`, fmt(c.valor),
          `${nomeTipoConta(c.tipo)} · ${c.descricao} · venc. ${dataBr(c.vencimento)}`, 'vermelho',
          `apagarFotoComprovante('impostos',${AppEstado.dados.contasFixas.indexOf(c)})`)).join('')
      : '<div class="vazio">Nenhuma conta com foto nesta unidade.</div>';
  }
}

/* =========== FECHAMENTO: COMPRAS PARCELADAS =========== */
function ajustarParcelaAtual(){
  const total=Math.max(1, parseInt(document.getElementById('fp-parcelas').value,10)||1);
  const sel=document.getElementById('fp-parcela-atual');
  const anterior=sel.value;
  sel.innerHTML='';
  for(let n=1;n<=total;n++){
    sel.innerHTML += `<option value="${n}">${n} de ${total}</option>`;
  }
  if(anterior && anterior<=total) sel.value=anterior;
  recalcularValorParcela();
}
function recalcularValorParcela(){
  const totalCompra=parseFloat(document.getElementById('fp-valor-total').value)||0;
  const parcelas=Math.max(1, parseInt(document.getElementById('fp-parcelas').value,10)||1);
  document.getElementById('fp-valor-parcela').value = totalCompra>0 ? (totalCompra/parcelas).toFixed(2) : '';
}

async function salvarParcela(){
  const descricao=document.getElementById('fp-descricao').value.trim();
  const valorTotalCompra=parseFloat(document.getElementById('fp-valor-total').value);
  const totalParcelas=Math.max(1, parseInt(document.getElementById('fp-parcelas').value,10)||1);
  const parcelaAtual=parseInt(document.getElementById('fp-parcela-atual').value,10)||1;
  const valorParcela=parseFloat(document.getElementById('fp-valor-parcela').value);
  const data=document.getElementById('fp-data').value || hoje();
  const obsLivre=document.getElementById('fp-obs').value.trim();
  const formaPagamentoSaida=document.getElementById('fp-forma-pagamento').value || 'dinheiro';
  const msg=document.getElementById('msg-parcela');

  if(!descricao || !valorTotalCompra || valorTotalCompra<=0 || !valorParcela || valorParcela<=0){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha descrição, valor total da compra e valor desta parcela.';
    return;
  }
  const podeAnexarFoto = usuario.papel==='admin' || usuario.papel==='gerente';
  if(podeAnexarFoto && !AppEstado.ui.fotoPendenteParcela){
    msg.style.color='var(--saida)';
    msg.textContent='Anexe a foto da nota fiscal — obrigatório em toda saída.';
    return;
  }

  try{
    const fotoUrl = AppEstado.ui.fotoPendenteParcela ? await enviarFoto(AppEstado.ui.fotoPendenteParcela.dataUrl) : null;
    await api('/lancamentos', { method:'POST', body: JSON.stringify(lancamentoLocalParaApi({
      unidade:unidadeAtual(), data, turno:'dia', tipo:'saida', categoria:'parcelado',
      valor:valorParcela, obs:`${descricao} — parcela ${parcelaAtual}/${totalParcelas} de ${fmt(valorTotalCompra)}`+(obsLivre?` · ${obsLivre}`:''),
      foto:fotoUrl, formaPagamentoSaida
    })) });
    await recarregarLancamentos();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  document.getElementById('fp-descricao').value='';
  document.getElementById('fp-valor-total').value='';
  document.getElementById('fp-parcelas').value='1';
  document.getElementById('fp-valor-parcela').value='';
  document.getElementById('fp-data').value='';
  document.getElementById('fp-obs').value='';
  document.getElementById('fp-forma-pagamento').value='dinheiro';
  ajustarParcelaAtual();
  removerFotoParcela();
  msg.style.color='var(--entrada)';
  msg.textContent=`Parcela ${parcelaAtual}/${totalParcelas} de "${descricao}" salva e lançada como saída.`;
  setTimeout(()=>{ msg.textContent=''; },5000);
  desenhar();
}

function desenharFechamento(){
  const un=unidadeAtual();
  const parcelasUnidade = AppEstado.dados.lancamentos
    .map((l,i)=>({...l, indiceReal:i}))
    .filter(l=>l.unidade===un && l.categoria==='parcelado' && l.compraParcelada);

  // agrupar por descrição da compra pra mostrar o progresso
  const grupos={};
  parcelasUnidade.forEach(l=>{
    const chave=l.compraParcelada.descricao.toLowerCase().trim();
    (grupos[chave]=grupos[chave]||[]).push(l);
  });

  const resumos=Object.values(grupos).map(lista=>{
    lista.sort((a,b)=> a.data<b.data?-1:1);
    const ultima=lista[lista.length-1].compraParcelada;
    const pago=lista.reduce((s,l)=>s+l.valor,0);
    const restante=Math.max(0, ultima.valorTotalCompra - pago);
    const parcelasRegistradas=lista.length;
    return {descricao:lista[0].compraParcelada.descricao, valorTotalCompra:ultima.valorTotalCompra,
      totalParcelas:ultima.totalParcelas, parcelasRegistradas, pago, restante};
  }).sort((a,b)=> b.restante-a.restante);

  document.getElementById('lista-compras-parceladas').innerHTML = resumos.length ? resumos.map(r=>{
    const pct=Math.min(100, Math.round((r.parcelasRegistradas/r.totalParcelas)*100));
    return `<div class="cartao-parcela">
      <div class="topo-parcela">
        <div><div class="titulo-compra">${esc(r.descricao)}</div>
        <div class="sub-compra">${r.parcelasRegistradas} de ${r.totalParcelas} parcela(s) lançada(s)</div></div>
        <div class="neutro-forte num">${fmt(r.valorTotalCompra)}</div>
      </div>
      <div class="barra-progresso-parcela"><div class="preenchida" style="width:${pct}%"></div></div>
      <div class="linha-valores-parcela">
        <span>Pago até agora: <strong class="num">${fmt(r.pago)}</strong></span>
        <span>Restante estimado: <strong class="num">${fmt(r.restante)}</strong></span>
      </div>
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma compra parcelada registrada para esta unidade.</div>';

  const linhas=parcelasUnidade.slice().sort((a,b)=> a.data<b.data?1:-1).map(l=>{
    const legenda=`${l.compraParcelada.descricao} · parcela ${l.compraParcelada.parcelaAtual}/${l.compraParcelada.totalParcelas} · ${fmt(l.valor)}`;
    return `<tr>
      <td>${dataBr(l.data)}</td>
      <td>${esc(l.compraParcelada.descricao)}</td>
      <td>${l.compraParcelada.parcelaAtual} de ${l.compraParcelada.totalParcelas}</td>
      <td>${l.foto?`<img class="miniatura-tab" src="${esc(l.foto)}" alt="Nota" data-click="abrirLightbox('${escArg(l.foto)}','${escArg(legenda)}')">`:'<span class="tracinho">—</span>'}</td>
      <td class="n num vermelho">${fmt(l.valor)}</td>
    </tr>`;
  }).join('');
  document.getElementById('tab-parcelas').innerHTML =
    linhas || '<tr><td colspan="5" class="vazio">Nenhuma parcela lançada ainda.</td></tr>';
}
