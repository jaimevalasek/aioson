---
classification: SMALL
source: .aioson/docs/aioson-cost-optimization-analysis.md
generated_at: 2026-06-01
---

# PRD — AIOSON Cost/Context Optimization

## Vision
Reduzir custo de tokens e ruído de contexto no AIOSON sem enfraquecer a qualidade dos agentes, começando por medições confiáveis e estado de feature correto.

## Problem
O AIOSON já tem bons mecanismos de memória, dossier, audit e context pack, mas hoje algumas medições e estados misturam superfícies diferentes. Isso faz o operador tomar decisões com números imprecisos e pode puxar contexto antigo, como `gemini-phaseout`, para trabalhos não relacionados.

## Users
- Maintainer do AIOSON: precisa saber onde tokens estão sendo gastos antes de reduzir prompts ou mudar modelos.
- Operador usando agentes AIOSON: precisa abrir novas features sem ser travado por trabalhos pausados ou date-gated.
- Agentes de workflow: precisam distinguir trabalho ativo de trabalho pausado, concluído ou abandonado.

## MVP scope
### Must-have 🔴
- Suportar `paused` no ciclo de vida de features em `features.md`, preservando o histórico sem bloquear novas features.
- Garantir que dossiers pausados não sejam tratados como ativos pelo `context:pack`.
- Corrigir o workflow para descartar estado persistido de feature quando não houver mais feature `in_progress`.
- Adicionar modos ao `agent:audit`: `--runtime-only`, `--template-only` e `--inception`, separando custo de uso real, custo de distribuição e custo do projeto construindo a si mesmo.
- Adicionar `skill:audit` com métrica equivalente a `agent:audit` para skills em `.aioson/skills`, `.aioson/installed-skills` e `template/.aioson/skills`.
- Adicionar warnings em `context:health` para drift entre classificação do projeto, estado do workflow, feature ativa e pulse.
- Cobrir os novos comportamentos com testes focados.

### Should-have 🟡
- Sugerir comando de correção quando `context:health` detectar feature `in_progress` que o pulse não reconhece.
- Exibir uma seção separada de features `paused` em comandos de status, sem tratá-las como active work.
- Registrar no dossier um evento curto quando uma feature for pausada, para retomada futura.

## Out of scope
- Reduzir o tamanho de `AGENTS.md`, `CLAUDE.md` ou prompts longos nesta fatia.
- Ativar `agent:prompt --sharded`.
- Mudar seleção de modelos por provider ou squad.
- Implementar `memory:trim --target-bytes`.
- Remover Gemini do projeto nesta fatia.

## User flows
### Pausar uma feature date-gated
Operador escolhe pausar `gemini-phaseout` -> AIOSON marca `features.md` como `paused` -> dossier muda para `status: paused` -> `context:pack` deixa de puxar o dossier como ativo -> novas features podem ser abertas.

### Auditar custo de agentes
Maintainer roda `aioson agent:audit . --runtime-only` -> vê apenas prompts que um projeto instalado carregaria -> roda `--template-only` para distribuição -> roda `--inception` para custo do próprio repositório AIOSON.

### Detectar drift de contexto
Maintainer roda `aioson context:health .` -> relatório aponta divergências entre `project.context.md`, `workflow.state.json`, `features.md`, dossiers e `project-pulse.md` -> operador corrige o estado antes de otimizar prompts.

## Delivery plan
### Phase 1 — Measurement and state correctness
1. Feature lifecycle hygiene — support `paused`, keep paused work visible, and prevent paused work from blocking new features.
2. Audit scope separation — split agent measurement into runtime, template, and inception modes.
3. Skill measurement parity — add `skill:audit` for source, installed, and template skills.
4. Context drift visibility — report advisory drift warnings in `context:health`.

### Phase 2 — QA validation
1. Validate focused command behavior against requirements and CLI smoke checks.
2. Confirm drift warnings stay advisory and do not turn `context:health` into a failing command.
3. Record QA verdict in `spec-cost-context-optimization.md`.

## Acceptance criteria
| AC | Description |
|---|---|
| AC-CCO-01 | Given `gemini-phaseout` is `paused`, @product/workflow status does not treat it as active work. Verifier: @qa. |
| AC-CCO-02 | Given `agent:audit . --runtime-only --json`, output includes runtime roots only and no template duplicates. Verifier: @qa. |
| AC-CCO-03 | Given `agent:audit . --template-only --json`, output includes template roots only and no workspace duplicates. Verifier: @qa. |
| AC-CCO-04 | Given `skill:audit . --json`, output includes totals and separates router/reference/support files. Verifier: @qa. |
| AC-CCO-05 | Given classification or active-state drift exists, `context:health . --json` returns `driftWarnings[]` while keeping `ok: true`. Verifier: @qa. |
| AC-CCO-06 | Focused `node:test` suites for workflow reset, agent audit, skill audit, and context health pass. Verifier: @qa. |

## Success metrics
- `context:pack` para o objetivo "cost context optimization" não inclui `features/gemini-phaseout/dossier.md` enquanto a feature estiver `paused`.
- `workflow:status` não reporta `gemini-phaseout` como feature ativa quando `features.md` está `paused`.
- `agent:audit` consegue reportar contagens separadas para runtime, template e inception.
- `skill:audit` reporta contagem de arquivos, bytes e tokens estimados para skills.
- `context:health` emite pelo menos os warnings de drift definidos no MVP.
- Testes focados passam com `node --test`.

## Open questions
- O comando de pausar feature deve existir como `aioson feature:pause`, ou o primeiro passo fica limitado ao contrato de `features.md` e aos agentes?
- `skill:audit` deve contar docs internas de skills como parte do prompt potencial ou separar `SKILL.md` de referências lazy-loaded?
- `context:health` deve falhar com exit code non-zero em drift grave, ou apenas avisar nesta primeira fatia?
