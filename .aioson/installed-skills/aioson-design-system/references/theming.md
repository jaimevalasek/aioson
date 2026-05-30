# Theming — aioson-design-system

Filosofia e mecânica do dual theme dark+light. Leia antes de implementar light mode em qualquer componente novo.

---

## Filosofia

> Tema claro **não** é tema escuro com fundo trocado. Cada tema é curado.

Sintomas de uma má implementação (a evitar):

- Light mode pálido e sem alma — apenas inversão de luminosidade
- Acentos cyan vibrantes que somem em fundo claro
- Sombras pretas duras em fundo claro (deveriam ser slate-tinted)
- Terminais virando "pre" branco com texto preto — perde toda a identidade
- Gradientes com mesmas paradas mas claros, virando washed-out

O sistema aioson assume que o usuário escolhe o tema **conscientemente** — não há detecção de sistema operacional silenciosa. Por isso ambos precisam ser igualmente belos.

---

## Como o sistema implementa

### Atributo no `<html>`

```html
<html data-theme="dark">  <!-- ou "light" -->
```

Tokens são definidos em `:root` (default escuro) e `[data-theme="light"]` (sobrescreve). Componentes usam apenas `var(--accent)`, nunca hex direto.

### Toggle persistente

`assets/components/theme-toggle.js` cuida de:

1. Ler `localStorage.getItem('aioson-theme')` ao boot
2. Aplicar `data-theme` no `<html>`
3. Trocar ícone (lua ↔ sol) no botão `[data-theme-toggle]`
4. Persistir nova escolha em `localStorage`

```js
// Pseudocódigo do que o toggle faz
var current = root.getAttribute('data-theme') || 'dark';
var next = current === 'light' ? 'dark' : 'light';
root.setAttribute('data-theme', next);
localStorage.setItem('aioson-theme', next);
syncIcons();
```

### Markup do botão (no Command Dock)

```html
<button class="cmd-icon-btn" type="button" aria-label="Alternar tema" data-theme-toggle>
  <svg class="cmd-theme-moon" ...><!-- lua --></svg>
  <svg class="cmd-theme-sun" style="display:none" ...><!-- sol --></svg>
</button>
```

O JS controla qual ícone fica visível.

---

## Adaptações por componente (catálogo)

Tabela do que muda entre os dois temas em cada componente. Use como referência ao implementar/auditar.

### Body / página

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | Gradient radial cyan/violet sobre `#07080c` | Gradient radial cyan/violet/teal **mais sutil** sobre `#f4f6fb→#fff` |
| Aurora wash | Opacidade `0.55`, blend `screen` | Opacidade `0.45`, blend `multiply` |

### Hero

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | Gradients escuros + grade sutil | Gradient pastel sobre `#fff→#f7faff` |
| Border | `var(--border)` (slate translúcido) | `var(--border)` (slate sólido 10%) |
| Sombra | `var(--shadow)` (preta) | `0 22px 48px -24px rgba(15,23,42,.18)` (slate) |

### Hero CLI / Terminal

> **Regra crítica:** terminais e CLI **mantêm fundo escuro nos dois temas**. Nunca alterar.

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | `#0e1320` | `#0e1320` (igual) |
| Texto | `#dbe6f5` | `#dbe6f5` (igual) |
| Sombra | `var(--shadow)` | `0 22px 48px -22px rgba(15,23,42,.40)` (mais forte para integrar com fundo claro) |
| Border | sutil | `transparent` (sombra carrega o trabalho) |

### Cards (track, pricing, market, ide, gate)

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | `var(--panel-strong)` translúcido | `#ffffff` opaco |
| Sombra | drop-shadow preta | `0 10px 28px -18px rgba(15,23,42,.18)` |
| Variantes coloridas (`--cyan`, `--gold`, `--emerald`) | gradient escuro do acento | gradient pastel do acento sobre branco |

### Botões

| Tipo | Dark | Light |
|------|------|-------|
| Primary | gradient `accent → accent-2` | gradient `accent → accent-2` (acentos já são mais escuros, mantém vibração) |
| Secondary | `surface-soft` translúcido | `#ffffff` + border slate |
| Login (cmd) | `rgba(0,0,0,.22)` | `#ffffff` |

### Pills, badges, eyebrows

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | `color-mix(accent-soft 80%, panel)` | `color-mix(accent-soft 60%, #fff)` |
| Border | `accent 26%, border` | igual padrão |
| Texto | `accent` direto | `accent-strong` (mais escuro) |

### Command Dock (topbar)

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | gradient panel translúcido | gradient white→`#f7faff` |
| Glass | `blur(22px) saturate(140%)` | igual |
| Aurora interno (`::before`) | `screen` blend, opacity `0.55` | `multiply` blend, opacity `0.45` |
| Grade interna (`::after`) | `accent 6%`, opacity `0.25` | `accent 10%`, opacity `0.18` |
| Brand mark | gradient escuro + halo conic | gradient `#fff→#eef3fb` + halo conic mais sutil |

### Aurora Rail

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | gradient panel translúcido | `#fff→#f7faff` |
| Wave opacity | `0.32` | `0.65` (precisa ficar mais visível em fundo claro) |
| Blip ping borders | `currentColor` | igual |

### Account Menu (dropdown)

| Aspecto | Dark | Light |
|---------|------|-------|
| Background | gradient `panel-strong→panel` translúcido | igual padrão dark (já usa `color-mix` com tokens) |
| Avatar inner | `#0a0d14` | `#f4f7fc` + texto slate |
| Item meta tag | `rgba(255,255,255,.04)` | `#f4f7fc` |
| Logout color | `#ff7d7d` | `#dc2626` (vermelho mais escuro) |

---

## Padrão para escrever uma regra dual

Sempre que você adicionar uma regra de cor/sombra/border em CSS, **escreva imediatamente a versão light**. Exemplo:

```css
/* ✅ CORRETO — sempre par */
.minha-coisa {
  background: var(--panel-strong);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
[data-theme="light"] .minha-coisa {
  background: #ffffff;
  box-shadow: 0 10px 24px -16px rgba(15,23,42,.12);
}

/* ❌ ERRADO — light "ajusto depois" */
.minha-coisa {
  background: #12161d;  /* hex direto + sem contraparte light */
}
```

Se a regra usa **só tokens**, geralmente não precisa de override (o token já cuida). Override só é necessário quando você está usando hex literal ou quando o tema claro precisa de um tratamento qualitativamente diferente (ex: terminal mantendo escuro).

---

## Checklist ao auditar uma tela existente

Para validar que algo está aderente ao dual theme:

1. [ ] Carregue em `data-theme="dark"` e `data-theme="light"` — ambos parecem intencionais?
2. [ ] Não há texto cinza muito claro sumindo no fundo branco?
3. [ ] Não há sombras pretas duras em light mode?
4. [ ] Acentos têm contraste suficiente nos dois (WCAG AA mínimo)?
5. [ ] Terminais/CLI seguiram a regra de manter escuros?
6. [ ] Toggle funciona e persiste após F5?
7. [ ] Hover states visíveis em ambos os temas?
