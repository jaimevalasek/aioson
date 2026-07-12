---
slug: agent-execution-model-resolution
classification: SMALL
status: verification_clean
spec_version: 1
gate_requirements: approved
gate_design: approved
gate_plan: approved
gate_execution: approved
last_checkpoint: validator_passed_12_of_12
---

# Spec — Agent Execution Model Resolution

## Objetivo
Resolver nomes de modelo de forma conservadora e auditável antes do spawn e transportar `reasoning_effort` separadamente, preservando compatibilidade e políticas explícitas.

## Autoridades
- Produto: `prd-agent-execution-model-resolution.md`.
- Requisitos/AC: `requirements-agent-execution-model-resolution.md`.
- Estrutura: `design-doc-agent-execution-model-resolution.md`.
- Readiness: `readiness-agent-execution-model-resolution.md`.
- Sequência: `implementation-plan-agent-execution-model-resolution.md`.
- Evidência externa/local: `researchs/codex-model-resolution-2026/summary.md`.

## Decisões fechadas
1. O manifesto guarda o valor pedido; a attempt guarda o valor resolvido. Dispatch não normaliza o arquivo em disco.
2. Matching é determinístico, estratificado e fail-closed em ambiguidade; números informados são invariantes.
3. O catálogo do Codex é uma capability local encapsulada, não uma fonte configurável pelo manifesto nem promessa de disponibilidade.
4. `reasoning_effort` é opcional, separado e nunca sofre downgrade; cada candidato/fallback precisa suportá-lo.
5. Resolver, dispatcher, adapter, relatórios e telemetria preservam requested/resolved/strategy com redação e bounds.
6. Implementação concluída em quatro fases; o manifesto não é reescrito e cada fallback é resolvido/validado isoladamente.

## Evidência de implementação
- Resolver e catálogo: `src/agent-execution/model-resolver.js`, `src/agent-execution/model-catalog.js`.
- Execução e observabilidade: dispatcher, adapters, reports, CLI, verification plan e migração aditiva no runtime store.
- Testes focados: 137 aprovados; lint aprovado.
- AC audit: 18/18 cobertos.
- Suíte completa final: 3735 aprovados, 1 ignorado, 0 falhas em 189,7 s.
- Ledger: `.aioson/context/features/agent-execution-model-resolution/implementation-ledger.md`, pronto para auditoria.

## Rastreabilidade
- REQ-01/02 → AC-01/02/16.
- REQ-03/04/05/06 → AC-03..08/17.
- REQ-07/08 → AC-09..13.
- REQ-09/10 → AC-14..18.

## Gates
- Gate A: approved — requisitos e 18 ACs binários definidos.
- Gate B: approved — módulos, precedência, fallback e segurança definidos.
- Gate C: approved — quatro fases com comandos de verificação definidos.
- Gate D: approved — QA behavior and security rechecks passed; SF-agent-execution-model-resolution-01 is fixed and harness remains 12/12.

## QA sign-off
- Date: 2026-07-11
- **Verdict:** PASS
- AC coverage: 18/18 fully covered.
- Residual risks: live provider entitlement smoke remains optional/manual; 41 Low duplication advisories are non-blocking.
- Corrections verified: QA-AEMR-01/02 resolved.
- Security recheck: SF-agent-execution-model-resolution-01 fixed with input/catalog bounds; no open security findings.

## QA Sign-off

- **Date:** 2026-07-11
- **Verdict:** PASS
- **Gate D (execution):** approved
