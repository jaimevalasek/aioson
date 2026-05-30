---
feature_slug: gemini-phaseout
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-23T03:37:34.265Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-05-23T03:37:34.265Z
---
## Why

Google anunciou em 2026-05-20 (`developers.googleblog.com`) que o Gemini CLI free/personal tier (Google AI Pro/Ultra) será descontinuado em **2026-06-18** — janela de ~4 semanas a partir de hoje (2026-05-23). Enterprise (Code Assist Standard/Enterprise + Google Cloud) continua operando.

AIOSON declara suporte `compatible via AGENTS.md` em todas as features que tocam harness (instalação, permissions, operator-memory matriz V1, doctor). Concretamente, há **46 arquivos** com referência a Gemini em `src/` + `template/` (verificado via `grep -ril gemini src/ template/`). Após 2026-06-18:

1. **Free/personal users tentando usar Gemini via AIOSON verão falhas** — a CLI Gemini retornará 401/403 ou similar. Como o AIOSON listou Gemini como suportado, o usuário tenderá a atribuir a falha ao framework.
2. **`install-wizard` continuará oferecendo Gemini como opção viável** — onboarding desfigurado, primeira impressão ruim para newcomers.
3. **`doctor` reportará configuração Gemini como saudável** quando na prática é fonte garantida de falha futura para o segmento free.
4. **Replacement oficial Google é Antigravity CLI** (Go, closed-source, multi-agent background) — não é drop-in. Investigação separada (out-of-scope deste PRD).

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/doctor.js
  added_at: 2026-05-28T06:06:55.344Z
- path: src/install-wizard.js
  added_at: 2026-05-28T06:06:55.876Z
- path: src/permissions-generator.js
  added_at: 2026-05-28T06:06:56.413Z
- path: src/i18n/messages/en.js
  added_at: 2026-05-28T06:06:56.990Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(vazio — populado a partir da Phase 2)_

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:fdb4cf42f6acb4d85c9dcdd3c658193ae0412b5b5132910b2a285e7a16e60b94 -->
**2026-05-23T03:37:59.545Z** | @product | _What_

MVP faseado: v1.17 (ship gate <=2026-06-10) warning em install-wizard+doctor+permissions-generator+operator-memory matriz V1+CHANGELOG; v1.18 (>=2026-06-19) hard removal mecanica de .gemini/ no template + install-wizard + permissions-generator, preserva .gemini/permissions.toml pre-existente (enterprise); v1.20 (Q4-2026) sunset frozen tier, doctor para de reconhecer. Constraints: NAO detectar tier free vs enterprise (heuristica fraca); NAO recomendar Antigravity sem prova (research separada); NAO apagar .gemini/permissions.toml pre-existente (enterprise protection); 46 arquivos com referencia a gemini em src+template (reduzir para <=10 em v1.18, <=5 em v1.20).

<!-- sha256:e0194fa72551af15bc1ed2809665624b80fb5756af3dbbe333054b1c856b3711 -->
**2026-05-28T05:33:28.972Z** | @analyst | _Agent Trail_

Requirements + spec produzidos (Gate A). Re-anchor de versoes: v1.17->v1.21 (warnings, ship <=2026-06-10), v1.18->v1.22 (hard removal >=2026-06-19), v1.20->TBD Q4-2026 (repo ja em 1.20.0). 9 BRs, 6 ECs. Q-GP-01..06 todas resolvidas. Surface confirmada: 46 arquivos gemini; Fase 1 toca 6 superficies (install-wizard, doctor, permissions-generator, tool-capabilities, CHANGELOG, i18n x4). @dev implementa SOMENTE Fase 1; feature fica in_progress (Fases 2/3 date-gated).

<!-- sha256:faf2efbb8112ebf9f524a96fbcb206768763005c9e673bebffda778a454d6618 -->
**2026-05-28T06:06:43.141Z** | @dev | _Agent Trail_

Phase 1 (v1.21.0 warnings) LANDED. 6 surfaces: install-wizard marker+notice, doctor harness:gemini_deprecation (guarded), permissions.toml header, tool-capabilities comment, CHANGELOG 1.21.0, i18n x4. +11 tests green, 0 new regressions (2823/2833). M2 DEVIATION: compatible_via matrix nao existe no codigo; reinterpretado como comment no TOOL_CAPS gemini. Version bump 1.20->1.21 (package.json+context). NAO fechar feature: Phase 2 (hard removal) date-gated >=2026-06-19. Next: @qa review Phase 1 antes do npm publish manual (<=2026-06-10).

<!-- sha256:f190c5bd1d9f942b033cfe3ce6046d53a8326121f88794f63669099e9915a9c2 -->
**2026-05-28T06:24:48.291Z** | @qa | _Agent Trail_

QA Phase 1 (v1.21.0) concluido. Verdict: PASS. 0 Critical, 0 High, 1 Medium (M-01 M2 deviation aceita), 2 Low (L-01 [FAIL] icon convention, L-02 install notice nao unit-tested). AC Phase 1: M1 covered (e2e verificado), M2 reinterpretado, M3 covered, M4 = manual publish gate <=2026-06-10. 62/62 feature+afetados, full 2823/2833 (0 novos). Feature NAO fechada: Phases 2/3 date-gated, fica in_progress. Sem security-findings nem harness-contract (sem trigger pentester/validator). Pentester nao necessario (warning-only, sem nova superficie de ataque).

<!-- sha256:88b0830b68bf6f4dd24b12a6d0ba65e27180349002926358fad666e7559ff547 -->
**2026-05-30T17:46:21.458Z** | @qa | _Agent Trail_

QA re-verification (pre-publish) @ HEAD 1.21.3. Verdict: PASS re-affirmed (prior sign-off 2026-05-28 still holds). Re-ran tests/gemini-phaseout.test.js: 11/11 green despite doctor.js + CHANGELOG.md being touched by later agent-loading-contract work. All 6 surfaces verified in code (doctor guard, permissions header, wizard label, tool-capabilities comment, CHANGELOG [1.21.0], i18n x4). M4 ship-gate now SATISFIED: warning is live on npm (@jaimevalasek/aioson latest=1.21.3, before the 2026-06-10 gate). New Low: CHANGELOG [1.21.0] date still placeholder 2026-06-XX (housekeeping). L-01/L-02 unchanged (accepted). Feature stays in_progress (Phases 2/3 date-gated). No pentester/validator trigger (warning-only).

## Revision Requests

_(vazio — populado a partir da Phase 2)_
