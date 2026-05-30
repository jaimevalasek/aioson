# Page Layout — aioson-design-system

Como compor uma página marketing v6 sem cair no anti-padrão de **card-em-card**.
Esta referência cobre a estrutura macro da página (sections + strips + grids) — os
detalhes de cada componente individual (Pipeline, Gates, Terminal, etc.) estão em
`marketing-components.md`.

---

## Anatomia de uma landing v6

```
<main class="marketing-shell">
  <CommandDock />                              ← topbar
  <AuroraRail />                               ← faixa abaixo do dock

  <section class="site-hero">                  ← hero (componente próprio)
    ...
  </section>

  <section class="site-section">               ← sections com header
    <header class="site-section-header">
      <p class="eyebrow">...</p>
      <h2 class="site-section-title">...</h2>
      <p class="site-section-subtitle">...</p>
    </header>
    <div class="track-grid">...</div>          ← grids como conteúdo
  </section>

  <section class="pipeline-strip">...</section> ← strips são self-contained
  <div class="dual-grid">                       ← container para 2 strips lado a lado
    <section class="surface-strip">...</section>
    <section class="surface-strip">...</section>
  </div>
  <section class="terminal-card">...</section>
  <section class="surface-strip">...</section>

  <section class="site-cta">...</section>      ← CTA final

  <MarketingFooter />
</main>
```

---

## Section primitives — quando usar cada um

| Classe | Quando usar | Comportamento visual |
|---|---|---|
| `.site-section` | Sections com `<header class="site-section-header">` (eyebrow + h2 + subtitle) seguido de conteúdo (cards/grids). | Padding `38px 0 14px`. Adjacentes `site-section + site-section` ganham `border-top` sutil como divisor. **Não tem bg nem border outer.** |
| `.pipeline-strip` | Linha sequencial horizontal de etapas (ex: pipeline de agentes). Tem header próprio (`.pipeline-strip-head`) e o trilho (`.pipeline-track`). | Self-contained: padding + border-top. Renderiza **direto** no shell. |
| `.surface-strip` | Bloco com header próprio (`.surface-strip-head`) + lista de cards (gates, concepts, multi-IDE, etc). | Self-contained com gap e padding. Renderiza **direto** no shell ou dentro de `.dual-grid`. |
| `.terminal-card` | Demo de CLI/terminal — sempre escuro nos dois temas. | Self-contained: card escuro com header + body. Renderiza **direto** no shell. |
| `.dual-grid` | Container para **dois** strips em colunas (gates + concepts, por exemplo). | Grid 2-col, gap 38px, padding + border-top próprios. **Não envolva em outro section.** |
| `.site-hero` | Bloco de abertura com título principal, CTAs, hero pills. | Self-contained. Padding largo. Geralmente um por página. |
| `.site-cta` | Bloco de CTA final antes do footer. | Self-contained. Padding + radial gradients. |

---

## Regras de composição (NÃO-NEGOCIÁVEIS)

### 1. Strips são self-contained — NÃO envolva em outer section

```html
✅ CORRETO:
<section class="pipeline-strip">
  <header class="pipeline-strip-head">...</header>
  <ol class="pipeline-track">...</ol>
</section>

❌ ERRADO (card-em-card):
<section class="site-section">                <!-- outer card -->
  <section class="pipeline-strip">             <!-- inner card -->
    ...
  </section>
</section>
```

Cada strip primitivo (`pipeline-strip`, `surface-strip`, `terminal-card`) já tem
padding + border-top próprios. Envolvê-los em outra section duplica espaçamentos
e cria visual de "card dentro de card", que é o anti-padrão visual mais frequente.

### 2. `.dual-grid` é container, não section

```html
✅ CORRETO:
<div class="dual-grid">
  <section class="surface-strip">...gates...</section>
  <section class="surface-strip">...concepts...</section>
</div>

❌ ERRADO:
<section class="site-section-alt">              <!-- outer card -->
  <div class="dual-grid">
    <section class="surface-strip">...</section> <!-- inner card -->
    <section class="surface-strip">...</section>
  </div>
</section>
```

### 3. Divisor entre sections vem de `section + section`, não de bg outer

A separação visual entre seções adjacentes é feita por CSS:

```css
.site-section + .site-section {
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
```

**Nunca** crie sections com `background` + `border-top` + `border-bottom` próprios
(o antigo `.site-section-alt` original fazia isso e gerava o efeito de "faixa que
vira card").

### 4. `.site-section-header` é left-aligned, não centered

```css
.site-section-header {
  display: flex; flex-direction: column; gap: 6px;
  margin-bottom: 24px;
  max-width: 64ch;     ← limita largura mas mantém alinhamento esquerdo
}
```

O hero da página (`.site-hero`) **pode** ser centered (estilo separado), mas
sections internas mantêm alinhamento à esquerda com `max-width: 64ch` para
legibilidade.

---

## Anti-padrão #1: card-em-card

**Sintoma**: você vê uma "moldura" externa com bg/border ao redor de um conteúdo
que já tem os próprios cards. O resultado é visual hierárquico confuso — o leitor
vê um card grande contendo cards pequenos, sem propósito semântico.

**Causa raiz típica**: pessoa enxerga uma section primitiva (ex: `.pipeline-strip`)
e por hábito a envolve em `<section class="site-section-alt">` (ou similar com bg)
"para ficar como as outras". Mas a strip JÁ É uma section completa.

**Como detectar no diff**: procure padrões como:

```jsx
<section className="site-section-alt">
  <PipelineStrip />
</section>
```

```jsx
<section className="site-section">
  <TerminalPreview />
</section>
```

Esses são red flags. O componente já renderiza um `<section>` por dentro. O outer
`<section>` está duplicando.

**Fix**: remova o outer section. Renderize o componente direto:

```jsx
<PipelineStrip />
<TerminalPreview />
```

---

## Anti-padrão #2: background extending beyond shell

O antigo `.site-section-alt` original tinha:

```css
.site-section-alt {
  margin-left: calc(-1 * var(--space-6));
  margin-right: calc(-1 * var(--space-6));
  background: var(--surface-soft);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
```

Isso criava uma "faixa horizontal" que vazava as margens do shell — e quando
o conteúdo já era card, virava card-em-card.

**Não use esse padrão**. Para divisão visual entre sections, use o seletor
adjacente (`.site-section + .site-section`) com border-top sutil. É mais
discreto e evita o efeito de "card outer".

---

## Quando usar `<section>` puro vs primitivo

- **`<section class="site-section">`**: sempre que você tem `header` + grid de
  conteúdo. Ex: lista de tracks, listagem de cards, marketplace teaser.

- **Nenhum wrapper (componente direto)**: quando o componente é uma "strip"
  primitiva já completa. Ex: `<PipelineStrip />`, `<TerminalPreview />`,
  `<MultiIdeStrip />`, `<GatesGrid />` (dentro de dual-grid).

- **`<div class="dual-grid">`**: quando você tem **dois** strips lado a lado.
  É um container de layout, não um section semântico.

---

## Exemplo completo — `/developer` v6

```jsx
<MarketingShell current="/developer">
  {/* Hero (componente próprio) */}
  <section className="site-hero">
    <div className="site-hero-content">...</div>
  </section>

  {/* Pipeline — strip self-contained, sem outer */}
  <PipelineStrip />

  {/* Gates + Concepts — dual-grid contém duas surface-strips */}
  <div className="dual-grid">
    <GatesGrid />
    <ConceptsGrid />
  </div>

  {/* Terminal demo — terminal-card já é card próprio */}
  <TerminalPreview />

  {/* Multi-IDE — surface-strip self-contained */}
  <MultiIdeStrip />

  {/* Pricing anchor — section com header + content */}
  <section className="site-section">
    <div className="site-section-header">
      <p className="eyebrow">Planos</p>
      <h2 className="site-section-title">Free para começar...</h2>
      <p className="site-section-subtitle">Comece no Free...</p>
    </div>
    <div className="site-hero-actions">
      <Link href="/pricing" className="primary-button">Ver planos</Link>
    </div>
  </section>

  {/* CTA final */}
  <section className="site-cta">
    <div className="site-cta-content">...</div>
  </section>
</MarketingShell>
```

Note que **nenhum** strip é envolvido em `<section className="site-section-alt">`.
A separação visual é feita pelos próprios `border-top` dos primitivos.
