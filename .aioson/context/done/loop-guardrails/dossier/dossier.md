---
feature_slug: loop-guardrails
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-06-09T22:32:54.119Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-06-09T22:32:54.119Z
---
## Why

Hoje o `self:loop` itera com cap e o circuit-breaker bloqueia por excesso de passos/erros, mas nada impede o agente de alterar arquivos fora do escopo da feature, o `cost_ceiling_tokens` existe no schema e nunca é aplicado, os `criteria[]` do contrato nunca são avaliados automaticamente, e não há aprovação humana persistida no meio do loop. Quem roda o loop hoje (dev usando Claude Code/Codex) confia no agente; quem rodará amanhã (usuário leigo no AIOSON Play) não pode nem saber que essa confiança é necessária.

## What

MVP (PRD `.aioson/context/prd-loop-guardrails.md`): scope guard com `allowed_files[]`/`forbidden_files[]` (defaults seguros não-removíveis, detecção via `git status --porcelain` vs baseline do preflight); human gates temáticos (`payment_logic_change`, `auth_permission_change`, `database_destructive_change`, `publish`) com `harness:approve`/`harness:reject` persistidos e retomada idempotente; enforcement de `cost_ceiling_tokens` (chars/4) + `max_runtime_minutes` (política 80/100%); avaliação determinística de `criteria[].verification` via `executeInSandbox` com assinatura de falha (2x → escala); artefatos por tentativa em `attempts/{n}/`; validação de schema do contrato no preflight; retrocompatibilidade total. Entrega em 2 fases. Out of scope: `.aioson/loops/`, namespace `loop:*`, juiz IA, UI Play, custo USD, `security_high_finding`.

## Code Map

```yaml
files:
- path: src/commands/self-implement-loop.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-06-09T23:58:57.538Z
- path: src/harness/circuit-breaker.js
  role: core-module
  coupling_risk: high
  added_by: architect
  added_at: 2026-06-09T23:58:58.120Z
- path: src/harness/contract-schema.js
  role: schema
  coupling_risk: medium
  added_by: architect
  added_at: 2026-06-09T23:58:58.698Z
- path: src/harness/scope-guard.js
  role: core-module
  coupling_risk: medium
  added_by: architect
  added_at: 2026-06-09T23:58:59.295Z
- path: src/sandbox.js
  role: util
  coupling_risk: low
  added_by: architect
  added_at: 2026-06-09T23:58:59.887Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

- [.aioson/rules/security-baseline.md](.aioson/rules/security-baseline.md) — Defaults proibidos do scope guard (.env*, *.pem, secrets/**) derivam do baseline de seguranca

## Research Index

```yaml
researchs:
- slug: llm-token-estimation-2026
  verdict: confirmed
  agent_who_added: sheldon
  why_relevant: Fecha open question do orcamento: heuristica chars/4 (erro 5-15%) gravada na coluna token_count ja existente; tokenx como upgrade path
  added_at: 2026-06-09T23:21:47.777Z
  summary_path: researchs/llm-token-estimation-2026/summary.md
```

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:9a8af34fca0444a9fe5ba5fdc65e9c939ed8479805942d9d17dab26d44cd1f3a -->
**2026-06-09T22:32:54.786Z** | @product | _What_

MVP: scope guard (allowed/forbidden files com defaults seguros), human gates tematicos com approve/reject, enforcement de cost_ceiling_tokens + max_runtime_minutes, avaliacao deterministica de criteria[] com assinatura de falha, artefatos por attempt. Constraints: evoluir harness-contract.json in-place, sem namespace loop:*, sem juiz IA, sem UI Play, retrocompativel.

<!-- sha256:7b6f8834a82302414236e55a8d65d57182acd76eb11a2086250515d8570916dd -->
**2026-06-09T23:21:48.494Z** | @sheldon | _Agent Trail_

Sizing: 6. Decision: in-place + Delivery plan (2 fases). Plan: null. Code findings: untracked invisivel a git diff (usar status --porcelain), baseline git no preflight, sem validador de schema do contrato (harness.js), token_count ja existe (runtime-store.js:741), check-runner reusa executeInSandbox, git:guard nao le contrato (merge necessario). 3 open questions resolvidas. 11 melhorias aplicadas, 1 adiada (security_high_finding).

<!-- sha256:0a649c211521017fd4ee751f6c399ab5bef6aaa2cc66133b18a86b314788753b -->
**2026-06-09T23:50:41.810Z** | @analyst | _Agent Trail_

Requirements mapped: 20 REQs (11 Fase 1, 9 Fase 2), 13 edge cases, 0 migrations. Classificacao feature confirmada SMALL (score 2). Gate A approved. Pendente fino para @architect: EC-2 (path sujo proibido re-modificado).

<!-- sha256:1b6df62751741dded403eba2a1461ffd7524e90328684f8a2526eba2006bc343 -->
**2026-06-09T23:58:40.461Z** | @architect | _Agent Trail_

Arquitetura definida: guards como modulos puros em src/harness/ (9 modulos), 2 comandos novos (harness-gate, harness-status), hook pos-attempt em self-implement-loop.js:224. Decisoes D1-D7: glob matcher proprio com subset estrito validado, EC-2 fechada via git hash-object dos dirty forbidden paths, orcamento via acumulador em progress.json, HUMAN_GATE no circuit-breaker, ordem do hook artifacts-first. Gate B approved.

<!-- sha256:74ab15be3de94345c2e56a9c3b5c12a1a92ca09ff5fe5f4db7159079ec1d3df4 -->
**2026-06-10T00:03:51.267Z** | @discovery-design-doc | _Agent Trail_

Discovery & design doc: pacote tecnico consolidado (design-doc-loop-guardrails.md + readiness-loop-guardrails.md), todos os anchors de codigo verificados. Readiness: high (ready_with_warnings). Next: dev.

<!-- sha256:1d1be9219b17da14016078f8ab72dcb2b7b675af26f1d168cc12b3f66081000b -->
**2026-06-10T01:51:33.590Z** | @dev | _Agent Trail_

Fases 1+2 implementadas em sequencia (architecture par.7 passos 1-10). Fase 1: glob-match (D1), contract-schema (REQ-1/19), git-baseline (REQ-2/3 + D2, porcelain -uall, .aioson/** excluido), scope-guard (REQ-4/5/6/10), budget-guard (REQ-7/8, D3), attempt-artifacts (REQ-9), guard-events (D6, modulo aditivo), preflight + hook D5 no self-implement-loop, template harness:init. Fase 2: human-gate (REQ-12/14/15, run_id aditivo no schema do gate), HUMAN_GATE no circuit-breaker (D4), criteria-runner (REQ-16/17, D7), harness:approve/reject/status (REQ-14/18), publish gate no feature:close (REQ-13, --force nao bypassa), git:guard merge (REQ-20). 94 testes novos; integracao com violacao proposital + gate e2e + signature repeat + publish + REQ-20. Residuals: i18n dos comandos novos, help text, 2 falhas CRLF pre-existentes (CI verde). Next: npm test final + handoff @qa.

<!-- sha256:b2466f0c8236bf7afaccf111865672c228a582591be4e4c90c8a400ff3c73534 -->
**2026-06-10T02:08:36.167Z** | @qa | _Agent Trail_

QA completed. Verdict: FAIL (corrections required). Findings: 1 High (C-01 silent guard inactivation without --spec/--contract), 2 Medium (C-02 presets not enforced by breaker, C-03 git:guard blocks human lockfile commits), 4 Low. Suite 3093/3096 (2 pre-existing CRLF failures). Corrections plan: .aioson/plans/loop-guardrails/corrections-2026-06-09.md. Failing AC test QA-H-01 added to tests/self-loop-guardrails.test.js.

<!-- sha256:50279d17f6e96bf814cbb88151f2b44dcb96e063f46870cb3df3eb1f4e5af3ee -->
**2026-06-10T02:40:35.479Z** | @dev | _Agent Trail_

Corrections C-01..C-03 applied: active-contract discovery shared helper (self:loop auto-discovers without flags, logs explicit inactive line), resolved governor injected into circuit-breaker (presets reach check/recordError + maxIterations), git:guard layer-2 now uses DECLARED forbidden_files only. Tests QA-H-01 green + QA-C-02/QA-C-03 added. Next: full suite, then @qa re-verify.

<!-- sha256:b31ddf7e5df326f3043a639d2581a3e1fa404f8f9ed43b7fd2097dea70c341b2 -->
**2026-06-10T02:45:09.532Z** | @dev | _Agent Trail_

Full suite after C-01..C-03: 3105 tests, 3102 pass, 2 fail (pre-existing AC-CTPK-06 CRLF, green in CI), 1 skipped. Corrections plan marked resolved. Next: @qa re-verification (Gate D) + ruling on optional O-01..O-04.

<!-- sha256:f1ab806999e26ce05076f558b3279e491e73f5a18b36ed2d915c5a915599b2fb -->
**2026-06-10T03:02:30.876Z** | @qa | _Agent Trail_

QA re-verification completed. Verdict: PASS. C-01..C-03 RESOLVED (binary tests QA-H-01/QA-C-02/QA-C-03 green; independent checks: resolved governor not persisted to contract, commit layer declared-globs only, discovery best-effort). Full suite 3102/3105 (2 pre-existing CRLF). Residuals O-01..O-04 documented in spec QA Sign-off. Feature marked done; Gate D passed via workflow:next --complete=qa.

## Revision Requests

_(vazio — populado a partir da Phase 2)_

## Code Map

```yaml
files:
- path: src/harness/glob-match.js
  role: core-module
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-10T01:51:04.517Z
- path: src/harness/contract-schema.js
  role: schema
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-10T01:51:05.816Z
- path: src/harness/git-baseline.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-10T01:51:06.736Z
- path: src/harness/scope-guard.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-10T01:51:08.022Z
- path: src/harness/budget-guard.js
  role: core-module
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-10T01:51:08.922Z
- path: src/harness/attempt-artifacts.js
  role: util
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-10T01:51:10.236Z
- path: src/harness/guard-events.js
  role: util
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-10T01:51:11.789Z
- path: src/harness/human-gate.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-10T01:51:13.044Z
- path: src/harness/criteria-runner.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-10T01:51:14.548Z
- path: src/commands/harness-gate.js
  role: command-entry
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-10T01:51:16.059Z
- path: src/commands/harness-status.js
  role: command-entry
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-10T01:51:17.592Z
- path: src/harness/active-contract.js
  role: util
  added_at: 2026-06-10T02:40:59.948Z
modules: []
patterns: []
```
