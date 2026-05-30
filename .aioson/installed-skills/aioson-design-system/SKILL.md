---
name: aioson-design-system
description: Use this skill when designing or implementing UI for aioson.com (registry de squads, genomes e skills de IA). Trigger whenever the user asks for a topbar, navigation, command bar, theme toggle, dark/light variants, account dropdown, marketing landing sections, terminal/CLI cards, pipeline/gate components, or anything that should match the aioson.com visual identity. Provides design tokens (dual dark+light), the Command Dock pattern, Aurora Rail, Account Menu (guest+logged), motion guidelines, and standalone HTML examples.
---

# AIOSON Design System

Sistema de design do **aioson.com** — registry de squads, genomes e skills de IA. Cobre a topbar (Command Dock), o sistema dual de tema (escuro+claro com a mesma alma), o Account Menu logado, a Aurora Rail (substituto do marquee tradicional), componentes de marketing (Tracks, Pipeline, Gates, Terminal/CLI, Pricing) e diretrizes de motion.

Versão consolidada após as iterações `aioson.com v1` → `v6`. Todos os componentes desta skill foram extraídos do `v6` em produção, com correções de bugs reais (sobreposição de ícones, dropdowns sem z-index, ondas SVG cortando texto).

> **Status atual:** estável — pronto para uso em features novas e refactors
> **Versão:** 1.1.0

---

## Quando usar esta skill

- Implementar a **topbar** do aioson.com (Command Dock + Aurora Rail)
- Adicionar **toggle de tema** dark↔light que persista entre sessões
- Construir o **menu de conta logada** (avatar + dropdown com Dashboard, Assinaturas, Área de membros, Workspace, Configurações, Logout)
- Criar uma **landing/marketing page** seguindo o sistema (hero com terminal, tracks coloridos, pipeline de squads, pricing matrix)
- Adicionar componentes de **CLI/terminal** estilizados que mantêm fundo escuro mesmo em tema claro
- Validar se uma tela existente está aderente aos tokens e padrões aioson
- Definir **motion** (auroras, conic gradients, blip pings) sem cair em slop

## Quando NÃO usar esta skill

- Sites/apps fora do ecossistema aioson — esta skill é específica da identidade aioson.com
- Documentação técnica pura/blogs — use um sistema editorial mais sóbrio

A skill agora cobre **todo o produto aioson**: marketing, área logada, dashboards, área de membros, painéis admin e marketplace. Use o **App Shell unificado** (`assets/components/app-shell.css`) + **componentes de dados** (`assets/components/data-components.css`) para qualquer página de produto.

---

## Conceitos arquiteturais centrais

Quatro conceitos fundamentam o sistema. Os agentes consumidores devem entender os quatro antes de implementar qualquer coisa.

### 1. Dual theme com a mesma alma (não inversão automática)

O sistema **não usa** `prefers-color-scheme` puro nem inversão de cores. Cada tema é curado: o tema claro **não é** o escuro com fundo trocado. Acentos são recalibrados (cyan `#5ec8ff` → azul `#1f8aff` no claro, para legibilidade), gradientes são re-pensados, e elementos como o terminal/CLI **mantêm fundo escuro nos dois temas** para criar contraste.

Detalhes completos em `references/theming.md`.

### 2. Command Dock como padrão de topbar

Topbar do aioson não é nav simples. É um **dock** com 3 zonas em grid (`auto minmax(0,1fr) auto`):

```
┌─────────────────────────────────────────────────────────────┐
│ [Brand cluster]  [Nav pills + Cmd bar ⌘K]  [Actions cluster] │
└─────────────────────────────────────────────────────────────┘
                          │
                  [Aurora Rail abaixo]
```

Cada zona tem responsabilidade clara, e as zonas têm **separadores visuais** (border-right no brand, divider antes do CTA). Detalhes em `references/command-dock.md`.

### 3. Aurora Rail (substituto do marquee)

Faixa horizontal logo abaixo do dock que **não rola texto** (anti-slop). Em vez disso, três ondas SVG (cyan/violet/teal) se expandem verticalmente em loop, com micro-blips pulsantes ao lado de stats fixos do registry. Resolve "preciso comunicar atividade viva" sem cair no clichê do `<marquee>` rolando.

Detalhes em `references/command-dock.md` (seção Aurora Rail).

### 4. Account state binário no `<body>`

Estado de auth controlado por `data-auth-state="guest" | "logged"` no `<body>`. CSS esconde/mostra os clusters apropriados — **não** há duas topbars renderizadas. O dropdown logado abre via `[data-account-toggle]` + classe `.is-open` no menu (não use seletor de irmão `+` — quebra com wrappers).

Detalhes em `references/command-dock.md` (seção Account Menu).

---

## Setup em projeto consumidor

```html
<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

  <!-- Tokens (dark + light) -->
  <link rel="stylesheet" href="assets/tokens/index.css" />

  <!-- Chrome global -->
  <link rel="stylesheet" href="assets/components/command-dock.css" />
  <link rel="stylesheet" href="assets/components/aurora-rail.css" />
  <link rel="stylesheet" href="assets/components/account-menu.css" />

  <!-- Marketing layout — sections + strips + grids (landing pages) -->
  <link rel="stylesheet" href="assets/components/marketing-layout.css" />

  <!-- App shell (sidebar + content) e componentes de dados — para páginas internas -->
  <link rel="stylesheet" href="assets/components/app-shell.css" />
  <link rel="stylesheet" href="assets/components/data-components.css" />
</head>
<body data-auth-state="logged">
  <!-- Markup do dock — ver references/command-dock.md -->

  <script src="assets/components/theme-toggle.js"></script>
  <script src="assets/components/account-dropdown.js"></script>
</body>
</html>
```

A página inicia em **tema escuro** por padrão. O `theme-toggle.js` lê `localStorage.getItem('aioson-theme')` no boot e aplica o último tema escolhido pelo usuário.

---

## Documentação detalhada (references/)

| Arquivo | Quando consultar |
|---------|------------------|
| `references/tokens.md` | Tabela completa de cores, tipografia, espaçamento, sombras, transições — para os dois temas. Use ao escolher um valor de cor/spacing/radius. |
| `references/theming.md` | Filosofia do dual theme, lista de adaptações por componente, padrão de toggle, persistência. Use ao implementar light mode em um componente novo. |
| `references/command-dock.md` | Anatomia completa do dock: brand cluster, nav pills, command bar, action cluster, aurora rail, account menu (guest + logged). HTML markup completo. |
| `references/marketing-components.md` | Tracks, pipeline, gates, CLI/terminal, pricing matrix, signal pills, mini cards. Use ao construir uma landing aioson. |
| `references/page-layout.md` | Composição macro de página marketing — sections + strips + grids, regras de wrapping, anti-padrão card-em-card. **Leia antes de montar uma página nova ou adicionar componentes em uma existente.** |
| `references/motion-and-effects.md` | Animações (waveDrift, cmdPulse, blipPing, cmdSpin, menuPop), conic gradients, glass morphism, princípios anti-slop. Use ao adicionar movimento. |
| `references/app-shell.md` | App shell unificado (Command Dock + sidebar contextual + content). Use para qualquer página interna: dashboard, área de membros, admin, marketplace. |
| `references/data-components.md` | Stat cards, data tables, form fields, status pills, empty state, skeleton, toast, modal, drawer, billing/plan cards. Use ao construir qualquer tela de produto. |

---

## Estrutura da skill

```
aioson-design-system/
├── SKILL.md                                 ✅
├── CHANGELOG.md                             ✅
│
├── references/
│   ├── tokens.md                            ✅ Tokens dual completos
│   ├── theming.md                           ✅ Dual theme philosophy + toggle
│   ├── command-dock.md                      ✅ Topbar completa
│   ├── marketing-components.md              ✅ Tracks/pipeline/gates/CLI
│   ├── page-layout.md                       ✅ Composição de página + anti-padrões
│   └── motion-and-effects.md                ✅ Animações + glass + anti-slop
│
└── assets/
    ├── tokens/
    │   ├── dark.css                         ✅ Variáveis [data-theme="dark"]
    │   ├── light.css                        ✅ Variáveis [data-theme="light"]
    │   └── index.css                        ✅ Importa ambos + base
    │
    ├── components/
    │   ├── command-dock.css                 ✅ Dock + nav + cmd-bar + actions
    │   ├── aurora-rail.css                  ✅ Aurora rail + waves + blips
    │   ├── account-menu.css                 ✅ Avatar pill + dropdown
    │   ├── marketing-layout.css             ✅ Sections + strips + grids
    │   ├── theme-toggle.js                  ✅ Persiste em localStorage
    │   └── account-dropdown.js              ✅ Open/close + Esc + click outside
    │
    └── examples/
        ├── topbar-logged-dark.html          ✅ Estado padrão "Teste Premium" Pro
        ├── topbar-guest-light.html          ✅ Tema claro + Login/Criar conta
        └── full-page.html                   ✅ Landing completa para validar tudo
```

---

## Princípios não-negociáveis

1. **Tema claro não é tema escuro invertido.** Cada token tem seu valor curado nos dois temas. Nunca use `filter: invert()` ou auto-conversões. Veja `references/theming.md`.

2. **Terminal/CLI são sempre escuros.** Mesmo no tema claro, terminais mantêm fundo `#0e1320` para criar contraste rico. Trocar isso quebra a identidade.

3. **`color-mix()` é a primitiva de cor.** Para variações soft/hover/border, use `color-mix(in srgb, var(--accent) 18%, var(--border))` ao invés de inventar novos hex. Garante coerência cross-theme.

4. **Aurora Rail nunca é texto rolando.** Se precisar comunicar atividade, use blips pulsantes + stats fixos. Marquee horizontal de texto é proibido — é o anti-padrão que esta skill substitui.

5. **Dropdowns precisam de `z-index ≥ 200`.** O dock fica em `z-index:60` e a aurora em `z-index:0`; o menu da conta precisa pousar acima de tudo, inclusive de cards do hero. Já encontramos esse bug — não repita.

6. **Em `.cmd-actions`, todo filho leva `flex-shrink:0`.** Sem isso, em viewports ~1280px os ícones invadem o campo de busca. Esse foi o segundo bug recorrente.

7. **Nav, busca e ⌘K colapsam progressivamente.** ≤1320px esconde `⌘K` kbd. ≤1180px esconde nome+email do avatar (fica só avatar+chip+chevron). ≤1024px esconde nav inteira. ≤720px o `.cmd-center` quebra para a 2ª linha. Veja `references/command-dock.md`.

8. **Nada de emoji decorativo.** O sistema é técnico/sóbrio. Use ícones SVG inline com `currentColor`. Ver coleção em `references/command-dock.md`.

9. **`Inter` para UI, `JetBrains Mono` para metadados técnicos** (versão, status, kbd, eyebrow labels, stats numéricos). Nunca o inverso. **Variáveis corretas: `--font-body` e `--font-mono` — nunca `--font-sans`** (não existe; cai no fallback serif e quebra a tipografia).

10. **Strips são self-contained — NUNCA envolva em outer section.** Componentes como `<PipelineStrip />`, `<TerminalPreview />`, `<MultiIdeStrip />`, `<GatesGrid />` já renderizam um `<section>` próprio com padding + border-top. Envolvê-los em outro `<section className="site-section-alt">` (ou similar com bg/border) cria card-em-card. Renderize direto no shell. Detalhes em `references/page-layout.md`.

11. **Divisor entre sections via `section + section`, não via bg outer.** A separação visual entre seções adjacentes vem do seletor `.site-section + .site-section { border-top: 1px solid... }`. Não crie sections com background/border-top/border-bottom próprios — esse é o anti-padrão que gera "faixa que vira card".

---

## Workflow ao receber pedido

Quando um agente recebe uma tarefa relacionada a essa skill, deve seguir esta ordem:

1. **Identifique a zona afetada.** É topbar (dock)? Aurora rail? Account menu? Tema? Marketing? Cada zona tem um reference dedicado.

2. **Confira tokens primeiro.** Antes de escolher uma cor/spacing/radius, abra `references/tokens.md`. Quase sempre o token já existe.

3. **Para temas, sempre os dois ao mesmo tempo.** Toda regra CSS de cor/sombra/borda precisa ter sua contraparte em `[data-theme="light"]`. Não deixe "ajusto depois".

4. **Use os exemplos como ponto de partida.** Os arquivos em `assets/examples/` são copiáveis — abra o que mais se aproxima do pedido e adapte.

5. **Valide nos dois temas + 3 viewports.** Antes de entregar: dark+light em 1440px, 1280px, 720px. Os bugs recorrentes (sobreposição, overflow, z-index) só aparecem fora de 1440.

6. **Se for adicionar um componente novo**, atualize:
   - `references/<categoria>.md` com a anatomia
   - `assets/components/<nome>.css` com o estilo
   - `assets/examples/<exemplo>.html` mostrando isolado
   - `CHANGELOG.md` com `Added`

---

## Bugs já resolvidos (não repetir)

Esta skill carrega cicatriz de bugs reais encontrados durante v1→v6. Cada um virou um princípio:

| Bug encontrado em | Sintoma | Causa raiz | Fix permanente |
|---|---|---|---|
| v6 (1ª iter) | Ícones de sino/tema sobrepostos ao campo busca | Filhos de `.cmd-actions` sem `flex-shrink:0` + grid `auto 1fr auto` sem `minmax(0,1fr)` | Princípio 6 + responsivo progressivo |
| v6 (1ª iter) | Aurora rail com ondas em cima do texto | SVG sem `z-index` explícito + conteúdo sem stacking context | `.cmd-aurora { isolation:isolate }` + wave em `z-index:0`, conteúdo em `z-index:2` |
| v6 (1ª iter) | Dropdown da conta abria mas vazio/atrás | Seletor `+` não casava com wrapper + `z-index:80` insuficiente | Classe `.is-open` via JS + `z-index:200` |
| v6 (final) | Dropdown abria mas era recortado pelo dock | `.cmd-dock` com `overflow:hidden` + `isolation:isolate` criava stacking context que prendia o menu dentro | `overflow:visible` no dock; pseudos `::before/::after` com `border-radius:inherit` + `z-index:0` para confinar visualmente; menu com `z-index:9999` |
| v6 (2ª iter) | Ondas começavam recuadas da borda | `padding: 0 22px` no pai + SVG com `left:0;right:0` (resp. ao content-box) | SVG em `inset:0` e `width:100%` (cobre padding) |
| v5 → v6 | Marquee rolando texto = sloppy | Marquee horizontal de texto é anti-padrão moderno | Aurora Rail substitui (princípio 4) |
| pós-v6 (consumidor `aioson.com`) | Card-em-card no `/developer`: pipeline + terminal + multi-ide visualmente "presos" dentro de uma moldura externa | Strips primitivos envolvidos em `<section className="site-section-alt">` que tinha `bg + border-top + border-bottom` próprios. Cada strip já é uma section completa — duplicação criou hierarquia visual confusa. | Princípios 10 + 11: strips são self-contained, nunca envolva. Divisor entre sections via `section + section { border-top }`. `.site-section-alt` virou alias de `.site-section` (sem bg outer). Padrão completo em `references/page-layout.md`. |

---

## Próximos passos sugeridos (não-bloqueantes)

- **Phase 2:** comando palette `⌘K` realmente funcional (modal com fuzzy search por squads/genomes/skills)
- **Phase 2:** notificações com painel lateral ao clicar no sino
- **Phase 3:** variantes de account menu para owner de workspace (admin) vs membro
