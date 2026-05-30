# Command Dock — aioson-design-system

Topbar do aioson.com. Não é uma nav simples — é um **dock** com 3 zonas em grid + Aurora Rail logo abaixo. Inclui dois estados de auth: guest (Login + Criar conta) e logged (Avatar + dropdown).

---

## Anatomia (visão geral)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌─Brand─┐  │ ┌─Nav pills──┐  ┌─Cmd bar ⌘K────────┐ │ ┌─Actions──────┐  │
│  │ Logo  │  │ │ Início···  │  │ 🔍 buscar...  ⌘K │ │ │ 🔔 ☾  Avatar▾ │  │
│  └───────┘  │ └────────────┘  └───────────────────┘ │ └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
   ╲ ╱  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ~  ╱╲
   • registry online   • 248 squads   • 1.4k genomes   • 3.2k skills    →
```

Zonas:
1. **Brand cluster** (esq) — logo + nome + versão + status dot
2. **Center cluster** (meio) — nav pills + command bar (⌘K)
3. **Actions cluster** (dir) — sino, theme toggle, divider, login/cta OU account pill

Logo abaixo: **Aurora Rail** — faixa visual com 3 ondas SVG e blips pulsantes.

---

## Grid e responsivo

```css
.cmd-dock {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px;
}
```

**`minmax(0, 1fr)` é obrigatório** — sem ele, filhos longos (avatar com nome+email+chip) forçam overflow horizontal.

### Breakpoints

| Viewport | Comportamento |
|----------|---------------|
| ≥ 1320px | Estado completo |
| ≤ 1320px | Esconde `kbd ⌘K` no cmd-bar |
| ≤ 1180px | Esconde nome+email do avatar (fica avatar+chip+chev). Esconde nav items marcados `cmd-nav-item-hide` (Genomes, Store) |
| ≤ 1024px | Esconde nav inteira; cmd-bar reduz `min-width:120px` |
| ≤ 720px | `.cmd-center` quebra para a 2ª linha; esconde Login + divider + Aurora Rail |

---

## Brand cluster

```html
<div class="cmd-brand">
  <span class="cmd-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#brand-grad)" stroke-width="1.7" stroke-linecap="round">
      <defs><linearGradient id="brand-grad" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0" stop-color="#5ec8ff"/><stop offset="1" stop-color="#7a6cff"/>
      </linearGradient></defs>
      <circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>
      <line x1="12" y1="6" x2="12" y2="12"/>
      <circle cx="6" cy="12" r="1.5" fill="#5ec8ff" stroke="none"/>
      <circle cx="18" cy="12" r="1.5" fill="#7a6cff" stroke="none"/>
      <circle cx="12" cy="20" r="1.5" fill="#7a6cff" stroke="none"/>
    </svg>
  </span>
  <div class="cmd-brand-info">
    <span class="cmd-brand-title">
      aioson<span style="color:var(--accent)">.</span>com
      <span class="cmd-brand-version">v0.1</span>
    </span>
    <span class="cmd-brand-sub">
      <span class="cmd-status-dot"></span> registry · online
    </span>
  </div>
</div>
```

### `.cmd-mark` (logo holder)
- 44×44px, radius 14
- Gradient escuro + halo conic-gradient girando (animação `cmdSpin 9s linear infinite`)
- Border accent 40%, box-shadow com glow violet

### `.cmd-brand-version`
- Pílula mono, fontes 0.6rem, letter-spacing 0.14em uppercase
- Background violet soft

### `.cmd-status-dot`
- 7×7px, emerald
- Animação `cmdPulse` (ver `motion-and-effects.md`)

---

## Center cluster (nav + cmd bar)

```html
<div class="cmd-center">
  <div class="cmd-nav" role="tablist">
    <button class="cmd-nav-item" aria-current="page" type="button">
      <span class="cmd-nav-glyph"><!-- svg home --></span>
      Início
    </button>
    <button class="cmd-nav-item" type="button">
      <span class="cmd-nav-glyph"><!-- svg users --></span>
      Squads
    </button>
    <button class="cmd-nav-item cmd-nav-item-hide" type="button">
      <span class="cmd-nav-glyph"><!-- svg dna --></span>
      Genomes
    </button>
    <button class="cmd-nav-item" type="button">
      <span class="cmd-nav-glyph"><!-- svg check-circle --></span>
      Skills
    </button>
    <button class="cmd-nav-item cmd-nav-item-hide" type="button">
      <span class="cmd-nav-glyph"><!-- svg shop --></span>
      Store
      <span class="cmd-nav-badge">new</span>
    </button>
    <button class="cmd-nav-item" type="button">
      <span class="cmd-nav-glyph"><!-- svg doc --></span>
      Docs
    </button>
  </div>

  <label class="cmd-bar" aria-label="Buscar no registry">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>
    </svg>
    <input class="cmd-bar-input" type="text" placeholder="aioson › buscar squad, genome ou skill…" />
    <span class="cmd-bar-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
  </label>
</div>
```

### Nav pills
- Container com background dark soft, border, padding 4
- Item ativo: `aria-current="page"` → gradient soft accent + box-shadow glow
- Itens com `cmd-nav-item-hide` somem em ≤1180px
- Badge "new" em mono, gold soft

### Command bar (`.cmd-bar`)
- Altura 38px, radius 12
- Background dark soft, border accent 14%
- Hover/focus: border accent 38%, box-shadow ring soft
- `kbd ⌘K` somem em ≤1320px

---

## Actions cluster (estado guest)

```html
<div class="cmd-actions" data-auth-cluster>
  <button class="cmd-icon-btn" type="button" aria-label="Notificações">
    <!-- svg bell -->
    <span class="cmd-icon-dot"></span>
  </button>
  <button class="cmd-icon-btn" type="button" aria-label="Alternar tema" data-theme-toggle>
    <svg class="cmd-theme-moon" ...><!-- lua --></svg>
    <svg class="cmd-theme-sun" style="display:none" ...><!-- sol --></svg>
  </button>
  <span class="cmd-divider" aria-hidden="true"></span>
  <a href="#" class="cmd-login">Login</a>
  <a href="#" class="cmd-cta">
    Criar conta
    <svg class="cmd-cta-arrow" ...><!-- arrow → --></svg>
  </a>
</div>
```

### `.cmd-icon-btn`
- 36×36, radius 11
- Hover: border accent 32%, lift `-1px`
- `.cmd-icon-dot`: badge 7×7 em accent-3, indicador de notificação

### `.cmd-cta` (Criar conta)
- Gradient `accent → accent-2`
- Shine effect no hover (pseudo `::before` desliza)
- Arrow SVG escorrega 2px na direção do hover

### `.cmd-divider`
- 1px×22px, slate sutil, separador antes do CTA

> **Princípio crítico:** todo filho de `.cmd-actions` precisa `flex-shrink:0`. Sem isso, em ~1280px os ícones invadem o cmd-bar (bug recorrente).

---

## Account pill + dropdown (estado logged)

Substitui Login/CTA quando `<body data-auth-state="logged">`.

```html
<div style="position:relative">
  <button class="cmd-account" type="button" aria-expanded="false" aria-haspopup="menu" data-account-toggle>
    <span class="cmd-avatar" aria-hidden="true">
      <span class="cmd-avatar-inner">TP</span>
    </span>
    <span class="cmd-account-info">
      <span class="cmd-account-name">Teste Premium</span>
      <span class="cmd-account-mail">teste@teste.com</span>
    </span>
    <span class="cmd-account-plan">Pro</span>
    <svg class="cmd-account-chev" ...><!-- chevron down --></svg>
  </button>

  <div class="cmd-menu" role="menu" data-account-menu>
    <div class="cmd-menu-head">
      <span class="cmd-menu-avatar"><span>TP</span></span>
      <div class="cmd-menu-meta">
        <span class="name">Teste Premium</span>
        <span class="mail">teste@teste.com</span>
        <div class="cmd-menu-plan-row">
          <span class="cmd-account-plan">Pro · ativo</span>
          <span>renova 12 jun</span>
        </div>
      </div>
    </div>

    <a class="cmd-menu-item" href="#" role="menuitem">
      <span class="ic"><!-- svg dashboard --></span>
      <span class="label">Dashboard</span>
      <span class="meta">home</span>
    </a>
    <a class="cmd-menu-item cmd-menu-item--violet" href="#" role="menuitem">
      <span class="ic"><!-- svg billing --></span>
      <span class="label">Assinaturas</span>
      <span class="meta">billing</span>
    </a>
    <a class="cmd-menu-item cmd-menu-item--gold" href="#" role="menuitem">
      <span class="ic"><!-- svg user --></span>
      <span class="label">Área de membros</span>
      <span class="meta">bundle</span>
    </a>
    <a class="cmd-menu-item cmd-menu-item--teal" href="#" role="menuitem">
      <span class="ic"><!-- svg globe --></span>
      <span class="label">Workspace</span>
      <span class="meta">team</span>
    </a>
    <a class="cmd-menu-item" href="#" role="menuitem">
      <span class="ic"><!-- svg settings --></span>
      <span class="label">Configurações</span>
      <span class="meta">prefs</span>
    </a>
    <div class="cmd-menu-divider"></div>
    <a class="cmd-menu-item cmd-menu-item--logout" href="#" role="menuitem">
      <span class="ic"><!-- svg logout --></span>
      <span class="label">Sair da conta</span>
      <span class="meta">logout</span>
    </a>
  </div>
</div>
```

### Open/close
- JS escuta clique em `[data-account-toggle]` → toggle `aria-expanded` + classe `.is-open` no `[data-account-menu]`
- Esc fecha; clique fora também
- **`z-index: 200`** no `.cmd-menu` (precisa subir acima do hero/aurora)

### Variantes de item
- `.cmd-menu-item` (cyan, default)
- `.cmd-menu-item--violet` (Assinaturas)
- `.cmd-menu-item--gold` (Área de membros)
- `.cmd-menu-item--teal` (Workspace)
- `.cmd-menu-item--logout` (vermelho)

---

## Aurora Rail (substitui marquee)

Faixa logo abaixo do dock. **Não rola texto** — princípio anti-slop.

```html
<div class="cmd-aurora" aria-hidden="true">
  <svg class="cmd-aurora-wave" viewBox="0 0 1200 56" preserveAspectRatio="none">
    <path class="wave-1" d="M0,38 C150,18 280,52 420,32 C580,10 720,46 900,28 C1040,12 1140,40 1200,24"/>
    <path class="wave-2" d="M0,30 C160,46 320,16 480,36 C640,52 800,18 960,32 C1080,42 1160,22 1200,30"/>
    <path class="wave-3" d="M0,44 C140,28 320,46 500,38 C680,30 820,48 1000,36 C1100,28 1160,42 1200,38"/>
  </svg>
  <span class="cmd-aurora-stat"><span class="blip"></span> registry <strong>online</strong></span>
  <span class="cmd-aurora-divider"></span>
  <span class="cmd-aurora-stat cmd-aurora-stat--violet"><span class="blip"></span> <strong>248</strong> squads</span>
  <span class="cmd-aurora-stat cmd-aurora-stat--teal"><span class="blip"></span> <strong>1.4k</strong> genomes</span>
  <span class="cmd-aurora-stat cmd-aurora-stat--gold"><span class="blip"></span> <strong>3.2k</strong> skills</span>
  <a href="#" class="cmd-aurora-cta">Explorar registry →</a>
</div>
```

### Mecânica
- Container: `position:relative; isolation:isolate; overflow:hidden`
- SVG: `inset:0; z-index:0; opacity:0.32` (0.65 em light)
- Stats: `z-index:2`, `position:relative`
- Cada wave anima `transform: scaleY(1)→scaleY(1.18)` (não translateX — ondas ficam confinadas)
- Cada blip tem ping ring expandindo (`@keyframes blipPing`)

### Bugs já corrigidos
- ❌ Wave saindo da borda esquerda → `inset:0` ao invés de `left:0;right:0` (que respeita padding)
- ❌ Wave em cima do texto → `z-index:0` na wave + `z-index:2` no conteúdo
- ❌ Animação com `translateX` causava recuo aparente → trocada por `scaleY` only

---

## Estado de auth (binário)

Controlado por atributo no `<body>`:

```css
[data-auth-state="guest"] .cmd-account,
[data-auth-state="guest"] .cmd-menu { display: none; }

[data-auth-state="logged"] .cmd-login,
[data-auth-state="logged"] .cmd-cta { display: none; }
```

Renderize sempre os dois clusters no HTML — o CSS esconde o que não é o estado atual. Mais barato que condicional server-side e mais fácil de testar via Tweaks.

---

## Acessibilidade

- Botões nav com `aria-current="page"` no item ativo
- Account toggle com `aria-expanded` + `aria-haspopup="menu"`
- Menu com `role="menu"`, items com `role="menuitem"`
- Esc fecha dropdown (handler global no JS)
- Labels em SVG decorativos via `aria-hidden="true"` no parent
- Theme toggle com `aria-label="Alternar tema"`
