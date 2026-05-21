---
updated_at: 2026-05-21
briefings:
  - slug: neural-chain
    status: implemented
    source_plans: ["conversational — seed from user idea, 2026-05-21 (uninstall-app-button incident)"]
    created_at: "2026-05-21"
    approved_at: "2026-05-21"
    prd_generated: .aioson/context/prd-neural-chain.md
    updated_at: "2026-05-21"
    approval_note: "Approved via manual config.md edit (CLI `briefing:approve` ainda não implementada — mesmo gap dos briefings anteriores). PRD prd-neural-chain.md gerado em 2026-05-21 com classification=SMALL (M1 sozinho), M2 graph-maintenance explicitly out-of-scope como feature follow-up. Single-voice flag honored via guardrail metric (tokens estáveis por chain:audit) que detecta janela sem M2 ficando perigosa."
  - slug: harness-driven-aioson
    status: implemented
    source_plans: ["plans/Harness-Driven/evolucao.txt", "plans/Harness-Driven/resumo.txt"]
    created_at: "2026-04-10"
    approved_at: "2026-04-10"
    prd_generated: .aioson/context/prd-harness-driven-aioson.md
    updated_at: 2026-04-10
  - slug: lay-user-agent-mode
    status: implemented
    source_plans: ["plans/lay-user-agent-mode.md"]
    created_at: "2026-05-16"
    approved_at: "2026-05-16"
    prd_generated: .aioson/context/prd-lay-user-agent-mode.md
    updated_at: "2026-05-16"
    approval_note: "Approved via manual config.md edit because `aioson briefing:approve` CLI command is not yet implemented (framework gap, follow-up MICRO)."
  - slug: agent-chain-continuity-delivery-fix
    status: approved
    source_plans: ["conversational — seed from @dev diagnostic session 2026-05-16 (task-dev-1778959550617)"]
    created_at: "2026-05-16"
    approved_at: "2026-05-16"
    prd_generated: null
    updated_at: "2026-05-16"
    approval_note: "Approved via manual config.md edit because `aioson briefing:approve` CLI command is not yet implemented (same gap as lay-user-agent-mode; tracked in this feature's own Q9 as candidate follow-up MICRO). Scope-cut 2026-05-16 by user: SMALL briefing collapsed to MICRO follow-up after lay-user-agent-mode ships. Only Bug 2 (upstream producer of dev-state.md) becomes the actual scope; Bugs 1/3/4 stay as documented diagnosis. PRD deferred — no prd-{slug}.md will be produced under this slug; the MICRO will get its own slug and brief."
  - slug: cursor3-harness-evolution
    status: draft
    source_plans: ["plans/relatorio-proposta-melhoria-analisar.txt"]
    created_at: "2026-05-18"
    approved_at: null
    prd_generated: null
    updated_at: "2026-05-18"
    decision_note: "Documented-only strategic intake. Resolved 2026-05-18 with @product: Q1=(a) AIOSON enriquece sem mudar foco; Theme 2 parked (no observed pain); Themes 1/3/5 out-of-scope; Theme 4 dropped (opinion-as-config risk). No PRD will be generated. Briefing serves as permanent reference for rejecting future 'let's copy X from Cursor' proposals without observed pain data."
  - slug: workflow-handoff-integrity-1-9-2
    status: implemented
    source_plans: ["conversational — seed from dogfooding session in aioson-com after v1.9.2 release (2026-05-19)"]
    created_at: "2026-05-19"
    approved_at: "2026-05-19"
    prd_generated:
      - .aioson/context/prd-workflow-hotfix-1-9-3.md
      - .aioson/context/prd-workflow-handoff-integrity.md
    updated_at: "2026-05-19"
    approval_note: "Approved via manual config.md edit (CLI `briefing:approve` ainda não implementada — gap conhecido, mesmo pattern dos briefings anteriores). User confirmed approval via /product activation. Gerado em DOIS PRDs por decisão de @product + user (split estrutural): prd-workflow-hotfix-1-9-3.md (SMALL — completar migração 981a8fd, sequência de release) + prd-workflow-handoff-integrity.md (MEDIUM — F1/F2/F3 + CI guard + dogfood gate; depends_on hotfix)."
    note: "Cluster de 5 falhas (F1-F5) detectadas no primeiro dogfood pós-v1.9.2, com investigação iterativa: @briefing inicial → @deyvin hotfix-tentado-revertido → @briefing-v2 com git archaeology. Causa-raiz final: **migração SDLC `981a8fd` (2026-04-24, v1.9.0) ficou incompleta**. O commit documentou em `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` que `@pm` é owner canônico de `implementation-plan-{slug}.md` em MEDIUM (AC-SDLC-15), e atualizou workspace `.aioson/agents/pm.md`. MAS não tocou `template/.aioson/agents/pm.md`, nem `tests/agent-runtime-alignment.test.js` (último touch em `8ac092f`, anterior), nem arquivos candidatos listados no plan (`artifact-map.md`, `handoff-contract.js`, `artifact-validate.js`). O `ca15f55` (Phase 4 chain-continuity) tentou re-sincronizar mas só pegou `## Feature dossier` section, não a parte de implementation-plan. Logo: source pm.md tem o contrato canônico correto; template+test estão obsoletos. Hotfix v1.9.3 deve completar a migração `981a8fd` por inteiro, não apenas copiar arquivos. Lição-meta registrada no briefing: verificar canon via tripé prompts + tests + plans committed antes de qualquer fix de contrato. F2/F3/F1 são frentes separadas (não dependem de T1)."
---

# Briefings Registry

| slug | status | source_plans | created | approved | prd | note |
|------|--------|-------------|---------|----------|-----|------|
| neural-chain | implemented | conversational (uninstall-app-button incident) | 2026-05-21 | 2026-05-21 | prd-neural-chain.md | classification=SMALL (M1 only); M2 graph-maintenance out-of-scope as feature follow-up; guardrail metric tokens-stable-por-audit |
| harness-driven-aioson | implemented | plans/Harness-Driven/evolucao.txt, plans/Harness-Driven/resumo.txt | 2026-04-10 | 2026-04-10 | .aioson/context/prd-harness-driven-aioson.md | — |
| lay-user-agent-mode | implemented | plans/lay-user-agent-mode.md | 2026-05-16 | 2026-05-16 | .aioson/context/prd-lay-user-agent-mode.md | — |
| agent-chain-continuity-delivery-fix | approved | conversational (@dev diagnostic) | 2026-05-16 | 2026-05-16 | — | PRD deferred (scope-cut to MICRO follow-up) |
| cursor3-harness-evolution | draft | plans/relatorio-proposta-melhoria-analisar.txt | 2026-05-18 | — | — | documented-only — no feature spawned |
| workflow-handoff-integrity-1-9-2 | implemented | conversational (dogfood pós-1.9.2) | 2026-05-19 | 2026-05-19 | prd-workflow-hotfix-1-9-3.md + prd-workflow-handoff-integrity.md | split em 2 PRDs (hotfix SMALL + estrutural MEDIUM); absorve MICRO de agent-chain-continuity |
