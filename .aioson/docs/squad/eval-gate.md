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

`aioson squad:eval . --squad=<slug> --json --no-persist` measures without writing any of the three — a read-only probe of another squad, or a tutorial run.

The strict precheck also measures executor BODIES (`squad:validate` Layer 6): a prompt below the size floor or carrying placeholder text (TODO/FIXME/TBD/lorem ipsum) is an ERROR under `--strict`; a thin or bloated prompt, a missing core section, near-duplicate executors, and workers that read input only from argv are advisory warnings. `aioson verify:artifact . --kind=squad-package --slug=<slug> --advisory` runs the strict validation plus that lint, and auto-fires at `agent:done --agent=squad`.

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
not proof, and can never self-certify a `PASS`. Numeric evaluation requires a
separate scorer worker: the producer returns its output, while the scorer returns
baseline/candidate values and a non-empty explanation for every dimension.
Artifact-only cases must declare deterministic `expectedContains` /
`expectedNotContains` assertions. Preserve every declared dimension and mark
safety, grounding, or other blocking dimensions `critical`.

```json
{
  "id": "held-out-1",
  "task": "Create an unseen recommendation",
  "baselineRun": { "worker": "recommendation-producer" },
  "candidateRun": { "worker": "recommendation-producer" },
  "scorer": { "worker": "recommendation-scorer" },
  "deterministic": true,
  "seed": "held-out-1-v1",
  "dimensions": {
    "grounding": {
      "threshold": 0.8,
      "critical": true
    }
  }
}
```

The scorer must be a different content-bound worker from both producers and
must return, for example,
`{"dimensions":{"grounding":{"baseline":0.7,"candidate":0.9,"evidence":"citations matched the fixture"}}}`.
A producer's self-reported score, a scorer without per-dimension evidence, or a
case without explicit `deterministic: true` remains `UNVERIFIED`.

## Genome A/B

When a genome is bound, run the same unseen task with identical worker inputs
through the same worker twice:
`baselineRun` with genomes disabled and `candidateRun` with the compiled binding
enabled. The baseline context is the executor prompt with AIOSON's compiled
Genome block removed; the candidate context contains the actual materialized
block. AIOSON hashes both contexts and injects the controlled `_aioson_eval`
envelope; a changed worker/input, equal context hashes, or a candidate without a
compiled effect is not an A/B comparison. The gate reports delta per dimension.
Any regression fails that dimension; improvement in style cannot hide a
grounding or safety regression.

## Report integrity

`latest.json` is not trusted because it matches the schema. Validation
recomputes the manifest/source inventory, criterion evidence, worker source and
output hashes, scorer results, Genome contexts, section verdicts, and dimension
summary. `reproduction.engine_hash` binds the evaluator implementation and
`reproduction.evidence_hash` binds the canonical report evidence. A fabricated
or stale `PASS` is rejected even when its JSON is structurally valid.

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

Lane semantics: `creation-flow.md` § Delivery lane. Eval delta: persistent and
regulated squads require a current `PASS` report before premium readiness; an
ephemeral Quick Scan may defer only with a concrete `evaluation.deferReason`.

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
