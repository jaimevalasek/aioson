---
updated_at: 2026-05-18
briefings:
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
---

# Briefings Registry

| slug | status | source_plans | created | approved | prd | note |
|------|--------|-------------|---------|----------|-----|------|
| harness-driven-aioson | implemented | plans/Harness-Driven/evolucao.txt, plans/Harness-Driven/resumo.txt | 2026-04-10 | 2026-04-10 | .aioson/context/prd-harness-driven-aioson.md | — |
| lay-user-agent-mode | implemented | plans/lay-user-agent-mode.md | 2026-05-16 | 2026-05-16 | .aioson/context/prd-lay-user-agent-mode.md | — |
| agent-chain-continuity-delivery-fix | approved | conversational (@dev diagnostic) | 2026-05-16 | 2026-05-16 | — | PRD deferred (scope-cut to MICRO follow-up) |
| cursor3-harness-evolution | draft | plans/relatorio-proposta-melhoria-analisar.txt | 2026-05-18 | — | — | documented-only — no feature spawned |
