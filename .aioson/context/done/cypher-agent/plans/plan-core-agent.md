---
phase: 1
slug: core-agent
title: "Fase 1 — @cypher Agent Core"
depends_on: null
status: pending
---

# Fase 1 — @cypher Agent Core

## Escopo desta fase
Criar o agente `@cypher` completo com todos os fluxos core: leitura de plans, enriquecimento via skills, criação de briefings, modo conversacional, detecção de briefings existentes, e registro no config.

## Entidades novas ou modificadas
- **`.aioson/agents/cypher.md`** (e `template/`) — prompt do agente @cypher
- **`.aioson/briefings/`** — nova pasta criada pelo agente na primeira execução
- **`.aioson/briefings/config.md`** — registro global com YAML frontmatter + tabela narrativa
- **`.aioson/briefings/{slug}/briefings.md`** — briefing principal por slug

## Fluxos de usuário cobertos
- Novo briefing (com plans disponíveis): lê plans → enriquece → propõe slug → escreve `briefings.md` → registra em `config.md`
- Modo conversacional: `plans/` vazia → @cypher pergunta e constrói briefing via conversa → mesmo output
- Continuar/modificar briefing existente: detecta briefings → lista com status → usuário escolhe → aplica modificações

## Acceptance criteria desta fase

| AC | Descrição |
|---|---|
| AC-01 | Ativar `@cypher` sem briefings existentes → agente detecta e oferece criar novo |
| AC-02 | Ativar `@cypher` com `plans/` populada → agente lista arquivos e pergunta quais usar |
| AC-03 | `@cypher` lê N arquivos de plans e carrega contexto completo |
| AC-04 | `@cypher` realiza pesquisa web via `web-research-cache.md` e salva em `researchs/` |
| AC-05 | `@cypher` identifica gaps via `hardening-lane.md` e preenche `## Gaps identificados` |
| AC-06 | `briefings.md` gerado contém todas as 8 seções obrigatórias |
| AC-07 | `config.md` criado com YAML frontmatter correto (`briefings:` array com campos obrigatórios) |
| AC-08 | Ativar `@cypher` com `plans/` vazia → agente oferece modo conversacional e constrói briefing via perguntas |
| AC-09 | Ativar `@cypher` com briefings existentes → lista com status e oferece continuar |
| AC-10 | Modificação de briefing existente atualiza `updated_at` no `config.md` |

## Sequência de implementação sugerida
1. Criar `template/.aioson/agents/cypher.md` com a estrutura base do agente
2. Definir seção de detecção de modo (briefings existentes vs novo vs conversacional)
3. Implementar fluxo de leitura de plans e enriquecimento via skills
4. Definir formato de `config.md` com YAML frontmatter
5. Definir template de `briefings.md` com seções obrigatórias
6. Testar os 3 fluxos principais manualmente
7. Sincronizar para `.aioson/agents/` via `npm run sync:agents`

## Dependências externas
- Skills existentes: `web-research-cache.md`, `hardening-lane.md` — @dev deve ler antes de implementar o agente
- Se skills específicas de @cypher forem necessárias, criar em `.aioson/skills/process/cypher/` junto com a implementação

## Notas para @dev
- O agent file é um `.md` com prompt — não é código JS. Seguir o padrão dos outros agentes em `template/.aioson/agents/`
- `config.md` deve ter YAML frontmatter parseável pelo CLI (campo `briefings:` como array YAML)
- @cypher NUNCA modifica arquivos em `plans/` — read-only
- Modo conversacional: @cypher faz perguntas guiadas (contexto → problema → solução → riscos → gaps) e só no final propõe slug e escreve os arquivos

## Notas para @qa
- Verificar que `config.md` frontmatter é YAML válido após criação
- Verificar que todos os 8 seções aparecem em `briefings.md` mesmo quando gerado via modo conversacional
- Verificar que plans/ nunca é modificada durante o fluxo
