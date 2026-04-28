---
feature: feature-dossier
classification: MEDIUM
created_by: architect
created_at: 2026-04-28
schema_version: "1.0"
sources:
  - .aioson/context/requirements-feature-dossier.md
  - .aioson/context/spec-feature-dossier.md
  - .aioson/context/conformance-feature-dossier.yaml
  - .aioson/plans/feature-dossier/manifest.md
  - .aioson/plans/feature-dossier/plan-mvp-read-only.md
  - .aioson/plans/feature-dossier/plan-write-revisions.md
  - .aioson/plans/feature-dossier/plan-codemap-bootstrap.md
---

# Architecture — Feature Dossier & Reverse Invocation

## 1. Architecture overview

Domain `dossier` adicionado ao CLI AIOSON como módulo coeso em `src/dossier/`, com integração não-invasiva nos pontos canônicos (`workflow:next`, `feature:close`, `agent:prompt`, `context:pack`). Toda escrita é file-first em `.aioson/context/features/{slug}/`; SQLite (`runtime:emit`) é fire-and-forget mirror. Backwards-compat absoluta: ausência de `features/{slug}/` = fluxo legado intacto.

Ver `requirements-feature-dossier.md § 2-3` para entidades canônicas; este documento define **onde** cada entidade vive no código e **como** as 14 business rules viram contratos de módulo.

## 2. Folder/module structure

Justificativa: AIOSON usa **layer-based** em `src/commands/` mas tem precedente de **domain folders** (`src/genomes/`, `src/squads/`, `src/store/`). 8 módulos novos justificam novo domain folder `src/dossier/` per `folder-structure.md` § Grouping.

```
src/
├── dossier/                          ← NEW domain (8 modules)
│   ├── store.js                      ← Dossier IO: read, init, show, add-finding
│   ├── revision-store.js             ← revisions.json CRUD + dossier sync
│   ├── codemap.js                    ← Code Map YAML embutido (Phase 3)
│   ├── lock.js                       ← .dossier.lock TTL+PID primitive
│   ├── schema.js                     ← schema_version validators (v1.0, v1.1)
│   ├── compact.js                    ← auto-compaction (Phase 3)
│   ├── bootstrap.js                  ← from-existing synthesis (Phase 3)
│   └── handoff-bridge.js             ← reads handoff-contract, computes blocking_revisions
├── commands/                         ← EXISTING — add 2 new + modify 6 existing
│   ├── dossier.js                    ← NEW: init|show|add-finding|add-codemap|link-rule|compact|migrate
│   ├── revision.js                   ← NEW: open|list|resolve|complete
│   ├── feature-close.js              ← MOD: BR-10 (block on pending) + archive snapshot
│   ├── feature-archive.js            ← MOD: move features/{slug}/ → done/{slug}/dossier/
│   ├── workflow-next.js              ← MOD: blocking_revisions check before handoff
│   ├── workflow-execute.js           ← MOD: blocking_revisions check
│   ├── agents.js                     ← MOD: agent:prompt --revision-context flag (Phase 2)
│   └── context-pack.js               ← MOD: rank active dossiers (Phase 3)
└── i18n/
    └── messages.{en,pt-BR}.json      ← MOD: add ~30 strings for dossier/revision
```

Tests mirror source structure:
```
tests/
├── dossier/
│   ├── store.test.js
│   ├── revision-store.test.js
│   ├── lock.test.js
│   ├── schema.test.js
│   ├── compact.test.js
│   └── bootstrap.test.js
├── commands/
│   ├── dossier.test.js
│   ├── revision.test.js
│   ├── feature-close-dossier.test.js
│   └── workflow-next-blocking.test.js
└── fixtures/
    └── dossier/
        ├── feature-x.dossier.md         ← v1.0 golden
        ├── feature-x.dossier-v11.md     ← v1.1 golden
        ├── revisions-mixed.json
        └── legacy-handoff-contract.json ← 6 contracts dos done/* para regression
```

File size projection (per `file-size.md`):
- `dossier/store.js`: ~400 linhas estimadas (init+read+addFinding+sectionParser) — dentro do ideal
- `dossier/revision-store.js`: ~300 linhas — ideal
- `commands/dossier.js`: ~250 linhas (router para sub-modules) — ideal
- `commands/revision.js`: ~200 linhas — ideal
- Demais módulos: < 300 linhas

## 3. Migration order (filesystem additions)

Esta feature não cria tabelas SQL. Migrations = adições estruturais ao filesystem AIOSON, em ordem:

**Instalação (uma vez):**
1. `.aioson/docs/dossier/schema.md` — schema canônico v1.0 (Fase 1) → v1.1 (Fase 3 atualiza)
2. `.aioson/docs/dossier/agent-templates.md` — templates por agente (Fase 2)

**Por feature (criação):**
1. `mkdir -p .aioson/context/features/{slug}/`
2. Atomic write: `dossier.md` (flag `wx`)
3. Lazy create on first revision: `revisions.json` com `{schema_version, feature_slug, next_id: 1, requests: []}`
4. Sob demanda (Fase 3): `dossier-history.md` ao primeiro compaction

**Workflow state (uma vez por projeto, idempotent):**
- Adicionar `gate_revision_rounds: { requirements: 0, design: 0, plan: 0, execution: 0 }` ao `workflow.state.json` quando `revision-store` lê e o campo está ausente. NÃO migrar arquivos históricos em `done/*/`.

**Handoff contract (per handoff, idempotent):**
- Quando `dossier_uri` é resolvido para a feature ativa, escrever junto. Ausência = legado preservado.

## 4. Models and relationships (module-level)

Mapeamento entidade → módulo responsável (entidades em `requirements-feature-dossier.md § 2`):

| Entidade | Módulo de IO | Comando CLI |
|---|---|---|
| Dossier | `src/dossier/store.js` | `commands/dossier.js` (init, show, add-finding) |
| Revision | `src/dossier/revision-store.js` | `commands/revision.js` (open, list, resolve, complete) |
| CodeMapEntry | `src/dossier/codemap.js` | `commands/dossier.js` (add-codemap) |
| AgentFinding | `src/dossier/store.js#appendFinding` | `commands/dossier.js` (add-finding) |
| RuleLink | `src/dossier/store.js#linkRule` | `commands/dossier.js` (link-rule) |
| GateRevisionRound | `src/dossier/handoff-bridge.js` (read/write `workflow.state.json`) | n/a (interno) |

Cardinalidades (já em requirements § 4) — implementação concreta:

- `Dossier 1 ─── 1..N AgentFinding`: array em ordem de chegada na seção `## Agent Trail`. Hash dedupe via `Set<hash>` em memória + verificação no parse.
- `Dossier 1 ─── 1..N RuleLink`: lista markdown na seção `## Rules & Design-Docs aplicáveis`. Dedupe por `rule_path`.
- `CodeMap 1 ─── 0..N CodeMapEntry`: arrays YAML aninhados (`files[]`, `modules[]`, `patterns[]`). Dedupe por chaves naturais.
- `Dossier 1 ─── 1 revisions.json`: arquivo irmão; revision-store mantém integridade ao apagar/recriar dossier (recusa se revisions tem entries não-`resolved`).

## 5. Integration architecture

### 5.1 Bridge com `handoff-contract.js` existente (Pendência analyst #2 + #5)

`src/dossier/handoff-bridge.js` é o ponto único onde a integração com o engine SDLC acontece:

```
src/dossier/handoff-bridge.js exports:
  - readActiveSlug() → string | null            // de workflow.state.json#featureSlug
  - getBlockingRevisions(slug) → string[]       // ids com severity:blocking & status:pending
  - getPendingRevisionsCount(slug) → integer
  - getDossierUri(slug) → string | null
  - augmentHandoffContract(contract, slug) → contract  // adds 3 fields, idempotent
  - incrementGateRevisionRound(slug, gate) → void
  - getGateRevisionRound(slug, gate) → integer
  - assertRevisionLimit(slug, gate, force) → void  // throws if >= 3 e !force
```

**Princípio:** o engine SDLC existente (`workflow-execute.js`, `feature-close.js`) chama essas funções como hooks; nenhum código existente é reescrito, apenas um `if (dossierBridge.hasActiveDossier(slug))` envolve as novas checagens.

### 5.2 Fluxo `revision:resolve --approve` (Pendência analyst #2)

Decisão arquitetural: **revision lifecycle é ORTOGONAL ao gate state.** Gates aprovados permanecem aprovados (BR-4); revisão refina artefato sem rewind.

Sequência:
```
user → aioson revision:resolve rev-001 --approve
  ├─ revision-store.js: validate state == pending_user_approval
  ├─ revision-store.js: assertRevisionLimit(slug, current_gate, --force-revision flag)
  ├─ revision-store.js: status → approved + revision_round_gate = current_gate
  ├─ handoff-bridge.js: incrementGateRevisionRound(slug, current_gate)
  ├─ runtime:emit revision_resolved
  ├─ spawn: aioson agent:prompt {target_agent} --revision-context=rev-001
  │     ├─ agents.js sets env: AIOSON_REVISION_CONTEXT=rev-001
  │     ├─ agents.js sets env: AIOSON_REVISION_PAYLOAD={JSON of revision}
  │     └─ agent prompt template injects "Revision context" section (see § 5.3)
  ├─ target agent completes refinement; calls:
  │   aioson revision:complete rev-001 --resolution="..."
  ├─ revision-store.js: status → resolved + resolved_at + resolution
  ├─ runtime:emit revision_completed
  └─ user sees: revision resolved; can workflow:next
```

**Não invocar `gate-approve` durante revisão.** Gate `approved_at` é re-stamped pelo `revision:complete` para refletir refinement, mas `status: approved` nunca muda durante o ciclo.

### 5.3 Pendência analyst #3 — `agent:prompt --revision-context`

Implementação em `src/commands/agents.js` (extensão do `agent:prompt` existente):

```
agent:prompt {agent} [--revision-context={rev-id}]
```

Quando `--revision-context` está presente:
1. CLI lê `revisions.json` da feature ativa (via `handoff-bridge.readActiveSlug()`).
2. Recupera o objeto `Revision` por id; valida `status == approved`.
3. Define no env do processo agente:
   - `AIOSON_REVISION_CONTEXT=<rev-id>`
   - `AIOSON_REVISION_PAYLOAD=<JSON.stringify(revision)>`
4. Loader de prompt (`src/commands/agent-loader.js`) detecta env vars e injeta seção dinâmica antes do prompt do agente:

```markdown
## Revision context (auto-injected)

You are running in revision-refinement mode.

- Revision id: {AIOSON_REVISION_CONTEXT}
- Requested by: {payload.requested_by}
- Target artifact: {payload.target_artifact}
- Reason: {payload.reason}
- Evidence: {payload.evidence}

Focus your work on closing this gap. Refine ONLY the target artifact and update relevant dossier sections via `aioson dossier:add-finding`.

When done, run:
    aioson revision:complete {AIOSON_REVISION_CONTEXT} --resolution="<one-line summary of what changed>"
```

Justificativa: env vars são primitive padrão; nenhuma mudança no contrato de prompt dos agentes. Loader já tem seção "Project rules, docs & design docs" — adicionar uma "Revision context" segue o mesmo padrão.

### 5.4 Pendência analyst #1 — Drift detection

Decisão: **mtime + size snapshot** stored no frontmatter do dossier.

Frontmatter expandido:
```yaml
linked_artifacts:
  prd:
    path: ".aioson/context/prd-feature-x.md"
    synced_at: 2026-04-28T10:00:00Z
    mtime_at_sync: 2026-04-28T09:55:00Z
    size_at_sync: 4456
  spec:
    path: ".aioson/context/spec-feature-x.md"
    synced_at: 2026-04-28T10:00:00Z
    mtime_at_sync: 2026-04-28T09:55:00Z
    size_at_sync: 5421
```

`dossier:show` compara `stat()` atual com snapshot:
- Se `mtime_now > mtime_at_sync` OR `size_now != size_at_sync`: imprime `⚠ Drift detected: {path} changed since {synced_at}`.
- Não bloqueia; é informativo. Agente humano decide se abre `revision:open` para re-sync.

Justificativa: SHA-256 é overkill para v1.0; mtime+size é determinístico no FS local e barato. Se filesystem volátil (CI containers), agente pode chamar `dossier:resync` (futuro).

### 5.5 Pendência analyst #4 — Compaction algorithm

`src/dossier/compact.js` exports `compactIfNeeded(slug)`:

```
function compactIfNeeded(slug):
  active = readDossier(slug)
  if stat(activePath).size <= 15000: return  # BR-12 threshold

  state = readWorkflowState()
  current_gate = state.current  # ex: "execution"
  completed_gates = state.completed
  agent_to_gate = {
    "product": "requirements", "sheldon": "requirements",
    "analyst": "requirements", "architect": "design",
    "ux-ui": "design", "pm": "plan", "orchestrator": "plan",
    "dev": "execution", "qa": "execution"
  }
  gate_order = ["requirements", "design", "plan", "execution"]
  current_idx = gate_order.indexOf(current_gate)
  protected_gates = gate_order.slice(max(0, current_idx-1), current_idx+1)

  migrate = []
  for entry in active.agentTrail:
    g = agent_to_gate[entry.agent]
    if g in completed_gates AND g not in protected_gates AND state.gate_revision_rounds[g] == 0:
      migrate.push(entry)

  appendToHistory(slug, migrate)
  removeFromActive(slug, migrate, replaceWithSummaryLink=true)

  size_after = stat(activePath).size
  if size_after > 10000: warn "compaction did not reach <10KB; consider review"
  if size_after >= activeSizeBefore * 0.7:
    abort "compaction reduced < 30% — likely no eligible sections; check workflow state"  # BR for EC-12
```

**Critério "encerrada":** seção pertencente a agente cujo gate (a) está em `completed[]`, (b) NÃO é o gate atual ou imediatamente anterior, (c) tem `gate_revision_rounds[g] == 0`. Code Map e Rules links nunca migram.

### 5.6 Pendência analyst #5 — Schema migration v1.0 → v1.1

`src/dossier/schema.js` exports:
```
const SCHEMAS = {
  "1.0": { /* v1.0 fields, code_map opcional */ },
  "1.1": { /* v1.1 fields, code_map.schema_version obrigatório, role enum + */ },
}

function detectVersion(dossierFrontmatter) → "1.0" | "1.1"
function validate(dossierObj, version) → { valid: boolean, errors: string[] }
function migrate(dossierObj, fromVersion, toVersion) → dossierObj  // pure
```

**Política:**
- v1.0 (Fase 1) → permanece v1.0 indefinidamente (sem migração forçada).
- Novos `dossier:init` na Fase 3 default = v1.1.
- `dossier:show` lê **forward-compat ambos**: se `schema_version == "1.0"`, trata `code_map` ausente como objeto vazio.
- Comando opt-in: `aioson dossier:migrate {slug} --to=1.1` — para users que querem upgrade.

Justificativa: forward-compat de leitura cobre 100% dos casos sem migration script obrigatório. Migração explícita só quando user quer recursos v1.1 (validação estrita do code_map).

### 5.7 Active retrieval integration (Phase 3)

`src/commands/context-pack.js` (modificado):
- Após coletar fontes existentes, chamar `dossier-bridge.listActiveDossiers()` que retorna features com `status: active`.
- Para cada dossier ativo, computar `rank = recency_score - decay`:
  - `recency_score = 100` (base)
  - `decay = max(0, daysSince(last_updated_at) - 7) * 2` (decay linear após 7 dias)
  - Rank cap: nunca abaixo de PRD genérico (rank 30)
- Incluir como source ranqueada no output do context-pack.

Por `INV-03` e `EC-16`: dossier é referência por path, não cópia inline. Falha de leitura de um dossier não derruba o pack — graceful degradation.

## 6. Cross-cutting concerns

### 6.1 Concorrência (BR-2, AC-F2-03, EC-7, EC-8)

`src/dossier/lock.js` implementa lockfile primitivo:
```
acquireLock(slug, sectionName, timeoutMs=30000) → release()
  - lockfile path: .aioson/context/features/{slug}/.dossier.lock
  - format JSON: { pid, section, acquired_at }
  - if exists: read JSON
    - if PID alive AND age < 60s: wait/retry (poll a 200ms até timeoutMs)
    - else: ignore, log warn "stale lockfile (pid=X, age=Ys)", overwrite
  - return release function (sync delete)
```

Operações por seção:
- `## Agent Trail`: lock requerido (append-only mas concorrente)
- `## Code Map` (YAML embutido): lock requerido (read-modify-write)
- `## Revision Requests`: lock requerido
- `## Rules & Design-Docs aplicáveis`: lock requerido
- Frontmatter (mtime updates): lock requerido

Seções imutáveis (`## Why`, `## What`): sem lock (read-only após init/bootstrap; mudanças só via `revision:resolve --approve` que re-spawna agente owner).

### 6.2 Validação

Camadas de validação:
- **CLI input** (kebab-case flags, paths relativos): em cada `commands/*.js` antes de chamar storage.
- **Schema** (frontmatter, revisions.json, code_map): em `src/dossier/schema.js` antes de qualquer write.
- **Path canonicidade**: validar contra rule `canonical-path-contract.md` (já existe em `.aioson/rules/`).
- **Agent IDs canônicos** (BR-8 + EC-3): lista em `src/dossier/schema.js` (`product, sheldon, analyst, architect, ux-ui, pm, orchestrator, dev, qa, deyvin, pair, tester, neo, copywriter, cypher, orache, genome, profiler-*, design-hybrid-forge, site-forge, discover, validator, committer`) — atualizar quando novos agentes forem adicionados.

### 6.3 Logging e telemetria (BR-3, AC-F2-16, EC-16, INV-03)

Eventos via `runtime:emit` (mirror, não fonte de verdade):
- `dossier_initialized` — payload: slug, schema_version
- `dossier_finding_added` — payload: slug, agent, section, hash
- `dossier_compacted` — payload: slug, sections_migrated, size_before, size_after
- `revision_opened` — payload: slug, rev_id, requested_by, target_agent, severity
- `revision_resolved` — payload: slug, rev_id, decision (approved/rejected), gate
- `revision_completed` — payload: slug, rev_id
- `handoff_blocked_by_revision` — payload: slug, blocking_rev_ids, current_gate

Implementação: cada call wrapped em `try { runtimeEmit(...) } catch { stderr.warn() }` — nunca derruba operação principal.

### 6.4 Error handling

| Cenário | Comportamento |
|---|---|
| `dossier.md` corrompido (frontmatter inválido) | exit 1 + path + erro YAML específico (EC-13 análogo) |
| `revisions.json` corrompido | exit 1 (EC-13) — sem auto-recovery silencioso |
| Lockfile órfão | warn + override (EC-7) |
| `dossier-history.md` corrompido | warn, ler só ativo (EC-9) |
| `runtime:emit` falha (SQLite locked) | warn em stderr; operação principal continua (EC-16) |
| `agent:prompt` durante `revision:resolve` falha | revision permanece `approved` (não reverte para `pending`); user pode retry com `aioson agent:prompt {target} --revision-context=rev-id` manual |

### 6.5 Backwards-compatibility (BR-7, INV-05, AC-F2-12, AC-F1-10)

**Princípio:** todo path novo no engine SDLC tem early-return quando feature não tem `features/{slug}/`:

```javascript
// in workflow-next.js (modified)
const slug = readActiveSlug();
if (slug && hasActiveDossier(slug)) {
  const blocking = getBlockingRevisions(slug);
  if (blocking.length > 0) {
    return refuseHandoff(blocking);
  }
}
// existing handoff flow continues unchanged
```

Regression test obrigatório (AC-F2-12): rodar todos os 6 handoff-contract.json em `done/*/` através do workflow:next mock — devem completar sem warnings.

## 7. Implementation sequence for `@dev`

Ordem estrita, fase por fase. Cada item é uma PR atômica com tests verdes antes do próximo.

### Phase 1 — MVP read-only

1. **Schema canônico:** `.aioson/docs/dossier/schema.md` (markdown) + `src/dossier/schema.js` (validators v1.0).
2. **Locking primitive:** `src/dossier/lock.js` + `tests/dossier/lock.test.js` (cobre AC-F2-03 cedo, mesmo sendo Phase 1, porque store.js depende dele).
3. **Storage IO:** `src/dossier/store.js` — `init`, `read`, `show`, `parseSections`. Tests: `tests/dossier/store.test.js`.
4. **CLI command:** `src/commands/dossier.js` — sub-commands `init`, `show`. Tests: `tests/commands/dossier.test.js` (AC-F1-01 a AC-F1-06).
5. **Agent prompt updates** (3 agentes piloto): `analyst.md`, `architect.md`, `dev.md` — adicionar seção "Feature dossier" antes de PRD/spec específicos (AC-F1-07).
6. **feature-archive extension:** `src/commands/feature-archive.js` — mover `features/{slug}/` (AC-F1-08).
7. **Golden fixture:** `tests/fixtures/dossier/feature-x.dossier.md` (AC-F1-09).
8. **Regression:** rodar fluxo completo legacy (AC-F1-10).
9. **i18n:** ~10 strings em `messages.{en,pt-BR}.json`.

Gate Phase 1 = todos os AC-F1-* passando + smoke do fluxo end-to-end no próprio AIOSON repo (criar `feature-dossier-test` dummy, rodar init → show → archive).

### Phase 2 — Write + Revisões

1. **handoff-bridge:** `src/dossier/handoff-bridge.js` — funções de leitura/escrita do bridge (sem mutação de estado ainda).
2. **revisions.json store:** `src/dossier/revision-store.js` + tests (AC-F2-04, AC-F2-06, AC-F2-08, AC-F2-09, AC-F2-18).
3. **Append-only finding:** `store.js#appendFinding` (AC-F2-01, AC-F2-02). Lock integration.
4. **Templates por agente:** `.aioson/docs/dossier/agent-templates.md` (AC-F2-15).
5. **handoff-contract extension:** modificar `handoff-protocol.json` em runtime (não nas migrations imutáveis em done/*).
6. **workflow:next + workflow:execute:** check de `blocking_revisions` (AC-F2-10, AC-F2-12).
7. **CLI revision command:** `src/commands/revision.js` — `open`, `list`, `resolve`, `complete` (AC-F2-04 a AC-F2-11).
8. **agent:prompt --revision-context:** `src/commands/agents.js` extension (§ 5.3).
9. **Anti-loop:** integration em `revision:resolve --approve` (AC-F2-11).
10. **Slug inference:** `handoff-bridge.readActiveSlug()` integrado em todos os comandos sem `--slug` (AC-F2-17).
11. **feature:close BR-10:** bloquear PASS com pendências (AC-F2-14).
12. **feature-archive snapshot:** revisions.json final em `done/{slug}/dossier/` (AC-F2-13).
13. **Telemetria:** `runtime:emit` para 4 eventos (AC-F2-16, EC-16).
14. **Integration test e2e:** init → add-finding → revision:open → workflow:next bloqueado → revision:resolve --approve → re-run @product → revision:complete → workflow:next ok.

Gate Phase 2 = todos AC-F2-* + e2e no AIOSON repo + regression dos 6 handoffs históricos sem warnings.

### Phase 3 — Code Map + Bootstrap + Auto-context

1. **Schema v1.1:** `src/dossier/schema.js` — adicionar v1.1 + forward-compat reader (AC-F3-08).
2. **CodeMap CRUD:** `src/dossier/codemap.js` (AC-F3-01, AC-F3-02, AC-F3-03).
3. **CLI add-codemap + link-rule:** `commands/dossier.js` (AC-F3-03, AC-F3-04).
4. **Compact algorithm:** `src/dossier/compact.js` (AC-F3-05, AC-F3-06, AC-F3-13).
5. **Bootstrap:** `src/dossier/bootstrap.js` — synthesis from existing artifacts (AC-F3-09, AC-F3-10, AC-F3-11).
6. **Active retrieval integration:** `src/commands/context-pack.js` (AC-F3-07, AC-F3-14).
7. **Migration command (opt-in):** `dossier:migrate {slug} --to=1.1` em `commands/dossier.js`.
8. **Agent prompt updates** (8 agentes Phase 3): `add-codemap` + `link-rule` instructions (AC-F3-12).

Gate Phase 3 = todos AC-F3-* + bootstrap retroativo executado nas 6 features `done/` do próprio AIOSON repo + performance test (20 features ativas < 500ms).

## 8. Frontend handoff (`@ux-ui`)

**Não aplicável.** project_type=script (CLI puro). UI no dashboard é deferida (manifest § Deferred decisions). Nenhuma tela, componente ou design-skill.

## 9. Explicit non-goals / deferred items

- **Não implementar SHA-256 para drift detection** — mtime+size suficiente para v1.0 (§ 5.4). Re-avaliar se filesystem volátil (CI) gerar falsos positivos.
- **Não criar gate de "revisão"** no SDLC engine — revisão é sub-ciclo dentro do gate atual (§ 5.2). Modificar `gate-approve` é fora do escopo.
- **Não migrar contratos históricos em `done/*/`** — backwards-compat via early-return resolve (BR-7, § 6.5).
- **Não auto-recuperar `revisions.json` corrompido** — exit 1, user resolve manualmente (EC-13). Auto-recovery seria fora do princípio file-first auditável.
- **Não suportar lock distribuído (multi-host)** — AIOSON é single-machine CLI; lockfile local é suficiente. Se vier dashboard multi-host, é nova arquitetura.
- **Não validar conteúdo semântico de `revision.reason`** — texto livre até 1000 chars; LLM-as-validator é overkill.
- **Não implementar `dossier:rebase` ou `dossier:merge`** entre features (caso de spin-off de features) — não há demanda atual.
- **Active retrieval ranking só na Fase 3.** Phase 1 e 2 não tocam `context-pack.js`.

## 10. Risks revisited (de requirements § 10)

| Risk | Status arquitetural |
|---|---|
| R-1 Lockfile órfão | **Resolvido** — TTL 60s + PID alive check em `lock.js` (§ 6.1). |
| R-2 Loop de revisões abusivo | **Aceito com mitigação** — `--force-revision` + telemetria; arquitetura não bloqueia, expõe. |
| R-3 Drift dossier ↔ canônicos | **Resolvido** — mtime+size snapshot (§ 5.4). |
| R-4 Bootstrap sintético enviesado | **Resolvido** — campo `synthetic: true` em entradas (§ 4 + AC-F3-11). |
| R-5 Active retrieval ranking obsoleto | **Resolvido** — decay linear pós-7d, cap em rank de PRD genérico (§ 5.7). |
| R-6 Dossier vira atrator de prosa | **Resolvido** — cap 2KB por finding (EC-10) + templates (AC-F2-15). |
| R-7 Workflow state machine + revisão | **Resolvido** — gates não fazem rewind; revision lifecycle é ortogonal (§ 5.2). |
| R-8 Backwards-compat sutil em handoff-contract | **Resolvido** — early-return em todos os hooks (§ 6.5) + regression test obrigatório com 6 contracts históricos. |

## 11. Pendências analyst → resolvidas

| # | Pendência | Resolução |
|---|---|---|
| 1 | Drift detection mechanism | mtime+size snapshot em `linked_artifacts.{name}` no frontmatter; comparado em `dossier:show` (§ 5.4) |
| 2 | revision:resolve ↔ gate-approve interaction | Ortogonal: revision não chama gate-approve; gate `approved_at` re-stamped por `revision:complete`, status nunca muda durante ciclo (§ 5.2) |
| 3 | agent:prompt env var | Flag `--revision-context={rev-id}` + env vars `AIOSON_REVISION_CONTEXT` e `AIOSON_REVISION_PAYLOAD`; loader injeta seção dinâmica no prompt (§ 5.3) |
| 4 | Compaction "seção encerrada" | Agente cujo gate ∈ `completed[]` AND ≠ current/previous AND `gate_revision_rounds[g] == 0`. Code Map e Rules nunca migram (§ 5.5) |
| 5 | Schema migration v1.0 → v1.1 | Forward-compat reader bidirecional; `dossier:migrate {slug} --to=1.1` opt-in. Sem migração forçada (§ 5.6) |

> **Gate B:** Architecture approved — @dev can proceed.
