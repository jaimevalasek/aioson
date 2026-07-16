---
feature: loop-guardrails
mode: pre-dev
status: patched
checked_at: 2026-06-09
next_agent: architect
optional: false
---

# Scope Check — Loop Guardrails

## Verdict

Intenção, enriquecimento e planejamento estão alinhados. Os 7 must-haves e 5 should-haves do PRD têm cobertura 1:1 nos REQ-1..20 do analyst, o out-of-scope foi herdado sem contradição, as 2 fases dos requirements espelham o Delivery plan do PRD, e todas as âncoras de código citadas pelo @sheldon foram verificadas no source e conferem (`runtime-store.js:741`, `sandbox.js:126`, `harness.js:39`, `self-implement-loop.js:224`). Uma correção segura foi aplicada (seção `## What` do dossier estava com placeholder "PRD não encontrado" apesar do PRD existir). Nenhuma divergência de contrato — o caminho está liberado para o @architect.

## Intent / Plan / Delivery

| Claim | Source | Matched by | Verdict | Notes |
|-------|--------|------------|---------|-------|
| Scope guard (globs, defaults seguros, porcelain vs baseline, normalização Windows) | PRD must-have 1 | REQ-2..6, EC-1..6 | ✅ aligned | Deny vence allow (REQ-5) explícito |
| Human gates temáticos + approve/reject persistido + retomada idempotente | PRD must-have 2 | REQ-12..15, EC-8..9 | ✅ aligned | "Um gate por tema, todos aprovados p/ retomar" é elaboração legítima do analyst |
| Enforcement de orçamento (chars/4, 80/100%) + `max_runtime_minutes` | PRD must-have 3 | REQ-7..8, EC-10..11 | ✅ aligned | `cost_ceiling_tokens` existe e nunca é aplicado — confirmado no código (só `harness.js:39`) |
| Avaliação determinística de `criteria[]` + assinatura de falha 2x | PRD must-have 4 | REQ-16..17, EC-7, EC-13 | ✅ aligned | Reuso de `executeInSandbox` verificado (`sandbox.js:126`) |
| Artefatos por tentativa (`attempts/{n}/`) | PRD must-have 5 | REQ-9, §2.3 | ✅ aligned | |
| Retrocompatibilidade (contratos antigos válidos, `npm test` verde) | PRD must-have 6 | REQ-11, EC-12 | ✅ aligned | |
| Validação de schema do contrato no preflight | PRD must-have 7 | REQ-1 | ✅ aligned | Ausência de validador confirmada no código |
| Should-haves (status, presets, diff.patch, limites de diff, git:guard) | PRD should-haves | REQ-10, 18, 19, 20 + §2.3 | ✅ aligned | Todos marcados should-have nos requirements também |
| Out of scope (loops/, loop:*, juiz IA, Play, USD, security_high_finding) | PRD | Requirements §8 | ✅ aligned | Herdado por referência, sem contradição |
| Fase 1 / Fase 2 | PRD Delivery plan | REQ-1..11 / REQ-12..20 | ✅ aligned | Partição exata |
| Classificação SMALL (score 2) | Requirements §9 | config.md scoring | ✅ aligned | MEDIUM no dossier é herança do projeto, já justificado em §9 |
| Hook pós-verify ~linha 224 | Sheldon enrichment | `self-implement-loop.js:224` (`runVerification`) | ✅ verified | Âncora exata no código |

## Divergences

- Nenhuma divergência de contrato. Observações menores, não-bloqueantes:
  - `workflow.state.json` está desatualizado (`next: "analyst"`, completed só `product`) enquanto o @analyst já concluiu com Gate A approved. Estado é de propriedade do CLI — sincroniza no próximo `aioson workflow:next . --complete`; não editado à mão.
  - EC-loop-guardrails-2 (path sujo proibido re-modificado) tem decisão fina deliberadamente adiada para @architect — ambiguidade documentada, não drift.

## Corrections Applied

- `dossier.md` (`## What`): placeholder "PRD não encontrado" substituído pelo resumo do MVP scope, diretamente inferido do PRD (artefato de maior autoridade). Correção local, estreita, sem decisão de produto.

## Revision Requests

- Nenhuma.

## Implementation Preview or Delivery Diff

| File or area | Expected or actual change | Reason | User-visible result | Confidence |
|--------------|---------------------------|--------|---------------------|------------|
| `src/commands/self-implement-loop.js` (~224) | Hook pós-verify: scope guard, orçamento, artefatos por tentativa (Fase 1) | REQ-1..11 ancoram todos no mesmo ponto | Loop pausa por violação/orçamento em vez de continuar cego | Alta |
| `src/commands/harness.js` | Validador de schema do contrato + campos novos no template | REQ-1, §2.1 | Typo em campo do contrato falha com erro explícito | Alta |
| `src/commands/harness.js` ou novo `harness-*.js` | `harness:approve` / `harness:reject` / `harness:status` (Fase 2) | REQ-14, 18 | Decisão humana persistida e auditável | Média (estrutura de arquivos a definir pelo @architect) |
| `src/sandbox.js` | Sem mudança — reuso de `executeInSandbox` | REQ-16 | Checks de criteria com timeout/kill já resolvidos | Alta |
| `src/runtime-store.js` | Sem migration — produção de `token_count` + tipos de evento novos | §2.5 | Telemetria de orçamento no dashboard | Alta |
| `src/commands/git-guard.js` / `src/lib/git-commit-guard.js` | Merge de `forbidden_files` do contrato (should-have) | REQ-20 | Pre-commit reforça a fronteira | Média |
| `.aioson/plans/{slug}/` | `baseline.json`, `attempts/{n}/`, `gates/{id}.json` | §2.2–2.4 | Artefatos auditáveis por tentativa | Alta |

## User Confirmation

Continuar significa: o @architect desenha o caminho técnico para evoluir o `self:loop` existente com scope guard, orçamento aplicado, gates humanos e checks determinísticos — tudo in-place no `harness-contract.json`, sem subsistema novo, em 2 fases, com contratos antigos continuando válidos. A única decisão fina em aberto (EC-2: path sujo proibido re-modificado durante o loop) será resolvida pelo @architect, com mínimo aceitável já definido (warning no preflight).

## Next Step

Next agent: @architect
Why: Gate A aprovado e escopo alinhado; falta o design técnico (estrutura de módulos, decisão fina EC-2, Gate B) antes do @discovery-design-doc e do @dev.
Optional handoff: após o @dev, recomendo `@scope-check --scope-mode=post-dev` — a feature toca hook central do loop e contrato compartilhado, drift de implementação é plausível.
