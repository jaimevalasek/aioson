---
feature: agent-chain-continuity
status: in_progress
started: 2026-05-07
classification: MEDIUM
gate_design: approved
gate_design_approved_at: 2026-05-07
gate_design_approved_by: architect
gate_requirements: approved
---

# Spec — Agent Chain Continuity

## What was built

[To be filled by @dev during implementation]

## Entities added

### Schema additions

**Dossier schema v1.2:**
- `## Research Index` section (YAML embedded)
- `schema_version: "1.2"` bump
- Convenção `DRIFT:` no `## Agent Trail` (parser-agnostic)

**handoff-protocol.json schema v2:**
- `artifact_uris` como array de objetos `{path, kind, agent, added_at}`
- Backwards compat com array de strings

### CLI additions / changes

- `aioson dossier:add-research` (novo)
- `aioson dossier:audit --check=template-parity` (novo subcomando ou flag)
- `aioson dossier:audit --check=coverage` (novo)
- `aioson workflow:next` (alterado: auto-init hook)
- `aioson feature:close` (alterado: dossier guarantee)
- `npm run sync:agents` (alterado: pre-hook de paridade)

### Agent prompt changes (8 chain agents)

Workspace + template, paridade obrigatória:
- `@product` — manter contrato existente em `What`, adicionar entry em `Agent Trail`
- `@sheldon` — **nova seção `## Feature dossier`** (zero menções hoje); contrato: escrever em `Agent Trail` + `Research Index`
- `@analyst` — manter, adicionar contrato `Research Index` quando consultar pesquisas
- `@architect` — manter, adicionar contrato `Research Index` quando consultar pesquisas
- `@ux-ui` — manter
- `@pm` — manter
- `@orchestrator` — manter
- `@dev` — adicionar instrução de auto-relato em chat novo + drift detection com convenção `DRIFT:`
- `@qa` — manter

### Runtime telemetry events (5 novos)

- `dossier_auto_initialized`
- `feature_close_dossier_synthesized`
- `dev_drift_detected`
- `dev_auto_resume`
- `sync_agents_parity_violation`

## Key decisions

- [2026-05-07] **MICRO sem auto-init** — overhead não compensa; permanece opt-in via `dossier:init` manual. Razão: features MICRO frequentemente têm 1-2 commits e não justificam ceremony.
- [2026-05-07] **Drift = Code Map paths + plano `@sheldon`** — exclui "qualquer divergência" (ruidoso) e "só ACs" (frágil). Granularidade ancorada no que upstream declarou.
- [2026-05-07] **`@sheldon` escreve `Agent Trail`, não `Why`** — override do legacy `agent-templates.md`. Razão: usuário decidiu (3.a) durante product conversation; preserva ownership de `Why`/`What` pelo `@product`.
- [2026-05-07] **`Research Index` estruturado, drift freeform** — auditabilidade onde importa (research é foco do usuário), liberdade onde a explicação carrega contexto (drift entries).
- [2026-05-07] **Auto-init silencioso, sem aviso** — usuário final não lê docs nem aprende a usar dossier; framework cuida automaticamente.
- [2026-05-07] **`feature:close` garante dossier** — única intervenção automática no ciclo de done; demais retro-inits permanecem manuais sob demanda do usuário.
- [2026-05-07] **`handoff-protocol.json.artifact_uris` sem hash** — array de objetos `{path, kind, agent, added_at}`. Sem `sha256` por custo-benefício; pode virar v3 se drift entre handoff e estado real virar problema observável.
- [2026-05-07] **Classificação mantida em MEDIUM** apesar de score=2 (SMALL pelo rubric). Razão: superfície cross-cutting em 8 prompts + 4 commands CLI + hooks justifica `@architect` formal antes de `@dev`.

## Edge cases handled

Ver § 7 de `requirements-agent-chain-continuity.md` (12 edge cases mapeados, EC-ACC-01 a EC-ACC-12).

## Dependencies

### Reads

- `.aioson/context/features.md` — registro de features e classificações
- `.aioson/context/features/{slug}/dossier.md` — quando existe
- `.aioson/context/handoff-protocol.json` — handoff state
- `.aioson/context/last-handoff.json` — last-handoff state
- `.aioson/context/dev-state.md` — per-feature dev session state
- `.aioson/plans/{slug}/manifest.md` + plan files — plano `@sheldon`
- `researchs/{slug-pesquisa}/summary.md` — pesquisas linkadas
- `.aioson/agents/*.md` + `template/.aioson/agents/*.md` — 8 agentes da cadeia para paridade
- `.aioson/docs/dossier/schema.md` + `agent-templates.md` — schema atual e templates
- `.aioson/runtime/aios.sqlite` — query de telemetria existente (pulse, runtime events)

### Writes

- `.aioson/context/features/{slug}/dossier.md` — auto-init silencioso
- `.aioson/context/handoff-protocol.json` — `artifact_uris` populado
- `.aioson/runtime/aios.sqlite` — 5 runtime events novos
- `.aioson/agents/*.md` + `template/.aioson/agents/*.md` — atualização paritária dos 8 agentes
- `.aioson/docs/dossier/schema.md` — bump v1.2
- `.aioson/docs/dossier/agent-templates.md` — novos templates + reescrita de `@sheldon`

### Files / modules to touch

- `src/dossier/schema.js` — bump versão, adicionar parser de `Research Index`
- `src/dossier/store.js` — append-only para Research Index
- `src/dossier/dossier-bootstrap.js` — usado pelo `feature:close` guarantee
- `src/commands/dossier.js` — novo subcomando `add-research`, `audit`
- `src/commands/feature-close.js` — guarantee hook
- `src/commands/workflow-next.js` — auto-init hook (decisão de local pelo `@architect`)
- `src/handoff-contract.js` — schema v2 do `artifact_uris`
- `package.json` — `sync:agents` script com pre-hook
- `tests/agent-chain-continuity.regression.test.js` — bundle de regressão (17 ACs)
- `tests/dossier/` — testes unitários dos novos commands
- `tests/handoff-contract.test.js` — schema v2 + backwards compat

## Notes

- **Dogfood candidate:** essa feature é um caso autorreferente — ela não tem dossier porque o auto-init que ela vai construir não existe. Recomendo: ao final do `@architect`, antes do `@dev` começar, rodar manualmente `aioson dossier:init . --slug=agent-chain-continuity --from-existing` para a feature ter o dossier que a feature está construindo. Garante que `@dev` testa o fluxo de leitura mesmo antes do auto-init estar pronto.
- **Workflow stale state observado:** durante o preflight do `@analyst`, `aioson workflow:status .` ainda listou `secure-by-default` como feature ativa. Esse é um bug correlato (workflow.state.json não atualizou ao criar `prd-agent-chain-continuity.md`) mas distinto desta feature. Anotado em § 9 das requirements como "out of scope" — pode virar feature MICRO separada.
- **`agent-templates.md` legacy de `@sheldon`** diz `section: "Why"`. Esta feature **substitui** essa instrução. `@dev` durante implementação deve sobrescrever a entrada existente, não adicionar nova.
- **CANONICAL_AGENT_IDS** em `src/dossier/schema.js` lista os 30 agentes canônicos. Confirmar que os 8 da cadeia (`product, sheldon, analyst, architect, ux-ui, pm, orchestrator, dev, qa`) estão todos lá. (Eu confirmei: estão.)
- **Backwards compat de schema** já é convenção do dossier (v1.2 lê v1.0 e v1.1). Manter na mesma linha; nenhuma migração de arquivos existentes.
- **Linguagem de output dos agentes** segue `interaction_language` do project context (pt-BR neste projeto). Telemetria, logs e schema YAML permanecem em inglês.
