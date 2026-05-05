---
target_prd: .aioson/context/prd-secure-by-default.md
round_count: 1
last_enrichment_date: 2026-04-28
plan_path: .aioson/plans/secure-by-default/manifest.md
sizing_score: 17
sizing_decision: phased-plan
sources_used:
  - plans/desenvolvimento-seguro.txt
  - plans/desenvolvimento-seguro-fonte.txt
  - researchs/pentester-agent-behavior-2026/summary.md
  - researchs/tool-first-agent-workflows-2026/summary.md
  - researchs/mcp-a2a-agent-security-2026/summary.md
  - researchs/owasp-appsec-baseline-2026/summary.md
improvements_applied:
  - External phased plan created for secure-by-default with five implementation phases
  - OWASP AppSec baseline research saved and incorporated into planning
  - Open Questions converted into pre-made and deferred decisions for downstream agents
improvements_discarded: []
status: completed
---

# Sheldon Enrichment Log — secure-by-default

## Summary
- O PRD está correto em direção e urgência, mas ainda mistura política, processo, CLI, skill, pentester e QA em um único bloco grande demais para execução direta.
- O risco principal não é falta de ideia; é falta de contratos verificáveis para `security:scan`, `security:audit`, `secure-tdd`, `app_target` e bloqueio de Gate D.
- A validação externa confirma OWASP Top 10 como lente de priorização, mas recomenda usar OWASP ASVS 5.0.0 ou IDs próprios versionados como contrato de auditoria verificável.

## Proposed improvements

### Critical gaps
- Definir contrato de controles de segurança: cada item do baseline precisa de ID estável (`SEC-{slug}-{N}` ou ASVS v5.0.0 quando aplicável), severidade, evidência esperada, estágio executor e critério de bloqueio.
- Separar `security:scan` de `security:audit`: scan é estático/tool-first para secrets/deps/config; audit é avaliação de artefatos e superfície de ataque por slug.
- Formalizar o mapa de Attack Surface produzido por `@analyst`: endpoints autenticados, ownership, papéis, estado financeiro, uploads, URLs externas, secrets, integrações, storage e fallback sem CLI.
- Definir o contrato `@qa` → `@pentester app_target`: trigger, escopo, input mínimo, output em `security-findings-{slug}.json`, severidade bloqueante e retorno para `@dev`.
- Resolver as 6 Open Questions antes de `@analyst`, especialmente hook automático, fallback sem CLI, política brownfield e Web3/dapp scope.

### Important improvements
- Criar fases independentes: baseline/constituição, CLI scan/audit, secure-tdd, app_target pentester, QA/gates/telemetria.
- Adicionar critérios de aceite verificáveis por fase, evitando "seguro por padrão" como afirmação não testável.
- Incluir política de classificação em termos executáveis: MICRO advisory, SMALL scan automático, MEDIUM audit bloqueante e pentester condicional.
- Registrar que honeypots/jump scares/deception ficam fora do MVP, exceto se virarem política explícita; isso reduz risco ético, ruído de QA e implementação teatral.

### Refinements
- Trocar "OWASP onda 1" por uma matriz explícita: A01, A02, A03, A04, A07 no MVP; A05, A06, A09, A10 diferidos.
- Converter métricas em eventos runtime concretos: `security_scan_completed`, `security_audit_completed`, `pentester_app_target_invoked`, `security_gate_blocked`.
- Tratar Argon2id como recomendação preferencial com fallback por stack/compliance, não como exigência cega para todo runtime.

## Sizing
- Main entities above 3: +7
- Delivery phases above 1: +8
- External integrations/tooling: +1
- Acceptance criteria complexity above 10: +1
- Total: 17

## Decision
Plano faseado externo criado em `.aioson/plans/secure-by-default/`.

## Gate A readiness
Gate A ainda será formalizado por `@analyst`. O enriquecimento necessário para iniciar requirements está pronto.
