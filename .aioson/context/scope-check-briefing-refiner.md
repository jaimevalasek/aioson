---
feature: briefing-refiner
mode: pre-dev
status: approved
checked_at: 2026-06-08
next_agent: dev
optional: false
---

# Scope Check — Briefing Refiner

## Verdict

Approved. O PRD, requisitos, spec, arquitetura, design-doc, readiness, plano de implementação e decisão do orchestrator estão alinhados: a entrega continua sendo um agente opcional de refinamento entre `@briefing` e `@product`, com HTML local, feedback JSON canônico, reaplicação confirmada e nenhum PRD criado/editado pelo refinador. Gate A, Gate B e Gate C estão aprovados; `@dev` pode implementar em sequência.

## Intent / Plan / Delivery

| Claim | Source | Matched by | Verdict | Notes |
|-------|--------|------------|---------|-------|
| Criar `@briefing-refiner` entre `@briefing` e `@product` | PRD / dossier What | Requirements + implementation plan Phase 1 | match | Agente oficial disponível, mas não etapa obrigatória do workflow V1. |
| Gerar revisão HTML local, sem servidor/dashboard | PRD Must-have / Out of scope | `review-html.js` contract + Phase 3 | match | HTML estático e autocontido. |
| Persistir feedback estruturado como fonte canônica | PRD + Sheldon enrichment | Requirements REQ-007 + design-doc feedback-schema | match | DOM/HTML editado não vira fonte da verdade. |
| Fornecer fallback de export/download/copy | PRD open question + Sheldon P0 | Requirements REQ-006 + design-doc | match | File System Access API é melhoria progressiva. |
| Aplicar mudanças só com confirmação humana | PRD user flow | Requirements REQ-008 + apply-feedback contract | match | Zero alteração automática em `briefings.md` sem confirmação. |
| Preservar seções obrigatórias do `@briefing` | PRD Must-have | Requirements REQ-009 + `briefing-sections.js` | match | Bloquear aplicação se seção obrigatória sumir. |
| Alterar briefing aprovado exige nova aprovação | PRD/open question + architecture | Spec decision + implementation plan | match | Contrato final: voltar para `draft` e limpar `approved_at` quando `prd_generated` for null. |
| Não criar/editar PRD | PRD Out of scope | Requirements REQ-014 + implementation plan pre-taken decision | match | Fronteira de ownership preservada. |
| Não deixar `@dev` consumir briefings diretamente | PRD Out of scope | Requirements REQ-015 + implementation plan | match | Implementação parte dos artefatos SDD, não dos briefings. |
| Executar sequencialmente | Orchestrator | Spec decision + implementation plan phases | match | Sem novas lanes; `.aioson/context/parallel/` antigo não deve ser reutilizado. |

## Divergences

- None blocking.
- Warning: `aioson artifact:validate . --feature=briefing-refiner` ainda marca `conformance-briefing-refiner.yaml` como ausente por causa da classificação MEDIUM do projeto. O preflight do `@dev` retornou `READY_WITH_WARNINGS`, não bloqueado; tratar como aviso de cadeia, não divergência de escopo.
- Warning: `.aioson/context/dev-state.md` está stale e pertence a `agent-output-routing-bugs`; `@dev` deve ignorá-lo para esta feature.

## Corrections Applied

- Atualizado este relatório de scope-check para substituir o checkpoint antigo que ainda apontava para `@architect`.

## Revision Requests

- None.

## Implementation Preview or Delivery Diff

| File or area | Expected or actual change | Reason | User-visible result | Confidence |
|--------------|---------------------------|--------|---------------------|------------|
| `template/.aioson/agents/briefing-refiner.md` | Criar prompt canônico | Template-first em inception mode | Novo agente distribuível | high |
| `.aioson/agents/briefing-refiner.md` | Espelhar prompt do workspace | Execução local do agente | Usuário ativa `@briefing-refiner` | high |
| `src/constants.js` | Registrar agent definition e managed file | Resolver agente via registry existente | CLI/harness reconhece o agente | high |
| `src/commands/briefing.js` | Reusar/extrair registry sem quebrar approve/unapprove | Estado de briefing já existe | Fluxo atual continua funcionando | medium |
| `src/lib/briefing-refiner/` | Criar helpers de registry, sections, schema, HTML, report e apply | Separar lógica determinística do prompt | Revisão/aplicação testável | high |
| `.aioson/briefings/{slug}/review.html` | Gerar UI local de revisão | Análise humana visual/editável | Usuário marca edições, notas e bloqueios | high |
| `.aioson/briefings/{slug}/refinement-feedback.json` | Persistir feedback estruturado | Reentrada segura do agente | Alterações reaplicáveis e rastreáveis | high |
| `.aioson/briefings/{slug}/refinement-report.md` | Registrar aplicado/ignorado/bloqueios | Auditoria e handoff para aprovação/product | Usuário sabe próxima ação | high |
| `tests/briefing-refiner.test.js` + agent tests | Cobrir ciclo e contratos | Gate D exige evidência objetiva | Menor risco de quebrar fluxo briefing -> product | high |

## User Confirmation

Continuar significa que o `@dev` deve implementar exatamente o escopo aprovado: agente prompt-first, artefatos locais de refinamento, feedback JSON canônico, reaplicação confirmada, status approved->draft quando aplicável, registry/docs/tests. Não inclui comando `aioson briefing:refine`, servidor, dashboard, PRD generation, nem consumo direto de briefings pelo `@dev`.

## Next Step

Next agent: `@dev`
Why: escopo final pré-dev aprovado; Gate A/B/C aprovados; preflight do `@dev` está `READY_WITH_WARNINGS` com avisos não bloqueantes.
Optional handoff: usar `@scope-check --scope-mode=post-dev` depois do `@dev` se a implementação tocar arquivos inesperados, alterar comportamento planejado ou pular algum item do plano.
