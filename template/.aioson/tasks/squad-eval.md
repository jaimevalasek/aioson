# Task: Squad Eval

> Execute the versioned source-rubric and held-out quality contract. Judge and
> route; do not repair the squad inside this task.

## When To Use

- `@squad eval <slug>`
- Before delivering a persistent or regulated squad
- After a refresh, genome compilation, or material source change

## Mandatory Preload

Load `.aioson/docs/squad/eval-gate.md` and the executor depth block in
`.aioson/docs/squad/package-contract.md`.

## Process

1. Read `squad.manifest.json`, source documents, executor prompts, Evidence Pack,
   genome compilation state, and the declared `evaluation` contract.
2. Reject criteria without an exact source or deterministic expectation.
3. Run:

   ```bash
   aioson squad:eval . --squad=<slug> --json
   ```

4. Inspect the per-dimension result. Never replace it with one aggregate score.
5. On `FAIL` or `UNVERIFIED`, route exact failed criteria/dimensions to
   `@squad refresh <slug>`. Do not claim readiness.
6. A generalized lesson may be captured as a playbook candidate. Do not promote
   it until a later held-out `PASS` validates the change.

## Output

- Machine report under `.aioson/squads/<slug>/evals/`
- Human report under `.aioson/squads/<slug>/docs/`
- Chat verdict with exact failed/unverified dimensions and reproduction command

## Rules

- Never invent a jury, execution, source, or candidate score.
- A critical failure remains visible regardless of totals.
- A bound genome requires measured with/without comparison.
- Persistent/regulatory readiness requires current `PASS`.
- Quick Scan deferral requires `evaluation.deferReason`.
