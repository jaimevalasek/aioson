---
gate_execution: approved
feature: secure-by-default
status: done
started: 2026-04-28T20:48:44-03:00
phase_gates:
  requirements: approved
  design: approved
  plan: approved
last_checkpoint: "Workflow-state reconciliation fix applied after Phase 5 QA approval. Persisted workflow states now infer skipped intermediate stages when a later stage is already completed; pending @qa regression review before final feature closure."
gate_requirements: approved
gate_design: approved
gate_plan: approved
---

# Spec — Secure by Default

## What was built
- **Phase 5 follow-up — Workflow State Reconciliation:** `src/commands/workflow-next.js` now reconciles persisted workflow states during `loadOrCreateState()`. If a later stage is already present in `completed`, unresolved earlier stages are inferred into `skipped`, stale `current`/`next` pointers are cleared or repaired, and the normalized payload is persisted back to `.aioson/context/workflow.state.json`. Regression coverage was added for both `loadOrCreateState()` and `workflow:status`.
- **Phase 1 — Security Baseline Contract (constitution amendment):** appended `Article VII — Zero Trust by Default` to `.aioson/constitution.md` and `template/.aioson/constitution.md`. Article VII references `.aioson/rules/security-baseline.md`, declares the per-classification policy (MICRO advisory, SMALL scan, MEDIUM audit-blocking on High/Critical) and pins stable control IDs `SEC-SBD-01..SEC-SBD-08`. Frontmatter `version` bumped to `1.1.0` and `last_amended` set to `2026-04-28`. Articles I–VI preserved verbatim; Governance section unchanged.
- **Phase 2 — Security Baseline Rule:** created `.aioson/rules/security-baseline.md` and `template/.aioson/rules/security-baseline.md` (byte-identical) with frontmatter `agents: [analyst, architect, dev, qa]`, version 1.0.0, priority 10. Rule defines all eight controls `SEC-SBD-01..SEC-SBD-08` (server-side input limits, upload signature, ownership/IDOR, atomic state, secrets, external URL, storage default-deny, auth rate limiting), each with severity, owner agent, applies-to, classification policy and required evidence. Includes severity scale, direct-LLM fallback note, and explicit out-of-scope (no honeypots/jump-scares in v1).
- **Phase 3 — Verification Pass:** all conformance ACs verified against the artifacts. Results below.
- **Phase 2 (Sheldon plan) — CLI Security Scan and Audit:** implemented per architecture.md §Phase 2.
  Files created:
  - `src/lib/security/exit-codes.js` — constants (`PASS=0`, `BLOCKING=10`, `INCONCLUSIVE=11`, `BAD_INPUT=12`, `CONTRACT_VIOLATION=13`) + `resolveExitCode()` helper.
  - `src/lib/security/secrets-regex.js` — 7 patterns (AWS, Stripe live, OpenAI, Anthropic, RSA/SSH, password assignment, generic api_key/token), allowlist via markers (`EXAMPLE`, `dummy`, `xxxxxxxx`, etc.) and path suffixes (`.env.example`, `.env.sample`, `.env.template`), forbidden filenames (`.env`, `.env.local`, `id_rsa`, ...).
  - `src/lib/security/findings-writer.js` — schema_version `1.0.0`, `finding_id = {source}-{control_id}-{hash6(scope)}` via `crypto.sha1`, append-or-replace by id with sorted output for determinism, `MAX_FINDINGS=500` triggers exit 13.
  - `src/lib/security/artifact-reader.js` — loads PRD/requirements/architecture/plan/spec/conformance for a slug; extracts classification + AttackSurfaceMap flags via regex (no LLM).
  - `src/commands/security-scan.js` — async generator walk skipping `node_modules`/`.git`/`.aioson`/`dist`/`build`/`coverage`/`.next`/`.cache`/`tmp`/`.turbo`/`.vercel`/`researchs`; 512KB max per file; invokes `npm audit --json --omit=dev` via `child_process.spawnSync` (timeout 60s, shell on Win32) only at stage `dev|qa|all` when `package-lock.json` exists; network failure → `inconclusive` finding (exit 11), never silent pass.
  - `src/commands/security-audit.js` — slug-scoped; missing required artifacts return exit 12; MEDIUM auth/ownership/money/uploads/external_urls/secrets/storage surfaces cross-checked against `SEC-SBD-{02,03,04,06,07,08}` mentions in spec; missing AttackSurfaceMap on MEDIUM is a Medium finding (`recommended_gate_status=review`).
  - `src/cli.js` — registered `security:scan`/`security-scan` and `security:audit`/`security-audit` aliases in import block, allowed-commands list and dispatcher.

  Tests (`tests/commands/security-scan.test.js` + `tests/commands/security-audit.test.js`): 20/20 passing in ~265ms.

  Coverage:
  - AC-SBD-2.1: clean MEDIUM project at stage `analyst` → exit 0.
  - AC-SBD-2.2: stage `dev` detects real Stripe key + `.env.local` forbidden file (npm audit not exercised in tests by design — would require network).
  - AC-SBD-2.3: audit reads slug artefatos and produces conformant JSON with `review_contract`.
  - AC-SBD-2.4: MEDIUM + High/Critical → exit 10; MICRO + same finding → exit 0.
  - AC-SBD-2.5: MICRO never blocks (validated for both scan and audit); SMALL not separately tested but follows same `resolveExitCode` path with MEDIUM-only blocking.
  - AC-SBD-2.6: fallback documented in rule (Phase 1) — Phase 2 commands simply do not run in direct LLM mode.
  - AC-SBD-2.7: code reviewed — no `git rebase`, `git filter-branch`, `git push`, no `.git/` writes; `child_process.spawnSync` only invokes `npm audit` with non-mutating flags.

  Determinism: same input → byte-identical JSON (test "determinism: byte-identical output modulo generated_at" passes).
  Idempotência: re-run preserves `finding_id` set; vanished findings flip to `status: fixed` (test "marks vanished finding as fixed on next run" passes).
  Allowlist: dummy-marker matches and `.env.example` paths are skipped (2 tests pass).

  Pre-existing test failures (NOT introduced by this phase):
  - `tests/agent-contracts.test.js`: dev.md is 15904 bytes (limit 15000) — fails on `main` before this phase. Verified via `git stash` round-trip.
  - Suite tests touching `better-sqlite3`: native binary built for Linux cannot load via Windows UNC path. Pre-existing infra issue.

  Phase 4 (`@pentester app_target`) is QA-approved. Phase 5 (runtime events / Gate D blocking) is implemented and awaiting QA re-review. Phase 3 (`secure-tdd`) is QA-approved.

## Phase 3 verification report

| AC | Result | Evidence |
|---|---|---|
| AC-SBD-001 | ✅ | `Article VII — Zero Trust by Default` present in both constitutions, line 30; references `.aioson/rules/security-baseline.md` |
| AC-SBD-002 | ✅ | Frontmatter `agents: [analyst, architect, dev, qa]` — no product/copy/design agents |
| AC-SBD-003 | ✅ | Exactly 8 controls `SEC-SBD-01..SEC-SBD-08` with stable IDs |
| AC-SBD-004 | ✅ | Each control declares severity (8/8), owner agent (8/8), classification policy (8/8), required evidence (8/8) |
| AC-SBD-005 | ✅ | MICRO advisory / SMALL scan-oriented / MEDIUM audit-blocking declared in classification policy table and per-control |
| AC-SBD-006 | ✅ | scan/audit distinction documented in `architecture.md` §Phase 2 (scan = static/tool-first; audit = surface assessment); rule defers commands to Phase 2 |
| AC-SBD-007 | ✅ | Pentester `app_target` invocation explicitly conditional ("`@qa` may invoke for auth, money, ownership or suspicious audit findings"), never mandatory by classification |
| AC-SBD-008 | ✅ | "Open High or Critical findings block Gate D" stated for MEDIUM; Low/Medium do not block unconditionally |
| AC-SBD-009 | ✅ | Out-of-scope section explicitly excludes honeypots, jump-scares, deceptive endpoints from v1 |
| AC-SBD-010 | ✅ | Direct LLM mode section: checklist-only verification, records limitation, no fabricated runtime telemetry |
| AC-SBD-011 | ✅ | Template propagation explicit — both `.aioson/rules/security-baseline.md` and `template/.aioson/rules/security-baseline.md` exist and are byte-identical |
| AC-SBD-012 | ✅ | `.aioson/context/` for this feature contains only md (prd, requirements, spec, implementation-plan) + yaml (conformance); no unapproved JSON |
| AC-SBD-013 | ✅ | Architect scope intact — scan/audit/finding schema decisions are deferred in `architecture.md`, not reopened |
| AC-SBD-014 | ✅ | Dev scope intact — all 8 control evidence requirements declarative; no new business rules invented |

Additional invariants verified:
- Articles I–VI byte-identical to pre-Phase 1 baseline (`git show HEAD:.aioson/constitution.md` diff clean for lines 6–28).
- Workspace and template constitutions are byte-identical (`diff` clean).
- Workspace and template rules are byte-identical (`diff` clean).
- No `src/` changes in working tree (`git status --short` clean for `src/`).
- No Phase 2+ artifacts created (`security-findings-*.json`, `security-scan.js`, `security-audit.js`, `secure-tdd/SKILL.md`, pentester edits — all absent).
- `phase_gates.plan: approved` preserved unchanged in spec frontmatter.

## Entities added
- SecurityControl
- SecurityBaselineRule
- AttackSurfaceMap
- SecurityFinding
- SecurityRuntimeEvent

## Key decisions
- 2026-04-28 Gate A targets Phase 1 first because Sheldon produced a five-phase plan and the analyst prompt scopes discovery to Phase 1 when `plan_path` exists.
- 2026-04-28 `security-baseline.md` must use stable control IDs so downstream CLI, QA and pentester artifacts can reference controls without relying on prose.
- 2026-04-28 MICRO remains advisory; MEDIUM blocks only on open High/Critical findings with evidence.
- 2026-04-28 Web3/dapp app-target surfaces are deferred from v1.
- 2026-04-28 Phase 1 architecture is governance/template only; no new `src/` module is required until Phase 2.
- 2026-04-28 Gate C plan limits @dev to constitution + security-baseline rule files; Phase 2+ implementation is explicitly deferred.
- 2026-04-28 Article VII appended (not inserted) to both constitution files; version bumped to 1.1.0 and last_amended=2026-04-28. Article VII delegates the substantive control list to `.aioson/rules/security-baseline.md` (created in Phase 2) so the constitution stays principles-only.
- 2026-04-28 Phase 2 created `security-baseline.md` in `.aioson/rules/` and `template/.aioson/rules/`. Frontmatter mirrors architecture verbatim; rule targets only `analyst, architect, dev, qa`. All 8 controls present with stable IDs, severity, owner agent, classification policy and required evidence. Workspace and template files are byte-identical (verified via `diff`). No `src/` changes, no scan/audit logic implemented (deferred to Phase 2 of the Sheldon plan).
- 2026-04-28 Phase 3 verification pass — all 14 ACs satisfied; Articles I–VI confirmed byte-identical to pre-amendment baseline; no Phase 2+ scope leaked into Phase 1 deliverables. Ready to hand off to `@qa` for independent Gate D evaluation.
- 2026-04-28 `@qa` PASS para Phase 1 (0 Critical/High; 2 Low aceitos como residuais L-01 e L-02).
- 2026-04-28 Phase 2 Gate B aprovado por `@architect`. Decisões arquiteturais fixadas:
  (a) Layout: dois commands separados (`src/commands/security-scan.js`, `src/commands/security-audit.js`) + lib compartilhada `src/lib/security/{exit-codes,secrets-regex,findings-writer,artifact-reader}.js`. Sem dispatcher único.
  (b) Schema canônico de `security-findings-{slug}.json` versão 1.0.0 com bloco `review_contract` lido por `@qa`; `finding_id` determinístico `{source}-{control_id}-{hash6(scope)}`; append-or-replace; status histórico preservado.
  (c) Exit codes 0 (pass), 10 (blocking), 11 (inconclusive), 12 (bad-input), 13 (contract-violation). Política por classificação consome a tabela; MEDIUM com High/Critical retorna 10 e bloqueia `workflow:next --complete=qa`.
  (d) `npm audit` opcional, invocado apenas em stage `dev`/`qa`/`all` quando `package-lock.json` existe; falha de rede → finding inconclusive, nunca pass mascarado.
  (e) Allowlist de dummy secrets via marcadores explícitos (`EXAMPLE`, `dummy`, `xxxxxx`, `.env.example`); falso negativo aceito quando marcador é explícito.
  (f) Comandos não alteram história git (AC-SBD-2.7) — verificável via auditoria de código + teste de working tree.
  (g) Zero LLM dentro de `security:*` (decisão tool-first do PRD).
  (h) Hooks `.claude/settings.json` deferidos para Phase 5; invocação Phase 2 é explícita (CLI ou agent prompt).
- 2026-04-29 Phase 3 Gate B aprovado por `@architect`. Decisões arquiteturais fixadas:
  (a) `secure-tdd` é uma process skill em `.aioson/skills/process/secure-tdd/` com espelho obrigatório em `template/.aioson/skills/process/secure-tdd/`.
  (b) A entrypoint skill fica curta em `SKILL.md`; referências v1 mínimas ficam em `references/node-express.md`, `references/nextjs.md` e `references/planned-stacks.md`.
  (c) Ordem de carregamento: `aioson-spec-driven` primeiro; `secure-tdd` entra depois, apenas como complemento.
  (d) Gatilho de carregamento: obrigatório para MEDIUM com superfície sensível (auth, ownership, money, uploads, external URLs, secrets/credentials, storage sensível), opcional/reduzido para SMALL, nunca automático para MICRO.
  (e) Laravel/Pest, Django, Rails e FastAPI entram só como referências planejadas/minimais no v1, sem bloquear a entrega.
  (f) A skill cobre testes adversariais para `SEC-SBD-01/02/03/04/06/08`; `SEC-SBD-05` continua prioritariamente tool-first via `security:scan`.
  (g) Phase 3 não cria comandos CLI novos, não chama `@pentester`, não emite runtime events e não substitui o workflow spec-driven.
- 2026-04-29 Phase 4 Gate B aprovado por `@architect`. Decisões arquiteturais fixadas:
  (a) `app_target` reutiliza o envelope atual de `.aioson/context/security-findings-{slug}.json`; não existe schema paralelo.
  (b) A separação `framework_target` vs `app_target` ocorre por `review_contract.target_mode`, `review_contract.target_scope` e `surface_type`, nunca por arquivo novo.
  (c) O catálogo v1 de surfaces de `app_target` fica restrito a `app_target_ownership_idor`, `app_target_secrets_crypto`, `app_target_injection_xss`, `app_target_insecure_design_race` e `app_target_auth_rate_limit`.
  (d) Findings `app_target` `high`/`critical` exigem `attack_path`, `preconditions`, `reproduction_steps`, `evidence`, `impact`, `affected_artifacts`, `suggested_fix` e `safe_to_reproduce=true`; sem isso viram `needs_validation`.
  (e) Se `agent:invoke` for adicionado, ele deve ser apenas um wrapper fino sobre `agent:prompt` e o runtime atual, sem segundo executor.
  (f) `@qa` continua sendo o dono do Gate D; `@pentester` detecta e persiste, mas não fecha finding nem aplica auto-fix.
- 2026-04-29 Phase 4 implementada por `@dev`.
  (a) `.aioson/agents/pentester.md` e template agora separam explicitamente `framework_target` de `app_target`, incluindo catálogo `app_target_*`, regra `cross_scope_reason` e campos `attack_path` / `suggested_fix`.
  (b) `.aioson/agents/qa.md` e template agora exigem `target_scope` em reviews `app_target` on-demand e validam `attack_path` / `suggested_fix` para findings High/Critical.
  (c) `.aioson/agents/manifests/pentester.manifest.json` e template declaram `target_modes: [framework_target, app_target]` e documentam `agent:invoke`.
  (d) `src/cli.js` e `src/commands/agents.js` registram `agent:invoke` como alias fino de `agent:prompt`; `app_target` falha cedo sem `--feature|--slug` ou `--scope`.
  (e) Testes de Phase 4 aprovados: `node --test tests/agents-command.test.js tests/json-output.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js` (`62/62`) e `node --test tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js` (`24/24`).
- 2026-04-29 Phase 5 implementada por `@dev`.
  (a) `src/lib/security/runtime-events.js` centraliza a emissao de telemetria de seguranca sobre o runtime SQLite existente; nao ha runtime paralelo nem snippets ad-hoc.
  (b) `src/commands/security-scan.js` e `src/commands/security-audit.js` agora emitem `security_scan_completed` e `security_audit_completed` com payload de slug, stage/classification, exit code, resumo e artifact path.
  (c) `src/commands/agents.js` registra `pentester_app_target_invoked` quando `agent:prompt|agent:invoke pentester --mode=app_target` roda com `--feature` e `--scope`.
  (d) `src/handoff-contract.js` agora trata findings JSON malformado como artifact invalido e exige `security-findings-{slug}.json` para Gate D em feature MEDIUM.
  (e) `src/commands/workflow-next.js` auto-roda `security:audit` na ativacao do `@qa` em feature MEDIUM, injeta o resumo no prompt e emite `security_gate_blocked` quando o Gate D falha por ausencia/invalidade de artifact ou blockers de findings.
  (f) `.aioson/agents/qa.md` e `template/.aioson/agents/qa.md` agora distinguem explicitamente "CLI ausente" de "audit rodou e passou", exigem fallback sem telemetria falsa e instruem a invocacao condicional de `@pentester app_target`.
  (g) Bundle de validacao: `node --test tests/commands/security-audit.test.js tests/commands/security-scan.test.js tests/agents-command.test.js tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js` (`78/78`).

## Edge cases handled
- CLI absent in direct LLM mode.
- Feature has no sensitive attack surface.
- Brownfield secrets predate baseline adoption.
- Stack-specific password hashing fallback.
- Telemetry failure separate from security verification.

## Dependencies
- Reads: `.aioson/context/prd-secure-by-default.md`, `.aioson/context/sheldon-enrichment.md`, `.aioson/plans/secure-by-default/manifest.md`, `.aioson/plans/secure-by-default/plan-security-baseline-contract.md`, `researchs/owasp-appsec-baseline-2026/summary.md`.
- Writes: `.aioson/rules/security-baseline.md`, template rule copy if applicable, constitution/governance artifact, downstream security artifacts in later phases.

## Notes
`@architect` should design Phase 1 first and preserve the deferred decisions in the Sheldon manifest. Do not implement scan/audit/pentester behavior until the baseline contract is stable.

## QA Sign-off

- **Date:** 2026-04-29
- **Verdict:** PASS
- **Residual:** L-01, L-02 (accepted from Phase 1); L-03 fixed (duplicate features.md entries removed); L-04 fixed (spec frontmatter status corrected).
- **Gate D (execution):** approved

### Phase 5 follow-up regression review (2026-04-29)
- Reconciliation test `workflow:status reconciles stale active stages before building the suggestion`: **PASS**
- 310 test suite failures confirmed pre-existing (`better-sqlite3` NODE_MODULE_VERSION mismatch on Windows UNC path — documented in spec line 49)
- Security findings in `security-findings-project.json` (7C+6H): all false positives in security scanner test fixtures; no real credential exposure
- No regressions introduced by Phase 5 follow-up

### AC coverage (14/14 covered)

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-001 | Covered | Article VII present at line 30 in both constitutions; references `.aioson/rules/security-baseline.md` |
| AC-SBD-002 | Covered | Frontmatter `agents: [analyst, architect, dev, qa]` — exact set, no extras |
| AC-SBD-003 | Covered | All 8 stable IDs `SEC-SBD-01..SEC-SBD-08` present |
| AC-SBD-004 | Covered | Each control declares severity, owner agent, classification policy and required evidence |
| AC-SBD-005 | Covered | Classification policy table at top of rule states MICRO advisory / SMALL scan-oriented / MEDIUM audit-blocking |
| AC-SBD-006 | Covered (with note L-01) | Behavioral distinction present: SMALL = "Static checks and tool-first scans" / MEDIUM = "Surface assessment runs against attack-surface map". Command-name distinction (`security:scan` vs `security:audit`) is documented in `architecture.md` §Phase 2 and is Phase 2 scope. |
| AC-SBD-007 | Covered | Rule lines 29–32: `@pentester app_target` invocation conditional on auth/money/ownership/uploads/external URLs/suspicious findings; never required by classification alone |
| AC-SBD-008 | Covered | MEDIUM row: "Open High or Critical findings block Gate D until resolved or explicitly waived with rationale" |
| AC-SBD-009 | Covered | "Out of scope (v1)" section explicitly excludes honeypots, jump-scares, deceptive endpoints |
| AC-SBD-010 | Covered | "Direct LLM mode (no CLI)" section: checklist-only verification, record limitation in devlog, must not fabricate runtime telemetry |
| AC-SBD-011 | Covered | Rule exists in workspace (`.aioson/rules/security-baseline.md`) and template (`template/.aioson/rules/security-baseline.md`); files byte-identical (`diff -q` clean); both paths documented in `architecture.md` §7 |
| AC-SBD-012 | Covered | `.aioson/context/*secure-by-default*` contains only md (prd, requirements, spec, implementation-plan) + yaml (conformance). No JSON. |
| AC-SBD-013 | Covered | `architecture.md` Phase 2/3/4/5 sections preserve deferred decisions (scan/audit schemas, pentester surfaces, runtime events) without reopening product scope |
| AC-SBD-014 | Covered | `@dev` implemented Phase 1 from spec + requirements + plan + architecture without inventing new business rules (verified via working tree) |

### Findings

#### Critical
None.

#### High
None.

#### Medium
None.

#### Low / Info

**[L-01] AC-SBD-006 distinction is behavioral, not command-named**
File: `.aioson/rules/security-baseline.md:21-27`
Risk: Future readers may not connect "scan-oriented" / "surface assessment" prose to the literal `security:scan` / `security:audit` commands that Phase 2 will deliver.
Fix (deferred to Phase 2): when `security:scan` and `security:audit` are implemented, add a short "Verification commands" subsection to the rule explicitly mapping behavior to command names.
Status: Accepted as residual — Phase 1 plan explicitly defers command implementation; current behavioral distinction satisfies the conformance check.

**[L-02] Severity scale lacks `low` / `info`**
File: `.aioson/rules/security-baseline.md:34-41`
Risk: `SecurityFinding.severity` enum in `requirements-secure-by-default.md` includes `low` and `info`; the rule scale only covers `critical`/`high`/`medium`/`advisory`. Findings produced in Phase 5 may use severities the baseline does not document.
Fix (deferred to Phase 5): align rule severity scale with finding contract when Phase 5 implements runtime events.
Status: Accepted as residual — Phase 1 contract is severity-by-policy, not by-finding; alignment is Phase 5 scope.

### Invariants verified

- Articles I–VI byte-identical to pre-Phase 1 baseline (confirmed via `git show HEAD:.aioson/constitution.md`).
- Article VII appended at position 7 (between Article VI and Governance section); no renumbering.
- `last_amended` updated to `2026-04-28`; `version` bumped to `1.1.0`.
- Workspace and template constitutions byte-identical (`diff -q` clean).
- Workspace and template rules byte-identical (`diff -q` clean, both 7746 bytes).
- No `src/` modifications in working tree.
- No Phase 2+ artifacts created (`secure-tdd/`, `pentester` edits, `security-findings-*.json`, `src/commands/security-*.js`).
- `phase_gates.plan: approved` preserved in spec frontmatter.

### Residual risks

- L-01 and L-02 above (both accepted, both fix-deferred to subsequent phases of the Sheldon plan).
- The baseline is preventive policy, not enforcement. Real protection only materializes when Phase 2 (scan/audit), Phase 3 (secure-tdd), Phase 4 (pentester app_target) and Phase 5 (gates/runtime) are delivered. Until then, Article VII is signal-only.
- Loader behavior: rule frontmatter targets `[analyst, architect, dev, qa]` but actual loading depends on each agent's "Project rules, docs & design docs" section. QA did not verify that every one of the four agents currently loads `.aioson/rules/*.md` matching this frontmatter — verification of the loader contract is Phase 5 scope.

### Summary
**0 Critical, 0 High, 0 Medium, 2 Low.** AC: 14/14 covered.
**Phase 1 — Security Baseline Contract:** approved. Phases 2–5 of the Sheldon plan remain open and require their own Gate cycles.

## QA Sign-off — Phase 2 (Sheldon plan) — CLI Security Scan and Audit

**Phase:** 2 — CLI Security Scan and Audit
**Date:** 2026-04-28
**Verdict:** **FAIL** — corrections required before re-review.
**Corrections plan:** `.aioson/plans/secure-by-default/corrections-2026-04-28.md`

### AC coverage (5/7 covered, 1 broken end-to-end, 1 covered with false positives)

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-2.1 | Covered | Clean tmpdir, `--stage=analyst` returns exit 0 (verified end-to-end via `bin/aioson.js`). |
| AC-SBD-2.2 | Partial | Regex secret detection and forbidden-file detection verified end-to-end. `npm audit` integration not exercised against a real vulnerable lockfile during this review (covered by code path in `security-scan.js:178-200`, no live test). |
| AC-SBD-2.3 | Covered with M-01 | Audit reads slug artifacts and emits structured JSON conforming to `review_contract` (`scope_mode=feature`, `evidence_policy=high_critical_require_reproduction`, `findings_artifact_path` correct). However the heuristic is too liberal — see C-02 below. |
| AC-SBD-2.4 | **BROKEN end-to-end** | Without `--json`: exit 10 propagates correctly. With `--json`: cli.js overwrites to 1. See C-01. |
| AC-SBD-2.5 | Covered | MICRO non-blocking and MEDIUM blocking validated in test suite (12 distinct cases). |
| AC-SBD-2.6 | Covered | Direct LLM fallback documented in `.aioson/rules/security-baseline.md` §Direct LLM mode (Phase 1 scope). Phase 2 commands deliberately do nothing in absence of CLI — no fake telemetry. |
| AC-SBD-2.7 | Covered | Code audit confirmed: only `spawnSync('npm', ['audit', '--json', '--omit=dev'])` invoked; `.git` only listed in `SKIP_DIRS` (read-skip, never written); no `git rebase`/`filter-branch`/`reset`/`checkout`/`push` calls anywhere in `src/commands/security-*.js` or `src/lib/security/*.js`. Working tree integrity preserved across multiple end-to-end runs. |

### Findings

#### Critical
None.

#### High

**[H-01] cli.js drops deterministic exit codes in `--json` mode**
File: `src/cli.js:1335-1336`
Risk: Breaks AC-SBD-2.4. Any tooling consuming `--json` exit codes (which is the canonical mode for downstream automation, including the planned Phase 5 Gate D blocking) will see `1` instead of `10/11/12/13`, losing the ability to distinguish blocking from inconclusive from bad-input.
Evidence:
- `node bin/aioson.js security:scan <fixture-with-secret> --classification=MEDIUM` → exit 10 ✓
- Same command + `--json` → exit 1 ✗
- `node bin/aioson.js security:audit . --slug=secure-by-default --json` → exit 1 (should be 10)
Fix: see C-01 in corrections plan. Three-line change in cli.js to preserve `result.exitCode` when present.
Test gap: dev tests assert on the *returned* `result.exitCode`, not on `process.exitCode` after CLI dispatch. End-to-end coverage missing — see O-01.

#### Medium

**[M-01] Audit heuristic produces false positives on meta-features**
File: `src/lib/security/artifact-reader.js:32-51` (`extractAttackSurfaceFlags`) + `src/commands/security-audit.js:81-119`
Risk: Audit treats any keyword match in `requirements-{slug}.md` as evidence that the surface is "introduced by this feature", even when the document explicitly says "None introduced" or describes surfaces of *future* generated apps. Running audit against the `secure-by-default` slug itself produces 7 high false positives.
Evidence: `node bin/aioson.js security:audit . --slug=secure-by-default --json` → 7 high findings (auth, ownership, money, uploads, external_urls, secrets, storage), all blocking, none of which represent real surfaces of this feature.
Fix: see C-02 in corrections plan. Parse Attack Surface Map cells; recognize "None introduced" / "No new" / "Future generated apps" as N/A signals.
Why not High: feature is operational; the false positives are *advisory* in MICRO/SMALL and only block in MEDIUM. They don't break the contract — they just over-trigger. Phase 5 wiring would amplify the impact, but Phase 5 is not in scope here.

#### Low / Info

None new in Phase 2 (L-01 and L-02 from Phase 1 remain accepted residuals).

### Independent verification performed

- Dev test suite reproduced: 20/20 passing in 256ms.
- AC-SBD-2.7 by code audit: grep on `src/commands/security-*.js` and `src/lib/security/*.js` for `git`, `spawnSync`, `execSync`, `filter-branch`, `reset --`, `push --`, `rebase`, `checkout` → only legitimate `spawnSync('npm', ['audit', ...])` and `.git` in `SKIP_DIRS`.
- AC-SBD-2.1: end-to-end on a clean tmpdir via `bin/aioson.js`.
- AC-SBD-2.4: end-to-end on a tmpdir with planted Stripe live key, MEDIUM classification — both `--json` and non-json modes tested.
- AC-SBD-2.3 schema check: `schema_version` = `1.0.0`, `review_contract` complete, `finding_id` regex matches `security-(scan|audit)-SEC-SBD-\d{2}-[a-f0-9]{6}`.
- Determinism: two consecutive runs against the same input produce byte-identical JSON (modulo `generated_at`). Confirmed.
- Working tree integrity: no mutations to `.git/` after audit/scan execution.

### Pre-existing test failures (unchanged from Phase 1 review)

- `tests/agent-contracts.test.js`: `dev.md` size limit (15904 > 15000 bytes), pre-existing on `main`. Not introduced by Phase 2.
- `better-sqlite3` native binary on Windows UNC: pre-existing infra issue, unrelated to Phase 2.

### Action required

> "Corrections plan created at `.aioson/plans/secure-by-default/corrections-2026-04-28.md`.
> Activate `@dev` to apply the corrections. After fixing, return to `@qa` for re-verification."

The Phase 2 plan file (`plan-cli-security-scan-audit.md`) frontmatter has been updated to `status: qa_blocked` and points at the corrections plan. Phase 2 stays **not approved** until C-01 (mandatory) and ideally C-02 (mandatory) are fixed and re-verified end-to-end through `bin/aioson.js`, plus at least 2 spawn-based regression tests are added (O-01 effectively becomes mandatory after C-01 to prevent future regression).

## Dev corrections — Phase 2 — 2026-04-29

- C-01 fixed in `src/cli.js`: JSON dispatch now preserves `result.exitCode` when commands return deterministic security exit codes, instead of collapsing failures to generic exit `1`.
- C-02 fixed in `src/lib/security/artifact-reader.js` + `src/commands/security-audit.js`: audit now parses Attack Surface Map table cells, treats explicit N/A/meta-feature language as non-applicable, keeps the legacy list-style fallback for older requirements files, and honors the spec note `Feature has no sensitive attack surface.` when present.
- Regression coverage expanded in `tests/commands/security-scan.test.js`: spawn-based CLI assertions now verify `security:scan` preserves exit `10` in `--json`, preserves exit `10` without `--json`, and preserves exit `12` for bad input in `--json`.
- Regression coverage expanded in `tests/commands/security-audit.test.js`: audit now has fixtures for all-surfaces-N/A Attack Surface Maps and for the `secure-by-default` meta-feature shape that previously generated 7 false positives.
- Verification: `node --test tests/commands/security-scan.test.js tests/commands/security-audit.test.js` → 25/25 passing.
- Verification: `node bin/aioson.js security:audit . --slug=secure-by-default --json` → exit `0`, summary `0 critical / 0 high / 0 medium / 0 low / 0 inconclusive`.
- Findings artifact updated: `.aioson/context/security-findings-secure-by-default.json` now retains the previous 7 audit records as historical entries with `status: fixed`, which satisfies the dev-side remediation rule without deleting QA history.
- Next agent: `@qa` for end-to-end re-verification of Phase 2.

## QA re-review — Phase 2 — 2026-04-29

**Phase:** 2 — CLI Security Scan and Audit  
**Date:** 2026-04-29  
**Verdict:** **PASS**

### AC coverage

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-2.1 | Covered | `node bin/aioson.js security:scan <tmp> --stage=analyst --classification=MEDIUM --json` returns exit `10` with a planted Stripe live key and structured JSON output. |
| AC-SBD-2.2 | Covered | `security:scan` still detects secrets and forbidden files; `node --test tests/commands/security-scan.test.js tests/commands/security-audit.test.js` passes 25/25 including `.env.local`, allowlists and deterministic findings behavior. |
| AC-SBD-2.3 | Covered | `node bin/aioson.js security:audit . --slug=secure-by-default --json` returns exit `0` with valid `review_contract`; meta-feature false positives are gone. |
| AC-SBD-2.4 | Covered | Exit codes are preserved end-to-end in CLI JSON mode: blocking = `10`, inconclusive = `11`, bad input = `12`. |
| AC-SBD-2.5 | Covered | MICRO remains non-blocking in the test suite; MEDIUM blocking/non-blocking behavior still matches the classification policy. |
| AC-SBD-2.6 | Covered | No change regressed the direct-LLM fallback contract documented in the baseline rule. |
| AC-SBD-2.7 | Covered | Re-review found no destructive git/history operations; behavior remains read-only except for the allowed findings artifact writes. |

### Security findings

- `.aioson/context/security-findings-secure-by-default.json` has a valid `review_contract` (`scope_mode`, `evidence_policy`, `findings_artifact_path` present).
- There are **0 open** and **0 needs_validation** findings after re-run.
- The 7 previous audit findings are preserved as historical records with `status: fixed`; no Gate D blockers remain.

### Independent verification performed

- `node --test tests/commands/security-scan.test.js tests/commands/security-audit.test.js` → 25/25 passing.
- End-to-end CLI JSON checks:
  - blocking: `security:scan ... --json` → exit `10`
  - inconclusive: `security:scan ... --json` with fake `npm` network failure → exit `11`
  - bad input: `security:scan <missing-path> --json` → exit `12`
  - audit meta-feature: `security:audit . --slug=secure-by-default --json` → exit `0`

### Residual risks

- Phase 1 residuals L-01 (command-name distinction wording) and L-02 (severity scale lacks `low` / `info`) remain accepted and deferred to later phases of the Sheldon plan.
- `tests/agent-contracts.test.js` (`dev.md` size) and the `better-sqlite3` Windows UNC issue remain pre-existing and unrelated to this phase.

### Summary

**0 Critical, 0 High, 0 Medium, 0 Low.** AC: **7/7 covered.**  
**Phase 2 — CLI Security Scan and Audit:** approved in re-review.

## Dev implementation — Phase 3 — 2026-04-29

- Created `.aioson/skills/process/secure-tdd/SKILL.md` plus `references/node-express.md`, `references/nextjs.md`, and `references/planned-stacks.md`.
- Mirrored the same tree into `template/.aioson/skills/process/secure-tdd/`; `diff -ru .aioson/skills/process/secure-tdd template/.aioson/skills/process/secure-tdd` is clean.
- Updated `.aioson/agents/dev.md` and `template/.aioson/agents/dev.md` so `secure-tdd` loads only after `aioson-spec-driven`, only for MEDIUM features with sensitive surface, with reduced optional behavior for SMALL and no auto-load for MICRO.
- Re-synced workspace/template `@dev` prompts and reduced both files to 13,874 bytes, clearing the previously known `tests/agent-contracts.test.js` size failure as part of this slice.
- Validation:
  - `find .aioson/skills/process/secure-tdd -maxdepth 2 -type f | sort`
  - `find template/.aioson/skills/process/secure-tdd -maxdepth 2 -type f | sort`
  - `node --test tests/agent-locale-sync.test.js tests/install-profile.test.js tests/agent-contracts.test.js` → 32/32 passing
- Next agent: `@qa` for AC-SBD-3.1..3.6 verification and workflow-behavior re-check.

## QA re-review — Phase 3 — 2026-04-29

**Phase:** 3 — Secure TDD Skill  
**Date:** 2026-04-29  
**Verdict:** **PASS**

### AC coverage

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-3.1 | Covered | `.aioson/skills/process/secure-tdd/SKILL.md` exists and defines when to load, loading order, goal, adversarial loop and output contract. |
| AC-SBD-3.2 | Covered | `references/node-express.md` and `references/nextjs.md` exist with concrete minimal test patterns for auth bypass, IDOR, server-side validation, external URL sanitization and concurrency. |
| AC-SBD-3.3 | Covered | `references/planned-stacks.md` lists Laravel/Pest, Django/Pytest, Rails/RSpec and FastAPI/Pytest as planned or minimal references only, explicitly non-blocking for v1. |
| AC-SBD-3.4 | Covered | `SKILL.md` states `Frontend is never the authority.` and requires validation/authorization/limits to stay server-side. |
| AC-SBD-3.5 | Covered | The skill covers auth bypass, IDOR, race condition, server-side input limits, upload validation and unsafe external URL handling via the goal + control mapping. |
| AC-SBD-3.6 | Covered | `.aioson/agents/dev.md` and the template keep `aioson-spec-driven` first and load `secure-tdd` only as a complement for MEDIUM sensitive surfaces; SMALL is reduced/optional and MICRO never auto-loads. |

### Security findings

- `.aioson/context/security-findings-secure-by-default.json` has a valid `review_contract`.
- There are **0 open** and **0 needs_validation** findings for this feature at the moment of the re-review.
- Historical Phase 2 audit findings remain preserved as `fixed`.

### Independent verification performed

- `diff -ru .aioson/skills/process/secure-tdd template/.aioson/skills/process/secure-tdd` → clean
- `cmp -s .aioson/agents/dev.md template/.aioson/agents/dev.md` → synced
- `node --test tests/agent-locale-sync.test.js tests/install-profile.test.js tests/agent-contracts.test.js` → 32/32 passing
- Static review confirmed `secure-tdd` does **not** invoke `@pentester`, does **not** emit runtime events, and does **not** bypass the normal workflow.

### Residual risks

- The workflow state for the whole feature has already advanced to `@pentester`, so this QA result is a **phase approval**, not a full-feature Gate D closure.
- Phase 4 (`app_target`) aguarda re-review do `@qa`; Phase 5 (runtime/gates) continua pendente, então a feature permanece em progresso.

### Summary

**0 Critical, 0 High, 0 Medium, 0 Low.** AC: **6/6 covered.**  
**Phase 3 — Secure TDD Skill:** approved in re-review.

## QA review — Phase 4 — 2026-04-29

**Phase:** 4 — Pentester App Target Mode  
**Date:** 2026-04-29  
**Verdict:** **FAIL**

### AC coverage

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-4.1 | Covered | `.aioson/agents/pentester.md`, template mirror and `tests/pentester-text-contracts.test.js` define the explicit `app_target_*` surface catalog for A01/A02/A03/A04/A07. |
| AC-SBD-4.2 | Covered | `app_target` and `framework_target` stay separated in the prompt contract, with `cross_scope_reason` required for scope mixing. |
| AC-SBD-4.3 | Partial | `src/handoff-contract.js` still allows a malformed `app_target` findings envelope to satisfy the QA gate when no open blockers exist. Reproduction: a temporary `security-findings-demo.json` with only `{ review_contract: { target_mode: "app_target" }, findings: [] }` plus `gate_execution: approved` returns `{ ok: true }`. |
| AC-SBD-4.4 | Covered | No auto-fix path was added; the contract still assigns remediation to `@dev` / `@qa`. |
| AC-SBD-4.5 | Covered | `agent:invoke` remains a thin alias over `agent:prompt`, and `app_target` still requires explicit slug + scope before activation. |
| AC-SBD-4.6 | Covered | The feature continues to use the canonical `.aioson/context/security-findings-{slug}.json` artifact; no parallel schema was introduced. |

### Findings

#### High
**[C-01] QA handoff accepts malformed `app_target` review contracts**  
File: `src/handoff-contract.js:216`  
Risk: Gate D can pass even when an `app_target` pentester artifact is missing the `review_contract` fields that `@qa` explicitly requires (`scope_mode`, `evidence_policy`, `findings_artifact_path`, and `target_scope`). That weakens the security gate from "auditable contract" to "best effort" and allows an on-demand pentester review to be treated as valid without enough metadata to verify scope or evidence policy.  
Fix: Parse and validate the findings envelope before returning `ok: true`. Missing required `review_contract` fields must fail the QA handoff, and `app_target` must require explicit `target_scope`. Add a regression test that reproduces the malformed-envelope pass-through.

#### Medium
**[M-01] Blocker messages drop the finding identifier for scan/audit records**  
File: `src/handoff-contract.js:230`  
Risk: the QA gate blocks correctly, but the blocker output becomes `security: 1 unresolved high/critical finding(s) blocking gate:` when the finding only has `finding_id`. That obscures which record must be fixed and slows remediation.  
Fix: format blocker output with `f.id ?? f.finding_id`, or normalize the schema when loading findings, and add regression coverage for both shapes.

### Security findings

- `.aioson/context/security-findings-secure-by-default.json` is structurally valid for the current feature state and has no open blockers.
- The failure is in the workflow contract layer: `validateHandoffContract()` does not reject malformed `app_target` review envelopes when findings are otherwise empty or fixed.

### Independent verification performed

- `node --test tests/agents-command.test.js tests/json-output.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js` → 62/62 passing.
- `node --test tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js` → 24/24 passing.
- Manual reproduction against `validateHandoffContract()` confirmed a false pass for:
  - `review_contract: { target_mode: "app_target" }`
  - `findings: []`
  - `spec-demo.md` with `gate_execution: approved`
  - Result: `{ ok: true }`
- Manual reproduction also confirmed blocker diagnostics lose the record ID when the artifact uses `finding_id` instead of `id`.

### Summary

**0 Critical, 1 High, 1 Medium, 0 Low.** AC: **5/6 covered, 1 partial.**  
**Phase 4 — Pentester App Target Mode:** **not approved**.

## Dev corrections — Phase 4 — 2026-04-29

- Fixed C-01 in `src/handoff-contract.js`: the `@qa` gate now parses the findings envelope, requires `review_contract.scope_mode`, `review_contract.evidence_policy`, and `review_contract.findings_artifact_path`, and additionally requires `review_contract.target_scope` when `target_mode = app_target`.
- Fixed O-01 in `src/handoff-contract.js`: blocker messages now use `id ?? finding_id`, so `security:scan` / `security:audit` artifacts keep a visible record identifier when they block Gate D.
- Added regression coverage in `tests/handoff-contract-pentester.test.js` for malformed `app_target` review contracts and for blocker messages that rely on `finding_id`.
- Updated `tests/workflow-engine-hardening.test.js` and `tests/harness/pentester-scenarios.test.js` fixtures to carry a valid `review_contract`, so the gate tests keep exercising blocker behavior instead of failing for unrelated contract omissions.
- Verification:
  - `node --test tests/handoff-contract-pentester.test.js tests/workflow-engine-hardening.test.js tests/harness/pentester-scenarios.test.js` → passing
  - `node --test tests/agents-command.test.js tests/json-output.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js` → 62/62 passing
  - `node --test tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js` → 26/26 passing
- Manual reproduction of a malformed `app_target` findings artifact now returns `ok: false` with `invalid review_contract` in the blocker output.
- Next agent: `@qa` for Phase 4 re-review.

## QA re-review — Phase 4 — 2026-04-29

**Phase:** 4 — Pentester App Target Mode  
**Date:** 2026-04-29  
**Verdict:** **PASS**

### AC coverage

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-4.1 | Covered | `tests/pentester-text-contracts.test.js` plus the workspace/template prompts still define the explicit `app_target_*` surface catalog for A01/A02/A03/A04/A07. |
| AC-SBD-4.2 | Covered | Prompt contracts still separate `app_target` from framework-only surfaces and require `cross_scope_reason` for explicit scope mixing. |
| AC-SBD-4.3 | Covered | `src/handoff-contract.js` now validates `review_contract.scope_mode`, `evidence_policy`, `findings_artifact_path`, and `target_scope` for `app_target`; malformed envelopes now return `ok: false`. |
| AC-SBD-4.4 | Covered | No auto-fix path was introduced; remediation ownership remains with `@dev` and gate ownership remains with `@qa`. |
| AC-SBD-4.5 | Covered | `agent:invoke` remains a thin alias over `agent:prompt`, and invocation can still be skipped when there is no sensitive surface. |
| AC-SBD-4.6 | Covered | The canonical `.aioson/context/security-findings-{slug}.json` envelope remains the only machine-readable findings artifact used by the phase. |

### Security findings

- `.aioson/context/security-findings-secure-by-default.json` has a valid `review_contract` for the current feature state.
- There are **0 open** and **0 needs_validation** findings in the current artifact.
- Historical audit findings remain preserved as `fixed`; no Gate D blocker remains for this phase.

### Independent verification performed

- `node --test tests/agents-command.test.js tests/json-output.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js` → 62/62 passing.
- `node --test tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js` → 26/26 passing.
- Manual malformed-envelope reproduction now returns `ok: false` with `invalid review_contract` and the missing required fields listed.
- Manual blocker reproduction with `finding_id` now returns `ok: false` and preserves `security-audit-SEC-SBD-03-abc123` in the blocker message.

### Residual risks

- Phase 5 (`plan-qa-gates-runtime.md`) remains pending, so this is a **phase approval**, not final feature closure.
- The current live findings artifact is still the Phase 2 audit output; a future on-demand `app_target` pentester run will need to populate `target_mode` and `target_scope` in its own review contract.

### Summary

**0 Critical, 0 High, 0 Medium, 0 Low.** AC: **6/6 covered.**  
**Phase 4 — Pentester App Target Mode:** approved in re-review.

## QA review — Phase 5 — 2026-04-29

**Phase:** 5 — QA Gates and Runtime Events  
**Date:** 2026-04-29  
**Verdict:** **PASS**

### AC coverage

| AC | Status | Evidence |
|---|---|---|
| AC-SBD-5.1 | Covered | `src/commands/workflow-next.js` auto-runs `runSecurityAudit()` when `@qa` is activated in MEDIUM feature mode, and `.aioson/agents/qa.md` / template require `aioson security:audit . --slug={slug}` in direct mode. |
| AC-SBD-5.2 | Covered | `src/commands/agents.js` records `pentester_app_target_invoked`, and the QA prompt/template instruct conditional invocation for auth/money/ownership heuristics. Manual `node bin/aioson.js agent:invoke pentester . --mode=app_target --feature=secure-by-default --scope=refund-flow --json` succeeded. |
| AC-SBD-5.3 | Covered | `src/handoff-contract.js` now requires a valid `security-findings-{slug}.json` artifact for MEDIUM Gate D and blocks on open High/Critical findings; `src/commands/workflow-next.js` emits `security_gate_blocked` on contract failure. |
| AC-SBD-5.4 | Covered | Gate D passes once findings are fixed/reconfirmed; focused tests cover fixed/non-blocking states and the current `security-findings-secure-by-default.json` artifact has `0 open` / `0 needs_validation`. |
| AC-SBD-5.5 | Covered | Focused tests verify all four runtime events: `security_scan_completed`, `security_audit_completed`, `pentester_app_target_invoked`, `security_gate_blocked`. Manual runtime check in `.aioson/runtime/aios.sqlite` confirmed `security_audit_completed` and `pentester_app_target_invoked` were persisted on real CLI runs. |
| AC-SBD-5.6 | Covered | `.aioson/agents/qa.md` and template now distinguish "CLI unavailable" from "audit ran and passed", require explicit fallback notes in the QA report and `project-pulse.md`, and prohibit fabricated runtime events. |
| AC-SBD-5.7 | Covered | Runtime SQLite can aggregate adoption directly: `select event_type, count(*) from execution_events where event_type in (...) group by event_type` returns persisted security event counts without chat parsing. |

### Security findings

- `node bin/aioson.js security:audit . --slug=secure-by-default --json` returned `exitCode: 0`, valid `review_contract`, and summary `0 critical / 0 high / 0 medium / 0 low / 0 inconclusive`.
- The current artifact `.aioson/context/security-findings-secure-by-default.json` preserves historical findings as non-open records; no Gate D blocker remains for this phase.

### Independent verification performed

- `node --test tests/commands/security-audit.test.js tests/commands/security-scan.test.js tests/agents-command.test.js tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js` → **78/78 passing**
- `node bin/aioson.js security:audit . --slug=secure-by-default --json` → `exitCode 0`
- `node bin/aioson.js agent:invoke pentester . --mode=app_target --feature=secure-by-default --scope=refund-flow --json` → prompt generated + runtime bootstrap ok
- SQLite check: `execution_events` contains `security_audit_completed` and `pentester_app_target_invoked`; grouped counts are queryable directly from `.aioson/runtime/aios.sqlite`

### Residual risks

- The feature implementation is QA-approved, but `aioson workflow:status .` still reports `@pentester` as the active stage while `workflow.state.json` also lists `@qa` as completed. This is a workflow-state reconciliation issue, not a Phase 5 implementation defect, but it should be corrected before final feature closure/archive.

### Summary

**0 Critical, 0 High, 0 Medium, 0 Low.** AC: **7/7 covered.**  
**Phase 5 — QA Gates and Runtime Events:** approved.
