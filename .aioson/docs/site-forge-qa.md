---
description: "site-forge Phase 5 — Visual QA, screenshot comparison, interaction testing, skill fidelity check, output contract"
agents: [site-forge]
task_types: [site-clone, qa]
triggers: [site qa, visual parity, link check]
---

# site-forge: Phase 5 — Visual QA

**Goal:** Verify the clone behaves like the original and looks like the skill.

## 5.1 Start dev server

```bash
npm run dev
# Wait for "ready" — up to 30s
```

## 5.2 Screenshot comparison

Capture both at 1440px, 768px, 390px:
- Original: target URL
- Clone: `http://localhost:3000`

**Mode A, C:** Acceptable: colors/fonts/spacing replaced. Unacceptable: missing sections, broken layout, missing interactive elements, missing content.
**Mode B:** Clone should visually resemble original. Large color/font differences signal extraction miss — investigate before passing.
**Mode E:** Blend must be visible — neither pure copy nor pure skill application. If identical to either source, blend was not applied.

## 5.3 Interaction testing

Per interaction in the spec:
- Scroll triggers: does the effect fire at the right scroll position?
- Click triggers: do tabs, dropdowns, modals, toggles work?
- Hover triggers: do cards lift, nav items change state?
- Responsive: do breakpoints trigger correct layout changes?

## 5.4 Skill fidelity check

- CSS variables resolving (no browser defaults as fallback)?
- Motion tokens used (no hardcoded `ms` in components)?
- **Mode A, C:** Skill colors applied — not original site colors?
- **Mode B:** Extracted site colors reproduced accurately?
- **Mode E:** Blended values present — verify at least 3 tokens from each source?

## 5.5 QA report

Create `docs/research/<hostname>/qa-report.md`:

```markdown
# QA Report — <hostname> → <skill-name>
**Mode:** [A | B | C | D | E]
**Date:** [date]
**Build status:** passing

## Structural fidelity
✅/⚠️/❌ [Section]: [note]

## Content slots (Modes C, E)
✅/⚠️/❌ [Section]: extracted text/images present

## Interactions
✅/⚠️/❌ [Interaction name]: [status and note]

## Skill fidelity
✅/⚠️/❌ Colors: tokens applied / hardcoded values remain
✅/⚠️/❌ Typography: skill fonts active
✅/⚠️/❌ Spacing: scale tokens applied
✅/⚠️/❌ Motion: transition tokens applied

## Blend verification (Mode E only)
✅/⚠️/❌ Site tokens present: [list 3 examples]
✅/⚠️/❌ Skill tokens present: [list 3 examples]

## Issues to fix
1. [issue] → [fix]

## Known deviations (acceptable ⚠️)
- [deviation]: [reason]
```

Fix all ❌ before closing. Pass requires fewer than 5 ⚠️.

---

# Output contract

## Modes A, B, C, E (builds a site)

```
docs/research/<hostname>/
├── reconnaissance.json
├── crawl-manifest.json
├── structure-spec.md
├── interaction-spec.md          ← updated with scroll-triggered entries from Phase 1.5.4
├── animations-raw.json          ← jsLibraries, keyframes, animationRules, parallax
├── videos.json
├── dom-mutations.json
├── component-map.md             (Modes A, C)
├── blend-map.md                 (Mode E only)
├── blended-tokens.css           (Mode E only)
└── qa-report.md

docs/research/<hostname>/scroll-recording/
└── scroll-00pct.png … scroll-100pct.png

docs/research/components/
└── <section-slug>.spec.md  (one per section + one per component type)

public/images/<hostname>/     [replace before publishing]
public/videos/<hostname>/     [replace before publishing]

src/components/
└── <SectionName>.tsx
└── VideoBackground.tsx       (if videos found)

src/app/
├── page.tsx
└── globals.css               [skill token root + extracted @keyframes]
```

## Mode B additionally

```
docs/research/<hostname>/aesthetics-raw.json

.aioson/installed-skills/<hostname>/
├── SKILL.md
├── references/design-tokens.md
├── references/components.md
├── references/patterns.md
├── references/motion.md      ← extracted @keyframes + detected animation libraries
├── references/websites.md
└── .skill-meta.json
```

## Mode D (skill only — no site built)

```
docs/research/<hostname>/
├── reconnaissance.json
├── crawl-manifest.json
├── structure-spec.md
├── interaction-spec.md
├── animations-raw.json
├── videos.json
├── dom-mutations.json
└── aesthetics-raw.json

.aioson/installed-skills/<hostname>/
├── SKILL.md
├── references/design-tokens.md
├── references/components.md
├── references/patterns.md
├── references/motion.md
├── references/websites.md
└── .skill-meta.json
```
