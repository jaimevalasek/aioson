---
feature_slug: harness-retrospective-optimization
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-06-10T05:06:41.863Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-06-10T05:06:41.863Z
---
## Why

O AIOSON registra FAILs de QA, corrections plans, trips de circuit-breaker, assinaturas de falha e eventos SQLite — mas nenhum mecanismo agrega essa trilha entre features. Classes de erro recorrentes (ex.: "feature instalada mas silenciosamente inativa", ocorrida ≥2x) são redescobertas pelo @qa a cada feature, pagando o ciclo FAIL→corrections→re-QA inteiro a cada recorrência. Quem sente a dor: o operador (retrabalho) e os agentes (contexto poluído por outputs grandes sem tier).

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/commands/harness-retro.js
  role: command-entry
  coupling_risk: low
  added_by: architect
  added_at: 2026-06-10T05:32:23.912Z
- path: src/lib/retro/retro-sources.js
  role: io-layer
  coupling_risk: medium
  added_by: architect
  added_at: 2026-06-10T05:32:24.291Z
- path: src/lib/retro/retro-aggregate.js
  role: core-module
  coupling_risk: low
  added_by: architect
  added_at: 2026-06-10T05:32:24.654Z
- path: src/lib/retro/retro-render.js
  role: core-module
  coupling_risk: low
  added_by: architect
  added_at: 2026-06-10T05:32:25.029Z
- path: src/harness/preview-artifact.js
  role: util
  coupling_risk: medium
  added_by: architect
  added_at: 2026-06-10T05:32:25.427Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

- [.aioson/rules/aioson-context-boundary.md](.aioson/rules/aioson-context-boundary.md) — retro/{slug}.md precisa entrar na lista de artefatos validos (AC-16)

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:9a733ba1eef7595fa257377501cafbc318a9cefa440eb20877523811d88ca591 -->
**2026-06-10T05:06:42.391Z** | @product | _What_

MVP: harness:retro CLI (mineracao deterministica da trilha de falhas -> dossie retro em .aioson/context/retro/{slug}.md, criterio >=2 ocorrencias ou 1 High, analise @sheldon sob demanda, aterrissagem em learnings/rules) como must-have; previewArtifact helper (preview+ponteiro, threshold 8KB default, 2 pontos de adocao) como should-have. Constraints: aditivo sem retrocesso, zero store novo, zero agente novo, LLM fora da CLI, retrocompatibilidade total.

<!-- sha256:05e91c42079d795f18a10f7f852172d351ae56edf152a2d9a9ee34bf07dac299 -->
**2026-06-10T05:23:39.037Z** | @analyst | _Agent Trail_

Requirements mapped (11 REQs, 16 ACs, 12 edge cases). OQ-3 inventory: 10 recurrent failure classes across 19 features (~65% of 67 findings) — criterion >=2 occurrences validated. OQ-4: full test log 247,526 bytes; 8KB preview default confirmed with local evidence. Material findings: execution_events.token_count NULL in 100% of 987 rows (cost fallback to counts mandatory); attempts/ and devlogs empty today (fixtures must synthesize); loop-guardrails QA verdict lives in dossier Agent Trail, not a qa-report file. Pending: preview verb final shape (@architect).

<!-- sha256:e0ee6ffa8cac8ffcabe56614bba87044c40a971a933a0eed70becfecc4bafea5 -->
**2026-06-10T05:32:25.842Z** | @architect | _Agent Trail_

Arquitetura definida: harness:retro com lib pura em src/lib/retro/ (sources/aggregate/render) + comando fino; previewArtifact em src/harness/ (T2). §11 fechado: D1 verbo harness:preview confirmado; D2 trail vence desempate de PASS; D3 corrections_bytes incluido no custo. D7 material: execution_events NAO tem coluna feature_slug — filtro por payload_json.slug parseado best-effort. Exit codes via result.exitCode (cli.js:1649) preserva --json por construcao. Gate B: approved.

<!-- sha256:fe37ad53767fabe03943b7b8bbb12114e2669ea61bc508dd7ca5295a2ad9d6de -->
**2026-06-10T06:19:14.937Z** | @dev | _Agent Trail_

Tema 1+2 implementados: harness:retro (src/lib/retro/* + src/commands/harness-retro.js, exit codes D4 via JSON_SUPPORTED+process.exitCode, i18n cli.harnessRetro.* 4 locales, piloto loop-guardrails C-01 candidato+1 ciclo). Trail e fonte de ciclos/verdicts, nao de findings (D5, sem dupla contagem). Tema 2: previewArtifact persist-first + harness:preview read-only + adocao no feedback de criteria-fail do self:loop (AC-13) + prompts qa/tester. Paridade sheldon/qa/tester/boundary/project-map. 27 testes novos, suite 3131/3132 verde, 0 fail. Next: @qa verificar AC-1..AC-16.

<!-- sha256:fc98b15d056cedd547cea32a7de2067538849a4abfd7a9ffa62038f5ca8039cb -->
**2026-06-10T06:55:37.744Z** | @qa | _Agent Trail_

QA completed. Verdict: PASS. Coverage: 16/16 ACs. Issues: 0C/0H/0M/2L (cost per-feature-not-per-candidate; combined --feature+--last filename omits anchor) — both residual, non-blocking. Suite 3134/3135, 0 fail. Pilot loop-guardrails: C-01 candidate + 1 FAIL→PASS cycle as specified in AC-1.

<!-- sha256:7d1060e64fafb91e4ab5b004ad8832d42d84015134a1e53d4ba7fb3e4b1d946b -->
**2026-06-10T16:04:10.515Z** | @qa | _Agent Trail_

Security re-verification. Verdict: PASS. SF-01/SF-02 fixed & confirmed, SF-03 accepted as residual risk (info). 0 Critical/High. Suite 3136 pass/1 skip/0 fail.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
