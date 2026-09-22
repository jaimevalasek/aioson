---
description: Jev semantic review protocol for QA delivery and Refiner prototype critique
task_types: [visual-quality, qa, refinement, jev-review]
triggers: [jev configured, visual delivery, rich interface, prototype critique]
---

# Jev review protocol

Load this module only for visible/rich work when Jev is configured. `jev:review` combines deterministic HTML/CSS/JS and runtime evidence with a typed semantic judgment. It is a critic, never an authority that can override tests, AC evidence, browser behavior, accessibility, security, `verify:artifact`, or human approval.

## QA route

Run after deterministic verification and the production-path walkthrough, pointing to authored sources and the served app when both exist:

```bash
aioson jev:review . --profile=qa --dir=<interface-root> --url=<served-entry> --runtime --criteria=.aioson/context/prd-{slug}.md --conformance={slug} --out=.aioson/context/jev-review-qa-{slug}.json --json
```

A semantic PASS cannot erase an objective issue or missing AC. A semantic FAIL becomes a QA finding only after its concern is tied to evidence or reproduced. If Jev is unavailable, record it as skipped and continue. Do not use `--require-pass` unless project policy or the user explicitly made Jev blocking.

## Refiner route

After deterministic visual evidence, run once per materially changed prototype version:

```bash
aioson jev:review . --profile=prototype --slug={slug} --runtime --criteria=.aioson/briefings/{slug}/briefings.md --out=.aioson/briefings/{slug}/jev-review-prototype.json --json
```

Use evidence-backed concerns as critique input for `refinement-findings.json`; do not auto-approve, loop indefinitely, or promote low-confidence output. User-controlled briefing/prototype approval remains the only approval. If Jev is unavailable, record it as skipped and continue.

## Privacy and image boundary

Interface code becomes derived measurements by default. `--criteria`/`--intent` send their redacted text, and `--include-source` additionally sends limited redacted source excerpts to the configured external provider; use them only when appropriate. Jev never receives screenshot pixels from this command. Screenshots remain human evidence; claim image judgment only when a separate multimodal analyzer supplied an explicit description.
