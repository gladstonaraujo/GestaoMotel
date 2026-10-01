/* Módulo Visão Geral
 * Painel, alertas, relatórios e comparativo da rede.
 */

function diasDoMes(mes){
  const [ano,m]=mes.split('-').map(Number);
  return new Date(ano, m, 0).getDate();
}

function graficoTendenciaSvg(pontosReais, valorProjetado, diaFinal){
  const largura=760, altura=200, margemE=54, margemD=16, margemV=20;
  const areaW=largura-margemE-margemD, areaH=altura-margemV*2;
  const todosValores=[...pontosReais.map(p=>p.valor), valorProjetado, 0];
  const minV=Math.min(...todosValores), maxV=Math.max(...todosValores);
  const escalaY = v => margemV + areaH - ((v-minV)/((maxV-minV)||1))*areaH;
  const escalaX = dia => margemE + ((dia-1)/((diaFinal-1)||1))*areaW;

  const pontosLinha = pontosReais.map(p=>`${escalaX(p.dia)},${escalaY(p.valor)}`).join(' ');
  const ultimoPonto = pontosReais[pontosReais.length-1];
  const linhaProjecao = ultimoPonto
    ? `${escalaX(ultimoPonto.dia)},${escalaY(ultimoPonto.valor)} ${escalaX(diaFinal)},${escalaY(valorProjetado)}`
    : '';
  const yZero=escalaY(0);

  return `<svg viewBox="0 0 ${largura} ${altura}" class="grafico-svg">
    <line x1="${margemE}" y1="${yZero}" x2="${largura-margemD}" y2="${yZero}" stroke="var(--line)" stroke-width="1"/>
    <text x="4" y="${escalaY(maxV)+4}" font-size="10" fill="var(--slate)">${fmt(maxV)}</text>
    <text x="4" y="${yZero+4}" font-size="10" fill="var(--slate)">R$ 0</text>
    <text x="4" y="${escalaY(minV)+4}" font-size="10" fill="var(--slate)">${fmt(minV)}</text>
    ${linhaProjecao ? `<polyline points="${linhaProjecao}" fill="none" stroke="var(--noite)" stroke-width="2" stroke-dasharray="5,5"/>` : ''}
    <polyline points="${pontosLinha}" fill="none" stroke="var(--acento)" stroke-width="2.5"/>
    ${pontosReais.map(p=>`<circle cx="${escalaX(p.dia)}" cy="${escalaY(p.valor)}" r="2.5" fill="var(--acento)"/>`).join('')}
    ${ultimoPonto ? `<circle cx="${escalaX(diaFinal)}" cy="${escalaY(valorProjetado)}" r="3.5" fill="var(--noite)"/>` : ''}
    <text x="${margemE}" y="${altura-4}" font-size="10" fill="var(--slate)">dia 1</text>
    <text x="${largura-margemD-40}" y="${altura-4}" font-size="10" fill="var(--slate)">dia ${diaFinal} (projeção)</text>
  </svg>`;
}

function desenharTendenciaProjecao(){
  const cont=document.getElementById('grafico-tendencia');
  if(!cont) return;
  const un=unidadeAtual();
  const mesAtual=hoje().slice(0,7);
  const diaHoje=parseInt(hoje().slice(8,10),10);
  const diasNoMes=diasDoMes(mesAtual);

  let acumulado=0;
  const pontosReais=[];
  for(let d=1; d<=diaHoje; d++){
    const dataStr=`${mesAtual}-${String(d).padStart(2,'0')}`;
    const doDia=AppEstado.dados.lancamentos.filter(l=>l.unidade===un && l.data===dataStr);
    acumulado += somar(doDia.filter(l=>l.tipo==='entrada')) - somar(doDia.filter(l=>l.tipo==='saida'));
    pontosReais.push({dia:d, valor:acumulado});
  }

  const mediaDiaria = diaHoje>0 ? acumulado/diaHoje : 0;
  const projecaoFimMes = mediaDiaria*diasNoMes;

  if(pontosReais.length<2){
    cont.innerHTML='<div class="vazio">Ainda não há lançamentos suficientes este mês pra desenhar a tendência.</div>';
  }else{
    cont.innerHTML=graficoTendenciaSvg(pontosReais, projecaoFimMes, diasNoMes);
  }

  document.getElementById('grade-projecao').innerHTML = `
    <div class="stat-vistoria"><div class="num-stat">${fmt(acumulado)}</div><div class="rotulo-stat">Saldo acumulado até hoje (dia ${diaHoje})</div></div>
    <div class="stat-vistoria"><div class="num-stat">${fmt(mediaDiaria)}</div><div class="rotulo-stat">Média diária no mês</div></div>
    <div class="stat-vistoria"><div class="num-stat ${projecaoFimMes>=0?'verde':'vermelho'}">${fmt(projecaoFimMes)}</div><div class="rotulo-stat">Projeção pro fim do mês (dia ${diasNoMes})</div></div>
  `;
}

function barras(itens,total,classe,mostrarValor=true){
  if(!itens.length || total<=0) return '<div class="vazio">Nada lançado neste período.</div>';
  return itens.map(i=>`
    <div class="linha-barra">
      <div class="topo-linha"><span>${i.nome}</span>${mostrarValor?`<span class="num">${fmt(i.valor)}</span>`:''}</div>
      <div class="trilho"><div class="preenche ${classe}" style="width:${Math.max(2,(i.valor/total)*100)}%"></div></div>
    </div>`).join('');
}

function desenharPainel(){
  desenharTendenciaProjecao();
  const un=unidadeAtual(), datas=listaDatas();
  const movs=filtrar({unidade:un,datas});
  const ent=movs.filter(l=>l.tipo==='entrada'), sai=movs.filter(l=>l.tipo==='saida');
  const totE=somar(ent), totS=somar(sai), saldo=totE-totS;

  document.getElementById('titulo-painel').textContent=nomeUnidade(un);
  const per=diasPeriodo();
  document.getElementById('sub-painel').textContent =
    per===1 ? 'Movimento de '+dataBr(dataAtual())
            : `De ${dataBr(datas[0])} a ${dataBr(datas[datas.length-1])} · ${per} dias`;

  const g=document.getElementById('saldo-grande');
  g.textContent=fmt(saldo);
  g.className='valorao num '+(saldo>=0?'positivo':'negativo');

  document.getElementById('tot-entradas').textContent=fmt(totE);
  document.getElementById('tot-saidas').textContent=fmt(totS);
  document.getElementById('tot-dinheiro').textContent=
    fmt(somar(ent.filter(l=>l.categoria==='dinheiro')) - somarSaidasEmDinheiro(sai));
  document.getElementById('tot-cartoes').textContent=
    fmt(somar(ent.filter(l=>l.categoria==='debito'||l.categoria==='credito')));

  const porEnt=ENTRADAS.map(c=>({nome:c.nome,valor:somar(ent.filter(l=>l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  document.getElementById('graf-entradas').innerHTML=barras(porEnt,totE,'e');

  const porSai=SAIDAS.map(c=>({nome:c.nome,valor:somar(sai.filter(l=>l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor);
  document.getElementById('graf-saidas').innerHTML=barras(porSai,totS,'s');

  const linhas=datas.slice().reverse().map(d=>{
    const doDia=movs.filter(l=>l.data===d);
    const e=somar(doDia.filter(l=>l.tipo==='entrada')), s=somar(doDia.filter(l=>l.tipo==='saida'));
    const qtdAlteradas=doDia.filter(l=>l.dataAlterada).length;
    const avisoDia = qtdAlteradas
      ? `<span class="aviso-editado" title="${qtdAlteradas} lançamento(s) neste dia foram registrados em outra data pelo gerente ou diretor">data alterada</span>`
      : '';
    return `<tr>
      <td>${dataBr(d)}${avisoDia}</td>
      <td class="n verde num">${fmt(e)}</td>
      <td class="n vermelho num">${fmt(s)}</td>
      <td class="n neutro-forte num">${fmt(e-s)}</td>
    </tr>`;
  }).join('');
  document.getElementById('tab-dias').innerHTML =
    linhas || '<tr><td colspan="4" class="vazio">Nada lançado neste período.</td></tr>';
}

/* =========== ALERTAS DE DESPESAS (duplicadas / fora do padrão) =========== */
function calcularAlertas(){
  const ids = unidadesDoUsuario();
  const desde = diaMenos(29);
  const saidas = AppEstado.dados.lancamentos.filter(l => l.tipo==='saida' && ids.includes(l.unidade) && l.data>=desde);
  const alertas = [];
  const jaAlertado = new Set();
  const marcar = (l,tipo,motivo) => {
    const chave = tipo+'|'+AppEstado.dados.lancamentos.indexOf(l);
    if(jaAlertado.has(chave)) return;
    jaAlertado.add(chave);
    alertas.push({item:l, tipo, motivo});
  };

  // 1) Falta de caixa: qualquer lançamento nessa categoria entra direto no alerta
  saidas.filter(l=>l.categoria==='quebra').forEach(l=>{
    marcar(l,'quebra', l.obs ? l.obs : 'Falta de caixa registrada pelo funcionário, sem detalhes adicionais.');
  });

  // 1b) Retirada em espécie: também entra direto, pro diretor sempre ficar sabendo
  saidas.filter(l=>l.categoria==='retirada').forEach(l=>{
    marcar(l,'retirada', l.obs ? l.obs : 'Retirada em espécie registrada, sem detalhes adicionais.');
  });

  // 2) Despesas repetidas: mesma unidade + categoria + valor, em datas próximas (mesmo dia ou dia seguinte)
  const grupos1 = {};
  saidas.forEach(l=>{
    const chave = l.unidade+'|'+l.categoria+'|'+l.valor.toFixed(2);
    (grupos1[chave] = grupos1[chave] || []).push(l);
  });
  Object.values(grupos1).forEach(lista=>{
    if(lista.length<2) return;
    lista.sort((a,b)=> a.data<b.data ? -1 : 1);
    for(let i=1;i<lista.length;i++){
      if(diasEntre(lista[i-1].data, lista[i].data) <= 1){
        const mesmoDia = lista[i-1].data===lista[i].data;
        const motivo = `Mesmo valor (${fmt(lista[i].valor)}) lançado em ${nomeCategoria(lista[i].categoria)} `
          + (mesmoDia ? 'duas vezes no mesmo dia.' : 'em dias seguidos.');
        marcar(lista[i-1],'duplicado',motivo);
        marcar(lista[i],'duplicado',motivo);
      }
    }
  });

  // 3) Despesas fora do padrão: valor bem acima da média da própria categoria naquela unidade
  const grupos2 = {};
  saidas.forEach(l=>{
    const chave = l.unidade+'|'+l.categoria;
    (grupos2[chave] = grupos2[chave] || []).push(l);
  });
  Object.values(grupos2).forEach(lista=>{
    if(lista.length<4) return; // amostra pequena demais pra comparar com segurança
    const valores = lista.map(l=>l.valor);
    const media = valores.reduce((a,b)=>a+b,0)/valores.length;
    const desvio = Math.sqrt(valores.reduce((a,b)=>a+Math.pow(b-media,2),0)/valores.length);
    lista.forEach(l=>{
      if(desvio>0 && l.valor > media + 2*desvio && l.valor > media*1.6){
        marcar(l,'atipico',`Valor bem acima do costume em ${nomeCategoria(l.categoria)} nesta unidade — a média gira em torno de ${fmt(media)}.`);
      }
    });
  });

  return alertas.sort((a,b)=> a.item.data<b.item.data ? 1 : a.item.data>b.item.data ? -1 : 0);
}

function irParaLancamento(unidade,data){
  document.getElementById('sel-unidade').value=unidade;
  document.getElementById('sel-data').value=data;
  abrir('extrato');
}

function desenharAlertas(){
  const alertas=calcularAlertas();
  const rotulosAlerta={quebra:'Falta de caixa',retirada:'Retirada em espécie',duplicado:'Repetida',atipico:'Fora do padrão'};
  document.getElementById('contagem-alertas').textContent=alertas.length;
  document.getElementById('lista-alertas').innerHTML = alertas.length ? alertas.map(a=>{
    const l=a.item;
    return `<div class="alerta-item" data-click="irParaLancamento('${l.unidade}','${l.data}')">
      <span class="selo-alerta ${a.tipo}">${rotulosAlerta[a.tipo]}</span>
      <div class="alerta-corpo">
        <div class="alerta-titulo">${nomeUnidade(l.unidade)} · ${nomeCategoria(l.categoria)} · ${dataBr(l.data)}</div>
        <div class="alerta-motivo">${a.motivo}</div>
      </div>
      <div class="alerta-valor num vermelho">${fmt(l.valor)}</div>
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma despesa duplicada, fora do padrão, falta de caixa ou retirada nos últimos 30 dias.</div>';
}

function intervaloRelatorio(){
  const sel=document.getElementById('sel-periodo-relatorio');
  const valor=sel?sel.value:'30';
  if(valor==='custom'){
    const de=document.getElementById('rel-de').value;
    const ate=document.getElementById('rel-ate').value;
    if(de && ate && de<=ate){
      const datas=[]; let d=new Date(de+'T12:00:00');
      const fimData=new Date(ate+'T12:00:00');
      while(d<=fimData){ datas.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
      return {inicio:de, fim:ate, dias:datas.length, datas:datas.reverse(), diario:datas.length===1};
    }
    // sem data válida ainda: usa hoje como fallback
    return {inicio:hoje(), fim:hoje(), dias:1, datas:[hoje()], diario:true};
  }
  const diasPreset=parseInt(valor,10)||30;
  const fim=hoje();
  const datas=[]; let d=new Date(fim+'T12:00:00');
  for(let i=0;i<diasPreset;i++){ datas.push(new Date(d).toISOString().slice(0,10)); d.setDate(d.getDate()-1); }
  return {inicio:datas[datas.length-1], fim, dias:diasPreset, datas, diario:diasPreset===1};
}

function mudarPeriodoRelatorio(){
  const sel=document.getElementById('sel-periodo-relatorio');
  const bloco=document.getElementById('bloco-periodo-personalizado');
  const custom=sel.value==='custom';
  bloco.classList.toggle('oculto', !custom);
  if(!custom){
    const {inicio,fim}=intervaloRelatorio();
    document.getElementById('rel-de').value=inicio;
    document.getElementById('rel-ate').value=fim;
  }
  desenharRelatorio();
}

function secoesRelatorioSelecionadas(){
  return [...document.querySelectorAll('.chk-secao-relatorio:checked')].map(c=>c.value);
}

function calcularDadosRelatorio(){
  const {inicio, fim, dias, datas} = intervaloRelatorio();

  const ids=unidadesDoUsuario();
  const movsPeriodo = AppEstado.dados.lancamentos.filter(l=> ids.includes(l.unidade) && datas.includes(l.data));
  const totE=somar(movsPeriodo.filter(l=>l.tipo==='entrada'));
  const totS=somar(movsPeriodo.filter(l=>l.tipo==='saida'));

  const porUnidade = ids.map(id=>{
    const m=movsPeriodo.filter(l=>l.unidade===id);
    const e=somar(m.filter(l=>l.tipo==='entrada')), s=somar(m.filter(l=>l.tipo==='saida'));
    return {id, nome:nomeUnidade(id), e, s, saldo:e-s};
  }).sort((a,b)=>b.saldo-a.saldo);

  const porCategoria = SAIDAS.map(c=>({nome:c.nome, valor:somar(movsPeriodo.filter(l=>l.tipo==='saida'&&l.categoria===c.id))}))
    .filter(i=>i.valor>0).sort((a,b)=>b.valor-a.valor).slice(0,5);

  const alertas = calcularAlertas();
  const vistoriasPeriodo = AppEstado.dados.vistorias.filter(v=> ids.includes(v.unidade) && datas.includes(v.data));
  const vistoriasComProblema = vistoriasPeriodo.filter(v=>v.itens.some(i=>i.status==='problema'));

  const faltasPeriodo = AppEstado.dados.faltas.filter(f=> ids.includes(f.unidade) && datas.includes(f.data));
  const faltasJustificadas = faltasPeriodo.filter(f=>f.justificada).length;
  const faltasNaoJustificadas = faltasPeriodo.length - faltasJustificadas;
  const contagemFaltaPessoa={};
  faltasPeriodo.forEach(f=>{
    const func=AppEstado.dados.funcionarios.find(x=>x.id===f.funcionarioId);
    const nome=func?func.nome:'(removido)';
    contagemFaltaPessoa[nome]=(contagemFaltaPessoa[nome]||0)+1;
  });
  const rankingFaltas=Object.entries(contagemFaltaPessoa).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const trocasPeriodo = AppEstado.dados.trocas.filter(t=> ids.includes(t.unidade) && datas.includes(t.registradoEm));
  const trocasDia = trocasPeriodo.filter(t=>t.turno==='dia').length;
  const trocasNoite = trocasPeriodo.filter(t=>t.turno==='noite').length;

  // detalhe linha a linha — só usado no relatório diário (dias===1), mas calculado sempre por ser barato
  const lancamentosDetalhados = movsPeriodo.slice().sort((a,b)=> a.unidade<b.unidade?-1:1);
  const boletosVencendo = AppEstado.dados.boletos.filter(b=> ids.includes(b.unidade) && b.status==='pendente' && datas.includes(b.vencimento));
  const contasVencendo = AppEstado.dados.contasFixas.filter(c=> ids.includes(c.unidade) && c.status==='pendente' && datas.includes(c.vencimento));

  const produtosVencidosPeriodo = AppEstado.dados.produtosVencidos.filter(p=> ids.includes(p.unidade) && datas.includes(p.registradoEm));
  const produtosVencidosPrejuizo = produtosVencidosPeriodo.reduce((s,p)=>s+p.prejuizo,0);
  const produtosVencidosItens = produtosVencidosPeriodo.reduce((s,p)=>s+p.quantidade,0);
  const contagemProdutoVencido={};
  produtosVencidosPeriodo.forEach(p=>{
    contagemProdutoVencido[p.produto]=(contagemProdutoVencido[p.produto]||0)+p.quantidade;
  });
  const rankingProdutosVencidos=Object.entries(contagemProdutoVencido).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // ranking de unidades por mais usos, e categoria de suíte com maior faturamento médio — usa o período mais recente de RevPAR de cada unidade
  const revparMaisRecentePorUnidade = ids.map(id=>{
    const registros=AppEstado.dados.revparRegistros.filter(r=>r.unidade===id).sort((a,b)=> a.registradoEm<b.registradoEm?1:-1);
    return registros[0] ? {...registros[0], unidadeId:id} : null;
  }).filter(Boolean);

  const rankingUsosUnidade = revparMaisRecentePorUnidade
    .map(r=>({nome:nomeUnidade(r.unidadeId), valor:r.usosTotal}))
    .sort((a,b)=>b.valor-a.valor);

  const somaFaturadoCategoria={}, contagemCategoriaUnidades={};
  revparMaisRecentePorUnidade.forEach(r=>{
    r.porCategoria.forEach(c=>{
      somaFaturadoCategoria[c.categoria]=(somaFaturadoCategoria[c.categoria]||0)+c.faturado;
      contagemCategoriaUnidades[c.categoria]=(contagemCategoriaUnidades[c.categoria]||0)+1;
    });
  });
  const rankingCategoriaFaturamentoMedio = Object.keys(somaFaturadoCategoria)
    .map(cat=>({nome:cat, valor:somaFaturadoCategoria[cat]/contagemCategoriaUnidades[cat]}))
    .sort((a,b)=>b.valor-a.valor);

  // ranking de avaliação de vistoria, separado por papel de quem vistoriou
  // fórmula: cada item "OK" = +1 ponto, cada item "problema" = -1 ponto
  // aproveitamento% = itens OK / total de itens avaliados — isso deixa justo comparar
  // vistoria completa (~40 itens) com vistoria rápida (9 itens)
  const porPessoaVistoria={};
  vistoriasPeriodo.forEach(v=>{
    const nome=v.feitoPor;
    if(!porPessoaVistoria[nome]) porPessoaVistoria[nome]={nome, vistorias:0, itensOk:0, itensProblema:0};
    porPessoaVistoria[nome].vistorias++;
    v.itens.forEach(i=>{
      if(i.status==='problema') porPessoaVistoria[nome].itensProblema++;
      else porPessoaVistoria[nome].itensOk++;
    });
  });
  const listaPessoasVistoria = Object.values(porPessoaVistoria).map(p=>{
    const totalItens=p.itensOk+p.itensProblema;
    return {
      ...p,
      pontos: p.itensOk - p.itensProblema,
      aproveitamento: totalItens ? Math.round((p.itensOk/totalItens)*1000)/10 : 0,
      papel: (AppEstado.dados.usuarios.find(u=>u.nome===p.nome) || {}).papel || 'funcionario'
    };
  });
  const rankingVistoriaGerentes = listaPessoasVistoria.filter(p=>p.papel==='gerente' || p.papel==='admin')
    .sort((a,b)=> b.aproveitamento-a.aproveitamento || b.vistorias-a.vistorias);
  const rankingVistoriaFuncionarios = listaPessoasVistoria.filter(p=>p.papel==='funcionario' || p.papel==='inspetor')
    .sort((a,b)=> b.aproveitamento-a.aproveitamento || b.vistorias-a.vistorias);

  return {dias, inicio, fim, totE, totS, porUnidade, porCategoria, alertas, vistoriasPeriodo, vistoriasComProblema,
    faltasPeriodo, faltasJustificadas, faltasNaoJustificadas, rankingFaltas,
    trocasPeriodo, trocasDia, trocasNoite,
    lancamentosDetalhados, boletosVencendo, contasVencendo,
    produtosVencidosPeriodo, produtosVencidosPrejuizo, produtosVencidosItens, rankingProdutosVencidos,
    rankingUsosUnidade, rankingCategoriaFaturamentoMedio,
    rankingVistoriaGerentes, rankingVistoriaFuncionarios};
}

function desenharRelatorio(){
  const cont=document.getElementById('corpo-relatorio');
  if(!cont) return;
  const r=calcularDadosRelatorio();
  const saldo=r.totE-r.totS;
  const secoes=secoesRelatorioSelecionadas();
  const tem = s => secoes.includes(s);

  const blocoFaturamento = tem('faturamento') ? `
    <div class="painel espaco-vertical">
      <h3>Saldo por unidade</h3>
      <table class="dados">
        <thead><tr><th>Unidade</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Saldo</th></tr></thead>
        <tbody>${r.porUnidade.map(u=>`<tr>
          <td>${u.nome}</td>
          <td class="n verde num">${fmt(u.e)}</td>
          <td class="n vermelho num">${fmt(u.s)}</td>
          <td class="n neutro-forte num">${fmt(u.saldo)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="painel u-mb-16">
      <h3>Maiores categorias de despesa</h3>
      ${r.porCategoria.length ? barras(r.porCategoria, r.porCategoria[0].valor, 's') : '<div class="vazio">Nenhuma despesa no período.</div>'}
    </div>` : '';

  const blocoFaltasTrocasVencidos = (tem('faltas')||tem('trocas')||tem('vencidos')) ? `
    <div class="grade">
      ${tem('faltas') ? `<div class="painel">
        <h3>Faltas da equipe</h3>
        <p class="secao-sub u-mb-10">${r.faltasPeriodo.length} falta(s) — ${r.faltasJustificadas} justificada(s), ${r.faltasNaoJustificadas} não justificada(s)</p>
        ${r.rankingFaltas.length
          ? barras(r.rankingFaltas.map(([nome,valor])=>({nome,valor})), r.rankingFaltas[0][1], 's', false)
          : '<div class="vazio">Nenhuma falta no período.</div>'}
      </div>` : ''}
      ${tem('trocas') ? `<div class="painel">
        <h3>Trocas de plantão</h3>
        <p class="secao-sub u-mb-10">${r.trocasPeriodo.length} troca(s) registrada(s) no período</p>
        <table class="dados">
          <tbody>
            <tr><td>Turno Dia</td><td class="n num">${r.trocasDia}</td></tr>
            <tr><td>Turno Noite</td><td class="n num">${r.trocasNoite}</td></tr>
            <tr><td class="neutro-forte">Total</td><td class="n neutro-forte num">${r.trocasPeriodo.length}</td></tr>
          </tbody>
        </table>
      </div>` : ''}
      ${tem('vencidos') ? `<div class="painel">
        <h3>Produtos vencidos</h3>
        <p class="secao-sub u-mb-10">${r.produtosVencidosPeriodo.length} registro(s) — ${r.produtosVencidosItens} item(ns) — prejuízo de ${fmt(r.produtosVencidosPrejuizo)}</p>
        ${r.rankingProdutosVencidos.length
          ? barras(r.rankingProdutosVencidos.map(([nome,valor])=>({nome,valor})), r.rankingProdutosVencidos[0][1], 's', false)
          : '<div class="vazio">Nenhum produto vencido no período.</div>'}
      </div>` : ''}
    </div>` : '';

  const blocoRevpar = tem('revpar') ? `
    <div class="grade u-mb-16">
      <div class="painel">
        <h3>Ranking — unidades com mais usos</h3>
        <p class="secao-sub u-mb-10">Do período de RevPAR mais recente de cada unidade</p>
        ${r.rankingUsosUnidade.length
          ? barras(r.rankingUsosUnidade, Math.max(...r.rankingUsosUnidade.map(d=>d.valor),1), 'e', false)
          : '<div class="vazio">Nenhum RevPAR registrado ainda.</div>'}
      </div>
      <div class="painel">
        <h3>Categoria com maior faturamento médio</h3>
        <p class="secao-sub u-mb-10">Média entre as unidades que têm essa categoria cadastrada</p>
        ${r.rankingCategoriaFaturamentoMedio.length
          ? barras(r.rankingCategoriaFaturamentoMedio, Math.max(...r.rankingCategoriaFaturamentoMedio.map(d=>d.valor),1), 'e')
          : '<div class="vazio">Nenhum RevPAR registrado ainda.</div>'}
      </div>
    </div>` : '';

  const linhaRankingVistoria = p => `<tr>
      <td>${p.nome}</td>
      <td class="n num">${p.vistorias}</td>
      <td class="n verde num">${p.itensOk}</td>
      <td class="n vermelho num">${p.itensProblema}</td>
      <td class="n num">${p.aproveitamento}%</td>
      <td class="n neutro-forte num">${p.pontos}</td>
    </tr>`;
  const cabecalhoRankingVistoria = `<thead><tr>
      <th>Nome</th><th class="n">Vistorias</th><th class="n">Itens OK</th>
      <th class="n">Itens problema</th><th class="n">Aproveitamento</th><th class="n">Pontos</th>
    </tr></thead>`;
  const blocoRankingVistoria = tem('vistorias') ? `
    <h3 class="espaco-bloco">Ranking de avaliação de vistoria</h3>
    <p class="secao-sub u-mb-10">Fórmula: cada item "OK" soma 1 ponto, cada item "problema" tira 1 ponto. Aproveitamento = itens OK ÷ total de itens avaliados.</p>
    <div class="grade u-mb-16">
      <div class="painel">
        <h3>Gerentes</h3>
        <table class="dados">${cabecalhoRankingVistoria}
          <tbody>${r.rankingVistoriaGerentes.length ? r.rankingVistoriaGerentes.map(linhaRankingVistoria).join('') : '<tr><td colspan="6" class="vazio">Nenhuma vistoria de gerente no período.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="painel">
        <h3>Funcionários</h3>
        <table class="dados">${cabecalhoRankingVistoria}
          <tbody>${r.rankingVistoriaFuncionarios.length ? r.rankingVistoriaFuncionarios.map(linhaRankingVistoria).join('') : '<tr><td colspan="6" class="vazio">Nenhuma vistoria de funcionário no período.</td></tr>'}</tbody>
        </table>
      </div>
    </div>` : '';

  const blocoDetalheDiario = r.dias===1 ? `
    <h3 class="espaco-bloco">Detalhe completo do dia — ${dataBr(r.fim)}</h3>

    ${tem('faturamento') ? `<div class="painel u-mb-16">
      <h3>Lançamentos do dia (${r.lancamentosDetalhados.length})</h3>
      <table class="dados">
        <thead><tr><th>Unidade</th><th>Turno</th><th>Categoria</th><th>Descrição</th><th class="n">Valor</th></tr></thead>
        <tbody>${r.lancamentosDetalhados.length ? r.lancamentosDetalhados.map(l=>`
          <tr>
            <td>${nomeUnidade(l.unidade)}</td>
            <td><span class="selo ${l.turno}">${l.turno==='dia'?'Dia':'Noite'}</span></td>
            <td>${nomeCategoria(l.categoria)}</td>
            <td>${l.obs||'—'}</td>
            <td class="n num ${l.tipo==='entrada'?'verde':'vermelho'}">${l.tipo==='saida'?'−':''}${fmt(l.valor)}</td>
          </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhum lançamento hoje.</td></tr>'}</tbody>
      </table>
    </div>` : ''}

    ${(tem('vistorias')||tem('faltas')||tem('trocas')) ? `<div class="grade u-mb-16">
      ${tem('vistorias') ? `<div class="painel">
        <h3>Vistorias do dia (${r.vistoriasPeriodo.length})</h3>
        ${r.vistoriasPeriodo.length ? `<table class="dados">
          <thead><tr><th>Unidade</th><th>Suíte</th><th>Turno</th><th>Feita por</th><th class="n">Status</th></tr></thead>
          <tbody>${r.vistoriasPeriodo.map(v=>{
            const problemas=v.itens.filter(i=>i.status==='problema').length;
            return `<tr>
              <td>${nomeUnidade(v.unidade)}</td><td>${v.suite}</td>
              <td><span class="selo ${v.turno}">${v.turno==='dia'?'Dia':'Noite'}</span></td>
              <td>${v.feitoPor}</td>
              <td class="n">${problemas?`<span class="selo-status atrasado">${problemas} problema(s)</span>`:'<span class="selo-status pago">OK</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : '<div class="vazio">Nenhuma vistoria hoje.</div>'}
      </div>` : ''}
      ${(tem('faltas')||tem('trocas')) ? `<div class="painel">
        <h3>Faltas e trocas do dia</h3>
        ${tem('faltas') ? (r.faltasPeriodo.length ? r.faltasPeriodo.map(f=>{
          const func=AppEstado.dados.funcionarios.find(x=>x.id===f.funcionarioId);
          return `<div class="sub-boleto u-mb-6">Falta: <strong>${func?func.nome:'(removido)'}</strong> — ${f.motivo} (${f.justificada?'justificada':'não justificada'})</div>`;
        }).join('') : '<div class="vazio">Nenhuma falta hoje.</div>') : ''}
        ${tem('trocas') ? (r.trocasPeriodo.length ? r.trocasPeriodo.map(t=>{
          const f1=AppEstado.dados.funcionarios.find(x=>x.id===t.funcionario1Id), f2=AppEstado.dados.funcionarios.find(x=>x.id===t.funcionario2Id);
          return `<div class="sub-boleto u-mb-6">Troca (${t.turno==='dia'?'Dia':'Noite'}): <strong>${f1?f1.nome:'—'}</strong> x <strong>${f2?f2.nome:'—'}</strong> — ${t.motivo}</div>`;
        }).join('') : '<div class="vazio">Nenhuma troca hoje.</div>') : ''}
      </div>` : ''}
    </div>` : ''}

    ${tem('vencidos') ? `<div class="painel u-mb-16">
      <h3>Produtos vencidos hoje (${r.produtosVencidosPeriodo.length})</h3>
      ${r.produtosVencidosPeriodo.length ? `<table class="dados">
        <thead><tr><th>Unidade</th><th>Produto</th><th>Motivo</th><th class="n">Qtd</th><th class="n">Prejuízo</th></tr></thead>
        <tbody>${r.produtosVencidosPeriodo.map(p=>`
          <tr>
            <td>${nomeUnidade(p.unidade)}</td>
            <td>${p.produto}</td>
            <td><span class="selo-status ${p.motivoTipo}">${nomeMotivoVencido(p.motivoTipo)}</span></td>
            <td class="n num">${p.quantidade}</td>
            <td class="n num">${p.prejuizo?fmt(p.prejuizo):'—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="vazio">Nenhum produto vencido hoje.</div>'}
    </div>` : ''}

    ${tem('faturamento') ? `<div class="painel">
      <h3>Boletos e contas vencendo hoje</h3>
      ${(r.boletosVencendo.length + r.contasVencendo.length) ? `<table class="dados">
        <thead><tr><th>Unidade</th><th>Descrição</th><th class="n">Valor</th></tr></thead>
        <tbody>
          ${r.boletosVencendo.map(b=>`<tr><td>${nomeUnidade(b.unidade)}</td><td>${b.descricao}</td><td class="n num">${fmt(b.valor)}</td></tr>`).join('')}
          ${r.contasVencendo.map(c=>`<tr><td>${nomeUnidade(c.unidade)}</td><td>${nomeTipoConta(c.tipo)} — ${c.descricao}</td><td class="n num">${fmt(c.valor)}</td></tr>`).join('')}
        </tbody>
      </table>` : '<div class="vazio">Nada vencendo hoje.</div>'}
    </div>` : ''}` : '';

  cont.innerHTML = `
    <div class="destaque">
      <div class="rotulo">Saldo da rede · ${r.dias===1 ? 'hoje, '+dataBr(r.fim) : dataBr(r.inicio)+' a '+dataBr(r.fim)}</div>
      <div class="valorao num ${saldo>=0?'positivo':'negativo'}">${fmt(saldo)}</div>
      <div class="apoio">
        <div><span>Entradas</span><strong class="num verde">${fmt(r.totE)}</strong></div>
        <div><span>Saídas</span><strong class="num vermelho">${fmt(r.totS)}</strong></div>
        <div><span>Alertas ativos</span><strong class="num">${r.alertas.length}</strong></div>
        <div><span>Vistorias c/ problema</span><strong class="num">${r.vistoriasComProblema.length} de ${r.vistoriasPeriodo.length}</strong></div>
      </div>
    </div>
    ${blocoFaturamento}
    ${blocoFaltasTrocasVencidos}
    ${blocoRevpar}
    ${blocoRankingVistoria}
    ${blocoDetalheDiario}
  `;
}

function baixarRelatorioResumido(){
  const r=calcularDadosRelatorio();
  const saldo=r.totE-r.totS;
  const secoes=secoesRelatorioSelecionadas();
  const tem = s => secoes.includes(s);
  const tituloPeriodo = r.dias===1 ? 'Diário — '+dataBr(r.fim) : dataBr(r.inicio)+' a '+dataBr(r.fim);

  const linhaMini = (rotulo,valor,cor='') => `<div class="mi"><span>${rotulo}</span><strong class="${cor}">${valor}</strong></div>`;
  const listaMini = (itens, formatarValor) => itens.length
    ? '<ul class="lm">'+itens.map(i=>`<li><span>${i.nome}</span><b>${formatarValor(i.valor)}</b></li>`).join('')+'</ul>'
    : '<p class="vz">Sem dados no período.</p>';

  const blocoFaturamento = tem('faturamento') ? `
    <section>
      <h2>Faturamento por unidade</h2>
      <table><thead><tr><th>Unidade</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>
      <tbody>${r.porUnidade.map(u=>`<tr><td>${u.nome}</td><td class="v">${fmt(u.e)}</td><td class="r">${fmt(u.s)}</td><td class="v b">${fmt(u.saldo)}</td></tr>`).join('')}</tbody></table>
      ${r.porCategoria.length ? `<h3>Maiores despesas</h3>${listaMini(r.porCategoria, fmt)}` : ''}
    </section>` : '';

  const blocoRevpar = tem('revpar') ? `
    <section>
      <h2>RevPAR — unidades com mais usos</h2>
      ${listaMini(r.rankingUsosUnidade, v=>v+' usos')}
      <h3>Categoria com maior faturamento médio</h3>
      ${listaMini(r.rankingCategoriaFaturamentoMedio, fmt)}
    </section>` : '';

  const linhaMiniRankingVistoria = p => `<li><span>${p.nome} (${p.vistorias} vistoria(s))</span><b>${p.aproveitamento}% · ${p.pontos} pts</b></li>`;
  const blocoRankingVistoria = tem('vistorias') ? `
    <section>
      <h2>Ranking de avaliação de vistoria</h2>
      <h3>Gerentes</h3>
      ${r.rankingVistoriaGerentes.length ? '<ul class="lm">'+r.rankingVistoriaGerentes.map(linhaMiniRankingVistoria).join('')+'</ul>' : '<p class="vz">Sem dados no período.</p>'}
      <h3>Funcionários</h3>
      ${r.rankingVistoriaFuncionarios.length ? '<ul class="lm">'+r.rankingVistoriaFuncionarios.map(linhaMiniRankingVistoria).join('')+'</ul>' : '<p class="vz">Sem dados no período.</p>'}
    </section>` : '';

  const blocoFaltas = tem('faltas') ? `
    <section>
      <h2>Faltas</h2>
      <p class="mut">${r.faltasPeriodo.length} falta(s) — ${r.faltasJustificadas} justificada(s), ${r.faltasNaoJustificadas} não justificada(s)</p>
      ${listaMini(r.rankingFaltas.map(([nome,valor])=>({nome,valor})), v=>v+'x')}
    </section>` : '';

  const blocoTrocas = tem('trocas') ? `
    <section>
      <h2>Trocas de plantão</h2>
      <p class="mut">${r.trocasPeriodo.length} registrada(s) — ${r.trocasDia} de turno Dia, ${r.trocasNoite} de turno Noite</p>
    </section>` : '';

  const blocoVencidos = tem('vencidos') ? `
    <section>
      <h2>Produtos vencidos</h2>
      <p class="mut">${r.produtosVencidosPeriodo.length} registro(s) — ${r.produtosVencidosItens} item(ns) — prejuízo de ${fmt(r.produtosVencidosPrejuizo)}</p>
      ${listaMini(r.rankingProdutosVencidos.map(([nome,valor])=>({nome,valor})), v=>v+'x')}
    </section>` : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório resumido — ${tituloPeriodo}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#000;background:#fff;max-width:720px;margin:0 auto;padding:28px 20px;font-size:13.5px}
  h1{font-size:19px;margin:0 0 2px;color:#000}
  .sub{color:#000;font-size:12.5px;margin:0 0 20px}
  .destaque{background:#fff;color:#000;border:1.5px solid #000;border-radius:8px;padding:18px 20px;margin-bottom:18px}
  .destaque .rot{font-size:12px;color:#000}
  .destaque .val{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:2px 0 10px;color:#000}
  .destaque .grid{display:flex;gap:22px;flex-wrap:wrap;font-size:12.5px;color:#000}
  .destaque .grid b{display:block;font-size:15px;color:#000}
  section{margin-bottom:18px;page-break-inside:avoid}
  h2{font-size:14px;margin:0 0 8px;border-bottom:2px solid #000;padding-bottom:4px;color:#000}
  h3{font-size:12.5px;color:#000;margin:10px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;color:#000;font-weight:600;font-size:11.5px;padding:0 6px 5px;border-bottom:1.5px solid #000}
  td{padding:5px 6px;border-bottom:1px solid #ccc;color:#000}
  td.v{color:#000}
  td.r{color:#000}
  td.b{font-weight:700}
  ul.lm{list-style:none;margin:0;padding:0}
  ul.lm li{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #ccc;font-size:12.5px;color:#000}
  .mi{display:inline-block;margin-right:18px}
  .mut{color:#000;font-size:12px;margin:0 0 6px}
  .vz{color:#000;font-size:12px;font-style:italic;margin:0}
  .rodape{color:#000;font-size:11px;margin-top:24px;border-top:1px solid #000;padding-top:10px}
  @media print{ body{padding:0} }
</style></head>
<body>
  <h1>Relatório resumido — Rede A2</h1>
  <p class="sub">${tituloPeriodo} · gerado em ${dataBr(hoje())} por ${usuario.nome}</p>

  <div class="destaque">
    <div class="rot">Saldo da rede</div>
    <div class="val">${fmt(saldo)}</div>
    <div class="grid">
      <div><span>Entradas</span><b>${fmt(r.totE)}</b></div>
      <div><span>Saídas</span><b>${fmt(r.totS)}</b></div>
      <div><span>Alertas ativos</span><b>${r.alertas.length}</b></div>
      <div><span>Vistorias c/ problema</span><b>${r.vistoriasComProblema.length} de ${r.vistoriasPeriodo.length}</b></div>
    </div>
  </div>

  ${blocoFaturamento}
  ${blocoRevpar}
  ${blocoRankingVistoria}
  ${blocoFaltas}
  ${blocoTrocas}
  ${blocoVencidos}

  <p class="rodape">Gerado automaticamente pelo sistema de gestão A2 Pousada. Pra salvar como PDF, use Imprimir → Salvar como PDF.</p>
</body></html>`;

  const blob=new Blob([html], {type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`relatorio-resumido-A2-${r.fim}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copiarRelatorio(){
  const r=calcularDadosRelatorio();
  const saldo=r.totE-r.totS;
  const linhas=[];
  const secoes=secoesRelatorioSelecionadas();
  const tem = s => secoes.includes(s);

  linhas.push(r.dias===1 ? `RELATÓRIO DIÁRIO COMPLETO — ${dataBr(r.fim)}` : `RELATÓRIO DA REDE — ${dataBr(r.inicio)} a ${dataBr(r.fim)}`);
  linhas.push('');
  linhas.push(`Saldo geral: ${fmt(saldo)}`);
  linhas.push(`Entradas: ${fmt(r.totE)}  |  Saídas: ${fmt(r.totS)}`);
  linhas.push(`Alertas ativos: ${r.alertas.length}  |  Vistorias com problema: ${r.vistoriasComProblema.length} de ${r.vistoriasPeriodo.length}`);

  if(tem('faturamento')){
    linhas.push('');
    linhas.push('Por unidade:');
    r.porUnidade.forEach(u=> linhas.push(`  ${u.nome} — entradas ${fmt(u.e)}, saídas ${fmt(u.s)}, saldo ${fmt(u.saldo)}`));
    if(r.porCategoria.length){
      linhas.push('');
      linhas.push('Maiores despesas:');
      r.porCategoria.forEach(c=> linhas.push(`  ${c.nome}: ${fmt(c.valor)}`));
    }
  }
  if(tem('faltas')){
    linhas.push('');
    linhas.push(`Faltas: ${r.faltasPeriodo.length} (${r.faltasJustificadas} justificada(s), ${r.faltasNaoJustificadas} não justificada(s))`);
    if(r.rankingFaltas.length){
      r.rankingFaltas.forEach(([nome,qtd])=> linhas.push(`  ${nome}: ${qtd} falta(s)`));
    }
  }
  if(tem('trocas')){
    linhas.push('');
    linhas.push(`Trocas de plantão: ${r.trocasPeriodo.length} registrada(s) — ${r.trocasDia} de turno Dia, ${r.trocasNoite} de turno Noite`);
  }
  if(tem('vencidos')){
    linhas.push('');
    linhas.push(`Produtos vencidos: ${r.produtosVencidosPeriodo.length} registro(s), ${r.produtosVencidosItens} item(ns), prejuízo de ${fmt(r.produtosVencidosPrejuizo)}`);
    if(r.rankingProdutosVencidos.length){
      r.rankingProdutosVencidos.forEach(([nome,qtd])=> linhas.push(`  ${nome}: ${qtd} unidade(s)`));
    }
  }
  if(tem('revpar')){
  linhas.push('');
  linhas.push('Ranking — unidades com mais usos:');
  if(r.rankingUsosUnidade.length){
    r.rankingUsosUnidade.forEach(u=> linhas.push(`  ${u.nome}: ${u.valor} uso(s)`));
  }else{
    linhas.push('  Nenhum RevPAR registrado ainda.');
  }
  linhas.push('');
  linhas.push('Categoria com maior faturamento médio:');
  if(r.rankingCategoriaFaturamentoMedio.length){
    r.rankingCategoriaFaturamentoMedio.forEach(c=> linhas.push(`  ${c.nome}: ${fmt(c.valor)}`));
  }else{
    linhas.push('  Nenhum RevPAR registrado ainda.');
  }
  }

  if(tem('vistorias')){
    linhas.push('');
    linhas.push('Ranking de avaliação de vistoria — Gerentes:');
    if(r.rankingVistoriaGerentes.length){
      r.rankingVistoriaGerentes.forEach(p=> linhas.push(`  ${p.nome}: ${p.vistorias} vistoria(s), ${p.aproveitamento}% de aproveitamento, ${p.pontos} pontos`));
    }else{
      linhas.push('  Sem dados no período.');
    }
    linhas.push('');
    linhas.push('Ranking de avaliação de vistoria — Funcionários:');
    if(r.rankingVistoriaFuncionarios.length){
      r.rankingVistoriaFuncionarios.forEach(p=> linhas.push(`  ${p.nome}: ${p.vistorias} vistoria(s), ${p.aproveitamento}% de aproveitamento, ${p.pontos} pontos`));
    }else{
      linhas.push('  Sem dados no período.');
    }
  }

  if(r.dias===1){
    if(tem('faturamento')){
      linhas.push('');
      linhas.push(`--- LANÇAMENTOS DO DIA (${r.lancamentosDetalhados.length}) ---`);
      r.lancamentosDetalhados.forEach(l=>
        linhas.push(`  ${nomeUnidade(l.unidade)} · ${l.turno==='dia'?'Dia':'Noite'} · ${nomeCategoria(l.categoria)} · ${l.obs||'—'} · ${l.tipo==='saida'?'-':''}${fmt(l.valor)}`));
    }

    if(tem('vistorias')){
      linhas.push('');
      linhas.push(`--- AppEstado.dados.vistorias DO DIA (${r.vistoriasPeriodo.length}) ---`);
      r.vistoriasPeriodo.forEach(v=>{
        const problemas=v.itens.filter(i=>i.status==='problema').length;
        linhas.push(`  ${nomeUnidade(v.unidade)} · Suíte ${v.suite} · ${v.turno==='dia'?'Dia':'Noite'} · ${v.feitoPor} · ${problemas?problemas+' problema(s)':'OK'}`);
      });
    }

    if(tem('faltas') && r.faltasPeriodo.length){
      linhas.push('');
      linhas.push('--- AppEstado.dados.faltas DO DIA ---');
      r.faltasPeriodo.forEach(f=>{
        const func=AppEstado.dados.funcionarios.find(x=>x.id===f.funcionarioId);
        linhas.push(`  ${func?func.nome:'(removido)'} — ${f.motivo} (${f.justificada?'justificada':'não justificada'})`);
      });
    }

    if(tem('trocas') && r.trocasPeriodo.length){
      linhas.push('');
      linhas.push('--- AppEstado.dados.trocas DO DIA ---');
      r.trocasPeriodo.forEach(t=>{
        const f1=AppEstado.dados.funcionarios.find(x=>x.id===t.funcionario1Id), f2=AppEstado.dados.funcionarios.find(x=>x.id===t.funcionario2Id);
        linhas.push(`  ${t.turno==='dia'?'Dia':'Noite'}: ${f1?f1.nome:'—'} x ${f2?f2.nome:'—'} — ${t.motivo}`);
      });
    }

    if(tem('vencidos') && r.produtosVencidosPeriodo.length){
      linhas.push('');
      linhas.push('--- PRODUTOS VENCIDOS HOJE ---');
      r.produtosVencidosPeriodo.forEach(p=>
        linhas.push(`  ${nomeUnidade(p.unidade)} · ${p.produto} · ${nomeMotivoVencido(p.motivoTipo)} · qtd ${p.quantidade}${p.prejuizo?' · '+fmt(p.prejuizo):''}`));
    }

    if(tem('faturamento') && (r.boletosVencendo.length || r.contasVencendo.length)){
      linhas.push('');
      linhas.push('--- VENCENDO HOJE ---');
      r.boletosVencendo.forEach(b=> linhas.push(`  ${nomeUnidade(b.unidade)} · ${b.descricao} · ${fmt(b.valor)}`));
      r.contasVencendo.forEach(c=> linhas.push(`  ${nomeUnidade(c.unidade)} · ${nomeTipoConta(c.tipo)} — ${c.descricao} · ${fmt(c.valor)}`));
    }
  }

  const texto=linhas.join('\n');
  const msg=document.getElementById('msg-relatorio-copia');

  const avisar=(ok)=>{
    if(!msg) return;
    msg.style.color = ok ? 'var(--entrada)' : 'var(--saida)';
    msg.textContent = ok ? 'Relatório copiado!' : 'Não deu pra copiar automático — veja o texto na caixa que abriu.';
    setTimeout(()=>{ msg.textContent=''; },4000);
  };

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(()=>avisar(true)).catch(async ()=>{
      await pedirValor('Copie manualmente:', texto);
      avisar(false);
    });
  }else{
    await pedirValor('Copie manualmente:', texto);
    avisar(false);
  }
}

function desenharRede(){
  const ids=unidadesDoUsuario();
  if(ids.length<2) return;
  const datas=listaDatas();
  document.getElementById('sub-rede').textContent =
    diasPeriodo()===1 ? 'Comparação em '+dataBr(dataAtual())
      : `De ${dataBr(datas[0])} a ${dataBr(datas[datas.length-1])}`;

  const dados=ids.map(id=>{
    const m=filtrar({unidade:id,datas});
    const e=somar(m.filter(l=>l.tipo==='entrada'));
    const s=somar(m.filter(l=>l.tipo==='saida'));
    const din=somar(m.filter(l=>l.tipo==='entrada'&&l.categoria==='dinheiro'))-somarSaidasEmDinheiro(m.filter(l=>l.tipo==='saida'));
    return {id,nome:nomeUnidade(id),e,s,saldo:e-s,din};
  }).sort((a,b)=>b.saldo-a.saldo);

  const tot=dados.reduce((a,d)=>({e:a.e+d.e,s:a.s+d.s,saldo:a.saldo+d.saldo,din:a.din+d.din}),{e:0,s:0,saldo:0,din:0});

  document.getElementById('tab-rede').innerHTML =
    dados.map(d=>`<tr>
      <td>${d.nome}</td>
      <td class="n verde num">${fmt(d.e)}</td>
      <td class="n vermelho num">${fmt(d.s)}</td>
      <td class="n neutro-forte num">${fmt(d.saldo)}</td>
      <td class="n num">${fmt(d.din)}</td>
    </tr>`).join('') +
    `<tr class="separador-superior">
      <td class="neutro-forte">Total da rede</td>
      <td class="n verde num">${fmt(tot.e)}</td>
      <td class="n vermelho num">${fmt(tot.s)}</td>
      <td class="n neutro-forte num">${fmt(tot.saldo)}</td>
      <td class="n neutro-forte num">${fmt(tot.din)}</td>
    </tr>`;

  const maior=Math.max(...dados.map(d=>d.saldo),1);
  document.getElementById('graf-rede').innerHTML =
    barras(dados.map(d=>({nome:d.nome,valor:d.saldo})),maior,'e');
}
