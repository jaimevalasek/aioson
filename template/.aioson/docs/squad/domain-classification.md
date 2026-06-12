---
description: "Squad domain classification — regulated vs specialized vs common domains, mandatory investigation policy, locale_scope decision, and persistence rules."
agents: [squad]
task_types: [squad-creation, classification]
triggers: [regulated domain, domain classification, locale scope]
---

# Squad Domain Classification

Use this module before approving a new squad blueprint or materially expanding an existing squad's domain.

## Classification gate

After the basic context is known, classify the domain before generating files or freezing the executor roster.

### Tier 1 — Regulated domains

Typical examples:

- health and pharmacy
- legal and compliance-heavy advisory
- finance, investments, and insurance
- food and nutrition with labeling or safety obligations
- regulated education
- cybersecurity with formal compliance scope
- veterinary, agribusiness, engineering, construction, accounting, and tax

Action:

- investigation via `@orache` is mandatory
- do not finalize the blueprint, workflow, or executor roster without the report
- if the user refuses the investigation, explain that the squad cannot be safely generated yet and stop

### Tier 2 — Specialized domains

Typical examples:

- niche gastronomy
- specialized marketing
- sports-specific training
- music production and music theory
- architecture and interior design
- non-clinical psychology or coaching
- specialized recruiting

Action:

- strongly recommend investigation
- if the user declines, continue only after recording the limitation in `assumptions` and `risks`

### Tier 3 — Common domains

Typical examples:

- general software delivery
- general marketing
- generic content creation
- productivity and project management
- broad business operations

Action:

- proceed directly
- do not create unnecessary friction by forcing investigation

## Ephemeral exception

Ephemeral squads default to Tier 3 operationally and may skip blocking investigation unless the user explicitly asks for regulated-domain rigor.

## Mandatory locale decision

After tier classification, decide whether the squad is universal or locale-specific.

If `.aioson/rules/agent-language-policy.md` is present, follow it as the source of truth.

Ask:

> "Should this squad be universal or locale-specific?
>
> 1. Universal — reusable across projects, agent files in English
> 2. Locale-specific — optimized for one country/language, agent files follow that locale"

Rules:

- default to `universal` when no strong local constraint exists
- if the domain is regulated in one country, suggest the locale that matches that jurisdiction
- if the user chooses locale-specific, capture both `locale_scope` and `locale_rationale`

## Integration with investigation

When investigation exists, do not leave it as a detached report. Apply it:

- domain vocabulary → executor mission, focus, and skill selection
- regulations and obligations → hard constraints, human gates, and review criteria
- anti-patterns → checklist items and `vetoConditions`
- benchmarks → quality checklist and warm-up expectations
- structural patterns → workflow phases and content blueprints

## Persistence

Write the following into the blueprint:

```json
{
  "domainClassification": {
    "tier": "tier-1-regulated",
    "rationale": "Why this classification applies",
    "regulations": ["ANVISA", "LGPD"],
    "investigationPolicy": "required"
  },
  "locale_scope": "pt-BR",
  "locale_rationale": "Brazil-only regulation and end users",
  "investigation": {
    "slug": "farmacia-regulada",
    "path": "squad-searches/farmacia-regulada/investigation-20260414.md"
  }
}
```

Copy `domainClassification`, `locale_scope`, `locale_rationale`, `investigation`, and `sourceDocs` into the final manifest when they exist.
