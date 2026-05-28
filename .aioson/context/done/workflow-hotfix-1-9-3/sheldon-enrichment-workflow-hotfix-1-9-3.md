---
target_prd: .aioson/context/prd-workflow-hotfix-1-9-3.md
round_count: 1
last_enrichment_date: 2026-05-19
plan_path: null
sizing_score: 0
sizing_decision: in-place
sources_used:
  - .aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md
  - .aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md
  - tests/agent-runtime-alignment.test.js (lines 32-51)
  - src/commands/runtime.js (lines 1173-1250)
  - git log/show on commits 981a8fd, ca15f55, d5bd430, 8ac092f
  - .aioson/brains/sheldon/architecture-decisions.brain.json (nodes sheldon-002, sheldon-006)
improvements_applied:
  - "C1: Operational protocol (5 steps) for auditing plan candidate files"
  - "C2: Must-have added: update pm.manifest.json outputs to include implementation-plan-{slug}.md"
  - "C3: Test flake tolerance for telemetry-foundation.test.js perf gate (2/3 runs threshold)"
  - "I1: 4-step decision protocol for 3 secondary divergent agent files"
  - "I2: Localized agent files verification added to Must-have"
  - "I3: Audit wiring meta-AC (brain sheldon-006) — PR checklist mandatory"
  - "R1: Smoke test moved from Should-have to structural PRD (T6)"
  - "R2: Format for 'verified' = PR description checklist (not free text)"
  - "R3: Rollback note (npm install @jaimevalasek/aioson@1.9.2)"
  - "R4: Release notes in changelog format (not security advisory)"
  - "R5: Decision rule for unrelated drift in secondary files"
improvements_discarded: []
status: completed
classification: SMALL
harness_contract: skipped (SMALL — progress.json only, no harness:init)
---

# Sheldon Enrichment Log — workflow-hotfix-1-9-3

## Summary

PRD do hotfix v1.9.3 estava em boa direção mas mostrava 3 gaps críticos que repetiriam o próprio bug que tenta corrigir (migração documentada com implementação parcial): (1) AC sobre auditoria dos arquivos candidatos do plan era vago demais para forçar verificação literal; (2) `pm.manifest.json` precisava update de `outputs` para coerência com AC-SDLC-15, não mencionado; (3) `npm test` tem flake conhecido em perf gate que tornaria o success metric tecnicamente unmet desde dia 0.

Mais 3 improvements importantes corrigem proto-gaps (decisão sobre os 3 arquivos secundários, verificação de locales, meta-AC inspirado em brain `sheldon-006`) e 5 refinements polirem PR format, rollback, changelog tone, e decisão sobre drift unrelated.

Total: 11 improvements aplicados in-place no PRD. Score de sizing = 0 → Path A. Sem `## Delivery plan` (responsabilidade de `@pm` em MEDIUM; SMALL não exige). Sem `harness:init` (MEDIUM-only).

## Validation against brain nodes

- **sheldon-006 ★5** (`design-complete is not execution-complete — audit wiring before closing a feature`) — **PRINCÍPIO ANCORADOR** desta sessão. Aplicação literal: o hotfix existe porque a migração `981a8fd` foi design-complete (plan written + AC documented) sem ser execution-complete (template/test/candidates não atualizados). I3 garante que o próprio hotfix não repita o erro: PR checklist obrigatório.
- **sheldon-002 ★5** (`classification gates scale process depth — MICRO/SMALL/MEDIUM matters`) — confirmou SMALL como classificação correta. MICRO seria mais rápido (sem `@analyst`, direto `@dev`), mas perderia o checklist de requirements numerados que permite QA verificar 1:1. Trade-off avaliado e SMALL preferido.
- **sheldon-004 ★5** (`discovery before architecture — never the reverse`) — não aplicável (hotfix não tem entidades de domínio).

## Reasoning trace for downstream agents

### Para `@analyst`

- Requirements devem ser numerados (RF-01, RF-02, ...) cobrindo cada Must-have item como ação independentemente verificável.
- Acceptance criteria para a auditoria operacional (C1): cada arquivo do plan tem ACs `AC-{file}-aligned` e `AC-{file}-updated` mutuamente exclusivos. Apenas um aciona dependendo do resultado da auditoria.
- O **meta-AC do brain `sheldon-006`** (I3) deve aparecer no `spec-workflow-hotfix-1-9-3.md` como gate explícito antes de `features.md → done`.

### Para `@architect`

- Não há decisões arquiteturais novas — todas as decisões estruturais já estão fixadas no `plan-implementation-plan-ownership.md`. Architect aqui é praticamente um stamp ("plan está válido, segue para `@pm`").
- Single design decision: confirmar se o protocolo de "decisão sobre arquivos secundários" (I1) é coerente — pode haver um path onde o git log mostra ambiguidade e o protocol não decide. Confirmar.

### Para `@pm`

- Per AC-SDLC-15 (que este hotfix RESTAURA na template), `@pm` é owner de `implementation-plan-workflow-hotfix-1-9-3.md` em SMALL... PORÉM, `pm.md` line 30 (canon source) diz: "**SMALL** projects: optional — activate if user explicitly asks for delivery planning." Sugestão: usuário decide se quer `@pm` no fluxo. Default: skip `@pm`, ir direto de `@analyst` → `@dev`.
- Se `@pm` for ativado: trate o "## Plan candidates checklist" como Phase 1 explicit do implementation plan, com um item por linha do checklist.

### Para `@dev`

- Lendo o PRD pós-enrichment, os Must-have items são todos atomic (1 arquivo cada, com critério de sucesso claro). Pode-se implementar em qualquer ordem mas recomenda-se:
  1. Propagar `pm.md` (workspace → template). Confirma parity test.
  2. Atualizar manifest `pm.manifest.json` (C2).
  3. Atualizar test alignment com tokens novos.
  4. Rodar `npm test` baseline 3x antes de tocar mais nada — verifica se flake C3 persiste.
  5. Auditar arquivos candidatos (5 passos cada). Update onde divergente.
  6. Decisão sobre arquivos secundários via git log.
  7. Verificar locales (I2).
  8. Bump versão + sync project.context.md.
  9. CHANGELOG.md.
  10. PR description com `## Plan candidates checklist` preenchido.
- **Não marcar feature como `done` em `features.md`** sem o checklist completo no PR (meta-AC do brain `sheldon-006`).

### Para `@qa`

- Manual smoke check obrigatório: `npm pack` + `aioson setup` em fixture greenfield, executar cadeia até `/pm` em feature MEDIUM, verificar que produz `implementation-plan-{slug}.md`.
- Verificar rollback: `npm install @jaimevalasek/aioson@1.9.2` em fixture, confirma que volta ao bug original (sanity — não estamos vazando o fix).
- Rodar `npm test` 3x consecutivamente, comparar com baseline pré-hotfix.

## Open questions sintetizadas

(Reproduzidas no PRD com mais detalhe; aqui apenas índice)

1. Os 3 secundários são parte da mesma migração?
2. Outros tests assertam o contrato obsoleto?
3. Outras migrações em `.aioson/plans/` têm problema similar?
4. Como tratar drift unrelated em arquivos secundários?
5. Há locales com versões de `pm.md`?
6. Como tratar test flake se persistir ou degradar?
7. SMALL ou MICRO?
8. Como verificar destrava de `aioson-com`?

## Handoff

Próximo agente: **`@analyst`** — produzir `requirements-workflow-hotfix-1-9-3.md` (Gate A). Skip de `@architect` é viável (não há decisões técnicas novas — tudo já decidido no plan canônico). Skip de `@pm` é decisão do usuário (SMALL torna `@pm` opcional).

Acessório: nenhum harness contract necessário (SMALL).
