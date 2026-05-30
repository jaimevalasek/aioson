# Roadmap — Source-grounded, eval-gated, self-improving squads

> Status: **roadmap / not scheduled**. Forward-looking direction for the squad subsystem.
> Origin: 2026-05-30 SOTA scan (`researchs/squad-generation-sota-2026/summary.md`).
> Dev-facing planning doc — intentionally NOT in `template/` (does not ship to user projects).

## Thesis
Move squad generation from **static-template quality** to a **closed loop where the quality bar is auto-derived from the source material, enforced at the gate, and the generator self-improves from the gap to that bar.** Most frameworks (CrewAI/AutoGen) are static manual definition; 2026 auto-designers optimize task-success, not source-fidelity, and expose no authoring self-improvement loop. This is the differentiator.

## Stage 0 — foundation (DONE, this commit)
- `squad-validate` now enforces the depth block (warn; error under `--strict`) — the gate finally rejects basic executors.
- `create` persists `analysis` + per-executor `confidence`/`traces` to the manifest (+schema) — so `squad-analyze` can actually read them.
- Prereqs already shipped: depth block (9c72b40), domain decomposition (b9813ae), analyze→refresh loop (ffc6cd2).

## Stage 1 — Eval gate (IMPLEMENTED — MVP, prose-first)
> Shipped: `docs/squad/eval-gate.md` (method) + `tasks/squad-eval.md` (`@squad eval <slug>`) + wired into `squad.md` routing/preflight + referenced from `squad-validate`. The jury reuses the existing `reviewer`/`cross_ai` primitive (claude/gemini/codex). Hardening (deterministic coverage scoring + judge calibration in `src/`) remains future work.

Derive the quality bar from the SAME sources that generated the squad.
- **What:** from `sourceDocs`/design intent, synthesize a **binary, citation-grounded rubric** (each executor's mandated responsibilities, handoffs, depth requirements) — YourBench-style (arXiv 2504.01833) + EvalAgent implicit criteria (2504.15219).
- **Judge:** grade each executor `.md` with a **multi-model jury weighted by reliability** (AutoRubric 2603.00077; BT-σ jury 2602.16610). Gate on coverage + agreement.
- **AIOSON wiring:** extends `quality-lens.md` (evaluative) into an enforced `validate` layer; emit per-claim failure diffs that route to `@squad refresh`. Reuse the manifest's existing `review_criteria`/`voting` primitives.
- **Caveat:** verifies fidelity-to-spec, not real-world perf → pair with a few task-execution evals; judges fragile to formatting → jury + calibration, not single judge.

## Stage 2 — Citation-grounded persona depth
Make the depth block evidence-anchored, not vivid prose.
- **What:** extract a hierarchical competency tree FROM sources with a **source-span citation per node** (DeepPersona depth-first, 2511.07338); build persona/expertise from cited nodes; gate with atomic fidelity ACC_atom (2506.19352) — reject drift from sources.
- **AIOSON wiring:** upgrade `package-contract` § Executor depth block + the create distillation step; `expertise.sources` becomes per-node spans, not a flat list.
- **Honest:** CrewAI role+backstory lineage (our depth-block ancestor) is ergonomic, not grounding — "vivid backstory ≠ deep behavior". Ground only where source coverage is real (PRISM trade-off 2603.18507).

## Stage 3 — Retrieval-grounded role pool
Derive the roster from the corpus, not priors.
- **What:** expand the executor role pool by **retrieval over the source docs** (ARG-Designer document-conditioned generation, AAAI'26 2507.18224; CARD conditioning 2603.01089) instead of the fixed originate/transform/judge lens.
- **AIOSON wiring:** upgrade design Passo 2.5 decomposition — role candidates retrieved from `researchs/` + sources.

## Stage 4 — Self-improving generator (ambitious; research-grade)
The generator learns from the squads it produces.
- **What:** treat the generator's own rules (creation-flow/package-contract) as an **optimizable playbook**; when a squad fails the gate or a user rejects output, a **Reflector reads traces, diagnoses which generation rule failed, appends a delta** to a `.aioson/` "what-works" memory (GEPA reflective evolution 2507.19457; ACE delta playbooks 2510.04618). Compounds per squad built.
- **Caveat:** prompt optimizers OVERFIT to dev sets → refreshed held-out evals + multi-signal score. Open-ended self-rewrite (DGM) is research/safety-gated, not infra.

## Build-on (already in AIOSON)
Manifest already has: `tasks[].review_loop` + `review_criteria` + `max_review_iterations` (evaluator-optimizer), `tasks[].voting` (sampling+consensus), `workflows[].phases[].review`/`vetoConditions`. The jury/eval loop EXTENDS these — not greenfield.

## Implementation plans — remaining stages (sized honestly)
- **Stage 2 (persona grounding) — medium, mostly prose.** Add `expertise.sources` as per-node *source spans* (not a flat list) in the depth block (`package-contract`); a create sub-step that mines a competency tree from `sourceDocs` with a citation per node; the eval-gate `grounding` claim already enforces it. ~2-3 doc edits + optional `src/` span extractor.
- **Stage 3 (retrieval-grounded role pool) — larger, needs code.** Expand the role-candidate pool in design Passo 2.5 by *retrieval* over `sourceDocs` + `researchs/` (embeddings). Requires a `src/` embedding/retrieval module — not prose-only. Do after Stage 2.
- **Stage 4 (self-improving generator) — a project on its own.** A Reflector reads eval-gate failures + user rejections, diagnoses which generation rule failed, and appends deltas to a `.aioson/` "what-works" playbook that `creation-flow`/`package-contract` load. Needs trace capture + a delta-memory store in `src/` + safety guardrails (overfit/held-out, no open-ended self-rewrite). Keep staged until Stages 1-2 prove out.

## Sequencing
Stage 0 (done) → **Stage 1 (MVP done)** → Stage 2 → Stage 3 → Stage 4 (only after 1-3 prove out). Each stage is independently shippable.
