---
description: Orache report schema, artifact gate, runtime registration, Squad integration, promotion, and continuity
agents: [orache]
task_types: [investigation-report, squad-handoff, research-continuity]
triggers: [write investigation, verify report, register investigation, compact research]
---

# Orache Report and Integration

## Write incrementally

Create the target report before browsing and append validated findings as dimensions complete. Keep the query/evidence matrix until synthesis is finished; remove redundant working queries but retain limitations and the Evidence Ledger.

```markdown
# Investigation Report: {domain}

> Investigator: @orache
> Date: {ISO-date}
> Mode: full | targeted | quick
> Goal: {squad or standalone goal}
> Expected output: {output type}
> Constraints / jurisdiction: {material scope}
> Dimensions investigated: D1, D2, ...
> Confidence: high | medium | low — {evidence rationale}
> Cache basis: {none or reused report path/date}

## Summary
- {3–5 operational discoveries}

## D1: Domain Frameworks
## D2: Anti-patterns
## D3: Quality Benchmarks
## D4: Reference Voices
## D5: Domain Vocabulary
## D6: Competitive Landscape
## D7: Structural Patterns

## Impact Analysis
- **Executors:**
- **Skills / genomes:**
- **Checklists / evidence:**
- **Content blueprints:**
- **Anti-pattern guards / vetoes:**
- **Vocabulary injection:**
- **Operational breadth:**

## Evidence Ledger
| Source | Type | Published / checked | Dimensions | Supports | Limitation |
|---|---|---|---|---|---|

## Gaps and Unknowns
- {unverified, stale, contradictory, mode-omitted, or follow-up item}
```

Every report keeps all seven headings. Use `Not investigated in this mode.` for mode omissions. `Dimensions investigated` lists only dimensions with evidence work. Confidence describes the evidence body; it is not a completeness score.

Before creating a standalone file, inspect the same-day default path. Reuse it only for the same contract; for a different goal/output/constraint set, add a stable goal suffix. Never overwrite unrelated investigation evidence.

## Verify and register

Run the blocking content gate:

```bash
aioson verify:artifact . --kind=orache-report --file=<report-path>
```

Then register operational metadata:

```bash
aioson squad:investigate . --sub=register --report=<report-path> --domain="<domain>" --mode=<full|targeted|quick> --json
```

Registration lets later Orache/Squad activations find and reuse recent work. If runtime storage is unavailable, the verified report remains authoritative; disclose only when it prevents reuse/linking.

When investigation runs before Squad creation, do not pass `--squad` to registration because the manifest may not exist. Return the report path; after creation, Squad may link it with:

```bash
aioson squad:investigate . --sub=link --investigation=<investigation-slug> --squad=<squad-slug> --json
```

## Handoff summary

Present:

- top five operational discoveries;
- actual dimensions investigated and confidence rationale;
- roster changes;
- checks/vetoes/blueprint/vocabulary changes;
- contradictions and gaps;
- exact report path and registration status.

From Squad, return to `@squad`. Standalone, offer the report as input to `@squad design --investigation=<report-path>`. Do not force Product/Planner when squad creation is the stated goal.

## Reusable asset suggestions

After delivery, assess reuse:

- Suggest `.aioson/skills/squad/domains/{domain}.md` only when several future squads could reuse frameworks, anti-patterns, benchmarks, structures, and executor guidance.
- Suggest `.aioson/rules/squad/{rule}.md` only for universal/mode/domain constraints that should override future defaults.
- Suggest `@profiler-researcher` only when a reference voice is the squad's central methodology.

Explain the evidence and scope, then wait for explicit approval. Specific investigations remain reports; not everything becomes a skill or rule.

## Continuity

Near context pressure, flush the partial report with completed/pending dimensions and run:

```bash
aioson context:compact . --agent=orache --input=<report-path> --session=<domain-slug> --json 2>/dev/null || true
```

On resume, read `.aioson/context/last-handoff.json` and the report before any new source. Continue only pending dimensions; do not re-search completed ones unless their evidence was marked stale or contradicted.
