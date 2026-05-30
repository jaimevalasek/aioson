# Motion & Effects — aioson-design-system

Animações, gradients especiais, glass morphism e princípios anti-slop. Use ao adicionar movimento ou efeito visual.

---

## Princípios

1. **Movimento é informativo, não decorativo.** Cada animação tem propósito (status pulsante = vivo, halo girando = identidade, ping = atenção).
2. **Sempre infinitas e sutis.** Animações de UI são em loop com easings suaves. Nunca animations bouncy/cartunescas.
3. **Respeite `prefers-reduced-motion`** quando o usuário pedir (TODO no roadmap).
4. **Anti-slop:** nunca `<marquee>`, nunca texto rolando horizontal, nunca confetti, nunca emojis animados.

---

## Animações canônicas

### `cmdSpin` — halo giratório

Aplica conic-gradient girando atrás de um elemento (logo do dock).

```css
@keyframes cmdSpin { to { transform: rotate(360deg); } }

.cmd-mark::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 18px;
  background: conic-gradient(from 0deg,
    color-mix(in srgb, var(--accent) 60%, transparent),
    color-mix(in srgb, var(--accent-2) 60%, transparent),
    color-mix(in srgb, var(--accent-4) 50%, transparent),
    color-mix(in srgb, var(--accent) 60%, transparent));
  filter: blur(10px);
  opacity: .45;
  z-index: -1;
  animation: cmdSpin 9s linear infinite;
}
```

**Uso:** logos, status badges importantes, elementos "vivos".

---

### `cmdPulse` — status dot pulsante

Anel se expandindo a partir de um dot.

```css
@keyframes cmdPulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-4) 60%, transparent); }
  70%  { box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent-4) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-4) 0%, transparent); }
}

.cmd-status-dot {
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--accent-4);
  animation: cmdPulse 2.2s ease-out infinite;
}
```

**Uso:** indicador de "online", "live", status saudável.

---

### `blipPing` — anel expandindo (Aurora Rail)

Versão maior/mais visível do pulse, para os blips do registry.

```css
@keyframes blipPing {
  0%   { transform: scale(1);   opacity: .7; }
  80%  { transform: scale(2.6); opacity: 0; }
  100% { transform: scale(2.6); opacity: 0; }
}

.cmd-aurora-stat .blip::after {
  content: '';
  position: absolute; inset: -3px;
  border-radius: 999px;
  border: 1.5px solid currentColor;
  opacity: 0;
  animation: blipPing 2.6s ease-out infinite;
}
```

**Variantes:** delay diferente por cor (`-0.6s`, `-1.2s`, `-1.8s`) para os 4 stats não pulsarem em sincronia.

---

### `waveDrift` — ondas SVG

Anima 3 paths SVG no Aurora Rail. **Apenas escala vertical**, nunca translateX.

```css
@keyframes waveDrift {
  from { transform: scaleY(1);    opacity: .6; }
  to   { transform: scaleY(1.18); opacity: .9; }
}

.cmd-aurora-wave .wave-1 { stroke: var(--accent);   animation: waveDrift 14s ease-in-out infinite alternate; }
.cmd-aurora-wave .wave-2 { stroke: var(--accent-2); animation: waveDrift 18s ease-in-out -3s infinite alternate; opacity:.7; }
.cmd-aurora-wave .wave-3 { stroke: var(--accent-4); animation: waveDrift 22s ease-in-out -6s infinite alternate; opacity:.55; }
```

Durações diferentes (14s/18s/22s) garantem que nunca alinhem — sensação orgânica.

> **Bug histórico:** versão antiga usava `translateX` → wave saía da borda esquerda visível. Fix: usar só `scaleY`.

---

### `menuPop` — entrada de dropdown

```css
@keyframes menuPop {
  from { opacity: 0; transform: translateY(-4px) scale(.98); }
  to   { opacity: 1; transform: none; }
}

.cmd-menu.is-open {
  display: block;
  animation: menuPop .16s ease-out;
}
```

Curto (160ms) e sutil. Nada de scale 0→1 ou bounce.

---

## Glass morphism

Padrão de "cartão de vidro" usado no dock e dropdowns.

```css
.componente-glass {
  background:
    linear-gradient(135deg,
      color-mix(in srgb, var(--panel-strong) 92%, transparent) 0%,
      color-mix(in srgb, var(--panel) 78%, transparent) 100%);
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--border));
  box-shadow:
    0 1px 0 rgba(255,255,255,.04) inset,
    0 -1px 0 rgba(0,0,0,.32) inset,
    0 24px 60px -20px rgba(0,0,0,.55);
}
```

**Componentes:**
- `blur(22px) saturate(140%)` — blur médio, saturação aumentada (deixa os acentos atrás vibrarem)
- Inner highlights (`inset` shadow branca/preta) — simula bordo de vidro
- Sombra externa ampla — ancoragem

Em tema claro, troque para gradient white→`#f7faff` e shadows slate.

---

## Conic gradients

Usados em halos (`.cmd-mark::before`) e avatares (`.cmd-avatar`).

```css
.cmd-avatar {
  background: conic-gradient(from 200deg,
    color-mix(in srgb, var(--accent) 80%, transparent),
    color-mix(in srgb, var(--accent-2) 80%, transparent),
    color-mix(in srgb, var(--accent-3) 70%, transparent),
    color-mix(in srgb, var(--accent) 80%, transparent));
  padding: 2px;       /* cria "aro" */
  border-radius: 50%;
}
```

Padding interno + filho com `border-radius: 50%` e fundo opaco = anel gradient.

---

## Aurora wash (background radial)

Pseudo-element com 2-3 radial-gradients sobrepostos.

```css
.componente::before {
  content: '';
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 8% 50%,  color-mix(in srgb, var(--accent) 22%, transparent), transparent 32%),
    radial-gradient(circle at 92% 50%, color-mix(in srgb, var(--accent-2) 22%, transparent), transparent 30%),
    radial-gradient(circle at 50% 110%, color-mix(in srgb, var(--accent-4) 18%, transparent), transparent 50%);
  opacity: .55;
  pointer-events: none;
  filter: blur(2px);
  mix-blend-mode: screen;   /* multiply em light */
}
```

Aplique no dock, hero, CTAs grandes.

---

## Grid sutil decorativa

```css
.componente::after {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--accent) 6%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 6%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(ellipse at 50% 50%, black 0%, transparent 80%);
  opacity: .25;
  pointer-events: none;
}
```

Mask radial faz a grade desaparecer nas bordas — vinheta.

---

## Anti-slop checklist

Antes de aprovar uma animação ou efeito, valide:

- [ ] Tem propósito informativo (não puramente decorativo)?
- [ ] Loop é > 2s (não pisca)?
- [ ] Easing é `ease-out`/`ease-in-out` (não `linear` para tudo)?
- [ ] Não usa `<marquee>` ou texto rolando horizontal?
- [ ] Não tem confetti, fogos, emojis animados?
- [ ] Não usa scale 0→1 com bounce em dropdowns/tooltips?
- [ ] Reduce motion considerado (mesmo se TODO)?
- [ ] Mantém `transform` + `opacity` como propriedades animadas (performance)?
- [ ] `pointer-events: none` em camadas decorativas (auroras, grids)?
