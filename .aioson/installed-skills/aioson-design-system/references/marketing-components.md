# Marketing Components — aioson-design-system

Componentes da landing aioson.com fora do dock. Use ao construir uma página de marketing/landing nova.

---

## Hero

Bloco de abertura com headline + subtítulo + CLI de instalação + signal pills.

### Estrutura

```html
<section class="marketing-hero">
  <div class="hero-copy">
    <span class="eyebrow">aioson cloud · registry público</span>
    <h1>O registry de squads, genomes e skills de IA.</h1>
    <p>Publique, instale e versione agentes como pacotes. <strong>aioson init</strong> em qualquer projeto.</p>

    <div class="hero-cli">
      <span class="hero-cli-prompt">$</span>
      <code>npx aioson init my-squad</code>
      <button class="hero-cli-copy" type="button">copiar</button>
    </div>

    <div class="signal-cluster">
      <span class="signal-pill signal-pill-blue">Open registry</span>
      <span class="signal-pill signal-pill-violet">Versionamento semver</span>
      <span class="signal-pill signal-pill-teal">CLI + SDK</span>
      <span class="signal-pill signal-pill-gold">Cloud cache</span>
    </div>
  </div>

  <div class="hero-side">
    <!-- Terminal card ou stats grid -->
  </div>
</section>
```

### Estilos chave

| Elemento | Comportamento dual |
|----------|-------------------|
| `.marketing-hero` | Dark: gradient escuro + grade `::before`. Light: gradient pastel sobre `#fff→#f7faff` |
| `.hero-cli` | **Sempre escuro** (`#0e1320`) nos dois temas — regra do terminal |
| `.signal-pill-*` | Variantes blue/violet/teal/gold com `color-mix` dos accents |

---

## Tracks (cards coloridos)

Trilhos de aprendizado/produto com identidade colorida.

```html
<div class="track-grid">
  <article class="track-card track-card--cyan">
    <span class="track-card-icon"><!-- svg --></span>
    <h3>Squads</h3>
    <p>Times de agentes com papéis e protocolos.</p>
    <span class="track-card-pill">248 publicados</span>
  </article>
  <article class="track-card track-card--gold">...</article>
  <article class="track-card track-card--emerald">...</article>
</div>
```

### Variantes

| Modificador | Tema | Uso semântico |
|-------------|------|---------------|
| `--cyan` | accent (cyan/azul) | Squads, fluxo, comunicação |
| `--gold` | accent-3 (amber) | Premium, destaque, pago |
| `--emerald` | accent-4 (teal) | Status, success, growth |
| `--violet` (opcional) | accent-2 | Dados, billing |

Cada variante aplica `linear-gradient(180deg, color-mix(accent-soft 60%, transparent), transparent 56%)` sobre o card branco/escuro.

---

## Pipeline

Trilho horizontal de etapas (publish → review → cache → install).

```html
<div class="pipeline-track">
  <div class="pipeline-step">
    <span class="step-num">01</span>
    <h4>Publish</h4>
    <p>aioson publish my-squad</p>
  </div>
  <div class="pipeline-step gate">
    <span class="step-num">02</span>
    <h4>Review</h4>
    <p>Lint + verify</p>
  </div>
  <div class="pipeline-step">…</div>
</div>
```

### Estilos
- `.pipeline-track` — grid horizontal scrollable em mobile
- `.pipeline-step` — radius 14, padding 16-20, gradient sutil
- `.pipeline-step.gate` — variante gold para etapas de validação

---

## Gates

Linhas verticais com checks/validações.

```html
<div class="gate-row">
  <span class="gate-icon"><!-- svg check --></span>
  <h4>Schema válido</h4>
  <p>Manifesto segue o aioson.spec v1</p>
  <span class="gate-status">passed</span>
</div>
```

---

## Terminal Card

Bloco de demonstração de CLI/output. **Sempre escuro nos dois temas**.

```html
<div class="terminal-card">
  <div class="terminal-head">
    <span class="terminal-dot terminal-dot--red"></span>
    <span class="terminal-dot terminal-dot--yellow"></span>
    <span class="terminal-dot terminal-dot--green"></span>
    <span class="terminal-title">aioson · my-squad</span>
  </div>
  <pre class="terminal-body">
<span class="prompt">$</span> aioson install content-marketing-pro
<span class="success">✓</span> resolved <span class="muted">@aioson-labs/content-marketing-pro@1.4.0</span>
<span class="success">✓</span> verified signature
<span class="success">✓</span> installed in <span class="accent">142ms</span>
  </pre>
</div>
```

### Cores internas
- Prompt: emerald (`#7be3bb`)
- Success check: emerald
- Muted: slate `#a9b3c7`
- Accent: cyan

---

## Pricing Matrix

Tabela de planos lado-a-lado.

```html
<div class="pricing-matrix">
  <div class="pricing-head">
    <h3>Free</h3>
    <p class="price">R$ 0</p>
  </div>
  <div class="pricing-body">
    <!-- features -->
  </div>
  <div class="pricing-foot">
    <a href="#" class="secondary-button">Começar</a>
  </div>
</div>
```

Variantes: `Free`, `Pro` (gradient gold→violet no chip), `Team`.

---

## Mini cards (rail bottom)

Cards pequenos para encerramento de seção.

```html
<div class="marketing-mini-grid">
  <div class="marketing-mini-card marketing-mini-card-violet">
    <span class="eyebrow">SDK</span>
    <h4>Tipos compartilhados</h4>
    <p>TypeScript types gerados do manifesto.</p>
  </div>
  <div class="marketing-mini-card marketing-mini-card-gold">…</div>
</div>
```

Variantes coloridas via `marketing-mini-card-violet` e `marketing-mini-card-gold`.

---

## Stats grid

```html
<div class="marketing-preview-grid">
  <div class="marketing-preview-stat marketing-preview-stat-blue">
    <span>Squads ativos</span>
    <strong>248</strong>
    <p>+12 esta semana</p>
  </div>
  <div class="marketing-preview-stat marketing-preview-stat-violet">…</div>
  <div class="marketing-preview-stat marketing-preview-stat-gold">…</div>
</div>
```

---

## Princípios para landings aioson

1. **Use no máximo 2 backgrounds diferentes** na página inteira (hero + CTA final, por exemplo).
2. **Toda seção tem um eyebrow mono** ("aioson cloud · registry público") — cria ritmo.
3. **Variantes de cor são semânticas, não decorativas.** Cyan = comunicação/fluxo, Violet = dados, Gold = premium, Emerald = status.
4. **Stats numéricos sempre em mono** (`font-variant-numeric: tabular-nums`).
5. **Imagens reais > ilustrações**. Se não tem imagem, use placeholder cinza claro com label, **nunca** SVG decorativo inventado.
