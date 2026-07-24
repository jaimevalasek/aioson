---
feature: premium-squad-intelligence
status: approved
source_prd: .aioson/context/prd-premium-squad-intelligence.md
prototype: null
prototype_status: none
prototype_feature: null
classification: MEDIUM
created_at: 2026-07-23
---

# Implementation Plan — premium-squad-intelligence

## Objective

Permitir que o operador crie, execute e avalie pelo CLI um squad premium cuja pesquisa atual, composição, aplicação de genomes e conclusão sejam comprovadas por evidência real, mantendo compatibilidade com pacotes legados.

## Repository evidence

- Production entry point: `bin/aioson.js` → `src/cli.js`; os caminhos normais envolvidos são `squad:validate`, `squad:worker`, `squad:autorun`, `squad:score`, `genome:doctor` e o novo `squad:eval`.
- Existing patterns to reuse:
  - `src/worker-runner.js` já executa workers de pesquisa, reutiliza `researchs/` e delimita conteúdo externo com `src/lib/llm-content-sanitizer.js`.
  - `src/web.js` já concentra fetch/scrape HTTP.
  - `src/squad/task-decomposer.js` cria tarefas/dependências e `src/squad/agent-teams-adapter.js` traduz execução em equipe com fallback.
  - `src/squad/cross-ai-synthesizer.js` e `src/squad/reflection.js` fornecem revisão multi-CLI e checks determinísticos.
  - `src/genomes/bindings.js` normaliza formatos legados e `src/squads/genome-binding-service.js` persiste bindings.
  - `template/.aioson/schemas/squad-manifest.schema.json` é a autoridade Draft-07, porém `src/commands/squad-validate.js` ainda não a executa integralmente.
- Package/runtime versions: Node.js `>=18.0.0`; CommonJS; `node:test`; fetch e `AbortSignal.timeout` nativos; SQLite via `better-sqlite3`.
- Test runner: `npm test`; lint: `npm run lint`; gate integral: `npm run ci`.
- Prototype binding: `none`; a baseline é o comportamento atual do repositório.
- No development execution lanes are enabled or requested. `@dev` owns integration in the shared worktree. Tester, Pentester and Validator remain disabled.

## Engineering Controls

| Concern | Evidence / trigger | Planned control | Verification | Recovery |
|---|---|---|---|---|
| Runtime truth and idempotency | `src/commands/squad-autorun.js` returns `ok: true, noScript: true` and then `completed` | Make no-worker, timeout, invalid output and insufficient evidence terminal as `failed`/`escalated`; retain attempt history and exclude them from completed/learning counts | `node --test tests/squad-autorun.test.js` in Phase 1 | Preserve prior plan/session artifacts; reverting the branch restores legacy behavior without data migration |
| Canonical schema validity | The 1,471-line Draft-07 schema exists, while `squad:validate` manually checks six required fields | Compile the installed schema with Ajv in a focused validator; legacy/advisory checks remain separate and `--strict` promotes premium contract gaps to errors | `node --test tests/squad-manifest-validator.test.js tests/squad-validate.test.js` in Phase 1 | Remove the additive validator/dependency and keep the prior validation layers; manifests are never rewritten on read |
| External URL / untrusted content | Research follows external URLs server-side and persists third-party text | Allow only HTTP(S), block private/link-local/loopback targets and unsafe redirects for research mode, bound size/time/source count, keep sanitization and explicit untrusted boundaries; secrets stay in environment/config and never enter reports | `node --test tests/web-security.test.js tests/squad-research.test.js tests/squad-worker.test.js` in Phase 2 | Provider failure becomes `unverified`/`unavailable`; no stale or partial pack is promoted |
| Freshness and cost | `src/worker-runner.js` uses a fixed seven-day TTL and every executor could otherwise repeat searches | Classify `live-required`, `live-check`, `cache-eligible`, `closed-world`; perform one bounded shared research stage and reuse its Evidence Pack | `node --test tests/squad-research.test.js tests/squad-worker.test.js` in Phase 2 | Fall back only when the policy permits; current claims remain blocked/unverified |
| Persistent evidence integrity | Evidence Packs, eval reports, playbook entries and compiled bindings affect later executions | Use contained paths, schema/version fields, content hashes, run IDs and atomic replace; never mutate the previous valid artifact before the new one validates | Phase-specific persistence/round-trip tests plus `npm test` | Keep prior version active and emit an actionable stale/conflict state |
| Expert dilution / roster growth | Existing decomposition assigns only persistent executors and English keyword scores can select weak matches | Record task contribution, owner, reviewer and decision right; add an ephemeral specialist only for a capability gap; weight relevant expertise rather than average votes | `node --test tests/squad-role-scan.test.js tests/squad-task-decomposition.test.js tests/agent-teams-adapter.test.js` in Phase 3 | Fall back to the persistent roster with an explicit uncovered-capability warning |
| Genome staleness and conflict | Binding normalization drops `status`; service writes metadata/readiness without operational propagation | Preserve lifecycle/version, resolve dependencies/conflicts, compile stable operational sections into allowed squad files, record compile hash, and reject pending/stale/no-effect readiness | `node --test tests/squad-genome-compiler.test.js tests/genome-bindings.test.js tests/apply-genome-to-squad.test.js tests/integration/genome-binding-contract.test.js` in Phase 4 | Atomic writes keep the previous compiled prompt/checklist; binding remains non-ready with recovery action |
| Agent context size | `template/.aioson/agents/genome.md` is about 92 KB / 1,929 lines and mixes routing, generation, quality and runtime application | Keep the agent as a compact router and move deep, triggered material into three managed modules without changing its structural/observability contract | `node --test tests/agent-contracts.test.js tests/agent-structural-contract.test.js tests/agent-audit.test.js` in Phase 4 | Restore the previous prompt; new docs are additive and do not alter stored genomes |
| Evaluation independence and overfitting | Current eval is prose-only/opt-in and the playbook activates a captured lesson immediately | Persist source-grounded criteria, held-out cases, per-dimension verdicts and with/without-genome comparison; playbook entries remain candidates until a subsequent held-out pass promotes them | `node --test tests/squad-eval.test.js tests/squad-playbook.test.js tests/squad-score.test.js` in Phase 5 | Keep candidates pending and leave the prior active playbook unchanged |
| Localization and distribution | `role-scan` is English-only; new managed docs/schemas must ship through install/update | Support English and pt-BR signals; add four-locale messages; register every managed module/schema and verify template/workspace parity | `node --test tests/squad-role-scan.test.js tests/i18n.test.js tests/i18n-cli.test.js tests/agent-contracts.test.js tests/sync-agents-copy.test.js tests/install-profile.test.js` in Phases 3–5 | English fallback remains available; template stays canonical |
| Compatibility | Legacy `sourceDocs`, `investigation`, `genomes`, `genomeBindings`, commands and aliases are already covered by fixtures | Normalize additively in memory, preserve legacy fields on writes, add new flags/commands without changing existing defaults except the documented truthful failure/default eval contract | Focused compatibility tests in every phase, then `npm run ci` | Revert additive fields/handlers; no migration or destructive rewrite is required |

## Implementation Delta

| CAP | Action | Existing evidence | Exact paths | Required change |
|---|---|---|---|---|
| CAP-premium-runtime-truth | modify | No-worker is currently converted to successful output and completed status | src/commands/squad-autorun.js | Return failed/escalated for non-execution and require persisted execution evidence before completion/learning |
| CAP-premium-runtime-truth | reuse | Session state already records tasks and terminal statuses | src/squad/state-manager.js | Preserve existing state history and consume truthful statuses |
| CAP-premium-runtime-truth | create | No focused autorun regression test exists | tests/squad-autorun.test.js | Prove no-worker, timeout, invalid/partial output, retry history and completed counts through the real command boundary |
| CAP-premium-evidence | create | No risk/volatility policy module exists beside the fixed worker TTL | src/squad/research-policy.js | Classify live-required/live-check/cache-eligible/closed-world and resolve freshness deterministically |
| CAP-premium-evidence | create | Research worker has no discovery-provider boundary | src/squad/research-provider.js | Add provider-neutral discovery/fetch contract, bounded results, explicit unavailability and injectable test adapters |
| CAP-premium-evidence | create | No execution-linked evidence artifact exists | src/squad/evidence-pack.js | Validate, hash and atomically persist claim/source/contradiction/freshness provenance under the squad session |
| CAP-premium-evidence | modify | Worker currently checks fixed TTL and scrapes only declared URLs | src/worker-runner.js | Route research through policy/provider/Evidence Pack while preserving legacy URLs/cache and sanitizer |
| CAP-premium-evidence | modify | Fetch follows redirects without research-specific SSRF policy | src/web.js | Add opt-in safe-remote mode with scheme/private-range/redirect validation while preserving general web command compatibility |
| CAP-premium-evidence | reuse | External content sanitization and trust wrapping already exist | src/lib/llm-content-sanitizer.js | Continue using the existing untrusted-content boundary |
| CAP-premium-evidence | modify | Manifest schema exposes only topic/URLs/fixed cache hours | template/.aioson/schemas/squad-manifest.schema.json | Add additive research policy/provider/evidence fields and bounds |
| CAP-premium-evidence | modify | Workspace schema mirrors the template | .aioson/schemas/squad-manifest.schema.json | Sync the canonical schema change |
| CAP-premium-evidence | create | No Evidence Pack schema exists | template/.aioson/schemas/squad-evidence-pack.schema.json | Define the versioned source/claim/freshness/contradiction/run contract |
| CAP-premium-evidence | create | Workspace must mirror distributable schemas | .aioson/schemas/squad-evidence-pack.schema.json | Sync the Evidence Pack schema |
| CAP-premium-evidence | modify | Research module accepts one fresh cache hit as sufficient | template/.aioson/docs/squad/research-loop.md | Define policy classes, shared live stage, source requirements, Evidence Pack and failure semantics |
| CAP-premium-evidence | modify | Workspace module mirrors the template | .aioson/docs/squad/research-loop.md | Sync the research contract |
| CAP-premium-evidence | modify | Package contract does not name Evidence Pack lifecycle/path | template/.aioson/docs/squad/package-contract.md | Register evidence as an execution artifact without making it a second specification |
| CAP-premium-evidence | modify | Workspace package contract mirrors the template | .aioson/docs/squad/package-contract.md | Sync the package contract |
| CAP-premium-evidence | modify | Shared cache skill uses a global seven-day rule | template/.aioson/skills/static/web-research-cache.md | Replace fixed authority with risk/volatility policy while retaining seven days as legacy/default hint |
| CAP-premium-evidence | modify | Workspace cache skill mirrors the template | .aioson/skills/static/web-research-cache.md | Sync the cache policy |
| CAP-premium-evidence | create | No unit/integration coverage for freshness/claims/provider fallback exists | tests/squad-research.test.js | Cover classification, cache revalidation, live failure, closed-world, citations, contradictions and atomic packs |
| CAP-premium-evidence | modify | Worker tests do not cover research live/cache behavior | tests/squad-worker.test.js | Add legacy URL/cache and premium research worker regressions |
| CAP-premium-evidence | create | `src/web.js` has no private-target/redirect tests | tests/web-security.test.js | Prove HTTP(S) allowlist, private-range block, redirect revalidation and compatibility opt-out |
| CAP-premium-composition | modify | Role signals use English stopwords/actions/entities | src/commands/squad-role-scan.js | Add locale-aware English/pt-BR token/action/entity extraction with unchanged containment |
| CAP-premium-composition | modify | Decomposer assigns only available persistent executors with equal/simple keyword scoring | src/squad/task-decomposer.js | Record owner/reviewer/decision rights, expertise weight and justified ephemeral specialist requirements |
| CAP-premium-composition | modify | Team adapter only translates manifest executors | src/squad/agent-teams-adapter.js | Materialize approved session-scoped specialists/tasks without adding them to the persistent roster |
| CAP-premium-composition | modify | Manifest lacks explicit composition/decision-right contracts | template/.aioson/schemas/squad-manifest.schema.json | Add optional composition policy and role/ownership metadata |
| CAP-premium-composition | modify | Workspace schema mirrors the template | .aioson/schemas/squad-manifest.schema.json | Sync composition fields |
| CAP-premium-composition | modify | Creation flow derives a roster but does not guard expert dilution | template/.aioson/docs/squad/creation-flow.md | Require task graph, minimum competent roster, decision rights and ephemeral-role justification |
| CAP-premium-composition | modify | Workspace creation flow mirrors the template | .aioson/docs/squad/creation-flow.md | Sync the composition method |
| CAP-premium-composition | modify | Create task does not persist the premium composition contract | template/.aioson/tasks/squad-create.md | Persist composition metadata and execute validation instead of “mentally” validating |
| CAP-premium-composition | modify | Workspace task mirrors the template | .aioson/tasks/squad-create.md | Sync the create task |
| CAP-premium-composition | modify | Squad agent does not state the small-core/session-specialist rule | template/.aioson/agents/squad.md | Route creation through the premium composition and research/eval defaults |
| CAP-premium-composition | modify | Workspace agent mirrors the template | .aioson/agents/squad.md | Sync the agent prompt |
| CAP-premium-composition | modify | Existing tests cover English corpus only | tests/squad-role-scan.test.js | Add equivalent pt-BR signals and preserve path traversal tests |
| CAP-premium-composition | modify | Decomposition tests do not cover owners/reviewers/expertise/ephemeral roles | tests/squad-task-decomposition.test.js | Prove minimum roster and uncovered-capability behavior |
| CAP-premium-composition | modify | Adapter tests cover only persistent teammates | tests/agent-teams-adapter.test.js | Prove session specialist translation and no persistent manifest mutation |
| CAP-premium-genome | create | Binding service has no operational compiler | src/squads/genome-compiler.js | Resolve Track 4.2/single-file operational sections, dependencies/conflicts, target files and compile hash; apply atomically |
| CAP-premium-genome | modify | Service persists blueprint/manifest/readiness only | src/squads/genome-binding-service.js | Invoke compiler, update squad metadata/prompts/checklists/contracts and report changed/no-effect state |
| CAP-premium-genome | modify | Normalizer drops status/compile identity | src/genomes/bindings.js | Preserve lifecycle, version, dependency/conflict and compile fields across legacy/structured merges |
| CAP-premium-genome | reuse | Existing loader preserves single-file genome compatibility | src/genome-files.js | Reuse it for legacy/single-file reads from the compiler |
| CAP-premium-genome | modify | Structured source validation is limited to Track 4.3 | src/commands/genome-doctor.js | Validate premium Track 4.2 source objects, claim provenance, operational sections and compiled binding state |
| CAP-premium-genome | modify | Binding schema omits status/compile/dependency fields | template/.aioson/schemas/squad-manifest.schema.json | Add lifecycle and compile metadata without deleting legacy `genomes` |
| CAP-premium-genome | modify | Workspace schema mirrors the template | .aioson/schemas/squad-manifest.schema.json | Sync genome binding fields |
| CAP-premium-genome | modify | Genome agent is a 92 KB monolith | template/.aioson/agents/genome.md | Reduce to activation/router/contract and trigger-load the new deep modules |
| CAP-premium-genome | modify | Workspace agent mirrors the template | .aioson/agents/genome.md | Sync the compact genome router |
| CAP-premium-genome | create | Generation/provenance instructions are embedded in the monolith | template/.aioson/docs/genome/generation-flow.md | Hold track selection, generation, enrichment and compatibility flow |
| CAP-premium-genome | create | Workspace must mirror managed genome modules | .aioson/docs/genome/generation-flow.md | Sync generation flow |
| CAP-premium-genome | create | Evidence/quality rules are embedded and Track 4.2 is weakly enforced | template/.aioson/docs/genome/evidence-and-quality.md | Define structured sources, claim provenance, fidelity, abstention and held-out evaluation expectations |
| CAP-premium-genome | create | Workspace must mirror managed genome modules | .aioson/docs/genome/evidence-and-quality.md | Sync evidence/quality module |
| CAP-premium-genome | create | Runtime/advisor/application rules are embedded in the monolith | template/.aioson/docs/genome/runtime-application.md | Define advisor loading, squad compilation, conflicts, prohibitions/checklists/output propagation |
| CAP-premium-genome | create | Workspace must mirror managed genome modules | .aioson/docs/genome/runtime-application.md | Sync runtime application module |
| CAP-premium-genome | modify | Binding doc declares operational propagation but code does not prove it | template/.aioson/docs/squad/genome-bindings.md | Make compile lifecycle/hash/no-effect/failure behavior executable and auditable |
| CAP-premium-genome | modify | Workspace binding doc mirrors the template | .aioson/docs/squad/genome-bindings.md | Sync binding contract |
| CAP-premium-genome | modify | Create task permits queued binding but normalizer drops the state | template/.aioson/tasks/squad-create.md | Preserve pending and require compile/readiness result before premium delivery |
| CAP-premium-genome | modify | Workspace task mirrors the template | .aioson/tasks/squad-create.md | Sync genome-pass behavior |
| CAP-premium-genome | create | No compiler behavior test exists | tests/squad-genome-compiler.test.js | Prove section propagation, exact target containment, atomicity, no-effect, dependency/conflict and compile hash |
| CAP-premium-genome | modify | Binding tests do not cover lifecycle/compile fields | tests/genome-bindings.test.js | Add round-trip and merge precedence for new fields |
| CAP-premium-genome | modify | Application test proves metadata/readiness only | tests/apply-genome-to-squad.test.js | Prove prompt/checklist/output behavior changes |
| CAP-premium-genome | modify | Doctor JSON test covers legacy diagnosis only | tests/json-output.test.js | Add Track 4.2 provenance and compiled-state JSON cases |
| CAP-premium-genome | modify | Integration fixture covers legacy/v2 readability but not operational effect | tests/integration/genome-binding-contract.test.js | Add legacy-to-compiled compatibility and no official-agent mutation |
| CAP-premium-genome | modify | Rollout tests do not enforce premium Track 4.2 evidence | tests/genome-rollout.test.js | Add structured source/fidelity readiness regression |
| CAP-premium-assurance | modify | Project has no full Draft-07 validator dependency | package.json | Add pinned-compatible Ajv runtime dependency |
| CAP-premium-assurance | modify | Dependency tree must be reproducible | package-lock.json | Lock the Ajv dependency |
| CAP-premium-assurance | create | Validation logic is embedded in command and not schema-complete | src/squad/manifest-validator.js | Compile/load contained schemas, normalize errors and separate strict premium checks |
| CAP-premium-assurance | create | No machine-readable eval report contract exists | src/squad/eval-contract.js | Validate/persist versioned rubric, cases, per-dimension verdicts, A/B genome results and provenance |
| CAP-premium-assurance | create | Eval exists only as agent prose | src/squad/eval-engine.js | Orchestrate strict precheck, source-grounded rubric, held-out execution, optional jury, A/B and final dimensional verdict |
| CAP-premium-assurance | create | `src/cli.js` has no `squad:eval` handler | src/commands/squad-eval.js | Add thin CLI command with JSON/human output and actionable exit states |
| CAP-premium-assurance | modify | CLI does not register/help `squad:eval` | src/cli.js | Register command/alias/help and delegate to the thin handler |
| CAP-premium-assurance | modify | Validate performs manual layers and has no real strict schema path | src/commands/squad-validate.js | Delegate schema/premium checks, support `--strict`/`--json`, retain legacy warnings in non-strict mode |
| CAP-premium-assurance | modify | Score rewards object presence and a single aggregate can mask failures | src/commands/squad-score.js | Consume current strict/eval/compile/evidence outcomes and preserve separate critical dimensions |
| CAP-premium-assurance | modify | Playbook capture creates immediately active entries | src/commands/squad-playbook.js | Add candidate/evidence/promotion lifecycle gated by a later held-out PASS |
| CAP-premium-assurance | reuse | Cross-CLI review primitive already handles multiple model families | src/squad/cross-ai-synthesizer.js | Reuse when available; preserve explicit single-runtime adversarial fallback |
| CAP-premium-assurance | reuse | Deterministic reflection checks and iteration bounds already exist | src/squad/reflection.js | Reuse for held-out output checks without treating them as the whole eval |
| CAP-premium-assurance | create | No eval report schema ships | template/.aioson/schemas/squad-eval-report.schema.json | Define versioned rubric/case/dimension/provenance/A-B report shape |
| CAP-premium-assurance | create | Workspace must mirror distributable schemas | .aioson/schemas/squad-eval-report.schema.json | Sync eval report schema |
| CAP-premium-assurance | modify | Manifest lacks eval policy/held-out case contract | template/.aioson/schemas/squad-manifest.schema.json | Add optional eval policy/cases and premium-readiness status |
| CAP-premium-assurance | modify | Workspace schema mirrors the template | .aioson/schemas/squad-manifest.schema.json | Sync eval fields |
| CAP-premium-assurance | modify | Squad agent says eval default while its modules call it opt-in | template/.aioson/agents/squad.md | Establish one default: persistent/regulated require strict+eval; explicit ephemeral Quick Scan may defer |
| CAP-premium-assurance | modify | Workspace agent mirrors the template | .aioson/agents/squad.md | Sync the gate default |
| CAP-premium-assurance | modify | Eval method is prose-only and contradicts the default | template/.aioson/docs/squad/eval-gate.md | Define the real command, held-out/A-B/provenance contract, fallbacks and truthful verdicts |
| CAP-premium-assurance | modify | Workspace eval doc mirrors the template | .aioson/docs/squad/eval-gate.md | Sync eval contract |
| CAP-premium-assurance | modify | Task labels eval opt-in and cannot invoke a CLI engine | template/.aioson/tasks/squad-eval.md | Execute `squad:eval`, inspect exit/report, route bounded corrections and re-evaluate |
| CAP-premium-assurance | modify | Workspace task mirrors the template | .aioson/tasks/squad-eval.md | Sync eval task |
| CAP-premium-assurance | modify | Validate task does not define strict schema/evidence/compile checks | template/.aioson/tasks/squad-validate.md | Run and enforce `squad:validate --strict` before eval |
| CAP-premium-assurance | modify | Workspace task mirrors the template | .aioson/tasks/squad-validate.md | Sync validate task |
| CAP-premium-assurance | modify | Create task says to mentally execute validate | template/.aioson/tasks/squad-create.md | Run real strict and eval commands in the default close path |
| CAP-premium-assurance | modify | Workspace task mirrors the template | .aioson/tasks/squad-create.md | Sync executable done gate |
| CAP-premium-assurance | modify | Creation flow reads every captured lesson as active | template/.aioson/docs/squad/creation-flow.md | Read only promoted, held-out-backed playbook entries |
| CAP-premium-assurance | modify | Workspace creation flow mirrors the template | .aioson/docs/squad/creation-flow.md | Sync safe learning policy |
| CAP-premium-assurance | modify | Four locale catalogs lack eval/strict/provider states | src/i18n/messages/en.js | Add canonical English messages |
| CAP-premium-assurance | modify | pt-BR catalog lacks new states | src/i18n/messages/pt-BR.js | Add pt-BR messages |
| CAP-premium-assurance | modify | Spanish catalog lacks new states | src/i18n/messages/es.js | Add Spanish messages |
| CAP-premium-assurance | modify | French catalog lacks new states | src/i18n/messages/fr.js | Add French messages |
| CAP-premium-assurance | create | No strict validator focused tests exist | tests/squad-manifest-validator.test.js | Prove full schema, legacy advisory mode, strict promotion and contained schema loading |
| CAP-premium-assurance | create | No executable eval tests exist | tests/squad-eval.test.js | Exercise real CLI/JSON, held-out pass/fail/unverified, jury fallback, A/B and report staleness |
| CAP-premium-assurance | modify | Validate tests cover manual checks only | tests/squad-validate.test.js | Add strict/full-schema/evidence/compile/default regressions |
| CAP-premium-assurance | modify | Score tests award any genome object | tests/squad-score.test.js | Require current evidence/eval/compile outcomes and prevent aggregate masking |
| CAP-premium-assurance | modify | Playbook tests assume immediate activation | tests/squad-playbook.test.js | Cover candidate, rejected promotion, later held-out promotion and legacy entry reads |
| CAP-premium-assurance | modify | Review-loop tests validate only workflow references | tests/squad-review-loops.test.js | Add independent reviewer/criteria/held-out contract checks |
| CAP-premium-assurance | modify | i18n tests do not know new keys | tests/i18n.test.js | Enforce key parity |
| CAP-premium-assurance | modify | CLI locale tests do not exercise eval/strict states | tests/i18n-cli.test.js | Exercise localized command output |
| CAP-premium-compatibility | modify | Managed list omits existing eval modules and all new genome/evidence/eval modules | src/constants.js | Register touched/new docs, tasks and schemas for install/update without changing profile semantics |
| CAP-premium-compatibility | reuse | Install profile already filters squad/genome surfaces by `uses=squads` | src/install-profile.js | Preserve current distribution boundary |
| CAP-premium-compatibility | modify | Managed/required contract tests do not cover new modules | tests/agent-contracts.test.js | Assert managed files exist, structural hooks remain and template/workspace pairs are complete |
| CAP-premium-compatibility | modify | Sync test does not cover new nested genome docs/schemas | tests/sync-agents-copy.test.js | Prove cross-platform copying and project-state exclusions |
| CAP-premium-compatibility | modify | Profile tests cover existing squad files only | tests/install-profile.test.js | Prove new squad/genome modules ship only with squad usage and all-locale installs |
| CAP-premium-compatibility | modify | Binding integration fixture lacks new fields | tests/integration/genome-binding-contract.test.js | Prove legacy reads/round-trip alongside compiled bindings |
| CAP-premium-compatibility | modify | Binding unit tests lack legacy + premium lifecycle merge | tests/genome-bindings.test.js | Lock additive normalization and no field loss |
| CAP-premium-compatibility | modify | Genome compatibility tests do not cover modularized agent/runtime contract | tests/genome-compat.test.js | Preserve legacy single-file genomes and Track 4.2 coexistence |
| CAP-premium-compatibility | modify | Agent audit tests do not bound the refactored genome activation surface | tests/agent-audit.test.js | Verify compact router, lazy-loaded modules and no structural regression |

## Capability Delivery Plan

| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-premium-runtime-truth | 1 | src/commands/squad-autorun.js, src/squad/state-manager.js, tests/squad-autorun.test.js | `node --test tests/squad-autorun.test.js`; spawn the real autorun command against a temporary squad with and without a worker and assert only the executed task can complete |
| CAP-premium-evidence | 2 | src/squad/research-policy.js, src/squad/research-provider.js, src/squad/evidence-pack.js, src/worker-runner.js, src/web.js, src/lib/llm-content-sanitizer.js, template/.aioson/schemas/squad-manifest.schema.json, .aioson/schemas/squad-manifest.schema.json, template/.aioson/schemas/squad-evidence-pack.schema.json, .aioson/schemas/squad-evidence-pack.schema.json, template/.aioson/docs/squad/research-loop.md, .aioson/docs/squad/research-loop.md, template/.aioson/docs/squad/package-contract.md, .aioson/docs/squad/package-contract.md, template/.aioson/skills/static/web-research-cache.md, .aioson/skills/static/web-research-cache.md, tests/squad-research.test.js, tests/squad-worker.test.js, tests/web-security.test.js | `node --test tests/squad-research.test.js tests/squad-worker.test.js tests/web-security.test.js`; run a research worker through the normal CLI with injected live provider, stale cache, unavailable provider and closed-world policy |
| CAP-premium-composition | 3 | src/commands/squad-role-scan.js, src/squad/task-decomposer.js, src/squad/agent-teams-adapter.js, template/.aioson/schemas/squad-manifest.schema.json, .aioson/schemas/squad-manifest.schema.json, template/.aioson/docs/squad/creation-flow.md, .aioson/docs/squad/creation-flow.md, template/.aioson/tasks/squad-create.md, .aioson/tasks/squad-create.md, template/.aioson/agents/squad.md, .aioson/agents/squad.md, tests/squad-role-scan.test.js, tests/squad-task-decomposition.test.js, tests/agent-teams-adapter.test.js | `node --test tests/squad-role-scan.test.js tests/squad-task-decomposition.test.js tests/agent-teams-adapter.test.js`; use the real role-scan/decomposition path for equivalent en/pt-BR briefs and verify owner/reviewer plus a non-persistent specialist |
| CAP-premium-genome | 4 | src/squads/genome-compiler.js, src/squads/genome-binding-service.js, src/genomes/bindings.js, src/genome-files.js, src/commands/genome-doctor.js, template/.aioson/schemas/squad-manifest.schema.json, .aioson/schemas/squad-manifest.schema.json, template/.aioson/agents/genome.md, .aioson/agents/genome.md, template/.aioson/docs/genome/generation-flow.md, .aioson/docs/genome/generation-flow.md, template/.aioson/docs/genome/evidence-and-quality.md, .aioson/docs/genome/evidence-and-quality.md, template/.aioson/docs/genome/runtime-application.md, .aioson/docs/genome/runtime-application.md, template/.aioson/docs/squad/genome-bindings.md, .aioson/docs/squad/genome-bindings.md, template/.aioson/tasks/squad-create.md, .aioson/tasks/squad-create.md, tests/squad-genome-compiler.test.js, tests/genome-bindings.test.js, tests/apply-genome-to-squad.test.js, tests/json-output.test.js, tests/integration/genome-binding-contract.test.js, tests/genome-rollout.test.js | `node --test tests/squad-genome-compiler.test.js tests/genome-bindings.test.js tests/apply-genome-to-squad.test.js tests/json-output.test.js tests/integration/genome-binding-contract.test.js tests/genome-rollout.test.js`; apply a real Track 4.2 and legacy genome to a temporary squad, inspect changed prompt/checklist/contract, then run `genome:doctor --json` |
| CAP-premium-assurance | 5 | package.json, package-lock.json, src/squad/manifest-validator.js, src/squad/eval-contract.js, src/squad/eval-engine.js, src/commands/squad-eval.js, src/cli.js, src/commands/squad-validate.js, src/commands/squad-score.js, src/commands/squad-playbook.js, src/squad/cross-ai-synthesizer.js, src/squad/reflection.js, template/.aioson/schemas/squad-eval-report.schema.json, .aioson/schemas/squad-eval-report.schema.json, template/.aioson/schemas/squad-manifest.schema.json, .aioson/schemas/squad-manifest.schema.json, template/.aioson/agents/squad.md, .aioson/agents/squad.md, template/.aioson/docs/squad/eval-gate.md, .aioson/docs/squad/eval-gate.md, template/.aioson/tasks/squad-eval.md, .aioson/tasks/squad-eval.md, template/.aioson/tasks/squad-validate.md, .aioson/tasks/squad-validate.md, template/.aioson/tasks/squad-create.md, .aioson/tasks/squad-create.md, template/.aioson/docs/squad/creation-flow.md, .aioson/docs/squad/creation-flow.md, src/i18n/messages/en.js, src/i18n/messages/pt-BR.js, src/i18n/messages/es.js, src/i18n/messages/fr.js, tests/squad-manifest-validator.test.js, tests/squad-eval.test.js, tests/squad-validate.test.js, tests/squad-score.test.js, tests/squad-playbook.test.js, tests/squad-review-loops.test.js, tests/i18n.test.js, tests/i18n-cli.test.js | `node --test tests/squad-manifest-validator.test.js tests/squad-eval.test.js tests/squad-validate.test.js tests/squad-score.test.js tests/squad-playbook.test.js tests/squad-review-loops.test.js tests/i18n.test.js tests/i18n-cli.test.js`; invoke `node bin/aioson.js squad:validate <tmp> --squad=premium-fixture --strict --json` and `node bin/aioson.js squad:eval <tmp> --squad=premium-fixture --json` for pass/fail/unverified/A-B cases |
| CAP-premium-compatibility | 5 | src/constants.js, src/install-profile.js, tests/agent-contracts.test.js, tests/sync-agents-copy.test.js, tests/install-profile.test.js, tests/integration/genome-binding-contract.test.js, tests/genome-bindings.test.js, tests/genome-compat.test.js, tests/agent-audit.test.js | `node --test tests/agent-contracts.test.js tests/sync-agents-copy.test.js tests/install-profile.test.js tests/integration/genome-binding-contract.test.js tests/genome-bindings.test.js tests/genome-compat.test.js tests/agent-audit.test.js`; finish with `npm run sync:agents`, parity checks, `npm run lint`, `npm test` and `npm run ci` |

## Phase 1 — Autorun and strict validation tell the truth

- CAP/AC: `CAP-premium-runtime-truth` / `AC-premium-12`, `AC-premium-13`; foundational portion of `CAP-premium-assurance` / `AC-premium-14`.
- User-visible outcome: a missing/non-running worker can no longer appear in the completed count, and `squad:validate --strict --json` reports the canonical schema failures deterministically.
- Implementation:
  1. Pin Ajv and isolate Draft-07 loading/error normalization in `manifest-validator`.
  2. Delegate strict schema checks from the command while retaining existing non-strict compatibility warnings.
  3. Replace the no-worker success object with a truthful failure/escalation contract and require executed-output evidence before completion or learning.
  4. Preserve retry/session history and existing successful worker behavior.
- Create/modify/reuse/retire: exactly the `CAP-premium-runtime-truth` paths above plus the Phase 1 subset of `CAP-premium-assurance`: `package.json`, `package-lock.json`, `src/squad/manifest-validator.js`, `src/commands/squad-validate.js`, `tests/squad-manifest-validator.test.js`, `tests/squad-validate.test.js`.
- Verification: `node --test tests/squad-autorun.test.js tests/squad-manifest-validator.test.js tests/squad-validate.test.js`; real `bin/aioson.js` invocation from the focused tests.
- Done when: zero non-executed task is completed or learned, and malformed/full-schema-invalid manifests fail strict validation with actionable JSON.

## Phase 2 — Research produces a fresh shared Evidence Pack

- CAP/AC: `CAP-premium-evidence` / `AC-premium-01` through `AC-premium-04`.
- User-visible outcome: a research worker either returns a current, claim-traceable Evidence Pack, explicitly runs closed-world, or fails/unverifies visibly; it never presents stale cache as a live fact.
- Implementation:
  1. Add deterministic risk/volatility policy and a provider-neutral, injectable discovery boundary.
  2. Harden safe remote fetching for research without changing the general web commands' existing opt-out behavior.
  3. Build and atomically persist the Evidence Pack under the execution session; share it with downstream tasks.
  4. Preserve legacy `research.urls`, cache summaries and sanitization.
  5. Align schemas, package/research docs and cache skill in template/workspace.
- Create/modify/reuse/retire: exactly the `CAP-premium-evidence` paths in the delta/delivery row.
- Verification: `node --test tests/squad-research.test.js tests/squad-worker.test.js tests/web-security.test.js`; CLI research worker smoke with injected provider and network sentinels.
- Done when: live-required, stale cache, provider failure, contradictory claims and closed-world all produce the PRD-defined states and evidence.

## Phase 3 — Squad composition follows tasks and expertise

- CAP/AC: `CAP-premium-composition` / `AC-premium-05` through `AC-premium-07`.
- User-visible outcome: en/pt-BR briefs produce a task graph with owner/reviewer/decision rights and the smallest competent roster; a missing specialty can be session-scoped without changing the persistent squad.
- Implementation:
  1. Make role scanning locale-aware while preserving deterministic contained reads.
  2. Add explicit task ownership, review independence, decision rights and expertise weights to decomposition.
  3. Emit ephemeral specialist requirements only for an uncovered capability and let the team adapter materialize them for that session.
  4. Persist only stable composition policy in the manifest; do not inflate the roster.
  5. Update creation docs/task/agent and schema.
- Create/modify/reuse/retire: exactly the `CAP-premium-composition` paths in the delta/delivery row.
- Verification: `node --test tests/squad-role-scan.test.js tests/squad-task-decomposition.test.js tests/agent-teams-adapter.test.js`.
- Done when: equivalent pt-BR/en inputs yield useful role signals, every material task has owner/reviewer semantics, and ephemeral specialists leave no persistent manifest mutation.

## Phase 4 — Genome bindings compile into real executor behavior

- CAP/AC: `CAP-premium-genome` / `AC-premium-08` through `AC-premium-11` (A/B execution completed in Phase 5).
- User-visible outcome: applying a genome shows exactly which prompt/checklist/output behaviors changed, with lifecycle/version/compile hash; pending, conflict, stale and no-effect bindings cannot claim readiness.
- Implementation:
  1. Extend normalized binding lifecycle without breaking legacy arrays/objects.
  2. Resolve operational sections for Track 4.2 and single-file formats and compile only inside the bound squad package.
  3. Atomically patch prompts, checklists, output contracts, squad metadata and manifest/readiness.
  4. Extend `genome:doctor` to structured Track 4.2 provenance and compile status.
  5. Split the large genome prompt into a compact router plus three managed, trigger-loaded modules using the existing structural contract.
- Create/modify/reuse/retire: exactly the `CAP-premium-genome` paths in the delta/delivery row.
- Verification: focused genome test command from the delivery row, `npm run sync:agents`, and parity/agent structural checks.
- Done when: a real binding changes the intended executor artifacts, leaves official agents untouched, round-trips legacy data and fails honestly on missing evidence/dependencies/conflicts/no effect.

## Phase 5 — Strict eval, held-out proof and safe learning close the squad

- CAP/AC: `CAP-premium-assurance` / `AC-premium-11`, `AC-premium-14` through `AC-premium-18`; `CAP-premium-compatibility` / `AC-premium-19`, `AC-premium-20`.
- User-visible outcome: `squad:eval` is a real localized CLI command that runs strict precheck, source-grounded criteria and held-out cases, compares with/without genome when bound, preserves critical dimensions and promotes playbook learning only after a later pass.
- Implementation:
  1. Add versioned eval contract/engine/command and use existing cross-AI/reflection/worker primitives behind a thin CLI.
  2. Persist human and machine-readable results under the squad package with source/run/artifact hashes.
  3. Replace presence scoring with current Evidence Pack, strict validation, compiled bindings and eval outcomes.
  4. Make playbook capture a candidate and require subsequent held-out PASS for promotion.
  5. Align all agent/docs/tasks defaults, four locales, managed file inventory and template/workspace distribution.
  6. Run focused, compatibility, parity, lint and full regression suites.
- Create/modify/reuse/retire: exactly the `CAP-premium-assurance` and `CAP-premium-compatibility` paths in the delta/delivery rows.
- Verification: both focused commands in the delivery rows, then `npm run sync:agents`, `npm run lint`, `npm test`, `npm run ci`, `aioson agent:audit . --inception --json`, and hashes for every touched template/workspace pair.
- Done when: persistent/regulatory squads cannot become ready without current strict+eval evidence, Quick Scan deferral is explicit, a critical failure is never masked, legacy fixtures pass and the complete suite is green.

## Production-path evidence required from Dev

- `bin/aioson.js squad:autorun` on a temp package proves no-worker is not completed and a real worker is.
- `bin/aioson.js squad:worker` on live-required/stale/closed-world fixtures proves Evidence Pack behavior.
- The role-scan → task decomposition → team adapter chain proves a pt-BR task plus an ephemeral specialist.
- Applying a Track 4.2 and a legacy genome proves prompt/checklist/output changes and `genome:doctor --json` diagnostics.
- `bin/aioson.js squad:validate --strict --json` plus `bin/aioson.js squad:eval --json` prove pass/fail/unverified and with/without-genome reports.
- `npm run sync:agents`, template/workspace parity, install-profile tests, lint and full suite prove distribution and compatibility.
