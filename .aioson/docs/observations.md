---
description: "What an agent notices outside its current scope — a defect beside the feature, an improvement idea, a process gap, a risk, a question a later stage will need — goes on record with aioson observe, is surfaced where the owner and the next agent already look, and is settled once with observation:resolve. Never fixed in passing, never dropped, never a gate."
agents: []
task_types: [observation, triage]
triggers: [observation, observations, noticed outside, out of scope finding, outside the scope, side finding, improvement idea, process gap, for later, next time, observação, observações, fora do escopo, achado lateral, ideia de melhoria, para depois, da próxima vez, observación, fuera del alcance]
aliases: [working memory, site notebook, memória de trabalho, caderno de obra]
load_tier: trigger
---

# Observations — the project's working memory

Plastering one wall, a worker sees that a tile laid hours ago by someone else has cracked, that the stairs would be safer with one more step, that the cement should arrive next to the mixer next time, and that phase 4 will have to choose mixer or floor. None of it is the current job; all of it is lost when the session compacts — or, worse, "fixed in passing" outside the approved scope. An observation is the one line that keeps it: typed, on record at the project level, visible to the owner and to the agent it concerns, settled once.

## What goes on record

| kind | it is… | example |
|---|---|---|
| `defect` | something broken that is not yours to fix now | a cracked tile in another room |
| `idea` | a product or design improvement | one more step on the stairs, a wooden handrail |
| `process` | how the work itself could run better next time | deliver the cement next to the mixer |
| `risk` | something that may break later | the scaffold that wobbles |
| `question` | a choice a later stage will need, not blocking now | mortar in the mixer or on the floor |

Not an observation: the user's standing preference (`aioson op:capture`), a technical choice made now (`aioson decide`), a decision only a human can make that blocks the feature (`aioson decision:add`), a QA finding on the delivered scope (the QA report), continuity before `/compact` (`mappings/{slug}/continuity.md`).

## How to record

One call, from any agent, the moment it is noticed:

```bash
aioson observe . --kind=<defect|idea|process|risk|question> --summary="<one line, domain words>" [--paths=a,b] [--detail="..."] [--feature=<slug>] [--agent=<self>]
```

The feature defaults to the active one, the agent to the active one. The same summary observed again raises its `seen` count instead of duplicating; a settled item observed again reopens, with the earlier outcome kept as history. Secrets are redacted on write. Then continue the current work: do not fix it, do not widen the scope, do not ask the owner mid-task unless it blocks you.

## Where it surfaces

- `aioson workflow:status .` → `Open observations: N (defect 2, idea 1), 1 stale` and `openObservations` in `--json`; @neo prints the same line in its dashboard. This is the owner's triage fan.
- `aioson context:brief . --agent=<you>` → `Open observations for you (N)`: the open items whose kind addresses your agent (defect/risk → dev, qa, tester, planner, pentester; idea → product, briefing, refiner, sheldon; question → the feature chain) and that belong to your feature, to no feature, or to the paths you passed.
- `aioson workflow:next .` → `[Observations] N open for @<next>` on the handoff, so the next stage inherits them.
- `aioson feature:close .` → open items bound to the closed feature are carried to the project hub (`origin_feature` kept), never deleted; `--preflight` lists what would be carried.
- `aioson hygiene:scan .` → `stale_observations`: open for 30 days or more.
- After `/compact`, the session recap lists the observations touched in the last 24 hours, so you neither re-report nor "fix from memory".

`aioson observation:list . [--kind=<kind>] [--feature=<slug>|project] [--all]` prints the whole fan grouped by kind, each with its next step.

## How it is settled

```bash
aioson observation:resolve . --id=OBS-xxxxxx --as=<fixed|planned|promoted|answered|dismissed> [--ref=<plan path|feature slug>] [--why="..."] [--by=<who>]
```

- `fixed` — corrected inside an authorized scope (a Simple Plan, the feature it belongs to).
- `planned` — a Simple Plan exists for it: `--ref` must be its existing path.
- `promoted` — it became a feature, a rule, a learning or an operator decision: `--ref` must be the existing feature slug or artifact path.
- `answered` — the question has its answer in `--why`, where the stage that needs it reads it.
- `dismissed` — `--why` records the reason; a dismissed item that is observed again reopens.

The owner settles; an agent settles only what it was authorized to fix or plan. A reference that does not exist is refused: an outcome recorded against nothing is how an item gets lost while "handled".

## Authority boundary

Observations are noncanonical memory in `.aioson/context/observations.json`, written only by the CLI. They never create scope, grant approval, satisfy a workflow gate, change a QA verdict, or prove anything. A `defect` on the delivered scope is a QA finding, not an observation. A `question` that blocks the current stage is `decision:add`, not an observation.
