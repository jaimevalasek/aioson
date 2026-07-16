---
description: "Briefing Refiner — pacote técnico para implementar agente de refinamento de briefing"
scope: "briefing-refiner"
agents: [dev, qa]
feature: briefing-refiner
created_at: 2026-06-08
readiness: ready_with_warnings
sources:
  - .aioson/context/prd-briefing-refiner.md
  - .aioson/context/requirements-briefing-refiner.md
  - .aioson/context/scope-check-briefing-refiner.md
  - .aioson/context/architecture.md
---

# Design Doc — Briefing Refiner

## Problem Statement

Adicionar `@briefing-refiner` como etapa de refinamento entre `@briefing` e `@product`. O agente deve gerar uma revisão HTML local e editável para briefings existentes, persistir feedback estruturado em JSON, reaplicar mudanças confirmadas no Markdown original e manter o briefing dependente de aprovação explícita antes do `@product`.

## Defined Decisions

- O agente é prompt-first: não criar comando `aioson briefing:refine` na V1.
- O prompt canônico nasce em `template/.aioson/agents/briefing-refiner.md` e depois é espelhado em `.aioson/agents/briefing-refiner.md`.
- `refinement-feedback.json` é a única fonte canônica de feedback humano; o DOM/HTML editado nunca é interpretado como verdade.
- O HTML é estático, autocontido e local; sem servidor, dashboard ou dependência externa.
- File System Access API é melhoria progressiva; export/download/copy JSON é obrigatório.
- Se um briefing `approved` for modificado e `prd_generated` for `null`, o entry volta para `status: draft` e `approved_at: null`.
- Briefings com `prd_generated` não-nulo não são refináveis por default.
- O refinador não cria nem edita `prd*.md`.

## Implementation Paths

Criar:

```text
template/.aioson/agents/briefing-refiner.md
.aioson/agents/briefing-refiner.md
src/lib/briefing-refiner/
  briefing-registry.js
  briefing-sections.js
  feedback-schema.js
  review-html.js
  refinement-report.js
  apply-feedback.js
tests/briefing-refiner.test.js
```

Alterar:

```text
src/constants.js
src/commands/briefing.js
src/commands/agents.js
src/commands/test-agents.js
src/commands/dossier-audit.js
AGENTS.md
CLAUDE.md
template/AGENTS.md
template/CLAUDE.md
tests/agents.test.js
tests/agent-contracts.test.js
```

Alterar `src/commands/agents.js` somente se a lista `WORKFLOW_AGENT_IDS` ou contexto de ativação precisar reconhecer `briefing-refiner`. Como `briefing-refiner` é pré-produção e não workflow oficial, a recomendação é registrá-lo em `AGENT_DEFINITIONS` e deixá-lo fora de `WORKFLOW_AGENT_IDS` na V1.

## Module Contracts

### `briefing-registry.js`

Responsável por ler/escrever `.aioson/briefings/config.md` sem duplicar lógica frágil em agentes.

Exports esperados:

```js
readBriefingRegistry(projectDir)
writeBriefingRegistry(projectDir, data)
listRefinableBriefings(data)
markRefinementState(data, slug, patch)
returnApprovedBriefingToDraft(data, slug)
```

Reaproveitar ou mover com cuidado as funções hoje internas em `src/commands/briefing.js`: `parseConfigFrontmatter`, `serializeConfigFrontmatter`, `buildMarkdownTable`, `writeConfig`. Manter `briefing:approve` e `briefing:unapprove` com o mesmo comportamento externo.

### `briefing-sections.js`

Responsável por extrair e serializar seções obrigatórias de `.aioson/briefings/{slug}/briefings.md`.

Seções obrigatórias:

```text
Context
Problem
Proposed solution
Themes
Risks
Identified gaps
Sources
Open questions
```

O parser deve preservar texto não reconhecido sempre que possível e bloquear aplicação se uma seção obrigatória sumir.

### `feedback-schema.js`

Responsável por construir e validar `refinement-feedback.json`.

Validações mínimas:

- `schema_version === "1.0"`
- `briefing_slug` igual ao slug selecionado
- `source_briefing_path` dentro de `.aioson/briefings/{slug}/`
- `source_hash` compatível ou marcado como stale
- `sections` contém todas as seções obrigatórias
- `comments`, `decisions` e `blocking_items` são arrays
- textos são plain text; HTML colado não vira canonical rich text

### `review-html.js`

Responsável por gerar HTML autocontido via `buildReviewHtml(data)`.

Requisitos de UI:

- layout denso de revisão técnica, não landing page
- navegação por seção
- conteúdo editável com `contenteditable="plaintext-only"` quando suportado
- status por seção: `unchanged`, `accepted`, `change_requested`, `remove_requested`, `blocked`
- comentários/notas por seção
- painel de resumo: o que será feito, o que está incerto, o que bloqueia PRD
- filtros por ambiguidade, redundância, lacuna, risco, decisão pendente e sugestão de escopo
- export/download/copy de JSON sempre disponível
- File System Access API somente após ação explícita do usuário e detecção de suporte

### `apply-feedback.js`

Responsável por aplicar feedback confirmado pelo agente, nunca pelo HTML.

Fluxo:

1. Ler `briefings.md` atual.
2. Validar feedback.
3. Comparar `source_hash`.
4. Se hash divergir, bloquear aplicação automática e pedir decisão humana.
5. Gerar plano de mudanças por seção.
6. Após confirmação no harness, atualizar `briefings.md`.
7. Preservar todas as seções obrigatórias.
8. Se briefing estava `approved` e `prd_generated` é `null`, voltar para `draft` e `approved_at: null`.
9. Registrar relatório.

### `refinement-report.js`

Responsável por criar `.aioson/briefings/{slug}/refinement-report.md`.

Conteúdo mínimo:

- briefing slug
- paths consumidos
- hash original e hash aplicado
- alterações aplicadas
- alterações ignoradas
- comentários não resolvidos
- bloqueios restantes
- próxima ação: `approve_briefing`, `resolve_blockers`, `rerun_review` ou `route_to_product`

## Agent Prompt Contract

`template/.aioson/agents/briefing-refiner.md` deve cumprir o contrato estrutural dos agentes:

- começar com o bloco `LANGUAGE BOUNDARY`
- conter `## Mission`
- conter `## Required input`
- conter `## Hard constraints`
- conter bloco de observabilidade com `pulse:update` antes de `agent:done`
- escrever artefatos em disco antes de encerrar
- recomendar handoff explícito: resolver bloqueios, aprovar briefing via CLI ou chamar `@product`

Fluxos obrigatórios do prompt:

- Sem registry: instruir ativação de `@briefing`; não escrever review.
- Múltiplos candidatos: listar e aguardar seleção.
- Sem feedback pendente: gerar `review.html`, `refinement-feedback.json` inicial e `refinement-report.md` preliminar.
- Com feedback pendente: resumir mudanças e bloqueios; pedir confirmação antes de editar `briefings.md`.
- Feedback bloqueante: não dizer que está pronto para `@product`.

## Registry and Routing Updates

Em `src/constants.js`:

- adicionar `.aioson/agents/briefing-refiner.md` em `MANAGED_FILES`
- adicionar `briefing-refiner` em `AGENT_DEFINITIONS`
- não adicionar em `REQUIRED_FILES` a menos que o projeto decida que todo setup precisa desse agente como obrigatório

Definition sugerida:

```js
{
  id: 'briefing-refiner',
  displayName: 'Briefing Refiner',
  description: 'Interactive refinement of briefing artifacts before Product PRD generation',
  command: '@briefing-refiner',
  path: '.aioson/agents/briefing-refiner.md',
  dependsOn: ['.aioson/context/project.context.md', '.aioson/briefings/config.md'],
  output: '.aioson/briefings/{slug}/review.html + refinement-feedback.json + refinement-report.md'
}
```

Atualizar documentação de invocação em `AGENTS.md`, `CLAUDE.md`, `template/AGENTS.md` e `template/CLAUDE.md`.

## Test Plan for @dev

Testes focados com `node:test`:

- `getAgentDefinition('briefing-refiner')` resolve o agente.
- template e workspace possuem `briefing-refiner.md`.
- prompt novo contém os blocos obrigatórios do contrato estrutural.
- registry parser preserva `briefing:approve` e `briefing:unapprove`.
- `listRefinableBriefings` inclui `draft` e `approved` sem `prd_generated`, e exclui implementados ou com PRD.
- geração cria `review.html`, `refinement-feedback.json` e `refinement-report.md`.
- feedback com slug errado falha.
- feedback stale falha antes de aplicação automática.
- aplicação confirmada preserva seções obrigatórias.
- briefing approved modificado volta para `draft` com `approved_at: null`.
- feedback com bloqueios não produz handoff pronto para `@product`.
- nenhum `prd*.md` é criado ou alterado.

Rodadas mínimas:

```bash
node --test tests/briefing-refiner.test.js tests/agents.test.js tests/agent-contracts.test.js
npm run lint
```

## Risks and Warnings

- `workflow-next.js` e `workflow-plan.js` têm sequências SMALL diferentes; esta feature não precisa corrigir isso, mas @dev deve evitar mexer nelas salvo necessidade direta.
- `src/commands/test-agents.js` e `src/commands/dossier-audit.js` parecem inventários parciais; se forem atualizados, adicionar teste para deixar claro se `briefing-refiner` pertence ou não a esses inventários.
- O serializer atual de `.aioson/briefings/config.md` só escreve campos conhecidos; ao adicionar metadados de refinamento, o @dev deve decidir entre preservar campos extras ou aceitar extensão explícita do serializer.
- O HTML precisa tratar feedback JSON como entrada não confiável, mesmo sendo local.

## Handoff to @dev

`@dev` pode implementar sem reabrir produto ou requisitos. O trabalho é um corte pequeno e verificável: prompt template-first, registry constants, helpers em `src/lib/briefing-refiner/`, artefatos locais em `.aioson/briefings/{slug}/` e testes focados.
