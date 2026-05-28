---
target_prd: .aioson/context/prd-secure-by-default.md
slug: secure-by-default
sheldon_version: 1
created_at: 2026-04-28
status: in_progress
sizing_score: 17
sizing_decision: phased-plan
---

# Secure by Default — Phased Plan

## Overview
Implementar segurança transversal no AIOSON sem criar um novo agente principal: baseline constitucional, rule universal, skill `secure-tdd`, comandos CLI `security:scan`/`security:audit`, modo `app_target` no `@pentester`, reforço de `@qa` e telemetria de Gate D.

O plano divide a feature em fases independentes porque o PRD cruza política, processo, CLI, agentes, skill, auditoria e runtime. `@analyst` deve transformar este plano em requirements com IDs e critérios verificáveis antes de `@architect`.

## Phase table

| Phase | File | Status | Outcome |
|---|---|---|---|
| 1 | `plan-security-baseline-contract.md` | qa_approved | Baseline de segurança com IDs, classificação e responsabilidades por agente |
| 2 | `plan-cli-security-scan-audit.md` | qa_approved | Contrato dos comandos shell-only e relatório estruturado |
| 3 | `plan-secure-tdd-skill.md` | qa_approved | Skill `secure-tdd` aprovada pelo @qa; próxima fase é `app_target` do `@pentester` |
| 4 | `plan-pentester-app-target.md` | qa_approved | Modo `app_target` do `@pentester`, alias `agent:invoke` e contrato de findings aprovados pelo @qa após correções do handoff contract |
| 5 | `plan-qa-gates-runtime.md` | qa_approved | Integração com Gate D, runtime events, fallback sem CLI e métricas aprovada pelo @qa |

## Pre-made decisions

- O MVP cobre A01, A02, A03, A04 e A07 como "onda 1". A05, A06 ampliado, A09 e A10 ficam para v2.
- OWASP Top 10 é lente de priorização; OWASP ASVS 5.0.0 ou IDs AIOSON versionados devem ser usados como contrato verificável.
- `security:scan` e `security:audit` são comandos diferentes: scan é estático/tool-first; audit avalia artefatos e superfície por feature slug.
- MICRO é advisory, SMALL roda scan automático após `@dev`, MEDIUM roda auditoria bloqueante e pentester condicional.
- `@pentester` detecta e reporta; `@dev` corrige; `@qa` decide Gate D.
- Honeypots, jump scares e deception não entram no MVP, salvo decisão explícita posterior.
- Argon2id é recomendação preferencial quando aplicável, com fallback por stack/compliance definido pelo `@architect`.
- Web3/dapp fica fora do MVP v1 de `app_target`; deve virar extensão futura dedicada.
- Brownfield histórico não bloqueia por secrets antigos anteriores à instalação; novos secrets após adoção bloqueiam.
- Em modo direct LLM sem CLI, agentes usam checklist prompt-only e registram limitação no artefato; não inventam telemetria.

## Deferred decisions

- @architect decide formato final dos arquivos de resultado de `security:scan` e `security:audit`, mantendo `.aioson/context/security-findings-{slug}.json` como exceção machine-readable já permitida.
- @architect decide se hooks automáticos serão implementados via workflow CLI, prompt injection de comandos, ou integração específica por cliente; default preferido é CLI workflow-portable, não `.claude/settings.json` como única fonte.
- @dev decide implementação concreta dos scanners por stack, começando por Node.js/npm e mantendo extensibilidade para outros gerenciadores.
- @qa decide severidade final quando `security:audit` e `@pentester` discordarem, registrando rationale.

## Reference sources

- `.aioson/context/prd-secure-by-default.md`
- `.aioson/context/sheldon-enrichment.md`
- `plans/desenvolvimento-seguro.txt`
- `plans/desenvolvimento-seguro-fonte.txt`
- `researchs/owasp-appsec-baseline-2026/summary.md`
- `researchs/pentester-agent-behavior-2026/summary.md`
- `researchs/tool-first-agent-workflows-2026/summary.md`
- `researchs/mcp-a2a-agent-security-2026/summary.md`

## Handoff to @analyst

Gate A ainda precisa ser formalizado por `@analyst`. Próximo passo: criar `requirements-secure-by-default.md` com requirement IDs, acceptance criteria e uma matriz de Attack Surface que alimente arquitetura, dev, QA e pentester.
