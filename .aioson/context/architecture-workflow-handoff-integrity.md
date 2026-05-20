---
feature: workflow-handoff-integrity
slug: workflow-handoff-integrity
classification: MEDIUM
created_by: architect
created_at: 2026-05-20
gate_b: ready-to-approve
release_strategy: progressive
release_sequence:
  - v1.9.5 (F2 — agent:done auto-emit)
  - v1.9.6 (F3 — CLI pending guard)
  - v1.9.7 (F1 — stale dev-state interactive)
  - v1.9.8 (T5 — semantic sync preflight)
  - v1.10.0 (T6 — CI smoke pre-publish)
sources:
  - .aioson/context/prd-workflow-handoff-integrity.md
  - .aioson/context/requirements-workflow-handoff-integrity.md
  - .aioson/context/spec-workflow-handoff-integrity.md
  - .aioson/plans/workflow-handoff-integrity/manifest.md (7 PMDs + 5 DDs)
  - .aioson/context/sheldon-enrichment-workflow-handoff-integrity.md
---

# Architecture — Workflow Handoff Integrity

## Architecture overview

5 phases independentemente implementáveis sobre infraestrutura CLI Node.js existente, cada uma com touch points isolados. Defense-in-depth: CLI guards complementam (não substituem) instruções nos prompts. Sem novas entidades de domínio; evoluções de file format (`workflow.state.json` ganha `last_workflow_event_at`) com backward-compat por presence-detection. Release progressivo `F2 → F3 → F1 → T5 → T6` minimiza inception risk.

## Module structure

Arquivos novos e modificados, todos seguindo design-doc.md folder conventions (kebab-case, max 3 levels, single responsibility per folder):

```
src/
├── handoff-contract.js                ← EXTEND — getCanonicalArtifactForAgent(agent, state) helper (F2; CONTRACTS map already exists at line 15)
├── preflight.js                       ← MODIFY — extend detectStaleDevState (F1)
└── commands/
    ├── runtime.js                     ← MODIFY — runAgentDone auto-emits workflow:next (F2)
    ├── workflow.js                    ← MODIFY — runWorkflowNext pre-checks manifest (F3)
    └── state-save.js                  ← MODIFY — add state:reset subcommand (F1)

scripts/
├── sync-agents-preflight.js           ← MODIFY — plugin architecture + semantic checks (T5)
├── smoke-run-chain.js                 ← NEW — orchestrates mock cadeia in CI (T6)
└── lib/
    └── agent-semantic-diff.js         ← NEW — semantic diff helper isolável (T5)

tests/
├── agent-done-auto-emit.test.js       ← NEW (F2)
├── workflow-next-pending-guard.test.js ← NEW (F3)
├── preflight-stale-devstate.test.js   ← NEW (F1)
├── sync-agents-preflight-semantic.test.js ← NEW (T5)
├── scripts/
│   └── smoke-run-chain.test.js        ← NEW (T6 unit)
├── fixtures/
│   └── medium-feature-mock/           ← NEW (T6 mock decisions)
│       ├── mock-briefing.json
│       ├── mock-product.json
│       ├── mock-analyst.json
│       ├── mock-architect.json
│       ├── mock-pm.json
│       └── mock-dev.json
└── baselines/
    └── agent-done-stdout.txt          ← NEW — backward-compat baseline (Risk-11)

.github/
└── workflows/
    └── release-smoke.yml              ← NEW — T6 CI gate
```

## DD-01..05 — Architectural decisions

### DD-01 (RESOLVED) — Backward-compat semantic de `agent:done`

**Decisão:** **gating por presence de `.aioson/runtime/workflow.state.json` ativo é o sinal primário; flag override é `--no-auto-advance` (opt-out), não `--auto-advance` (opt-in).**

Rationale: workflow.state.json é o sinal canônico de "workflow ativo neste projeto". Sua presença ATIVA indica que advance é o comportamento esperado. Forçar flag `--auto-advance` para o caso default seria má UX (convention over configuration). `--no-auto-advance` cobre casos edge (debug, restore manual, scripts especiais).

Implications:
- AC-F2-01 vigora como escrito (presence-detection)
- AC-F2-03 muda parsing: flag é `--no-auto-advance`, default behavior é auto-advance quando state ativo
- Phase plan plan-f2-agent-done-auto-emit.md já consistente com esta decisão

### DD-02 (RESOLVED) — F3 CLI guard regex vs whitelist

**Decisão:** **regex genérico `^pending-(.+)-decisions$` + warn quando captured group não está em whitelist conhecida.**

Whitelist v1: `['architect', 'product', 'pm', 'qa']`.

Rationale: regex pega novos pending states automaticamente (extensível); whitelist filtra typos/erros sem bloquear extensão futura. Comportamento: match → block; captured group out-of-whitelist → block + warn ("unrecognized pending state '<X>' — known: architect/product/pm/qa"). Force flag (`--force`) override permanece.

Implications:
- AC-F3-02 vigora (regex genérico)
- Whitelist como const exportada em `src/commands/workflow-next.js` (atualizável quando novo agente entrar)
- Phase plan plan-f3 já consistente

### DD-03 (RESOLVED) — T5 sync-agents-preflight semantic check granularity

**Decisão:** **section-level diff (headers `##`/`###` presence + order) + token-aware comparison para code blocks contendo strings em `tests/agent-runtime-alignment.test.js` token map. Frontmatter: field-level diff. Plain text body: skip (cosmetic noise).**

Rationale: section-level pega "section disappeared / out of order" (caso 981a8fd); token-aware code block pega "test-asserted token changed" (caso direto da migração incompleta); frontmatter field pega contract version drift. Plain text body diff seria ruído cosmético (typo fix, restructure de explicação) que vira false positives.

Implications:
- AC-T5-01 expandida (já lista os 3 níveis)
- Helper `src/lib/agent-semantic-diff.js` implementa 3 strategies pluggables
- Phase plan plan-t5 já consistente

### DD-04 (RESOLVED) — T6 smoke test harness mode

**Decisão:** **mock-only mode (sem LLM real) para v1.10.0 T6 inicial. LLM-real smoke test é out-of-scope (follow-up SMALL/MEDIUM separado se priorizado).**

Rationale: T6 testa **mecânica de auto-orquestração** (state file advances, gates open/close, artifacts em paths corretos), NÃO qualidade de LLM output. Mock-only é determinístico, rápido (~5min vs ~30+min com LLM), barato (~$0 vs $$ por LLM call), focado no que F2/F3/T5 protegem. LLM-real seria valuable mas é gate adicional, não substituto.

Implications:
- AC-T6-04 reformulada: "após cadeia mock-only" (não "cadeia real")
- `scripts/smoke-run-chain.js` consome `tests/fixtures/medium-feature-mock/*.json` para artifact content
- Phase plan plan-t6 consistent — DD-04 era listada como deferred

### DD-05 (RESOLVED) — Release strategy

**Decisão:** **progressive `F2 → F3 → F1 → T5 → T6`** em releases `v1.9.5 → v1.9.6 → v1.9.7 → v1.9.8 → v1.10.0`. Não single MEDIUM release.

Rationale documentada em RF-10 + sheldon C2 enrichment:
- **Inception risk:** F2 broken hoje. Implementing F2 enquanto F2 está broken via cadeia inteira = recursão problemática. F2 ship isolado primeiro estabiliza a cadeia para implementar phases seguintes.
- **Bisect granularity:** se aparecer regressão, isolar a phase responsável é trivial (git bisect entre 2 releases adjacentes).
- **User value velocity:** F2 sozinho já entrega valor (auto-orquestração funcional) sem esperar T6 (CI smoke) completar.
- **Cost:** 5 publishes vs 1. Aceitável — `npm publish` é manual (per memory autônomy contract), low friction.

Sequência detalhada por phase em "Implementation sequence" abaixo.

## Per-phase architecture

### Phase 1 — F2: agent:done auto-emit (v1.9.5)

**Service boundaries:**
- `runAgentDone` (runtime.js): orquestra telemetry + delegação para `runWorkflowNext`
- `runWorkflowNext` (workflow.js): único writer de `workflow.state.json` advance
- `agent-artifact-map.js`: source-of-truth read-only para `agent → canonical artifact path`

**Integration points:**
- SQLite `agent_events` table (existing): writes inalterados em ordem (telemetry primeiro)
- `workflow.state.json`: leitura para verificar active state + idempotency via `last_workflow_event_at`
- Filesystem: lookup do artifact path para detect existence

**Flow:**
```
agent:done --agent=X
  ├── 1. write agent_events SQLite row (existing)
  ├── 2. read .aioson/runtime/workflow.state.json (new — graceful absent)
  ├── 3. if workflow active && no --no-auto-advance flag:
  │     ├── lookup agent-artifact-map[X] → expected artifact path
  │     ├── check artifact exists in disk
  │     ├── check last_workflow_event_at idempotency
  │     └── call runWorkflowNext({complete: X}) internally
  └── 4. stdout output (backward-compat baseline path when 2 fails)
```

### Phase 2 — F3: CLI pending guard (v1.9.6)

**Service boundaries:**
- `runWorkflowNext` (workflow.js): adicional pre-check via `assertManifestNotPending(slug)`
- Manifest schema: frontmatter `status` field é authoritative para gate decisions (BR-08)

**Integration points:**
- `.aioson/plans/{slug}/manifest.md` frontmatter parse (YAML)
- `workflow.state.json` para resolver slug ativo
- stderr output para mensagens de error acionáveis

**Flow:**
```
workflow:next --complete=upstream
  ├── 1. resolve current slug from workflow.state.json
  ├── 2. read .aioson/plans/{slug}/manifest.md frontmatter (graceful absent)
  ├── 3. if status matches /^pending-(.+)-decisions$/:
  │     ├── captured = match[1]
  │     ├── if captured not in WHITELIST: stderr "unrecognized pending state" + block
  │     ├── else: stderr "Gate B incompleto: <slug> manifest tem status 'pending-<captured>-decisions'. Próximo agente recomendado: @<captured>." + block
  │     └── exit code != 0 (unless --force)
  └── 4. existing validation + emit
```

### Phase 3 — F1: stale dev-state interactive (v1.9.7)

**Service boundaries:**
- `detectStaleDevState` (preflight.js): pure read; emit warning structured
- `state:reset` (state-save.js or new state-reset.js): mutation gated por user confirm (TTY) or env override (CI)

**Integration points:**
- `dev-state.md` parse (YAML frontmatter + body — graceful malformed)
- `features.md` parse para verificar feature `done` status
- TTY detection via `process.stdout.isTTY`

**Flow:**
```
preflight (any agent)
  ├── detectStaleDevState
  │   ├── if dev-state.md parse fail: warn + treat as stale (AC-F1-08)
  │   ├── elif feature in dev-state marked done in features.md: stale
  │   ├── elif feature in dev-state not in features.md: stale (orphan)
  │   ├── elif last_updated > 30d ago: stale
  │   └── else: ok
  ├── if stale && TTY:
  │     prompt: "stale detected. (a) state:reset; (b) state:save --feature=...; (c) continue? [y/N]"
  └── if stale && !TTY (CI/pipe):
        structured stderr warning, exit 0 (non-blocking)
```

### Phase 4 — T5: semantic sync preflight (v1.9.8)

**Service boundaries:**
- `sync-agents-preflight.js`: plugin architecture (current dossier check = plugin 1)
- `agent-semantic-diff.js`: pure functions, no I/O, returns structured diff results
- Mode detection (env vars): `local` / `CI` / `AIOSON_PREPUBLISH`

**Integration points:**
- `template/.aioson/agents/*.md` vs `.aioson/agents/*.md` diff
- `tests/agent-runtime-alignment.test.js` token map (read at preflight start)
- Exit code semantic varies by mode (warn local, fail pre-publish)

**Flow:**
```
sync-agents-preflight (existing entry point)
  ├── load all template + workspace agent files (pair them)
  ├── for each (template_X, workspace_X) pair:
  │     ├── plugin: feature_dossier_length (existing)
  │     ├── plugin: header_diff (DD-03 section-level)
  │     ├── plugin: code_block_token_diff (DD-03 token-aware)
  │     └── plugin: frontmatter_field_diff (DD-03 field-level)
  ├── if AIOSON_PREPUBLISH=true && any plugin reports diff: exit != 0
  └── else: warn + exit 0
```

### Phase 5 — T6: CI smoke pre-publish (v1.10.0)

**Service boundaries:**
- `.github/workflows/release-smoke.yml`: CI orchestration, triggered by PR label `release`
- `scripts/smoke-run-chain.js`: orchestrates mock chain inside CI runner
- `tests/fixtures/medium-feature-mock/`: mock decision artifacts per agent

**Integration points:**
- `npm pack` (current source HEAD) → tarball
- `npm install <tarball>` in CI temp dir (fresh greenfield)
- `aioson setup .` on greenfield
- Mock harness: smoke runner writes artifact files from fixtures (no LLM calls), then invokes `aioson agent:done` + `workflow:next` simulating cadeia
- `AIOSON_PREPUBLISH=true` env var → T5 hard fail mode

**Flow:**
```
CI workflow triggered (PR label "release")
  ├── 1. npm pack → tarball.tgz
  ├── 2. mkdir greenfield/ in CI temp; npm install tarball.tgz
  ├── 3. aioson setup greenfield/
  ├── 4. for each agent in [briefing, product, sheldon, architect, pm, dev]:
  │     ├── write artifact from fixtures/medium-feature-mock/mock-{agent}.json
  │     ├── aioson agent:done --agent={agent} (triggers F2 auto-emit)
  │     └── verify workflow.state.json advances expected
  ├── 5. verify workflow:status === "[>] @qa" (or wherever expected end)
  ├── 6. AIOSON_PREPUBLISH=true; run sync-agents-preflight (T5 hard fail mode)
  └── 7. if any step fails: CI fails → PR cannot merge → npm publish blocked
```

## Cross-cutting concerns

### Idempotency (BR-01)

- Single mechanism: `last_workflow_event_at` in `workflow.state.json`
- Updated on every `runWorkflowNext` write
- Pre-check: if `last_workflow_event_at` > X seconds ago and same `(agent, feature, artifact_hash)`, skip emit
- X = 1 second (sufficient for double-emit prevention; doesn't block legitimate retries minutes later)

### Backward-compat (BR-03)

- **Pattern: presence-detection.** New behavior gated by existence of state file or env var. Absent = old behavior.
- **Baseline file:** `tests/baselines/agent-done-stdout.txt` versioned in git. Updates require explicit approval in commit message ("baseline update: <reason>").
- **No legacy migration script needed** — projects without `.aioson/runtime/workflow.state.json` simply don't see new behavior. When project activates workflow (any `aioson workflow:next . --feature=<X>` call creates state), auto-emit becomes available.

### Defense in depth (BR-04)

- F3 CLI guard (RF-02) + RF-06 prompt update for upstream agents = two layers
- Implementation order: CLI guard first (single point, robust), prompt updates as should-have (best-effort)
- Neither layer alone is sufficient; both required in production

### Logging discipline

- All new warnings go to stderr (not stdout — preserves stdout backward-compat)
- Structured format: `[aioson] <category>: <message>` per existing pattern
- No console.log; use existing logger helper from `src/i18n/messages/`

### Error handling

- Pattern: log warning + graceful degradation, never crash for the auto-orchestration paths
- Exception: explicit user errors (invalid flag, malformed CLI args) → exit != 0 with clear message
- Per `.aioson/rules/security-baseline.md`: no sensitive data in error messages

## Implementation sequence for @dev

Per phase, per release. **@pm produzirá `implementation-plan-workflow-handoff-integrity.md` (per PMD-06, AC-SDLC-15) com breakdown detalhado em stories** — abaixo é roteiro de high-level sequence:

**Release v1.9.5 (Phase 1 — F2):**
1. Extend `src/handoff-contract.js` with `getCanonicalArtifactForAgent(agent, state)` helper (CONTRACTS map already exists at line 15, just add accessor function)
2. Extend `runAgentDone` in `runtime.js`: workflow.state presence check + idempotency + auto-emit call
3. Add `--no-auto-advance` flag parsing
4. Write `tests/agent-done-auto-emit.test.js` (AC-F2-01..10, includes new -09/-10)
5. Create baseline `tests/baselines/agent-done-stdout.txt`
6. Run full suite — must pass
7. Wiring audit entry: list runAgentDone call sites + test coverage proof
8. Commit + ship v1.9.5

**Release v1.9.6 (Phase 2 — F3):**
1. Add `assertManifestNotPending(slug)` in `workflow.js`
2. Wire pre-check into `runWorkflowNext`
3. Add `--force` flag
4. WHITELIST const exported
5. Tests AC-F3-01..07 + composto F2+F3
6. Wiring audit entry
7. Commit + ship v1.9.6

**Release v1.9.7 (Phase 3 — F1):**
1. Extend `detectStaleDevState` with 3 conditions + corrupt parse handling (AC-F1-08)
2. TTY branch
3. Implement `state:reset` (new file or extend state-save.js)
4. Tests AC-F1-01..08
5. Wiring audit entry
6. Commit + ship v1.9.7

**Release v1.9.8 (Phase 4 — T5):**
1. Refactor `sync-agents-preflight.js` to plugin architecture
2. Create `src/lib/agent-semantic-diff.js` with 3 plugins (header, code_token, frontmatter)
3. Mode detection via env vars
4. AC-T5-01..08 (new -08 missing template file)
5. Regression guard test (inject 981a8fd-style diff → detect)
6. Wiring audit entry
7. Commit + ship v1.9.8

**Release v1.10.0 (Phase 5 — T6):**
1. Create `tests/fixtures/medium-feature-mock/` with 6 mock JSON files
2. Implement `scripts/smoke-run-chain.js` (mock-only orchestration)
3. `.github/workflows/release-smoke.yml` with PR label trigger
4. Wire T5 integration (env AIOSON_PREPUBLISH=true)
5. AC-T6-01..10
6. Test workflow in PR draft (label `release`)
7. Update `docs/RELEASE.md` documenting the gate
8. Cross-phase wiring audit doc: covers all 5 phases (PMD-07 / RF-09)
9. Commit + ship v1.10.0 (minor — features novas)

## Explicit non-goals / deferred

(Espelhado do PRD + sheldon manifest, sem mudanças por @architect):

- **Refactor do workflow state machine** — F2 adiciona auto-emit, não redesenha máquina
- **Sync inverso `source → template` automation** — separate SMALL/MEDIUM follow-up; v1.9.x mantém `template → workspace` rsync
- **LLM-real smoke test** — out of scope desta feature (DD-04 mock-only); follow-up potencial
- **Suporte a múltiplos workflow.state.json no mesmo projeto** — single state preserved
- **Reset automático silencioso de dev-state** — PRD Out of scope explicit (F1 é warning acionável)
- **Reescrita dos 20+ agent prompts com `workflow:next --complete` literal** — F2 centraliza, redundante
- **Analyst scoring formula evolution (Q12 analyst)** — separate MICRO follow-up
- **Auditoria sistemática de outras migrações em `.aioson/plans/`** — RF-07 should-have; documented as separate exercise, output não-código

## Notes for downstream agents

- **@pm:** PMD-06 confirma você é owner do `implementation-plan-{slug}.md`. Use this architecture doc + 5 phase files como input. Stories por release: F2 v1.9.5 é primeiro story (depends_on: nenhum); demais respeitam release_sequence.
- **@dev:** baseline file `tests/baselines/agent-done-stdout.txt` é load-bearing. Mudanças intencionais requerem nota em key decisions da spec.
- **@qa:** wiring audit doc `wiring-audit-workflow-handoff-integrity.md` é OBRIGATÓRIO para Gate D (BR-05 / PMD-07). Cada phase deve estar listada com (a) call sites grepados; (b) testes; (c) smoke test cobertura. Sem isso, Gate D blocked.

> **Gate B:** Architecture approved — @pm can proceed.
