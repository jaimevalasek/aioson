# Tokens — aioson-design-system

Referência completa de design tokens. Todos os valores são CSS custom properties expostos em `:root` (escuro, padrão) e `[data-theme="light"]`.

> **Regra de ouro:** se você está prestes a digitar um hex literal num componente, pare e procure aqui primeiro. 95% das vezes o token já existe.

---

## Filosofia

- **Dois temas curados.** Cada cor tem valor pensado para os dois temas, não invertido.
- **`color-mix()` é a primitiva.** Variantes soft/hover/border vêm de `color-mix(in srgb, var(--accent) X%, var(--border))` — não inventamos novos hex.
- **Acentos têm a mesma família semântica.** `--accent` (cyan/azul) sempre é a primária; `--accent-2` (violet) sempre é a secundária. O hex muda entre temas; o papel não.

---

## Tipografia

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-body` | `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` | Texto, títulos, UI conversacional |
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` | Versões, kbd, stats, eyebrows técnicos, terminal |

### Carregamento

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

### Escala de fontes (consistente nos dois temas)

| Uso | Tamanho | Weight | Letter-spacing |
|-----|---------|--------|----------------|
| Hero title | `clamp(2.4rem, 4vw, 3.4rem)` | 700 | `-0.05em` |
| Section title | `1.6rem` | 700 | `-0.04em` |
| Card title | `1.05rem` | 700 | `-0.04em` |
| Body | `0.94rem` | 400 | normal |
| UI label | `0.82rem` | 500 | `-0.01em` |
| Eyebrow / kbd / mono | `0.66rem` | 600-700 | `0.08em-0.16em` |
| Tiny mono / version | `0.6rem` | 600 | `0.14em` |

---

## Cores — tema escuro `[data-theme="dark"]`

### Base

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#07080c` | Background do `<body>` |
| `--bg-deep` | `#0b0d12` | Bottom de gradiente do body |
| `--panel` | `rgba(12,15,21,.88)` | Cards translúcidos |
| `--panel-strong` | `#12161d` | Cards opacos |
| `--surface-soft` | `rgba(255,255,255,.035)` | Fills muito sutis |
| `--border` | `rgba(142,162,194,.12)` | Bordas padrão |

### Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `--text` | `#edf1f5` | Texto padrão |
| `--text-soft` | `#f7f9fb` | Títulos, ênfase |
| `--muted` | `#7f8796` | Texto secundário, metadados |

### Acentos — 4 famílias

| Token | Valor | Família | Uso |
|-------|-------|---------|-----|
| `--accent` | `#5ec8ff` | Cyan | Primária — links, foco, ícones de ação |
| `--accent-strong` | `#8fdcff` | Cyan claro | Hover de links |
| `--accent-soft` | `rgba(94,200,255,.16)` | Cyan transparente | Backgrounds soft, glows |
| `--accent-2` | `#7a6cff` | Violet | Secundária — destaques, dados, billing |
| `--accent-2-soft` | `rgba(122,108,255,.14)` | Violet transparente | Backgrounds violet |
| `--accent-3` | `#e8b05f` | Gold/amber | Plano Pro, badges premium, alertas suaves |
| `--accent-3-soft` | `rgba(232,176,95,.16)` | Gold transparente | Tracks gold |
| `--accent-4` | `#4dd5a6` | Emerald | Status online, success, registry vivo |
| `--accent-4-soft` | `rgba(77,213,166,.14)` | Emerald transparente | Tracks teal |

### Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow` | `0 18px 44px rgba(0,0,0,.38)` | Cards padrão |
| `--shadow-glow` | `0 0 0 1px rgba(94,200,255,.05),0 10px 28px rgba(3,12,22,.42)` | Cards com glow cyan |
| `--marketing-shadow` | `0 16px 34px rgba(0,0,0,.34)` | Hero, CTAs grandes |

---

## Cores — tema claro `[data-theme="light"]`

### Base

| Token | Valor | Justificativa |
|-------|-------|---------------|
| `--bg` | `#f4f6fb` | Off-white levemente azulado, evita branco gritante |
| `--bg-deep` | `#e8edf5` | Bottom do gradient |
| `--panel` | `rgba(255,255,255,.92)` | Cards translúcidos sobre fundo claro |
| `--panel-strong` | `#ffffff` | Cards opacos |
| `--surface-soft` | `rgba(15,23,42,.04)` | Fills sutis (slate vez de white) |
| `--border` | `rgba(15,23,42,.10)` | Bordas suaves slate |

### Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `--text` | `#0f172a` | Texto padrão (slate-900) |
| `--text-soft` | `#1a2236` | Títulos |
| `--muted` | `#5b6677` | Secundário (slate-500) |

### Acentos — recalibrados (mesma família, mais escuros)

| Token | Valor | Comparado ao dark | Justificativa |
|-------|-------|-------------------|---------------|
| `--accent` | `#1f8aff` | `#5ec8ff` → mais escuro/saturado | Cyan claro tem contraste ruim em fundo branco; vira azul para legibilidade |
| `--accent-strong` | `#0066d6` | `#8fdcff` → escuro | Hover precisa ser ainda mais escuro |
| `--accent-soft` | `rgba(31,138,255,.12)` | mesma lógica, alpha menor | |
| `--accent-2` | `#5e4dff` | `#7a6cff` → escuro | Violet precisa de mais peso |
| `--accent-2-soft` | `rgba(94,77,255,.12)` | | |
| `--accent-3` | `#c08233` | `#e8b05f` → amber escuro | Gold em fundo claro fica "amarelo de aviso"; vira amber elegante |
| `--accent-3-soft` | `rgba(192,130,51,.14)` | | |
| `--accent-4` | `#0fa37a` | `#4dd5a6` → emerald escuro | Mint claro some em fundo branco |
| `--accent-4-soft` | `rgba(15,163,122,.12)` | | |

### Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow` | `0 14px 38px rgba(15,23,42,.10)` | Cards — sombra de slate, não preto |
| `--shadow-glow` | `0 0 0 1px rgba(31,138,255,.10),0 12px 28px rgba(31,138,255,.10)` | Glow azul integrado |
| `--marketing-shadow` | `0 14px 30px rgba(15,23,42,.08)` | Hero/CTA mais sutil |

---

## Espaçamento e radii

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | `8px` | Pills internas, kbd |
| `--radius-md` | `12px` | Inputs, ícone-btn pequenos |
| `--radius-lg` | `18px` | Dropdowns, panels |
| `--radius-xl` | `22px` | Dock, hero, cards grandes |
| `--radius-pill` | `999px` | Status pills, signal pills |

Espaçamento segue múltiplos de **4px**. Gaps comuns: `8`, `12`, `14`, `18`, `22`, `28px`. Padding interno de cards: `12-14px` (compactos), `18-22px` (médio), `28-32px` (hero).

---

## Transições

| Token | Valor | Uso |
|-------|-------|-----|
| `--transition-fast` | `140ms ease` | Hovers, micro-interações |
| `--transition` | `220ms ease` | Mudanças de estado maiores |

---

## Z-index

Não há tokens explícitos, mas o sistema reserva camadas. Documentado aqui para evitar conflito:

| Camada | z-index | Componente |
|--------|---------|------------|
| Base | `auto` | Conteúdo da página |
| Aurora wave (atrás) | `0` | `.cmd-aurora-wave` |
| Aurora content | `2` | Stats e CTA do aurora rail |
| Sticky dock | `60` | `.cmd-dock` |
| Tweaks panel | `90` | Painel de tweaks (se ativo) |
| **Account dropdown** | **`200`** | `.cmd-menu` — precisa subir acima de tudo |
| Toast/modal (futuro) | `300+` | Reservado |

---

## Como adicionar um token novo

1. Adicione em `assets/tokens/dark.css` com valor pensado para escuro.
2. **Imediatamente** adicione contraparte em `assets/tokens/light.css`. Não deixe "ajusto depois" — cada token nasce dual.
3. Documente aqui em `tokens.md`.
4. Atualize `CHANGELOG.md` com `Added`.
