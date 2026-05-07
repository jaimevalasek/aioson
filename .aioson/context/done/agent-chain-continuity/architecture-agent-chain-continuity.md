---
feature_slug: agent-chain-continuity
created_by: architect
created_at: 2026-05-07
classification: MEDIUM
source_requirements: .aioson/context/requirements-agent-chain-continuity.md
source_spec: .aioson/context/spec-agent-chain-continuity.md
---

# Architecture — Agent Chain Continuity

## 1. Architecture overview

Extensão do motor existente (`workflow:next` + dossier infra), sem novo motor. Bump de schema do dossier (v1.1 → v1.2) com nova seção `Research Index` estruturada; bump do `handoff-protocol.json.artifact_uris` (v1 array de strings → v2 array de objetos) com backwards compat indefinida no parser. Auto-init silencioso via prompt do `@product` (primário) + workflow:next pre-stage hook (defesa em profundidade). Paridade template/workspace verificada por extração de seção + string compare. Runtime telemetry usa `aioson runtime-log` existente com 5 novos `--type=<event>` — sem namespace novo.

## 2. Folder/module structure

Stack: Node.js CLI. Não há "folder structure por classification" canônica para este projeto (já estabelecida). Este feature **estende** o existente:

```
src/
├── dossier/
│   ├── schema.js                       (modificado — bump v1.2, parser Research Index)
│   ├── store.js                        (modificado — atomic writes para Research Index)
│   ├── dossier-bootstrap.js            (modificado — handle EBOOTSTRAPEMPTY no feature:close)
│   ├── dossier-compact.js              (sem mudanças)
│   └── research-index.js               ← NOVO — parser/serializer YAML embedded
├── commands/
│   ├── dossier.js                      (modificado — handler para subcomando add-research)
│   ├── dossier-add-research.js         ← NOVO — handler isolado
│   ├── dossier-audit.js                ← NOVO — paridade + coverage
│   ├── feature-close.js                (modificado — dossier guarantee)
│   ├── workflow-next.js                (modificado — pre-stage auto-init hook)
│   └── sync-agents-preflight.js        ← NOVO — pre-hook para npm run sync:agents
├── handoff-contract.js                 (modificado — schema v2 com backwards compat)
└── lib/
    └── dev-resume.js                   ← NOVO — helper consumido pelo @dev prompt para auto-relato

template/.aioson/agents/
├── product.md                          (modificado — auto-init instruction + What contract)
├── sheldon.md                          (modificado — NOVA seção Feature dossier)
├── analyst.md                          (modificado — adicionar contrato Research Index)
├── architect.md                        (modificado — adicionar contrato Research Index)
├── ux-ui.md                            (modificado — paridade com workspace)
├── pm.md                               (modificado — paridade)
├── orchestrator.md                     (modificado — paridade)
├── dev.md                              (modificado — auto-relato + drift detection instructions)
└── qa.md                               (modificado — paridade)

.aioson/agents/                         (mesmas modificações; paridade obrigatória)

.aioson/docs/dossier/
├── schema.md                           (modificado — documenta v1.2)
└── agent-templates.md                  (modificado — novos templates ux-ui/pm/orchestrator + reescrita @sheldon)

package.json                            (modificado — sync:agents script com pre-hook)

tests/
├── dossier/
│   ├── research-index.test.js          ← NOVO
│   └── schema-v1.2.test.js             ← NOVO
├── commands/
│   ├── dossier-add-research.test.js    ← NOVO
│   ├── dossier-audit.test.js           ← NOVO
│   └── feature-close-dossier-guarantee.test.js  ← NOVO
├── handoff-contract-v2.test.js         ← NOVO
└── agent-chain-continuity.regression.test.js    ← NOVO — cobre 17 ACs
```

**Total:** 6 arquivos novos em src + 7 modificações em src + 9 modificações em template/agents + 9 modificações em .aioson/agents + 2 modificações em docs/dossier + 1 modificação em package.json + 7 arquivos de teste novos = **41 superfícies tocadas**.

## 3. Schema models

### 3.1 Dossier v1.2 — `## Research Index` section

Inserida entre `## Rules & Design-Docs aplicáveis` e `## Agent Trail`.

Conteúdo: code-fenced YAML com schema:

```yaml
researchs:
- slug: <kebab-case>                # obrigatório, único na lista
  verdict: <confirmed|has-alternatives|outdated|deprecated>
  agent_who_added: <canonical-agent-id>
  why_relevant: <string max 200 chars>
  added_at: <ISO 8601>
  summary_path: <relative path, default researchs/{slug}/summary.md>
```

**Idempotência:** dedup por `slug`; updates trocam `verdict` (last-write-wins) preservando `agent_who_added` + `added_at`.

**Parser (`src/dossier/research-index.js`):**
- Localiza section por header exato `## Research Index`
- Extrai bloco YAML entre primeiro ` ```yaml` e ` ``` ` subsequente
- Valida com schema canônico (re-uso do `js-yaml` já dependency)
- Serializer reverse: monta YAML preservando ordem alfabética por `slug`

**Forward-compat:** parser v1.2 lê dossiers v1.0 e v1.1 sem `## Research Index` (section ausente = `researchs: []`).

### 3.2 handoff-protocol.json `artifact_uris` v1 → v2

**v1 (legado):** `"artifact_uris": [...strings]`
**v2 (novo):** `"artifact_uris": [...{path, kind, agent, added_at}]`

**Enum `kind`:** `prd | requirements | spec | plan | dossier | code | test | manifest | conformance | research | other`

**Parser (`src/handoff-contract.js`):**
- Lê `artifact_uris`
- Se primeiro item é string → trata array inteiro como v1, converte cada item para `{path: <string>, kind: "other", agent: "unknown", added_at: null}` durante leitura
- Se primeiro item é objeto → trata como v2, valida cada item contra schema
- Writers sempre escrevem v2

**Backwards compat indefinida** — sem deprecation. Custo de manutenção: ~5 linhas de branching no parser.

## 4. Integration architecture

### 4.1 Auto-init hook — design

**Trigger primário (90% dos casos):** `@product` prompt instrui auto-init logo após `Write` do PRD.

Pseudocódigo do prompt instructions:
```
Após escrever prd-{slug}.md em .aioson/context/:
1. Ler classificação do frontmatter recém-escrito
2. Se classification ∈ {SMALL, MEDIUM} E .aioson/context/features/{slug}/dossier.md NÃO existe:
   - Executar silenciosamente: aioson dossier:init . --slug={slug}
   - Não mencionar ao usuário
3. Continuar fluxo normal de @product (registrar feature em features.md, etc.)
```

**Trigger fallback (defense-in-depth):** `workflow:next` pre-stage hook.

Pseudocódigo de `src/commands/workflow-next.js`:
```
Antes de ativar próximo agente da cadeia:
1. Ler workflow.state.json — feature_slug ativo
2. Ler features.md — classification do feature
3. Se classification ∈ {SMALL, MEDIUM}:
   - Verificar .aioson/context/features/{slug}/dossier.md
   - Se ausente: dispatch dossier:init . --slug={slug} via internal call (não exec)
4. Continuar com ativação normal do stage
```

**Decisão arquitetural — por que ambos:**
- O prompt-only hook (i) falha quando `@product` é skipped (ex: usuário ativa `/aioson:analyst` direto com PRD pré-existente).
- O workflow-only hook (ii) falha em modo direto sem `aioson workflow:next` (ex: usuário roda `/aioson:product` direto no Claude Code sem CLI envelope).
- Idempotência (BR-ACC-03) garante que execução dupla é no-op.
- Custo de implementação dual: ~30 linhas de código somadas. Aceitável.

### 4.2 feature:close dossier guarantee — design

Modificação em `src/commands/feature-close.js`:

```
function closeFeature(slug, verdict):
  if not exists(`.aioson/context/features/${slug}/dossier.md`):
    try:
      execSync(`aioson dossier:init . --slug=${slug} --from-existing`)
    except EBOOTSTRAPEMPTY:
      # criar dossier mínimo
      writeMinimalDossier(slug, classification, why="(no source artifacts found)")
      runtimeLog({ type: 'feature_close_dossier_synthesized', summary: 'minimal-fallback' })
    runtimeLog({ type: 'feature_close_dossier_synthesized', summary: 'from-existing' })
  
  # Continua close normal: archive .aioson/context/features/{slug}/ → done/{slug}/dossier/
  archiveFeatureContext(slug)
  updateFeaturesMd(slug, status='done', completed=today)
```

**Verdict-agnostic:** roda mesmo em FAIL — preserva trilha auditiva.

### 4.3 sync:agents pre-hook — design

Atualização em `package.json`:
```json
"sync:agents": "node src/commands/sync-agents-preflight.js && rsync -av ..."
```

Lógica em `src/commands/sync-agents-preflight.js`:
```
const CHAIN_AGENTS = ['product', 'sheldon', 'analyst', 'architect', 
                      'ux-ui', 'pm', 'orchestrator', 'dev', 'qa']

for agent in CHAIN_AGENTS:
  workspace = readDossierSection('.aioson/agents/' + agent + '.md')
  template = readDossierSection('template/.aioson/agents/' + agent + '.md')
  if workspace !== template AND length(workspace) > length(template):
    abort("workspace tem alterações de dossier não propagadas para template; copie workspace → template antes")
    runtimeLog({ type: 'sync_agents_parity_violation', summary: agent })
    exit 1

# Tudo ok, deixa rsync rodar
```

**Extraction logic:** localiza linha `## Feature dossier` até próxima linha `^## ` ou EOF. String compare exata.

**Granularidade do abort:** só aborta quando workspace **tem mais** conteúdo do que template (= alterações que sync wipearia). Se template tem mais (template está mais novo, workspace defasado), prossegue sem abortar.

### 4.4 @dev auto-relato runtime support — design

Helper `src/lib/dev-resume.js`:

```javascript
function buildDevResumeData(projectPath):
  const lastHandoff = readJSON(`.aioson/context/last-handoff.json`)
  const featureSlug = lastHandoff.feature_slug
  if not featureSlug: return null
  
  const features = readFeatures(`.aioson/context/features.md`)
  const feature = features.find(f => f.slug === featureSlug)
  if not feature || feature.status !== 'in_progress': return null
  
  const dossier = readDossier(`.aioson/context/features/${featureSlug}/dossier.md`)
  const devState = readMd(`.aioson/context/dev-state.md`)
  const planManifest = tryRead(`.aioson/plans/${featureSlug}/manifest.md`)
  
  return {
    feature_slug: featureSlug,
    classification: feature.classification,
    current_phase: devState?.active_phase || 'unknown',
    artifacts_consumed: lastHandoff.artifact_uris || [],
    code_map_paths: dossier?.code_map?.files || [],
    sheldon_plan: planManifest ? path : null,
    next_step: devState?.next_step || derivedFromPlan(planManifest)
  }
```

**Consumo:** `@dev` prompt referencia este helper conceitualmente. CLI command `aioson dev:resume-data .` (subcomando opcional) retorna o JSON; `@dev` prompt instrui chamar antes de qualquer prompt do usuário.

**Telemetry:** `@dev` emite `runtime-log . --type=dev_auto_resume --summary="<feature_slug>: phase <N>, <count> artifacts"` na primeira mensagem da sessão.

### 4.5 @dev drift detection — design

Detecção é **prompt-driven** (não automática em background). `@dev` prompt instrui:

```
Durante implementação:
1. Antes de modificar/criar arquivo, verificar se path está em dossier.code_map.files
2. Se está e atual estado != esperado pelo plano:
   → DRIFT detectado
3. Antes de cada step do plano @sheldon (.aioson/plans/{slug}/), verificar se step já foi executado:
   → Se já foi sem registro em Agent Trail: DRIFT
4. DRIFT detected → emitir runtime-log type=dev_drift_detected E reportar ao usuário 3 opções
5. Após decisão do usuário: registrar entry em Agent Trail com convenção DRIFT:
```

**Sem detecção em background** — prompt-driven é suficiente para MVP, evita complexidade de file watcher / git hooks.

## 5. Cross-cutting concerns

### 5.1 Idempotência

| Operação | Mecanismo de dedup |
|---|---|
| `dossier:init` | check `dossier.md` exists; no-op if yes (já existente) |
| `dossier:add-finding` | sha256 do content; no-op se duplicate (já existente) |
| `dossier:add-codemap` | dedup por (path, lines) (já existente) |
| `dossier:link-rule` | dedup por path (já existente) |
| `dossier:add-research` | dedup por slug; verdict last-write-wins (NOVO) |
| Auto-init hook (prompt + workflow) | dossier exists check antes de chamar init |
| `feature:close` guarantee | dossier exists check antes de init |

### 5.2 Atomicity

Writes do dossier seguem padrão existente em `src/dossier/store.js`: write-temp + rename. `Research Index` herda essa garantia.

`handoff-protocol.json` writes: já atomicos via existing `src/handoff-contract.js`.

### 5.3 Backwards compat

| Componente | Estratégia |
|---|---|
| Dossier schema v1.0/v1.1 → v1.2 | Parser v1.2 lê todos; campos extras frontmatter ignorados |
| handoff-protocol artifact_uris v1 → v2 | Parser dual (string vs object) indefinido; writers sempre v2 |
| `agent-templates.md` legacy `@sheldon` write to `Why` | Override documentado em requirements BR-ACC-04/05; @dev durante impl substitui entrada existente |

### 5.4 Silencioso

Auto-init e feature:close guarantee NUNCA imprimem em stdout/stderr no caminho normal. Erros não-fatais vão para `runtime-log` (telemetry, não output ao usuário). Erros fatais (filesystem read-only, permissões) propagam normalmente.

### 5.5 Observability

5 eventos emitidos via `runtime-log`:

| Evento | Emissor | Contexto |
|---|---|---|
| `dossier_auto_initialized` | `@product` prompt OU `workflow:next` | feature_slug, classification, trigger_source |
| `feature_close_dossier_synthesized` | `feature:close` | feature_slug, mode (`from-existing` \| `minimal-fallback`) |
| `dev_drift_detected` | `@dev` prompt | feature_slug, drift_kind, decision |
| `dev_auto_resume` | `@dev` prompt | feature_slug, phase, artifacts_count |
| `sync_agents_parity_violation` | `sync-agents-preflight` | agent_id, diff_summary |

Todos via `aioson runtime-log . --agent=<agent> --type=<event> --summary="..."` que persiste em `.aioson/runtime/aios.sqlite`.

## 6. Implementation sequence for @dev

7 fases, 15 tasks. Pode ser implementado por um único `@dev` em sessão única ou paralelizado (não há dependências circulares entre fases não-sequenciais).

**Fase 1 — Foundations (sem behavior change):**
1. `src/dossier/schema.js` bump SCHEMA_VERSION="1.2", export `RESEARCH_INDEX_KEYS` enum
2. `src/dossier/research-index.js` parser/serializer (testes unitários)
3. `src/handoff-contract.js` schema v2 + backwards compat (testes)
4. `.aioson/docs/dossier/schema.md` documentar v1.2 (Research Index section + dossier:add-research)

**Fase 2 — Storage e writes:**
5. `src/commands/dossier-add-research.js` handler isolado (testes)
6. `src/commands/dossier.js` registrar subcomando
7. `src/commands/dossier-audit.js` com `--check=template-parity` e `--check=coverage` (testes)

**Fase 3 — Auto-init (behavior change):**
8. `src/commands/feature-close.js` adicionar guarantee + EBOOTSTRAPEMPTY fallback (testes)
9. `src/commands/workflow-next.js` adicionar pre-stage hook
10. Update `template/.aioson/agents/product.md` AND `.aioson/agents/product.md` com auto-init instruction

**Fase 4 — Agent paridade:**
11. Update todos os 8 chain agents em workspace + template, paridade obrigatória
    - `@sheldon` ganha seção `## Feature dossier` completa (zero hoje)
    - Demais ganham/atualizam seções existentes
12. `.aioson/docs/dossier/agent-templates.md` reescrita (novos templates + override @sheldon)
13. `src/commands/sync-agents-preflight.js` + atualização `package.json#sync:agents`

**Fase 5 — @dev intelligence:**
14. `src/lib/dev-resume.js` helper (opcionalmente expor via `aioson dev:resume-data`)
15. Update `template/.aioson/agents/dev.md` AND `.aioson/agents/dev.md` com instruções de auto-relato + drift detection

**Fase 6 — Telemetry:**
(emissão dos 5 events acontece nos commits das fases 3, 4, 5 — não fase separada)

**Fase 7 — Testing:**
16. `tests/agent-chain-continuity.regression.test.js` cobrindo 17 ACs (testes integração + fixtures)

**Sequência de commits sugerida (opt-in):**
- 1 commit por fase, exceto Fase 4 que pode ser 1 commit por agente (9 commits) para review granular
- Total estimado: 7-15 commits dependendo da granularidade do `@committer`

## 7. Resoluções das 6 pendências do @analyst

| # | Pendência | Decisão | Justificativa |
|---|---|---|---|
| 1 | Local físico do auto-init hook | **Defense-in-depth: prompt do `@product` (primário) + `workflow:next` pre-stage (fallback)** | Cobre modo CLI envelope E modo direto LLM; idempotência torna seguro |
| 2 | Implementação da paridade audit | **Section extraction + string compare exato** (sem checksum) | Simples, debugável, suficiente para 8 agentes; checksum pode virar otimização v2 se performance dorrer |
| 3 | Estratégia de runtime events | **Reusar `aioson runtime-log` existente com `--type=<5 novos>`** | Evita criar segundo namespace; alinha com convenção `secure-by-default` (security_scan_completed etc.) |
| 4 | Backwards compat policy do handoff-protocol | **Indefinida — parser dual (string \| object) sem deprecation** | Custo é ~5 linhas; remoção quebraria consumidores externos (dashboards) sem ganho real |
| 5 | `dossier:add-research` interface | **`--summary-path` inferido por padrão (`researchs/{research-slug}/summary.md`); flag explícita opcional** | Common case ergonomic; alinha com convenção `researchs/` em AGENTS.md |
| 6 | Gate semantics no `@dev` auto-relato | **Telemetry-only no MVP; gate bloqueante deferido** | Bloqueante exige inspeção/parsing de output do agente em real-time, complexidade alta para benefício marginal; telemetry permite auditar conformidade post-hoc e decidir v2 baseado em dados |

## 8. Non-goals / Deferred

Repete out-of-scope das requirements + adiciona deferrais arquiteturais:

**Repete das requirements:**
- Auto-detecção de gaps por LLM (manual via `revision:open`)
- Migração retroativa em massa de features done
- Dashboard UI
- Cross-project handoff (próxima feature)
- Brains expansion
- handoff-protocol v3 com sha256
- Workflow:status stale state fix (correlato mas separado)

**Adicionais deferidos por decisão arquitetural:**

- **File-watcher / git-hooks para drift detection.** Detecção é prompt-driven. Razão: file-watchers exigem processo persistente; git-hooks exigem instalação. Prompt-driven é zero-infra e suficiente para o caso comum.
- **`aioson dev:resume-data` como CLI command público.** Preferi helper interno em `src/lib/dev-resume.js`. Se outro agente ou ferramenta precisar consumir, expor depois.
- **Compaction automática do `Research Index`.** Section pode crescer; se virar problema (>5KB só nesta seção), `dossier:compact` pode ser estendido. Por ora, fica freeform.
- **Versioning do `agent-templates.md`.** Documento é texto plain. Mudanças são tracked via git. Schema versioning aqui é overhead.
- **Multi-language para agent prompts.** Paridade template/workspace é em-projeto; localização (`.aioson/locales/`) é convenção separada. Esta feature não toca.

## 9. Hand-off para `@ux-ui`?

Não aplicável. Esta feature é CLI/prompt — sem UI. Feature MEDIUM mas pula `@ux-ui` por escopo.

## 10. Hand-off para `@dev`

Inputs canônicos para `@dev`:
- `prd-agent-chain-continuity.md`
- `requirements-agent-chain-continuity.md`
- Este `architecture-agent-chain-continuity.md`
- `.aioson/context/features/agent-chain-continuity/dossier.md` (já bootstrapped)
- `.aioson/docs/dossier/schema.md` + `agent-templates.md` (estado atual a evoluir)
- Bootstrap files (`how-it-works.md` em particular)
- Códigos a tocar: ver § 2 (lista exaustiva de 41 superfícies)

`@dev` deve:
- Implementar fase a fase (recomendado), 1 commit por fase ou 1 commit por agente na Fase 4
- Atualizar dossier `Code Map` por arquivo criado/modificado (`dossier:add-codemap`)
- Atualizar dossier `Agent Trail` por slice (`dossier:add-finding`)
- Aplicar convenção `DRIFT:` se detectar divergência durante impl
- Antes de fechar feature: rodar `aioson dossier:audit . --check=template-parity` e `--check=coverage` para confirmar AC-ACC-13 e AC-ACC-15

## 11. Gate B status

> **Gate B:** Architecture approved — `@dev` can proceed.

Decisões registradas, pendências resolvidas, sequência de implementação concreta, schema models definidos, integration architecture especificada, cross-cutting concerns documentadas. Sem bloqueios identificados.
