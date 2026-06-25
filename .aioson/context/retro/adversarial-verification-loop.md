---
feature: adversarial-verification-loop
generated_at: 2026-06-24T22:02:28.049Z
generated_by: harness-retro
schema_version: "1.0"
features_mined: [adversarial-verification-loop]
sources:
  qa_reports: 0
  verification_reports: 2
  corrections: 0
  dossier_trail: 0
  execution_events: 0
  attempts: 0
  failure_signatures: 0
  devlogs: 0
candidates: 0
observations: 1
---

# Dossiê retrospectivo — adversarial-verification-loop

## Propostas candidatas

_(nenhuma proposta candidata — nenhum item atende ao critério REQ-2)_

## Observações

- (adversarial-verification-loop, FIND-007, medium, 2026-06-24T19:47:00Z) — scope_constraint PARTIAL claim GAP-001 [.aioson/context/features/adversarial-verification-loop/verification-runs/20260624T194700Z-manual-report.md]

## Trilha minerada

### Paths minerados
- .aioson/context
- .aioson/context/features/adversarial-verification-loop/verification-runs/20260624T194700Z-manual-report.md
- .aioson/context/features/adversarial-verification-loop/verification-runs/20260624T201050Z-manual-report.md

### Contagens por fonte
- qa_reports: 0
- verification_reports: 2
- corrections: 0
- dossier_trail: 0
- execution_events: 0
- attempts: 0
- failure_signatures: 0
- devlogs: 0

### Avisos
- _(nenhum aviso — todas as fontes lidas sem degradação)_

## Próximo passo

Ative o @sheldon sob demanda para analisar este dossiê (`.aioson/context/retro/adversarial-verification-loop.md`):

```
aioson agent:prompt sheldon . --task="analisar .aioson/context/retro/adversarial-verification-loop.md"
```

Critério de promoção (REQ-2): só vira proposta o item com ≥2 ocorrências da mesma chave determinística, ≥1 finding High/Critical, ou ≥2 ciclos FAIL→PASS na mesma feature.

@sheldon classifica as classes de falha citando as ocorrências deste dossiê e propõe deltas que aterrissam APENAS em `.aioson/learnings/` e `.aioson/rules/`, sempre com aprovação humana. A CLI minera e materializa; ela nunca auto-aplica deltas.
