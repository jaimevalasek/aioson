# Task: Squad Eval

> Source-grounded quality gate: derives a rubric from the squad's own sources and judges each executor with a multi-model jury. This is the enforced version of quality-lens. Opt-in / CI.

## When To Use
- `@squad eval <slug>` — direct invocation
- Before delivering/publishing a squad, or in CI as a gate
- After `@squad analyze` flags basic executors and `@squad refresh` applies corrections; re-check afterward

## Mandatory Preload
Load `.aioson/docs/squad/eval-gate.md` (method) and `.aioson/docs/squad/package-contract.md` § Executor depth block.

## Input
- Existing squad slug under `.aioson/squads/<slug>/`

## Process

### Step 1 - Gather Source Context
Read `squad.manifest.json` (including `sourceDocs`, `analysis`, executors + `traces`/`confidence`), `squad.md`, prompts in `agents/<executor>.md`, and `sourceDocs`/investigation when present.

### Step 2 - Synthesize Rubric
For each executor, extract atomic claims with source citation according to `eval-gate.md` § Step 1. Cover kinds `responsibility`, `depth`, `grounding`, `handoff`, `anti_pattern`, `scope`. If a claim has no source to cite, do not invent it; discard it.

### Step 3 - Judge
Grade each executor according to `eval-gate.md` § Step 2. If the squad has, or can declare, a `reviewer` executor with `cross_ai`, use the real multi-model jury (`claude`/`gemini`/`codex`); otherwise simulate a 3-lens adversarial jury (correctness / grounding / skeptic). Weight by agreement; mark split claims as `uncertain`.

### Step 4 - Gate + Report
Calculate coverage/agreement and verdict (PASS/WARN/FAIL) per executor and for the squad according to `eval-gate.md` § Step 3. Save `.aioson/squads/<slug>/docs/EVAL-<ISO-date>.md`:

```markdown
---
slug: <slug>
created_at: <ISO-date>
verdict: PASS | WARN | FAIL
coverage: <0-1>
agreement: <0-1>
---
# Eval-Gate — <slug> — <date>

## Verdict: <PASS|WARN|FAIL>  (coverage <x>, agreement <y>)

## Per-executor
| Executor | Coverage | Unmet claims | Verdict |
|---|---|---|---|
| <slug> | 6/7 | c3 (grounding) | WARN |

## Actionable diffs (route to @squad refresh)
- <executor> claim <id> (<kind>) unmet → <what to add>

## Uncertain (human glance — jury split)
- <executor> claim <id> — <why split>
```

### Step 5 - Route Corrections And Learn
For each FAIL/unmet claim, recommend `@squad refresh <slug>` with the specific diff. Do not fix it here; eval only judges and routes, like validate. `refresh` applies corrections.

Then capture the generalized lesson in the generator playbook:
`aioson squad:playbook capture --rule="<generation rule that caused it>" --lesson="<what to do instead>" --from=<slug>/<claim>`

Capture the rule, not the specific fix for this squad.

## Output
- `.aioson/squads/<slug>/docs/EVAL-<date>.md`
- Chat verdict + next commands

## Rules
- Do not fix anything; judge and route only.
- The rubric comes from sources; claims without citation do not enter.
- FAIL if any `depth` or `grounding` claim fails; a basic/source-less executor fails.
- Report coverage + agreement + breakdown by kind; never only a single number.
- Eval checks fidelity to spec/source, not real runtime performance. Recommend some execution checks before production.
- Update the rubric when sources change; an old rubric can approve a drifted squad.
