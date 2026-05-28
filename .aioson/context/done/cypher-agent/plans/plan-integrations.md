---
phase: 3
slug: integrations
title: "Fase 3 — Integrações (@product, @sheldon, @analyst)"
depends_on: cli-commands
status: pending
---

# Fase 3 — Integrações (@product, @sheldon, @analyst)

## Escopo desta fase
Adicionar awareness de briefings nos três agentes que consomem o output de @cypher: @product (detecção e consumo de briefings aprovados), @sheldon (contexto profundo de enriquecimento), @analyst (validação de coerência).

## Entidades novas ou modificadas
- **`template/.aioson/agents/product.md`** — adição da seção "Briefing-aware detection"
- **`template/.aioson/agents/sheldon.md`** — adição da leitura de briefings quando `briefing_source` presente
- **`template/.aioson/agents/product.md`** — adição da seção "Briefing-aware detection" no prompt canônico
- **`template/.aioson/agents/sheldon.md`** — adição da leitura de briefings no prompt canônico
- **`template/.aioson/agents/analyst.md`** — adição da leitura de briefing quando `briefing_source` presente no PRD

## Fluxos de usuário cobertos
- @product ativado → detecta `.aioson/briefings/` → lê config → lista briefings approved → pergunta ao usuário
- @product gera PRD a partir de briefing → registra `briefing_source` no frontmatter + atualiza `config.md`
- @sheldon recebe PRD com `briefing_source` → lê briefing de origem → enriquece com contexto mais profundo
- @analyst recebe PRD com `briefing_source` → lê briefing → valida coerência antes de mapear requisitos

## Acceptance criteria desta fase

| AC | Descrição |
|---|---|
| AC-19 | @product ativado em projeto SEM `.aioson/briefings/` → nenhuma menção a briefings, fluxo normal |
| AC-20 | @product ativado em projeto COM `.aioson/briefings/` e briefings `approved` → lista todos e pergunta |
| AC-21 | @product ativado COM briefings `approved` → usuário recusa → @product segue fluxo normal |
| AC-22 | @product usa briefing aprovado → PRD gerado tem `briefing_source: {slug}` no frontmatter |
| AC-23 | @product usa briefing → `config.md` atualizado: `prd_generated`, status → `implemented` |
| AC-24 | @sheldon recebe PRD sem `briefing_source` → nenhuma menção a briefings, fluxo normal |
| AC-25 | @sheldon recebe PRD com `briefing_source` → lê briefing → usa como contexto adicional |
| AC-26 | @analyst recebe PRD sem `briefing_source` → fluxo normal sem menção a briefings |
| AC-27 | @analyst recebe PRD com `briefing_source` → lê briefing → reporta divergências antes de mapear requisitos |

## Sequência de implementação sugerida
1. Adicionar seção "Briefing detection" em `product.md`: verificar se `.aioson/briefings/` existe → ler config → listar aprovados
2. Adicionar lógica de escrita de `briefing_source` no frontmatter do PRD gerado
3. Adicionar atualização de `config.md` quando PRD é gerado a partir de briefing
4. Adicionar seção "Briefing context" em `sheldon.md`: se `briefing_source` presente → ler briefing antes de enriquecer
5. Adicionar seção "Briefing validation" em `analyst.md`: se `briefing_source` presente → ler briefing → checar coerência
6. Sincronizar os prompts canônicos entre template e workspace
7. Testar fluxo completo: @cypher → aprovar → @product → @sheldon → @analyst

## Dependências externas
- Fase 1 e Fase 2 concluídas
- `config.md` com YAML frontmatter parseável
- `locale:apply` sincronizando `interaction_language`

## Notas para @dev
- Os patches nos agentes são **adições**, não rewrites. Adicionar seções novas, nunca remover conteúdo existente
- A verificação de `.aioson/briefings/` deve ser silenciosa e não-bloqueante: se não existir, o agente ignora sem mencionar
- @product deve listar TODOS os briefings `approved` não implementados (não só o mais recente)
- @analyst valida coerência mas não bloqueia — reporta divergências como aviso, não como gate hard

## Notas para @qa
- Fluxo completo end-to-end: criar briefing → aprovar → @product gera PRD → @sheldon enriquece → @analyst valida
- Verificar que o campo `briefing_source` é propagado corretamente pelo PRD para @sheldon e @analyst
- Verificar que projetos sem `.aioson/briefings/` não têm nenhum comportamento alterado em @product, @sheldon e @analyst

## Fontes de referência desta fase
- [Agent] `template/.aioson/agents/product.md` — arquivo base a ser patcheado
- [Agent] `template/.aioson/agents/sheldon.md` — arquivo base a ser patcheado
- [Agent] `template/.aioson/agents/analyst.md` — arquivo base a ser patcheado
- [PRD] `.aioson/context/prd-cypher-agent.md` — seção "User flows" como referência dos comportamentos
