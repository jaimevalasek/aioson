---
gate_execution: approved
feature: feature-dossier
status: in_progress
started: 2026-04-28
classification: MEDIUM
schema_version: "1.0"
---

# Spec — Feature Dossier & Reverse Invocation

## What was built
[To be filled by @dev during implementation]

## Entities added (from requirements-feature-dossier.md § 2)

- **Dossier** — `.aioson/context/features/{slug}/dossier.md` (Markdown + frontmatter YAML + bloco `## Code Map` YAML embutido)
- **Revision** — entrada em `.aioson/context/features/{slug}/revisions.json`
- **CodeMapEntry** — entradas `files[]`, `modules[]`, `patterns[]` em `## Code Map`
- **AgentFinding** — entrada append-only em `## Agent Trail`
- **RuleLink** — entrada em `## Rules & Design-Docs aplicáveis`
- **GateRevisionRound** — campo `gate_revision_rounds` em `workflow.state.json`

Modificações em entidades existentes:
- `handoff-contract.json` ganha `dossier_uri`, `pending_revisions_count`, `blocking_revisions` (opcionais, backwards-compat).
- Diretórios `.aioson/context/features/{slug}/` (criação) e `.aioson/context/done/{slug}/dossier/` (archive target).

## Key decisions

- [2026-04-27] Path B (plano faseado externo) sobre in-place enrichment — sizing score 9 (sheldon).
- [2026-04-27] `code_map` é YAML embutido em `dossier.md`, não arquivo separado — atomicidade + menor file count.
- [2026-04-27] `revisions.json` é fonte de verdade (file-first, `disk-first-artifacts.md`); SQLite é mirror para dashboard.
- [2026-04-27] Modo SUGERIDO para invocação reversa (não automático) — LLMs fracos podem gerar falso-positivo.
- [2026-04-27] Anti-loop: 3 ciclos por gate; `--force-revision` exige confirmação humana.
- [2026-04-27] Gates aprovados permanecem aprovados durante revisão reversa; re-execução append `revision_round` (não rewind).
- [2026-04-27] Dossier é fonte VIVA por-feature; `context-pack` faz SNAPSHOT no início da sessão (resolve dual-source vs. active retrieval).
- [2026-04-27] Bootstrap retroativo INCLUÍDO (Fase 3) — `dossier:init --from-existing` para adoção incremental.
- [2026-04-27] Auto-compaction a 15KB; seções de gates encerrados migram para `dossier-history.md`.
- [2026-04-28] Permission model: qualquer agente da cadeia pode abrir revision contra qualquer outro (default aprovado pelo user).
- [2026-04-28] `--slug` default infere de `workflow.state.json#featureSlug` (default aprovado).
- [2026-04-28] `feature:close --verdict=PASS` bloqueia se houver `pending_user_approval` (default aprovado).
- [2026-04-28] `dossier:add-finding` com hash duplicado é no-op silencioso (default aprovado).

## Edge cases handled

Ver requirements-feature-dossier.md § 7 (16 edge cases mapeados, EC-1 a EC-16).

## Dependencies

**Reads:**
- `.aioson/context/prd-{slug}.md` — extração de Why/What no `dossier:init`
- `.aioson/context/spec-{slug}.md` — referência por path no dossier
- `.aioson/context/requirements-{slug}.md` — referência por path no dossier
- `.aioson/context/handoff-protocol.json` — leitura de estado atual
- `.aioson/context/workflow.state.json` — slug ativo + gate_revision_rounds
- `.aioson/rules/*.md` + `.aioson/design-docs/*.md` — validação de paths em `dossier:link-rule`
- `.aioson/context/done/{slug}/` — fonte do `dossier:init --from-existing`

**Writes:**
- `.aioson/context/features/{slug}/dossier.md`
- `.aioson/context/features/{slug}/revisions.json`
- `.aioson/context/features/{slug}/dossier-history.md` (sob demanda, Fase 3)
- `.aioson/context/features/{slug}/.dossier.lock` (transitório)
- `.aioson/context/done/{slug}/dossier/` (archive target)
- `.aioson/context/handoff-protocol.json` (extensão de campos)
- `.aioson/context/workflow.state.json` (campo `gate_revision_rounds`)
- `.aioson/runtime/aios.sqlite` (mirror via `runtime:emit`, não fonte de verdade)
- `.aioson/docs/dossier/schema.md` + `agent-templates.md` (uma vez na instalação)

**Modifies:**
- Prompts de agentes em `.aioson/agents/*.md` (Fase 1: 3 agentes; Fases 2-3: 8 agentes da cadeia MEDIUM)
- `src/lib/handoff-contract.js` (extensão backwards-compat)
- `src/commands/workflow.js` (consulta de blocking_revisions)
- `src/commands/feature.js` (extensão archive)
- `src/lib/active-retrieval.js` (commit 5cc7074 — inclusão de dossier ativo no ranking)

**Novos módulos previstos:**
- `src/lib/dossier-store.js` — io layer
- `src/lib/revision-store.js` — CRUD de revisions.json + atualização do dossier
- `src/lib/codemap-store.js` — CRUD do code_map embutido
- `src/lib/dossier-bootstrap.js` — síntese a partir de artefatos existentes
- `src/lib/dossier-compact.js` — algoritmo de compaction
- `src/commands/dossier.js` — sub-commands init, show, add-finding, add-codemap, link-rule, compact
- `src/commands/revision.js` — sub-commands open, list, resolve

## Phase 2 — implemented 2026-04-28

- [2026-04-28] `src/dossier/revision-store.js` criado: CRUD completo para `revisions.json` (open, list, resolve, getBlockingRevisions).
- [2026-04-28] `src/dossier/store.js` ganhou `addFinding()` append-only com dedup SHA-256.
- [2026-04-28] `src/commands/dossier.js` ganhou `dossier:add-finding` (AC9: idempotente por hash).
- [2026-04-28] `src/commands/revision.js` criado: `revision:open`, `revision:list`, `revision:resolve`.
- [2026-04-28] `src/handoff-contract.js` ganhou `getBlockingRevisions()`.
- [2026-04-28] `src/commands/workflow-next.js` bloqueia handoff quando há revisões blocking pendentes (AC5).
- [2026-04-28] `feature:archive` já snapshota `revisions.json` via move do dir `features/{slug}/` (AC10 — sem código extra).
- [2026-04-28] `gate_revision_rounds` implementado em `workflow.state.json`; limite 3 ciclos (AC6, AC7).
- [2026-04-28] `.aioson/docs/dossier/agent-templates.md` criado (AC11).
- [2026-04-28] Telemetria (AC12) adiada — requer live session ativa; fora de escopo desta entrega.

## Phase 1 corrections — applied 2026-04-28

- [2026-04-28] H-01 resolved: `dossier:init` already set `created_by: dossier-init-prompt` when no PRD. Tests were broken by Node.js v18 `beforeEach` scope issue (module-level hooks don't run between `it()` inside `describe`). Fix: added per-test `beforeEach`/`afterEach` inside the affected `describe` blocks in `tests/commands/dossier.test.js`, `tests/dossier/store.test.js`, and `tests/commands/feature-archive-dossier.test.js`.
- [2026-04-28] M-01 was already fixed: `ALLOWED_STATUSES` = `['active', 'paused', 'closed']` in `src/dossier/schema.js`.
- [2026-04-28] All Phase 1 acceptance criteria (AC1–AC8) now pass.

## Phase 3 — implemented 2026-04-28

- [2026-04-28] `src/dossier/codemap-store.js` criado: `addCodemap()` (idempotente por path+lines, YAML parse/serialize roundtrip), `linkRule()` (valida path em .aioson/rules/ ou .aioson/design-docs/, idempotente).
- [2026-04-28] `src/dossier/dossier-compact.js` criado: `compact()` (migra seções MIGRATABLE_SECTIONS para `dossier-history.md` quando > 15KB; history é append-only), `shouldCompact()`.
- [2026-04-28] `src/dossier/dossier-bootstrap.js` criado: `initFromExisting()` — sintetiza dossier a partir de prd, spec, sheldon-enrichment, requirements, architecture, done/; idempotente via `bootstrap_hash`; `EBOOTSTRAPEMPTY` quando sem artefatos.
- [2026-04-28] `src/commands/dossier.js` ganhou: `dossier:add-codemap`, `dossier:link-rule`, `dossier:compact`, `dossier:init --from-existing`.
- [2026-04-28] `src/cli.js` registrado: 4 novos comandos dossier + aliases kebab.
- [2026-04-28] `src/context-memory.js` estendido: `collectActiveDossiers()` + `rankDossier()` — dossiers `status: active` incluídos no `context:pack` como fontes ranqueadas (rank 55–70); closed/paused excluídos.
- [2026-04-28] `.aioson/docs/dossier/schema.md` atualizado para v1.1 com Code Map structure, CLI docs, compaction rules, active retrieval.
- [2026-04-28] `.aioson/docs/dossier/agent-templates.md` atualizado com templates de `dossier:add-codemap` e `dossier:link-rule` para @analyst, @architect e @dev.
- [2026-04-28] 41 novos testes: `codemap-store.test.js`, `dossier-compact.test.js`, `dossier-bootstrap.test.js`, `active-retrieval-dossier.test.js`. Total: 155 testes, 0 falhas.

### AC coverage (Phase 3)
- AC1: ✅ `dossier:init --from-existing` com só spec, só PRD global, e feature done/.
- AC2: ✅ Schema YAML do code_map com validação de path, lines int-int, role enum, coupling_risk.
- AC3: ✅ `dossier:add-codemap` idempotente por (path, lines).
- AC4: ✅ `dossier:link-rule` falha `ELINKREULEPATH` se path fora de .aioson/rules/ ou .aioson/design-docs/.
- AC5: ✅ Auto-compaction via `compact()` com threshold 15KB; history append-only.
- AC6: ✅ `dossier-history.md` append-only — nunca compactado novamente.
- AC7: ✅ `context:pack` inclui dossier ativo como source ranqueada; dossiers closed excluídos.
- AC8: ✅ `dossier:show` lê v1.0 e v1.1 (bootstrap_hash ignorado pelo reader existente).
- AC9: ✅ `dossier:init --from-existing` sem artefatos → `EBOOTSTRAPEMPTY` + mensagem clara.
- AC10: ✅ Agent templates atualizados (3 agentes prioritários: @analyst, @architect, @dev).

## Notes

- Smoke retroativo `dossier:init sdlc-process-upgrade --from-existing` executado por @qa em 2026-04-28 — ✅ dossier criado com status=closed, bootstrap_hash presente, Why/What extraídos.
- Corrections plan em `.aioson/plans/feature-dossier/corrections-2026-04-28-phase3.md` — 0 mandatory, 3 optional (O-01 Medium, O-02/O-03 Low).

## QA Sign-off

- **Date:** 2026-04-28
- **Verdict:** PASS
- **Residual:** O-01: auto-compact não dispara após revision:resolve — agentes chamam dossier:compact explicitamente. O-02/O-03: warnings informativos ausentes em add-codemap e dossier:show.
- **Gate D (execution):** approved

