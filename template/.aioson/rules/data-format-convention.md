---
name: data-format-convention
description: Which file format to use when producing or consuming structured data — YAML for agent-readable reference data, Markdown for narrative, JSON for machine-consumed data
priority: 8
version: 1.0.0
---

# Data Format Convention

## Decision rule (apply in order)

```
Will a machine (CLI, API, webhook, dashboard) consume this? → JSON
Will human/agent read top-to-bottom as narrative?          → Markdown
Will an agent reference specific fields to make decisions? → YAML
```

If uncertain: prefer Markdown. Only use YAML when structured fields are the point.

## The three formats

### YAML — structured data for agent field-by-field consumption

LLMs read YAML more accurately than JSON for reference data (comments allowed, less punctuation).

Use for: ICP profiles, persona profiles, audience segments, offer sheets, pricing structures, brand guidelines (structured parts), competitive analysis (structured), briefing data for copy/design squads.

**Example (`icp-primary.yaml`):**
```yaml
profile:
  name: "Agency-Dependent Founder"
  description: "Business owner dependent on agencies or external developers"
pain_points:
  - Loss of control over the product
  - Unpredictable delays and costs
desired_outcome: "Autonomy and speed"
buying_trigger: "Deadline approaching or delayed developer invoice arriving"
messaging:
  primary: "Take back control of your product"
channels: [instagram, linkedin, youtube]
```

### Markdown — narrative for humans and linear agent reading

Use for: reports, analyses, article drafts, scripts, agent instructions, specs, PRDs, discovery docs, README files, any output read top-to-bottom.

Never use YAML or JSON for: articles, scripts, agent instructions, PRDs, analysis narratives.

### JSON — structured data for machine consumption

Use for: `squad.manifest.json`, `content.json`, API payloads, webhook responses, CLI config files.

Never change to YAML: `squad.manifest.json`, `content.json`, `squad.json`, `aioson-models.json` — machine-consumed, must stay JSON for CLI compatibility.

## Squad executor output format

| Output type | Format | Example |
|---|---|---|
| Report, article, script | `.md` | `output/content-squad/ep-001/script.md` |
| ICP, persona, audience profile | `.yaml` | `output/research-squad/icp-primary.yaml` |
| Brand data, offer sheet | `.yaml` | `output/brand-squad/offer-advanced.yaml` |
| Competitive analysis (structured) | `.yaml` | `output/research-squad/competitors.yaml` |
| Competitive analysis (narrative) | `.md` | `output/research-squad/market-report.md` |
| Webhook payload, API response | `.json` | handled by `content.json` convention |
| Squad manifest, config | `.json` | `squad.manifest.json` (do not change) |

**Cross-squad consumption:** when Squad A produces data for Squad B, prefer YAML for structured reference — more reliable than parsing a Markdown table.

## What NOT to change

- `.json` files consumed by AIOSON CLI or dashboard
- Agent instruction files (`agents/*.md`) — narrative, not data
- Existing specs and context files — Markdown is correct
- YAML frontmatter inside `.md` files
