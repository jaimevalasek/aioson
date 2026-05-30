---
feature: cross-tool-project-knowledge
status: approved
created_by: pm
created_at: 2026-05-30T17:04:44-03:00
classification: MEDIUM
feature_classification: SMALL
gate: C
gate_status: approved
source_prd: prd-cross-tool-project-knowledge.md
source_requirements: requirements-cross-tool-project-knowledge.md
source_spec: spec-cross-tool-project-knowledge.md
last_agent: pm
last_session: 2026-05-30T17:04:44-03:00
session_result: completed
---

# Implementation Plan — Cross-tool Project Knowledge Memory

## Gate C Summary

Gate C aprovado para desbloquear o preflight MEDIUM do projeto. `gate:check B` ja passava porque `architecture.md` existe; o status pendente era drift de frontmatter, reparado antes da aprovacao do plano. Os artefatos da feature classificam o escopo como SMALL, mas o projeto executa com governanca MEDIUM; este plano fixa a sequencia restante sem reabrir produto, requirements ou decisoes ja tomadas.

M1/M2/M3 ja aterrissaram no commit `8b53129`:
- schema `project_learnings.kind` + captura `[gotcha]`/`[resolution]`
- materializacao `.aioson/learnings/{gotchas,recipes}/`
- regeneracao de `.aioson/learnings/INDEX.md`

O restante e uma trilha curta: M4 diretiva universal, M5 importacao Claude, M6 paridade inception.

## Required Context Package

1. `.aioson/context/project.context.md`
2. `.aioson/context/prd-cross-tool-project-knowledge.md`
3. `.aioson/context/requirements-cross-tool-project-knowledge.md`
4. `.aioson/context/spec-cross-tool-project-knowledge.md`
5. `.aioson/context/implementation-plan-cross-tool-project-knowledge.md`
6. `.aioson/context/features/cross-tool-project-knowledge/dossier.md`
7. `.aioson/context/design-doc.md`
8. `.aioson/design-docs/agent-loading-contract.md`
9. `.aioson/design-docs/code-reuse.md`
10. `.aioson/design-docs/file-size.md`
11. `.aioson/design-docs/folder-structure.md`
12. `.aioson/design-docs/naming.md`
13. `.aioson/context/architecture.md` somente como artefato exigido pelo preflight global; nao usar para reabrir desenho desta feature.

## Pre-Taken Decisions

- M1/M2/M3 estao landed; nao reimplementar.
- Project-knowledge usa `type='quality'` + `kind in ('gotcha','resolution')`.
- Materializacao roda somente em `feature:close`, pelo `runDistillation`.
- PII e trust-user V1 com aviso na diretiva de captura.
- M4 nao deve tocar `.gemini/GEMINI.md` nem `template/.gemini/GEMINI.md`.
- M5 deve entrar como `aioson learning --sub=import-from-claude`, sem novo namespace CLI.
- A investigacao sobre limites de `aioson update` e memorias vivas fica registrada como follow-up, nao bloqueia M4-M6.

## Execution Sequence

| Phase | Scope | Primary files | Done criteria |
|---|---|---|---|
| 1 | M4 universal loading directive | `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`, template equivalents | Bloco `## Project knowledge` identico nos entry-points suportados; nenhuma mudanca em `.gemini/GEMINI.md`; verificacao textual cobre workspace + template. |
| 2 | M5 Claude memory import | `src/commands/learning.js`, novo modulo local de import, tests | `--dry-run` lista candidatos sem mutacao; `--select` promove gotcha/resolution via path existente; operator-preferences sao filtradas; erro claro quando memoria Claude nao existe. |
| 3 | M6 inception parity + placeholders | `template/**`, setup/installer relevante, tests de paridade | `aioson setup` greenfield cria `.aioson/learnings/gotchas/.gitkeep` e `recipes/.gitkeep`; entry-points template/workspace em paridade; novo teste de inception passa. |
| 4 | Stabilization + QA handoff | `tests/**`, `spec-cross-tool-project-knowledge.md`, `dossier.md` | Suite focada passa; `git diff --check` limpo; `aioson preflight --agent=deyvin --feature=cross-tool-project-knowledge` mostra Gate B e Gate C aprovados; spec registra checkpoint para QA. |

## Checkpoints

- Apos Phase 1: atualizar `spec-cross-tool-project-knowledge.md` com `last_checkpoint` apontando M5; registrar Code Map no dossier se novos arquivos forem tocados.
- Apos Phase 2: adicionar testes de importacao ao pacote da feature e documentar qualquer heuristica de classificacao no spec.
- Apos Phase 3: validar paridade template/workspace e registrar placeholders criados.
- Apos Phase 4: acionar `@qa` com os comandos executados, cobertura restante e riscos residuais.

## Verification Requirements

- `node --test tests/cross-tool-project-knowledge.test.js`
- Teste novo para M5/M6, se separado do arquivo existente.
- Teste de paridade inception analogo ao precedente de `active-learning-loop`.
- `node --check` nos arquivos JS alterados.
- `git diff --check`
- `aioson preflight . --agent=deyvin --feature=cross-tool-project-knowledge`

## Session Close — 2026-05-30

Agent: @pm
Result: completed
Next: @dev executa a Phase 1/M4 pela rota SMALL do workflow; depois segue M5, M6 e @qa.
