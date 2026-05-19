---
slug: workflow-handoff-integrity-1-9-2
created_at: 2026-05-19
updated_at: 2026-05-19
source_plans: ["conversational — seed from dogfooding session in aioson-com after v1.9.2 release (2026-05-19)"]
---

# Briefing — Workflow handoff integrity (post v1.9.2 dogfood failure)

## Context

Pós-release v1.9.2 do AIOSON, o primeiro uso real (dogfood) do template atualizado no projeto irmão `C:\dev\aioson-com` expôs uma classe de falha que não havia aparecido em uso interno até agora: a cadeia canônica de agentes pode percorrer todo o pipeline **sem que o estado do framework (`workflow:status`, `dev-state.md`, recomendações de handoff) reflita o que está em disco**, e isso só é percebido quando algum agente "downstream" (no caso, `/dev`) tenta validar pré-condições e descobre o drift.

Sequência reproduzida pelo usuário:

1. `aioson update` em `aioson-com` (vindo de versão anterior, agora em 1.9.2 — confirmação CLI pendente).
2. Cadeia executada: `/briefing → /product → /sheldon → /analyst → /clear → /dev`.
3. `/sheldon` produziu `manifest.md` em `.aioson/plans/tutorials-react-migration/` com `status: pending-architect-decisions` (DD-01 `<dialog>` nativo vs `<Popover>` wrapper; DD-02 estrutura de `lib/docs-content/`; DD-03 browser support floor).
4. `/analyst` recomendou ao usuário pular para `/dev` (e não para `/architect`).
5. `/dev` rodou preflight em `tutorials-react-migration` e recusou implementação, reportando 4 bloqueios — sendo o mais alarmante o drift entre o ponteiro `workflow:status` (`[>] @analyst`) e o estado real em disco (todos os artefatos canônicos presentes).
6. Usuário então ativou `/architect`, que reconheceu as decisões DD-01/02/03 mas **roteou adiante para `/pm`** — pedindo que `/pm` produzisse `implementation-plan-tutorials-react-migration.md` (mapeando as 7 fases do manifest do `/sheldon` em sprints/stories) e aprovasse Gate C.
7. `/pm` ao ser ativado **recusou produzir o artefato**, expondo um **conflito de instruções entre três agentes e a CLI**:
   - `pm.md`: *"Do not silently create implementation-plan-{slug}.md as if they were mandatory outputs of this stage."*
   - `dev.md`: *"Plans come from @product or @sheldon; do not create them yourself."*
   - CLI `aioson gate:check`: reporta Gate C BLOCKED **porque** `implementation-plan-tutorials-react-migration.md` não existe.
   - Resultado: três agentes disclaim ownership, a CLI demanda o artefato. Ninguém pode avançar.

**Trigger:** lançamento da v1.9.2 + primeiro dogfood pós-release. Antes disso, o source `aioson` não tinha sido usado para auto-implementar nenhuma feature MEDIUM completa de ponta a ponta com a cadeia toda; os problemas eram latentes e só apareceram agora.

## Problem

> **Quando** um agente da cadeia AIOSON termina seu artefato em disco, **eu quero** que o estado do framework (`workflow:status`, `dev-state.md`, handoff recommendation do agente seguinte) reflita o que está em disco — de forma confiável e isolada por projeto, **para que** eu possa confiar na própria sugestão do framework sem ter que auditar manualmente cada handoff.

A dor real é **perda de confiança na auto-orquestração** do framework. AIOSON vende SDD com state machine + governance entre agentes; mas se o `/dev` é quem detecta drift e o usuário precisa fazer audit manual, o valor central (auto-roteamento confiável) já foi quebrado antes de chegar em código.

Para o público alvo (developer rodando AIOSON CLI em projeto próprio), isso transforma a experiência prometida ("ative o próximo agente sugerido") em "rode preflight, audite manifest, descubra drift, corrija manualmente, depois siga". Custo cognitivo cresce em vez de cair — exatamente o oposto da promessa.

## Proposed solution

Tratar **cinco falhas** observadas como um único cluster. Investigação ampliada (sessões @briefing + @deyvin + @briefing-v2 em 2026-05-19) revelou que a causa-raiz é mais simples do que parecia inicialmente: **a migração do SDLC process upgrade (commit `981a8fd`, 2026-04-24) ficou incompleta**.

> **Histórico revisado (CRÍTICO — leia antes de qualquer ação):**
>
> 1. **Primeira hipótese (rejeitada):** "F5 é template velho, source novo — copiar source → template e bumpar v1.9.3."
> 2. **Segunda hipótese (também rejeitada via @deyvin):** "Template é canônico (protegido por teste `agent-runtime-alignment.test.js:32`), source é working draft — não tocar."
> 3. **Verdade confirmada via git history + plan files:** O commit `981a8fd` documenta em `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` a decisão canônica (`@pm` IS owner do implementation-plan em MEDIUM, AC-SDLC-15). Mas o commit só atualizou **workspace** `.aioson/agents/pm.md`; **não** tocou em `template/.aioson/agents/pm.md` nem em `tests/agent-runtime-alignment.test.js`. O teste continua assertando os tokens do contrato pré-upgrade. Logo: o teste é OBSOLETO, não guardião. Tanto template quanto teste precisam ser atualizados para refletir o contrato documentado.

Evidência confirmada nesta sessão:

- **Q2 resolvido:** apenas `template/.aioson/agents/dev.md:259` e `qa.md:394, 401` instruem `aioson workflow:next . --complete=<self>`. Outros 18+ agentes só chamam `aioson agent:done`. Padrão incompleto, não erro pontual. **Tratamento estrutural separado em F2.**
- **Q3 resolvido:** `aioson agent:done` (`src/commands/runtime.js:1173-1250`) só registra eventos SQLite — não chama `workflow:next` internamente. Causa do pointer drift.
- **Q15 resolvido (corretamente):** O conflito entre source pm.md ("MUST produzir") e template pm.md ("do not silently create") é **migração incompleta de `981a8fd`**, não ambiguidade de design. AC-SDLC-15 (no plan committed em `981a8fd`) é ground truth: `@pm` é owner. Template + teste atrasados.
- **Q16 resolvido:** Gate C introduzido em `981a8fd` (2026-04-24, v1.9.0). Mesmo commit que documentou AC-SDLC-15 e atualizou workspace pm.md — mas deixou template+test para trás.
- **F1 reclassificado:** `src/commands/state-save.js:138` escreve `dev-state.md` em path per-project. Cross-project content em `aioson-com` é arquivo órfão, não bug de path. Detecção de stale existe (`preflight.js:72`) mas só warning.

Com isso, o cluster ganha framing limpo:

### F1 — Stale `dev-state.md` cleanup/detection (severidade média, **reclassificado**)

`dev-state.md` em `aioson-com` apontando para feature de outro projeto era **arquivo legado** (provavelmente do tempo em que `aioson-com` foi semeado a partir de outro projeto), não bug de escrita. `preflight.js:72` já tem `detectStaleDevState` mas só emite warning. Proposta:

- (a) `state:save` em modo `--new-feature` faz reset/cleanup automático
- (b) preflight com stale detectado oferece comando `aioson state:reset` interativo
- (c) sync de template não toca `dev-state.md` jamais (verificar `sync:agents`)

### F2 — Emissão completa de `workflow:next --complete` por todos os agentes (alta)

Evidência confirma: só 2 de 20+ agentes têm a instrução no rodapé. Padrão de fix:

- (a) **Modelo declarativo:** adicionar `workflow:next --complete=<self>` no rodapé de TODOS os agent files (template) onde faz sentido (todos os agentes que produzem artefato canônico — não `committer`/`copywriter`).
- (b) **Modelo imperativo:** `agent:done` passa a **também** chamar `workflow:next --complete=<agent>` automaticamente em `src/commands/runtime.js` quando detecta artefato canônico em disco.
- (c) **Combinação:** (b) como default, (a) como override explícito quando agente quer marcar conclusão sem ter escrito artefato.

Recomendação primária para o PRD: **(b) — modelo imperativo**. Reduz superfície de erro (não depende de cada agent file estar correto) e centraliza lógica em um lugar.

### F3 — `/analyst` (e outros) respeitam estado upstream antes de recomendar próximo agente (média)

Hipótese ainda não confirmada por output literal — capturar antes de fechar o briefing. Proposta dupla:

- (a) Adicionar checagem no prompt de `/analyst.md` (e revisar outros): "se manifest do sheldon tem `pending-*-decisions`, próximo é o agente que resolve essas decisions, não pular".
- (b) Adicionar validação na CLI: `workflow:next --complete=analyst` recusa se sheldon manifest está pending. Defesa em camadas.

### F4 — Ownership de `implementation-plan-{slug}.md` em MEDIUM (alta — RESPOSTA DOCUMENTADA)

**Não é mais "decisão pendente". Há ground truth documentado:**

> `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` (commit `981a8fd`):
>
> "**Recommended decision:** `@pm` deve ser dono do `implementation-plan-{slug}.md` em MEDIUM."
> "AC-SDLC-15: `@pm` gera `implementation-plan-{slug}.md` quando a feature e MEDIUM."

O bug não é "agentes discordam sobre ownership". É "**a decisão `@pm` é owner foi documentada mas só implementada parcialmente**":

- ✓ Workspace `.aioson/agents/pm.md` foi atualizado (em `981a8fd`).
- ✗ Template `template/.aioson/agents/pm.md` NÃO foi atualizado no mesmo commit.
- ✗ Teste `tests/agent-runtime-alignment.test.js:32` NÃO foi atualizado — ainda asserta tokens do contrato anterior.
- ? Arquivos candidatos listados no plan ainda não verificados: `.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`, `src/handoff-contract.js`, `src/commands/artifact-validate.js` — todos podem ter contratos desatualizados.

**F4 colapsa em F5 (completar a migração de `981a8fd`)**, mas com escopo mais claro do que antes: a lista de arquivos a propagar está documentada no próprio plan.

Tarefa concreta para o PRD: auditar cada candidato listado no plan, confirmar coerência com AC-SDLC-15, atualizar onde diverge, atualizar teste em alinhamento.

Resíduo separado: `manifests/dev.manifest.json` marca implementation-plan como `required: false`. Conferir se bate com `gate:check` exigindo o arquivo. Pode ser inconsistência menor remanescente, ou camadas diferentes (manifest = o que `@dev` LÊ; gate = o que precisa EXISTIR).

### F5 — Completar a migração SDLC process upgrade (`981a8fd`) — severidade catastrófica para feature MEDIUM

**Causa-raiz do cluster.** O commit `981a8fd` (2026-04-24, v1.9.0) introduziu Gate C + atualizou workspace `pm.md` para o contrato "MUST produzir", mas a propagação **template + teste + arquivos candidatos** ficou incompleta. Toda manifestação observada em `aioson-com` (deadlock /pm) é consequência disso.

Comparação `diff template/.aioson/agents/*.md .aioson/agents/*.md` (2026-05-19) — 4 arquivos divergentes:

| Arquivo | Severidade | Diferença |
|---------|-----------|-----------|
| **`pm.md`** | **Catastrófica** | Source: "MUST produzir" (correto per AC-SDLC-15); Template: "do not silently create" (legacy pré-981a8fd, NUNCA atualizado). Causa direta do deadlock em `aioson-com`. |
| **`orchestrator.md`** | Alta | Source usa naming feature-scoped (`requirements-{slug}.md`, `spec-{slug}.md`, `ui-spec-{slug}.md`); template usa naming legacy. Provável que seja outra parte da migração incompleta. |
| **`briefing.md`** | Baixa | Source tem 1 linha extra sobre dedup contra `done/MANIFEST.md`. |
| **`discover.md`** | Baixa | Source tem 1 linha extra sobre `done/MANIFEST.md` (mesma feature do briefing.md). |

E o teste `tests/agent-runtime-alignment.test.js:32` (último touch em `8ac092f`, **antes** de `981a8fd`) também precisa atualização — protege contrato obsoleto.

Direção proposta — **NÃO é "reverter source" nem "redesenhar contratos"**. É:

- (a) **Completar a migração `981a8fd` literalmente**: propagar workspace pm.md → template pm.md; atualizar `agent-runtime-alignment.test.js:32` para assertar os novos tokens (`## MEDIUM implementation plan (mandatory output for MEDIUM)`, `MUST produce`); auditar e atualizar os arquivos listados em `plan-implementation-plan-ownership.md` (artifact-map.md, handoff-contract.js, artifact-validate.js); checar outras divergências dos 4 arquivos.
- (b) **Adicionar guard estrutural**: CI hook (ou estender `sync-agents-preflight.js` já existente) que falha se `diff template/.aioson/agents/ .aioson/agents/` retorna algo não-trivial. Hoje o preflight só checa `## Feature dossier` length — não pega divergência semântica como esta.
- (c) **Sync direction**: hoje é `template → workspace` via `rsync template/ ./`. Pode ser que precise virar bidirecional ou ter sync inverso (`workspace → template`) como passo manual de "promover working drafts". Decidir como parte do PRD.

Recomendação primária para o PRD: **(a) + (b) imediatamente**. (c) é refactor de processo, pode ficar para SMALL/MEDIUM follow-up.

**Lição importante a registrar:** durante a investigação deste briefing, duas hipóteses sobre F5 foram propostas e rejeitadas (cada uma fazia sentido sem cruzar com o `plan-implementation-plan-ownership.md`). Verificação de contratos canônicos exige sempre o tripé: **prompts + testes + plans committed**. Tests e prompts podem ambos estar desatualizados em relação ao plan. Adicionar ao processo de qualquer fix futuro nesta área.

### Escolha de granularidade

Decidido com o usuário em sessão: **cluster único** (este briefing) ao invés de 3 ou 5 briefings separados, porque as falhas compartilham raiz comum **confirmada por investigação**: drift entre o que o framework promete (no source, nos prompts canônicos, na CLI atual) e o que ele entrega (no template publicado, nas instruções incompletas dos agent files, nas conexões CLI/agent ausentes). Trade-off aceito: se o `@product` decidir splitar no PRD, F5 deve sair primeiro como hotfix (resolve sozinho boa parte do F4), e F2/F3/F1 podem ser frente separada.

## Themes

### Theme 1 — Migração SDLC `981a8fd` incompleta (F5 = F4 + drift, severidade catastrófica)

**Causa-raiz canônica.** O commit `981a8fd` (2026-04-24, v1.9.0) documentou + implementou parcialmente a decisão "@pm owns implementation-plan-{slug}.md em MEDIUM" (`.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md`, AC-SDLC-15). Mas só workspace `.aioson/agents/pm.md` foi atualizado — template, teste, e arquivos candidatos no plan (artifact-map, handoff-contract, artifact-validate) ficaram para trás.

O bug observado em `aioson-com` (deadlock /pm porque template diz "do not produce") é consequência direta dessa migração incompleta. O `/architect` que roteou para `/pm` agiu corretamente per AC-SDLC-15. O `/pm` que recusou agiu corretamente per seu prompt template (legacy). Não há contradição "filosófica" — só implementação inacabada.

Trabalho concreto:
- Propagar workspace pm.md → template pm.md
- Atualizar `agent-runtime-alignment.test.js:32-51` para tokens do contrato pós-`981a8fd`
- Auditar e atualizar: `.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`, `src/handoff-contract.js`, `src/commands/artifact-validate.js`
- Verificar os outros 3 arquivos divergentes (`orchestrator.md`, `briefing.md`, `discover.md`) — provavelmente também são gaps da mesma migração

### Theme 2 — Workflow pointer não avança (F2, severidade alta — bloqueia auto-roteamento)

Confirmado: só `dev.md:259` e `qa.md:394, 401` no template instruem `workflow:next --complete`. Demais agent files chamam só `agent:done`, que (`src/commands/runtime.js:1173-1250`) é puramente telemetria — não avança o pointer.

Pointer fica travado no primeiro agente que termina sem emitir o sinal correto. No caso reportado, ficou em `[>] @analyst` mesmo com requirements/spec/architecture/ui-spec em disco — porque `analyst.md` não tem a instrução.

Trade-off central a decidir no PRD: corrigir nos 20+ agent files (frágil — qualquer agente futuro pode esquecer) ou centralizar em `agent:done` (mais robusto — só não funciona quando `agent:done` não é chamado, mas todos chamam). Recomendação primária: centralizar.

Este theme é **independente da migração 981a8fd** — é gap separado a tratar.

### Theme 3 — `/analyst` recomenda `/dev` sem checar manifest (F3, severidade média)

Hipótese ainda **não confirmada por evidência direta**. Capturar output literal do `/analyst` em `aioson-com` antes de decidir. Se confirmado, padrão pode estar presente em vários agent files que têm "Next step" estático no rodapé. Auditoria sistemática recomendada.

Pode ter relação com Theme 1 (`/analyst.md` em template pode estar também não atualizado para roteamento correto pós-`981a8fd`).

### Theme 4 — Stale `dev-state.md` cleanup/detection (F1, severidade média)

Investigação confirmou path correto (per-project via `src/commands/state-save.js:138`). O "cross-project leak" reportado em `aioson-com` foi arquivo legado/órfão. `preflight.js:72` tem `detectStaleDevState` mas só warning.

Não é sev1. Gap de UX (warning ao invés de cleanup), mas não corrompe estado entre projetos via código.

### Theme 5 — Tripé de verificação: prompts + testes + plans committed (meta-aprendizado)

**Tema meta extraído desta investigação.** Durante este briefing, duas hipóteses sobre F5 foram propostas e descartadas porque cada uma cruzava apenas com 2 dos 3 vértices do tripé:

1. **Hipótese 1** (apenas prompts comparados): "source novo, template velho — copiar source → template" → bloqueada pelo teste, rejeitada como "errada".
2. **Hipótese 2** (prompts + tests): "teste protege contrato canônico, source é working draft" → coerente até cruzar com o `plan-implementation-plan-ownership.md` que invalida o teste como obsoleto.
3. **Verdade** (prompts + tests + plan committed): migração incompleta — tanto template quanto teste estão atrasados, source tem o contrato canônico correto.

Sugere adicionar protocolo: **antes de qualquer fix em contratos de framework, cruzar prompts + tests + `.aioson/plans/**/plan-*.md` committed**. Em projetos com SDD documentado, plans são ground truth — testes podem estar desatualizados em relação a eles.

### Theme 6 — Confiança no dogfooding como sinal de qualidade (meta, possível out-of-scope deste briefing)

Tema meta acionável separadamente: **cinco** falhas só apareceram em uso real pós-release, não em teste interno. Sugere que o teste de pré-release para v1.9.2 não inclui "rodar a cadeia inteira ponta-a-ponta em projeto greenfield (vindo via `aioson setup`, não via source)". F5 em particular é catastrófico para qualquer novo usuário tentando feature MEDIUM — qualquer smoke test rodando o pipeline completo via `npm pack` + `aioson setup` em fixture greenfield pegaria isso.

## Risks

- **Risco de F5/T1 bloquear toda nova feature MEDIUM hoje:** enquanto template `pm.md` + teste + arquivos candidatos do plan estiverem desatualizados, qualquer usuário em 1.9.2 esbarra no deadlock visto em `aioson-com`. **Severidade catastrófica para novos usuários.** Mitigação imediata: hotfix v1.9.3 cobrindo a migração `981a8fd` por inteiro (template pm.md, teste de alignment, candidatos listados no plan). Mitigação estrutural: CI guard.
- **Risco de hotfix novamente incompleto:** se v1.9.3 propagar apenas template (e não o teste + candidatos do plan), o ciclo se repete. Mitigação: tratar o plan `plan-implementation-plan-ownership.md` como checklist literal — verificar cada arquivo listado nele, validar com `npm test` antes do commit. **Lição da @deyvin abortada nesta sessão deve estar registrada no PRD.**
- **Risco de outras migrações terem o mesmo problema:** `981a8fd` é uma feature do SDLC upgrade. Outros plans em `.aioson/plans/sdlc-process-upgrade/` ou `.aioson/plans/` (e arquivados em `.aioson/context/done/`) podem ter casos análogos onde implementação ficou parcial. Mitigação: auditoria sistemática de "plans committed vs estado atual" como item de research, possivelmente em briefing separado.
- **Risco de quebra de release recente:** v1.9.2 acabou de sair. F5 catastrófico vira candidato direto a v1.9.3 hotfix. Mitigação: priorizar repro testável + completude do hotfix (não apenas pm.md isolado) antes do publish.
- **Risco de escopo creep no F2:** corrigir emissão de pointer pode revelar que múltiplos pontos da CLI precisam ser tocados. Mitigação: manter o briefing focado em sinais entre agentes, não em refactor do state machine inteiro. F2 é frente separada de T1.
- **Risco de dogfood loop infinito:** corrigir essas falhas usando a própria cadeia AIOSON em `aioson` source — e a cadeia tem essas falhas. Mitigação: SMALL/MICRO via `/deyvin` direto, evitando cadeia completa até F2 corrigido.
- **Risco de regressão silenciosa:** sem teste automatizado para "cadeia ponta-a-ponta" + guard estrutural de drift, próxima release introduz regressão de novo. Mitigação: smoke test + estender `sync-agents-preflight.js` para detectar divergência semântica, não só `## Feature dossier` length.
- **Risco de fix superficial em F3:** corrigir só `/analyst.md` deixa outros agentes com mesmo padrão. Mitigação: revisar todos os agent prompts em uma passada.
- **Risco de teste `agent-runtime-alignment.test.js` ainda enganar outros agentes:** o teste continua "verde" mas asserta contrato obsoleto — futuras alterações em outros agent prompts podem confiar nele e ficar com contrato errado. Mitigação: atualizar o teste agora junto com template pm.md; verificar se outros testes na mesma família têm o mesmo problema.

## Identified gaps

**Resolvidos nesta sessão (mantidos para histórico):**

- **G6 → resolvido:** `dev-state.md` é escrito em `path.join(contextDir(targetDir), 'dev-state.md')` (`src/commands/state-save.js:138`) — per-project. Conteúdo cross-project em `aioson-com` é arquivo órfão/legado, não bug de escrita.
- **G8 → resolvido:** Gate C foi introduzido no commit `981a8fd` em 2026-04-24 (v1.9.0). Deliberado, não regressão. A inconsistência observada vem de F5 (template lagueado), não de Gate C ter sido adicionado errado.

**Ainda abertos:**

- **G1:** Output literal do `/analyst` que recomendou `/dev` — sem isso F3 continua hipótese, não evidência.
- **G2:** Output literal do `/sheldon` — confirma se deixou DDs sinalizados ou se falhou em alertar.
- **G3:** `aioson workflow:status` atual de `aioson-com` pós-recusa do `/dev` — saber se o pointer foi mexido depois.
- **G4:** Confirmar via `aioson --version` que `aioson-com` está realmente em 1.9.2.
- **G5:** O `briefing.md` referencia `.aioson/skills/static/web-research-cache.md` e `.aioson/skills/process/aioson-spec-driven/references/hardening-lane.md` — não encontrados em disco. Possível gap adicional no template (alinhado com F5).
- **G7:** Trace mostra `Tool: codex` em `aioson-com`. Cadeia rodou em Codex e não em Claude Code? Pode afetar caminho de emissão de sinais.
- **G9:** Skill `aioson-spec-driven` tem instrução canônica sobre ownership de `implementation-plan-{slug}.md`? Se sim, deve ser ground truth para alinhar agent files; se não, gap adicional.
- **G10:** A migração `981a8fd` se manifesta como gap em outros artefatos canônicos além dos 4 agent files já mapeados? Auditoria sistemática dos arquivos candidatos listados no `plan-implementation-plan-ownership.md` pendente: `artifact-map.md`, `handoff-contract.js`, `artifact-validate.js`.
- **G11 (resolvido nesta sessão):** `discover.md` divergente — inspecionado: source tem 1 linha extra sobre `done/MANIFEST.md`. Mesma feature do `briefing.md` diff. Baixa severidade, mas é mais um sintoma da mesma classe de migração incompleta (mudança feita em workspace, não propagada).
- **G12 (F4 resíduo):** `manifests/dev.manifest.json` com `required: false` enquanto Gate C exige. Inconsistência ou camadas diferentes (manifest = o que `@dev` LÊ; gate = o que precisa EXISTIR)? Verificar — pode ser interpretação válida.
- **G13 (novo):** O `sync-agents-preflight.js` (introduzido em `ca15f55`) só checa `## Feature dossier` length para detectar drift. Não pega divergência semântica em outras seções. Lacuna estrutural — qualquer mudança no template fora de Feature dossier passa silenciosamente.
- **G14 (novo):** Outras migrações em `.aioson/plans/` podem ter o mesmo problema de implementação parcial (especialmente sdlc-process-upgrade tem mais arquivos: `plan-gates-and-approval-ux.md`, `implementation-plan-sdlc-process-upgrade.md`). Auditoria por amostragem recomendada.

## Sources

- Trace literal do `/dev` em `aioson-com` colado pelo usuário em sessão de 2026-05-19 — inclui saída de `aioson workflow:status`, `aioson context:validate`, `aioson preflight --agent=dev --feature=tutorials-react-migration`, `aioson memory:status`, e a recusa de implementação com os 4 bloqueios numerados (incluindo "Drift no workflow state").
- `.aioson/briefings/config.md` no source `aioson` — usado para confirmar que este é um cluster novo, distinto de `agent-chain-continuity-delivery-fix` (que foi scope-cut para MICRO sobre upstream de `dev-state.md`; este briefing inclui ESSE bug mas amplia para o cluster inteiro).
- `.aioson/agents/briefing.md` no source `aioson` — inspeção mostra que ele só emite `aioson agent:done`, não `aioson workflow:next --complete=briefing` (evidência circunstancial para F2).
- Trace literal do `/architect` → `/pm` em `aioson-com` colado pelo usuário em 2026-05-19 — `/architect` reconheceu DD-01/02/03 e roteou para `/pm`; `/pm` recusou produzir `implementation-plan-{slug}.md` citando seu próprio prompt + o de `/dev`, em conflito com `aioson gate:check` (Gate C BLOCKED). Trigger original de F4 (depois recategorizado como sintoma de F5).
- **Auditoria de código nesta sessão (2026-05-19) — Explore agent + verificação manual:**
  - `template/.aioson/agents/dev.md:259` e `qa.md:394, 401` — únicos agentes do template que instruem `workflow:next --complete=<self>`. Resolução de Q2.
  - `src/commands/runtime.js:1173-1250` (função `runAgentDone`) — confirma que `agent:done` só registra eventos SQLite, não chama `workflow:next`. Resolução de Q3.
  - `.aioson/agents/pm.md:74` (source) e `template/.aioson/agents/pm.md:74` (template) — dizem o **oposto** sobre ownership de `implementation-plan-{slug}.md`. Resolução de Q15 + descoberta de F5.
  - Commit `981a8fd` (2026-04-24, v1.9.0) — `feat(sdlc): implement process upgrade with gates and handoff` introduziu Gate C como requisito. Resolução de Q16.
  - `src/commands/state-save.js:138` — `dev-state.md` escrito em `path.join(contextDir(targetDir), 'dev-state.md')`, per-project. Resolução parcial de F1.
  - `diff template/.aioson/agents/*.md .aioson/agents/*.md` — 4 arquivos divergentes: `pm.md` (catastrófico), `orchestrator.md` (alto), `briefing.md` (baixo), `discover.md` (baixo, mesma feature done/MANIFEST.md do briefing.md).
- **Sessão @deyvin (2026-05-19) com hotfix abortado** — tentativa de copiar source → template foi bloqueada por `tests/agent-runtime-alignment.test.js:32`. Revertida via `git restore` sem commit. Levou à descoberta de que o teste é obsoleto, não guardião.
- **Sessão @briefing-v2 (2026-05-19) com git archaeology:**
  - `git log -10 -- .aioson/agents/pm.md` vs `template/.aioson/agents/pm.md` mostrou históricos diferentes — workspace tem `981a8fd` (sdlc upgrade) na história, template não tem.
  - `git show 981a8fd --stat` confirma que o commit alterou `.aioson/agents/pm.md` mas não `template/.aioson/agents/pm.md`.
  - `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` (committed em `981a8fd`) é o **ground truth canônico** — declara `@pm` como owner, lista AC-SDLC-15 a AC-SDLC-18, lista arquivos candidatos a atualizar.
  - `ca15f55` (Phase 4 agent-chain-continuity) tentou sincronizar template ↔ workspace mas só sincronizou seção `## Feature dossier`; pm.md ficou desalinhado.
  - `tests/agent-runtime-alignment.test.js` último touch em `8ac092f` — anterior a `981a8fd`, portanto asserta tokens do contrato pré-upgrade.
- Nenhuma pesquisa web realizada. Budget de 4 queries preservado.

## Open questions

**Resolvidas nesta sessão (mantidas para histórico):**

- ~~Q1 (F1 path)~~ → resolvido: per-project em `src/commands/state-save.js:138`. Reclassificado como stale cleanup.
- ~~Q2 (workflow:next em agentes)~~ → resolvido: só `dev.md` e `qa.md` no template instruem.
- ~~Q3 (agent:done avança pointer?)~~ → resolvido: NÃO (`runtime.js:1173-1250` — só telemetria).
- ~~Q15 (audit ownership)~~ → resolvido com ground truth: `plan-implementation-plan-ownership.md` declara `@pm` como owner; AC-SDLC-15 explícito.
- ~~Q16 (quando Gate C entrou)~~ → resolvido: v1.9.0, commit `981a8fd`, 2026-04-24.
- ~~Q F5-original-decisão (template canônico vs source canônico)~~ → resolvido: **NENHUM dos dois é "canônico" — `plan-*.md` committed é**. Source tem o contrato canônico atual; template+teste estão obsoletos por migração incompleta.
- ~~Q F4-decisão (qual dos 4 caminhos)~~ → resolvido: caminho (a) já documentado no plan committed — `@pm` é owner. Não é decisão pendente, é implementação a completar.

**Ainda abertas:**

1. **[research-able]** Auditar arquivos candidatos listados em `plan-implementation-plan-ownership.md`: `artifact-map.md`, `handoff-contract.js`, `artifact-validate.js` — confirmar se cada um já reflete AC-SDLC-15 ou se também ficou na migração incompleta. Resolve em 1-2h.
2. **[research-able]** Verificar se o `## Feature dossier` (alvo do `sync-agents-preflight.js`) é o ÚNICO check de drift, ou se há outros. Se for único, propor estender para divergência semântica geral.
3. **[research-able]** Verificar se outros plans em `.aioson/plans/` ou `.aioson/context/done/` têm migrações similarmente incompletas. Auditoria sistemática. Pode virar briefing meta separado.
4. **[decision-required]** F2 — Modelo declarativo (instrução em cada agent file) vs imperativo (auto-emissão em `agent:done`). Pertence a `@architect`. Recomendação: imperativo.
5. **[decision-required]** F3 — Checagem no prompt do `/analyst.md`, validação na CLI, ou ambos? Pertence a `@architect`. Recomendação: ambos.
6. **[decision-required]** Hotfix v1.9.3 deve cobrir só pm.md+test (mínimo viável) ou todos os 4 arquivos divergentes + arquivos candidatos do plan (máximo seguro)? Recomendação: máximo seguro, mas com a regra "1 PR = 1 migração completada" para evitar mais incompletude.
7. **[research-able]** Capturar output literal do `/analyst` em `aioson-com` (G1).
8. **[research-able]** Capturar output literal do `/sheldon` (G2).
9. **[research-able]** Versão da CLI em `aioson-com` (G4).
10. **[research-able]** Cadeia rodada em Codex ou Claude Code (G7).
11. **[research-able]** `manifests/dev.manifest.json` com `required: false` vs Gate C exigindo (G12) — inconsistência ou camadas diferentes?
12. **[testable]** Repro: `npm pack` no source, `aioson setup` em fixture greenfield, executar `/briefing → /product → /sheldon → /architect → /pm` MEDIUM e verificar se `/pm` recusa por causa do template defasado. Se sim → hotfix v1.9.3 obrigatório.
13. **[testable]** Smoke test pós-fix: cadeia ponta-a-ponta em fixture greenfield deve chegar em `[>] @dev` sem drift e sem Gate bloqueado. Candidato a CI gate antes de `npm publish`.
14. **[testable]** Após hotfix v1.9.3, `tests/agent-runtime-alignment.test.js:32` deve assertar os novos tokens (`## MEDIUM implementation plan (mandatory output for MEDIUM)`, `MUST produce`). Test update precisa estar no MESMO PR do template update.
15. **[out-of-scope]** Theme 6 (dogfood gate no release process) — capturar como briefing separado se decidido continuar.
16. **[decision-required]** Aprovar este briefing exige resolver Q1-Q3 (research) antes? **Recomendação: não** — pesquisa pertence ao @product/architect no PRD, briefing deve seguir.

## Relação com briefings anteriores

- **`agent-chain-continuity-delivery-fix`** (approved, 2026-05-16, scope-cut para MICRO): trata especificamente do upstream producer do `dev-state.md`. Este briefing **inclui esse bug como F1** e amplia para o cluster inteiro (F1 + F2 + F3). Se este briefing for aprovado, o MICRO follow-up de `agent-chain-continuity` deve ser absorvido aqui — evita trabalho duplicado.
- **`cursor3-harness-evolution`** (documented-only, 2026-05-18): não tem relação direta, mas o "framework envy explicitly rejected" reforça a tese de que o caminho certo é endurecer auto-orquestração própria (este briefing), não copiar arquiteturas externas.
