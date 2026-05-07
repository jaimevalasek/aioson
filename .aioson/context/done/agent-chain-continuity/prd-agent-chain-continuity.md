---
feature_slug: agent-chain-continuity
status: draft
created_by: product
created_at: 2026-05-07
classification: MEDIUM
briefing_source: null
---

# PRD — Agent Chain Continuity

## Vision

Toda feature SMALL/MEDIUM nasce com um **dossier vivo auto-inicializado** que toda a cadeia de agentes (`@product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa`) escreve e consulta — transformando o processo de implementação em algo **consciente**: o `@dev` sabe exatamente onde retomar, o que já foi feito, o que `@sheldon` pesquisou em código e na web, e detecta quando algo do plano foi esquecido ou modificado durante a execução.

## Problem

A `feature-dossier` (entregue 2026-04-28) implementou a "ponte viva" entre agentes — código + testes + spec — mas três falhas de delivery deixaram-na **dormente**:

1. MVP integrou só 3 dos 8 agentes da cadeia (`@analyst`, `@architect`, `@dev`); `@sheldon` ficou inteiramente fora.
2. `dossier:init` nunca é auto-invocado por `workflow:next` nem por nenhum prompt de agente — mesmo nos 3 integrados, o comportamento é "if present, read it; if absent, legacy".
3. `sync:agents` opera direção `template→workspace`; integrações posteriormente adicionadas em workspace para `@product`, `@orchestrator`, `@pm`, `@ux-ui`, `@qa` não foram propagadas para template — próximo sync wipe-a tudo.

Resultado observável: nenhuma feature pós-`feature-dossier` (incluindo `secure-by-default`, completada 2026-04-29) tem dossier. `@dev` em chat novo retoma só pelo `dev-state.md` — não sabe a lista de artefatos produzidos pela cadeia, não vê pesquisas do `@sheldon` em `researchs/`, não detecta drift entre plano e implementação. Decisões de upstream "viram telefone-sem-fio" exatamente como o PRD original previu — mas não conseguiu corrigir.

## Users

- **Desenvolvedor (usuário principal AIOSON):** quer abrir chat novo no meio de uma feature e ter `@dev` retomando precisamente, citando fase atual, artefatos já produzidos, e plano `@sheldon` referenciado.
- **Agentes da cadeia AIOSON (`@product`, `@sheldon`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`, `@dev`, `@qa`):** precisam de fonte canônica única para ler "o que sabemos até agora" e contribuir com novas descobertas sem perder contexto entre handoffs.

## MVP scope

### Must-have 🔴

- **Auto-init silencioso do dossier no início de toda feature SMALL/MEDIUM.** `workflow:next` (ou hook equivalente) cria `.aioson/context/features/{slug}/dossier.md` na primeira ativação do `@product` para o slug — sem perguntar, sem avisar. `@dev`/agentes downstream sempre encontram dossier presente; comportamento "if absent, legacy flow" deixa de existir para features novas.
- **`@sheldon` integrado à cadeia do dossier.** Seção `## Feature dossier` no prompt de `@sheldon` (template + workspace) instruindo: ao concluir o enriquecimento, registrar entrada em `Agent Trail` com (i) sizing score, (ii) decisão `in-place` ou `phased-plan`, (iii) **link para `.aioson/plans/{slug}/manifest.md`** se houver plano faseado, (iv) **link para cada `researchs/{slug-pesquisa}/summary.md`** consultado ou criado durante a sessão, (v) lista curta de "achados em código" — impedimentos, riscos ou descobertas relevantes que poderiam ser perdidos entre agentes.
- **Cadeia completa em template e workspace, com paridade.** Todos os 8 agentes da cadeia (`@product`, `@sheldon`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`, `@dev`, `@qa`) ganham seção `## Feature dossier` com contrato apropriado por papel, idêntica em `.aioson/agents/` e `template/.aioson/agents/`. `sync:agents` deixa de regredir.
- **`handoff-protocol.json` populado com `artifact_uris`.** A cada `agent:done`, o handoff registra paths de artefatos produzidos pelo agente que está concluindo. `@dev` em chat novo lê o handoff atual e tem inventário completo dos artefatos da feature ativa.
- **`@dev` retoma com auto-relato em chat novo.** Quando `@dev` ativa em uma feature `in_progress`, o output inicial obrigatório descreve: (i) feature ativa e classificação, (ii) fase em que parou, (iii) lista de artefatos consumidos do dossier + handoff, (iv) próximo passo derivado do plano `@sheldon` ou `dev-state.md`. Sem perguntar nada ao usuário primeiro.
- **`@dev` faz auditoria de drift durante implementação.** Quando `@dev` encontra algo diferente do esperado durante a fase ativa (arquivo já modificado, dependência ausente, comportamento que contradiz o plano), o procedimento é: (i) ler dossier `Code Map`, (ii) ler `.aioson/plans/{slug}/` plano da fase atual, (iii) reportar ao usuário a divergência identificada com referência ao item original, (iv) propor caminho — seguir plano, ajustar plano, ou escalar via `revision:open`. Não improvisar silenciosamente.
- **Retroatividade sob demanda.** `aioson dossier:init . --slug={slug} --from-existing` continua disponível como hoje (já implementado por `feature-dossier`); features `done` não recebem dossier automaticamente, mas o usuário pode disparar manualmente para qualquer slug em `.aioson/context/done/`.

### Should-have 🟡

- **`@sheldon` link bidirecional `researchs/`.** Quando `@sheldon` cria nova entrada em `researchs/{slug-pesquisa}/summary.md`, o frontmatter do summary inclui `feature_slug: {feature-slug}` para permitir agregação reversa (qual feature usou esta pesquisa) — facilita auditoria histórica.
- **Hook de aviso pré-`sync:agents`.** Antes de rodar `rsync template→workspace`, comparar checksums dos 8 agentes da cadeia entre template e workspace; se workspace tem mais conteúdo, abortar com aviso explícito e sugestão de "copiar workspace→template primeiro" — reduz risco de regressão futura.

## Out of scope

- **Auto-detecção de gaps por LLM.** A invocação reversa permanece **modo sugerido**, não automático — `@dev` ou outro agente abre `revision:open` quando detecta drift, mas não há LLM background que escuta tudo e sugere revisões sozinho. (Razão: já decidido no design original do dossier — falsos positivos contaminam.)
- **Migração retroativa em massa de features `done`.** Nenhum job que sintetiza dossier para todas as features completadas no passado. Apenas sob demanda do usuário, slug a slug.
- **UI dashboard para dossier.** Continua só CLI (`dossier:show`, `dossier:add-finding`, `dossier:link-rule`, `revision:list`, etc.). Dashboard externo é projeto separado.
- **Cross-project handoff.** Coberto pelo PRD pausado `cross-project-handoff` (em `chat-sessions/`, não aberto formalmente). Esta feature é single-repo. Cross-project virá depois e usará a continuidade aqui estabelecida como base.
- **Resgate de `brains/` para outros agentes.** `brains/` permanece com a estrutura atual (apenas `site-forge` populado). Expandir brains para mais agentes é decisão à parte, não acoplar a esse PRD.

## User flows

### Fluxo 1 — Nascimento da feature (cadeia completa)

1. Usuário ativa `/aioson:product` para nova feature.
2. `@product` propõe slug, recebe confirmação, **auto-cria** `.aioson/context/features/{slug}/dossier.md` com frontmatter padrão e seções vazias.
3. `@product` escreve PRD canônico em `.aioson/context/prd-{slug}.md` E entrada inicial no dossier (`Why`, `What`, `Agent Trail` linha 1: "@product criou PRD em {data}").
4. Handoff para `@sheldon` registra `prd-{slug}.md` em `handoff-protocol.json.artifact_uris`.
5. `@sheldon` lê dossier antes de qualquer outra coisa, faz enrichment, escreve no `Agent Trail`: sizing, decisão de plano, link para `.aioson/plans/{slug}/manifest.md`, links para `researchs/{slug-pesquisa}/summary.md` consultados ou criados, lista curta de achados em código que devem persistir.
6. Cadeia segue: `@analyst` lê dossier, escreve `Code Map` parcial (entidades+paths) + `Agent Trail`. `@architect` lê dossier, completa `Code Map` (módulos+componentes) + `Agent Trail`. `@ux-ui`/`@pm`/`@orchestrator` análogos.
7. Quando chega em `@dev`, dossier tem o contexto consolidado de toda a cadeia.

### Fluxo 2 — `@dev` retoma em chat novo (a dor que motivou o PRD)

1. Usuário fecha chat após `@dev` completar Sprint 2 de 4. `dev-state.md` registra fase atual; dossier `Agent Trail` registra "Sprint 2 done"; `handoff-protocol.json` lista artefatos.
2. Usuário abre chat novo, ativa `/aioson:dev`.
3. `@dev` lê (nesta ordem): `project.context.md` → `last-handoff.json` (qual feature?) → dossier de `{slug}` → `dev-state.md` → plano `@sheldon` em `.aioson/plans/{slug}/`.
4. **Output obrigatório de abertura** (sem perguntar nada antes):
   > "Feature ativa: `{slug}` ({classificação}). Estou na Sprint 3 de 4. Sprints 1 e 2 entregues — artefatos: [lista do handoff]. `@sheldon` deixou plano faseado em `.aioson/plans/{slug}/manifest.md` com decisões blocantes: [resumo]. `@architect` mapeou Code Map: [paths-chave]. `@sheldon` consultou pesquisas em [link researchs/]. Próximo passo: Sprint 3 — [descrição]. Posso seguir?"
5. Usuário confirma ou redireciona; `@dev` prossegue.

### Fluxo 3 — `@dev` detecta drift durante implementação

1. `@dev` está implementando Sprint 3, plano original previa criar `src/foo/bar.js`.
2. `@dev` percebe: `src/foo/bar.js` já existe e está implementado — comportamento contradiz o plano.
3. `@dev` consulta dossier `Code Map` → procura por `src/foo/bar.js` → encontra entrada feita por `@architect` na Wave A com `role: "validation utility"`.
4. `@dev` consulta plano `@sheldon` em `.aioson/plans/{slug}/plan-{fase}.md` → confirma que a Sprint 3 espera *criar* o arquivo, não modificá-lo.
5. `@dev` reporta:
   > "Drift detectado: o plano da Sprint 3 prevê criar `src/foo/bar.js`, mas o arquivo já existe (mapeado por `@architect` em Wave A como utility). Posso (a) seguir o plano e refatorar o arquivo existente, (b) abrir `revision:open` para `@architect` revisar a decisão, (c) outra opção?"
6. Usuário decide; `@dev` registra a decisão em `Agent Trail` e prossegue.

## Success metrics

- **100% das features novas SMALL/MEDIUM nascem com dossier.** Auditável: para qualquer slug em `features.md` com `status=in_progress`, deve existir `.aioson/context/features/{slug}/dossier.md` populado pelo menos por `@product`. Métrica reportável via `aioson dossier:audit` (novo subcomando opcional, ou check em `aioson doctor`).
- **`@dev` em chat novo retoma sem perguntar contexto.** Verificável via runtime telemetry: comparar runs de `@dev` que abrem com `summary` contendo `feature_slug`, `phase`, `artifacts_consumed_count > 0` antes de qualquer prompt do usuário no chat. Meta: ≥ 95% das ativações `@dev` em features `in_progress` saírem da abertura com auto-relato completo.
- **Zero regressão pós-`sync:agents`.** Auditoria automática: depois de `npm run sync:agents`, comparar contagens de menções a "dossier" em cada um dos 8 agentes da cadeia entre `template/.aioson/agents/` e `.aioson/agents/`. Devem ser idênticas. Falha = bug a corrigir.
- **`@sheldon` registra pesquisas no dossier.** Para qualquer feature `done` pós-implementação: `Agent Trail` do dossier tem ao menos uma entrada `@sheldon` com link para `researchs/` ou justificativa "no external research needed".

## Open questions

- **Local físico do auto-init hook:** dentro de `aioson workflow:next`, dentro do prompt do `@product` (via comando `aioson dossier:init` chamado pelo agente), ou ambos? — decisão de `@architect`.
- **Comportamento em features MICRO:** PRD do `feature-dossier` original prevê dossier opcional em MICRO. Manter assim, ou padronizar todas as classificações? — decisão de `@analyst`/`@architect`.
- **Granularidade do `@dev` drift detection:** confirmar "qualquer divergência" vs "divergência que afeta paths declarados no Code Map" — decisão de `@analyst`.
- **Backwards-compat com features pós-`feature-dossier` que não têm dossier:** `secure-by-default` está `done`. Próxima feature que invocar `cross-project-handoff` (no futuro) provavelmente também não terá dossier histórico. Política de "dossier ausente em feature done" precisa de decisão (silenciar, avisar com link para retro-init, ou exigir retro-init antes de qualquer trabalho de continuação).

## Próximo agente

Classificação **MEDIUM** (cross-cutting em 8 prompts de agente + workflow hooks + sync de template + handoff protocol + comportamento auditável de runtime).

Próximo passo: `/aioson:analyst` para mapear entidades (campos novos em dossier, contratos por agente, schema de auditoria) e edge cases. Após `@analyst`, `/aioson:architect` para decidir local do auto-init hook e estratégia de paridade template↔workspace.
