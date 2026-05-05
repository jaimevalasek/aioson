---
feature: secure-by-default
status: approved
created_by: pm
created_at: 2026-04-28T21:22:39-03:00
classification: MEDIUM
gate: C
gate_status: approved
active_phase: "Phase 1 — Security Baseline Contract"
---

# Implementation Plan — Secure by Default

## Gate C Summary
Gate C aprovado para a Phase 1. Gate A está aprovado em `requirements-secure-by-default.md`; Gate B está aprovado em `architecture.md` e `spec-secure-by-default.md`. O escopo executável é somente o contrato de baseline: constituição + rule workspace/template. As fases de CLI, skill, pentester e runtime permanecem fora desta implementação.

## Required Context Package
1. `.aioson/context/requirements-secure-by-default.md`
2. `.aioson/context/architecture.md`
3. `.aioson/context/conformance-secure-by-default.yaml`
4. `.aioson/context/spec-secure-by-default.md`
5. `.aioson/plans/secure-by-default/plan-security-baseline-contract.md`
6. `.aioson/constitution.md` and `template/.aioson/constitution.md`

## Pre-Taken Decisions
- Article VII must be appended, never inserted or renumbered.
- Rule paths are `.aioson/rules/security-baseline.md` and `template/.aioson/rules/security-baseline.md`.
- The rule targets only `analyst`, `architect`, `dev`, and `qa`.
- Controls must use stable IDs `SEC-SBD-01` through `SEC-SBD-08`.
- Phase 1 must not modify `src/` or implement `security:*` commands.
- Phase 1 must not create `secure-tdd` or modify `@pentester`.

## Execution Sequence

| Phase | Scope | Primary files | Done criteria |
|---|---|---|---|
| 1 | Constitution amendment | `.aioson/constitution.md`, `template/.aioson/constitution.md` | Article VII exists in both files, `last_amended` updated, Articles I-VI unchanged |
| 2 | Security baseline rule | `.aioson/rules/security-baseline.md`, `template/.aioson/rules/security-baseline.md` | Frontmatter matches architecture; all eight controls have severity, agents, classification policy and evidence |
| 3 | Verification pass | conformance YAML + textual checks | AC-SBD-001..014 verifiable; no forbidden `.aioson/context/` files; no Phase 2+ scope added |

## Checkpoints
- After Phase 1: update `spec-secure-by-default.md` with constitution files changed and Article VII decision.
- After Phase 2: update `spec-secure-by-default.md` with rule files created and control IDs present.
- After Phase 3: record validation commands/results in `spec-secure-by-default.md`; keep `phase_gates.plan: approved` unchanged.

## QA Requirements
QA must verify `conformance-secure-by-default.yaml`, especially AC-SBD-001 through AC-SBD-014. High-risk checks: rule frontmatter agents, stable control IDs, MICRO advisory policy, MEDIUM Gate D blocking policy, direct LLM fallback, and no `src/` changes for Phase 1.
