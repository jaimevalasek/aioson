---
slug: qa-corrections-handoff-trail
status: done
owner: dev
created_at: 2026-06-09
updated_at: 2026-06-09
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - QA corrections handoff trail

## Scope
Garantir que correções obrigatórias geradas pelo @qa (`.aioson/plans/{slug}/corrections-*.md`)
sejam SEMPRE encontradas pelo @dev em uma nova sessão, mesmo sem Sheldon manifest e mesmo
após `/clear`. Hoje a trilha só existe quando `manifest.md` existe (gate RDA-05) — caso real:
loop-guardrails, 2026-06-09.

## Gaps identificados
1. **qa.md**: "Corrections plan creation" + auto-cycle (`qa-dev-cycle.json`) estão aninhados
   sob "Sheldon phased plan detection (RDA-05)" — sem manifest, nada é persistido.
2. **qa.md**: mesmo no fallback, o @qa só avisa o usuário no chat; não atualiza `dev-state.md`
   (o primeiro arquivo que o @dev lê na ativação).
3. **dev.md**: a seção "Auto-cycle return to @qa" só olha `qa-dev-cycle.json`; sem ele,
   não há varredura de `corrections-*.md` com `status: open` para a feature ativa.
4. **src/lib/dev-resume.js**: `dev:resume-data` não expõe correções abertas — o auto-resume
   pula direto para o `next_step` obsoleto do dev-state.

## Done criteria
- [x] qa.md (workspace + template): correções + auto-cycle valem para QUALQUER veredito FAIL
      com findings obrigatórios, com ou sem manifest; só a verificação fase-a-fase permanece
      condicionada ao manifest. (Nova seção "Corrections plan & auto-cycle (ANY FAIL verdict)")
- [x] qa.md (workspace + template): após criar o corrections plan, o @qa persiste a trilha com
      `aioson dev:state:write` (passo 2, MANDATORY — never chat-only; fallback manual documentado).
- [x] dev.md (workspace + template): safety net na seção "Auto-cycle return to @qa" — varre
      `.aioson/plans/{feature}/corrections-*.md` por `status: open|in_progress` mesmo sem
      `qa-dev-cycle.json`; correções têm prioridade sobre o next_step do dev-state.
- [x] `buildDevResumeData` retorna `open_corrections` e sobrescreve `next_step` quando há
      correções abertas (fail-safe: frontmatter ausente/malformado = open); 6 testes novos.
- [x] Paridade template verificada: PARITY_OK (git diff --no-index quiet em qa.md e dev.md).
- [x] dev-state.md atual (loop-guardrails) reparado: status `corrections_pending`, next_step e
      context package apontam para `.aioson/plans/loop-guardrails/corrections-2026-06-09.md`.

## Out of scope
- Aplicar as correções C-01..C-03 de loop-guardrails (trabalho da feature, ciclo @dev→@qa próprio).
- Token `corrections` no `dev:state:write --context` (paths fora de `.aioson/context/`; o
  free-text `--next` cobre a necessidade).
- Trilha equivalente para @tester (não gera corrections plan hoje); @pentester já tem trilha
  durável via `security-findings-{slug}.json` consumida pelo dev.md.

## Expected files
- .aioson/agents/qa.md
- template/.aioson/agents/qa.md
- .aioson/agents/dev.md
- template/.aioson/agents/dev.md
- src/lib/dev-resume.js
- tests/dev-resume.test.js
- .aioson/context/dev-state.md

## Verification
- node --test tests/dev-resume.test.js
- git diff --no-index .aioson/agents/qa.md template/.aioson/agents/qa.md (seções alteradas idênticas)
- node src/cli.js dev:resume-data . --json (deve listar corrections-2026-06-09.md de loop-guardrails)

## Session state
Next step: concluído. Trabalho seguinte do projeto: @dev aplicar C-01..C-03 de loop-guardrails.

## Verification evidence (2026-06-09)
- `node --test tests/dev-resume.test.js` → 26/26 pass (6 novos).
- `node --test tests/qa-telemetry-foundation.test.js tests/qa-memory-search.test.js
  tests/scout-qa-findings.test.js` + dev-resume → 41 pass / 1 skipped / 0 fail.
- `node --test tests/agent-contracts.test.js tests/agent-audit.test.js
  tests/memory-context-hardening.test.js` → 28/28 pass.
- `node src/cli.js dev:resume-data . --json` no repo real → `open_corrections:
  [".aioson/plans/loop-guardrails/corrections-2026-06-09.md"]` e next_step reescrito.
- Paridade template: PARITY_OK.

## Notes
- Caso real que motivou o plano: @qa de loop-guardrails reportou "Auto-cycle RDA-05 não
  disparado: não há manifest.md para o slug" e a sessão @dev seguinte não encontrou as correções.
- Decisão: a prioridade de correções abertas foi codificada no `dev-resume.js` (next_step
  reescrito deterministicamente), não só no prompt — prompts degradam, código não.

## Follow-ups da auditoria sistêmica (não implementados — MEDIUM, decidir depois)
Auditoria completa das trilhas A→B entre todos os agentes (2026-06-09) encontrou, além do
caso @qa→@dev (corrigido aqui):
1. @tester → @dev/@qa: `test-inventory.md` e `test-plan.md` não constam no required input de
   nenhum agente receptor — achados do @tester viram chat-only após /clear (só o dossier trail
   persiste um resumo).
2. @scope-check → @dev: `scope-check-{slug}.md` (veredito `patched`/`drift`) não é lido pelo
   @dev na ativação; mitigado parcialmente pelo workflow state, mas o detalhe do patch se perde.
3. Padrão geral: gates "If manifest.md exists" (RDA-02/03/04) também condicionam persistência
   de trilha em @architect/@ux-ui/@dev — risco menor (tracking de fase, não work-to-do).
Falsos positivos descartados: ui-spec.md e readiness-{slug}.md JÁ estão no required input do
dev.md; @pentester JÁ tem write-back durável via security-findings-{slug}.json.
