---
description: "site-forge Phase 2 — Selective Extraction: section specs, component inventory, interaction specs, aesthetic capture"
task_types: [site-clone, extraction]
triggers: [extracting design, design tokens, scraping site]
agents: [site-forge]
---

# site-forge: Phase 2 — Selective Extraction

**Goal:** Document structure and behavior of every section.

**Mode A, C:** Discard ALL aesthetic values — skill tokens replace them. Preserve content slots (texts, image paths).
**Mode B, D, E:** Extract structure AND aesthetic values — raw material for the skill or blend.

## 2.1 Section specs

For each section in page topology, create `docs/research/components/<section-slug>.spec.md`:

```markdown
# <SectionName> — Structure Specification

## Layout pattern
- Container: [max-width | full-viewport | fluid]
- Display: [flex | grid | block]
- Children arrangement: [column | row | grid-cols-3 | etc.]
- Overflow: [visible | hidden | scroll]

## Elements
- [element-type]: [role — e.g. "primary headline", "CTA button", "feature image"]

## Interaction model
- Type: [NONE | SCROLL-DRIVEN | CLICK-DRIVEN | HOVER | STATE-TOGGLE]
- Trigger: [precise trigger condition]
- Effect: [which elements, which CSS property types]
- Timing: [fast | medium | slow — relative only]

## Responsive changes
- At 768px: [what changes]
- At 390px: [what changes]

## Content slots
- Headline: "[actual text]"
- Subtext: "[actual text]"
- CTA label: "[actual text]"
- Image: [what it depicts, path to downloaded file]

## Aesthetic values (Modes B, D, E only — omit in Modes A, C)
- Background color: [hex or rgba]
- Text colors: [hex values per role: heading, body, muted, accent]
- Border radius: [observed px values]
- Shadow: [observed box-shadow values]
- Padding/gap pattern: [observed px values]
```

## 2.2 Component inventory

List all distinct reusable component types across the page:
```
Button: primary, secondary, ghost, icon-only
Card: media-card, text-card, stat-card
Input: text, email, textarea, select
NavItem / Modal / Dropdown / TabBar / Accordion / Toast / Badge / Avatar
```

For each component, create `docs/research/components/<component-slug>.spec.md`:

```markdown
# <ComponentName> — Component Specification

## DOM structure
- <outer-element> (semantic role)
  - <child>: [role]

## Variants
- [variant-name]: [how it differs structurally]

## States
- default / hover / active / disabled / loading: [what changes per state]
  (type only for Mode A/C | type + value for Mode B/D/E)

## Behavior
- [action]: [effect]
```

## 2.3 Interaction specifications

For every non-static section, create/append `docs/research/<hostname>/interaction-spec.md`:

```markdown
# <Name> — Interaction Specification

## Model: [SCROLL-DRIVEN | CLICK-DRIVEN | HOVER | STATE-TOGGLE]
## Trigger: [precise trigger condition]
## Effect: [which elements, which CSS property types]
## Timing: [fast / medium / slow — relative only]
## Implementation direction: [e.g. "scroll listener on window", "CSS :hover + transition"]
```

## 2.4 Aesthetic capture (Modes B, D, E only)

```javascript
const elements = {
  body: document.body,
  h1: document.querySelector('h1'),
  h2: document.querySelector('h2'),
  p: document.querySelector('p'),
  primaryBtn: document.querySelector('button, [class*="btn-primary"], [class*="cta"]'),
  card: document.querySelector('[class*="card"], article'),
  nav: document.querySelector('nav, header')
};

const extracted = {};
for (const [name, el] of Object.entries(elements)) {
  if (!el) continue;
  const s = window.getComputedStyle(el);
  extracted[name] = {
    backgroundColor: s.backgroundColor, color: s.color,
    fontFamily: s.fontFamily, fontSize: s.fontSize,
    fontWeight: s.fontWeight, lineHeight: s.lineHeight,
    borderRadius: s.borderRadius, boxShadow: s.boxShadow,
    padding: s.padding, gap: s.gap, transition: s.transition
  };
}
return extracted;
```

Save to `docs/research/<hostname>/aesthetics-raw.json`.

## Phase 2 output

- `docs/research/<hostname>/structure-spec.md` — overview of all sections
- `docs/research/<hostname>/interaction-spec.md` — all interactions
- `docs/research/<hostname>/aesthetics-raw.json` — Modes B, D, E only
- `docs/research/components/*.spec.md` — one per section + one per component type

**Exit criterion (Modes A, C):** Every section has a spec. No color/size/spacing values in any spec file.
**Exit criterion (Modes B, D, E):** Every section has a spec WITH aesthetic values. `aesthetics-raw.json` populated.
