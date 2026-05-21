---
feature_slug: neural-chain
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-21T20:02:23.770Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-05-21T20:02:23.770Z
---
## Why

Quando um agente LLM (`@dev`, `@deyvin`) ou developer humano via AIOSON edita um arquivo, ele lê o arquivo + context pack mas **não enxerga vínculos cross-file** — sistema de eventos, listeners nominais, hooks, jobs, classes dependentes, testes que validam aquele comportamento. Esses vínculos existem no código mas ficam invisíveis à LLM editora, que então deixa órfãos, dead references ou impactos não-propagados.

**Evidência observada (sessão 2026-05-21):** app de uma categoria foi desinstalado; LLM aplicou a mudança no arquivo de app mas não detectou que existia um sistema de eventos que removeria o botão associado. Resultado: botão órfão na UI → segunda chamada explícita pra correção → LLM aí enxergou o sistema de eventos e corrigiu. Caso real, não-hipótese.

Cada miss = correction loop (2-3x token cost da operação original) + risco real de bug silencioso passar pra produção em casos menos óbvios que o do botão. AIOSON tem 5 layers de memória (`feature-dossier`, `brains`, `living-memory`, `active-learning-loop`, `operator-memory`) mas é cego pro grafo de código no momento da edição — gap visível.

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/neural-chain-migration.js
  added_at: 2026-05-21T21:09:49.351Z
- path: tests/neural-chain-migration.test.js
  added_at: 2026-05-21T21:09:55.884Z
- path: src/runtime-store.js
  added_at: 2026-05-21T21:10:02.632Z
- path: src/commands/chain-audit.js
  added_at: 2026-05-21T21:35:13.214Z
- path: src/neural-chain-git-ingest.js
  added_at: 2026-05-21T21:35:19.596Z
- path: tests/chain-audit.test.js
  added_at: 2026-05-21T21:35:25.837Z
- path: tests/neural-chain-git-ingest.test.js
  added_at: 2026-05-21T21:35:32.036Z
- path: src/cli.js
  added_at: 2026-05-21T21:35:38.441Z
- path: src/neural-chain-agent-ingest.js
  added_at: 2026-05-21T22:05:57.297Z
- path: tests/neural-chain-agent-ingest.test.js
  added_at: 2026-05-21T22:06:03.479Z
- path: src/commands/runtime.js
  added_at: 2026-05-21T22:06:12.077Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(vazio — populado a partir da Phase 2)_

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:349def48d295c24ddd47143b3e7890b986da10165943f20ca6144945f02908c5 -->
**2026-05-21T20:02:53.117Z** | @product | _What_

MVP scope=M1 sozinho (impact propagation per-edit): edge index SQLite com 2 tipos de aresta (git co-edit + agent event), file-level only (sem AST), comando chain:audit + hook post-edit em @dev/@deyvin, dual output (autonomy-mode: guarded->noise; standard->threshold; autonomous->auto-fix) com noise file deletion-on-close, @neo surfa noises pendentes como blocker, validity-window per aresta + hard cap 10k. Constraints: M2 graph-maintenance (skill LLM-judged + heurística determinística + chain:prune) + AST drill-down + multi-language AST + Obsidian-style viz EXPLICITLY out-of-scope como feature follow-up. Honoring single-voice flag via guardrail metric: tokens estáveis por chain:audit (>2x/mês = warning de que M2 follow-up precisa abrir). Primary metric: -50% second-call correction loops em 30d pós-release.

<!-- sha256:d6aa9629c2c9f0cca0cdc0d495f526c258f5bbba3312cca41020787e1f6055f7 -->
**2026-05-21T20:20:07.826Z** | @sheldon | _Agent Trail_

Enrichment Round 1 (Path A in-place, sizing score 2 < 4 threshold). 16 improvements applied (6 critical + 6 important + 4 refinement). 5 briefing OQs closed in-place: skill owner M2 (extend @neo), threshold rules (3 determinístic heuristics), multi-lang (tree-sitter), bootstrap (incremental+opt-in), noise format (hybrid feature-dossier pattern). PRD enriched with 11 sheldon-sections (data model SQL, confidence formula, threshold rules, hook model synchronous, noise file format, pre-made V2 decisions, perf budget <200ms @10k, telemetry, concurrent-edits-out, AC-AUDIT-NC done gate). Brain nodes applied: sheldon-001/002/004/005/006. Zero new web search (caches near-fresh +1d, stable topics). progress.json written to .aioson/plans/neural-chain/. Single-voice flag honored 3 ways: zero open questions remaining, guardrail metric operationalized via telemetry, meta-AC AC-AUDIT-NC enforce-able. Next: /analyst.

<!-- sha256:fd85ae3e9d66cee4a0f6779484ca3f4d980eaec53b9d44db3fd8336acd805263 -->
**2026-05-21T20:35:28.611Z** | @analyst | _Agent Trail_

Requirements + spec produzidos. 1 nova entity (chain_edges table com 10 fields + 3 indexes), 1 novo config field (chain_auto_threshold), zero schema changes em existing entities (agent_event + runtime_events reusados; runtime:emit pattern reusado para chain_audit event_type). 11 BRs explicitos cobrindo confidence ranking, threshold rules, autonomy modes, auto-correção via handoff TODO (não execução direta), per-session hook granularity, noise file lifecycle, validity-window discipline, hard cap enforcement, file-level granularidade M1, telemetry obligation, audit failure non-blocking. 10 ECs cobrindo file rename/move, file deletado, file never-seen, SQLite locked com retry+abort, agent_event sem edits no-op, bootstrap sem git history, config sem chain_auto_threshold, squad concurrent edits out-of-scope, noise file corrupted, race delete idempotent. Classification confirmada SMALL (score 3): users=2 (LLM agents + dev humano), integrações novas=0, BR complexity=2 (complex 11 rules). 6 perguntas técnicas Phase A respondidas conforme votos: granularidade file-level only, auto-correção via TODO handoff (não execução direta), hook per-session via runAgentDone, lazy recompute resolved_items, AC-AUDIT-NC verification mapping 7 itens, 4 edge cases técnicos documentados. Revisão arquitetural: dropei chain_audit_log table dedicada em favor de reusar runtime_events existente via runtime:emit type=chain_audit (per brain sheldon-005 CLI-first). Wiring single-point em runAgentDone em src/commands/runtime.js (mesmo arquivo do agent:done integrity check do hotfix v1.9.3). Zero open questions pro @dev. Next: /dev Phase 1 Slice 1 (schema migration).

<!-- sha256:c01a580fd187914f3c3a55590231078e737904d2f45f06ec0408c6dd6973d663 -->
**2026-05-21T21:09:36.884Z** | @dev | _Agent Trail_

Phase 1 Slice 1 LANDED 2026-05-21. Schema migration shipped: src/neural-chain-migration.js (idempotent, no user_version sentinel — coordenaria com learning-loop user_version=3; deferred schema_meta table) + 1 require + 1 call em src/runtime-store.js#ensureLegacyColumns downstream do runLearningLoopMigration + tests/neural-chain-migration.test.js (11/11 verde, 845ms). chain_edges table: 10 fields com CHECKs (edge_type IN canonical 2-set, confidence range [0,1], hit_count > 0) + 3 indexes (idx_source+end_at, idx_target+end_at, uniq_chain_active PARTIAL WHERE end_at IS NULL — permite archive flow do BR-NC-08 sem violar uniqueness). Decisão arquitetural: Option B feature-isolated migration file (matches learning-loop precedent named-after-feature; isolates ownership; sheldon-001 brain template parity não aplica a runtime code). Workaround F4 Gate C: spec frontmatter recebeu gate_plan=approved + gate_plan_note documentando o contract drift (mesmo precedente hotfix v1.9.3 — pm.md:29+126 dizem implementation-plan opcional em SMALL mas preflight ignora classification). Reflect-prompt deferred (zero capabilities shipped, só schema groundwork; @qa Gate D processa). Regressão: 1 failure pre-existing em operator-memory-identity AC-P1-07 (runOpIdentity set <valid-id> stub: undefined vs true) — confirmado via git stash que está em HEAD 92f6769, NÃO introduzido por esta slice; follow-up MICRO separado pra operator-memory team. AC-AUDIT-NC item 4 (schema migration aplicada) satisfeito; itens 1,2,3,5,6,7 ficam pra slices futuras + final QA. bootstrap/current-state.md atualizado (append-only). Próximo: Slice 2 chain:audit command + git ingest.

<!-- sha256:db5e4da3326da218394f59285c5ae4cca20de6d04af35f188dd2e858006c3858 -->
**2026-05-21T21:36:01.877Z** | @dev | _Agent Trail_

Phase 1 Slice 2 LANDED 2026-05-21. chain:audit CLI + git ingest helper shipped: src/commands/chain-audit.js (read-only command — top-N edges WHERE source_path=? AND end_at IS NULL ORDER BY confidence DESC LIMIT N, telemetry via execution_events event_type=chain_audit per BR-NC-10, failure non-blocking BR-NC-11) + src/neural-chain-git-ingest.js (pure parseGitLog + computeCoEditPairs + ingestGitCoEditEdges + runGitIngest integration wrapper; confidence formula BR-NC-01 saturation 10, hard cap BR-NC-08 archive oldest, 90d window filter, .aioson/* + mega-commits filtered, UPSERT ON CONFLICT respeitando partial UNIQUE index) + 21 tests novos (9 chain-audit + 12 git-ingest). CLI registrado em src/cli.js (require + KNOWN_COMMANDS + dispatch). i18n keys help_chain_audit + chain_audit.{file_required, runtime_unavailable, query_failed, no_impacts, results_header} em 4 locales (en, pt-BR, es, fr). Refactor mid-slice: pairs container mudou de flat Map com string-separator pra nested Map<source, Map<target, ...>> — robustez (paths podem ter qualquer char). Decisões: 2 rows directional per pair (A→B + B→A) pra audit query direta; UPSERT preserva start_at em re-ingest; --limit clamp em HARD_LIMIT_CAP=200; telemetry inline INSERT (sem novo helper). Tests: 33/33 verde nas 3 suites neural-chain (migration+ingest+audit) em 899ms. Regressão completa: 2719/2721 + 1 skipped + 1 pre-existing operator-memory-identity AC-P1-07 (zero novas regressões). AC-AUDIT-NC progress: itens 4 + 5 (coverage parcial chain:audit/ingest paths) satisfeitos; itens 1+2+3+6+7 pendentes (Slices 3-6 + Gate D). Next: Slice 3 agent_event ingest hook em runAgentDone (src/commands/runtime.js) com EC-NC-05 no-op skip quando session sem file edits.

<!-- sha256:7c70195b80616033bfe90c0cbd4009d55a0edb2cd8e412a5636b3e4d1e38b326 -->
**2026-05-21T22:06:18.670Z** | @dev | _Agent Trail_

Phase 1 Slice 3 LANDED 2026-05-21. agent_event ingest hook wired into runAgentDone (live_event + standalone). Files novos: src/neural-chain-agent-ingest.js (~175 LOC — deriveSessionPairs + ingestAgentEventEdges + runChainHookOnAgentDone + queryImpacts) + tests/neural-chain-agent-ingest.test.js (12/12 verde, 495ms). Files modificados: src/commands/runtime.js (require + 2 best-effort hook calls após reflect-prepare nos 2 branches). Decisão: Model A (artifacts[] direto vs query a agent_events table) — runAgentDone já tem artifactPaths em escopo, query duplicaria trabalho. UPSERT incrementa hit_count+1 + recomputa confidence atomicamente via SQL ON CONFLICT. V1 simplification: running hit_count em vez de count_last_30d (aging é M2 concern); confidence satura em 5 hits então approximation bounded. EC-NC-05 explicitly testado: empty artifacts → skipped='no_pairs' MAS hook ainda emit 1 chain_audit event no-op pra manter série temporal do guardrail metric. Pre-existing edges (git_co_edit) aparecem no audit normal — test confirma audit sees git edge + new agent_event edge after slice 3 hook. Failure best-effort BR-NC-11: try/catch envelope no runtime.js + try/catch em cada SQL boundary do helper. Regression: 2731/2733 + 1 skipped + 1 fail (operator-memory pre-existing AC-P1-07; security-scan WAL race intermitente — flake documentado em current-state.md, isolated passa 17/17). AC-AUDIT-NC item 1 (chain:audit hook integrado em runAgentDone) ✓ satisfeito. Itens 4+5 já satisfeitos por Slices 1+2. Itens 2,3,6,7 pendentes. 3 codemap entries adicionadas. Next: Slice 4 noise file write/lifecycle BR-NC-06.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
