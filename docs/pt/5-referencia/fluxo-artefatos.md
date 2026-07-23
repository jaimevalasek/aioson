# Fluxo de artefatos entre agentes

> Como o único PRD, o único plano e o único veredito QA atravessam o workflow — e o que cada agente lê de fato.

---

## Visão geral

Cada agente produz arquivos que os agentes subsequentes leem. Nenhum agente lê tudo de uma vez — cada um carrega apenas o que precisa. Este documento mapeia o que é criado, onde é salvo e quem consome o quê.

```
@product → prd.md / prd-{slug}.md
               ↓
@sheldon (N rodadas) → enriquece PRD + gera sheldon-enrichment-{slug}.md
                       pode criar .aioson/plans/{slug}/manifest.md + plan-{fase}.md
               ↓
@analyst → lê sheldon-enrichment → discovery.md / requirements-{slug}.md + spec-{slug}.md
               ↓
@scope-check → confronta intenção, plano e artefatos antes do código
               roda spec:analyze (consistência cruzada) no preflight
               gera scope-check-{slug}.md quando a feature é nomeada
               ↓
@dev → carrega minimum context package → implementa fase por fase
```

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

## O que @sheldon gera (pode rodar N vezes)

@sheldon avalia o escopo total do PRD e decide como organizar o trabalho com base em um **score de complexidade**:

| Score | Decisão | O que é criado |
|---|---|---|
| 0–3 | Enriquecimento in-place | Expande o próprio `prd-{slug}.md` diretamente |
| 4–6 | In-place + Delivery plan | Expande o PRD e adiciona `## Delivery plan` com fases numeradas dentro do arquivo |
| 7+ | Plano externo | Cria `.aioson/plans/{slug}/manifest.md` + `plan-{slug-fase}.md` por fase |

**Em todos os casos**, @sheldon gera:
- `sheldon-enrichment-{slug}.md` (ou `sheldon-enrichment.md`) em `.aioson/context/` — log de cada rodada, decisões de gray areas, score e readiness

**No Modo C (validação completa)**, gera adicionalmente:
- `sheldon-validation-{slug}.md` (projeto: `sheldon-validation.md`) — relatório de auditoria com gate por agente (🟢/🟡/🔴)
- `.aioson/plans/{slug}/checklist.md` — checklist de implementação por fase

**Pesquisas web (RF-WEB)** ficam em:
- `researchs/{slug}/summary.md` — cache de 7 dias, compartilhado com outros agentes

O campo `readiness` em `sheldon-enrichment-{slug}.md` define se o PRD está pronto:
- `ready_for_downstream` → pode avançar para @analyst
- `needs_work` → itens bloqueantes ainda abertos
- `needs_enrichment` → sessão iniciada mas não concluída

---

## Como @analyst consome esses artefatos

@analyst lê o arquivo de enrichment **silenciosamente** antes de iniciar qualquer pergunta:

```
Se sheldon-enrichment-{slug}.md existir:
  → ler — não re-perguntar o que já está documentado
  → se plan_path estiver setado: ler manifest e scopar discovery para Fase 1 primeiro
```

**Em modo feature**, @analyst produz:
- `requirements-{slug}.md` — regras de negócio com IDs (`REQ-{slug}-N`), acceptance criteria verificáveis (`AC-{slug}-N`), edge cases e out-of-scope explícito
- `spec-{slug}.md` — esqueleto de memória da feature com `phase_gates` no frontmatter

O `spec-{slug}.md` é o **artefato de handoff para @dev** — ele inclui as decisões já tomadas, dependências e o status de cada gate (`requirements`, `design`, `plan`).

---

## Como @dev consome tudo isso

@dev usa um **minimum context package** — nunca carrega mais de 5 arquivos antes do primeiro código.

| Modo | O que @dev carrega |
|---|---|
| Feature MICRO | `project.context.md` + `prd-{slug}.md` |
| Feature SMALL/MEDIUM | `project.context.md` + `spec-{slug}.md` + `scope-check-{slug}.md` + `implementation-plan-{slug}.md` |
| Feature com plano do Sheldon | `project.context.md` + `spec-{slug}.md` + `.aioson/plans/{slug}/manifest.md` + arquivo da fase atual |
| Modo projeto | `project.context.md` + `spec.md` + `skeleton-system.md` |

### Como o plano do Sheldon chega ao @dev

Quando @sheldon criou um plano externo (score 7+):

1. @dev detecta `.aioson/plans/*/manifest.md` antes de qualquer implementação
2. Lê o `manifest.md` para saber qual fase está com `status: pending`
3. Carrega **apenas o arquivo dessa fase** (ex: `plan-autenticacao.md`)
4. Implementa a fase, marca como `done` no manifest
5. Na próxima sessão, pega a próxima fase

Decisões marcadas como `pre-tomadas` no manifest são **finais** — @dev não re-discute. Decisões `adiadas` são dele para tomar e registrar em `spec-{slug}.md`.

### O controlador de estado entre sessões: `dev-state.md`

`.aioson/context/dev-state.md` é o primeiro arquivo que @dev lê em cada sessão:

```markdown
---
active_feature: {slug}
active_phase: 2
active_plan: .aioson/plans/{slug}/manifest.md
context_package:
  - .aioson/context/project.context.md
  - .aioson/context/spec-{slug}.md
  - .aioson/plans/{slug}/manifest.md
  - .aioson/plans/{slug}/plan-autenticacao.md
next_step: "Implementar migration da tabela users + teste RED"
status: in_progress
---
```

Se `dev-state.md` existe, @dev carrega **exatamente** o `context_package` listado e começa no `next_step` — sem exploração, sem leitura extra. É o ponteiro preciso entre sessões.

---

## O que @dev nunca carrega

Regras duras — sem exceções:

- Qualquer arquivo em `.aioson/agents/` — arquivos de agente nunca são contexto de @dev
- `spec-{outro-slug}.md` — specs de features que não são a ativa
- PRDs de features marcadas como `done` em `features.md`
- `discovery.md` ou `architecture.md` a menos que estejam explicitamente no plano ou no `dev-state.md`
- Mais de 5 arquivos antes do primeiro código (auto-verificação: se leu 5 arquivos sem escrever nada → para e reporta)

---

## Handoff canônico para DEV

Product mantém o único `prd-{slug}.md`; Sheldon pode enriquecê-lo in-place; Planner cria o único `implementation-plan-{slug}.md`. Esses dois artefatos aprovados são suficientes para o handoff ao DEV.

Analyst, Architect, PM, UX/UI e Discovery Design Doc são consultorias explícitas. Quando um parecer muda escopo ou ACs, ele volta ao PRD; quando muda sequência, arquivos ou checks, volta ao plano. A ausência de requirements/spec/design/readiness separados não bloqueia a implementação.

---

## Arquivos que @dev pode ler — universo completo

Esta é a lista completa de arquivos que @dev pode consultar em qualquer sessão. Na prática, ele carrega apenas o subconjunto necessário para o step atual:

| Arquivo | Quando carregar |
|---|---|
| `project.context.md` | Sempre |
| `dev-state.md` | Sempre (se existir — define o restante) |
| `features.md` | Cold start apenas |
| `spec-{slug}.md` | Feature ativa |
| `scope-check-{slug}.md` | Antes da primeira implementação e após fixes relevantes |
| `implementation-plan-{slug}.md` | Se plano existe |
| `.aioson/plans/{slug}/manifest.md` + fase atual | Se plano Sheldon existe |
| `skeleton-system.md` | Só ao navegar estrutura do projeto |
| `design-doc.md` | Só se listado no plano |
| `readiness.md` | Só na primeira sessão de uma feature nova |
| `architecture.md` | SMALL/MEDIUM, só se listado no plano |
| `discovery.md` | SMALL/MEDIUM, só se listado no plano |
| `prd-{slug}.md` | Só na primeira sessão de uma feature nova |
| `ui-spec.md` | Só ao implementar componentes de UI |

---

## Verificação executável: campos e artefatos adicionais

Além da cadeia acima, a camada de **verificação executável** adiciona campos e artefatos opcionais que tornam o gate de execução determinístico. Tudo é aditivo — features que não os usam seguem a lane normal sem mudança.

### Campo `verification` no harness-contract.json

Quando o `@sheldon` autora o `harness-contract.json`, ele escreve um comando `verification` para todo critério `binary:true` mecanicamente verificável (preferindo o test runner do projeto; determinístico; cross-platform; exit 0 = pass). Esse campo é o que o `aioson harness:check` roda deterministicamente fora do loop, e o que o `@validator` copia verbatim antes de julgar por LLM os critérios restantes. Contratos legados sem o campo continuam válidos.

### Coluna `Wave` no plano de implementação

A tabela **Execution Sequence** gerada pelo `@pm` ganha a coluna `Wave`. Fases na mesma Wave são disjuntas em arquivos e sem dependência entre si — paralelizáveis via subagentes/worktrees isolados; waves executam em ordem crescente. A marcação é conservadora: mesma Wave só quando os Primary files não se sobrepõem **e** nenhuma fase consome a saída da outra; na dúvida, sequencial. É essa coluna que a Lane B usa para montar os `parallel()` do workflow compilado.

### spec:analyze como passe de consistência pré-execução

Antes do gate de execução, o `@scope-check` roda `aioson spec:analyze --feature={slug}` — o irmão de **conteúdo** do `artifact:validate`. Enquanto `artifact:validate` checa a presença da cadeia, `spec:analyze` checa a consistência cruzada entre os artefatos: rastreabilidade REQ/AC, staleness (upstream modificado após downstream gerado), readiness, sanidade do contrato, vínculo AC→contrato e `wave_file_overlap`. Persiste `spec-analyze-{slug}.json` em `.aioson/context/`: errors são blockers roteados ao agente dono; warnings viram evidência de drift pré-computada.

### forge-run.workflow.js como artefato de saída compilado

Para features MEDIUM, a **Lane B** (`@forge-run` → `aioson forge:compile`) compila os artefatos da feature num `.aioson/plans/{slug}/forge-run.workflow.js` — um script de dynamic workflow auditável e versionável, **commitado junto da spec**. Ele embute parallel-por-Wave, convergência no `harness:check`, revisão adversarial e validador fresh-context. É a forma compilada e reproduzível dos mesmos artefatos descritos acima; nunca roda `feature:close`/publish.

---

## Veja também

- [Fichas dos 29 agentes](../4-agentes/README.md) — quando usar cada agente e o que ele entrega
- [Receitas práticas](../3-receitas/README.md) — exemplos end-to-end por cenário
- [Continuidade entre sessões](../3-receitas/continuidade-entre-sessoes.md) — feature dossier, dev-resume, drift detection
- [Feature Archive](./feature-archive.md) — o que acontece com os artefatos quando a feature fecha
- [Loop Guardrails](./loop-guardrails.md) — `harness:check` e o campo `verification` do harness-contract
- [SDD Automation Scripts](./sdd-automation-scripts.md) — `spec:analyze` e a Lane B (`forge:compile`)
