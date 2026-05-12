---
genome: copywriting
reference: application-notes
load_priority: medium
---

# Application Notes — Foundational Copywriting Genome

## Best applied to

- **Any direct response copy** as foundational base layer
- **Multi-format campaigns** (sales page + ads + emails) where consistent foundational discipline matters
- **Junior copywriter onboarding** — foundational principles before specialization
- **`@copywriter` automatic load** — this genome is the always-loaded baseline

## Tone

This genome is **niche-agnostic** and tone-neutral. The tone follows:
- The applied master genome (Halbert = warm/personal; Kennedy = bold/contrarian; etc.)
- The persona genome if applied (Ladeira = mainstream BR; Diogo = periferia BR; etc.)
- The brand voice if applicable

This foundational genome **does NOT impose tone**. It provides discipline.

## When this genome alone is enough

Almost never. This is foundational — it should pair with at least one applied master.

The exception: very simple copy needs (a basic email, a one-line ad, a quick social post) where master-specific depth would be overkill. Even then, applying foundational principles produces competent direct response.

## Combination rules

### Foundational + ONE applied master = standard

`@copywriter` typically loads:
- This genome (always) — foundational baseline
- ONE applied master per piece — school-specific depth

Examples:
- US health VSL → foundational + `copywriting-georgi`
- US classical direct mail → foundational + `copywriting-halbert`
- US course launch → foundational + `copywriting-brunson` + maybe `copywriting-kennedy`
- BR mainstream copy → foundational + `copywriting-ladeira`
- BR autoral content → foundational + `copywriting-icaro-de-carvalho`
- BR aggressive direct response → foundational + `copywriting-diogo-gomes`
- Almost any → foundational + `copywriting-schwartz` (theoretical depth)

### Foundational + TWO applied masters = exception case

Only when:
- Schwartz (foundational theory) + ONE applied execution master is the standard "Schwartz + applied" pairing
- Brunson + Kennedy is the canonical course launch pairing (Kennedy was Brunson's mentor)
- Halbert + Schwartz is the canonical direct mail tradition pairing

### Foundational + brand-voice genome (if applicable)

For branded content, add a `brand-voice-{slug}.md` genome layered on top. Example:
- foundational + `copywriting-halbert` + `brand-voice-acme.md` = direct response copy in Acme's specific voice

## Loading conditional skills (`.aioson/skills/marketing/`)

This genome references detailed files in `.aioson/skills/marketing/references/`. Load on demand:

| When writing... | Load these references |
|-----------------|----------------------|
| Any marketing/sales page | `patterns.md` + `anti-patterns.md` |
| Offer / pricing section | `offer-structure.md` + `fascinations.md` |
| Research phase | `pms-research.md` + `market-intelligence.md` |
| Narrative structure | `five-acts.md` + `one-belief.md` |
| VSL script | All references + `.aioson/skills/marketing/vsl-craft.md` |

These references are deeper deep-dives that complement this genome's frameworks. Load only when needed.

## When this genome doesn't apply

- **Brand-only content** without conversion goal (use `@copywriter` for sales-driven content; use other agents for brand)
- **Pure creative writing** (this genome is salesmanship, not creative)
- **Visual design** (use `@ux-ui`)
- **SEO / technical** (use `landing-page-forge.md` skill)
- **Internal communication** (use other writing patterns)

## Awareness × Audience match

Foundational copywriting addresses ALL Schwartz Awareness Levels:
- Level 1 → Lead-heavy structure (build problem awareness)
- Level 2 → Mechanism-heavy structure (problem already known; solve it)
- Level 3 → Mechanism + differentiation
- Level 4 → Offer-heavy structure
- Level 5 → Direct close

The 5-act structure adapts to all levels by adjusting per-act emphasis (see `references/methodology.md`).

## Modern application

This genome's principles transfer to:
- Sales pages (long and short)
- VSLs (any length)
- Email sequences
- Webinar pitches
- Course launches
- Coaching offers
- Service offerings
- Product launches
- Even short-form content (TikTok, Reels) when conversion is the goal

The format changes; foundational discipline doesn't.

## Why this genome doesn't have advisor mode

This genome is **foundational principles**, not a person. There's nothing to consult — just frameworks to apply.

If the user wants to consult about copy:
- For a specific master's perspective → use that master genome's advisor mode (Ladeira, Ícaro, Diogo Gomes are advisor-ready)
- For general copy advice → load this genome + Schwartz; apply the frameworks directly

## Foundational genome vs. master genomes — the hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Brand Voice (project-specific, if applicable)                  │
│  ↑                                                              │
│  Persona / Master Genome (Schwartz, Halbert, Kennedy, Brunson,  │
│   Georgi, Ladeira, Ícaro, Diogo Gomes — pick 1-2)               │
│  ↑                                                              │
│  Foundational Copywriting Genome (this one — always loaded)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The foundation is the bottom layer. The masters add school-specific frameworks. The brand voice adds project-specific tone. All layers compose.

## Self-evaluation: when this genome's frameworks are enough vs. need master extension

| Situation | This genome alone | + Schwartz | + Applied master |
|-----------|-------------------|-----------|------------------|
| Simple email | ✅ | optional | not needed |
| Standard sales page | ⚠ adequate | ✅ recommended | ✅ stronger |
| Long-form VSL | ⚠ shallow | ⚠ better | ✅ required |
| Course launch | ⚠ shallow | ⚠ better | ✅ required (Brunson) |
| BR market copy | ⚠ generic | ⚠ generic | ✅ required (BR persona) |
| Premium positioning | ⚠ generic | ⚠ generic | ✅ required (Kennedy) |
| High-ticket B2C | ⚠ inadequate | ⚠ better | ✅ required (Halbert/Kennedy) |

The pattern: this genome is **necessary** but rarely **sufficient**. Pair with at least one applied master for non-trivial work.
