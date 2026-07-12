---
slug: agent-execution-model-resolution
rounds: 1
last_enrichment_date: 2026-07-11
plan_path: null
sizing_score: 3
sizing_decision: path-a-in-place
status: approved
---

# Enriquecimento Sheldon — Agent Execution Model Resolution

## Fontes usadas
- PRD da feature e plano-fonte registrado em `plans/source-manifest.md`.
- Implementação atual de schema, manifest, dispatcher, adapters, reports e telemetria.
- Catálogo local do Codex CLI 0.144.1 e ajuda de `codex exec`.
- Pesquisa `researchs/codex-model-resolution-2026/summary.md` e documentação oficial do modelo.

## Melhorias aplicadas
1. Tornar a resolução uma etapa explícita antes do spawn, preservando solicitado, resolvido, estratégia e fonte.
2. Definir uma hierarquia conservadora de matching com bloqueio para zero, empate ou baixa confiança.
3. Tratar catálogo ausente/incompatível sem quebrar slugs literais legados nem habilitar aproximação sem evidência.
4. Validar `reasoning_effort` por modelo/candidato, inclusive fallback, e transportar o valor separadamente pelo adapter.
5. Exigir cobertura de schema, argv sem shell, cache adversarial, ambiguidade, auditabilidade, resume e telemetria.

## Melhorias descartadas
- Seleção automática por custo/inteligência, fallback implícito e alteração do config global: fora de escopo e incompatíveis com a política explícita do dispatcher.
- Dependência de rede ou scraping para resolver modelos: o MVP usa apenas capability local verificável.

## Sizing
Score 3 → Path A, enriquecimento in-place. Uma entrega de produto, uma integração de host e quatro fluxos; a quantidade de ACs reflete casos de segurança, não múltiplos domínios.

## Decisão
Lean lane confirmada pelo workflow SMALL. O pacote consolidado em requirements/spec/design/readiness/implementation-plan substitui hops separados e deixa Gates A/B/C aprovados; Gate D permanece com `@qa`.
