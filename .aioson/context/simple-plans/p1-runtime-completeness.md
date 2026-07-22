# Simple Plan — P1 runtime + completeness fixes

slug: p1-runtime-completeness
status: done
lane: dev/simple-plan (batch P1 confirmado pelo usuário)

## Objetivo

Corrigir os 5 achados P1 do relatório de revisão v1.37.2→v1.39.0.

## Fixes

1. **Lease do dispatcher nunca renovado** (`src/agent-execution/dispatcher.js`): `LEASE_MS=30000`, lease adquirido uma vez e segurado por execuções de até 10min → outro processo rouba o lease após 30s e executa a mesma feature em paralelo. Fix: `renewLease()` (reescrita atômica owner-checked) + `setInterval(LEASE_MS/3)` unref'd, limpo no `finally` antes de `releaseLease`.
2. **Crash `execution_process_conflict` em retry** (`src/runtime-store.js`, `telemetry-bridge.js`, `dispatcher.js`): retry/fallback spawna 2º processo com pid diferente para o mesmo telemetry run → `attachExecutionProcess` lança e derruba o dispatch. Fix: opção explícita `{replace:true}` (executor é sequencial, 1 processo vivo por dispatch); dispatcher passa `replace` a partir do 2º spawn.
3. **Fallback cross-host herda `reasoning_effort`** (`dispatcher.js:22`): candidato espalha `resolved` → claude/opencode (sem capability) recebem `reasoning_effort:'medium'` → `resolveExecutionEntry` falha com `unsupported_reasoning_effort` e o fallback morre. Schema proíbe effort em entradas de fallback. Fix: strip de `reasoning_effort`/`reasoning_effort_verification` quando `item.host !== resolved.host`; same-host preserva (coberto por AC-AEMR-13).
4. **Parser de tabelas markdown** (`src/lib/feature-completeness.js`): `splitTableRow` quebra células com `\|` escapado; `parseFirstMarkdownTable` descarta silenciosamente linhas com contagem de células divergente → CAP/linha required some sem finding (gate passa vacuamente). Fix: split apenas em pipes não-escapados + unescape; parser retorna `malformed:[{row,cells}]`; os 6 validators emitem finding `*_row_malformed` (fail-closed).
5. **Superfície workspace não detectada** (`feature-completeness.js` `detectRichSurfaces`): contrato promete "workspaces" (doc linha 203) mas o detector só cobre kanban/board_cards/crm/crud_admin → PRD de produto workspace-like não ativa o contrato operacional. Fix: conjunção `workspace` + termo de colaboração (members/invite/switcher/team/settings, EN/PT/ES) — evita FP de "project workspace root".

## Arquivos

- `src/agent-execution/dispatcher.js` (fixes 1, 2-wiring, 3)
- `src/runtime-store.js` (fix 2)
- `src/agent-execution/telemetry-bridge.js` (fix 2 passthrough)
- `src/lib/feature-completeness.js` (fixes 4, 5)
- `tests/agent-execution-dispatcher.test.js` (renewLease + retry-spawn E2E)
- `tests/agent-execution-capacity.test.js` (fallback cross-host effort)
- `tests/agent-execution-telemetry-store.test.js` (attach replace)
- `tests/feature-completeness.test.js` (parser + workspace)

## Verificação

- PoC dos 4 bugs reproduzidos antes do fix (escaped-pipe drop, malformed drop, workspace vazio, fallback → `unsupported_reasoning_effort`) e re-executados após: todos corrigidos.
- 14 testes novos (dispatcher: renewLease + retry-spawn E2E; capacity: cross-host effort; telemetry-store: attach replace; feature-completeness: escaped pipe, malformed, gate fail-closed, workspace detect/FP).
- Suíte completa `npm test`: **3897 pass / 0 fail / 1 skip** (baseline 3883 + 14).
- `npm run lint`: limpo.
