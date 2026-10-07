# Design Directions — Interface Design

Choose ONE direction. Never mix. Mixing produces visual noise.
The chosen direction defines spacing, typography, border strategy, depth, and motion posture — before components are built.

The token specs below are starting math, not a signature. In origination mode pair the direction with one register from `aesthetic-registers.md`; the register decides the typographic posture and texture, and the families named here are examples of a class, not defaults to accept unexamined. A face chosen because it was printed in this file is the same regression to the average the register exists to prevent. Color obeys the same law: the palettes in these blocks are class examples, and the actual hue family comes from the extracted identity or the seeded draw (`aioson design:seed`) — never from the model's favorite corner of the wheel, which is how unrelated projects end up wearing the same palette.

**App ranges never cap a site.** The type ranges inside the app directions (Precision, Warmth, Sophistication, Premium Dark) size the *product UI*. The moment the surface argues — a marketing page, an institutional site, a hero, a section opener — display scale comes from the register's premium bar (content-appropriate scale and hierarchy, fluid via `clamp()` where useful), and the typeface-delivery rule applies (a named face ships with a webfont link or embedded `@font-face`; see the build contract and brain node vq-020). Pairing "Warmth & Approachability" with a site and keeping its 24px ceiling is how a brand surface comes out looking like a settings page.

---

## Precision & Density

*For: dashboards, admin panels, developer tools, power-user interfaces.*

```
Foundation : Cool-tinted neutral ground (borders-only depth)
Spacing    : 4px base — scale: 4, 8, 12, 16, 24, 32
Colors     : foreground=ink, secondary=muted, faint=ink at 15% — the seed's
             contrast-solved roles; border=ink at 8% alpha; accent=the drawn or
             identity accent with one functional job (never a printed default)
Radius     : 4px / 6px / 8px  (sharp, technical)
Typography : system-ui, 11–18px, weights 400/500/600
             monospace: SF Mono, Consolas (for data/code)
Components :
  Button   → 32px height, 8px/12px padding, 4px radius, 13px 500-weight
  Card     → 0.5px faint border, 12px padding, 6px radius, NO shadows
  Table    → 8px/12px cell padding, tabular-nums, 13px font, 1px bottom border
Rationale  : borders-only maximizes density; compact sizing serves power users.
             system-ui is legitimate for dense tool chrome ONLY — wherever this
             product also argues aesthetically (marketing shell, brand moments),
             the typeface-delivery rule still applies (vq-020).
```

---

## Warmth & Approachability

*For: consumer apps, collaborative tools, onboarding flows, customer-facing products.*

```
Foundation : Warm-tinted ground (subtle shadows)
Spacing    : 4px base — scale: 8, 12, 16, 24, 32, 48 (generous)
Colors     : foreground=ink, secondary=muted on a warm-tinted ground; surface=one
             tonal step above the ground; accent=the drawn or identity accent
Radius     : 8px / 12px / 16px  (rounded, friendly)
Typography : one delivered warm grotesque (e.g., Familjen Grotesk), 13–24px, weights 400/500/600
Components :
  Button   → 40px height, 12px/20px padding, 8px radius
  Card     → 20px padding, 12px radius, surface one step above the warm ground
  Input    → 44px height, 12px/16px padding, 1.5px faint border
Rationale  : subtle shadows add approachable depth; generous spacing enables
             focused tasks; warm tones feel human and inviting.
```

---

## Sophistication & Trust

*For: fintech, enterprise SaaS, operational products where clarity and trust matter more than novelty.*

```
Foundation : Cool mineral (restrained layers)
Spacing    : 4px base — scale: 4, 8, 12, 16, 24, 32
Colors     : foreground=ink, secondary=muted (the seed's roles), surface=the
             ground's lightest step, border=ink at 10% alpha; accent=the drawn
             or identity accent at firm, low chroma
Radius     : 8px / 10px / 12px  (firm, not playful)
Typography : Public Sans or Hanken Grotesk, 12–20px, weights 400/500/600
Components :
  Button   → 38px height, 12px/18px padding, 10px radius
  Card     → 16px padding, 10px radius, subtle border, rare soft shadow
  Table    → 10px/14px cell padding, tabular-nums, quiet row dividers
Rationale  : trust comes from control, not decoration; a restrained palette and
             firm typography make the product feel expensive and dependable.
```

---

## Premium Dark Platform

*For: premium dashboards, media/catalog products, command surfaces, high-density apps with persistent navigation.*

```
Foundation : Graphite layers (borders-first)
Spacing    : 4px base — scale: 4, 8, 12, 16, 24, 32
Colors     : base=the drawn dark ground, surface=+0.035 L, elevated=+0.07 L
             (three tonal steps at the ground's own hue, never flat gray);
             foreground/secondary/muted=the seed's light ink roles;
             border=light ink at 8% alpha; accent=the drawn accent, chroma restrained
Radius     : 12px / 14px / 16px  (premium, controlled)
Typography : Manrope, Schibsted Grotesk, or Archivo, 12–22px, weights 400/500/600
Components :
  Button   → 40px height, 12px/18px padding, 12px radius
  Card     → layered surfaces, 16px padding, 14px radius, no heavy glow
  Sidebar  → quiet active state, compact icon rhythm, clean section grouping
Rationale  : premium dark works when contrast is controlled, surfaces are few,
             and borders quietly separate the system without turning neon.
```

---

## Immersive Media

*For: cinema, streaming, games, entertainment, launch pages built around footage or artwork — pairs naturally with the Cinematic register.*

```
Foundation : Near-black stage (light-based depth — scrims, not borders)
Spacing    : 8px base — scene rhythm: 8, 16, 24, 40, 64, 96
Colors     : base=near-black at the drawn ground hue, foreground=the seed's light ink,
             secondary=foreground at 72%, scrim=linear-gradient(transparent → base at 92%),
             accent sampled from the artwork, one only
Radius     : 0 for frames, 8px/16px for controls (frames sharp, controls soft)
Typography : display face at true display sizes (48–120px, tight leading) over media;
             UI 13–16px, quiet, out of the frame
Components :
  Hero     → full-viewport media, legibility scrim, one action, one meta row
  Rail     → edge-to-edge horizontal scroll with snap and a visible overflow cue
  Overlay  → controls fade on idle, return on pointer/focus, always keyboard-reachable
Rationale  : the media carries the design; UI recedes and light replaces borders.
             Scrims keep type legible without boxing the image.
```

---

## Brand & Presence

*For: institutional and brand sites — practices, studios, agencies, restaurants, portfolios — where the aesthetic IS the credibility argument. This is a site-class direction: it pairs with Editorial, Material, Quiet, or Constructed and executes at that register's premium bar, never at app scale.*

```
Foundation : identity-first — palette, faces, and material come from the extracted
             identity when one exists; the register supplies them otherwise
Spacing    : section rhythm 96/128px desktop, 48/64px mobile; 8px base inside components
Colors     : tinted neutrals mixed from the identity/register (color-mix/OKLCH),
             never flat gray; ONE accent with a real job
Radius     : per register — sharp frames read editorial, soft reads warm; pick once
Typography : one DELIVERED display face with personality (high-contrast serif,
             compressed or geometric grotesque — webfont link or embedded WOFF2)
             at clamp(2.5rem → 6rem+) where the surface argues; one quiet UI face;
             text-wrap: balance on headings, tightened display tracking
Components :
  Hero     → the subject at full presence (photography, generated-labeled imagery,
             or type AS the image at true display scale) + one clear action
  Sections → composed, not stacked: asymmetric grids, overlap, bleed, scale
             contrast; every section owns one idea and one dominant element
  Material → exactly one atmosphere from visual-effects.md (grain, wash, scrims,
             glass) carried consistently — plus reveals that make scrolling feel
             deliberate, honoring prefers-reduced-motion
Rationale  : a brand site is judged in the first viewport before a word is read;
             display typography, evidence imagery, and one committed material are
             the argument. App-scale type on a brand surface reads as a template.
```

---

## Conversion Landing

*For: landing pages, product launches, campaign pages — any surface whose job is one decision.*

```
Foundation : product-evidence-first; any register sits on top
Spacing    : section rhythm 96/128px desktop, 48/64px mobile; 8px base inside components
Colors     : quiet ground, ONE conversion accent reserved for the primary CTA —
             the accent appears on nothing that is not the action
Radius     : consistent with the paired register
Typography : the promise at display size (clamp 36–72px), proof at body size,
             headline line length under ~14 words
Components :
  Hero     → promise + real product evidence + primary CTA inside the first viewport
  Proof    → logos, numbers, testimonials with sources — never invented metrics
  Sections → narrative order: promise → proof → capability → objection → CTA
  CTA      → repeated at decision points with the same words and accent, nothing competing
Rationale  : a landing converts through evidence and one unmistakable action, not
             decoration; every section either advances the argument or leaves.
```

---

## Other directions (never build from one line)

These are flavors, not specs. Each resolves to full token math by pairing a direction above with its register executed at the premium bar — a build that starts from one of these lines alone has no spacing scale, no delivered face, and no material, and it will read as a template:

- **Data & Analysis** — Precision & Density + Technical register; monospace numerals carrying real weight
- **Editorial** — Brand & Presence + Editorial register at its premium bar (delivered display serif at magazine scale, plates, drawn rules) — never just "hierarchy and white space"
- **Minimal & Calm** — Brand & Presence + Quiet register; the premium bar demands the one thing worth the silence
- **Boldness & Clarity** — Brand & Presence or Conversion Landing + Constructed register; the uncomfortable choice committed
- **Utility & Function** — Precision & Density + Technical register with chrome dialed to near-zero
