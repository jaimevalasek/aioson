---
slug: agent-chain-continuity-delivery-fix
created_at: 2026-05-16
updated_at: 2026-05-16
source_plans: ["conversational — seed from @dev diagnostic session 2026-05-16 (task-dev-1778959550617)"]
---

# Briefing — Agent-Chain Continuity: Delivery Fix

## Context

AIOSON v1.9.0 está publicado. Duas features anteriores prometeram fluidez na cadeia de agentes:

- **`feature-dossier`** (2026-04-28) — introduziu o conceito de dossier vivo como ponte entre agentes
- **`agent-chain-continuity`** (2026-05-07) — implementou os comandos e contratos que tornariam a cadeia auto-sustentável: `dev-resume.js`, `src/handoff-contract.js`, reforma de `workflow-next.js`, dossier auto-init, `dev-state.md` no contrato de @dev

O código foi mergeado, testado (`tests/dev-resume.test.js`, `tests/agent-chain-continuity.regression.test.js`, `tests/handoff-contract-micro.test.js`, `tests/state-save.test.js`), e arquivado em `.aioson/context/done/agent-chain-continuity/`.

Hoje (2026-05-16), durante a feature `lay-user-agent-mode` que estava em fluxo `@briefing → @product → @sheldon → @analyst → /clear → @dev`, o handoff quebrou. O usuário ativou `@dev` esperando que ele detectasse o estado e arrancasse na implementação. Em vez disso, `@dev` caiu em cold start, o preflight bloqueou ("implementation-plan missing"), e quando o agente tentou se recuperar chamando `aioson dev:resume-data .`, o CLI instalado retornou "Unknown command".

A sessão `@dev` produziu um diagnóstico de 4 bugs raiz e fez handoff explícito para este briefing.

## Problem

**JTBD frame:**
> "Quando rodo `@briefing → @product → @analyst → /clear → @dev` numa feature AIOSON, quero que `@dev` arranque sozinho no `next_step` com o context package certo — para a cadeia funcionar como cadeia em vez de exigir que eu reconstrua o estado manualmente em cada nova sessão."

**Sintomas pinados (evidência concreta na sessão @dev de 2026-05-16):**

1. **CLI instalado está atrás do source** — `dev:resume-data` existe em `src/cli.js:606,1340` e em `src/commands/dev-resume.js`, mas `aioson` no PATH (resolvido para `@jaimevalasek/aioson`) não conhece o comando. `node bin/aioson.js dev:resume-data .` funciona, `aioson dev:resume-data .` falha. **A v1.9.0 publicada não inclui os comandos do continuity.**

2. **Nenhum agente upstream escreve `dev-state.md`** — `.aioson/agents/dev.md:42-49` instrui `@dev` a ler esse arquivo como entrada canônica. Grep em todos os 17 agentes encontra zero produtores. O contrato é unilateral: existe consumidor, não existe produtor.

3. **`workflow.state.json` é gravado uma vez e nunca mais** — Estado atual: `completed: ["product"], next: "analyst"`. Trilha real do dossier mostra `@sheldon` (19:01:36) e `@analyst` (19:08:39) já tendo rodado, mas o `updatedAt` está em `19:03:38` e `completed` não foi atualizado. **Nenhum agente upstream chama `aioson workflow:next . --complete=<agent>` no fim**, embora `dev.md:256-258` instrua `@dev` a fazê-lo.

4. **Classification split-brain** — `project.context.md:7` diz `MEDIUM`. `workflow.state.json:4` diz `SMALL`. `aioson workflow:status` lê o state (SMALL). `aioson preflight --agent=dev` lê o context (MEDIUM). Decisões caem em ambos os lados: `@sheldon` operou modo SMALL (sem `manifest.md`), preflight de `@dev` exigiu artefatos MEDIUM.

**Padrão recorrente:** o dossier de `agent-chain-continuity` tem `## What — _(não encontrado — preencher manualmente)_`. O dossier de `lay-user-agent-mode` (criado 9 dias depois) tem o mesmo placeholder. Esse mesmo bug já estava lá no continuity e não foi pego.

## Proposed solution

Quatro trilhas — três corrigem bugs delivery, uma adiciona guard contra regressão:

**Trilha A — CLI publish + 1.10.0 release**
- Bump `package.json` 1.9.0 → 1.10.0 (continuity introduziu comandos públicos novos; sem-breaking para projetos sem AIOSON instalado, mas comandos novos = minor)
- `npm publish` do scoped `@jaimevalasek/aioson`
- Critério de aceitação: `aioson dev:resume-data .` funciona em projeto fresh-installed da v1.10.0
- Pre-publish: `npm test` precisa passar (já configurado? — open question)

**Trilha B — Produtor de `dev-state.md` e `last-handoff.json`**
- Mecanismo a definir (@architect decide): comando CLI dedicado (`aioson dev:state:write`) que cada agente upstream invoca, OU pós-processo automático em `aioson agent:done` quando o próximo agente é `@dev`
- Conteúdo do `dev-state.md`: `feature_slug`, `next_step`, `context_package` (2-4 arquivos), `sheldon_plan` (path ou null)
- `last-handoff.json`: `from`, `to`, `what_was_done`, `what_comes_next`, `open_decisions`, `feature_slug`, `classification`
- Aplica a `@analyst`, `@sheldon`, `@architect`, `@ux-ui` (qualquer agente que entregue para `@dev`)

**Trilha C — `workflow:next --complete=<agent>` em todos os kernels upstream**
- Adicionar instrução em `Observability` ou seção equivalente nos kernels de `@product`, `@analyst`, `@sheldon`, `@architect`, `@ux-ui`, `@qa`, `@briefing`
- Padrão já existe em `@dev` (`dev.md:256-258`) — replicar
- Não confiar só em prompt: validar via test (`tests/agent-chain-continuity.regression.test.js` é o lugar natural)

**Trilha D — Classification single-source-of-truth**
- `project.context.md` precedence
- `workflow:plan` revalida classification ao operar; se `workflow.state.json` diverge, corrige (ou avisa, decisão da feature)
- `aioson doctor` detecta divergência como warning
- Migration path para projetos com estado já divergente: doctor:fix opcional

## Themes

### Theme 1 — CLI publish drift (Trilha A)
O bug mais visível e o mais barato de corrigir mecanicamente, mas o que tem maior blast radius porque desbloqueia tudo. Inclui também ritual de release (smoke teste, changelog, npm tag). Decisão sobre versionamento (1.10.0 vs 2.0.0) é uma open question — argumentos para minor: comandos novos sem breaking; para major: contrato de handoff agora é obrigatório (era opcional na v1.9.0).

### Theme 2 — Produtor de dev-state.md / last-handoff.json (Trilha B)
Núcleo técnico da feature. Decisão central: onde mora a lógica de "agente X terminou, escrever dev-state pro próximo"? Hipóteses:
- **CLI dedicado** (`aioson dev:state:write --from=analyst --feature=<slug> --next-step=<text>`): explícito, testável, cada agente invoca no kernel
- **Hook em `agent:done`**: zero edição de kernel, mas magic; precisa lógica para detectar "próximo agente é @dev"
- **`workflow:next --complete=<agent>` produz como side-effect**: une trilhas B e C, menos comandos pra memorizar

Recomendação inicial para `@architect` avaliar: opção 3 (unifica), com fallback para opção 1 se complexidade explodir.

### Theme 3 — Workflow state machine em todos os kernels (Trilha C)
Trabalho mecânico mas com pegadinha: cada agente tem seção própria de "Observability" / "Session end" / "Auto-orchestração" com fraseado diferente. Padronizar via skill (`.aioson/skills/process/workflow-handoff-discipline/SKILL.md`?) ou via edit individual. Skill ganha em manutenção (uma fonte de verdade), edit individual ganha em token budget (cada kernel já tá cheio).

### Theme 4 — Classification SSOT (Trilha D)
Menor escopo técnico mas com semântica delicada: `workflow.state.json` é o "estado real" da sessão, `project.context.md` é "intenção declarada". Quando divergem, quem ganha? Recomendação: `project.context.md` ganha em criação, mas `workflow:plan` pode reescrever ambos via override explícito do usuário. Doctor reporta divergência como warning, não error.

### Theme 5 — Dossier `## What` auto-update (bug recorrente)
Aparece em 3 features consecutivas (`feature-dossier`, `continuity`, `lay-user-agent-mode`). O dossier é criado por `dossier-init` antes do PRD existir, e nunca atualiza. Hipótese: hook que detecta `prd-{slug}.md` aparecendo e re-extrai a seção `## Escopo` para o `## What` do dossier. Pode ficar com `@product` ou ser comando CLI standalone (`aioson dossier:refresh-what --feature=<slug>`).

## Risks

**Cagan — escopo reduzido (Feasibility + Viability) conforme decisão:**

**Feasibility (dá pra construir?):**
- **Inception risk: o framework consertando o que ele mesmo quebrou.** Se uma das trilhas introduz regressão no `@dev`, fica difícil consertar o `@dev` usando o `@dev`. Mitigação: testes unitários (já existem para a maioria dos comandos), rollback via `git revert`, smoke test em sandbox antes do publish.
- **Token budget dos kernels** — agentes foram rebudgetados em 2026-05-14 para 20000 bytes (mesmo evento do briefing `lay-user-agent-mode`). Adicionar "chame `workflow:next --complete` no final" é texto barato (~100 bytes). Mas adicionar lógica de produzir `dev-state.md` no kernel é mais pesado. **Mitigação:** se a Trilha B virar comando CLI dedicado, o kernel só precisa de uma linha — budget seguro.
- **Risco de descobrir code path inconsistente do continuity.** `handoff-contract.js` define o schema. Os agentes upstream nunca foram instruídos a preenchê-lo. Possível que campos obrigatórios no schema gerem erros de validação quando os agentes começarem a escrever. **Mitigação:** rodar `tests/handoff-contract-*.test.js` cedo e validar com fixtures.
- **Migration de estado existente** — projetos com `workflow.state.json` SMALL e `project.context.md` MEDIUM precisam de path de correção. `aioson doctor --fix` é o lugar natural mas precisa ser não-destrutivo. **Mitigação:** doctor reporta primeiro, fix é opt-in com `--fix`.

**Viability (P&L, legal, suporte, marca?):**
- **Marca/posicionamento:** zero impacto externo direto. Mas a fluidez funcionando publicamente ("activei `/dev` e ele continuou de onde parou") é um diferencial demonstrável de AIOSON vs concorrentes que dependem do usuário re-explicar contexto. Publicar 1.10.0 com release notes claros sobre isso é alavanca de marca.
- **Suporte:** cada release nova traz risco de issue. Mas a release atual **já está quebrada na fluidez** — não publicar não é opção. Risco baixo, e a janela de exposição (entre publish e patch) é proporcional à cobertura de teste.
- **Custo de não fazer:** `agent-chain-continuity` foi entregue há 9 dias e o framework opera no modo "código merece confiança mas execução não". Para AIOSON em inception mode (construindo a si mesmo) isso vira friction crescente — toda nova feature interna vai bater nesse mesmo bug. Para usuários externos: cada projeto que rodar `aioson setup` na v1.9.0 começa com kernel referenciando comandos que ele não tem. **Custo alto se o projeto continuar crescendo sem fix.**

## Identified gaps

Lacunas que o briefing não fecha — ficam para `/product` (PRD) ou para validação prévia:

1. **Versionamento da release** — bump pra 1.10.0 (minor, comandos novos) ou 2.0.0 (major, contrato de handoff agora obrigatório)? Decisão de release strategy, não-técnica.

2. **Mecanismo do produtor de dev-state.md** — comando CLI dedicado, hook em `agent:done`, ou side-effect de `workflow:next --complete`? `@architect` precisa avaliar trade-offs de testabilidade × manutenção × token budget dos kernels.

3. **Pre-publish validation** — qual é o release flow atual? `package.json` scripts já fazem `npm test` antes de publish? Smoke em sandbox? Não verificado neste briefing.

4. **Doctor check de drift agent-prompt-vs-published-CLI** — vale como guard automático contra a regressão da Trilha A se repetir? Maior escopo na feature; pode ficar como follow-up MICRO.

5. **Migration de instâncias com estado divergente** — `workflow.state.json` SMALL + `project.context.md` MEDIUM precisam de path de fix. Doctor:fix é o lugar natural mas semântica precisa ser definida (qual fonte ganha?).

6. **Skill `workflow-handoff-discipline` ou edit individual** — Theme 3 tem duas vias. Decisão de @architect ou @product? Skill tem precedente em `decision-presentation-for-non-tech` (lay-user-agent-mode).

7. **Validação pós-fix** — como provar que a fluidez voltou? Sugestão: feature MICRO sintética rodada end-to-end (`@product → @analyst → @dev`) e verificar que `@dev` arranca sem cold start. Provavelmente vira critério de aceitação no PRD.

8. **Relação com `aioson briefing:approve` faltando** — `lay-user-agent-mode` foi aprovado por edit manual de `config.md` porque o comando CLI não existe (registrado em `approval_note`). Comando ausente é parte do mesmo padrão do bug A. Incluir nesta feature ou follow-up?

## Sources

Arquivos consultados durante esta sessão (sem web research — diagnóstico do @dev já mapeou exaustivamente):

- `.aioson/agents/dev.md` — linhas 42-49 (contrato dev-state.md), 110-116 (Sheldon phased plan), 143-145 (dev:resume-data), 256-258 (workflow:next --complete)
- `.aioson/agents/briefing.md` — kernel deste agente
- `.aioson/context/done/MANIFEST.md` — confirma sequência feature-dossier (2026-04-28) → agent-chain-continuity (2026-05-07)
- `.aioson/context/done/agent-chain-continuity/dossier/dossier.md` — feature predecessora; identifica delivery gaps já registrados pelo próprio dossier
- `.aioson/context/workflow.state.json` — evidência do split-brain SMALL
- `.aioson/context/project.context.md` — linha 7 evidência do classification MEDIUM
- `.aioson/context/features/lay-user-agent-mode/dossier.md` — confirma trilha @briefing → @sheldon → @analyst rodaram (timestamps 18:38, 19:01, 19:08) mas workflow.state.json congelou em 19:03
- `.aioson/plans/lay-user-agent-mode/progress.json` — confirma Sheldon plan initialized sem manifest.md
- `src/cli.js:606,1340` — dispatcher de `dev:resume-data` registrado
- `src/commands/dev-resume.js` + `src/lib/dev-resume.js` — implementação existe
- `package.json` — version 1.9.0 declarada
- `node bin/aioson.js dev:resume-data .` → "No in-progress feature detected — cold start." (source funciona)
- `aioson dev:resume-data .` (PATH = `@jaimevalasek/aioson` v1.9.0 installed) → "Unknown command" (publicado quebrado)
- Sessão @dev archivada: `task-dev-1778959550617` / `run dev-1778959550626`

No web research conducted in this session.

## Open questions

Classificadas conforme protocolo `@briefing`:

1. `[decision-required]` Versionamento da release: **1.10.0** (comandos novos, sem-breaking) ou **2.0.0** (contrato de handoff agora obrigatório, semver argumenta breaking)? Recomendação: 1.10.0 — instalações antigas continuam funcionando, projetos novos ganham fluidez.

2. `[decision-required]` Mecanismo do produtor de `dev-state.md`: **comando CLI dedicado** (`aioson dev:state:write`), **hook em `agent:done`** (magic mas zero edit de kernel), ou **side-effect de `workflow:next --complete`** (unifica trilhas B+C)? Recomendação: avaliar com `@architect` na Discovery.

3. `[decision-required]` Doctor check de drift agent-prompt-vs-published-CLI: **in scope** desta feature (guard contra regressão) ou **follow-up MICRO**? Recomendação: in scope — barato e ataca a raiz do Bug 1 a longo prazo.

4. `[decision-required]` Classification migration em projetos com estado já divergente: **auto-fix** silencioso ao detectar, **warn no doctor** apenas, ou **`--fix` opt-in**? Recomendação: warn + `--fix` opt-in. Semântica fica para PRD.

5. `[research-able]` Release flow atual: `npm test` antes do publish? Smoke em sandbox? Pre/post hooks no `package.json`? Estimativa: 30 min, verificar `package.json` + scripts de release.

6. `[decision-required]` Dossier `## What` auto-update: **hook ao criar `prd-{slug}.md`**, **comando standalone `aioson dossier:refresh-what`**, ou **responsabilidade de `@product`** no kernel? Recomendação: hook automático — bug recorrente em 3 features merece deterministic fix.

7. `[testable]` Validação end-to-end: rodar feature MICRO sintética pelo workflow completo após implementação e medir se `@dev` arranca sem cold start. Estimativa: 1 dia de QA dedicado.

8. `[decision-required]` Skill `workflow-handoff-discipline` (Theme 3): criar skill compartilhada ou edit individual dos 7 kernels? Recomendação: skill — mesma lógica do `decision-presentation-for-non-tech` (lay-user-agent-mode). Mantém kernel slim.

9. `[decision-required]` `aioson briefing:approve` faltando (referenciado em `briefing.md:262` e ausente no CLI): **incluir nesta feature** (mesma família de bug) ou **follow-up MICRO**? Recomendação: follow-up MICRO — escopo já está apertado.

10. `[out-of-scope]` Migração de projetos terceiros usando AIOSON instalado com estado já quebrado: nossa responsabilidade ou do usuário do framework? Fora desta feature; doc no release notes da 1.10.0 é suficiente.

11. `[out-of-scope]` Continuidade do `lay-user-agent-mode`: feature em pausa até esta entregar. Não incluir trabalho de lay-user neste briefing.
