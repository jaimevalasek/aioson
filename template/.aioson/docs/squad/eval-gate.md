---
description: "Executable squad eval gate: source-grounded criteria, held-out tasks, genome A/B comparison, and reproducible evidence."
agents: [squad]
task_types: [eval, quality]
triggers: [eval gate, held-out, genome comparison, rubric]
---

# Squad Eval Gate

`aioson squad:eval . --squad=<slug>` is the enforced quality gate. It first runs
`squad:validate --strict` without requiring an older eval, then executes the
manifest's source rubric and held-out contract. It writes:

- `.aioson/squads/<slug>/evals/eval-<timestamp>.json`
- `.aioson/squads/<slug>/evals/latest.json`
- `.aioson/squads/<slug>/docs/EVAL-<date>.md`

The JSON report is validated against
`.aioson/schemas/squad-eval-report.schema.json` and records manifest, source,
artifact, compilation, and run evidence needed to reproduce the verdict.

## Evaluation contract

Declare `evaluation.contractVersion`, `criteria`, and `heldOutCases` in
`squad.manifest.json`.

Each criterion is one atomic claim with:

- stable `id`
- `kind`: `responsibility`, `depth`, `grounding`, `handoff`, `anti_pattern`, or `scope`
- `statement`
- exact `source`
- target `executor`
- deterministic `expectedTerms`

A criterion without a source or deterministic expectation is `unverified`; it
cannot be silently judged from model priors. `source` must resolve to an actual
manifest reference such as `manifest.goal` / `manifest.workflows[0]` or to a
contained project file. The report records the resolved source hash.

Each held-out case describes an unseen task plus either artifact assertions or
an executable worker. Manifest-authored numeric scores are threshold metadata,
not proof, and can never self-certify a `PASS`. A worker returns
`{"dimensions": {"<name>": 0..1}}`; artifact-only cases must declare deterministic
`expectedContains` / `expectedNotContains` assertions. Preserve every dimension.
Mark safety, grounding, or other blocking dimensions `critical`.

```json
{
  "id": "held-out-1",
  "task": "Create an unseen recommendation",
  "worker": "held-out-evaluator",
  "dimensions": {
    "grounding": {
      "threshold": 0.8,
      "critical": true,
      "evidence": "score returned by the held-out worker"
    }
  }
}
```

## Genome A/B

When a genome is bound, run the same unseen task with identical worker inputs
through the same worker twice:
`baselineRun` with genomes disabled and `candidateRun` with the compiled binding
enabled. AIOSON injects the controlled `_aioson_eval` envelope; changing workers
is not an A/B comparison and fails the control. The gate reports delta per
dimension. Any regression fails that dimension; improvement in style cannot hide
a grounding or safety regression. A binding without compiled effect or without
controlled A/B evidence remains failed/unverified.

## Verdict contract

- `PASS`: strict precheck passes, all critical criteria/dimensions pass, held-out
  evidence exists, and compiled genomes have non-regressing A/B evidence.
- `WARN`: verified non-critical dimension is below its target, with no critical
  failure.
- `FAIL`: strict precheck fails, a critical criterion fails, or an A/B dimension
  regresses.
- `UNVERIFIED`: required evidence, deterministic assertion, or held-out case is
  absent.
- `NOT_APPLICABLE`: only for an individual dimension such as genome comparison
  when no genome is bound; it never substitutes for the overall held-out proof.

Persistent and regulated squads require a current `PASS` report before premium
readiness. An ephemeral Quick Scan may defer only with a concrete
`evaluation.deferReason`.

## Optional model jury

Cross-AI review and reflection remain useful as additional evidence, but model
availability must not be fabricated and model votes do not replace the
deterministic contract. Persist any jury result as evidence for a dimension;
never average away a critical failure.

## Learning

A failed eval may capture a generalized playbook `candidate`. It is not active
guidance yet. Promote it only after a later held-out `PASS`:

```bash
aioson squad:playbook capture --rule="<failure pattern>" --lesson="<general correction>" --from=<slug>/<claim>
aioson squad:playbook promote --id=<candidate-id> --squad=<slug>
```

The promotion validates the eval-report schema and squad identity, retains the
original failure origin, and records later reinforcements as observations.
