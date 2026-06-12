---
description: "Squad content and output rules — content blueprints, output strategy, HTML deliverables, and dashboard-facing artifact structure."
agents: [squad]
task_types: [content, output]
triggers: [content blueprints, session html, content output]
---

# Squad Content And Output

Use this module when the squad produces recurring content packages, structured outputs, or session HTML.

## Content blueprints

For content-heavy squads, define `contentBlueprints` in `squad.manifest.json`.
They should describe:

- `contentType`
- `layoutType`
- blueprint `sections`
- the dynamic contract of recurring deliverables

Do not hardcode domain-specific fields as framework-wide rules. The shell is fixed; the blueprint is domain-derived.

## Preferred structured output layout

When a deliverable is more than a one-off text file:

- create a `content_key`
- save under `output/{squad-slug}/{content-key}/`
- prefer:
  - `content.json`
  - `index.html`

Use this especially when the squad produces multiple sibling outputs in one package.

## Output strategy

If the domain suggests recurring data pipelines, webhooks, or storage-backed delivery:

- load `.aioson/tasks/squad-output-config.md`
- configure output explicitly

For file-first squads such as reports, landing pages, or one-off artifacts:

- default to `mode: "files"`

## Installed skill reuse

Before inventing output structures, inspect installed squad skills under:

- `.aioson/squads/{squad-slug}/skills/`

Reuse those skills if they already imply known output patterns or blueprints.

## Session HTML deliverable

After every productive response round, write:

- `output/{squad-slug}/{session-id}.html`
- update `output/{squad-slug}/latest.html`

The HTML should capture the actual session work:

- sober technical hero
- one section per round
- one rich block per specialist
- one synthesis block per round
- copy button per block
- copy-all button in the header

Stack:

- Tailwind CSS CDN
- Alpine.js CDN
- no build step
- no Google Fonts
- no external images

## Design direction for session HTML

- dark, technical, premium
- not neon dashboard
- restrained accents
- comfortable reading width
- preserve rich content instead of flattening it into summaries

## Output integrity

Never:

- overwrite another squad's output
- write HTML under `.aioson/`
- skip `latest.html`
- reduce structured content to a single blob if the domain naturally wants sections
