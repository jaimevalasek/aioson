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

Every squad is file-first, regardless of domain:

- `storagePolicy.primary` is `file`
- `outputStrategy.mode` is `files`
- `fileOutput.enabled` is `true`
- SQLite may index the files for the local dashboard and search, but it is never the only copy

If the domain suggests recurring data pipelines or webhooks:

- load `.aioson/tasks/squad-output-config.md`
- choose structured file formats and configure delivery explicitly

Treat `sqlite`, `hybrid`, and `dataOutput` as legacy manifest inputs. Migrate only after a canonical file export
exists. The runtime database is local per clone, gitignored, rebuildable, and never part of squad portability.

## Installed skill reuse

Before inventing output structures, inspect installed squad skills under:

- `.aioson/squads/{squad-slug}/skills/`

Reuse those skills if they already imply known output patterns or blueprints.

## Session HTML deliverable

Create a session HTML view when the user requests it, the squad's delivery contract requires it, or a multi-part package benefits from a browsable presentation. A one-off text, process receipt or software artifact can use its native format. When HTML is applicable, write:

- `output/{squad-slug}/{session-id}.html`
- update `output/{squad-slug}/latest.html`

Use the accepted files and structured session data as the source. Reuse the existing output skill/template and update changed sections; do not regenerate the presentation on every response. HTML is a view, not evidence of acceptance.

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
- leave `latest.html` stale when maintaining a session HTML view
- use SQLite as the sole copy of generated content
- reduce structured content to a single blob if the domain naturally wants sections
