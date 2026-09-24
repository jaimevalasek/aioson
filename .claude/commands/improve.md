---
description: "AIOSON inception repair — turn a consumer-project bad experience into a framework fix here. Use when the user brings a bug, quality failure, or bad-experience report (report file, screenshot, or plain account) from a project that uses aioson, even without typing /improve."
---

# /improve — AIOSON inception repair loop

$ARGUMENTS is the incident: a report path inside a consumer project (e.g. `C:/dev/playapps/<app>/researchs/<slug>/relatorio.md`), a screenshot path, or a plain-language account of what went wrong in a project that uses aioson. With no arguments, ask for the incident and stop.

## Framing — read this as the contract

This repository is the aioson framework (the npm package plus `template/`). Consumer projects are where failures are felt; they are never where the fix lands. The deliverable is always a framework change here — agents, skills, brains, docs, rules, CLI, gates — that makes the same class of failure impossible or machine-visible in every project, plus the consumer-side steps to pick it up (`aioson update`, re-run). A patch applied only to the consumer project is a failed outcome of this command.


## The loop

1. **Measure the incident.** Read the report/print; open the concrete artifacts in the consumer tree (prototype, manifest, telemetry, logs) read-only and reduce the complaint to reproducible facts: counts, diffs, or a live read-only run of this tree's CLI against the consumer artifact (`node bin/aioson.js <cmd> <consumer-root> ...` — always with `--no-persist` on `verify:artifact`: a measurement that writes the consumer's `.aioson/context/` report or the operator's palette registry is not read-only). A complaint you cannot measure yet is one you cannot prove fixed.
2. **Find where the framework let it pass.** The signature question: *why did every gate stay green?* Classify the escape and say which it is:
   - **misfire** — the intelligence existed but never ran (wiring / auto-fire gap);
   - **uncovered surface** — no check existed for this axis at all;
   - **wrong heuristic** — a check existed but structurally cannot see this shape;
   - **self-grading** — the model that produced the output was its only judge.
   Then name the owning layer: agent kernel (`template/.aioson/agents/`), routed doc (`template/.aioson/docs/`), skill (`template/.aioson/skills/`), brain (`template/.aioson/brains/`), rule, CLI/engine (`src/`), or gate (`verify:artifact` kind, `src/artifact-kinds.js`, workflow engine).
3. **Fix at the right layer — house doctrine.**
   - **Prose loses to model priors.** Every recurrence-class fix carries a deterministic or measured leg: a metric/lint in `src/lib/`, a `verify:artifact` check, an engine gate, auto-fire wiring. Prompt-only additions are reserved for judgment content, and even those anchor on a measured number the judge must consume.
   - **Placement is settled — do not relitigate:** shared criteria → brain (`q>=4` binding); procedure → routed docs (a real context-selector surface); craft → skills; measurement → `src/lib` + `verify:artifact`; `.aioson/rules/` stays the client's override channel, never the framework's carrier.
   - **Tier honestly:** blocking only when provable from text alone (near-zero false positives); everything needing context or taste is an advisory warning with samples so the rewrite is directed. A gate that cries wolf gets switched off.
   - **Generalize.** The fix must serve every stack, host, model, and authoring language (pt-BR-aware patterns, build-free where possible, model-agnostic) — never the incident project's shape.
4. **Respect the repo's contracts.** `template/` first, then mirror the tracked workspace copies (brains and docs ARE tracked; workspace `.aioson/skills` is gitignored — template only). Grep `tests/` for pinned phrases and counts BEFORE editing kernels or brains (kernel byte budgets; node and lens counts; exact-phrase pins). The suite runs foreground in quarters; the bar is zero NEW failures.
5. **Prove end-to-end.** Tests for the new check itself; suite green; and when the consumer tree is reachable, a live-fire showing the incident is now detected (read-only). Definition of done: *the same failure, replayed, is caught by a machine check or a bound criterion that auto-fires* — never "the agent will remember".
6. **Capture and deliver.** Brain/learning capture with anonymized provenance (`"src": "AIOSON supervised session: …"` — never the consumer project's name, never an external inspiration). Commit per the autonomy contract (`npm publish` stays manual). Final report in pt-BR: what the consumer felt → why the framework allowed it → what now prevents it everywhere → the exact consumer-side steps.

## Hard boundaries

- Never edit the consumer project unless the user explicitly asks — and the framework fix still comes first.
- Never weaken or special-case an existing gate to make the incident pass.
- Never ship consumer-project names or one-off paths into `template/` or `src/`.
- Never end with only a prompt-text change for a failure a machine could have caught.
