---
target_prd: ".aioson/context/prd-feature-dossier.md"
sheldon_version: "1.0"
last_enrichment_at: "2026-04-27"
enrichment_round: 1
plan_path: ".aioson/plans/feature-dossier/manifest.md"
sizing_score: 9
sizing_decision: "Path B — external phased plan"
schema_version: "1.0"
---

# Sheldon enrichment — Feature Dossier

## Sources used

- `plans/feature-dossier-and-reverse-invocation.md` — plano-semente (consumido como source pré-produção, registrado em `plans/source-manifest.md`)
- Memory `project_feature_dossier_design.md` — 7 decisões de design fechadas em conversa antes da ativação
- `.aioson/context/handoff-protocol.json` — schema atual do handoff
- `.aioson/context/prd.md` — PRD do projeto AIOSON (contexto-pai)
- Commits relevantes: `981a8fd` (handoff-contract + canonical-path rules), `e943782` (feature-archive), `5cc7074` (memory active retrieval), `c33f8cc` (docs sync)

## Research findings

Keywords extraídas e classificadas conforme `research-loop.md`:

| Keyword | Stale risk | Pesquisa fresh? | Justificativa |
|---|---|---|---|
| agent handoff dossier | low | não | feature interna ao AIOSON |
| reverse invocation governance | low | não | feature interna ao AIOSON |
| anti-loop revision cycle | low | não | governança escolhida (3-ciclo + flag explícito) |
| disk-first vs sqlite truth | low | não | regra `disk-first-artifacts.md` é canônica |
| append-only context multi-agent | low | não | derivado das próprias rules do projeto |

Nenhum keyword justifica pesquisa fresh — feature é interna, não toca em mercado externo, vendor, compliance ou padrão UI evolutivo.

## Sizing decision

| Critério | Score |
|---|---|
| Entidades principais (5: dossier, revisions.json, code-map, handoff delta, source-manifest) | +2 |
| Fases distintas de entrega (3) | +4 |
| Integrações externas (0) | 0 |
| User flows (5: read, write, open-revision, approve, archive) | +2 |
| AC complexity (>10) | +1 |
| **Total** | **9** |

**Decisão:** Score 9 → Path B (plano faseado externo) em `.aioson/plans/feature-dossier/`. Plano com 3 fases independentes e ACs verificáveis por fase.

## Improvements applied

### 🔴 Críticos (8)

1. **Concorrência:** definir lockfile `.dossier.lock` com timeout 30s para escrita na mesma seção; append-only entre seções diferentes.
2. **`revisions.json` é fonte de verdade:** justificado contra `disk-first-artifacts.md`. SQLite é mirror para dashboard.
3. **Schema do `handoff-contract` é backwards-compatible:** novos campos opcionais; ausência = legado tratado como `null` / `0` / `[]`.
4. **Dossier vs. context-pack:** dossier é fonte VIVA por-feature; context-pack faz SNAPSHOT no início da sessão. Resolve dual-source-of-truth contra active retrieval layer (commit 5cc7074).
5. **State machine + invocação reversa:** gates aprovados permanecem aprovados; re-execução append `revision_round` em `workflow.state.json` (não rewind).
6. **`code-map` populado via `dossier:add-codemap`:** schema YAML estruturado (path, lines, role, coupling_risk), idempotente por (path, lines).
7. **`feature:archive` snapshota `revisions.json` final** — incluindo rejeitadas — em `done/{slug}/dossier/`.
8. **Bootstrap de features em curso INCLUÍDO** (Fase 3) — sem isso o próprio AIOSON não adota incrementalmente.

### 🟡 Importantes (3)

9. **Budget do dossier ativo:** 15KB; seções de gates encerrados auto-migram para `dossier-history.md`.
10. **Schema versioning** obrigatório em `dossier.md` e `revisions.json` (`schema_version: 1.0`).
11. **Surface de testes** enumerada em cada plan-{phase}.md (golden fixtures + integração end-to-end).

### 🟢 Refinamentos (3)

12. CLI split: `dossier:append` → `dossier:add-finding` / `dossier:add-codemap` / `dossier:link-rule`.
13. `code-map` é YAML embutido em `dossier.md` (não arquivo separado) — atomicidade + menor file count.
14. Templates concretos por agente em `.aioson/docs/dossier/agent-templates.md`.

## Improvements discarded

Nenhum. Todos os 14 items aprovados pelo user.

## Architectural risks (não-bloqueadores, registrar para `@architect`)

- **R1 — Lockfile órfão.** Se um agente crashar segurando `.dossier.lock`, próximo write fica preso. Mitigação: TTL no lockfile (PID + timestamp); se PID não existe ou timestamp > 60s, ignora.
- **R2 — Loop transparente.** Mesmo com 3-ciclo + `--force-revision`, um user determinado pode forçar 10+ ciclos. Mitigação: telemetria via `runtime:emit` para o dashboard expor padrão; não é bloqueio.
- **R3 — Drift entre dossier e PRD/spec canônicos.** Dossier referencia PRD/spec por link, mas se um for editado e o outro não, há divergência. Mitigação: `dossier:show` exibe `last_updated_at` de cada referência e sinaliza staleness.
- **R4 — Bootstrap heurístico (`--from-existing`) pode gerar Agent Trail enviesado** quando metadados originais (autor, data) estão ausentes. Mitigação: marcar entradas sintéticas com `synthetic: true` no Agent Trail.
- **R5 — Active retrieval ranking pode privilegiar dossiers obsoletos** se sessão demora a fechar feature. Mitigação: rank decay por `last_updated_at`; após 30 dias sem update, dossier ativo cai abaixo de PRD genérico.
- **R6 — Dossier como atrator de prosa.** Sem templates rígidos, agentes podem despejar texto longo. Mitigação: `dossier:add-finding` valida tamanho do `--content` (default cap 2KB por finding); templates por agente reforçam estrutura.

## Path decision justification

Path B (plano faseado externo) escolhido sobre Path A (in-place enrichment + delivery plan inline):

- **3 fases independentemente implementáveis** com ACs verificáveis por fase — cabe em Path B, não em uma seção `## Delivery plan` do PRD.
- **Mutações em módulos centrais** (`workflow:execute`, `handoff-contract`, `feature:archive`, `active-retrieval`) — risco arquitetural exige plan dedicado por fase para que `@architect` e `@dev` consigam atacar incrementalmente.
- **Score 9 ultrapassa o threshold 7+** definido em `enrichment-paths.md`.

## Quality scorecard (review pass)

| Dimensão | Score | Nota |
|---|---|---|
| Criticality | 5 | 8 críticos isolados de não-críticos |
| Evidence strength | 4 | Commits e regras concretos citados; alguns riscos são inferenciais |
| Prioritization clarity | 5 | Crítico/Importante/Refinamento separados |
| Downstream usefulness | 5 | `@architect` recebe ACs verificáveis e mutações concretas |
| Execution realism | 4 | 3 fases com estimativas (1-2d, 3-5d, 2-3d) — realistas para AIOSON ritmo atual |

Todos ≥ 4 → output liberado.

## Handoff

Próximo agente: **`@analyst`**.

Inputs canônicos para `@analyst`:
- `.aioson/context/prd-feature-dossier.md`
- `.aioson/plans/feature-dossier/manifest.md`
- `.aioson/plans/feature-dossier/plan-mvp-read-only.md`
- `.aioson/plans/feature-dossier/plan-write-revisions.md`
- `.aioson/plans/feature-dossier/plan-codemap-bootstrap.md`
- Esta enrichment (`.aioson/context/sheldon-enrichment-feature-dossier.md`)

`@analyst` deve mapear entidades (Dossier, Revision, CodeMapEntry, AgentFinding, RuleLink), fluxos (init, write, revision-cycle, archive), e dependências internas com módulos AIOSON existentes (`workflow-execute`, `handoff-contract`, `feature:archive`, `active-retrieval`).
