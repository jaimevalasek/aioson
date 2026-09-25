---
slug: squad-pipeline-sessions
status: done
owner: dev
created_at: 2026-09-25
---

# Pipeline ligado a sessões

## Scope
Vincular cada nó de uma execução identificada do pipeline a uma sessão autorun portátil, derivando aceite somente dos planos e artefatos verificados.

## Context selected
Runtime DAG, plan-store, session status e delivery-artifacts inspecionados. Pipeline legado não tem evidência suficiente para inferir aceite. Reusar contratos aprovados nos incrementos anteriores.

## Implementation intelligence
Snapshot imutável do DAG/objetivo mapeia nós para IDs determinísticos. plan-store mantém escrita atômica/exclusão; cada plano de nó continua autoridade de aceite. Run prepara próximo nó; usuário/adapter executa via resume. Dependências chegam como referências de artefatos e portas, sem consumir ou disputar filas daemon. Transformações não implementadas falham explicitamente.

## Expected paths
- behavior: src/squad/pipeline-sessions.js
- behavior: src/commands/squad-pipeline.js
- behavior: src/commands/squad-autorun.js
- behavior: template/.aioson/tasks/squad-pipeline.md
- support: .aioson/tasks/squad-pipeline.md (espelho)
- support: tests/squad-pipeline-sessions.test.js
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: run-id estável; DAG congelado; dependências por saídas verificadas; status read-only; preparação retomável.
- Defer: execução autônoma do pipeline e transformação arbitrária de payloads; não anunciar suporte inexistente.
- Escalate: nenhum novo consumidor de eventos ou publicação externa.

## Verification
CLI real prepara A, bloqueia B até aceite de A, passa artefato para B e comprova resultado; repetir comandos preserva IDs/efeitos; adulteração, drift de DAG e sessão incompleta não concluem; handoffs legados permanecem intactos.

Resultado: 61 testes de pipeline/autorun/revisão passaram; revisão final acrescentou identidade de vínculo e consulta antes da preparação (4 testes próprios passaram). Lint: zero achados novos. Planos configurados preservam contratos explícitos; heurísticos sinalizam revisão necessária.
