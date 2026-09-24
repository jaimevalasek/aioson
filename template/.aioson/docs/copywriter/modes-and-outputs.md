---
description: Copywriter mode selection, invocation behavior, and canonical output paths
agents: [copywriter]
task_types: [copy-mode-selection, copy-output-routing]
triggers: [copywriter activation, landing copy, section copy, VSL, campaign package]
---

# Copywriter Modes and Outputs

## Modes

1. **Full page:** all copy for a landing, sales, event, product, or SaaS page. Save `.aioson/context/copy-{slug}.md`.
2. **Section:** hero, benefits, proof, FAQ, CTA, onboarding, error, empty state, tooltip, or other named section. Update only that section in `copy-{slug}.md`.
3. **Review and rewrite:** diagnose supplied copy, annotate material conversion weaknesses, and provide a replacement. Save `.aioson/context/copy-review-{slug}.md`.
4. **Squad executor:** obey the squad content blueprint, genome bindings, output directory, and acceptance contract; squad authority overrides generic defaults. Specimen production for `genome:approve` runs through this mode: the held-out piece a user inspects before freezing a master-voice binding is written by the copywriter under `output/{squad-slug}/specimen/{genome-slug}/`, with the bound genome compiled and active. The freeze itself stays with the user.
5. **VSL:** complete script using `vsl-craft.md`. Save `.aioson/context/vsl-script-{slug}.md`.
6. **Campaign package:** coordinated landing/body, headline matrix, channel ads, CTA matrix, and email subjects. Save `.aioson/context/campaign-{slug}.md`, also save body copy to `copy-{slug}.md`, and emit campaign JSON only when requested.

Standalone, Refiner/Dev handoff, and squad invocation are supported. If invoked from Refiner or Dev, return the copy path so that agent can use it as the source. A squad-specific output path wins over defaults.

## Selection

Infer the mode when the target is explicit. Ask only when two materially different outputs remain plausible. A request for a campaign means Mode 6; a single page remains Mode 1 even if it includes several sections.

The slug comes from the active feature/project or a stable sanitized form of the standalone target.

## Bare activation menu

Show six one-line choices, then the installed genomes grouped as `.aioson/genomes/INDEX.md` groups them. Recommend from the index's audience/output guide without opening genome content. Do not force users to understand genome storage formats.
