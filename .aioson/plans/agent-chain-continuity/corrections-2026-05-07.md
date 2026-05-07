---
phase: 6
created: 2026-05-07
status: resolved
resolved_at: 2026-05-07
resolved_by: dev
---

# Corrections Plan — Phase 6 (telemetry) — 2026-05-07

## Context

QA rodou em 2026-05-07 e encontrou 0 Critical, 0 High, 1 Medium, 4 Low.

Bundle de regressão `tests/agent-chain-continuity.regression.test.js`: 17/17 verde.
Suite total: 2029/2031 verde (1 falha pré-existente flaky `feature:close idempotent`, NÃO causada por esta feature).

A correção obrigatória abaixo fecha a única lacuna real entre spec e código antes do `feature:close`.

## Mandatory corrections

### C-01 — Emitir `sync_agents_parity_violation` no preflight

**File:** `src/commands/sync-agents-preflight.js:57-72`

**Problem:**
A spec (Phase 5/6) e a arquitetura prometem 5 runtime events instrumentados. Os outros 4 são emitidos via `emitDossierEvent`:
- `feature_close_dossier_synthesized` em `src/commands/feature-close.js:237`
- `dossier_auto_initialized` em `src/commands/workflow-next.js:685`
- `dev_auto_resume` / `dev_drift_detected` no prompt de `@dev`

`sync-agents-preflight.js#main()` apenas escreve em stderr e chama `process.exit(1)`. Nenhuma chamada a `emitDossierEvent`. Resultado: dashboard nunca registra "sync abortado por paridade" e auditoria pós-fato fica cega para a violação que esta feature foi criada para prevenir.

A regression `tests/agent-chain-continuity.regression.test.js` AC-ACC-17 passa apenas porque o teste do 5º evento verifica string-match em `architecture-agent-chain-continuity.md`, não emissão real.

**Expected fix:**

1. Em `src/commands/sync-agents-preflight.js`:
   - Importar `emitDossierEvent`:
     ```js
     const { emitDossierEvent } = require('../lib/dossier-telemetry');
     ```
   - Tornar `main()` `async`. Antes do `return 1`, emitir:
     ```js
     await emitDossierEvent(projectRoot, {
       agent: 'sync-agents-preflight',
       type: 'sync_agents_parity_violation',
       summary: `${violations.length} agent(s) ahead in workspace`,
       meta: { violations }
     });
     ```
   - Adaptar entrypoint:
     ```js
     if (require.main === module) {
       main().then(code => process.exit(code));
     }
     ```
   - Telemetria silente (já garantida em `dossier-telemetry.js`); failure não pode quebrar o preflight.

2. Em `tests/agent-chain-continuity.regression.test.js` AC-ACC-17:
   - Substituir a asserção do 5º evento (que lê `architecture-agent-chain-continuity.md`) por leitura de `src/commands/sync-agents-preflight.js`:
     ```js
     const syncPreflight = await fs.readFile(
       path.join(REPO_ROOT, 'src', 'commands', 'sync-agents-preflight.js'),
       'utf8'
     );
     assert.match(syncPreflight, /sync_agents_parity_violation/);
     assert.match(syncPreflight, /emitDossierEvent/);
     ```

3. Em `tests/sync-agents-preflight.test.js`:
   - Adicionar 1 teste novo: cenário workspace-ahead deve disparar emit (mockar `dossier-telemetry` para capturar a chamada). Aceito alternativa: integration test que executa `main()` e verifica entrada no SQLite via `runtime-store`.

**Affected AC:** AC-ACC-17 (full coverage real, não proxy).

## Optional corrections

### O-01 — Reconciliar BR-ACC-11 com implementação

**File:** `.aioson/context/requirements-agent-chain-continuity.md:226`

**Problem:**
BR-ACC-11 diz "atualiza apenas `verdict` (last-write-wins) e mantém `agent_who_added` + `added_at` originais." Mas `src/dossier/research-index-store.js:192-194` faz last-write-wins em `verdict` + `why_relevant` + `summary_path`. A spec Phase 1/2 documenta o comportamento real; só a BR ficou desatualizada.

**Expected fix:**
Editar BR-ACC-11 para:
> "Tentativa de adicionar `slug` duplicado atualiza `verdict`, `why_relevant` e `summary_path` (last-write-wins) e mantém `agent_who_added` + `added_at` originais."

Sem mudança de código.

### O-02 — Documentar `## What` vazio como residual

**File:** `.aioson/context/spec-agent-chain-continuity.md` (seção "## QA Sign-off" criada por `feature:close`).

**Problem:**
`.aioson/context/features/agent-chain-continuity/dossier.md:22-24` tem `## What` em "_(não encontrado — preencher manualmente)_". Auto-init `--from-existing` populou `Why` do PRD mas não inferiu `What`. Caso dogfood: a própria feature mitiga este problema para features futuras (auto-init silencioso na ativação do `@product`).

**Expected fix:**
Documentar como residual no `## QA Sign-off` quando `feature:close` rodar. Sem alteração de código.

### O-03 — Falha pré-existente flaky de `feature:close idempotent`

**File:** `tests/feature-close.test.js:178-223` + `src/commands/feature-close.js#updateProjectPulseFile`

**Problem:**
Pré-existente (residual `secure-by-default` 2026-04-29). Não bloqueia esta feature.

**Expected fix:**
Ticket MICRO separado para deduplicação de linhas em `updateProjectPulseFile`. Fora do escopo de `agent-chain-continuity`.
