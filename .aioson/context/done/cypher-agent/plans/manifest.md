---
prd: prd-cypher-agent.md
sheldon-version: 1
created: "2026-04-10"
status: ready
---

# Plano de Execução — @cypher Agent

## Visão geral
Implementar o agente `@cypher` — camada de pré-produção do AIOSON que transforma sketches brutos de `plans/` em briefings estruturados e aprovados. Inclui o agent file, CLI commands de aprovação, e patches de integração em @product, @sheldon e @analyst.

## Fases

| Fase | Arquivo | Escopo | Status | Dependências |
|------|---------|--------|--------|-------------|
| 1 | plan-core-agent.md | Agent file + estrutura de briefings + fluxos core | done | — |
| 2 | plan-cli-commands.md | `briefing:approve` + `briefing:unapprove` + locales | done | Fase 1 |
| 3 | plan-integrations.md | @product, @sheldon, @analyst briefing-aware | done | Fase 2 |

## Decisões pré-tomadas
- **Formato config.md**: YAML frontmatter + tabela Markdown narrativa — agentes leem frontmatter, humanos leem tabela
- **Seções obrigatórias de `briefings.md`**: Contexto, Problema, Solução proposta, Temas, Riscos, Gaps identificados, Fontes, Questões abertas
- **@dev não acessa briefings**: `.aioson/briefings/` é invisível para @dev — fora do escopo de implementação
- **@analyst acessa briefings**: como camada extra de validação de coerência PRD ↔ briefing original
- **Modo conversacional**: se `plans/` vazia, @cypher oferece construir briefing via conversa
- **`brief:gen` é diferente**: downstream, para workers de squad — não confundir com briefings de @cypher
- **Skills**: @cypher reutiliza `web-research-cache.md` (pesquisa) e `hardening-lane.md` (gaps). Criar skills específicas junto com a implementação se necessário

## Decisões adiadas
- **Biblioteca de prompt interativo para CLI** (briefing:approve / unapprove): @analyst decide — opções: `@inquirer/select`, readline nativo, ou flag `--slug=nome`
- **Comportamento quando todos os plans já foram usados**: @analyst define se @cypher oferece modo conversacional automaticamente ou apenas avisa

## Fontes de referência
- [PRD] `.aioson/context/prd-cypher-agent.md`
- [Regra] `.aioson/rules/data-format-convention.md`
- [CLI] `src/commands/brief-gen.js` — padrão de implementação CLI
- [Skill] `.aioson/skills/static/web-research-cache.md`
- [Skill] `.aioson/skills/process/aioson-spec-driven/references/hardening-lane.md`
