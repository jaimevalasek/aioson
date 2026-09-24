# Fluxo de artefatos entre agentes

> Como o único PRD, o único plano e o único veredito QA atravessam o workflow — e o que cada agente lê de fato.

---

## Visão geral

Cada agente produz arquivos que os agentes subsequentes leem. Nenhum agente lê tudo de uma vez — cada um carrega apenas o que precisa. Este documento mapeia o que é criado, onde é salvo e quem consome o quê.

```
@briefing → briefing.md (fontes com hash + promessas PROM-*)
               ↓
@refiner → prototype.html (aprovado por você) + refinement-report.md
               ↓
@product → prd-{slug}.md (capacidades CAP-* + ACs observáveis + exclusões)
               ↓
@sheldon → enriquece o MESMO prd-{slug}.md in-place e sela
           (sheldon_review: approved + PASS vinculado ao hash)
               ↓
@planner → implementation-plan-{slug}.md (etapas verticais, arquivos, checks)
               ↓
@dev → carrega o minimum context package → implementa etapa por etapa
               ↓
@qa → qa-report-{slug}.md (Gate D)
               ↓
@tester → test-report-{slug}.md      @pentester → security-findings-*.json
```

> **Dois artefatos mandam.** O PRD selado e o plano aprovado são suficientes para o handoff ao DEV. Não existe uma cadeia paralela de `requirements-*`, `spec-*`, `architecture.md`, `design-doc-*` ou `readiness-*`: o `@sheldon` é explicitamente proibido de criá-los, e a ausência deles não bloqueia nada.

---

## O que @product gera

| Artefato | Onde | Quando |
|---|---|---|
| `prd.md` | `.aioson/context/` | Projeto novo |
| `prd-{slug}.md` | `.aioson/context/` | Feature nova |
| `features.md` | `.aioson/context/` | Sempre que uma feature é aberta |
| `plans/source-manifest.md` | raiz do projeto | Se usou `plans/*.md` ou `prds/*.md` como fonte |

O PRD produzido pelo @product é o **documento base vivo** — nenhum agente downstream reescreve Vision, Problem ou Users. Eles só adicionam.

---

## O que @sheldon gera

Quase nada de novo — e isso é intencional. O `@sheldon` **edita o próprio `prd-{slug}.md`** e o sela:

| Ação | Onde |
|---|---|
| Corrige ambiguidade e contradição | dentro do próprio `prd-{slug}.md` |
| Preenche lacuna encontrada no confronto com fonte, protótipo e repositório | dentro do próprio `prd-{slug}.md` |
| Recusa escopo especulativo | não escreve — devolve a decisão a você |
| Sela a revisão | `sheldon_review: approved` + PASS vinculado ao hash atual do PRD |

**Pesquisas web** ficam em `researchs/{slug}/summary.md` — cache compartilhado com outros agentes.

> **O que o @sheldon nunca cria:** `requirements-*`, `spec-*`, `architecture.md`, `design-doc-*`, `readiness-*`, `implementation-plan-*`, `conformance-*` ou `.aioson/plans/{slug}/`. Isso é regra do agente, não convenção. A única exceção é reparar um `harness-contract.json` já existente quando o `@validator` reporta falha de integridade de contrato.

O selo é **vinculado ao hash**: se o PRD for editado depois da revisão, o PASS fica stale e o Sheldon precisa revisar de novo antes de o `@planner` seguir.

---

## O que @planner gera

Um único `implementation-plan-{slug}.md`, lido a partir do PRD selado, do protótipo aprovado e do código atual. Cada etapa é **vertical** — entrega comportamento observável pelo usuário, não uma camada técnica — e nomeia:

- os arquivos exatos que serão tocados;
- o risco daquela etapa;
- o check executável que prova que ela terminou.

É esse plano aprovado (Gate C) que autoriza o primeiro código.

---

## Como @dev consome tudo isso

@dev usa um **minimum context package** — nunca carrega mais de 5 arquivos antes do primeiro código.

| Modo | O que @dev carrega |
|---|---|
| Feature MICRO | `project.context.md` + `prd-{slug}.md` + `implementation-plan-{slug}.md` |
| Feature SMALL/MEDIUM | `project.context.md` + `prd-{slug}.md` selado + `implementation-plan-{slug}.md` |
| Feature com escopo visual | os anteriores + o protótipo aprovado e sua `## Visual direction` |
| Simple Plan (rota curta) | `project.context.md` + o plano mínimo registrado pelo `@dev` |

Além disso, o DEV lê o briefing/refinamento aprovado e a revisão corrente do Sheldon para checar cobertura de fontes e delta de implementação.

### O controlador de estado entre sessões: `dev-state.md`

`.aioson/context/dev-state.md` é o primeiro arquivo que @dev lê em cada sessão:

```markdown
---
active_feature: {slug}
active_stage: 2
context_package:
  - .aioson/context/project.context.md
  - .aioson/context/features/{slug}/prd-{slug}.md
  - .aioson/context/features/{slug}/implementation-plan-{slug}.md
next_step: "Implementar migration da tabela users + teste RED"
status: in_progress
---
```

Se `dev-state.md` existe, @dev carrega **exatamente** o `context_package` listado e começa no `next_step` — sem exploração, sem leitura extra. É o ponteiro preciso entre sessões.

---

## O que @dev nunca carrega

Regras duras — sem exceções:

- Qualquer arquivo em `.aioson/agents/` — arquivos de agente nunca são contexto de @dev
- PRDs ou planos de features que não são a ativa
- PRDs de features marcadas como `done` em `features.md`
- Pareceres de consultoria (`architecture.md`, `discovery.md`, `design-doc-*`) a menos que estejam explicitamente no plano ou no `dev-state.md`
- Mais de 5 arquivos antes do primeiro código (auto-verificação: se leu 5 arquivos sem escrever nada → para e reporta)

---

## Handoff canônico para DEV

Product mantém o único `prd-{slug}.md`; Sheldon pode enriquecê-lo in-place; Planner cria o único `implementation-plan-{slug}.md`. Esses dois artefatos aprovados são suficientes para o handoff ao DEV.

Não há consultorias paralelas: regras de domínio e decisões de interação vivem no PRD (Product); decisões de arquitetura, descoberta e sequenciamento vivem no plano (Planner); a direção visual vive no protótipo (Refiner). Quando algo muda escopo ou ACs, volta ao PRD; quando muda sequência, arquivos ou checks, volta ao plano. A ausência de requirements/spec/design/readiness separados não bloqueia a implementação.

---

## Arquivos que @dev pode ler — universo completo

Esta é a lista completa de arquivos que @dev pode consultar em qualquer sessão. Na prática, ele carrega apenas o subconjunto necessário para o step atual:

| Arquivo | Quando carregar |
|---|---|
| `project.context.md` | Sempre |
| `dev-state.md` | Sempre (se existir — define o restante) |
| `prd-{slug}.md` selado | Feature ativa |
| `implementation-plan-{slug}.md` | Feature ativa |
| `features.md` | Cold start apenas |
| `briefing.md` / `refinement-report.md` | Para conferir cobertura de fontes e promessas |
| `prototype.html` + `## Visual direction` | Quando a etapa toca UI |
| `identity.md` | Quando a etapa toca UI e o PRD vincula identidade |
| `.aioson/plans/{slug}/harness-contract.json` | Lane B / verificação executável |
| `skeleton-system.md` | Só ao navegar estrutura do projeto |
| `architecture.md`, `discovery.md`, `design-doc-*`, `ui-spec.md` | Pareceres de consultoria — só se listados no plano |

---

## Verificação executável: campos e artefatos adicionais

Além da cadeia acima, a camada de **verificação executável** adiciona campos e artefatos opcionais que tornam o gate de execução determinístico. Tudo é aditivo — features que não os usam seguem a lane normal sem mudança.

### Campo `verification` no harness-contract.json

Quando o `@sheldon` autora o `harness-contract.json`, ele escreve um comando `verification` para todo critério `binary:true` mecanicamente verificável (preferindo o test runner do projeto; determinístico; cross-platform; exit 0 = pass). Esse campo é o que o `aioson harness:check` roda deterministicamente fora do loop, e o que o `@validator` copia verbatim antes de julgar por LLM os critérios restantes. Contratos legados sem o campo continuam válidos.

### Coluna `Wave` no plano de implementação

A tabela **Execution Sequence** gerada pelo `@planner` ganha a coluna `Wave`. Fases na mesma Wave são disjuntas em arquivos e sem dependência entre si — paralelizáveis via subagentes/worktrees isolados; waves executam em ordem crescente. A marcação é conservadora: mesma Wave só quando os Primary files não se sobrepõem **e** nenhuma fase consome a saída da outra; na dúvida, sequencial. É essa coluna que a Lane B usa para montar os `parallel()` do workflow compilado.

### spec:analyze como passe de consistência pré-execução

Antes do gate de execução roda `aioson spec:analyze --feature={slug}` — o irmão de **conteúdo** do `artifact:validate`. Enquanto `artifact:validate` checa a presença da cadeia, `spec:analyze` checa a consistência cruzada entre os artefatos: rastreabilidade REQ/AC, staleness (upstream modificado após downstream gerado), readiness, sanidade do contrato, vínculo AC→contrato e `wave_file_overlap`. Persiste `spec-analyze-{slug}.json` em `.aioson/context/`: errors são blockers roteados ao agente dono (`@sheldon` ou `@planner`); warnings viram evidência de drift pré-computada para a revisão de escopo do `@qa`.

### forge-run.workflow.js como artefato de saída compilado

Para features MEDIUM, a **Lane B** (`@forge-run` → `aioson forge:compile`) compila os artefatos da feature num `.aioson/plans/{slug}/forge-run.workflow.js` — um script de dynamic workflow auditável e versionável, **commitado junto da spec**. Ele embute parallel-por-Wave, convergência no `harness:check`, revisão adversarial e validador fresh-context. É a forma compilada e reproduzível dos mesmos artefatos descritos acima; nunca roda `feature:close`/publish.

---

## Gates determinísticos de artefato

Onde o `harness:check` prova um critério `SG-*` de uma feature de código, o `verify:artifact` prova um **artefato produzido** — do mesmo jeito barato: lê os arquivos declarados e confirma que a estrutura obrigatória existe e que nenhum placeholder ou truncamento passou, antes do agente se declarar concluído. Sem shell, sem build.

Para os agentes mapeados em `src/artifact-kinds.js`, o gate **dispara sozinho** em modo advisory quando a sessão fecha com `agent:done` — o agente não precisa lembrar de rodá-lo:

| Agente | Kind | O que é provado |
|---|---|---|
| `@setup` | `project-context` | `project.context.md` válido |
| `@discover` | `bootstrap` | os 4 arquivos do cache de cold start |
| `@briefing` | `briefing` | frontmatter, as 8 seções, perguntas classificadas, registro e linhagem de fontes |
| `@refiner` | `review` | `review.html` gerado pelo CLI, não à mão |
| `@tester` | `test-report` | matriz de hipóteses, evidência de comando, risco residual nomeado |
| `@squad` | `squad-pilot` | contrato de pilot: bloco, entrypoint, `PILOT.md`, fingerprint |
| `@genome` / `@profiler-forge` | `genome` | `genome:doctor` + aviso de aprovação stale |
| `@committer` | `commit-message` | qualidade do assunto do commit |
| `@copywriter`, `@orache`, `@site-forge`, trio Profiler, `@design-hybrid-forge` | `copy`, `orache-report`, `site`, … | esqueleto obrigatório e ausência de placeholder |

Outros kinds existem mas são chamados explicitamente, não por `agent:done`: `prd` e `sources` no preflight do `@sheldon` (cobertura `PROM-*`, cadeia CAP → AC, linhagem `SRC-*` e frescor de fingerprint), `rule` depois de `aioson rule:new`, `identity` e `visual` nos fluxos visuais.

A tabela completa de kinds, com o localizador que cada um exige: [Comandos do CLI](./comandos-cli.md#verifyartifact--o-gate-de-artefato).

Duas linhas divisórias valem para todos:

- **Advisory nunca bloqueia.** O modo padrão dos done-gates avisa e segue; `--strict` promove avisos a bloqueios, e sem `--advisory` um problema real derruba o comando com código 1.
- **O que precisa de julgamento fica com quem julga.** Se cada promessa representa fielmente a fonte, se uma hipótese de teste realmente morde, se o pilot carrega a assinatura do domínio — nada disso é decidido por expressão regular.

---

## Veja também

- [Fichas dos agentes](../4-agentes/README.md) — a esteira fase a fase, as consultorias opt-in e o que cada agente entrega
- [Receitas práticas](../3-receitas/README.md) — exemplos end-to-end por cenário
- [Continuidade entre sessões](../3-receitas/continuidade-entre-sessoes.md) — feature dossier, dev-resume, drift detection
- [Feature Archive](./feature-archive.md) — o que acontece com os artefatos quando a feature fecha
- [Loop Guardrails](./loop-guardrails.md) — `harness:check` e o campo `verification` do harness-contract
- [SDD Automation Scripts](./sdd-automation-scripts.md) — `spec:analyze` e a Lane B (`forge:compile`)
