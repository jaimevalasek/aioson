---
description: "site-forge Phase 3A — Transform Layer (Modes A/C), Phase 3B — Skill Forge (Modes B/D/E), Phase 3E — Blend Layer (Mode E)"
task_types: [site-clone, transform]
triggers: [transforming site, rebrand, adapting content]
agents: [site-forge]
---

# site-forge: Phase 3A — Transform Layer (Modes A, C only)

**Goal:** Map extracted structure to the existing skill's components and tokens.

## 3A.1 Load the skill

Read from `.aioson/installed-skills/<skill>/` or `.aioson/skills/design/<skill>/`:
1. `SKILL.md` — identity, pillars, activation rules
2. `references/design-tokens.md` — all CSS variables
3. `references/components.md` — available components and variants
4. `references/patterns.md` — page layout patterns
5. `references/motion.md` — animation tokens and conventions
6. `references/websites.md` — landing page patterns (if present)

## 3A.2 Build the component map

Create `docs/research/<hostname>/component-map.md`:

```markdown
# Component Map — <hostname> → <skill-name>

## Mappings

| Extracted element | Skill component | Key tokens to apply |
|---|---|---|
| Hero container | Hero pattern (from patterns.md) | --max-width, --space-XX |
| Feature card grid | Card grid pattern | gap: --space-XX |
| Primary CTA button | Button primary | bg: --accent, radius: --radius-md |
| Ghost/outline button | Button ghost | border: 1px solid --border |
| H1 display heading | Display heading | font: --font-display, size: --text-5xl |
| Body paragraph | Body text | font: --font-body, size: --text-base |
| Muted caption | Muted text | color: --text-muted |
| Sticky nav | Header pattern | bg: --bg-surface, shadow: --shadow-sm on scroll |
| Card hover | Card component | transform: translateY(var(--hover-lift)) |
| Scroll interaction timing | — | var(--transition-base) |

## Deviations (skill component not available)

| Extracted element | Fallback approach | Reason |
|---|---|---|

## Assets preserved

| Original source | Local path | Action required before publishing |
|---|---|---|
| hero image | public/images/<hostname>/hero.webp | Replace with project asset |
| logo | public/images/<hostname>/logo.svg | Replace with project logo |
```

**Mode C (content-first):** Add a "Content slot" column mapping each skill component to its extracted text and image asset.

## 3A.3 Universal token substitution rules

Apply everywhere during Phase 4:
```
background-color: <hex>   →  var(--bg-surface) | var(--bg-elevated) | var(--accent)
color: <hex>              →  var(--text-primary) | var(--text-muted) | var(--accent)
padding: <px>             →  var(--space-XX) — pick nearest from spacing scale
margin: <px>              →  var(--space-XX)
animation-duration: <ms>  →  var(--transition-fast) | var(--transition-base) | var(--transition-slow)
font-size: <px>           →  var(--text-XX) — pick nearest from type scale
font-family: <name>       →  var(--font-display) | var(--font-body) | var(--font-mono)
border-radius: <px>       →  var(--radius-sm) | var(--radius-md) | var(--radius-lg)
box-shadow: <value>       →  var(--shadow-sm) | var(--shadow-md) | var(--shadow-lg)
transition: <value>       →  var(--transition-fast) | var(--transition-base) | var(--transition-slow)
```

If a token name doesn't exist in the skill, use closest equivalent from `design-tokens.md`. Never hardcode values.

## 3A.4 Interaction preservation rule

Keep the trigger mechanism. Keep the effect type. Replace only easing/duration with skill motion tokens.

**Exit criterion:** Every extracted component has a mapping row. Every interaction has a motion token assigned.

---

# site-forge: Phase 3B — Design Extraction + Skill Forge (Modes B, D, E)

**Goal:** Extract the site's design system from raw aesthetics and forge a new AIOSON skill.

## 3B.1 Color system extraction

From `aesthetics-raw.json`, organize into semantic groups:
```
Background: --bg-base, --bg-surface, --bg-elevated, --bg-inverse
Text:        --text-primary, --text-muted, --text-inverse
Brand:       --accent, --accent-hover, --border
Semantic:    --success, --warning, --error, --info (if present)
```

Consolidate near-duplicate colors (within 10% perceptual distance) into a single token.

## 3B.2 Typography system extraction

```
Font families: --font-display (h1/h2), --font-body (p), --font-mono (code, if detected)

Type scale (map observed px to named scale):
  --text-xs … --text-5xl (xs=smallest, 5xl=h1.fontSize)

Weight scale (include only weights in use):
  --font-normal (400), --font-medium (500), --font-semibold (600), --font-bold (700)

Line heights:
  --leading-tight, --leading-normal, --leading-relaxed
```

## 3B.3 Spacing system extraction

Collect all observed padding/gap values → find GCD or most common divisor (typically 4px or 8px) → base unit:
```
--space-1 … --space-24 (1× to 24× base unit)
```

## 3B.4 Visual primitives

```
Border radius: --radius-none, --radius-sm, --radius-md, --radius-lg, --radius-full
Shadows:       --shadow-sm, --shadow-md, --shadow-lg, --shadow-xl
Motion:        --transition-fast, --transition-base, --transition-slow, --ease-default, --ease-spring
```

## 3B.5 Visual identity synthesis

Define 3 design pillars from extracted values. Examples:
- "Minimal contrast" + "Typographic hierarchy" + "Generous whitespace"
- "Deep darkness" + "Glowing accents" + "Crisp borders"

Also: Theme (`light | dark | system`), Personality (1-sentence description).

## 3B.6 Pick reference skill structure

List skills in `.aioson/skills/design/`. Choose closest visual match. Read its directory listing.
**Use only the FILE STRUCTURE as template — do not copy any tokens or design values.**

## 3B.7 Forge the skill

Create `.aioson/installed-skills/<hostname>/` with:

**`SKILL.md`:**
```markdown
# <hostname> Design System

> Extracted from <url> on <date>. Visual clone skill — adapt tokens before using in unrelated projects.

## Identity
**Theme:** <light|dark|system>
**Personality:** <1-sentence>

## Design pillars
1. <pillar 1>
2. <pillar 2>
3. <pillar 3>

## When to use
Activate when building projects that need to visually match or be inspired by <hostname>'s aesthetic.

## Activation
Load `references/design-tokens.md` before writing any component.
```

**`references/design-tokens.md`:** Full `:root {}` block with all tokens from 3B.1–3B.4.

**`references/components.md`:** Component variants derived from Phase 2.2 inventory. DOM structure, props, variants, token usage per component.

**`references/patterns.md`:** Page layout patterns from Phase 2.1 section specs. Hero, Feature grid, Card layout, Nav, Footer.

**`references/motion.md`:** Animation tokens + interaction patterns from Phase 2.3 and 1.5:
- `jsLibraries` detected
- All `@keyframes` from `animations-raw.json` — copy verbatim as "Extracted Keyframes" section
- `parallax` entries — technique (CSS fixed vs JS transform)
- `scrollLinked` CSS rules
- Scroll-trigger thresholds from `dom-mutations.json` as table: element → scrollY trigger → effect

**`references/websites.md`:** This site's landing page structure as reusable pattern. Full page topology and section connections.

**`.skill-meta.json`:**
```json
{
  "id": "<hostname>",
  "name": "<hostname> Design System",
  "source": "<url>",
  "extractedAt": "<ISO date>",
  "theme": "<light|dark|system>",
  "baseUnit": "<Npx>",
  "referenceSkill": "<chosen template skill id>",
  "type": "extracted"
}
```

**Exit criterion (Modes B, D):** All skill files written. `design-tokens.md` has full `:root {}` block. Component and pattern references derived from site's inventory.

**Mode D exits here.** Output path to forged skill and run observability.

**Mode B and E:** Proceed to Phase 4 (Mode B uses forged skill; Mode E uses blend layer from 3E).

---

# site-forge: Phase 3E — Blend Layer (Mode E only)

**Goal:** Merge extracted site tokens with existing skill tokens at the configured ratio.

## 3E.1 Define the blend map

Load both token sets:
- Site: `docs/research/<hostname>/aesthetics-raw.json` + Phase 3B extraction
- Skill: named skill's `references/design-tokens.md`

Default blend: 50% site / 50% skill. Use user-specified ratio if provided.

## 3E.2 Blend rules per category

Create `docs/research/<hostname>/blend-map.md`:

```markdown
# Blend Map — <hostname> × <skill-name> — <ratio>% site / <100-ratio>% skill

## Color tokens
| Token | Site value | Skill value | Blended result | Source |
|---|---|---|---|---|
| --bg-base | #1a1a1a | #0f0f0f | #141414 | averaged |
| --accent | #e63946 | #7c3aed | #e63946 | site (brand identity) |

## Typography tokens
| Token | Site value | Skill value | Blended result | Source |

## Blend decisions
- Primary font family: [site | skill | averaged] — reason
- Accent color: [site | skill | averaged] — reason
- Border radius style: [site | skill | averaged] — reason
```

**Blend rules:**
- Colors: average HSL for neutrals; prefer site source for accent/brand colors.
- Typography: ratio ≥ 50% site → use site display font; always blend body font toward skill for readability.
- Spacing: use scale from whichever source matches the ratio.
- Motion: use easing/duration from whichever source matches the ratio.

## 3E.3 Write blended token file

Write `docs/research/<hostname>/blended-tokens.css` with all resolved `:root` values.

**Exit criterion:** `blend-map.md` complete. `blended-tokens.css` ready. Proceed to Phase 4.
