---
description: Advisory Jev semantic review for Briefing, Product, Sheldon, Dev, QA, Tester, and Pentester
task_types: [jev-review, semantic-review, agent-quality, decision-support]
triggers: [jev configured, agent handoff, independent review, evidence triage]
---

# Jev agent review protocol

Use `jev:agent-review` only after the agent's deterministic preflight has collected the relevant facts. It sends bounded, redacted excerpts from canonical feature artifacts plus compact outputs from existing read-only analyzers. Jev supplies typed semantic judgments; project rules, deterministic CLI findings, the owning agent, and user approvals remain authoritative.

```bash
aioson jev:agent-review . --agent=<agent> --feature=<slug> --phase=<preflight|review|handoff> --out=.aioson/context/features/<slug>/jev/<agent>-<phase>.json --json
```

Supported agents: `briefing`, `refiner`, `product`, `sheldon`, `planner`, `dev`, `qa`, `tester`, and `pentester`.

## Decision handling

- `status: reviewed`, `decision.passed: true`: semantic evidence supports the profile's ready route. Continue only if the agent's own deterministic contract is also satisfied.
- `status: reviewed`, `decision.passed: false`: inspect `decision.action`, raw answers, probabilities, and the named artifacts. Promote a concern into a finding only after tying it to concrete evidence.
- `decision.uncertain: true`: gather better evidence or use agent/human judgment. Confidence is uncertainty, not correctness.
- `status: skipped`: Jev is unavailable, unconfigured, or has no review artifact. Record the skip when useful and continue with the normal deterministic workflow.
- Never let a Jev PASS erase a CLI failure, missing AC, failing test, missing runtime proof, security finding, or required approval.

`--require-pass` is off by default. Use it only when project policy or the user explicitly makes that particular semantic review blocking. A remote service failure is otherwise non-gating.

## Evidence and privacy

The command may send redacted excerpts from the canonical briefing, PRD, implementation plan, QA report, or test report needed by the selected profile. It sends source-pack inventory and compact deterministic evidence, and does not automatically read source-pack or application source files; code snippets already embedded in canonical artifacts remain part of those artifacts. For Pentester, raw finding evidence, endpoints, credentials, and attack paths are omitted; only sanitized finding fields and coverage summaries are sent.

The normal persisted result contains hashes, artifact metadata, typed answers, probabilities, policy, model, and usage, but not the artifact excerpts. `--evidence-only` and `--dry-run` intentionally return the assembled spec for inspection; avoid saving or sharing those outputs when the artifacts are sensitive.

## Agent timing

| Agent | Recommended phase | Semantic purpose |
|---|---|---|
| Briefing | `handoff` | Source fidelity and framing readiness before Refiner |
| Refiner | `review` | Framing and source-fidelity assurance, including non-visual work |
| Product | `handoff` | Scope, CAP/AC coherence, and readiness for Sheldon |
| Sheldon | `review` | Independent specification challenge before Planner |
| Planner | `handoff` | AC, implementation-delta and vertical verification coherence |
| Dev | `handoff` | Implementation/evidence triage before QA |
| QA | `review` | Acceptance-evidence and routing support before verdict |
| Tester | `review` | Hypothesis and assertion quality before returning to QA |
| Pentester | `review` | Sanitized finding/coverage triage before QA adjudication |

Use `--evidence-only` first when changing a profile or diagnosing surprising behavior. Calibrate thresholds with representative project fixtures before adopting a blocking policy.

## Effective decisions and evidence scope

`decision.semantic_passed` describes the model judgment. `decision.deterministic` describes profile preconditions checked in code before compaction. `decision.passed` and `effective_action` combine both: failed required artifacts, relevant trace gaps, missing AC-test evidence or contradictory answers cannot recommend READY. Preflight does not require future-stage output. Security coverage is optional outside Pentester unless an existing report is incomplete. These checks do not approve workflow gates or attest test execution.

Truncated evidence is explicit. A required document omitted or truncated for budget cannot support global readiness. Use located relationships for precise critique. `--require-pass` also fails evidence-only/dry-run/skipped results: preparing a request is not passing a review.

## Located relationships (optional pilot)

To review a concrete promise or AC, prepare `.aioson/context/features/<slug>/jev/evidence.json`:

```json
{
  "version": 1,
  "relations": [{
    "id": "AC-checkout-01",
    "kind": "promise_acceptance",
    "claim": {
      "path": ".aioson/context/prd-checkout.md",
      "sha256": "<current full-file SHA-256>",
      "start_line": 20,
      "end_line": 24
    },
    "evidence": {
      "path": ".aioson/briefings/checkout/briefings.md",
      "sha256": "<current full-file SHA-256>",
      "start_line": 10,
      "end_line": 16
    }
  }]
}
```

Read the actual claim and locate its evidence before creating a pointer. Do not manufacture a supporting excerpt. Each relation yields supports/contradicts/insufficient_evidence/not_applicable, with its ID and source location. Confidence below 0.7 abstains; not_applicable requires owner adjudication, not automatic scope removal. These initial thresholds are uncalibrated.

Kinds: source_promise, promise_acceptance, plan_verification, acceptance_execution, test_hypothesis, security_finding. Use PROM-/CAP-/AC-/SEC- IDs. For acceptance_execution include `bindings: [{"path":"src/checkout.js","sha256":"<hash measured with the run>"}]`. These hashes must come from the run being cited; creating fresh hashes after a run does not establish freshness. The collector checks the current files and refuses stale references, but cannot independently certify the report's truth.

Only canonical briefing/PRD/plan/QA/test-report excerpts are shared by default. Other files, including source-pack and execution reports, require `--include-source`; inspect `--evidence-only` first. Paths must resolve inside the project, including symlinks. Limits: 24 relationships, 81 lines and 2,500 characters per span, 512 KiB per referenced file. Oversized or invalid input produces explicit incomplete evidence. Full requests use conservative UTF-8 byte budgets, not claimed tokenizer measurements. Do not send sensitive Pentester reproduction material.

For Product/Sheldon pilot source→promise→AC relations; for Planner pilot AC→phase/verification; for QA/Tester pilot AC→executed evidence/assertion. Keep the pilot optional and advisory. Absent relationships mean no relation-level assurance was performed; the global profile remains triage.

## Cache and measurement

Opt into answer caching with `"cache": true` inside `jev` in project-root `aioson-models.json`. Pinned models reuse valid answers for up to 24 hours by sanitized state, questions, provider and version; latest/preview aliases bypass caching. Changed policy thresholds reapply locally. Changed evidence invalidates the key. Cache entries contain answers and metadata, never excerpts. They live under `.aioson/cache/jev`; local events record request/use/failure/cache-hit and usage, bounded to 1 MiB. Cache failures remain non-gating.

From the AIOSON source checkout run `node scripts/testing/jev-evals.js` to validate the bilingual seed corpus without inference. Use `--live --project=<configured-project> --split=validation --out=<report.json>` only when ready to run the external provider against synthetic cases. `--results=<report.json>` replays measured results. Seeds and confidence thresholds are not a claim of model accuracy; measure false-ready, false-alarm, abstention, latency and tokens before adopting blocking policy.
