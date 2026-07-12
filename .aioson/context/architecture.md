# Architecture — agent-execution-dispatcher

Arquitetura canônica detalhada em `.aioson/context/design-doc-agent-execution-dispatcher.md`.

Decisão: introduzir um dispatcher core com manifesto por feature, adapters capability-driven para Claude/Codex/OpenCode e reports/checkpoints idempotentes. Preservar `workflow-execute.json` como estado e `verification.json` como política de seleção. Nenhum fallback ou capability será inferido.

> **Gate B:** Architecture approved — @dev can proceed.

