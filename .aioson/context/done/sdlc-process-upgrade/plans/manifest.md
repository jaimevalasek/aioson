---
feature: sdlc-process-upgrade
target_prd: .aioson/context/prd-sdlc-process-upgrade.md
sheldon_enrichment: .aioson/context/sheldon-enrichment-sdlc-process-upgrade.md
sheldon_version: 1
created_at: 2026-04-24T00:37:35-03:00
status: done
classification: MEDIUM
readiness: ready_for_analyst
---

# Manifest — SDLC Process Upgrade

## Goal

Corrigir o fluxo ponta a ponta do AIOSON para que o usuario sempre saiba:

- qual agente vem agora
- por que aquele agente vem agora
- o que precisa aprovar
- como aprovar
- qual comando usar
- qual arquivo prova que a etapa anterior foi feita
- qual contexto o proximo agente deve carregar

O objetivo nao e apenas "melhorar prompts". O objetivo e alinhar prompt, CLI, artifacts, gates e memoria para que abrir um novo chat nao quebre a continuidade.

## Non-negotiable principles

- `plans/` na raiz e fonte descartavel/pre-producao; nao e destino de artefato executavel.
- `docs/pt/` e documentacao do sistema; nao e scratchpad nem plano operacional.
- `.aioson/plans/{slug}/` e o destino de planos faseados do Sheldon.
- `.aioson/context/implementation-plan-{slug}.md` e o plano de execucao PM/SDD consumido por Gate C.
- Todo handoff precisa dizer o proximo agente, o motivo, os artefatos produzidos e o comando/acao concreta para seguir.
- Todo gate que pede aprovacao precisa explicar como aprovar.
- Preflight nao pode retornar `READY` com contexto insuficiente ou estado stale relevante.

## Phase table

| Phase | File | Status | Purpose |
|---|---|---|---|
| 1 | `plan-canonical-paths-and-source-contract.md` | done | Fechar regras de paths e impedir escrita em destinos errados |
| 2 | `plan-gates-and-approval-ux.md` | done | Corrigir aprovacao de gates e mensagens ao usuario |
| 3 | `plan-state-continuity-and-next-step.md` | done | Garantir continuidade entre chats e proximo passo confiavel |
| 4 | `plan-implementation-plan-ownership.md` | done | Resolver dono real do implementation-plan e Gate C |
| 5 | `plan-handoff-and-preflight-readiness.md` | done | Corrigir handoffs e falso READY do preflight |
| 6 | `plan-dev-execution-context.md` | done | Fazer `@dev`/`@deyvin` entenderem o que executar sem reexplicacao |
| 7 | `plan-sheldon-product-flow.md` | done | Corrigir RF-01, features registry e handoff product/sheldon |
| 8 | `plan-memory-observability-docs-tests.md` | done | Fechar memoria, observabilidade, docs/help e testes de regressao |

## Pre-made decisions

- `docs/pt/` nao recebe plano operacional.
- `plans/` root continua como fonte pre-producao e pode ser descartado depois.
- O plano faseado oficial desta iniciativa vive em `.aioson/plans/sdlc-process-upgrade/`.
- O enrichment canonico vive em `.aioson/context/sheldon-enrichment-sdlc-process-upgrade.md`.
- Para MEDIUM, o fluxo deve ser verificavel por artefatos e comandos, nao por memoria do chat.

## Deferred decisions

- Confirmar se `gate:approve` exige confirmacao interativa ou se aprova automaticamente quando `gate:check` passa.
- Confirmar se `@pm` sera definitivamente o unico dono do `implementation-plan-{slug}.md` ou se um comando CLI assistido podera gerar a estrutura base.
- Confirmar se `agent:done` tambem deve atualizar `project-pulse.md` automaticamente, ou se `pulse:update` segue separado.

## Done criteria

- Um usuario consegue sair de `@product` e saber exatamente qual agente abrir no proximo chat.
- Se um agente disser "precisa aprovar", ele tambem mostra o comando de aprovacao ou fallback manual preciso.
- `workflow:execute --dry-run --feature=<slug>` e `preflight --agent=<agent> --feature=<slug>` concordam sobre o proximo passo.
- `@dev` recebe contexto suficiente para comecar sem o usuario precisar reexplicar.
- Se faltar artefato, o sistema diz qual agente deve produzi-lo.
- Se estado stale existir, aparece como warning ou blocker, nao como contexto ativo silencioso.
- Testes cobrem os bugs que motivaram este plano.

## Next agent

`@analyst` deve transformar este manifesto e o enrichment em `requirements-sdlc-process-upgrade.md` com IDs de requisito e criterios de aceite.
