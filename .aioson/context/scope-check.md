---
feature: null
mode: post-dev
status: qa-approved
checked_at: 2026-06-19T01:01:41-03:00
next_agent: none
optional: true
---

# Scope Check - Context Intelligence / Context Guard

## Verdict

O conjunto de commits deixou o AIOSON mais inteligente: `context:search` ganhou ranking por metadados, `context:brief` combina seleção precisa com recall histórico, os agentes passaram a carregar `must_load`/`related` em vez de pastas inteiras, e `context:guard` injeta regras salientes antes de writes via hook. O drift encontrado nesta revisão foi corrigido por @dev e revalidado por @qa.

## Intent / Plan / Delivery

| Claim | Source | Matched by | Verdict | Notes |
|-------|--------|------------|---------|-------|
| Agentes devem descobrir contexto relevante antes de carregar arquivos | Commits `84bbc0e..f78b5c8`; prompts em `template/.aioson/agents/*` | `context:search` para agentes amplos; `context:brief` para dev/deyvin/qa/tester/pentester | aligned | Paridade template/workspace verificada. |
| Regras devem ser selecionadas por metadados mais ricos | `src/context-selector.js`, `src/context-search.js` | `aliases`, `entities`, `retrieval_intents`, `paths`, `task_types`, `triggers` | aligned | Testes focados passaram. |
| Contexto historico deve aparecer como recall, sem virar permissao de bulk-load | `src/context-brief.js` | `related` separado de `must_load` | aligned | Boa separacao entre precisao e memoria historica. |
| Guard operacional deve ser advisory e nao bloquear ferramentas | `src/context-guard.js`, `src/commands/hooks-install.js` | PreToolUse Claude com JSON wire payload e `|| true` | aligned | Testes cobrem injecao, silencio e opt-out. |
| Indice global deve respeitar `projectDir` | `src/context-search.js` | Schema v3 com `project_dir + rel_path`; testes regressivos | patched | `docs`, `docs_meta`, deletes, joins e stale invalidation agora isolam por projeto. |

## Divergences

- O drift original do indice global foi corrigido: cache antigo incompativel e descartado/recriado, e as operacoes do indice agora consideram `project_dir + rel_path`.
- O matcher de `paths` do `context-search` foi alinhado ao matcher do `context-selector`.
- A mensagem de `rules:lint` foi atualizada para refletir `aliases`, `entities`, `retrieval_intents` e `globs`.

## Corrections Applied

- `src/context-search.js`: schema v3 com isolamento por `project_dir + rel_path`, migracao/rebuild de cache antigo e joins/deletes/stale invalidation corrigidos.
- `tests/context-search.test.js`: regressao multi-projeto com mesmo `rel_path` e cobertura de glob `src/**/*.js`.
- `src/commands/rules-lint.js`: warning operacional atualizado para os metadados aceitos.

## Revision Requests

- Nenhuma pendencia bloqueante.

## Implementation Preview or Delivery Diff

| File or area | Expected or actual change | Reason | User-visible result | Confidence |
|--------------|---------------------------|--------|---------------------|------------|
| `src/context-search.js` | Schema FTS/meta diferencia `project_dir + rel_path` | Evitar recall incorreto ou perdido entre projetos | Agentes recebem memoria certa do projeto atual | alta |
| `tests/context-search.test.js` | Novo teste de colisao cross-project | Falha confirmada por reproducao local | Regressao fica coberta | alta |
| `src/context-search.js` path matcher | Reusa glob matcher do selector | Evitar falso negativo em `paths` | Melhor saliencia de regras por arquivo | alta |
| `src/commands/rules-lint.js` | Texto do warning atualizado | Contrato agora inclui aliases/entities/intents | Mensagem operacional mais precisa | alta |

## User Confirmation

Continuar significa tratar a entrega como corrigida e aprovada por @qa.

## Next Step

Next agent: none
Why: Gate D aprovado para esta correcao; `@pentester` e opcional se o usuario quiser adversarial review do hook `context:guard`.
