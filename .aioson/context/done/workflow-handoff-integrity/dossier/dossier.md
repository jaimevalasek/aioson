---
feature_slug: workflow-handoff-integrity
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-20T18:31:48.101Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-20T18:31:48.101Z
---
## Why

Mesmo após o hotfix v1.9.3 (`prd-workflow-hotfix-1-9-3.md`) resolver o deadlock pontual do `@pm`, **quatro gaps estruturais permanecem** na auto-orquestração — todos confirmados via investigação de código em 2026-05-19:

- **F1 (média):** `dev-state.md` per-project (correto) mas sem cleanup automático quando feature anterior terminou. `preflight.js:72` detecta stale mas só warning, não oferece reset. Usuário vê stale state apontando para outra feature/projeto e não sabe se age sobre.
- **F2 (alta, bloqueia auto-roteamento):** apenas 2 de 22+ agent files no template (`dev.md:259`, `qa.md:394, 401`) instruem `aioson workflow:next . --complete=<self>`. Os demais só chamam `agent:done`, que (`src/commands/runtime.js:1173-1250`) é puramente telemetria SQLite — **não avança o pointer**. Em qualquer cadeia que passa por agente sem a instrução, `workflow:status` trava onde o último agente "complete" estava.
- **F3 (média, não totalmente confirmado):** `/analyst` (e possivelmente outros) tem "Next step" estático no rodapé do prompt, sem checar se manifest do `/sheldon` deixou decisões pendentes (`pending-architect-decisions`). Resultado: agente roteia para o próximo errado, e o erro só aparece em `/dev` ou `/pm`.
- **T5 (alta — gap estrutural meta):** o `sync-agents-preflight.js` (introduzido em `ca15f55`) só checa `## Feature dossier` length. Não pega divergência semântica em outras seções. Qualquer migração futura pode repetir o padrão de `981a8fd` (workspace updated, template/test esquecidos) sem CI detectar.

E uma observação meta (T6): essas falhas só apareceram em **uso real pós-release**, não em teste interno. Sugere que o release process da v1.9.x não inclui smoke test ponta-a-ponta da cadeia em fixture greenfield.

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/commands/runtime.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-20T19:19:29.231Z
- path: src/commands/workflow-next.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-20T19:19:29.753Z
  note: "DPC-01 path correction 2026-05-20 — was workflow.js (does not exist); runWorkflowNext lives in workflow-next.js line 970"
- path: src/handoff-contract.js
  role: core-module
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-20T19:19:30.304Z
  note: "DPC-03 path correction 2026-05-20 — was agent-artifact-map.js (would duplicate). CONTRACTS map already at lines 15-99; F2 EXTEND with getCanonicalArtifactForAgent helper"
- path: src/commands/sync-agents-preflight.js
  role: util
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-20T19:19:30.833Z
  note: "DPC-02 path correction 2026-05-20 — was scripts/sync-agents-preflight.js (wrong dir). Already has Active Learning Loop Phase 6 parity checks (DPC-06); T5 extends existing plugin host"
- path: scripts/smoke-run-chain.js
  role: test
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-20T19:19:31.675Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

- [.aioson/rules/disk-first-artifacts.md](.aioson/rules/disk-first-artifacts.md) — Workflow state file é signal canônico, não inferência runtime — alinhado com disk-first principle

- [.aioson/rules/spec-level-ownership.md](.aioson/rules/spec-level-ownership.md) — Spec é authoritative para gate transitions, alinhado com BR-08

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:8a5d97732889176cbb051fb966f11192a017fb11aed4a99db219b80aebed2942 -->
**2026-05-20T18:32:34.569Z** | @analyst | _Agent Trail_

Requirements mapeados: 10 RFs (5 must + 4 should + 1 cross-cutting wiring audit), 44 ACs (39 binárias em phase plans + 5 cross-cutting), 12 edge cases (4 GAPs flagados AC-F2-09/10, AC-F1-08, AC-T5-08), 8 BRs framework-level. Classification MEDIUM confirmada com exceção documentada (formula analyst sub-representa framework-internal multi-phase).

<!-- sha256:5695b459ab70496ba5a34b6920dca23e73bd449ef29522c692c83ca5e68a4632 -->
**2026-05-20T19:19:01.925Z** | @architect | _Agent Trail_

5 DDs resolved: DD-01 presence-detection (não flag opt-in), DD-02 regex+whitelist hybrid, DD-03 section+token+frontmatter, DD-04 mock-only T6, DD-05 progressive release v1.9.5→v1.10.0. 4 ACs faltantes adicionados aos phase plans (F2-09/10, F1-08, T5-08). Architecture doc 250+ lines com per-phase sections + module structure + cross-cutting concerns. Manifest status: pending-architect-decisions → ready.

<!-- sha256:b2efa7bb63a92cf576ccc670e161c440788085b8e7599f1865fb4367c69d55c6 -->
**2026-05-20T19:25:01.952Z** | @pm | _Agent Trail_

Implementation plan produzido: 5 phases × release individual (v1.9.5→v1.10.0), 44 ACs distribuídos, Required Context Package por phase, 7 PMDs + 5 DDs referenciados como pre-taken, 6 checkpoints incrementais, Risk-09 inception mitigation (Phase 1 via /deyvin). Gate C approved. Não recomenda /orchestrator (phases são sequenciais por design).

## Revision Requests

_(vazio — populado a partir da Phase 2)_
