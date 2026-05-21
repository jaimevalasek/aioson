# Mock Fixture — MEDIUM feature smoke chain

Used by `scripts/smoke-run-chain.js` (T6 — workflow-handoff-integrity v1.10.0)
to exercise F1/F2/F3/T5 end-to-end without invoking real LLMs.

Per DD-04: smoke runs **mock-only mode**, deterministic and fast. Real
LLM-driven smoke is a separate future gate, out of scope for v1.10.0.

## Fixture content

Each `mock-{agent}.json` represents the artifact an agent would produce
plus the spec frontmatter mutations needed to advance gates.

- `mock-product.json`   → `prd-{slug}.md`
- `mock-analyst.json`   → `requirements-{slug}.md` + `spec-{slug}.md` (with `gate_requirements: approved`)
- `mock-architect.json` → `architecture-{slug}.md` + spec mutation (`gate_design: approved`)
- `mock-pm.json`        → `implementation-plan-{slug}.md` + spec mutation (`gate_plan: approved`)
- `mock-dev.json`       → spec update (`gate_execution: approved` placeholder)
- `mock-qa.json`        → spec final QA Sign-off (`Verdict: PASS`)

## Freshness rule (PMD-05 / Sheldon R2)

This fixture is **kept minimal and stable**. The CI smoke workflow
(`.github/workflows/release-smoke.yml`) does NOT depend on snapshot
content here — it depends only on the structure and the public APIs
of F1/F2/F3/T5. When the underlying contracts change, regenerate the
fixtures from the new contract; do not patch them in place.
