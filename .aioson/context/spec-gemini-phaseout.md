---
feature: gemini-phaseout
status: paused
started: 2026-05-28
classification: SMALL
phase_scope: "Phase 1 (v1.21.0 — warnings) only; Phases 2/3 date-gated future"
gate_requirements: approved
---

# Spec — Gemini CLI Phase-out

## What was built
**Phase 1 (v1.21.0 — warnings) — LANDED 2026-05-28.** Warning-only; no removals.
- `src/install-wizard.js`: gemini `TOOLS` entry flagged `deprecated: true`; `renderScreen1` renders `⚠ [DEPRECATED] free tier ends 2026-06-18` next to Gemini.
- `src/commands/install.js`: post-install notice (`install.gemini_deprecation_notice`) when gemini ∈ selected tools.
- `src/doctor.js`: new advisory check `id: harness:gemini_deprecation` (severity `warning`, `key: doctor.gemini_deprecation`, `hintKey: doctor.gemini_deprecation_hint`). Fires ONLY when `.gemini/permissions.toml` OR `.gemini/GEMINI.md` exists (BR-GP-03). Excluded from `report.ok` gate.
- `src/permissions-generator.js`: `buildGeminiToml` prepends 3-line deprecation header; still emits the file (enterprise).
- `src/lib/tool-capabilities.js`: deprecation comment on the gemini entry (see M2 note below).
- `src/i18n/messages/{en,pt-BR,es,fr}.js`: 3 new keys × 4 locales (`doctor.gemini_deprecation`, `doctor.gemini_deprecation_hint`, `install.gemini_deprecation_notice`).
- `CHANGELOG.md`: `## [1.21.0]` block. `package.json` + `project.context.md` bumped 1.20.0 → 1.21.0.
- `tests/gemini-phaseout.test.js`: 11 tests, all green. Full suite: 2823/2833 pass, 9 pre-existing failures unchanged, 0 new.

### ⚠ M2 deviation from PRD/requirements (decision)
The PRD/requirements pointed M2 at an operator-memory `compatible_via=[claude-code, codex, opencode, gemini-cli]` matrix. **That matrix does not exist anywhere in the codebase** (verified: no `compatible_via` token; `src/operator-memory/` has zero gemini references; `src/constants.js` is a template file-path list, not a tool matrix). M2 as written had no target. Reinterpreted: added a deprecation comment to the real `gemini` entry in `TOOL_CAPS` (`src/lib/tool-capabilities.js`) — the only actual tool matrix that includes gemini. Trivially reversible if a different target is preferred.

## Entities added
Sem entidades de banco. Superfícies de código alteradas na Fase 1 (v1.21.0):

| Superfície | Arquivo | Mudança |
|------------|---------|---------|
| install-wizard tool list | `src/install-wizard.js:9,165` | label `[DEPRECATED]` + mensagem pós-seleção |
| doctor check | `src/doctor.js` | `id: harness:gemini_deprecation` / `key: doctor.gemini_deprecation` (warning, guarded by `.gemini/` detection) |
| permissions-generator | `src/permissions-generator.js:266,361` | header warning no `.gemini/permissions.toml` (continua emitindo) |
| operator-memory matriz | `src/lib/tool-capabilities.js` | string gemini-cli marcada deprecated/removed-in-v1.22 |
| CHANGELOG | `CHANGELOG.md` | bloco `## [1.21.0]` |
| i18n catálogo | `src/i18n/messages/{en,pt-BR,es,fr}.js` | novas keys nos 4 locales |

## Key decisions
- **2026-05-28** Re-anchor de versões (v1.17→v1.21, v1.18→v1.22, v1.20→TBD) — repo já em 1.20.0; datas são a âncora vinculante, versões seguem next-minor.
- **2026-05-28** Naming do doctor check: `id: harness:gemini_deprecation` + `key: doctor.gemini_deprecation` — confirmado contra o padrão de dois campos em doctor.js.
- **2026-05-28** i18n: 4 locales na Fase 1 (infra existe).
- **2026-05-28** S2 (`harness:migrate`) deferido para Fase 2+.
- **2026-05-28** @dev implementa SOMENTE a Fase 1; Fases 2/3 são date-gated e não podem antecipar.

## Edge cases handled
Ver `requirements-gemini-phaseout.md` § 8 (EC-GP-01..06). Críticos:
- EC-GP-01: zero false positive em greenfield (test: 2 tmpdirs).
- EC-GP-02: `.gemini/permissions.toml` enterprise byte-identical pós setup re-run.
- EC-GP-04: check dispara por OR (`permissions.toml` OU `GEMINI.md`).

## Dependencies
- Reads: `.gemini/permissions.toml`, `.gemini/GEMINI.md` (detecção no doctor), `src/lib/tool-capabilities.js` (matriz).
- Writes: `src/install-wizard.js`, `src/doctor.js`, `src/permissions-generator.js`, `src/lib/tool-capabilities.js`, `src/i18n/messages/*.js`, `CHANGELOG.md`.

## Notes
- **NÃO fechar a feature após Fase 1** — Fases 2 (v1.22, ≥2026-06-19) e 3 (~Q4-2026) ficam pendentes; `features.md` permanece `in_progress`.
- **Ship gate Fase 1: 2026-06-10** (`npm publish` manual). Cutoff Google: 2026-06-18.
- **BR-GP-01 é invariante absoluto:** nunca tocar `.gemini/permissions.toml` pré-existente, em nenhuma fase.
- Workflow state machine está carregado para `cross-tool-project-knowledge` — esta feature avança em trilha separada via `--feature=gemini-phaseout`.
- CHANGELOG drift (faltam 1.19/1.20): housekeeping separado, não escopo desta feature.

## QA sign-off
- Date: 2026-05-28
- Scope: **Phase 1 (v1.21.0 — warnings) only.** Phases 2/3 date-gated, not reviewed.
- **Verdict: PASS** — 0 Critical, 0 High, 1 Medium (accepted), 2 Low (residual).
- AC coverage (Phase 1): M1 covered (install-wizard + doctor + permissions-generator, unit + e2e verified), M2 covered-reinterpreted, M3 covered. M4 (publish ≤2026-06-10) is a manual process gate — not yet executable.
- Evidence: 62/62 across feature + affected suites; full suite 2823/2833 (9 pre-existing failures unchanged, 0 new). End-to-end doctor verified: warning renders + i18n resolves WITH `.gemini/`, silent on greenfield (BR-GP-03), fires on GEMINI.md-only OR branch (EC-GP-04).
- Findings:
  - **[M-01] M2 spec deviation (accepted):** the PRD's `operator-memory compatible_via` matrix does not exist in code; reinterpreted as a comment on `TOOL_CAPS.gemini`. User-facing deprecation intent is covered by M1 (doctor/wizard/permissions). Non-blocking — user may accept or redirect.
  - **[L-01] Warning renders with `[FAIL]` icon:** framework-wide convention for `severity:'warning'` checks (living-memory checks identical); `report.ok` correctly unaffected. Possible future polish: distinct `[WARN]` icon (out of scope, affects all warning checks).
  - **[L-02] install.js post-selection notice not unit-tested:** low-risk one-liner; i18n key existence is tested. Optional belt-and-suspenders test.
- Residual / process: M4 — manual `npm publish` of v1.21.0 must land before the ship gate **2026-06-10** (cutoff 2026-06-18).
- **Feature NOT closed:** Phase 1 approved; feature stays `in_progress` in `features.md` for Phases 2 (≥2026-06-19) and 3 (~Q4-2026).
