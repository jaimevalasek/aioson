---
generated: "2026-07-10T20:10:00-03:00"
framework: "Node.js CLI"
test_runner: "node:test"
---

# Test Inventory — Agent Execution Dispatcher

## Summary

- Total source files scanned: 11
- Files with full behavioral coverage: 5
- Files with partial behavioral coverage: 6
- Files with no coverage: 0

## Coverage map

| Source file | Test file(s) | Status |
|---|---|---|
| `src/agent-execution/manifest.js` | `tests/agent-execution-manifest.test.js` | ✓ covered |
| `src/agent-execution/schema.js` | `tests/agent-execution-manifest.test.js`, `tests/agent-execution-security.test.js` | ✓ covered |
| `src/agent-execution/capabilities.js` | `tests/agent-execution-adapters.test.js` | ◑ partial |
| `src/agent-execution/adapters/base.js` | `tests/agent-execution-adapters.test.js`, `tests/agent-execution-capacity.test.js`, `tests/agent-execution-security.test.js` | ◑ partial |
| `src/agent-execution/adapters/claude.js` | `tests/agent-execution-adapters.test.js` | ◑ partial |
| `src/agent-execution/adapters/codex.js` | `tests/agent-execution-adapters.test.js` | ◑ partial |
| `src/agent-execution/adapters/opencode.js` | `tests/agent-execution-adapters.test.js` | ◑ partial |
| `src/agent-execution/dispatcher.js` | `tests/agent-execution-dispatcher.test.js`, `tests/agent-execution-capacity.test.js`, `tests/agent-execution-resume.test.js`, `tests/agent-execution-security.test.js` | ◑ partial — máquina de estados crítica |
| `src/agent-execution/reports.js` | `tests/agent-execution-reports.test.js`, `tests/agent-execution-security.test.js` | ✓ covered |
| `src/commands/agent-execution.js` | `tests/agent-execution-cli.test.js` | ✓ covered |
| Integrações em `verification-plan.js` e `workflow-execute.js` | testes homônimos + compatibilidade da feature | ✓ covered |

## Risk priorities

1. **Crítico — máquina de estados e retomada:** terminalidade, idempotência, digest divergente, lease expirado/corrompido e bloqueio de avanço sem relatório.
2. **Alto — capacidade/fallback:** retry/wait/pause, limite, fallback esgotado, host não autorizado e histórico persistente.
3. **Alto — relatórios:** identidade do attempt, replay, paths confinados e escrita exclusiva.
4. **Alto — segurança de processo:** argv estruturado, `shell:false`, redação e prompt restrito ao workspace.
5. **Médio — adapters:** timeout/cancelamento/erro de processo e capabilities honestas por host.

## Security regression input

- `SF-agent-execution-dispatcher-06` está corrigido e já possui regressões em `tests/agent-execution-capacity.test.js`.
- `SEC-SBD-03` é documental e pertence ao Analyst; não descreve uma vulnerabilidade executável para teste de regressão.
