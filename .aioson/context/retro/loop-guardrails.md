---
feature: loop-guardrails
generated_at: 2026-06-10T06:52:21.738Z
generated_by: harness-retro
schema_version: "1.0"
features_mined: [loop-guardrails]
sources:
  qa_reports: 0
  corrections: 1
  dossier_trail: 10
  execution_events: 0
  attempts: 0
  failure_signatures: 0
  devlogs: 0
candidates: 1
observations: 6
---

# Dossiê retrospectivo — loop-guardrails

## Propostas candidatas

### loop-guardrails::C-01

- Âncora: C-01 | severidade máxima: high | motivos: severity
- Ocorrências (1):
  - (loop-guardrails, C-01, high, 2026-06-09, .aioson/plans/loop-guardrails/corrections-2026-06-09.md, fixed)
- Correções aplicadas: .aioson/plans/loop-guardrails/corrections-2026-06-09.md
- Custo de retrabalho: ocorrências 1, correções 1, ciclos FAIL→PASS 1 (2026-06-10T02:08:36.167Z→2026-06-10T03:02:30.876Z), eventos 0, bytes corrections 5046, tokens n/d


## Observações

- (loop-guardrails, C-02, medium, 2026-06-09) — `contract_mode` presets never reach the circuit-breaker or maxIterations [.aioson/plans/loop-guardrails/corrections-2026-06-09.md]
- (loop-guardrails, C-03, medium, 2026-06-09) — git:guard layer-2 blocks legitimate human commits of lockfiles [.aioson/plans/loop-guardrails/corrections-2026-06-09.md]
- (loop-guardrails, O-01, low, 2026-06-09) — Gate id collision after manual gate-file deletion [.aioson/plans/loop-guardrails/corrections-2026-06-09.md]
- (loop-guardrails, O-02, low, 2026-06-09) — Baseline-failure warning understates what is disabled [.aioson/plans/loop-guardrails/corrections-2026-06-09.md]
- (loop-guardrails, O-03, low, 2026-06-09) — `diff.patch` omits untracked files [.aioson/plans/loop-guardrails/corrections-2026-06-09.md]
- (loop-guardrails, O-04, low, 2026-06-09) — i18n of new commands [.aioson/plans/loop-guardrails/corrections-2026-06-09.md]

## Trilha minerada

### Paths minerados
- .aioson/context
- .aioson/context/features/loop-guardrails/dossier.md
- .aioson/plans/loop-guardrails

### Contagens por fonte
- qa_reports: 0
- corrections: 1
- dossier_trail: 10
- execution_events: 0
- attempts: 0
- failure_signatures: 0
- devlogs: 0

### Avisos
- _(nenhum aviso — todas as fontes lidas sem degradação)_

## Próximo passo

Ative o @sheldon sob demanda para analisar este dossiê (`.aioson/context/retro/loop-guardrails.md`):

```
aioson agent:prompt sheldon . --task="analisar .aioson/context/retro/loop-guardrails.md"
```

Critério de promoção (REQ-2): só vira proposta o item com ≥2 ocorrências da mesma chave determinística, ≥1 finding High/Critical, ou ≥2 ciclos FAIL→PASS na mesma feature.

@sheldon classifica as classes de falha citando as ocorrências deste dossiê e propõe deltas que aterrissam APENAS em `.aioson/learnings/` e `.aioson/rules/`, sempre com aprovação humana. A CLI minera e materializa; ela nunca auto-aplica deltas.
