---
slug: squad-session-entry
status: done
owner: dev
created_at: 2026-09-25
---

# Entradas coerentes para sessões

## Scope
Oferecer run/status/resume sobre a mesma sessão autorun, preservando comandos existentes.

## Context selected
context:brief session-context; regras must_load lidas; regra modal é exclusiva de UI. Secure-tdd aplicado aos identificadores usados em paths.

## Implementation intelligence
Reusar autorun e leitura do plan.json; wrapper só traduz gramática. squad:status com --session usa o mesmo leitor. Nenhum novo banco, identidade ou execução paralela.

## Expected paths
- behavior: src/cli.js
- behavior: src/commands/squad-session.js
- behavior: src/commands/squad-status.js
- behavior: template/.aioson/docs/squad/session-operations.md
- support: .aioson/docs/squad/session-operations.md (espelho)
- support: tests/squad-session-entry.test.js
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: aliases claros; resume exige sessão; status detalha objetivo, tarefas, evidências, bloqueios e próxima ação; consulta sem mutação; validação de IDs.
- Defer: heartbeat de processo e vínculo pipeline precisam incremento próprio sobre o estado existente.
- Escalate: nenhuma decisão externa.

## Verification
CLI real: executar worker local, consultar por ambas as entradas, retomar sem repetir efeito; sessão inexistente e IDs inválidos falham; JSON e saída textual concordam.

## Evidências
7 testes passaram via CLI real e leitura de status; IDs adversariais recusados, consulta não altera plano, resume não repete efeito. Ownership local consultado read-only; heartbeat permanece null. context:evals passou. Lint 1201 arquivos: zero novos.
