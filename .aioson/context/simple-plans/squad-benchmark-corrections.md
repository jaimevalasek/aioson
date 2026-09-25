---
slug: squad-benchmark-corrections
status: done
owner: dev
created_at: 2026-09-25
---

# Corrigir duas perdas de contrato encontradas no benchmark

## Scope
Exigir recibo de todos os consumidores antes de confirmar um evento e teste do caminho válido ao bloquear IDs de sessão inválidos.

## Context selected
Resultado inicial do benchmark (`squad-model-benchmark-results.json`), contrato real de entregas/eventos, `session-operations.md`, `package-contract.md`, prompt-sharpener e context:select Dev.

## Implementation intelligence
Regras curtas e causais nos módulos já carregados por domínio. Manter o comportamento e esquemas do runtime; comparar os dois casos de desenvolvimento novamente com o mesmo modelo/host e inputs.

## Expected paths
- behavior: template/.aioson/docs/squad/session-operations.md
- behavior: template/.aioson/docs/squad/package-contract.md
- support: espelhos correspondentes em .aioson/docs/squad/
- support: .aioson/context/squad-model-benchmark-report.md
- support: .aioson/context/squad-optimization-progress.md
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: confirmação somente com recibos completos; validação negativa com controle positivo.
- Defer: retestar todo o corpus após as correções; os dois casos de desenvolvimento isolam a hipótese do prompt.
- Escalate: nenhum novo contrato de produto, serviço ou credencial.

## Verification
Reexecutar process-partial-consumers e software-path-boundary nas duas variantes atuais; conferir critérios, prompt hashes e context:evals. Não reinterpretar os 18 resultados iniciais como resultado após a correção.

Resultado: quatro execuções Codex concluídas. Nos dois casos, as duas variantes atuais passaram de não aceitas para aceitas nos três critérios. Saídas e hashes constam de `squad-model-benchmark-results.json` (followup). Apenas os dois casos de desenvolvimento foram retestados.
