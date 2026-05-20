---
feature: workflow-handoff-integrity
slug: workflow-handoff-integrity
classification: MEDIUM
status: in_progress
started: 2026-05-19
analyst_completed: 2026-05-20
release_strategy: progressive
release_sequence: ["v1.9.5 (F2)", "v1.9.6 (F3)", "v1.9.7 (F1)", "v1.9.8 (T5)", "v1.10.0 (T6)"]
architect_completed: 2026-05-20
gate_requirements: approved
gate_design: approved
gate_plan: approved
---

# Spec — Workflow Handoff Integrity

## What was built

### Phase 1 — F2 (v1.9.5 candidate) — 2026-05-20

**Status:** Implementation complete, 13/13 unit tests passing, awaiting full npm test + manual smoke + Gate D for release.

**Changes:**

- **`src/handoff-contract.js` (EXTEND per DPC-03):** New public async helper `getCanonicalArtifactsForAgent(agent, targetDir, state)` consumes existing CONTRACTS map (linhas 15-99). Returns absolute artifact paths array, `null` if agent unknown, `[]` if agent legitimately has no canonical artifact (e.g. `@committer`, `@dev`). Exported from module.exports. Validated via smoke `node -e "..."` with 6 cases (analyst feature/project mode, @pm MEDIUM/non-MEDIUM, unknown agent, empty agent).

- **`src/commands/runtime.js` (EXTEND):** New private helper `maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options, logger, t })` (lines 1308-1448). Gating: `--no-auto-advance` opt-out first (DD-01); `workflow.state.json` absent → backward-compat (AC-F2-02); corrupt JSON → warn + skip (AC-F2-09); idempotency 1s window via `last_workflow_event_at` (BR-01); CONTRACTS lookup via lazy-require (circular safety); artifact existence check before advance. Calls `runWorkflowNext` with `options.json: true` + quiet logger to suppress prose, emits ONE concise stdout line on success. Best-effort: any error logged but non-fatal.

- **`src/commands/runtime.js#runAgentDone` (INJECT 2 call sites):** After existing `logger.log` (preserves AC-F2-02 baseline byte-format) and BEFORE `isDocCreatingAgent` block, in BOTH live session branch (line 1226) and standalone branch (line 1286): `await maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options, logger, t });`.

- **`tests/baselines/agent-done-stdout.txt`:** Backward-compat baseline file documenting expected stdout format for 3 modes (standalone, live session, --json). Includes normalization rules for placeholder substitution + Risk-11 update protocol.

- **`tests/agent-done-auto-emit.test.js`:** 13 new tests covering AC-F2-01..10. Uses `os.tmpdir` fixture pattern matching existing test conventions. Targets `maybeAutoAdvanceWorkflow` directly (exported for testability).

**Deviations from plan (documented):**

- DPC-03 deviation already applied (extend `handoff-contract.js` vs create new `agent-artifact-map.js`).
- `maybeAutoAdvanceWorkflow` helper added inline to `runtime.js` (next to its caller) rather than separate file — simpler boundary, single file for F2 logic.
- AC-F2-04 (telemetry order) tested via code review checklist (manual) rather than fixture — fixture can't observe internal call ordering without mocking; documented in `wiring-audit-workflow-handoff-integrity.md` § Code review notes for `@qa` verification.

**Coordination with existing infrastructure (DPC-05):**

`src/commands/workflow-next.js:429-479` already has integrity check **inverso** (SQL query for `agent_done` events; warns if completed stages lack telemetry). F2 auto-advance is **forward direction** (agent:done → workflow:next emit). Both coexist without conflict — F2 ensures the SQL `agent_done` row is committed BEFORE `runWorkflowNext` is called (AC-F2-04 ordering), satisfying the existing integrity check.

### Phase 2 — F3 (v1.9.6 candidate) — 2026-05-20

**Status:** Implementation complete, 10/10 unit tests passing, awaiting full npm test + Gate D.

**Changes:**

- **`src/commands/workflow-next.js` (EXTEND per DPC-01 — file is workflow-next.js, not workflow.js):** New helper `assertManifestNotPending(targetDir, slug, force)` reads `.aioson/plans/{slug}/manifest.md` frontmatter and throws `WORKFLOW_NEXT_PENDING_DECISIONS` error when `status` matches `^pending-(.+)-decisions$`. Hybrid DD-02 implementation: regex generic match + whitelist `[architect, product, pm, qa]` for warn on unrecognized states (still blocks but flags typos). `--force` flag overrides per AC-F3-03. Wired into `runWorkflowNext` at start of `options.complete` branch (line 992, before `finalizeCurrentStage`) — AC-F3-05 precedence.
- **`tests/workflow-next-pending-guard.test.js`:** 10 new tests covering AC-F3-01..07 (hard error, regex match, unknown captured group, --force override, no manifest, no slug, pattern specificity, status field robustness, whitelist export).
- **Exports added:** `assertManifestNotPending`, `PENDING_STATE_WHITELIST` (for test access + future consumers).

**Coordination notes:**

Existing `logErrorLine` helper in `runWorkflowNext` is reused for the error message before throw (consistent CLI error pattern). Error code `WORKFLOW_NEXT_PENDING_DECISIONS` is unique and parseable by upstream consumers.

The composto F2+F3 scenario (analyst completes + auto-emit triggers + manifest pending → guard blocks) will be covered in Phase 5 (T6) smoke test — not feasible as unit test without full runtime.

## Entities added

**N/A — feature framework-internal, sem entidades de domínio.**

Schema evolution local em `.aioson/runtime/workflow.state.json` (novo campo `last_workflow_event_at` para idempotency BR-01) NÃO conta como entity — é evolução de file format com backward-compat (missing field = zero).

## Key decisions

### Pre-made decisions (registradas pelo @sheldon no manifest)

- **PMD-01** (2026-05-20) — F2 segue modelo imperativo (centralizado em `agent:done`), não declarativo (instrução em cada agent file). **Reason:** reduz superfície de erro (não depende de cada prompt estar correto). Source: briefing Theme 2.
- **PMD-02** (2026-05-20) — F3 CLI guard é hard error (exit code != 0), não soft warning. **Reason:** silenciar leva ao deadlock observado em aioson-com 2026-05-19. Source: PRD O2.
- **PMD-03** (2026-05-20) — F1 é warning acionável com comando direto, NÃO cleanup automático silencioso. **Reason:** PRD Out of scope explícito — não queremos perder estado por automation surpresa.
- **PMD-04** (2026-05-20) — T5 warning local + hard fail em pre-publish, não bloqueante para development. **Reason:** evita fricção em workflow normal de dev; só bloqueia release.
- **PMD-05** (2026-05-20) — T6 fixture greenfield gerada fresh a cada CI run (`npm pack + aioson setup`), NÃO pinada no repo. **Reason:** elimina drift entre source canônico e fixture. Source: sheldon R2.
- **PMD-06** (2026-05-20) — `@pm` é owner do `implementation-plan-workflow-handoff-integrity.md` (MEDIUM). **Reason:** AC-SDLC-15 da migração 981a8fd já completada via v1.9.3.
- **PMD-07** (2026-05-20) — Wiring audit pré-closure obrigatório (`wiring-audit-{slug}.md`). **Reason:** brain sheldon-006 ★5 anti-pattern — design-complete ≠ execution-complete.

### Deferred decisions (require @architect — Gate B)

- **DD-01** — Backward-compat semantic exato de `agent:done` modificado.
- **DD-02** — F3 CLI guard: regex genérico vs whitelist explícita de pending states.
- **DD-03** — T5 sync-agents-preflight semantic check granularity (token vs section vs hash).
- **DD-04** — T6 smoke test em qual harness (Claude Code? Codex? ambos?).
- **DD-05** — Release strategy: progressive (recomendado) vs single MEDIUM v1.10.0.

### Architect resolutions (2026-05-20)

- **DD-01 RESOLVED** — `agent:done` backward-compat: gating por **presence de `.aioson/runtime/workflow.state.json` ativo** (não flag `--auto-advance`). Override é flag `--no-auto-advance` (opt-out). Reason: convention over configuration; flag opt-in seria má UX para o caso default.
- **DD-02 RESOLVED** — F3 CLI guard: **regex genérico `^pending-(.+)-decisions$` + whitelist `[architect, product, pm, qa]` para warn em estados desconhecidos**. Reason: extensibilidade (novos estados pegam auto) + safety (typos flagados, não silenciados).
- **DD-03 RESOLVED** — T5 semantic diff: **section-level (headers `##`/`###`) + token-aware code blocks (tokens em `agent-runtime-alignment.test.js`) + frontmatter field-level**. Skip plain text body (cosmetic noise). Reason: balança signal vs noise; pega caso 981a8fd literal.
- **DD-04 RESOLVED** — T6 smoke test: **mock-only mode (sem LLM real)** para v1.10.0 inicial. Reason: T6 testa mecânica de auto-orquestração, não qualidade de LLM; mock-only é determinístico/rápido/barato; LLM-real é follow-up separado.
- **DD-05 RESOLVED** — Release strategy: **progressive `F2 → F3 → F1 → T5 → T6`** em v1.9.5 → v1.9.6 → v1.9.7 → v1.9.8 → v1.10.0. Reason: inception risk (F2 broken hoje), bisect granularity, user value velocity, npm publish é manual (low friction adicional).

### Dev path corrections (2026-05-20 — pre-implementation scan)

Após scan sistemático antes do code change (per user request "escanear tudo"), identificadas discrepâncias entre paths declarados em architecture + implementation-plan e a estrutura real do codebase. Correções aplicadas inline em todos os artefatos (architecture, implementation-plan, spec, requirements, plan-f2, plan-f3, plan-t5):

- **DPC-01** — `src/commands/workflow.js` ❌ não existe. Realidade: workflow CLI está SPLIT em 8 arquivos (`workflow-next.js`, `workflow-status.js`, `workflow-execute.js`, `workflow-harden.js`, `workflow-heal.js`, `workflow-plan.js`). `runWorkflowNext` está em `src/commands/workflow-next.js` linha 970. F2/F3 modify este arquivo, não o inexistente.
- **DPC-02** — `scripts/sync-agents-preflight.js` ❌ não existe. Realidade: `src/commands/sync-agents-preflight.js`. T5 estende este file.
- **DPC-03** — `src/agent-artifact-map.js` (NEW) ❌ redundante. Realidade: `src/handoff-contract.js` linhas 15-99 já tem CONTRACTS map cobrindo agent → artifact. F2 EXTEND com helper `getCanonicalArtifactForAgent(agent, state)` que consome o map existente. Aderência ao design-doc.md code-reuse rule ("lógica em 2+ lugares → extrair/reusar"). Não criar arquivo novo.
- **DPC-04** — `scripts/lib/agent-semantic-diff.js` (NEW) → `src/lib/agent-semantic-diff.js`. Helper de T5 fica em `src/lib/` per design-doc folder structure (singular para responsabilidade específica). `scripts/` é reservado para tooling de release/benchmark.
- **DPC-05** — **Infraestrutura existente a coordenar (não duplicar):** `src/commands/workflow-next.js:429-479` já tem integrity check **inverso** ("did agent_done happen before workflow advanced?" via SQL contra agent_events). F2 (forward emit) é complementar — design da Slice 4 deve coordenar event ordering para evitar double-emit ou warning falso na linha 479.
- **DPC-06** — **T5 scope mais tight do que pensado:** `src/commands/sync-agents-preflight.js` já tem Active Learning Loop Phase 6 parity checks (template `.aioson/` surface). T5 NÃO constrói do zero — adiciona plugins de header/code-block/frontmatter ao plugin host existente.

Nenhuma DD precisa revisão. Nenhum AC precisa mudança. Architecture decisions (DD-01..05) permanecem válidas. Slice 1 (baseline file) já criado em `tests/baselines/agent-done-stdout.txt`; Slice 2 ajustada para "EXTEND handoff-contract.js" em vez de criar agent-artifact-map.js.

### Analyst additions (2026-05-20)

- **AD-01** — Classification confirmada MEDIUM apesar de formula analyst (0-6) sugerir SMALL (score=2). **Reason:** formula analyst é otimizada para domain-entity features; framework-internal multi-phase é melhor representado pelo sheldon enrichment scoring (=10). Documentar como exceção; follow-up de framework evolution (Q12) para adicionar "delivery phases" ao formula.
- **AD-02** — 4 GAPs de AC identificados em edge cases (EC-03/04/07/08): AC-F2-09, AC-F2-10, AC-F1-08, AC-T5-08. **Recomendação para @architect:** adicionar aos plan files antes de Gate B.
- **AD-03** — 3 risks adicionais (Risk-09 inception, Risk-10 AC gap, Risk-11 test fragility). Mitigações propostas em requirements.

## Edge cases handled

[12 edge cases identificados em requirements-workflow-handoff-integrity.md § Edge cases. 8 já cobertos por ACs nos phase plans; 4 GAPs (EC-03/04/07/08) aguardam @architect/@dev fix.]

## Dependencies

- **Reads:**
  - `.aioson/runtime/workflow.state.json` — RF-01, RF-02 leem state ativo
  - `.aioson/plans/{slug}/manifest.md` — RF-02 lê frontmatter para pending-state check
  - `.aioson/context/dev-state.md` — RF-03 lê para stale detection
  - `template/.aioson/agents/*.md` + `.aioson/agents/*.md` — RF-04 compara semanticamente
  - `tests/agent-runtime-alignment.test.js` — RF-04 lê tokens canônicos a proteger
  - `.aioson/context/features.md` — RF-03 lê para verificar feature status `done`
- **Writes / modifies:**
  - `src/commands/runtime.js` (runAgentDone — RF-01)
  - `src/commands/workflow-next.js` (runWorkflowNext — RF-02)
  - `src/commands/state-save.js` ou nova `state-reset.js` — RF-03
  - `src/preflight.js` — RF-03
  - `src/commands/sync-agents-preflight.js` — RF-04
  - `src/handoff-contract.js` (EXTEND — adicionar helper `getCanonicalArtifactForAgent(agent, state)`; CONTRACTS map já existe ali linha 15-99; NÃO criar agent-artifact-map.js novo per DPC-03) — RF-01
  - `.github/workflows/release-smoke.yml` (novo) — RF-05
  - `scripts/smoke-run-chain.js` (novo) — RF-05
  - `tests/fixtures/medium-feature-mock/` (novo) — RF-05
  - `.aioson/context/wiring-audit-workflow-handoff-integrity.md` (novo) — RF-09
- **Tests added:**
  - `tests/agent-done-auto-emit.test.js` — F2
  - `tests/workflow-next-pending-guard.test.js` — F3
  - `tests/preflight-stale-devstate.test.js` — F1
  - `tests/sync-agents-preflight-semantic.test.js` — T5
  - `tests/scripts/smoke-run-chain.test.js` — T6

## Notes

- **Inception note (Risk-09):** primeira phase (F2) deve ser implementada via `/deyvin` direto OU com `workflow:next` manual chamado pelo developer, evitando cadeia completa enquanto F2 está broken. Após v1.9.5 estável, phases seguintes podem usar a cadeia normalmente.
- **Wiring audit doc (BR-05, RF-09, PMD-07):** `@qa` Gate D NÃO pode passar sem `.aioson/context/wiring-audit-workflow-handoff-integrity.md` cobrindo todas as 5 phases. Não negociável.
- **Backward-compat baseline (Risk-11):** baseline file `tests/baselines/agent-done-stdout.txt` versionado em git. Mudanças aprovadas via update explícito + nota em key decisions abaixo.
- **Release strategy gate:** spec frontmatter `release_strategy` deve ser preenchido por `@architect` ANTES de `@pm` escrever implementation-plan-{slug}.md. Affects sequencing of phase delivery.

## QA Sign-off

[To be filled by @qa at Gate D]
