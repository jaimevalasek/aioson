---
slug: squad-guided-pipeline
status: done
owner: dev
created_at: 2026-09-25
---

# Pipeline guiado sem confirmação antecipada

## Scope
Impedir que orientação, handoffs disponíveis ou consumo legado sejam apresentados como execução aceita.

## Context selected
Contexto validado; context:brief dev/executing e must_load inspecionados. Regra visual de drag-and-drop não se aplica ao CLI. Workflow onboarding preservado.

## Implementation intelligence
Reusar DAG e SQLite existentes; classificação e orientação pertencem ao handler. Handoff identifica as quatro pontas da conexão. Disponibilidade libera orientação, nunca prova aceite semântico. Não criar autoridade paralela de conclusão.

## Expected files
- behavior: src/commands/squad-pipeline.js
- behavior: template/.aioson/tasks/squad-pipeline.md
- support: .aioson/tasks/squad-pipeline.md (espelho)
- support: tests/squad-pipeline.test.js
- support: este plano, dev-state.md, bootstrap/current-state.md

## Useful options considered
- Include now: orientação sem escrita; conexões completas; dependências obrigatórias; estados prepared/unverified; skips sem falso sucesso.
- Defer: vincular recibos de execução por sessão no ciclo 2, reutilizando plan.json.
- Escalate: nenhuma decisão externa necessária.

## Verification
Testes do handler e CLI real com SQLite temporário: repetir run preserva entradas; consumo legado não conclui; fan-in e fan-out respeitam conexões; skip não vira entrega. Sintaxe e lint na integração.

## Evidências
14 testes passaram, incluindo CLI real e SQLite; sintaxe do handler validada. Guia sincronizado pelo copyFileWithDir. Pipeline completo permanece unverified sem recibo de aceite.
