# Changelog — aioson-design-system

Todos os releases notáveis desta skill são documentados aqui.

Formato segue [Keep a Changelog](https://keepachangelog.com/) e versionamento [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-05-09

Atualização que empacota os primitivos de layout marketing (sections, strips, grids)
que viviam apenas no `globals.css` do consumidor. Adiciona documentação de
composição de página e captura o anti-padrão card-em-card como bug oficial.

### Added

- **`assets/components/marketing-layout.css`** — primitivos de layout marketing:
  `.site-section` + `.site-section-header`, `.dual-grid`, `.surface-strip`,
  `.pipeline-strip` (com `.pipeline-track`, `.pipeline-step`, `.pipeline-companion`),
  `.terminal-card`, `.ide-row` + `.ide-card`, `.market-grid` + `.market-card` +
  variantes de tag (cyan/violet/teal/gold), `.gates-list`, `.concepts-list`,
  e overrides de tema claro. Antes esses estilos só existiam no `app/globals.css`
  do consumidor, tornando a skill incompleta para distribuição.
- **`references/page-layout.md`** — composição macro de página marketing:
  anatomia de uma landing v6, quando usar cada section primitive, regras de
  wrapping, anti-padrão card-em-card, e exemplo completo aplicado em `/developer`.
- **Princípios não-negociáveis 10 e 11** no `SKILL.md`:
  - "Strips são self-contained — NUNCA envolva em outer section"
  - "Divisor entre sections via `section + section`, não via bg outer"
- **Linha na tabela "Bugs já resolvidos"** documentando o card-em-card encontrado
  no `/developer` em produção pós-v6.

### Changed

- **Setup HTML** no `SKILL.md` agora inclui `<link rel="stylesheet" href="assets/components/marketing-layout.css" />`
  entre o chrome global e o app shell.
- **Estrutura da skill** (árvore ASCII no `SKILL.md`) atualizada para refletir
  os 2 novos arquivos.

### Migration notes

Consumidores existentes (como o próprio `aioson.com`) continuam funcionando — os
estilos no `globals.css` são compatíveis com o que está agora em
`marketing-layout.css`. Para projetos novos, basta importar a skill — não há
mais necessidade de copiar primitivos manualmente para o `globals.css`.

Anti-padrão a evitar: envolver strips primitivas em `<section className="site-section-alt">`
ou similar com bg/border outer. Ver detalhes em `references/page-layout.md`.

---

## [1.0.0] — 2026-05-06

Primeira release pública/estável da skill, consolidando o trabalho feito em `aioson.com v1` até `v6`.

### Added

- **`SKILL.md`** com YAML frontmatter, gatilhos de ativação, princípios e workflow.
- **`references/tokens.md`** — paleta completa nos dois temas, tipografia, espaçamento, radii, sombras, transições.
- **`references/theming.md`** — filosofia do dual theme, lista de adaptações por componente, padrão de toggle com persistência em `localStorage`.
- **`references/command-dock.md`** — anatomia da topbar com brand cluster, nav pills, command bar, action cluster, aurora rail e account menu (guest + logged). Inclui markup HTML completo.
- **`references/marketing-components.md`** — tracks coloridos, pipeline de squads, gates, CLI/terminal cards, pricing matrix, signal pills, mini cards.
- **`references/motion-and-effects.md`** — animações (`waveDrift`, `cmdPulse`, `blipPing`, `cmdSpin`, `menuPop`), conic gradients, glass morphism, princípios anti-slop.
- **`assets/tokens/dark.css`**, **`light.css`**, **`index.css`** — tokens em CSS custom properties.
- **`assets/components/command-dock.css`** — estilos do dock com responsivo progressivo.
- **`assets/components/aurora-rail.css`** — Aurora Rail com 3 ondas SVG e blips pulsantes.
- **`assets/components/account-menu.css`** — avatar pill + dropdown.
- **`assets/components/theme-toggle.js`** — persiste tema em `localStorage`.
- **`assets/components/account-dropdown.js`** — open/close + Esc + click outside.
- **`assets/examples/topbar-logged-dark.html`** — estado padrão (logado, dark).
- **`assets/examples/topbar-guest-light.html`** — guest no tema claro.
- **`assets/examples/full-page.html`** — landing aioson completa para validação cross-theme.

### Design decisions

- **Dual theme curado, não invertido.** Cada token tem valor pensado para os dois temas. Acentos foram recalibrados no claro (cyan→azul, gold→amber escuro, emerald escurecido) para preservar legibilidade. Justificativa: inversões automáticas geram light mode pálido e sem alma.
- **Aurora Rail substitui marquee.** Decisão tomada após o usuário sinalizar que texto rolando ficou ruim. Trocamos por 3 ondas SVG vertical-only + blips pulsantes + stats fixos. Mantém sensação de "registry vivo" sem clichê.
- **Account state via `data-auth-state` no `<body>`.** Em vez de duas topbars condicionais, uma topbar única com CSS escondendo clusters por estado. Reduz duplicação e facilita testar via Tweaks.
- **Dropdown via classe JS, não seletor de irmão.** Tentamos primeiro `.cmd-account[aria-expanded="true"] + .cmd-menu`, mas quebrou quando precisamos envolver em wrapper para `position:relative`. Padrão final: classe `.is-open` aplicada por JS é robusto a qualquer estrutura.
- **`color-mix()` como primitiva.** Em vez de manter dezenas de variantes (`--accent-30`, `--accent-soft-2`), o sistema usa `color-mix(in srgb, var(--accent) 18%, var(--border))` inline. Garante consistência e reduz tokens.
- **Tipografia bicrômica.** Inter para tudo conversacional, JetBrains Mono para tudo técnico (versões, kbd, stats numéricos, eyebrows). Cria hierarquia automática.

### Known limitations

- **`⌘K` é cosmético.** Não há command palette funcional ainda — só o input visual. Phase 2.
- **Notificações não abrem painel.** Sino tem dot pulsante mas clique é no-op. Phase 2.
- **Não cobre área logada profunda.** Esta skill é marketing + topbar/conta. Dashboards, builders, settings forms são fora de escopo. Possível Phase 3.
- **Sem variantes de role (admin vs member).** Account menu hoje é único; não diferencia owner de workspace de membro. Phase 3.
- **Não há suporte explícito a `prefers-color-scheme`.** O toggle é manual + persiste. Adicionar `prefers-color-scheme` como fallback no primeiro carregamento é trivial mas não foi feito ainda.

### Next phase

- Phase 2 (UX dinâmica): command palette `⌘K` real (modal com fuzzy search), painel de notificações, busca server-side.
- Phase 3 (área logada): dashboards, builders, role-based menus, dense data components.
- Phase 3.1 (acessibilidade): auditoria WCAG AA dos dois temas, foco visível padronizado, skip links.

---
