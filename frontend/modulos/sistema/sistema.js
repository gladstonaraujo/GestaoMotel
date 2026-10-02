/* Módulo Sistema
 * Usuários, papéis, permissões e histórico de exclusões.
 */

/* =========== USUÁRIOS E ACESSOS (só admin) =========== */
function montarCheckboxesUnidades(marcadas){
  const marcado = id => (marcadas==='todas' || (Array.isArray(marcadas)&&marcadas.includes(id))) ? 'checked' : '';
  document.getElementById('fu-unidades').innerHTML = UNIDADES.map(u=>
    `<label><input type="checkbox" value="${u.id}" ${marcado(u.id)}> ${esc(u.nome)}</label>`
  ).join('');
}

function montarCheckboxesAbas(marcadas){
  document.getElementById('fu-abas').innerHTML = TABS_DISPONIVEIS.map(t=>
    `<label><input type="checkbox" value="${t.id}" ${marcadas.includes(t.id)?'checked':''}> ${esc(t.nome)}</label>`
  ).join('');
}

function montarCheckboxesSetoresComprovantes(marcadas){
  document.getElementById('fu-setores-comprovantes').innerHTML = SETORES_COMPROVANTES.map(s=>
    `<label><input type="checkbox" class="chk-setor-comp" value="${s.id}" ${marcadas.includes(s.id)?'checked':''}> ${esc(s.nome)}</label>`
  ).join('');
}

function montarCheckboxesPermissoesFinanceiras(marcadas){
  document.getElementById('fu-permissoes-financeiras').innerHTML = PERMISSOES_FINANCEIRAS.map(p=>
    `<label><input type="checkbox" class="chk-permissao-fin" value="${p.id}" ${marcadas.includes(p.id)?'checked':''}> ${esc(p.nome)}</label>`
  ).join('');
}

function usarAbasPadrao(){
  const papel=document.getElementById('fu-papel').value;
  montarCheckboxesAbas(abasPadraoPorPapel(papel));
}

function mudarPapelForm(){
  const papel=document.getElementById('fu-papel').value;
  const bloco=document.getElementById('bloco-unidades-form');
  if(papel==='admin'){
    bloco.classList.add('oculto');
  }else{
    bloco.classList.remove('oculto');
  }
}

function limparFormUsuario(){
  document.getElementById('fu-login-original').value='';
  document.getElementById('fu-nome').value='';
  document.getElementById('fu-login').value='';
  document.getElementById('fu-senha').value='';
  document.getElementById('fu-senha').placeholder='defina uma senha';
  document.getElementById('fu-papel').value='funcionario';
  montarCheckboxesUnidades([]);
  montarCheckboxesAbas(abasPadraoPorPapel('funcionario'));
  montarCheckboxesSetoresComprovantes(setoresComprovantesPadraoPorPapel('funcionario'));
  document.getElementById('fu-escopo-comprovantes').value=escopoComprovantesPadraoPorPapel('funcionario');
  montarCheckboxesPermissoesFinanceiras([]);
  document.getElementById('fu-ve-dashboards').checked=false;
  mudarPapelForm();
  document.getElementById('titulo-form-usuario').textContent='Adicionar usuário';
  document.getElementById('btn-cancelar-usuario').classList.add('oculto');
  document.getElementById('msg-usuario').textContent='';
}

function editarUsuario(login){
  const u=AppEstado.dados.usuarios.find(x=>x.login===login);
  if(!u) return;
  document.getElementById('fu-login-original').value=u.id;
  document.getElementById('fu-nome').value=u.nome;
  document.getElementById('fu-login').value=u.login;
  document.getElementById('fu-senha').value='';
  document.getElementById('fu-senha').placeholder='deixe em branco para manter a senha atual';
  document.getElementById('fu-papel').value=u.papel;
  montarCheckboxesUnidades(u.unidades);
  montarCheckboxesAbas(abasDoUsuario(u));
  montarCheckboxesSetoresComprovantes(setoresComprovantesDoUsuario(u));
  document.getElementById('fu-escopo-comprovantes').value=escopoComprovantesDoUsuario(u);
  montarCheckboxesPermissoesFinanceiras(permissoesFinanceirasDoUsuario(u));
  document.getElementById('fu-ve-dashboards').checked=podeVerDashboardsUsuario(u);
  mudarPapelForm();
  document.getElementById('titulo-form-usuario').textContent='Editar usuário — '+u.nome;
  document.getElementById('btn-cancelar-usuario').classList.remove('oculto');
  document.getElementById('msg-usuario').textContent='';
  document.getElementById('tela-usuarios').scrollIntoView({behavior:'smooth',block:'end'});
}

async function excluirUsuario(login){
  if(login===usuario.login){
    avisar('Você não pode excluir o usuário com que está logado agora.');
    return;
  }
  const u=AppEstado.dados.usuarios.find(x=>x.login===login);
  if(!u) return;
  if(!await confirmarAcao(`Excluir o acesso de ${u.nome} (${u.login})?`)) return;
  try{
    await api('/usuarios/'+u.id, { method:'DELETE' });
  }catch(e){
    avisar(e.message);
    return;
  }
  registrarExclusao('Usuário', `${u.nome} (${u.login}) — ${rotuloPapel(u.papel)}`, null);
  await recarregarUsuarios();
  desenharUsuarios();
}

function desenharHistoricoExclusoes(){
  const cont=document.getElementById('tab-historico-exclusoes');
  if(!cont || usuario.papel!=='admin') return;

  const lista=AppEstado.dados.historicoExclusoes.slice().sort((a,b)=> a.horaCompleta<b.horaCompleta?1:-1);
  const desde=diaMenos(29);
  const noPeriodo=lista.filter(h=>h.quando>=desde);
  const porPessoa={};
  noPeriodo.forEach(h=> porPessoa[h.excluidoPor]=(porPessoa[h.excluidoPor]||0)+1);
  const pessoaMaisAtiva=Object.entries(porPessoa).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('grade-stats-exclusoes').innerHTML = `
    ${cartaoKpi({rotulo:`Exclusões registradas (total)`,valor:`${lista.length}`})}
    ${cartaoKpi({rotulo:`Nos últimos 30 dias`,valor:`${noPeriodo.length}`})}
    ${cartaoKpi({rotulo:`${pessoaMaisAtiva?'Quem mais excluiu ('+pessoaMaisAtiva[1]+')':'Ninguém excluiu ainda'}`,valor:`${esc(pessoaMaisAtiva?pessoaMaisAtiva[0]:'—')}`})}
  `;

  cont.innerHTML = lista.length ? lista.map(h=>`
    <tr>
      <td>${dataBr(h.quando)}</td>
      <td>${esc(h.excluidoPor)}</td>
      <td>${esc(h.tipo)}</td>
      <td>${esc(h.descricao)}</td>
      <td>${esc(h.unidade?nomeUnidade(h.unidade):'—')}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhuma exclusão registrada ainda.</td></tr>';
}

async function salvarUsuario(){
  const idOriginal=document.getElementById('fu-login-original').value;
  const nome=document.getElementById('fu-nome').value.trim();
  const login=document.getElementById('fu-login').value.trim().toLowerCase();
  const senha=document.getElementById('fu-senha').value;
  const papel=document.getElementById('fu-papel').value;
  const marcadas=[...document.querySelectorAll('#fu-unidades input:checked')].map(c=>c.value);
  const abasMarcadas=[...document.querySelectorAll('#fu-abas input:checked')].map(c=>c.value);
  const setoresComprovantesMarcados=[...document.querySelectorAll('.chk-setor-comp:checked')].map(c=>c.value);
  const escopoComprovantesEscolhido=document.getElementById('fu-escopo-comprovantes').value;
  const permissoesFinanceirasMarcadas=[...document.querySelectorAll('.chk-permissao-fin:checked')].map(c=>c.value);
  const podeVerDashboards=document.getElementById('fu-ve-dashboards').checked;
  const msg=document.getElementById('msg-usuario');

  if(!nome || !login || (!idOriginal && !senha)){
    msg.style.color='var(--saida)';
    msg.textContent='Preencha nome, usuário e senha.';
    return;
  }
  if(papel!=='admin' && marcadas.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma unidade para este nível de acesso.';
    return;
  }
  if(abasMarcadas.length===0){
    msg.style.color='var(--saida)';
    msg.textContent='Marque pelo menos uma aba visível pra esse usuário.';
    return;
  }

  const payload={
    nome, login, papel, todas_unidades: papel==='admin',
    unidades: papel==='admin' ? [] : marcadas,
    abas: abasMarcadas,
    pode_ver_dashboards: podeVerDashboards,
    escopo_comprovantes: escopoComprovantesEscolhido,
    secoes_comprovantes: setoresComprovantesMarcados,
    permissoes_financeiras: permissoesFinanceirasMarcadas,
  };
  if(senha) payload.senha=senha;

  try{
    if(idOriginal){
      await api('/usuarios/'+idOriginal, { method:'PUT', body: JSON.stringify(payload) });
    }else{
      await api('/usuarios', { method:'POST', body: JSON.stringify(payload) });
    }
    await recarregarUsuarios();
  }catch(e){
    msg.style.color='var(--saida)';
    msg.textContent=e.message;
    return;
  }

  if(idOriginal && usuario.id===idOriginal){
    // editou o próprio usuário logado — atualiza os dados usados na tela agora mesmo
    // (o token continua com as permissões antigas até o próximo login)
    const atualizado=AppEstado.dados.usuarios.find(u=>u.id===idOriginal);
    if(atualizado) usuario=atualizado;
  }

  msg.style.color='var(--entrada)';
  msg.textContent=(idOriginal?'Usuário atualizado: ':'Usuário criado: ')+nome+'.';
  limparFormUsuario();
  desenharUsuarios();
  atualizarCabecalho();
}

function desenharUsuarios(){
  document.getElementById('tab-usuarios').innerHTML = AppEstado.dados.usuarios.map(u=>{
    const unidadesTxt = u.unidades==='todas' ? 'Todas as unidades' : u.unidades.map(nomeUnidade).join(', ');
    const voceTxt = u.login===usuario.login ? '<span class="voce-selo">(você)</span>' : '';
    const minhasAbas=abasDoUsuario(u);
    const nomesAbas=minhasAbas.map(id=>{
      const t=TABS_DISPONIVEIS.find(x=>x.id===id);
      return t?t.nome:id;
    });
    const abasTxt = `<span title="${nomesAbas.join(', ')}">${minhasAbas.length} aba(s)</span>`;
    const dashTxt = podeVerDashboardsUsuario(u)
      ? '<span class="selo-status pago">Vê</span>'
      : '<span class="selo-status atrasado">Não vê</span>';
    const minhasPermissoesFin=permissoesFinanceirasDoUsuario(u);
    const nomesPermissoesFin=minhasPermissoesFin.map(id=>{
      const p=PERMISSOES_FINANCEIRAS.find(x=>x.id===id);
      return p?p.nome:id;
    });
    const finTxt = minhasPermissoesFin.length
      ? `<span class="selo-status pago" title="${nomesPermissoesFin.join(', ')}">${minhasPermissoesFin.length} permissão(ões)</span>`
      : '<span class="selo-status atrasado">Nenhuma</span>';
    return `<tr>
      <td>${esc(u.nome)}${voceTxt}</td>
      <td>${esc(u.login)}</td>
      <td><span class="selo-papel ${u.papel}">${rotuloPapel(u.papel)}</span></td>
      <td>${unidadesTxt}</td>
      <td>${abasTxt}</td>
      <td class="n">${dashTxt}</td>
      <td class="n">${finTxt}</td>
      <td class="n">
        <button class="btn-mini" data-click="editarUsuario('${escArg(u.login)}')">Editar</button>
        ${u.login!==usuario.login?` <button class="btn-mini" data-click="excluirUsuario('${escArg(u.login)}')">Excluir</button>`:''}
      </td>
    </tr>`;
  }).join('');
}
