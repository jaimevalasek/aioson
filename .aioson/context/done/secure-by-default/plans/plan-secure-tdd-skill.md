---
phase: secure-tdd-skill
slug: secure-by-default
status: qa_approved
owner: architect-dev
gate_b_approved_at: 2026-04-29
dev_completed_at: 2026-04-29
qa_approved_at: 2026-04-29
---

# Phase 3 — Secure TDD Skill

## Scope
Criar `.aioson/skills/process/secure-tdd/SKILL.md` para orientar `@dev` em features MEDIUM: testes adversariais antes do código, com templates por stack e foco em bypass de auth, IDOR, race conditions, fuzzing e validação server-side.

## New or modified entities
- `.aioson/skills/process/secure-tdd/SKILL.md`.
- Referências opcionais em `.aioson/skills/process/secure-tdd/references/`.
- Template equivalente se skills processuais são distribuídas pelo template.
- Instruções de carregamento em `@dev` e possivelmente `@deyvin`.

## User flows covered
- `@dev` em MEDIUM carrega skill e cria testes adversariais antes do código de produção.
- `@dev` em SMALL usa checklist reduzido quando a feature toca auth/dinheiro/ownership.
- `@dev` em MICRO não é bloqueado pela skill.

## Acceptance criteria
- AC-SBD-3.1: Skill existe e descreve ciclo TDD adversarial em passos claros.
- AC-SBD-3.2: Skill contém templates iniciais para Node/Express e Next.js.
- AC-SBD-3.3: Laravel/Pest, Django, Rails e FastAPI aparecem como planned/optional references ou templates mínimos, sem bloquear v1.
- AC-SBD-3.4: Skill exige validação server-side e proíbe confiar no frontend como autoridade.
- AC-SBD-3.5: Skill orienta testes para IDOR, race condition, auth bypass, input limits, upload validation e external URL sanitization.
- AC-SBD-3.6: `@dev` sabe quando carregar a skill sem substituir `aioson-spec-driven`.

## Implementation sequence
1. @architect define o contrato de carregamento da skill e a profundidade por classificação.
2. @dev cria skill e templates mínimos.
3. @dev atualiza `@dev` prompt/template para carregar `secure-tdd` quando aplicável.
4. @qa valida que a skill não causa implementação direta fora do workflow.

## External dependencies
- Test runners do projeto alvo, inferidos de `project.context.md`.

## Notes for @dev
Evitar prompts longos demais. O valor é gerar casos de teste concretos e reutilizáveis, não literatura de segurança.

## Notes for @qa
Verificar que a skill produz testes antes da implementação em MEDIUM e que os testes têm falhas reproduzíveis quando a proteção está ausente.

## Phase-specific reference sources
- `plans/desenvolvimento-seguro.txt`
- `plans/desenvolvimento-seguro-fonte.txt`
- `researchs/owasp-appsec-baseline-2026/summary.md`
