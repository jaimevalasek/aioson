---
feature: harness-retrospective-optimization
mode: pre-dev
status: approved
checked_at: 2026-06-10
next_agent: architect
optional: false
---

# Scope Check — Harness Retrospective Optimization (RHO-lite)

## Verdict

Aprovado. Os requirements cobrem todos os must-haves do PRD sem expandir escopo de produto: mineração determinística sem LLM, dossiê em `.aioson/context/retro/{slug}.md`, critério anti-opinião, análise via @sheldon sob demanda, aterrissagem só em canais existentes, zero store novo, retrocompatibilidade total. As 4 open questions do PRD delegadas ao @analyst foram resolvidas com evidência local (inventário de 10 classes recorrentes; threshold de 8KB medido contra log real de 242KB). As extensões encontradas são mecanismo, não produto, e estão documentadas como ambiguidade para o @architect.

## Intent / Plan / Delivery

| Claim | Source | Matched by | Verdict | Notes |
|-------|--------|------------|---------|-------|
| CLI determinística `harness:retro --feature [--last=N]`, sem LLM | PRD must-have | req §5.1, REQ-1 | ✓ | exit codes + `--json` preservado (classe recorrente virou guard) |
| Dossiê em `retro/{slug}.md` com agrupamento, correções, custo | PRD must-have | req §3.1, REQ-4 | ✓ | formato exato definido (resolve OQ-1) |
| Critério ≥2 ocorrências OU 1 High | PRD must-have | REQ-2, AC-5/6 | ✓ | requirements acrescentam Critical (≥High na escala real do repo) e ciclo FAIL→PASS repetido como instância de "≥2 ocorrências" — extensão consistente, não drift |
| @sheldon sob demanda, nenhum agente novo | PRD must-have | REQ-5, AC-11 | ✓ | seção nova em sheldon.md, template-first |
| Aterrissagem só em learnings/ + rules/, zero store novo | PRD must-have + constraint | REQ-5, REQ-6, AC-16 | ✓ | boundary rule atualizada p/ listar retro/ |
| Retrocompatibilidade total, dossiê vazio sem erro | PRD success metric | REQ-3, REQ-7, AC-2, AC-15 | ✓ | baseline da suíte registrado (3104/3105) |
| previewArtifact em src/harness/, threshold 8KB configurável | PRD should-have | req §3.3, REQ-10, AC-12 | ✓ | default confirmado com medição local (OQ-4) |
| Adoção em 2 pontos: test logs @qa/@tester + attempts self:loop | PRD should-have | req §4/§5.2, AC-13/14 | ✓ | p/ @qa/@tester o mecanismo proposto é verbo CLI + prompts — adição de mecanismo, sinalizada em req §11 p/ @architect |
| Tema 2 cortável sem afetar Tema 1 | PRD | edge case 12 | ✓ | |
| Out of scope: RHO completo, auto-aplicação, agente novo, trigger automático, store novo, tiering | PRD | req §10 | ✓ | + 2 exclusões aditivas (token backfill, classificação semântica na CLI) coerentes com a fronteira CLI/agente |

## Divergences

- Nenhuma divergência de produto. Duas extensões de mecanismo, ambas documentadas: (1) verbo CLI de preview p/ @qa/@tester (PRD não especifica o mecanismo; req §11 delega forma final ao @architect); (2) Critical incluído no critério de severidade (PRD cita só High; o repo tem 3 findings Critical — excluí-los contrariaria a intenção).
- Métrica de sucesso do PRD "redução de bytes medida antes/depois" tem o baseline registrado (req §2 OQ-4: 247.526 bytes) mas não virou AC explícito de medição pós-adoção — recomendo @qa cobrar a evidência antes/depois no Gate D usando esse baseline. Não bloqueia.

## Corrections Applied

- Nenhuma — nenhum artefato contradisse fonte de maior autoridade.

## Revision Requests

- Nenhum.

## Implementation Preview or Delivery Diff

| File or area | Expected change | Reason | User-visible result | Confidence |
|--------------|-----------------|--------|---------------------|------------|
| `src/commands/harness-retro.js` (novo) | miner + renderer do dossiê | REQ-1..4 | comando `harness:retro` | alta |
| `src/cli.js` | dispatch + usage | AC-9 (guard not-wired) | comando listado no help | alta |
| `src/harness/preview-artifact.js` (novo, T2) | helper persist-first | REQ-10 | preview + ponteiro | alta |
| `src/commands/self-implement-loop.js` (T2) | checks falhos via preview | AC-13 | contexto menor no loop | alta |
| verbo CLI de preview (T2, forma a confirmar) | wrapper do helper | AC-14 | preview p/ @qa/@tester | média |
| `src/i18n/{en,pt-BR,es,fr}.json` | chaves `cli.*` novas | REQ-9 | mensagens localizadas | alta |
| `template/.aioson/agents/sheldon.md`, `qa.md`, `tester.md` + sync | modo retro / instrução preview | REQ-5, AC-11/14 | análise sob demanda | alta |
| `template/.aioson/rules/aioson-context-boundary.md` + workspace, `project-map.md` | registrar `retro/` | AC-16 | boundary íntegro | alta |
| `tests/` (harness-retro, preview-artifact + fixtures) | testes binários dos ACs | AC-1..16 | suíte verde | alta |

## User Confirmation

Continuar significa: o @architect desenha o caminho técnico de um comando novo de mineração (`harness:retro`) que lê a trilha de falhas existente e escreve dossiês Markdown em `.aioson/context/retro/`, mais um helper de preview adotado em 2 pontos. Nada do comportamento atual do AIOSON muda sem opt-in; nenhum store ou agente novo é criado; propostas de melhoria continuam passando por aprovação humana.

## Next Step

Next agent: @architect
Why: Gate A aprovado e escopo alinhado — SMALL segue para design seletivo antes do design-doc de discovery.
Optional handoff: `@scope-check --scope-mode=post-dev` após @dev se a implementação tocar arquivos fora do preview acima.
