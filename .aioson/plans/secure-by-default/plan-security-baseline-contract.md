---
phase: security-baseline-contract
slug: secure-by-default
status: qa_approved
owner: analyst-architect
qa_approved_at: 2026-04-28
qa_verdict: PASS
---

# Phase 1 — Security Baseline Contract

## Scope
Criar o contrato normativo da camada "Secure by Default": Artigo VII na constituição, `.aioson/rules/security-baseline.md`, IDs de controles, responsabilidades por agente e política por classificação.

## New or modified entities
- `constitution.md` ou artefato constitucional equivalente do AIOSON.
- `.aioson/rules/security-baseline.md`.
- Template source correspondente em `template/.aioson/rules/security-baseline.md`, se o projeto sincroniza rules pelo template.
- Seção de requirements: `Security Control Matrix`.

## User flows covered
- Feature MEDIUM com auth/dinheiro/ownership herda baseline automaticamente.
- Feature MICRO recebe advisory sem bloqueio.
- Feature SMALL recebe scan automático sem pentester obrigatório.

## Acceptance criteria
- AC-SBD-1.1: Existe Artigo VII ou entrada equivalente apontando para `.aioson/rules/security-baseline.md`.
- AC-SBD-1.2: A rule tem frontmatter para `agents: [analyst, architect, dev, qa]`.
- AC-SBD-1.3: A rule define pelo menos 7 controles com IDs estáveis, severidade padrão, evidência esperada e agente responsável.
- AC-SBD-1.4: Os controles cobrem Magic Bytes/file signature, atomicidade financeira, ownership/IDOR, secrets fora do código, URL externa, RLS/default-deny e limite de input.
- AC-SBD-1.5: A rule declara comportamento por classificação: MICRO advisory, SMALL scan, MEDIUM audit bloqueante.
- AC-SBD-1.6: O texto evita prometer proteção universal; descreve controles e verificações concretas.

## Implementation sequence
1. @analyst cria matriz de requisitos com IDs `REQ-SBD-*` e `AC-SBD-*`.
2. @architect define formato final dos IDs de controle (`SEC-SBD-*` ou ASVS mapping).
3. @dev implementa rule e sincronização com template se aplicável.
4. @qa verifica carregamento por agentes e ausência de regressão no fluxo MICRO.

## External dependencies
- OWASP ASVS 5.0.0 para referência de controles quando aplicável.
- OWASP Top 10 para priorização dos riscos de onda 1.

## Notes for @dev
Não hardcodear prompts de segurança dentro de código de aplicação. Regras de agente vivem em `.aioson/rules/` e template correspondente quando necessário.

## Notes for @qa
Verificar que a rule é carregada apenas por agentes declarados e que MICRO não passa a bloquear indevidamente.

## Phase-specific reference sources
- `researchs/owasp-appsec-baseline-2026/summary.md`
- `.aioson/rules/aioson-context-boundary.md`
- `.aioson/rules/canonical-path-contract.md`
