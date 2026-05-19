---
briefing_source: workflow-handoff-integrity-1-9-2
slug: workflow-hotfix-1-9-3
classification: SMALL
created_by: product
created_at: 2026-05-19
status: draft
gate_a: pending
gate_b: pending
gate_c: pending
gate_d: pending
---

# PRD — Workflow Hotfix v1.9.3

## Vision

Completar a migração SDLC `981a8fd` (Apr 24, 2026) que ficou parcialmente implementada — restaurando o contrato canônico "**`@pm` é owner de `implementation-plan-{slug}.md` em MEDIUM**" (AC-SDLC-15) em **todos** os pontos do framework (template, testes, arquivos candidatos do plan), não apenas no workspace.

Resultado esperado: qualquer projeto rodando AIOSON ≥ 1.9.3 (incluindo `aioson-com` hoje em deadlock) consegue executar uma feature MEDIUM ponta-a-ponta sem que `/pm` recuse produzir o artefato exigido pelo Gate C.

## Problem

A v1.9.2 deixou um **deadlock estrutural** para features MEDIUM:

- O plan `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` (committed em `981a8fd`) declara `@pm` como owner canônico do `implementation-plan-{slug}.md`.
- O commit `981a8fd` atualizou `.aioson/agents/pm.md` (workspace) para refletir esse contrato.
- **Mas não tocou em** `template/.aioson/agents/pm.md`, `tests/agent-runtime-alignment.test.js`, nem nos demais arquivos candidatos listados no próprio plan (`artifact-map.md`, `handoff-contract.js`, `artifact-validate.js`).
- O commit `ca15f55` (Phase 4 chain-continuity, 2026-05-06) tentou re-sincronizar agent files mas só pegou a seção `## Feature dossier`; pm.md ficou desalinhado.

Consequência observada em `aioson-com` (2026-05-19):

1. `/architect` rotear corretamente para `/pm` (per AC-SDLC-15).
2. `/pm` lê seu prompt template (legacy "do not silently create implementation-plan") e recusa produzir.
3. `aioson gate:check` bloqueia Gate C porque o arquivo não existe.
4. Deadlock — usuário sem caminho automático para destravar.

Mesma classe de bug atinge qualquer projeto fresh vindo de `aioson update` para 1.9.2.

## Users

- **Primário:** Developers usando AIOSON CLI em projetos externos (que receberam template via `aioson setup` ou `aioson update`). Hoje qualquer feature MEDIUM trava.
- **Secundário:** O próprio AIOSON em inception mode — features MEDIUM internas dependem do mesmo contrato.
- **Indireto:** Futuros agentes/migrações que dependam dos arquivos candidatos do plan estarem coerentes.

## MVP scope

### Must-have 🔴

- **Propagar `pm.md` (workspace → template):** sobrescrever `template/.aioson/agents/pm.md` com o conteúdo de `.aioson/agents/pm.md`. Refazer parity test (`diff` retorna vazio). _(sheldon: comparação FULL-FILE, não apenas line 74 — outras seções podem ter divergências menores ainda não mapeadas)_
- **Atualizar `tests/agent-runtime-alignment.test.js:32-51`:** substituir tokens obsoletos (`## Handoff reality`, `Do not silently create implementation-plan`) pelos tokens do contrato pós-`981a8fd`. **Lista exaustiva de tokens a assertar** _(sheldon, C-spec)_:
  - `## MEDIUM implementation plan (mandatory output for MEDIUM)`
  - `For MEDIUM features, \`@pm\` MUST produce \`implementation-plan-{slug}.md\``
  - `## Non-MEDIUM handoff reality`
  - `## Workflow position reality` (preservar — está em ambos)
  - `aioson gate:approve . --feature={slug} --gate=C`
- **Atualizar manifest `template/.aioson/agents/manifests/pm.manifest.json`** _(sheldon, C2)_ **— GAP NOVO**: adicionar `.aioson/context/implementation-plan-{slug}.md` em `capabilities[0].outputs[]` (path_pattern). Hoje o teste alignment asserta apenas `prd.md` e `prd-{slug}.md` no manifest; se `@pm` agora é owner do implementation-plan, o manifest deve declarar como output canônico. Sem isso, `gate:check` e `artifact-validate.js` podem perder coerência com o contrato.
- **Auditoria operacional dos arquivos candidatos listados no plan** _(sheldon, C1 — refinado de "verificar e atualizar")_:
  Para cada arquivo abaixo, o protocolo é: (1) ler o arquivo; (2) grep por menções a `implementation-plan` ou `@pm`; (3) comparar claims contra AC-SDLC-15 (`@pm` é owner em MEDIUM); (4) registrar finding no PR como checklist (uma linha por arquivo: `✓ aligned` ou `✗ updated — diff: <descrição>`); (5) se divergente, atualizar.
  - `.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`
  - `src/handoff-contract.js`
  - `src/commands/artifact-validate.js`
  - **Também verificar** _(sheldon, scope-add)_: `template/.aioson/skills/process/aioson-spec-driven/references/artifact-map.md` (versão template do mesmo arquivo, se existir)
- **Decisão e propagação dos 3 demais arquivos divergentes** _(sheldon, I1 — refinado de "verificar se mesma migração")_:
  Para cada um (`orchestrator.md`, `briefing.md`, `discover.md`), o protocolo é: (1) `git log --oneline -- template/.aioson/agents/{file}` vs `.aioson/agents/{file}`; (2) se workspace foi tocado por uma migração documentada (`.aioson/plans/**/plan-*.md`) e template não acompanhou, propagar workspace → template; (3) se template foi tocado mais recentemente que workspace OU sem plan correspondente, NÃO propagar — documentar como "drift intencional ou unrelated" no PR; (4) se inconclusivo, abrir como follow-up em PRD estrutural. **Não propagar cegamente.**
- **Verificar agent files localizados em `.aioson/locales/`** _(sheldon, I2)_: se houver `.aioson/locales/{lang}/agents/pm.md` ou similar, confirmar se já refletem AC-SDLC-15 (devem ser traduções do canônico). Se sim, propagar para `template/.aioson/locales/{lang}/agents/pm.md`. Se não, registrar como gap separado.
- **Audit wiring loop (meta-AC, brain `sheldon-006`)** _(sheldon, I3 — meta)_: antes de marcar a feature `done` em `features.md`, **executar literalmente** o checklist do `plan-implementation-plan-ownership.md` arquivo por arquivo. Esta AC torna impossível repetir o mesmo bug que este hotfix corrige (migração documentada com implementação parcial). Output: PR description tem seção "## Plan candidates checklist" com cada arquivo listado e seu status.
- **Bump `package.json` 1.9.2 → 1.9.3.**
- **Sync `aioson_version` em `.aioson/context/project.context.md`.**
- **Validar:** `npm test` passa exceto flake conhecido em `tests/telemetry-foundation.test.js:38` (AC-ALL-101 perf <100ms) _(sheldon, C3)_ — durante o hotfix, esse teste deve ser executado em pelo menos 3 runs consecutivos; se passar em ≥2/3, considerar flake e seguir. Se falhar em ≥2/3, investigar (possível regressão real). Resto da suite (~2505 tests) deve passar 100%.

### Should-have 🟡

- **Release notes** _(sheldon, R4 — refinado)_ no `CHANGELOG.md` em formato changelog clássico (não security advisory — não é vulnerabilidade, é bug de processo). Estrutura sugerida:
  ```
  ## [1.9.3] - 2026-05-19
  ### Fixed
  - @pm agent prompt in template now correctly declares ownership of implementation-plan-{slug}.md
    for MEDIUM features (AC-SDLC-15), completing the SDLC migration started in v1.9.0 (981a8fd).
    Projects on 1.9.2 hit deadlock at Gate C when running MEDIUM features via standard chain.
  - tests/agent-runtime-alignment.test.js updated to assert the new canonical tokens.
  - Workspace ↔ template parity restored for pm.md (and other divergent agent files where applicable).
  ### Notes
  - Rollback: `npm install @jaimevalasek/aioson@1.9.2` if needed.
  - Affected: projects installed from 1.9.0/1/2 running MEDIUM features.
  ```
- ~~**Repro mínima como teste**~~ _(sheldon, R1 — REMOVIDO deste PRD)_ — smoke test ponta-a-ponta foi reclassificado como T6 no PRD estrutural (`prd-workflow-handoff-integrity.md`). Manter o hotfix cirúrgico. **Validação local** durante a implementação do hotfix continua sendo: rodar `npm pack` + `aioson setup` em fixture e verificar `/pm` produz o artefato — mas isso é check manual de QA, não CI gate.

## Out of scope

- **F2** — emissão centralizada de `workflow:next --complete` por todos os agentes. Tratado no `prd-workflow-handoff-integrity.md`.
- **F3** — `/analyst` (e outros) respeitarem manifest do sheldon antes de rotear. Tratado no `prd-workflow-handoff-integrity.md`.
- **F1** — stale cleanup de `dev-state.md`. Tratado no `prd-workflow-handoff-integrity.md`.
- **CI guard estrutural** para detectar drift semântico em agent files. Tratado no `prd-workflow-handoff-integrity.md` (T5).
- **Dogfood gate no release process.** Tratado no `prd-workflow-handoff-integrity.md` (T6).
- **Refatoração ampla** dos prompts ou da CLI. Este PRD é cirúrgico — completar migração documentada, não redesenhar.
- **Auditoria de outras migrações em `.aioson/plans/`** que possam ter o mesmo padrão de incompletude. Capturar como follow-up briefing separado.

## User flows

Não aplicável — change é interna ao framework (template + tests + helpers). Validação por execução de cadeia AIOSON em fixture.

## Success metrics

- **Funcional:** `npm test` passa em ≥2/3 runs consecutivos. Único teste tolerado como flake conhecido é `tests/telemetry-foundation.test.js:38` (AC-ALL-101 perf <100ms; observado 585ms em ambiente do dev) _(sheldon, C3 — refinado)_. Resto da suite (~2505 testes) deve passar 100%.
- **Repro destravada:** em fixture greenfield (`npm pack` + `aioson setup`), executar `/briefing → /product → /sheldon → /architect → /pm` em feature MEDIUM faz `/pm` produzir `implementation-plan-{slug}.md` sem deadlock. _(check manual de QA — não automatizado neste PRD)_
- **`aioson-com` destravada:** após `aioson update` para 1.9.3 em `aioson-com`, retomar feature `tutorials-react-migration` consegue rodar `/pm` que produz o artefato e libera Gate C. _(Nota: requer ação do usuário — `aioson update`. Não é automático.)_
- **Parity automática garantida:** `diff template/.aioson/agents/*.md .aioson/agents/*.md` retorna vazio para `pm.md`. Para `orchestrator.md`/`briefing.md`/`discover.md`: vazio SE foram propagados; senão, motivo documentado no PR.
- **Plan candidates auditados** _(sheldon, R2 — refinado com formato):_ PR description contém seção `## Plan candidates checklist` listando cada arquivo de `plan-implementation-plan-ownership.md`, com status `✓ aligned` (sem mudança necessária) ou `✗ updated — diff: <breve descrição>`. Manifest pm.json também incluído. Aprovação do PR exige checklist 100% preenchida.
- **Rollback testável** _(sheldon, R3)_: documentação confirma que `npm install @jaimevalasek/aioson@1.9.2` (ou pin no `package.json` do projeto consumidor) restaura comportamento anterior. Test/QA confirma rollback funciona em fixture antes do publish.

## Open questions

**Resolvidas no enrichment (sheldon, 2026-05-19):**

- ~~Q3 (repro smoke test em v1.9.3 ou follow-up?)~~ → resolvido: **follow-up no PRD estrutural** (R1). Mantém hotfix cirúrgico.
- ~~Q2 (formato de "verificação documentada")~~ → resolvido: **checklist no PR description** (R2). Mandatório.

**Ainda abertas:**

1. **[research-able]** Os 3 arquivos secundários divergentes (`orchestrator.md`, `briefing.md`, `discover.md`) são da mesma migração `981a8fd`? Resolução via protocolo `git log` definido em Must-have (I1). Resultado afeta scope final.
2. **[research-able]** Existem outros tests que assertam o contrato obsoleto? Grep `Do not silently create` em `tests/` antes do PR _(sheldon, scope-add)_. Resolve em < 10min.
3. **[research-able]** A migração `981a8fd` é única ou outras migrações em `.aioson/plans/` têm o mesmo problema? Capturar como item de research em briefing meta separado se tempo permitir.
4. **[decision-required]** _(sheldon, R5)_ Para os 3 arquivos secundários, se git log revelar drift NÃO relacionado à `981a8fd` (template tocado depois por outro motivo), o protocolo manda NÃO propagar. Mas se isso deixar o hotfix incompleto (drift segue causando confusão), como tratar? Recomendação: documentar como follow-up sem bloquear este PR.
5. **[research-able]** _(sheldon, I2)_ Há agent files localizados em `.aioson/locales/{lang}/agents/pm.md`? Se sim, estão sincronizados com a versão canônica? Resolve em < 15min via `ls` + `diff`.
6. **[decision-required]** _(sheldon, C3)_ Se `tests/telemetry-foundation.test.js` falhar em >1/3 runs, considerar bloqueante (regressão real) ou parqueado (flake persistente) para o hotfix? Recomendação: bloqueante se observado degradação após o hotfix; tolerável se já estava failing antes de tocar `pm.md`. Confirmar comparando branch base.
7. **[decision-required]** _(sheldon, brain `sheldon-002`)_ Este hotfix poderia ser MICRO (só `@dev`, sem `@analyst`)? Pesa "complexidade real do trabalho": múltiplos arquivos, audit do plan, decisão por arquivo nos secundários. Recomendação: manter SMALL — `@analyst` produz `requirements-workflow-hotfix-1-9-3.md` com requirements numerados (RF-01 propagar pm.md, RF-02 update test, etc.), permite QA verificar 1:1. MICRO seria mais rápido mas perderia checklist verificável.
8. **[testable]** _(sheldon, success-metric refinement)_ Como verificar que `aioson-com` foi realmente destravada, dado que é projeto externo? Recomendação: documentar no PR um comando de fumaça para usuário rodar no aioson-com após update (`aioson workflow:status .` deve avançar para `[>] @architect` ou `[>] @dev` dependendo do estado), e usar como "deploy verified" signal antes de fechar a feature.

## Visual identity

N/A — change interna ao framework, sem UI.

## Reference sources (sheldon)

Sources consultados ou ancorados durante o enrichment de 2026-05-19:

- `.aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md` — briefing v2 com git archaeology completa; cluster F1-F5 mapeado; lesson-meta sobre tripod canônico.
- `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` — **ground truth canônico** (AC-SDLC-15: `@pm` é owner). Origem do hotfix.
- `tests/agent-runtime-alignment.test.js:32-51` — guardião obsoleto (asserta contrato pré-`981a8fd`); precisa update junto com template.
- `src/commands/runtime.js:1173-1250` (função `runAgentDone`) — confirma que `agent:done` é só telemetria, não avança pointer.
- Commit `981a8fd` (2026-04-24) — migração SDLC parcial; smoke gun do bug.
- Commit `ca15f55` (2026-05-06, Phase 4 chain-continuity) — tentou re-sync, pegou só `## Feature dossier` section.
- Brain node `sheldon-006` ★5 (`design-complete is not execution-complete — audit wiring before closing a feature`) — princípio ancorador. Aplicação literal aqui: o próprio hotfix corrige uma violação exata desse princípio.
- Brain node `sheldon-002` ★5 (`classification gates scale process depth`) — usado para validar que SMALL é apropriado (vs MICRO).
- Sessão @deyvin abortada (2026-05-19) — evidência empírica de que tentar o hotfix sem audit completo bate em test alignment obsoleto. Lição registrada no briefing.

Nenhuma pesquisa web realizada — o problema é endogenous (sync interno template ↔ workspace), não envolve tecnologia externa.

## Sheldon enrichment notes _(sheldon)_

Improvements aplicados nesta sessão (todos os 11 — Critical + Important + Refinements, conforme escolha do user 2026-05-19):

| # | Tipo | O que mudou no PRD |
|---|------|---------------------|
| C1 | Critical | "Auditoria operacional dos arquivos candidatos" agora tem protocolo de 5 passos (ler → grep → comparar → registrar → atualizar). Antes era vago ("verificar"). |
| C2 | Critical | Adicionada Must-have explícita: atualizar `template/.aioson/agents/manifests/pm.manifest.json` para incluir `implementation-plan-{slug}.md` em `capabilities[0].outputs[]`. Não estava no PRD original. |
| C3 | Critical | Success metric de `npm test` relaxada para tolerar flake conhecido em `telemetry-foundation.test.js` (perf <100ms vs 585ms observado), com critério de 2/3 runs. |
| I1 | Important | Protocolo de 4 passos para decisão sobre os 3 arquivos secundários (`orchestrator.md`/`briefing.md`/`discover.md`): git log → confirma origem → propaga apenas se mesma migração → senão documenta como follow-up. Sem propagar cegamente. |
| I2 | Important | Verificação de agent files localizados (`.aioson/locales/{lang}/agents/pm.md`) adicionada como Must-have. Gap não coberto no PRD original. |
| I3 | Important (meta) | "Audit wiring loop" como meta-AC, ancorado em brain `sheldon-006`. Output mandatório: seção `## Plan candidates checklist` no PR description com cada arquivo do plan listado. Torna o hotfix imune ao mesmo bug que corrige. |
| R1 | Refinement | Smoke test movido do Should-have do hotfix para o PRD estrutural (T6 lá). Mantém hotfix cirúrgico. |
| R2 | Refinement | Formato explícito para "verificado": checklist no PR description. Não é texto livre — itens com `✓ aligned` ou `✗ updated`. |
| R3 | Refinement | Rollback documentado: `npm install @jaimevalasek/aioson@1.9.2` deve restaurar; testar em fixture antes do publish. |
| R4 | Refinement | Release notes em formato changelog (não security advisory). Template incluído. |
| R5 | Refinement | Decisão explícita sobre drift NÃO relacionado em arquivos secundários: documentar como follow-up, não bloquear PR. |

**Sizing decision:** Path A — in-place enrichment (score 0). Nenhuma `## Delivery plan` adicionada (esse é trabalho do `@pm` em features MEDIUM; SMALL não exige).

**Não há harness:init para SMALL** — apenas `progress.json` será produzido se a CLI suportar (skip silencioso se não houver comando equivalente).

## Lessons learned a registrar

Esta feature nasceu de **três sessões iterativas** com correção de direção a meio caminho. Lições para incorporar no PRD/implementação:

- **Tripé canônico de verificação:** antes de qualquer fix de contrato em framework, cruzar prompts + tests + plans committed. Plans são ground truth; tests e prompts podem estar desatualizados.
- **`sync-agents-preflight.js` é insuficiente:** só checa `## Feature dossier` length. Não pega divergência semântica em outras seções. Lacuna estrutural (tratada em PRD irmão).
- **Migrações documentadas devem ter checklist literal:** o `plan-implementation-plan-ownership.md` listou os arquivos candidatos; bastava percorrer um a um. Próximas migrações devem fazer isso ostensivamente, idealmente automatizado.
