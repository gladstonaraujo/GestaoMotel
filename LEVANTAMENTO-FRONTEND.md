# Levantamento do front-end atual e plano de modularização

Data: 2026-10-01. Base: `frontend/index.html` (1.626 linhas), `frontend/script.js` (5.059 linhas), `frontend/styles.css` (322 linhas).

## Como o front funciona hoje

- **Uma página só.** O `index.html` contém as 19 telas (`<section id="tela-...">`) e o login. A troca de aba (`abrir()`) só mostra/esconde as seções.
- **Um script global.** Tudo é função e variável global (`let LANCAMENTOS`, `let BOLETOS`… 20+ arrays de estado). ~230 funções, sem módulos.
- **Redesenho total.** `desenhar()` redesenha **todas as abas** a cada mudança, inclusive as que não estão visíveis (as de admin também). Isso pesa e acopla tudo.
- **Handlers inline.** 71 `onclick=` no HTML e 41 dentro de strings de template no script; as funções precisam ser globais.
- **Estilo inline.** 134 atributos `style="..."` no HTML. O `styles.css` tem só 322 linhas e variáveis de cor (bom ponto de partida para tema).
- **Duplicação de mapeamento.** Para cada entidade há um par `xApiParaLocal` / `recarregarX` (lançamentos, boletos, funcionários, faltas, vistorias…) com o mesmo padrão repetido ~16 vezes.
- **Sessão.** Token JWT em `localStorage`; o cliente da API (`api()`) já é isolado e reaproveitável.

## Problema novo encontrado: falta de escape de HTML (XSS)

O script monta a tela com `innerHTML` e templates, e **não existe nenhuma função de escape**. Há pelo menos 79 interpolações de texto digitado por usuários (descrição, observação, motivo, nome, produto, serviço) direto no HTML.

**Cenário:** um funcionário cadastra uma observação com código HTML/JavaScript; quando o diretor abre o extrato ou o relatório, o código roda no navegador dele, com o token de login disponível em `localStorage`. Isso permite agir como o diretor.

**Correção:** no novo front, toda interpolação passa por uma função `esc()` (ou por `textContent`/`createElement`), e o backend limita o tamanho dos textos (já iniciado). Vale incluir no `ANALISE-PROBLEMAS.md` e no relatório do cliente como item de urgência alta.

## Mapa das telas (módulos propostos)

| Módulo | Aba(s) hoje | Trecho do `script.js` | Quem vê |
|---|---|---|---|
| **Painel** | Painel, alertas | 1049–1260, 1689–1780 | todos (alertas: admin) |
| **Caixa** | Lançar movimento, Extrato, Comprovantes, Fechamento (parceladas) | 1259–1690, 4662–4785 | todos |
| **Vistorias** | Vistoria de suítes + checklist (admin) | 1781–2280 | todos |
| **Boletos** | Boletos e Pix, Impostos e Energia (contas fixas) | 2280–2609 | gerente/admin |
| **Pessoas** | Funcionários, faltas, troca de plantão | 2609–2998 | gerente/admin |
| **Estoque** | Produtos vencidos | 2998–3137 | gerente/admin |
| **Desempenho** | RevPAR, config. de suítes, Comparativo da rede | 3137–3428, 5018–fim | conforme papel |
| **Manutenção** | Manutenção de terceiros | 3428–3562 | todos |
| **Plantão** | Consumo do plantão | 3562–3689 | todos |
| **Administrativo** | Boletos admin, Notas fiscais, Relatório | 3689–4662 | admin |
| **Sistema** | Usuários e acessos, Histórico de exclusões | 4785–5018 | admin |

Núcleo compartilhado (sai do monólito): cliente da API (1–40), mapeadores API→local (39–460), erros na tela (467–550), dados base e permissões (552–765), upload/visualização de foto (766–850), utilidades (851–866), modais (867–896), login/sessão (897–1017).

## Estrutura proposta (JS puro, módulos ES, sem build)

```
frontend/
  index.html              -> só a casca: topo, menu, área de conteúdo, login
  core/
    api.js                -> fetch + token + tratamento de 401/erros
    estado.js             -> usuário logado, unidade e data selecionadas
    roteador.js           -> rota por hash (#/boletos), carrega o módulo sob demanda
    permissoes.js         -> abas por papel, permissões financeiras
    ui.js                 -> esc(), modais (confirmar/avisar/pedir), toasts, formatação
    fotos.js              -> upload e exibição de fotos (já com login)
  modulos/
    caixa/  (view.js, caixa.css, api.js)
    boletos/ vistorias/ pessoas/ estoque/ desempenho/ ...
  estilos/
    tokens.css            -> cores, espaçamento, tipografia, tema claro/escuro
    base.css  componentes.css
```

Regras do novo front:
- Cada módulo exporta `montar(container)` e `desmontar()`; só a tela aberta é desenhada e só os dados dela são buscados.
- Sem `onclick` inline: eventos ligados no módulo (`addEventListener`/delegação).
- Todo texto de usuário passa por `esc()`.
- Rotas por hash, então cada tela tem endereço próprio e o botão "voltar" funciona.
- Fotos servidas por rota autenticada (resolve o item 2 do relatório).

## Redesign (direção escolhida: moderno, limpo e responsivo)

- Menu lateral no desktop; barra inferior com as abas principais e menu "mais" no celular/tablet.
- Cabeçalho com unidade e data sempre visíveis; cards e tabelas consistentes; formulários com validação na hora.
- Tema claro com opção escuro, a partir das variáveis de cor que já existem.
- Prioridade para uso em tablet/celular na recepção (alvos de toque grandes, poucos cliques para lançar).

## Ordem de migração

1. **Base:** casca nova, `core/`, tokens de estilo, login e roteador. O front antigo continua acessível (por exemplo em `/legado/`) até o fim.
2. **Caixa** (lançar, extrato, comprovantes): é o mais usado e o que mais cobre as regras de permissão.
3. **Painel**, depois **Boletos**, **Vistorias**, **Pessoas**, **Estoque**, **Plantão**, **Manutenção**.
4. **Desempenho** e **Administrativo/Sistema** (são os mais pesados em gráficos e relatórios).
5. Remover o front antigo quando todas as telas estiverem migradas e validadas pelo cliente.

Cada etapa termina com o módulo funcionando contra o backend real e conferido pelo usuário antes de seguir.

## Riscos e cuidados

- Regras de negócio estão misturadas ao desenho (por exemplo, parcelas e rateio dentro de `salvarLancamento`, ~140 linhas). Ao migrar, extrair a regra para funções puras e testar.
- O backend precisa de poucos ajustes: um endpoint autenticado para fotos e, se possível, endpoints que devolvam os dados já agregados (para não depender dos mapeadores do front).
- Migrar tela por tela evita parar a operação: o cliente usa o sistema todos os dias.
