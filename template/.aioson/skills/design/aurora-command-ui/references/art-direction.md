# Art Direction — Aurora Command UI

Read this file for any page-level work where differentiation matters: dashboards, apps, landing pages, detail pages, and major flows.

This file exists to stop Aurora Command UI from collapsing into the same "dark blur dashboard" every time. The glass system and command structure stay coherent, but the expression must change with the product, the user, and the dominant task.

---

## Core Rule

**Same hybrid system, different expressions.**

Keep the Aurora Command DNA:
- aurora gradient substrate (always — non-negotiable)
- dark glass surfaces revealing the aurora below
- teal-electric + violet accent fusion
- mono section rails (section headers, stat labels, metadata only)
- command center structural discipline

But do **not** keep the exact same layout, stat row, sidebar density, or glass intensity from product to product.

---

## Mandatory Pre-Build Outputs

Before designing a full page, produce all of these:

1. **Human**
   The real person using this page right now. Not a persona category — a specific human in a specific moment.

2. **Main action**
   The one decision, action, or question that matters most on this screen.

3. **Felt quality**
   Concrete words such as `surgical`, `atmospheric`, `immersive`, `authoritative`, `precise`, `cold`, `elevated`, `focused`.
   Never use empty labels like `dark and modern`, `clean`, or `glassmorphic`.

4. **Domain vocabulary**
   At least 5 concepts from the product's world.
   Example for security: `threat vector`, `signal`, `incident`, `triage`, `posture`.
   Example for AI platforms: `agent`, `token budget`, `inference`, `pipeline`, `hallucination rate`.

5. **Material world**
   At least 5 tones or materials that belong to that product world.
   Example for infra/ops: deep void black, aurora teal glow, electrical violet pulse, graphite panel, amber alert.
   Example for AI tools: obsidian depth, charged teal, spectral violet, crystalline white, signal amber.

6. **Defaults to avoid**
   Name 3 obvious choices that would make the result generic.
   Example: "blur everything at the same opacity", "four equal KPI cards as the opening statement", "teal glow on every surface equally".

7. **Signature move**
   One memorable glass+command detail that appears in at least 5 places on the page.
   Example: "gradient stat numbers (teal → violet) in the hero metric card, repeated in chart highlights, progress bar fills, active badge text, and the primary CTA."

If you cannot produce these seven, you are not ready to compose the page.

---

## Expression Modes

Choose **one primary mode** per screen. You may borrow small traits from a secondary mode only after the main expression is clear.

### 1. Eclipse Command

**For:** SOC platforms, infra monitoring, security operations, network command centers, incident response tools.

**Feel:** cold, surgical, exact, high-trust, atmospheric authority.

**User:** security analyst or infra engineer making rapid triage decisions under pressure.

**Composition:**
- Aurora substrate at deep navy-black end of the spectrum
- Glass panels dense with real-time signals — alert clusters, live metrics, service health maps
- Mono section rails everywhere — ACTIVE THREATS / SIGNAL FEED / SERVICE STATUS
- One dominant threat/signal surface above the fold
- Sidebar is narrow and utilitarian — icon labels, no decorative padding
- Teal-electric accent for alert signals, status dots, and live indicators
- Violet accent for severity escalation, CTA actions, and critical alerts

**Visual cues:**
- `--glass-blur-md` (16px) on panels — crisp, not atmospheric
- Tight vertical rhythm (compact density)
- Alert tape or live status strip as section opener
- Mono IDs and timestamps as primary metadata rails
- Semantic red/amber/green for operational health (never for decoration)

**Signature ideas:**
- Status tape across the top of the main panel showing live signal counts
- Inset command strip for rapid actions (acknowledge, escalate, assign)
- Threat heat row with severity-color glass chips
- Live pulse animation on active threat metrics (glow-pulse at low amplitude)

**Blur level:** `--glass-blur-md` (16px) for panels — visibility over atmosphere.

---

### 2. Deep Analytics

**For:** BI platforms, data warehouses, revenue analytics, financial intelligence, performance reporting.

**Feel:** precise, dense, trustworthy, data-rich, controlled.

**User:** analyst or finance director extracting insight from structured data to support a decision.

**Composition:**
- Aurora substrate at the deeper indigo/violet end of the spectrum
- Glass chart containers are the hero — full-width area charts, donut breakdowns, ranked tables
- Stat row with gradient numbers as the credibility anchor above charts
- Sidebar holds dimension filters and saved views — compact glass list
- Gradient fills in all chart areas (teal → transparent area, violet → transparent for secondary)
- One dominant trend chart above the fold as the main analytical narrative

**Visual cues:**
- `--glass-blur-md` for chart containers, `--glass-blur-sm` for data rows (visibility)
- Tabular-nums throughout — numbers must align
- Chart tooltips as small glass cards (not white boxes)
- Section headers over every major data zone
- Gradient accent on the "hero" metric only — not all four stats

**Signature ideas:**
- Metric strip glass bar (one full-width glass strip with 4-5 metrics inline, dividers glass-border)
- Hero trend chart with gradient fill revealing aurora below
- Gradient text only on the principal metric (revenue total, pipeline value, key KPI)
- Chart area fills that echo the aurora gradient — teal to transparent, not flat fill

**Blur level:** `--glass-blur-md` (16px) for containers, `--glass-blur-sm` (8px) for rows.

---

### 3. Void Editorial

**For:** Dark aurora landing pages, product websites, developer tool marketing, AI company home pages, premium SaaS marketing.

**Feel:** atmospheric, premium, intelligent, aspirational, technically credible.

**User:** prospect or evaluator scanning for whether this product belongs in their world.

**Composition:**
- Full-viewport aurora hero — gradient pushed toward the deepest end
- Glass hero card or glass content strip floating over the aurora
- Asymmetric or split narrative sections — not centered text on every section
- Gradient text on key headline words
- Glass feature cards with stagger entrance
- Mono overlines above hero heading and section titles
- Proof rail, testimonial glass card, stats strip

**Visual cues:**
- `--glass-blur-lg` (24px) for hero card and featured glass elements
- More whitespace between sections than dashboards — `var(--space-20)` to `var(--space-24)`
- Full-bleed aurora field behind the hero, implemented as page-level radial and linear layers rather than isolated blurred circles
- Glass nav that becomes more opaque on scroll
- One gradient CTA button — primary, large, confident

**Signature ideas:**
- Full-bleed aurora field visible behind the glass hero card (deep navy, teal, violet blended across the viewport)
- Gradient text only on the power words in the hero headline
- Glass proof strip (full-width glass bar with social proof metrics)
- Product theater frame in a glass card with slight rotation

**Blur level:** `--glass-blur-lg` (24px) for hero, `--glass-blur-md` (16px) for feature cards.

---

### 4. Quantum Workspace

**For:** AI development platforms, code editors with AI, ML training dashboards, developer workspace tools, API playgrounds.

**Feel:** immersive, focused, intelligent, enabling, technically saturated.

**User:** developer or ML engineer spending extended time working inside the platform.

**Composition:**
- Aurora substrate as the persistent atmosphere for a full-screen workspace
- Glass app shell: top bar + glass sidebar + main work surface + right context panel
- Main work surface dominates — not a grid of cards but a primary editor/output/canvas area
- Context panels (metrics, logs, agent status) as glass panels flanking the work surface
- Mono labels for context rails: MODEL / TOKENS / LATENCY / PIPELINE STEP
- Violet accent for model selection and primary actions; teal for runtime signals and live status

**Visual cues:**
- `--glass-blur-sm` (8px) for non-primary panels (performance — this is a working environment)
- `--glass-blur-md` (16px) for sidebar and top bar
- Compact density throughout — this is not a marketing dashboard
- Code/mono typography for output areas and configuration rails
- Gradient only on active model indicator and primary CTA

**Signature ideas:**
- Token budget progress bar (teal fill, width animates as tokens consumed)
- Live inference latency gauge as a glass instrument panel chip
- Active pipeline step indicator: mono step number + teal border on active step card
- Status ribbon: RUNNING / IDLE / ERROR / QUEUED — teal/amber/red/gray chips in a glass strip

**Blur level:** `--glass-blur-sm` (8px) primary panels, `--glass-blur-md` (16px) shell elements.

---

### 5. Crystal Intelligence

**For:** AI agent CRM, sales intelligence platforms, contact management with AI enrichment, talent intelligence, account management.

**Feel:** curated, intelligent, elevated, dimensional, trustworthy.

**User:** account manager or analyst working within a rich entity profile — a person, company, or deal.

**Composition:**
- Aurora substrate at moderate depth — not the deepest void, slightly more luminous
- Profile header glass card as the focal anchor: avatar + name + stat cards + badge chips
- Tab navigation within the profile — Properties / Activity / Intelligence / History
- Detail sections as glass cards in a structured 2-column layout
- DNA/trait panels with progress bars and tag clusters
- Relation cards (linked entities) as compact glass mini-cards in a grid

**Visual cues:**
- `--glass-blur-md` (16px) for all containers
- Avatar with glass border (luminous rgba white)
- Gradient text on the "lead stat" (score, value, rank)
- Progress bars with teal fill for positive metrics, amber/red for risk
- Mono section headers: INTELLIGENCE PROFILE / ENGAGEMENT SIGNALS / RELATIONS

**Signature ideas:**
- Profile header glass card with aurora peeking through — identity panel with depth
- Trait/DNA panel as a visual signature — labeled progress rows with color semantic fills
- Relation network: compact glass cards in auto-fill grid, each with status badge
- "Intelligence score" as a circular progress indicator or large gradient stat

**Blur level:** `--glass-blur-md` (16px) throughout — consistency reinforces trust.

---

## Signature Library

These are immediately available for any Aurora Command composition. Pick at least 2 per screen.

| Detail | Usage |
|--------|-------|
| Gradient stat numbers (teal → violet) | Hero metrics, KPI cards, principal report numbers |
| Mono section rail (uppercase, text-xs, tracking-widest) | Every section header, stat label, metadata zone |
| Top reflection `::before` | Every glass card, modal, sidebar |
| Teal glow shadow | Active states, featured cards, hero containers |
| Glass sidebar revealing aurora | App shell, always |
| Accent gradient on primary CTA | Buttons, key actions, active badges |
| Status tape above main panel | Ops/monitoring dashboards |
| Compact alert chip row | Incident feeds, urgency signals |
| DNA/trait panel with progress rows | Profile pages, entity detail |
| Full-bleed aurora field behind hero | Landing pages, auth pages |
| Live pulse on active metric | Real-time dashboards, monitoring |
| Glass nav deepening on scroll | All website navigation |

---

## Anti-Generic Tests

Run all five before presenting the result.

### Aurora Glass Test
Remove `backdrop-filter: blur()` from all glass panels. If the UI still looks fine without it, glass is decorative — the aurora is not showing through the panels. Fix: reduce dark glass alpha so the aurora gradient is clearly visible behind every major panel. The aurora must be the "floor" the glass rests on, not just a background hidden behind solid panels.

### Command Test
Remove all mono labels. If the section structure collapses without them, they are load-bearing. If nothing changes, mono was decorative noise — remove the overuse. Mono rails should appear 4-8 times on a typical dashboard page, not on every text element.

### Depth Test
Squint your eyes. Can you distinguish: (1) the aurora substrate, (2) the glass panels, (3) the content within panels? If everything blurs into the same dark soup, increase the opacity contrast between the aurora background and the glass panels, or increase blur intensity.

### Gradient Test
Does the accent gradient appear in a meaningful structural place — not just buttons? It should appear in at least: stat numbers (hero metric), one CTA, one active state (tab underline or sidebar indicator), and a chart fill or progress bar. If it only appears on one button, it's a decoration token, not a signature.

### Domain Test
Hide the product name. Does the page still feel like it belongs to a specific operational world — security, analytics, AI workspace, or sales intelligence? Or does it feel like "dark SaaS with teal"? If domain identity is absent, push the composition to reflect the product's operational vocabulary.

---

## What Makes Each Mode Distinct

| | Eclipse Command | Deep Analytics | Void Editorial | Quantum Workspace | Crystal Intelligence |
|---|---|---|---|---|---|
| Aurora depth | Deepest void (almost black) | Deep indigo | Deep, atmospheric | Moderate (work surface) | Moderate + luminous |
| Glass blur | blur-md (crisp) | blur-md / blur-sm | blur-lg (atmospheric) | blur-sm / blur-md | blur-md (consistent) |
| Opening move | Alert/signal cluster | Hero trend chart | Aurora hero + glass card | Work surface dominates | Profile header card |
| Mono usage | Dense — all metadata rails | Data labels + stats | Hero overline + sections | Context rails | Section headers |
| Density | High (compact) | High (data-rich) | Low (marketing) | Medium-high (workspace) | Medium |
| Signature element | Status tape / live signals | Gradient stat numbers | Aurora field + glass hero | Token budget / pipeline steps | DNA trait panel |

---

## Non-Negotiable Expression Rules

1. One aurora depth tone, one expression mode, one signature move per page.
2. The teal-violet gradient belongs to the structural vocabulary — not scattered as decoration.
3. Mono rails signal operational zone boundaries — overuse destroys the signal.
4. The aurora substrate must show through the glass — this is the proof of craft.
5. Background atmosphere supports the operational narrative; it does not replace it.
6. If the design feels like "dark dashboard with blur filter", push the composition until the aurora and glass relationship is structurally evident.
