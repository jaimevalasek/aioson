---
slug: squad-proportional-output
status: done
owner: dev
created_at: 2026-09-25
---

# Apresentação proporcional à entrega

## Scope
Alinhar kernel, contrato de pacote e módulo de saída: HTML depende da entrega; dados e arquivos aceitos são a fonte.

## Context selected
Kernel Squad, content-output e package-contract. Caminhos e formato do HTML existente preservados quando aplicáveis.

## Implementation intelligence
Remover obrigação por rodada; reutilizar skill/template existente e atualizar apenas seções alteradas. Nenhum renderer novo.

## Expected paths
- behavior: template/.aioson/agents/squad.md
- behavior: template/.aioson/docs/squad/content-output.md
- behavior: template/.aioson/docs/squad/package-contract.md
- support: três espelhos correspondentes em .aioson/
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: condição explícita para HTML e latest, sem criar obrigação alternativa de UI.
- Defer: novo renderer e benchmark; não necessários para consistência documental.
- Escalate: nenhum.

## Verification
Conferência de referências do kernel/contrato/módulo e sincronização seletiva. context:evals e regressões de prompt na integração final.
