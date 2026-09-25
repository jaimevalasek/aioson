---
slug: squad-domain-deliveries
status: done
owner: dev
created_at: 2026-09-25
---

# Entregas verificáveis e apresentação proporcional

## Scope
Documentar evidência por domínio, reaproveitar apresentação quando necessária e comprovar construção executada pelo ponto de entrada real.

## Context selected
session-operations, content-output, autorun/reflection e regressões de revisão/recibos existentes. Sem mudança em schemas, dashboard ou renderer.

## Implementation intelligence
Reusar worker de verificação como dependente: executar artefato, falhar com exit não zero, guardar resultado observado. HTML segue a preferência/contrato da entrega, sem obrigar reconstrução por resposta. Referências de fontes/efeitos pertencem à entrega, não são inferidas de tamanho de texto.

## Expected paths
- behavior: template/.aioson/docs/squad/session-operations.md
- support: .aioson/docs/squad/session-operations.md
- support: tests/squad-software-delivery.test.js
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: contratos de evidência proporcionais e smoke CLI com falha/correção/retomada.
- Defer: novo renderer; capacidades existentes bastam.
- Escalate: benchmark semântico depende de configuração de modelos/consumo solicitada.

## Verification
Programa existente mas quebrado não conclui o fluxo; verificador executa entry point; correção permite retomar sem repetir construção aceita. Prompts permanecem alcançáveis.

19 testes passaram. Retomada de failed exige rearmar explicitamente a tarefa segura via updateTaskStatus; o teste documenta essa intervenção e não promete retry automático. Redução de HTML obrigatório segue em incremento próprio para alinhar kernel/package-contract.
