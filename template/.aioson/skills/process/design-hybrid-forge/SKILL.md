---
name: design-hybrid-forge
description: Process skill that creates project-local hybrid design skills by fusing exactly two primary design parents — each a local AIOSON design skill or an external DESIGN.md source (refero.design md-example or similar) — with optional limited modifiers. When activated, guides you through pair selection, identity synthesis, crossover spec, skill generation, preview creation, metadata, and optional promotion.
activation: |
  You are now running the design-hybrid-forge process. Begin by asking the user for the names of the two primary AIOSON design skills they want to combine, then ask whether they want optional modifiers. Use up to two modifiers by default, or up to three only when the active variation preset or the user explicitly enables advanced mode. Follow the phases described in this skill.
---

# Skill: design-hybrid-forge

> Process skill. Creates new hybrid design skills by fusing DNA from two existing AIOSON design skills.
> Load this file first. Then load only the `references/` file you need for your current phase.

## What this skill produces

A complete, production-quality hybrid design skill package for the current project:

```
.aioson/installed-skills/{hybrid-name}/
  SKILL.md
  .skill-meta.json
  references/
    art-direction.md
    design-tokens.md
    components.md
    patterns.md
    dashboards.md
    websites.md
    motion.md
  previews/
    {hybrid-name}.html
    {hybrid-name}-website.html
```

If tool-native skill folders exist, the finished package may also be mirrored to:

```
.claude/skills/{hybrid-name}/
.cursor/skills/{hybrid-name}/
.windsurf/skills/{hybrid-name}/
```

## When to load

Load this skill when:
- You want to create a new hybrid design skill from two base skills
- You are planning this week's hybrid (pair selection phase)
- You are executing the crossover (generation phase)
- You need to validate a hybrid before shipping
- You want an anti-sameness variation overlay for a more extravagant, classic, animated, or CSS-advanced result

Do NOT load this skill to apply a design skill to a project. Use the target hybrid's own SKILL.md for that.

## Output modes

### 1. Project-local installed skill (default)

Use this mode in normal AIOSON projects.

- Writes the new hybrid to `.aioson/installed-skills/{hybrid-name}/`
- Keeps the skill versioned with the project
- Generates local previews inside the skill folder
- Records author / generator metadata in `.skill-meta.json`
- Does not touch AIOSON core galleries or first-party skill folders

### 2. Core promotion (optional)

Use this mode only when the user explicitly wants to propose the hybrid back to AIOSON core or marketplace curation.

- Starts from an already-generated project-local skill
- Prepares promotion artifacts for `.aioson/skills/design/{hybrid-name}/`
- Updates gallery / registry files only in the core repo
- Must stay a separate step from project-local generation

## Process overview

| Phase | What happens | Produces |
|---|---|---|
| **1. Pair Selection** | Choose 2 primary skills with creative tension | Chosen pair + rationale |
| **2. Identity Synthesis** | Name, 3 pillars, accent fusion, substrate | Hybrid identity doc (in conversation) |
| **3. Crossover Spec** | Define DNA from A, DNA from B, optional modifiers, new elements | Crossover map (in conversation) |
| **4. Skill Generation** | Write SKILL.md + 7 reference files + metadata | Skill package |
| **5. Preview Generation** | Write dashboard HTML + landing HTML inside the skill package | 2 `.html` files |
| **6. Distribution** | Register in `AGENTS.md` and mirror to tool-native skill folders if present | Tool-ready copies |
| **7. Optional Promotion** | Prepare for core/gallery/marketplace only if requested | Promotion bundle |

Each phase must complete before the next begins. Do not skip phase 2 and 3 — they are what makes the hybrid coherent rather than a random blend.

## Input contract

```
primary_a: {skill-name}            # local AIOSON skill (e.g. "cognitive-core-ui") OR external:{DESIGN.md} (e.g. "external:linear")
primary_b: {skill-name}            # local AIOSON skill (e.g. "glassmorphism-ui") OR an external DESIGN.md source (refero.design md-example / similar)
modifiers: {optional 0..2}         # e.g. ["bold-editorial-ui"] or ["threejs-spatial"]
                                  # threejs-spatial is a special modifier: it layers WebGL/Three.js
                                  # on any primary pair, adding particle/3D scene as visual substrate
variation_overlay: {optional}      # selected via conversation or `aioson design-hybrid:options`
modifier_policy: {optional}        # "up_to_2_modifiers" by default, "up_to_3_modifiers" in advanced mode
name_suggestion: {optional}        # e.g. "aurora-command-ui" or leave blank
target_domain: {optional}          # e.g. "SOC platform" — narrows expression modes
author_name: {optional}            # e.g. "Jaime" or "ACME Design Team"
generator_model: {optional}        # fill if the runtime/tool exposes it
```

## Output contract

The hybrid must satisfy ALL of the following:
- 8 files (SKILL.md + 7 references) with full content — no placeholders
- 1 metadata file: `.skill-meta.json`
- 2 HTML previews: dashboard (operational) + landing page (marketing)
- A name that is original and not a concatenation of the parent names
- A new accent that is NOT identical to either parent's accent
- A substrate rule that is clearly stated and non-negotiable
- At minimum 5 expression modes in art-direction.md
- At minimum 20 components in components.md
- Exactly 2 primary parents
- At most 2 optional modifiers with limited scope by default
- Up to 3 modifiers only when advanced mode is explicitly enabled
- A single coherent visual system that can be selected as one `design_skill`
- Metadata that records authorship and generator/model details when available
- When a variation overlay exists, the generated skill and previews must visibly express it
- When a temporary variation preset exists, it must be archived or removed from active context after successful generation

## References available

| File | Load when |
|---|---|
| `references/pair-compatibility.md` | Choosing which two skills to combine this week |
| `references/crossover-protocol.md` | Running phases 2 and 3 (identity + crossover spec) |
| `references/variation-library.md` | Choosing a variation overlay or anti-sameness directions |
| `references/output-contract.md` | Running phases 4 and 5 (file generation) |
| `references/naming-registry.md` | Naming the hybrid and checking for conflicts |
| `references/quality-gates.md` | Validating the hybrid before shipping (distribution / promotion gates) |
| `references/external-source-ingestion.md` | Ingesting an external DESIGN.md (refero.design md-example or similar) as a parent or modifier |

## Non-negotiable rules

1. Exactly 2 primary parents are required. Never generate a hybrid with 3 or 4 co-equal parents.
2. Optional modifiers are capped at 2 by default. A 3rd modifier is allowed only in advanced mode and still cannot own substrate or structure.
3. The hybrid must have its own identity — not "A with B colors" but a third thing.
4. The crossover spec must be explicit: what comes from each primary parent, what modifiers influence, and what is new.
5. The accent must be a genuine fusion — not parent A's accent, not parent B's. A new value or gradient pair.
6. The substrate rule is always the first decision. One primary parent wins the background model.
7. The hybrid's SKILL.md must explicitly name its parents in a `## Hybrid DNA` section.
8. Never combine two primary skills from the same family (e.g. cognitive-core + premium-command = too similar).
9. Every hybrid ships with both previews and a `.skill-meta.json`. No preview = not done.
10. Project-local generation goes to `.aioson/installed-skills/` by default. Promotion to core is a separate, explicit step.
11. `design-hybrid:options` creates a temporary preset in `.aioson/context/design-variation-preset.md`; after successful generation, archive or remove the active preset and preserve the history snapshot.
12. **`threejs-spatial` modifier rules:** It is NOT a primary parent. It layers WebGL/Three.js as a visual enhancement on the chosen primary pair. It does not own substrate (CSS gradient is still the base), does not own structure (HTML layout is CSS), and does not own tokens. Accent colors from primary parents MUST flow through Three.js parameters. Three.js CDN (no npm install) is the only supported delivery mode.
13. **External DESIGN.md sources:** A primary parent or modifier may be an external DESIGN.md (refero.design md-example or similar). Normalize it to parent DNA via `references/external-source-ingestion.md`, record its provenance under `sources[]` in `.skill-meta.json`, and keep the anti-clone rule — the hybrid is a new identity: never reproduce the source's brand, logo, trademark, or exact palette 1:1, and never name the hybrid after the source.
