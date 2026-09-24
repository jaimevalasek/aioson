---
description: AIOSON SDD artifacts/gates, process-skill routing, skill evidence, research cache, and session loading rules
task_types: [sdd, process-skill-selection, skill-audit, web-research]
triggers: [PRD, implementation plan, QA, process skill, research cache, web search]
---

# Gateway Process Skills and Research

## Spec-Driven Development

Canonical feature artifacts:

- `prd-{slug}.md`: Product-owned specification authority, independently enriched and hash-bound approved in place by Sheldon.
- `implementation-plan-{slug}.md`: Planner-owned vertical executable stages.
- `qa-report-{slug}.md`: independent delivery verdict.
- `.aioson/context/project-pulse.md`: short crash-recovery heartbeat updated at agent completion.

MICRO, SMALL, and MEDIUM use the same Product → Sheldon → Planner → Dev → QA route; classification controls depth/budgets, not extra documents. Briefing and Refiner are pre-product intake when raw sources need framing, not classification-driven extra stages.

For tracked features, load `.aioson/docs/feature-completeness-contract.md` and close:

`source file fingerprint → PROM → Product decision → CAP → current-system fit → AC → implementation delta → vertical phase → exact files → executable check → production-path evidence`.

Product, Sheldon, Planner, Dev, and QA load `.aioson/skills/process/aioson-spec-driven/SKILL.md` plus only their role reference at phase start. Optional specialists load it only for a concrete detour.

## Process-skill routing

| Skill | Trigger | Progressive load |
|---|---|---|
| `aioson-spec-driven` | PRD/planning/implementation/QA | `SKILL.md` + one role reference |
| `design-hybrid-forge` | explicit hybrid design generation | `SKILL.md` + current phase reference |
| `prompt-sharpener` | improve prompts/skills/instruction-heavy artifacts | `SKILL.md`; diagnostics reference only for multi-prompt audits/adoption |
| `review-intelligence` | concrete slug + artifact before existing gate | `SKILL.md` + exactly one of framing/specification/architecture/delivery-assurance |
| expansion scout/scope/audit | rich surface, prior expansion, or explicit richer options | applicable one skill + `.aioson/docs/feature-expansion-taxonomy.md` |

For a prompt, agent kernel, skill router, or other instruction-heavy artifact
audit, load `.aioson/skills/process/prompt-sharpener/SKILL.md` when its trigger
matches. Load its diagnostics reference only for a multi-prompt audit or adoption
assessment.

Review intelligence normally adds no gate. The canonical Sheldon specification review is the one exception: it is the mandatory hash-bound pre-Planner approval and stops after at most two passes. If its skill/CLI is unavailable, run the equivalent review manually but do not claim a machine-current review.

## Skill registry and usage evidence

`.aioson/skills/registry.json` declares first-party process-skill owners, triggers, load tiers, tests, lifecycle, and replacements. Eligibility is not proof of use. When a skill is actually loaded in a tracked/live session, emit best effort:

```bash
aioson runtime:emit . --agent=<agent> --type=skill_loaded --used-skills=<skill-id> --summary="Loaded <skill-id> for <reason>" 2>/dev/null || true
```

Inspect declared reachability and observed evidence with `aioson skill:audit . --reachability --usage`. Absence of observed telemetry is not by itself proof that a skill is abandoned.

Skill routers also carry routing frontmatter (`triggers`, `task_types`, `agents`, `paths`), so `context:brief` lists matching skills in its advisory `skills` section — check it before assuming no skill applies. Trigger reachability is proven, not assumed: `aioson context:evals .` replays the scenarios under `.aioson/evals/` through the real engine and its coverage report names every routed rule/doc/skill no scenario proves. When you add or reword routing frontmatter, run it; a failed scenario prints the exclusion cause and a concrete frontmatter fix. Reachable is not consulted: `aioson context:usage .` reads the runtime rows (`brief_built`, `*_loaded`, `agent_done`) — session ends without a brief, artifacts loaded that no brief offered, active skills nothing selected — and `agent:done` says so (advisory) when a kernel that mandates `context:brief` closes without one.

## Shared research cache

Before web search, check `researchs/{slug}/summary.md`; reuse it when no older than seven days and still applicable. After general web research, save:

```text
researchs/{slug}/
├── summary.md
└── files/{source-slug}.md
```

`summary.md` frontmatter includes `searched_at`, `agent`, `query`, and verdict `confirmed | has-alternatives | outdated | deprecated`. Cite consulted pages, not snippets. Product, Sheldon, and Squad are recurring writers and should scout short task-keyword matches.

Orache is the explicit domain-intelligence exception: it may read technical cache entries but persists new domain investigation to verified `squad-searches/` reports, whose schema and reuse registry differ from technical verdicts.

## Session loading

Do not read `.aioson/context/spec.md` or all rules/docs/skills globally. Use `context:brief`/`context:select`, the active role reference, or a concrete path. Update a spec context only if the active agent loaded and changed it.
