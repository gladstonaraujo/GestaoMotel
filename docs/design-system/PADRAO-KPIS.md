# Guia de Padrão Visual: Cards e KPIs

Este documento define o padrão oficial para exibição de métricas (KPIs) no sistema, idêntico ao modelo consolidado no `/painel` e `/consumo-plantao`.

---

## 1. Estrutura HTML do Container

O container deve sempre utilizar a classe `.kpis` com o atributo `aria-live="polite"` para acessibilidade.

```html
<!-- Container padrão de KPIs (grid responsivo: 3 colunas desktop, 2 colunas mobile/tablet) -->
<div class="kpis" id="grade-stats-modulo" aria-live="polite"></div>
```

> **Atenção:** Evite aninhar `.kpis` dentro de elementos com largura comprimida desnecessária. Quando estiver dentro de um `.painel`, mantenha espaçamento inferior com `u-mb-16`.

---

## 2. Função Helper JavaScript: `cartaoKpi(...)`

A função utilitária global está localizada em [`frontend/core/ui.js`](file:///d:/Developer/Projects/Anderson/Motel/frontend/core/ui.js):

```javascript
cartaoKpi({
  rotulo: 'Nome da Métrica',          // String: texto em caixa alta (uppercase automático)
  valor: '123' ou 'R$ 1.500,00',     // String: valor formatado principal
  classeValor: '',                    // 'positivo' | 'negativo' | 'verde' | 'vermelho' (opcional)
  destaque: false,                   // Boolean: true aplica gradiente nobre de destaque
  delta: '',                          // String: badge de variação (ex.: variacaoKpi(...) ou '')
  apoio: 'texto de apoio / rodapé',  // String: contexto ou comparação no rodapé
  grafico: ''                         // String SVG: mini-gráfico sparkline (opcional)
})
```

---

## 3. Padrões de Uso

### A) Card Principal em Destaque (`destaque: true`)
Utilizado para o KPI de maior peso na tela (ex.: *Saldo da rede*, *Total faturado*, *Itens consumidos (total)*):
```javascript
cartaoKpi({
  rotulo: 'Itens consumidos (total)',
  valor: String(totalItens),
  classeValor: 'positivo',
  destaque: true,
  apoio: `média de ${mediaPorPlantao} item(ns) por plantão`
})
```

### B) Card Padrão com Apoio Informativo
Utilizado para contagens, registros e volumes:
```javascript
cartaoKpi({
  rotulo: 'Plantões registrados',
  valor: String(lista.length),
  apoio: `Dia ${plantoesDia} · Noite ${plantoesNoite}`
})
```

### C) Card de Desempenho / Média / Indicador
Utilizado para médias, taxas e indicadores percentuais:
```javascript
cartaoKpi({
  rotulo: 'Média por plantão',
  valor: mediaPorPlantao,
  apoio: 'itens consumidos / plantão'
})
```

### D) Card Financeiro com Valores e Variação (`delta`)
```javascript
cartaoKpi({
  rotulo: 'Entradas',
  valor: fmt(atual.entradas),
  classeValor: 'verde',
  delta: variacaoKpi(atual.entradas, anterior.entradas, true),
  apoio: 'vs período anterior'
})
```

---

## 4. Classes CSS Aplicadas (`styles.css`)

- **`.kpis`**:
  - Desktop: `grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;`
  - Tablet/Mobile (≤768px): `grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px;`
- **`.kpi`**:
  - Container inline: `background: var(--card); border: 1px solid var(--line); border-radius: var(--raio); padding: 18px 20px 16px; box-shadow: var(--sombra-1);`
- **`.kpi-destaque`**:
  - Destaque nobre: `background: var(--destaque-kpi-bg); color: #fff; box-shadow: var(--sombra-3);`
- **Cores de Valor (`.kpi-valor`)**:
  - `.positivo` ou `.verde`: `color: var(--entrada);`
  - `.negativo` ou `.vermelho`: `color: var(--saida);`
- **Badges de Variação (`.kpi-delta`)**:
  - `.bom`: `background: var(--entrada-fraca); color: var(--entrada);`
  - `.ruim`: `background: var(--saida-fraca); color: var(--saida);`
  - `.neutro`: `background: var(--bg-pill); color: var(--slate);`
