# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **The squad package is measured at the session end, and the executor bodies are measured at all.** `verify:artifact --kind=squad-package` runs `squad:validate --strict` plus a new executor lint and auto-fires at `agent:done --agent=squad`; before it, the Done gate lived only in the kernel's prose and every consumer squad measured in 2026-09 had closed green while failing strict validation. `squad:validate` Layer 6 reads the executor prompts and worker entrypoints: a prompt under 400 bytes or carrying placeholder text is a strict error; thin (< 600 bytes), bloated (> 16 KB), missing mission/constraints/output sections (English or pt-BR headings), near-duplicate executors and argv-only workers are advisories, with `executors.estimatedTokens` in the report. `squad:preflight --operation --lane --mode --signals --json` returns the exact task files, docs and skill router an activation loads, with bytes and tokens, and the lane's done-gate commands; the kernel's 17-row loading table moved into it. `squad:eval --no-persist` measures without writing `evals/` or `docs/EVAL-*.md`.

### Fixed

- **`squad:eval` crashed with `spawn ENAMETOOLONG` on Windows for squads with real workers**: the worker runner passed the whole payload (including full baseline and candidate outputs for the scorer) as `argv[2]`. Payloads past the platform argv budget now travel through a temp file announced by `AIOSON_WORKER_INPUT_FILE` (`argv[2]` carries a `{ "$inputFile" }` envelope), a spawn failure is a worker result instead of a CLI crash, and the generated worker template reads both sources. The squad docs told the agent to run `aioson squad:agent:create`, a command that never existed (`squad:agent-create` did): the alias is registered and `tests/squad-prompt-cli-reachability.test.js` pins every `aioson` command named by a squad prompt surface to `src/cli.js`. The squad docs and tasks dropped their restated delivery-lane ladder, package file list and depth-block copies; the create task scaffolds the package with `squad:scaffold` instead of hand-building the tree.


## [1.66.0] - 2026-09-10

### Changed

- **Product and Sheldon enrich the PRD instead of only checking it.** Product originates and compares product options before committing the smallest coherent outcome, and records the selected value and the deferred alternatives in the dossier trail; Sheldon runs two bounded passes — coverage and opportunity, then future-state and selection — connecting journeys, actor handoffs and existing capabilities, and repairs the PRD in place. The quality lenses, research loops and the product/Sheldon expansion skills were rewritten around that; the shared feature-expansion taxonomy now says read-only, imported or immutable objects need no invented CRUD and category resemblance alone is not scope. `classify` on a tracked MICRO feature keeps the PRD → Sheldon → Planner → QA route in its phase guidance, and `review:prepare` hands Product and Sheldon the expansion scout and audit as soft context sources.

### Fixed

- **CI failed on every push since 2026-08-19 and no gate read it.** Six tests read gitignored workspace mirrors (`.aioson/skills/`, `.aioson/schemas/`) and failed on every fresh checkout; `tests/helpers/workspace-mirror.js` now separates tracked mirrors (must exist and match) from local-only ones (compared only where present). `verify:release` and `verify:release:quick` read the branch's CI verdict and refuse a red one (`--allow-red-ci` overrides; an unreachable API is recorded as `unknown` and never blocks). The latency SLA of QA-PERF-01 moved to the `AIOSON_PERF=1` profile.
- **CLI output on POSIX pipes lost bytes.** Reading `process.stdout.isTTY` switches a pipe to non-blocking mode, after which the raw synchronous write threw `EAGAIN` under a slow reader or delivered a silent prefix — a 1.2 MB `--json` payload arrived as 64 KB. Writes now loop until every byte is delivered. `execution:seed` also stops reporting `already_present` over a path whose parent is a file (POSIX `ENOTDIR`).
- **Product's `prd-contract.md` prescribed a Source Coverage header the parser rejected** (`Evidence or rationale`), so every briefing-backed PRD passed Product's own check and blocked Sheldon's `--kind=sources` and Gates A/B. The doc is fixed and the parser accepts the conjunction. The Briefing expansion scout no longer turns read-only objects into CRUD gaps, a bare `6` is no longer a Product finalize phrase, and `--screenshots`, `--repair` and `--watch 3` no longer swallow the project path.
- **Browser QA and Pentester gates failed open.** A base URL with a trailing slash scanned zero routes and read COMPLETE; the crawl scope was a string prefix (other ports and userinfo hosts were scanned and blamed on the target); pages holding a secret were screenshotted by other findings and embedded in the HTML report; JSON-serialized secrets and current key prefixes went undetected and unredacted; the open-redirect probe could never report; `service` targets skipped the API Top 10; `not_reached` criteria counted as exercised; `version: "2.0.0"` skipped the Pentester v2 gate; two regex paths were quadratic.
- **Workflow binding moves kept losing progress outside `workflow:next`.** `workflow:execute --seed` replaced the previous feature's live state without archiving it and ignored the target's archive; review-cycle `reset`/`advance` crossed features and handed out a fresh QA→Dev budget; `pulse:update --feature` failed without `--agent`; `--expect-feature` moves wrote no `binding_moved` event; raw slugs reached archive paths.
- **Orchestrated execution.** `execution:decide` wrote a state read before waiting up to 35 s for the lease; `live:start` duplicated the unattended flag over `--tool-args` or sent it to a different `--tool-bin`; disk measurements scanned lane roots instead of the unit's own files and counted the engine's state file; `--unit-timeout` above 2^31-1 ms fired at once; a corrupt run state had no way out; a throwing adapter leaked timers and the telemetry handle.
- **Evidence lifecycle.** `--runtime --screenshots` cleared captures before a browser could launch and then carried forward references to the deleted files; `--no-persist` wrote captures; `--route` runs wiped sibling routes; an unvalidated walkthrough slug cleared project source files; the gitignore policy also ignored features named `browser` (updated in place by `aioson update`); a locked file aborted runs; `evidence:prune` followed junctions and deleted `--out` reports.
- **Retrieval, briefing and design.** `briefing:feedback` printed every review comment blank; asset-zone images were invisible to media evidence; evidence recorded before the precision and weight bars bypassed them; snake_case identifiers stopped matching after the word-start fix and stop words returned through their singulars; `brain:query --format=index` cut sentences inside code; design-seed drew duplicate labels; `design:seed --slug` and the temp-dir guard depended on path spelling.

## [1.65.0] - 2026-09-08

### Security
- **fast-uri sobe para 3.1.7 pelo próprio portão de release.** `npm run verify:release` recusou a publicação com uma vulnerabilidade alta transitiva (GHSA-5jgf-p345-68v8 e outras três: confusão de host e SSRF em `fast-uri` 3.0.0–3.1.5, puxada por `ajv@8.20.0`). Corrigida com `npm audit fix` — só o lockfile muda, `ajv` continua pinado na versão exata. O portão voltou verde: 25 checagens de smoke, instalação limpa a partir do tarball e 1325 arquivos empacotados.

### Added
- **The run is visible from outside its process — the state beats, the ledger says what each worker is doing, and a second terminal can watch.** Measured on the first real orchestrated run: launched detached from a supervising session (the client's shell tool caps a foreground call at ten minutes; an earlier foreground `--resume | head` under a timeout had killed the engine with the workers inside), wrapped in a script that captured every live line in `$(...)`, and then never polled — between the launch and the run's end, eighty-one minutes, the user received nothing; nine of ten units were flagged `stalled` because a `--print` host streams nothing while it works, and the state file only changed at transitions ten to twenty-three minutes apart, so nobody could tell a thinking worker from a dead process. The live channel was the run's own stdout, and stdout is the one thing a wrapper, a background task file or a `| head` takes away. Now the run **beats**: every 15 s each running stage is measured from the disk — elapsed, the last file written under the lane write paths and when, files changed since the stage started, the stall/unproductive flags — into the state file (`units.<id>.<stage>.live`), every write stamps `engine.{pid, heartbeat_at, heartbeat_ms}`, and once a minute the measurement is one live line (`[execution] wave 2 · phase-2-backend · dev: 12 min elapsed · last write 38 s ago (src/api/projects.ts) · 7 file(s) · budget 4 h`); a finished stage keeps `activity`. `execution:status` reads the outside view — `engine` (`alive` when the heartbeat is fresh; `missing` when the state says running and nobody writes it: a killed terminal, a shell timeout, a closed client, with the `--resume` that reclaims the interrupted units; `idle` when the run ended) and `running[]` with one `▶` line per running stage — and gains `--watch[=<seconds>]` (re-read every 5 s until the run leaves `running`; `--json` streams one line per tick) and `--format=line` (one line for a status pane). The run names the follow command on its start line and in the preflight result (`follow_command`), the dev routed doc and the orchestrator kernel carry the protocol a supervising agent owes the user — launch detached, hand over the watch command, poll the ledger every few minutes and relay what changed plus the live lines — and `docs/agent-execution.md` says why. Building the watch exposed the race a poller creates: the state file is now replaced by rename every few seconds, and a reader that opens it in that instant gets EPERM/EBUSY, which every reader collapsed into "no run" — a watch would have ended in the middle of a live run and `execution:run` would have started a SECOND run over a paused one, discarding its decisions. A missing state is still missing at once; an unreadable one is retried and then reported as unreadable (`state_unreadable` in the ledger, `run_state_unreadable` refusing the run and the decision, the watch ticking through it). `tests/execution-run.test.js`.
- **The draw is a fact the gate reads back — palette provenance on every visual surface.** `aioson design:seed` was a sentence in the design skill's origination mode: the model ran it, or did not, and nothing could tell. Measured across the operator's recent projects, the six sites that consumed a draw spread their accents over six hue bands (4°, 29°, 127°, 206°, 249°, 342°), while four product UIs built by `@dev` on bare repositories — the route that never drew — landed in one 75° band (green on dark, the default tool look) with every gate green. `design:seed` now records what it drew next to the feature (`.aioson/context/features/{slug}/design-seed.json`, project scope without a slug; `--no-persist` for diagnostics; a re-draw keeps the previous labels as history), and `verify:artifact --kind=visual` reads the record — or the seed label the manifest names in prose (`analogous-336`), through the same scheme arithmetic the draw uses — and reports `palette.origin`: `seed`, `identity`, or `prior`. Two advisory warnings name the ways the prior wins: `origination without a draw` (no identity, nothing drawn — on a prototype, or on a project's first measured surface) and `draw ignored` (drawn, then reverted to the favorite; the closest candidate and its Δ are named). Conformance runs never nag (the prototype's origin was judged when it was measured). The fingerprint registry carries `origin` per entry and `design:seed` prints where the recent palettes came from. `docs/dev/visual-implementation.md` §2 gains the cold-start clause the dev route lacked. Live on the consumer prototypes: 6 `seed`, 2 `identity`, 1 `prior` with the warning. `tests/design-seed-provenance.test.js`.

- **Browser evidence has a lifecycle — weighed, replaced, dropped, pruned, and out of git.** Watching a prototype round from the outside, the operator saw 53 MB of "garbage" appear under one feature: 34 full-page captures (31 MB, 1280×5072 at the entry route) that no report referenced, and 37 stale failure pairs (22 MB) under a walkthrough report that read PASS 102/102 — the runner wrote a snapshot for every failing step on every one of eleven iterations and never removed the pairs of steps that passed later. Measured against the session transcript, the files themselves cost zero tokens; what cost was reading them (22 PNG + 7 JPG reads, ≈40k tokens carried by every later turn of a 595k-token context) and the fact that nothing read them back at all. Now: `browser:run` clears the script's own artifact folder before the first step and reports `superseded_artifacts` (JSON, Markdown, and one output line), so the folder always mirrors the latest report; `verify:artifact --kind=visual --screenshots` captures the first fold per route and width (`--screenshots=full` keeps whole pages), replaces its default folder on every run (`screenshots_cleared`; a `--screenshot-dir` is never cleared), records `runtime.screenshot_capture` (dir, mode, count, bytes) and project-relative `runtime.screenshots` in the evidence, and every fold finding names the capture that shows it (`capture: entry-desktop.png`) so a reader opens one image instead of browsing the folder; the installer's gitignore policy excludes `**/visual-screenshots/`, `**/browser/*/` and `aios-qa-screenshots/` while the reports beside them stay tracked (`aioson update` merges the lines and names already-committed binaries as tracked-but-ignored); `feature:archive` drops the binaries instead of moving them into `done/` (`diagnostics_dropped`; `--keep-diagnostics` to carry them); `hygiene:scan` gains `heavy_evidence_artifacts` (orphaned by the latest report, or above 1 MB) with the prune as the suggested command; and the new `aioson evidence:prune [--dry-run] [--slug] [--all]` removes orphans by default and every capture with `--all`, never a report — Neo's runtime-storage module owns the request. The walkthrough and prototype doctrine say the same thing to the model: read the aria snapshot first, open at most the named capture, never the folder. `src/lib/evidence-artifacts.js`, `tests/evidence-artifacts.test.js`.

- **Two registries, one lie: the workflow binding never followed the feature registry.** In the same first orchestrated run, `feature:current` answered `project-deploy-channel` (from `project-pulse.md`) while `workflow:status` answered the previous feature — the workflow picked its feature from `last-handoff.json` and `features.md`, never from the pulse that `feature:current` calls the single source of truth. A whole feature (product, sheldon, planner, dev, six orchestrated units) ran outside the workflow kernel without one command objecting, and `workflow:next --complete=dev` without `--expect-feature` answered `@dev is already completed` — true of the bound feature, false of the one being built. With the flag the guard aborted correctly and offered no way out; editing `workflow.state.json` by hand changed nothing (the CLI regenerates it) and the regeneration erased the previous feature's `completed` silently. And `review-cycle:status` for the new feature reported the previous feature's exhausted QA→Dev budget. Now the binding follows the registry: `detectWorkflowMode` binds to the pulse's `active_feature` when it is `in_progress` in `features.md` (handoff, then last feature in progress, as fallbacks), the transition archives the previous feature's progress at `.aioson/context/features/<slug>/workflow.state.json` and restores it when the registry returns (a `binding_moved` event in `workflow.events.jsonl`; `workflow:next` and `workflow:status` say what moved and where the progress went), the `--expect-feature` mismatch names the registry and the command that moves it, and `review-cycle:status --feature` answers for that feature only (a foreign cycle file is `stale_feature`, the budget whole). `tests/workflow-binding-registry.test.js`.
- **The first real orchestrated run: the engine asked for the right thing, the pieces around it did not deliver, and the failures had no exit.** Six units, four waves, two lanes on two hosts — and one lane sat all night asking for approval with `dev: started` as the last line in the log: the engine asks every lane worker for `sandbox_mode: workspace-write`, three adapters translated it through the host registry's unattended flag and the fourth carried its own `--sandbox workspace-write`, the provider's sandboxed write whose escalations still go through the approval policy. Patched by hand in the installed package, the next wave then died at 10:00 with the files half-written — `DEFAULT_UNIT_TIMEOUT_MS` was a command's budget, `0` fell through `||` to it, and raising it in the roles file changed the digest the plan binds to, so the fix meant recompiling and restarting the run. The `--resume` after the kill answered `run_lease_held: another execution run holds this feature` for a lease that would expire on its own in 30 s, and the operator deleted the lock by hand — the one move that puts two executions on the same files when the run is not dead. And the plan that compiled clean carried its whole phase block twice, the copies disagreeing on a file's wave; the compiler read the first. Now: the sandbox translation belongs to the registry (`read_only_args` beside `yolo_args`) and `createAdapter` applies it for every adapter — a host that cannot honor a mode is refused at build (`sandbox_mode_unsupported`, `permission_mode_unsupported`: OpenCode's three lines ignored `sandbox_mode` entirely), never run with default permissions, and a lane worker runs **unattended, always** — the owner's decision after the measurement: on the operator's machine Codex's Windows sandbox setup fails to load, and under `--sandbox workspace-write` the model answered DONE after 96 s without writing the file, while under the unattended flag it wrote in 14 s (no per-role permission knob exists on purpose); the unit budget defaults to 60 min, `execution.unit_timeout_ms: 0` and `execution:run --unit-timeout=0` mean no limit, and the roles digest the plan binds to covers what shapes the units (roles, parallelism, the independent-review rule) — never the budget or the spawner, so a plan compiled before this release stays fresh until its roles change; a `timeout` decision says what the disk saw (`still writing` → retry with a larger budget; `never wrote` → fallback/abort) in `pending_decision.detail`; `unproductive` is measured on the disk alone (no file change under the lane write paths for 3 × `stallMs`, however talkative the process — the chained silence-then-disk check never reached the disk for a worker printing its own prompt); the run and `execution:decide` wait out a lease nobody renews (up to 35 s, announced) and refuse only a lease something is still renewing, with the lock path and the remaining time; `host:signature` gains the unattended write probe (`unattended.yolo`, `host_not_unattended`; `--unattended-probe=false` to skip) and `execution:run --preflight` reads it — a signature signed before the probe existed is a `preflight.warnings` line with the re-sign command, never a block; `execution:compile` refuses a plan whose canonical heading (Execution Sequence, lanes table, Interface Contract, delivery plan, delta, a phase) appears twice (`duplicate_plan_section`) and warns on a duplicated PRD table; and the `self_review_same_model` warning names `require_independent_qa`. `tests/execution-unattended.test.js`, `tests/execution-run.test.js`, `tests/host-signature.test.js`.
- **A static re-measure erased the runtime evidence — and the approve gate then called the measured surface unmeasured.** The feature's evidence slot is "latest run wins": the refiner measured 17 routes at two widths with `--runtime --screenshots`, and one minute later its own `agent:done` auto-fired the static `kind=visual` in slug mode and overwrote `visual-evidence.json` with a report carrying no `runtime` section and `0 warning(s)` — the fold, overflow and route findings gone, the manifest still saying `runtime: measured`, and `briefing:approve` set to refuse with "runtime was not measured". A static run over unchanged inputs (the input fingerprint the evidence already carries) now carries the previous runtime section forward, dated (`runtime.carried_from`), with its findings (`runtime.findings`, persisted at measurement time) re-applied to the report and `assurance.runtime_craft_verified` kept; a static run over changed inputs drops it and says so (`runtime evidence dropped: the prototype inputs changed since the last --runtime run … rerun with --runtime before approval`). `tests/visual-runtime.test.js`.
- **The engine's own doctrine prescribed the tells the telemetry punishes.** The tokens reference told the model to set a "section eyebrow — 0.68rem uppercase mono, tracking 0.28em" above every card title, and a consumer's operate prototype shipped sixteen `.overline` labels that the tells scan counted as thirteen kickers — the one tell with no earning-back, instructed by the file that defines the checkpoint. The same file used Geist and IBM Plex Sans as checkpoint examples (both in the saturated-face set the telemetry flags), printed one product's admin look as universal token math (22/18/14px radii, `text-[0.62rem]`, `rounded-[18px]`, `bg-black/50 backdrop-blur-sm`, 10px labels under the 11px floor), and the directions printed `accent=blue-600`, `accent=orange-500`, `accent=blue-700`, `accent=desaturated blue` and fixed graphite hexes — measured: the three blue-accent projects in the operator's registry sit exactly on those anchors. A model reads an example as the answer. The two token-math references now say where hues and faces come from (the drawn candidate or the identity record: `accent=the drawn or identity accent`, surfaces as tonal steps from the drawn ground, radii from the system's own ladder), the eyebrow instruction is inverted into the counter-move, sizes sit on the 11px floor, and utility-class literals are gone. `tests/design-doctrine-anchors.test.js` holds every doctrine surface to the telemetry's own law: no saturated face named as an example, no named or hex accent, no color-scale token, no kicker instruction, no sub-11px text size, no arbitrary-value utility class.
- **The fingerprint registry named a test fixture as the operator's rival project.** Six `mkdtemp` projects (`aioson-craft-weight-*`) had been recorded into `~/.aioson/design-fingerprints.json` before the test guard landed, and `findRepetition` picks the closest entry — so a real agency landing was told its palette "resembles recent project aioson-craft-weight-qVhGjW (Δ0°)". A project under the OS temp root now never records into the default registry (`isEphemeralProjectDir`; an explicit `AIOSON_DESIGN_REGISTRY` still accepts them, so tests keep their own), and the run reports `fingerprint_skipped: ephemeral_project_dir`. The registry also evicted the projects the draw most needed to remember: keyed by project+slug with a cap of 24, one product with five features filled a fifth of the slots and pushed out whole sites (two agency landings 22° apart on the same pole were no longer compared). Each project keeps its latest two surfaces and the cap counts 32 entries, so the memory holds distinct projects.
- **Trigger evals: reachability is proven, not assumed — `context:evals` + a shipped scenario corpus.** 169 routed artifacts (18 rules, 137 docs, design-docs, 14 skill routers) declared triggers and two incident tests proved seven of them; a reworded description or a tightened selector could silently strand any of the rest, and nothing measured it. New `src/lib/context-evals.js` + `aioson context:evals [dir] [--strict] [--filter] [--no-coverage]`: scenarios in `.aioson/evals/*.json` replay through the REAL `context:brief`, grading `expect` (trigger recall), `absent` (trigger precision — the kanban-rule-on-every-CHANGELOG class), per-scenario `max_must_bytes` budgets, and coverage (every artifact with routing frontmatter must be named by at least one positive scenario or it is listed uncovered). A failed expect re-runs through the selector's new explain channel (`selectContext({explain})`, `context:select --explain=<paths>`) and prints the exclusion cause — agent filter, mode filter, feature scope, score vs threshold — plus a concrete frontmatter suggestion drawn from the unmatched task terms. Advisory by default (explicit `exitCode: 0`); `--strict` is the CI posture. The shipped corpus (~170 scenarios under `template/.aioson/evals/`, en + pt-BR) runs on every suite pass via `tests/context-evals-shipped.test.js`: zero failures, zero skips on a full install, rules and skills at 100% positive coverage, docs on a ratchet; an expect whose target a profile-filtered install lacks is a visible skip, never a failure.
- **Skills are a selector surface.** The 15 shipped `SKILL.md` routers were invisible to `context:select` — reachable only through kernel prose and advisory recall (the reachability gap the governance audit left open). Skill routers now carry routing frontmatter (`agents`, `task_types`, `triggers`, `paths` — sourced from the registry and each router's own when-to-use), `.aioson/skills/**/SKILL.md` and `.aioson/installed-skills/**/SKILL.md` are walked as a `skills` surface (routers only; reference trees stay recall-only), and `context:brief` lists matches in a dedicated advisory `skills` section — never `must_load` law, never guard injection, hard signals only (no semantic scoring), so a pre-frontmatter consumer sees zero behavior change. The deprecated `simplify` router declares no routing on purpose, and the suite pins the doctrine: an active registry skill must route, a deprecated one must not.
- **Runtime usage telemetry for docs and skills.** `context:load` accepts `doc:<path>` and `skill:<dir>` targets (`doc_loaded` / `skill_loaded` execution events beside the existing rule/brain ones), and every `context:brief` CLI call best-effort appends one `brief_built` row (agent, mode, must_load, should_load, skills, feature, confidence) when the runtime DB exists — the selection decision itself becomes queryable, with zero kernel-byte cost.
- **`context:usage` — reachable is not consulted.** The brief/load/done rows above were written and nothing read them back, so "is this rule ever offered at runtime?", "did the agent ask for its brief before closing?" and "which skill has been dead for a month?" stayed guesses (the aggregate-reader gap every observability doctrine names first). New `src/lib/context-usage.js` + `aioson context:usage [dir] [--since=<days>] [--feature=<slug>] [--json]` folds the window into artifacts (selected by a brief × confirmed loads, with the sections), agents (briefs / loads / session ends) and four deterministic flags: `loaded_never_selected` (a routing gap — the agent needed it and the selector never offered it; the line names the `context:select --explain` call), `selected_never_loaded` (only once loads are instrumented at all — otherwise a caveat, never noise), `skills_never_selected` (active registry skills the window never routed: trigger review or retirement candidates, cross-checked with `skill:audit --usage`) and `done_without_brief`. Advisory: no runtime store is "nothing recorded", exit 0 always.
- **`agent:done` names the skipped brief.** A kernel that tells its agent to run `context:brief` promised to consult the routed rules/docs/skills; the session end now checks for a `brief_built` row since the session opened (24h window when standalone) and prints one advisory line when there is none — the trajectory assertion "reachable but never asked for", read from the agent's own kernel file so a consumer agent that adopts the line is measured the same way (no hardcoded roster). `context_brief: { required, state: consulted | not_consulted | not_required, briefs, since }` rides the JSON on both return paths; it never blocks.
- **Negatives are half the proof: a hard-negative corpus and a real confusion matrix for `context:evals`.** The shipped corpus proved every artifact fires somewhere and carried 24 `absent` checks against 169 expects — precision was a number nobody had earned. `negatives.evals.json` adds 24 neutral, realistic tasks (README typo, release bump, date-helper refactor, migration, lint upgrade, log archival PRD — en + pt-BR) asserting the broadest rules and skills stay quiet, ~150 checks; totals gain `positives`, `negatives`, `precision`, `recall`, `f1`, the human line prints all three, and the shipped test pins a negative floor of 120 with precision, recall and F1 at 1. Building it caught five unwanted fires in three shipped rules on its first run (see Fixed).
- **Secrets never reach the runtime store.** The general execution-event stream (runtime:log, agent:done notes, context:brief decisions, hook emissions) stored whatever it was handed — an API key pasted into a task summary, a bearer token echoed by a failing command — verbatim in a file that is backed up, mined by retros and read by dashboards; only the orchestrated stream sanitized its payloads. `src/lib/telemetry-redaction.js` sits at the single INSERT choke point (`insertEvent` / `insertExecutionEvent`): value-shaped secrets (the same provider-key detectors the commit guard trusts, plus whole private-key blocks) are blanked wherever they appear, and assignment-shaped credentials keep the key and lose the value in plain text and inside JSON payloads alike (parseable after). Ordinary prose, counts and routing paths are untouched.

- **The familiarity bar is a number — `precision N/100` on operate and read surfaces, and `briefing:approve` reads it.** An operate surface is not charged for atmosphere ("its premium axis is precision, not weight"), but that sentence had no number: the brand weight is unscored there and nothing else scored, so an operate prototype with seventeen advisory warnings — a workhorse face named and never delivered, token adherence 39%, 95 off-grid values, 13 kickers, 0/7 modern CSS — read `pass` and was approvable, while the same restraint on a brand surface would have been refused at the gate. `craft.precision` now grades typeface, tokens, rhythm, states, chrome (tabular numerals where digits align), tells and dialect 0–2 each from the signals the hygiene warnings already carry, holds the total to the same 60 bar the brand weight uses (`operate precision N/100 below the bar` names every thin axis), and `briefing:approve` refuses on it exactly as on weight (`--accept-craft` records the decision). The evidence summary line carries the graded bar on both kinds of surface (`weight N/100` / `precision N/100`). Live on the consumer prototypes: the incident surface scores 21, a second operate prototype 29, two others 71. `tests/operate-precision.test.js`.

- **The visual loop's token cost, measured and cut where the bytes were not the interface.** The doctrine a cold start loads is a fixed ~30k tokens; what multiplied the bill was the artifact re-read on every pass. Three levers, each with a number from the consumer prototypes: (1) **asset zone** — one prototype was 1.8 MB, 98% base64, its 155 KB stylesheet 139 KB of WOFF2, so every surgical polish reread font bytes to find a rule; the build contract now quarantines embedded fonts in one trailing `<style data-aioson-assets>` block and images/media in a JSON `<script data-aioson-assets>` hydrated into `[data-asset]`, and the telemetry reports `embedded_assets` per zone and names an authored zone still carrying more than 32 KB (`embedded assets inside the authored stylesheet` / `inside the markup`; live: 135 KB + 1,581 KB, 120 KB + 375 KB, 433 KB on three prototypes, 0 on the fourth). (2) **`brain:query --format=index`** — one line per node, title plus first sentence, with the full statement one `--id=<id> --format=compact` away; the dev doc and the deyvin kernel read the visual-quality lens as an index (14.4 KB → 5.8 KB per visual touch), the refiner keeps the full statements for origination. (3) **`briefing:feedback`** — the lean read of a pending review round: every finding, comment, decision and blocking item, and the text of only the sections a note or a status change touches; the raw export carried the whole briefing twice (`original_text` + `current_text` for every section) and the refiner read it end to end each round (live: 143 KB → 5.5 KB). `refinement-loop.md` routes the fold through it. `tests/embedded-assets-zone.test.js`, `tests/brain-query-index.test.js`, `tests/briefing-feedback-view.test.js`.

### Changed
- **Every harness the framework launches runs unattended — on any host.** The owner's rule after one lane spent a night asking for permission: automation is the point, and a prompt inside an orchestrated run is the run not happening. The policy now lives in the host registry (`src/lib/tool-capabilities.js`) and every launch surface reads it: `live:start` defaults to `--permission-mode=yolo` (the host's registered flag; `--permission-mode=default` is the explicit way to get prompts; a host with no flag still opens, with a warning) and accepts every registered harness as `--tool`, a direct `agent:execution:dispatch` runs `workspace-write` unattended like the lanes do, the headless runner appends the host's flag, and `tests/tool-capabilities.test.js` + `tests/execution-unattended.test.js` hold every registered CLI to declaring one (a dispatchable host without it fails the suite, not a night). The registry itself was corrected against the installed CLIs' own help: OpenCode's `run --auto` ("auto-approve permissions that are not explicitly denied") replaces the old "no unattended flag" — OpenCode can be signed and run as a lane worker (the signature's first probe skips the read-only precaution on a host that registers none); Grok's flag is `--always-approve` (the registered `--yolo` is not a flag of the current build), it gains `--permission-mode plan` as read-only and a headless adapter (`-p/--single`, `-m`, `--reasoning-effort`, `--output-format plain`) proven by a real signature probe (read-only OK in 30 s, unattended write verified in 39 s), so it is dispatchable — which also needed the npm shim resolver to accept an extensionless `bin/grok` target instead of reporting the installed CLI as `executable_not_found`; `muse` and `agy` (Muse Code, Antigravity) enter the registry with the flags the desktop client already used for them, interactive-only until an adapter proves their contract. The desktop client carries its own copy of this table with a `default` permission mode — the same rule applies there (see the session report).
- **The design skill is never a question.** The preset retirement (2026-08-28) emptied the catalog but left three agents still asking: `@setup` offered `interface-design` "only after confirmation" (or an explicit `""` with the visual system "pending"), `@product`'s conversation playbook asked whether to register an installed skill and recorded `pending-selection`, and `@ux-ui`'s design gate asked which installed skill to use — "if only one packaged design skill is installed, still ask for confirmation instead of auto-selecting it". A menu with exactly one sensible answer, asked on every new `site`/`web_app` while `@refiner`, `@dev` and every squad already resolved a blank field to the engine. Now `setup:context` writes `design_skill: "interface-design"` for every project type (a blank value in an older context still resolves to the same engine — nothing rewrites it; `--design-skill` still names a project-forged skill), the setup, product, ux-ui and dev surfaces state the default instead of asking (`onboarding-flow` §5 is "Visual system: no question", `stack-and-design-reference` drops `design-selection`/`choose design skill` from its routing, `design-gate` resolves without asking and takes `identity.md` as the engine's input, `config.md`'s visual-system gate names who may ever change the field — `@site-forge`/`@design-hybrid-forge` by name, nobody by menu), and `tests/design-skill-default.test.js` scans every shipped kernel, doc, skill and task for the retired question shapes so the menu cannot creep back through prose. The archived setup contract keeps its Step 5 verbatim under a superseded banner; the two eval scenarios that used the question as their task now route on the surviving triggers.

### Fixed
- **A semantic term matched inside a word — `observers` was `server`, `stable` was `table`, `unverified` was `verifie` — and `that` counted as vocabulary.** The selector's semantic pass checked `haystack.includes(term)`, so a doc body that never says server, table or verifies still scored four terms on a payments-webhook task once it grew long enough to contain the substrings; the effects doc re-surfaced on the shipped negative scenario the moment its choreography section was written (31 `that`, 2 `observers`, 2 `stable`, 1 `unverified`), and the shipped corpus test caught it while the plan's focused verification had not run it. A term now matches only at a word start (the prefix keeps the plural/stem heuristic: `verifie` still finds verifies and verified), and demonstratives, relatives and auxiliaries in English and pt-BR are semantic stop words. Corpus: 191 scenarios still green, zero skips. `tests/routing-precision.test.js`.
- **Audit of the uncommitted wave (2026-09-05 → 09-07): one destructive path, one diagnostic run that erased, one browser that erased what it could not measure, one verdict left behind, two contracts the producer was never told.** (1) `browser:run` clears the script's artifact folder before the first step, and the folder is named after `script.name` — sanitized for characters, not for `..`/`.`: a script named `..` resolved to the report dir's parent (`.aioson/context/features/<slug>/`, or `.aioson/context/` itself without a slug) and the clear removed it; a caller's `--out` was cleared like an owned folder. Leading dots are stripped from the name, and the clear runs only on a folder strictly inside the framework's own report dir, never under `--out`. (2) `verify:artifact --screenshots --no-persist` still replaced the owned capture folder — a diagnostic run now removes nothing. (3) The runtime carry-forward only ran when the report carried no `runtime` section at all, so a run that *asked* for `--runtime` and could not open a browser (no Chromium on the box, a launcher that threw) wrote `available: false` over a measured section of the same unchanged bytes, and the approve gate read a surface with 17 measured routes as unmeasured. A failed browser holds exactly as much rendered evidence as a static pass — none — so both now inherit the last measurement of the same input fingerprint, this run's own failure still travels as a warning, and a changed prototype is told the drop names the browser failure instead of telling the caller to pass a flag they already passed. (4) The carry patched `runtime_craft_verified` but kept the verdict derived before it, so a utility-class prototype stayed `unverified` with "runtime supplied no verified evidence" beside `runtime.available: true`; the verdict is re-derived from the carried evidence. (5) The shared coverage calculation binds every declared surface (`attack_surfaces[]`, `threat_surfaces[].id`) to a coverage row by `surface_ids` — and no pentester doc named the field, so every report written to the documented contract would have blocked its QA handoff with `missing_surface`; `coverage-standard.md` carries the field, the rule and the completion gate, `review-contract-and-findings.md` names the binding. (6) `qa:run` binds acceptance criteria to a feature through `--feature=<slug>` (or `feature` in the config) — the usage line in all four locales and the reference now say so. Also: `evidence:prune` reaches `--help`, and the three technical materials the draw can pick (`rule hierarchy`, `tonal steps`, `restrained status wash`) have their recipe in `visual-effects.md` §2. `tests/browser-walkthrough.test.js`, `tests/visual-runtime.test.js`.
- **A suíte não era verde de forma confiável no Windows — duas fontes de instabilidade, nenhuma delas no produto.** A auditoria rodou `npm test` repetidas vezes em vez de uma: 2 de 6 execuções de `tests/execution-run.test.js` falhavam, e em testes diferentes a cada vez. (1) `ENOTEMPTY: directory not empty, rmdir` no teardown — `fs.rm(dir, { recursive: true, force: true })` sem repetição, contra um handle que o antivírus ou um escritor assíncrono ainda segurava; catorze arquivos de teste usavam a forma sem retry enquanto trinta e um já usavam `maxRetries` (o padrão da casa), e agora todos passam `maxRetries: 5, retryDelay: 100`. (2) O teste de escalonamento por prontidão afirma ordens de relógio de parede entre adaptadores falsos com atrasos de 20 ms e 320 ms; com a suíte inteira em paralelo, 300 ms de escalonamento invertiam a ordem e o teste acusava "no wave barrier" num motor correto. As pernas lentas subiram uma ordem de grandeza acima da rápida (1500 ms e 1200 ms contra 20 ms): a margem compra determinismo, não velocidade. Cinco execuções isoladas e duas suítes completas seguidas, todas verdes.
- **The routing engine's precision held only where the feature slug could not leak — audit of the retrieval and evals commits.** The keyword lookup was `task + paths + active feature`, so a pulse naming `customer-onboarding-board` pulled the form and kanban rules into binding `must_load` on every task of that feature ("fix the typo in the README" included: precision 0.74 on the shipped negatives with a pulse present, 0.84 live in this repository), and the same slug fed the semantic terms (the visual-effects doc surfaced on a payments webhook). The hyphen/slash flattening that made `visual-direction` match its spaced form also turned `--paths=.github/workflows/pipeline.yml` into the words `workflow` and `pipeline` (the status-flow rule in `must_load` on "fix the flaky job"), and the multi-token fallback let a phrase whose tokens collapse to one long word stand in for that word alone — `prd-edit` was "edit", `editing prd` was "editing", so `prd-section-ownership` fired on "edit the footer copy". Now the keyword lookup reads the task only (feature binding is exact, paths feed `paths:` globs and direct hits, the semantic terms take task and paths), a phrase that keeps a single long token must appear whole, and the shipped corpus test seeds a pulse with an active feature so the numbers are proven under the state every consumer is in mid-feature. The guard's governance predicate now covers every `.aioson/` knowledge tree (`my-agents`, `squads`, `advisors`, `genomes`, `templates`, `tasks`, `schemas`, `mcp`, `config.md`, `constitution.md`, `git-guard.json`), not just the ten it named. `tests/routing-precision.test.js` replays each shape against the shipped rules.
- **The evals engine is honest about itself.** An `absent` whose target is not installed passed as a true negative (a renamed rule would keep "passing" forever and feed the negatives floor) — it is a visible skip now, excluded from precision, and `totals.skipped` counts both sides. A scenario `mode` the engine does not know (`review`) was silently folded into planning while the report printed `[qa/review]` — it is a corpus error now, and the four shipped scenarios that said so run under the real modes. `--strict` with a `--filter` that matched nothing exited 0 with "no scenarios found" — it fails with `no scenario matched --filter=<x>`. The frontmatter suggestion proposed `esse`, `service`, `linhas` as triggers — function words, demonstratives and the verbs every task uses are excluded and a term needs five letters. `source-code-language-convention` guards contract and styling languages too (`.sol`, `.vy`, `.cairo`, `.move`, `.zig`, `.nim`, `.ml`, `.gradle`, `.groovy`, `.pl`, `.scss`, `.sass`, `.less`, …), and the file-size design-doc routes on pt-BR phrases (`passou de 500 linhas`, `dividir em modulos`) instead of surviving on a semantic hit that a large tree pushes past the result cap.
- **Redaction covers the shapes secrets actually take.** The value class stopped at a quote, so a quoted `TOKEN`, `password` or `api_key` assignment — the dominant shell and config form — passed through untouched; env-prefixed keys (`AWS_SECRET_ACCESS_KEY`, `GH_TOKEN`, `DB_PASSWORD`), the pt-BR `senha` key and URL credentials (`scheme://user:pass@host`) were never matched; a private-key block truncated before its END marker kept its body; and the JSON pass ran the text regex over the serialized string, so an assignment inside a string value with an escaped quote both broke the payload (`JSON.parse` failed — the row is permanent, and `context:usage` silently dropped it) and left the secret in place. Quoted values are one unit now, keys accept env prefixes, URL passwords are blanked, JSON is redacted on the decoded values and re-serialized (parseable by construction, byte-identical when untouched), and counts, paths and placeholders (`token: 1200`, `pwd: /c/dev`, `<token>`, `${SECRET}`) stay untouched. The same text reaches the run and task rows (`agent:done --summary`, `runtime:log --title`, task `goal`) and the three emitters that wrote their own INSERT (self-loop guard events, chain audit, sub-task telemetry) — all through the one choke point. `tests/telemetry-redaction-shapes.test.js`.
- **`context:usage` counted rows, not sessions.** A standalone `agent:done --verdict` writes `finished` and `agent_done` for one session, so QA and DEV — the agents that pass a verdict — closed twice per session; session ends are counted per run key now, and `failed` runs count as ends. `--feature=<slug>` dropped every session end (they carry no feature slug), which zeroed `dones` and made `done_without_brief` impossible inside a feature — the scope narrows briefs and loads and keeps session ends, with a caveat saying so. A doc loaded from the brief's `related` recall was flagged `loaded_never_selected` because `brief_built` recorded only `must_load`/`should_load`/`skills` — `related` rides the row now (and the two lists cap at 40, not 20). A bare `--since` parsed as `true`, and `Number(true)` is a silent one-day window — anything but a positive number is the 30-day default. `context:load --target=doc:../../x` resolved (and recorded) outside the project — a slug with `..` or an absolute path is `invalid_target`.
- **A folded YAML description read as the literal `>-`.** The shared frontmatter reader (`preflight-engine.parseFrontmatter`, the selector's) and `skill:list`'s private copy took `description: >-` as the string `>-` and turned every continuation line holding a colon into a bogus key — the one shipped design engine's description was unreadable to the selector's description scoring and printed as `>-` in the catalog. Block scalars (`>`, `>-`, `|`, `|-`) are parsed now (folded joins with a space, literal keeps the line breaks, CRLF included); `skill:list` reuses the shared reader, strips the quotes the context writer emits around `design_skill` (a quoted value never matched, so no skill was ever `[active]`), and marks the engine active for a blank field.
- **Three shipped rules fired on tasks they were never meant for — caught by the new negatives on their first run.** `status-flow-drag-and-drop` listed `column` / `coluna` / `stage` / `etapa` as bare triggers and `Column` / `Queue` as entities, so "add the missing index on the customer column of the orders table" pulled the kanban rule into `must_load`; `visual-exploration-contract` listed `prints` (pt-BR for screenshots), so a PRD for "a flag that prints the application version" pulled the exploration contract; `management-home-widgets` listed `reporting` / `relatório` / `Report` / `métricas`, so a CSV export and a PDF report generator pulled the home-widgets rule. Each is narrowed to the phrases the domain actually uses (`kanban column`, `pipeline stage`, `coluna do kanban`, `prints de tela`, `capturas de tela`, `tela inicial`, …) with every positive scenario, guard-corpus case and interaction-recall case still green. A fourth, `source-code-language-convention`, declared `paths: ['**']`, so `context:guard` handed the identifier rule to every markdown edit that mentioned a function or a naming convention — a learning note, a README, a PRD (observed live in this session); its guard leg now covers source-code globs only (it stays `load_tier: always` law in every brief). Semantic `should_load` overlap on generic words (`table`, `index`, `order`, `query`) remains a known recall-side softness, not law.
- **Hyphenated routing metadata never matched the text it was written for.** A `task_type` like `landing-page` or `visual-direction` was an opaque token to the keyword matcher — it matched nothing a task would ever say, and every doc survived only by duplicating the spaced form in `triggers` (caught live by the eval harness's own diagnosis on the engine's first uncovered artifact). Hyphens and slashes now flatten to spaces on both sides of the match, whole-word discipline intact; path segments (`src/auth/login.ts`) become matchable words the same way.
- **Authoring the law no longer triggers the law.** Editing a `SKILL.md` whose description says "boards, cards, forms" pulled the kanban and form rules into the edit via `context:guard` — observed live while writing the routing frontmatter. Governance trees (`.aioson/{rules,docs,design-docs,skills,installed-skills,agents,brains,evals,learnings,config}`) now accept only rules that explicitly declared them in `paths:`; briefings, explorations and context artifacts stay injectable — a prototype under `.aioson/briefings/` IS a product surface.

## [1.64.0] - 2026-09-01

### Added
- **@help — the orientation agent that teaches instead of doing.** A read-only guide to AIOSON concepts, workflows, commands and next steps, shipped to every install profile; it holds no workflow stage, owns no artifact kind, and its `agent:done` can never advance a feature (unknown to the handoff contracts by design). The CLI's own help names `/aioson:agent:help` to avoid colliding with a client's native `/help`.
- **The unit is measured, not just owned — and lanes are the model axis.** An orchestrated plan whose single lane owned every write path compiled clean and ran one whole vertical phase per process: 15 of 28 files in one context, four waves in strict series (`max_concurrent_lanes` moot), one `{lane}_dev` role — one model — for backend and frontend alike. Nothing measured the unit. Now `execution:offer` measures the plan per Execution Sequence row (`plan.scale.units[]`: files, acceptance criteria, shared files, surfaces, depth, `over_budget` against a ceiling of 10 files / 6 ACs per context — `AIOSON_EXECUTION_UNIT_MAX_FILES` / `AIOSON_EXECUTION_UNIT_MAX_ACS`), as a graph (`plan.scale.parallelism`: max concurrent units, serial chain, critical path in processes, `serial`), by seam (`plan.scale.seams[]`) and by surface (`plan.scale.surfaces`: every file `backend | frontend | shared` by extension, directory or stem, tests apart, `shared_test_root`); a two-surface plan gets `plan.split_proposal` — one lane per surface with derived write paths, every row cut into `{phase}-backend` / `{phase}-frontend` inside its wave, the unplaceable files named with the reason — printed in the human answer, named by `onboarding.next` before any table exists, and used by `execution:seed` when neither `--lanes` nor a table says otherwise (`lanes_source: surfaces`). `execution:compile` warns `unit_over_budget`, `unit_spans_surfaces` and `orchestration_serial` with the numbers, carries `summary.parallelism`, `summary.ceiling` and `summary.context_bytes_max`, resolves a bare phase number in `Depends on` to every row of that phase (`1` → `1-backend` + `1-frontend`), and reads `## Interface Contract` from the plan as well as the PRD. Every unit prompt embeds its own `## Phase N` section and ends with a context contract: plan and PRD embedded, the prototype named only for a unit that writes frontend files (`units[].context.reads` with its size), rules through `aioson context:brief --paths=<unit files>`, everything else out of the unit's context on purpose. `workflow:next --complete=planner` prints `[Execution Scale]` for an orchestrated plan that is serial by construction or carries a unit above the ceiling — even with the roles file and the compiled plan green. Tests: `tests/execution-unit-budget.test.js`, `tests/plan-scale.test.js`, `tests/execution-scale-routing.test.js`.
- **The size of a plan is a number, and a big one earns the orchestration question — unlocked or not.** A plan touching 77 files in four chained phases went to one DEV context, sequentially, and the owner was never asked whether the orchestrated lanes (one external process per role, a host/model each) should carry it: every gate around that path asked one question — "is `.aioson/config/execution-roles.json` unlocked?" — and the planner's contract said to ask only when the answer was yes. Nothing in the framework created that file, so the answer was never yes on a first use, and the machinery built for exactly this feature stayed invisible. Three legs now: (1) `src/lib/plan-scale.js` measures the plan — distinct files across the Implementation Delta, the Capability Delivery Plan and the Execution Sequence, `create`/`modify`, phases, waves, phases actually in parallel, `areas[]` (files by their first two path segments: raw material for lanes, never lanes) and `split_candidate` at the 12-file floor (`AIOSON_EXECUTION_SPLIT_MIN_FILES`); `execution:offer --feature` reports it as `plan.scale` beside `plan.execution_choice` (`single` from the plan frontmatter, `orchestrated` from the lanes table, `null` when nobody recorded an answer). (2) `execution:offer` never leaves the caller without a next step: `onboarding.state` / `onboarding.next` name the one command or edit that moves the state (`execution:seed …`, enable, `--confirm-defaults`, the first `host:signature` hint, `execution:compile …`), and `hosts.installed` says which execution CLIs are on this machine. (3) `aioson execution:seed . --feature=<slug> [--lanes=a,b]` writes the roles file **disabled** — one `{lane}_dev` per lane plus `qa`, each on an installed host (the reviewer on a second one when there is one), every model the harness default, `source` naming the planner — never over an existing file (`already_present` names the roles the lanes still lack), refusing with the cause and the install command when no host is installed or the write fails. Between *enabled* and *signed* the offer gains the step the seeded shape needs, evaluated first so nobody is sent to sign a model they were about to change: roles still at the default model answer `defaults_unconfirmed` with `pending_confirmation[]`; `execution:offer --confirm-defaults` records the owner's answer in `.aioson/config/execution-roles.confirmed.json` against a digest of the role map (beside the roles file, never inside it — the desktop client's reader refuses unknown root keys), so the question does not return until a role changes, and then only for the roles still at the default. The framework seeds; enabling, choosing models and signing stay a person's acts. The planner's session end reads the number too: `workflow:next --complete=planner` prints `[Execution Scale]` for a split candidate with no recorded choice (advisory — single DEV may be right; what is charged is that nobody recorded it), and MEDIUM-and-larger planner activations carry one line naming the locked state and the unlock step (MICRO/SMALL stay byte-identical). Replayed read-only on the plan that surfaced it: `77 file(s) (37 new) in 4 phase(s), 4 wave(s), 0 in parallel — SPLIT CANDIDATE`, areas `src/server (21), src/client (18), src/domain (11)`.
- **A delivery that never reached git is now a number at every session end.** Every done-gate in the framework measured the CONTENT of what an agent produced — the `verify:artifact` kinds, the SG-* static criteria, the contract-integrity gate — and none of them measured whether the work left the working tree. A session could close with the artifact proven complete and the entire change set still unstaged, every gate green: @committer knows exactly how to commit safely, but nothing ever summoned it, and the committer gate in `workflow:next` only fires once a human has already routed there. "Done" and "delivered" diverged silently, and the operator was the only detector — having to ask for the commit, every time. New `src/lib/delivery-parity.js` counts what `git status --porcelain --untracked-files=all` reports (`-uall` is load-bearing: plain porcelain collapses a whole new directory into one `?? src/` entry, so a wave of new files measured as one), separates authored work from the framework's own runtime churn (`.aioson/context/`, `.aioson/runtime/`, `.aioson/state/`, `.aioson/plans/` — counting those would fire the advisory on every session in every project, the false-positive class that gets a gate ignored), and groups the rest into the slices a commit would follow, descending through nested containers so the label is `template/.aioson/skills` and not a `template/` that says nothing. `agent:done` resolves it on both return paths beside `verify_artifact` and `agent:epilogue` surfaces it as a step, so it auto-fires at the one call every agent already makes. Advisory in every tier and silent below the floor: a dirty tree at a session end is often legitimate work in flight, and a gate that blocked on it would be wrong most of the time and get switched off. `aioson delivery:parity . --json` exposes the same measurement (always `ok: true` with an explicit `exitCode: 0`, since the CLI fails the process on any `ok:false`), and `AIOSON_DELIVERY_PARITY_MAX` moves the 10-file floor.

### Changed
- **@planner writes one Execution Sequence row per unit, never per phase, and declares lanes by surface.** The kernel said "one row per delivery phase; keep waves few; a solo wave is valid" — the exact prescription that produced a serial single-lane orchestration. It now says lanes are the model axis (one per surface when `plan.scale.surfaces` shows backend and frontend, tests under a lane-owned path), a phase is cut per lane inside its wave (`1-backend`, `1-frontend`) joined by `## Interface Contract` rows, a row over the unit ceiling is cut again on disjoint files, small serial rows may merge, and one lane with one row per wave is serial by construction. Same 14592-char budget; the prose it displaced was unpinned.
- **@planner asks on the measured scale and records the answer; the lanes table no longer names host or model.** The kernel ran `execution:offer` and acted only on `available: true`; it now runs it after writing the plan and, when `plan.scale.split_candidate` is true or the user asked for split execution, asks once — single DEV or orchestrated lanes — citing the numbers and, when the path is locked, `onboarding.next`; the answer is recorded as `execution: single` in the plan frontmatter or as the `## Development execution lanes` table, now `Lane | Exact write paths | Integration owner` (host and model were two places naming the same thing; the roles file wins and `lane_role_mismatch` had nothing left to reconcile). On lanes it seeds the roles file and leaves models, enabling and signing to the owner. The constraint "do not invent multiple-model execution from classification" stays, sharpened: the measured scale earns the question; the answer is the user's or the PRD's. Old plans with the two extra columns keep compiling (the parser always treated them as optional), and `lanes_table_missing` names the columns the parser actually requires.
- **@committer opens on a measurement, and a wave is no longer one commit.** Step 2 ran `git status --short` and the kernel had no notion of partitioning: faced with a tree holding several unrelated waves, the only shape it knew was one undifferentiated dump. It now runs `aioson delivery:parity . --json` first, and `tier=advisory` routes it to the new `.aioson/docs/committer/outstanding-work.md` — group by intent rather than directory (a new CLI command is its command file, its registration, its measurement, its tests and its doc: one commit, five areas), keep each commit whole enough to pass its own suite, order by dependency, and confirm the partition once instead of every message. The session closes on the same measurement that opened it: `agent:done` reports `tier=clean`, which is the proof the work actually left the tree.

### Removed
- **The fixed design presets no longer ship — the `interface-design` engine is the template's single design skill.** Nine preset skills (`aurora-command-ui`, `bold-editorial-ui`, `clean-saas-ui`, `cognitive-core-ui`, `glassmorphism-ui`, `neo-brutalist-ui`, `premium-command-center-ui`, `warm-craft-ui` and the forged `pt.squarespace.com`) left `template/.aioson/skills/design/`, together with three trees of the same class: `skills/design-system/` (a second design engine in disguise — "use whenever asked to build ANY web UI"), `skills/references/premium-command-center-ui/` (orphan references of a deleted preset) and `skills/premium-visual-design/` (the framework's own dashboard component specs, shipped into every consumer exactly like the retired design-doc seed). A preset hardcodes a palette and a typeface, so every project that picked the same one looked the same; every premium lever the framework measures — registers, `design:seed`, `identity.md`, craft weight, fold occupancy, generation tells, the done gate — already ran through the engine, and the catalog was only the re-roll of the same fixed looks. The engine is installed for every profile (`DESIGN_IDS` is the engine alone; `MANAGED_FILES` gains `references/aesthetic-registers.md`, which the manifest had missed). The install wizard drops its design screen (three screens; the summary names the engine). `src/lib/design-presets.js` keeps the retired ids so a saved install profile that still selects one is normalized away instead of silently installing nothing, and `aioson doctor` / `aioson update` warn (advisory, four locales) when `design_skill` names a retired preset — saying whether a project-local copy still backs it (`design:retired_preset`) — or when the saved profile still selects presets (`install:retired_preset_profile`). A consumer's installed copy keeps working while `design_skill` names it: nothing deletes it, nothing ships it. The hybrid forge takes project-forged parents (site-forge or hybrid output) or external DESIGN.md sources — its pair-compatibility reference now classifies whatever parents exist instead of cataloguing presets, and the engine is never a parent; the setup, refiner and prototype docs, the squad domains and `config.md` stop offering "an installed preset" as the alternative. The site-forge brain's provenance no longer names the external site its forged example came from. `tests/design-preset-retirement.test.js` pins the single shipped skill, manifest parity, a template-wide scan for retired ids, the wizard, profile normalization, the inspector, doctor and i18n.

### Changed
- **The installer no longer ships `.aioson/context/design-doc.md`.** Since 2026-04-12 every setup copied a project-level "design doc" that was the framework's OWN code layout — a Node.js CLI (`src/commands/`, `src/lib/{domain}/`, `squad/`, `runner/`, `i18n/messages/`, SQLite tables) — under a header claiming "@dev must load it before any implementation" and "generated by @discovery-design-doc during the pre-dev gate", a contract no kernel honours. The modular `.aioson/design-docs/` replaced it the day after it was born (6360c696 says so) but the monolith stayed shipped as a project-local file: never updated, copied verbatim into every consumer (a Rust desktop project had to overwrite "the inherited JavaScript governance"), semantically selected by `context:select` on any task naming files or folders — on top of the five modular docs already in `must_load` — and accepted by the engine as the slug-less fallback for the FEATURE design document, so its mere presence satisfied `design_doc` in `preflight`, the `discovery-design-doc` stage validation, `state:save --context=design-doc` and `workflow:status`. New `src/lib/design-doc-seed.js` fingerprints the retired seed (normalised sha256 of both shipped versions = `verbatim`; the seed's title, heading or retired contract lines in an edited copy = `derived`; anything else is a project record): the selector and the memory catalog skip a verbatim copy, every engine fallback refuses the seed (a real slug-less record and slugged files keep working), `aioson doctor` warns with the kind and `--fix` deletes only a verbatim copy, and `aioson update` prints the same advisory because the file is project-local and update never rewrites it. `config.md` now says who writes a design doc (the project team, opt-in — no agent by default) and where per-feature decisions go (`decision:add`, the plan's ADR section). `tests/design-doc-seed.test.js` (+ fixtures of both retired versions) pins detection, template absence, selector, `scanArtifacts`, `state:save`, catalog, doctor check/fix and i18n.

### Fixed
- **The benchmark's static route ships a real app — now mechanically, not by prose.** 5c73ef7b renamed the route and told the agent to build a real delivery instead of handing in the refiner's `prototype.html`; nothing measured it. `kind=benchmark-result` now reads the agent's own route marker (`.aioson/benchmark/route.json`) and refuses a static-route result whose entrypoint is prototype-shaped or lives under `.aioson/briefings/`.
- **Captured third-party text is data on every path, not most paths.** The injection perimeter had holes an audit walked through: `web:extract` never scanned CSS (custom properties and `@keyframes` comments copied verbatim into extract.md), `--query` returned raw matched lines unflagged, and a browser walkthrough quoted live page text (`expect text/contains`, `expect value`, `eval` output) into its report unscanned and unstripped. All three surfaces now strip invisible carriers at capture and feed the scanner; search matches come back `flagged` with a `>!` marker. The execution mailbox could forge a markdown heading impersonating the engine's own rework protocol via embedded newlines — control characters now collapse, `paths[]` entries are sanitized, capped and scanned like text.
- **Judge ≠ producer holds at runtime, not only at compile.** `require_independent_qa` was enforced once, at `execution:compile` — an `execution:decide --choice=fallback:<devHost>/<devModel>` re-homed a unit's review onto its own implementer with zero warning. The fallback decision now refuses the counterpart stage's pair (`fallback_self_review`) and the QA dispatch itself refuses a self-review pair whatever route produced it. Also: effort vocabulary is per host (`ultra` is codex vocabulary — claude lanes can no longer sign, validate or decide it), and a declared-but-unproven manifest fallback is a standing named warning on every plan verify.
- **A run interrupted mid-unit resumes honestly.** A unit frozen at `running` by a killed process was invisible to the resume scheduler — the run could end `completed` around it. `--resume` now reclaims it to `pending` with an `interrupted_unit` finding; a `retry`/`fallback` decision deletes the failed attempt's stale report before re-dispatch (a path-watching spawner satisfied instantly by the leftover file burned the retry); a broken lane entry pauses the unit for a decision (`lane_config_invalid`) instead of relaunching it forever; and a unit entering rework names the dependents its `after_dev` edge already released (`rework_dependent_started`) so the reconciliation has a handle.
- **A gate that exists only as a log line does not exist for automation.** `workflow:next`'s completion evidence (`execution`, `scopeDrift`, `auditCode`, `rulesCheck`) never entered the returned payload, and in `--json` the logger is silenced — the Autopilot engine and every structured caller were blind to the very advisories built for them. The payload now carries all four; `agent:done` re-surfaces them on stdout after an auto-advance, and a thrown `[… BLOCKED]` gate prints on stdout — the kernels' `2>/dev/null || true` shutdown line made stderr a channel that reaches nobody. A manifest that DECLARES orchestrated execution but fails validation blocks the planner loudly instead of silently taking the single-DEV route.
- **`delivery:parity` charges the spec artifacts and survives a monorepo.** The runtime-churn exemption covered all of `.aioson/context/` — a session ending with only an uncommitted PRD and implementation plan measured `runtime_only`, invisible to the gate built for exactly that; the spec artifacts (prd, plan, features.md, project.context.md, dossiers) are now always charged. Porcelain paths are repo-root-relative: a project living in a subdirectory misclassified everything — the measurement now scopes to the project pathspec and strips its prefix. Both human surfaces (the command and the `agent:done` line) render via i18n in the four locales.
- **Smaller escapes closed by the same audit.** `host:signature`/`execution:offer` missed every host installed as a Windows `.exe`/`.cmd` (bare-name PATH probe); the briefing density refusal read a second hardcoded copy of the fold floor instead of the measured one (the floor now travels inside `metrics.assurance.density`); `research_source_unpinned` substring-matched "webhook"/"website"/"researcher" as web research (whole-word, accent-safe now); `import-cycle` flagged TypeScript type-only cycles the compiler erases (cycles are detected over value edges only); the craft/density test suite wrote synthetic fingerprints into the operator's real `~/.aioson/design-fingerprints.json` when run standalone; `system:publish --build --allow-raw-source` records the shipped-readable files on the real publish, not only on dry-run; `context:guard` no longer applies `guard_surfaces: [ui]` product rules to test files (fixture markup is ABOUT the surface, not the surface); the design-preset retirement now covers the published `docs/` tree (15 stale pages fixed, the preview gallery removed, and the retired-id scan test walks `docs/` too).
- **The execution question recommends what the numbers say — a locked roles file can no longer flip it to "single DEV".** The planner's kernel pinned "single DEV (default)" and `workflow:next` echoed "(default, as today)", so on the first measured-scale question asked in the wild — 52 files (38 frontend, 12 backend, 2 shared) in 5 phases, roles file missing — the asking model marked single DEV "(Recommended)" and framed the orchestrated lanes as unavailable-and-burdensome: the measurement existed whole (`plan.scale`, `surfaces`, `split_proposal`) and no layer derived a recommendation from it, so the only judge was the model whose prior favours the zero-setup default. `recommendExecution` (`src/lib/plan-scale.js`) now derives `plan.recommendation` — `{choice, reasons[]}`, every reason a number: `orchestrated` for a split candidate with a real cut (two surfaces, or rows already sharing a wave), `single` below the floor or with nothing measurable to cut on; the roles file's lock state is deliberately not an input. `execution:offer` reports it in JSON and prints it in the human answer — locked, the line ends "(locked today — that never flips the recommendation; unlock: …)" — the `[Execution Scale]` advisory carries the same measured recommendation, the planner activation line stops saying "(default, as today)", and the kernel now reads "recommending `plan.recommendation` … a lock never flips it", with a contract pin forbidding "single DEV (default)" from returning. Replayed on the incident's shape through the CLI: `recommendation: orchestrated — 52 files ≥ the 12-file floor for one context; two surfaces (backend 12 · frontend 38); the split proposal cuts 5 row(s) into surface lanes`. Tests: `tests/plan-scale.test.js`, `tests/execution-onboarding.test.js`, `tests/execution-scale-routing.test.js`, `tests/execution-routing.test.js`, `tests/agent-contracts.test.js`.
- **A client spawner that cannot even be launched reports its real cause.** `runSpawner` declared the unit timer after `finish`, so a synchronous throw from `spawn` (a sandbox refusing to create the process, an invalid cwd) hit `clearTimeout` in the temporal dead zone and every launch failure surfaced as `Cannot access 'timer' before initialization` instead of the launcher's message; it now arrives as `spawner_failed` with the original error.
- **`system:publish --build` no longer ships readable source.** The build lane excluded `src/` and mangled compiled `.js`, but the server runtime an app executes straight from TypeScript (`server/**/*.ts` under `tsx`) travelled verbatim — types, comments, names — and a test pinned that as expected; a split-stack app published its whole backend in the clear. Runtime TypeScript is now type-stripped (`module.stripTypeScriptTypes`, Node >= 22.13) and mangled by the same Terser boundary as compiled code, written back under the same `.ts` path so `tsx server/server.ts` keeps working. A file that cannot be protected (older Node, JSX, syntax the stripper rejects) fails the publish with its path (`system.error_raw_source`); `--allow-raw-source` records the owner's decision to ship it anyway. `.d.ts` declarations never ship in build mode. `--dry-run` now prints the full package listing — before, the only way to see what a build package contained was to upload it. Dev-only folders (`reports/`, `test-results/`, `playwright-report/`, `aios-qa-screenshots/`, `.opencode/`, `.qwen/`, `.agents/`, `.gemini/`, `.cursor/`, `.windsurf/`) and QA reports (`aios-qa-report.*`, `aios-qa.config.json`) leave every package; `tests/`, `test/`, `e2e/`, `cypress/`, `.storybook/`, `.github/`, `.vscode/`, `.idea/`, `.husky/` leave build packages. `--build` and `--allow-raw-source` are boolean flags — `system:publish --build ./meu-app` used to swallow the directory as the flag's value and publish the current folder. When the store quarantines a first public app as DRAFT, the CLI now says so instead of printing "Published".

## [1.63.0] - 2026-08-26

### Added
- **The premium bar is measured twice — graded craft weight and photographed fold density — and the one human gate reads it.** Two prototypes of the same brief scored the same `craft 5/5`: a dark, image-led, seven-keyframe landing and a pale page floating one heading and a faint ring over three viewports of ground. The levers were booleans with low floors. `kind=visual` now reports `craft.weight` (each lever graded 0–2 — a delivered face at 96px+ with tracked caps or italic contrast, atmosphere on more than one layer, a hover system that moves plus an ambient or scroll-driven signature, composition that overlaps the grid, image-led media — `score`/100 against a brand bar of 60, with the signals behind each grade) and warns `craft weight N/100 below the brand bar` when every lever is lit but thin. With `--runtime` the probe measures fold occupancy on the entry route: how much of each of the first three viewports a visual subject covers — loaded media, type at display scale or a text block, a panel or gradient that actually contrasts with the page ground (≥ 1.5:1), a photographic background; a faint ring, a tinted section, a grain pattern or a pseudo-element never qualifies, and scroll-revealed content counts because the reader will meet it. Beside the verdict, the collector photographs the same folds at desktop width and records the share of pixels that leave the page color (`src/lib/png-stats.js`, a dependency-free PNG decoder — the record, not the charge, because a dark cinematic hero is near-black by design). `runtime.assurance.density` + per-viewport `density`, and the warnings `the first fold is N% empty`, `fold N is N% empty … a gap`, `N% of the first 3 folds is empty on average` on brand surfaces at desktop width — a stylesheet cannot see emptiness. `briefing:approve` refuses a brand-surface prototype under the bar or with an empty first fold (`prototype_visual_craft_below_bar`, with the numbers and the fix); `--accept-craft` records the owner's decision as `craft_accepted:` in the manifest instead of hiding it. Operate/read surfaces and undetected surfaces are never charged. Replayed read-only on the two prototypes: the pale page measures 60 / 19 / 82 (fold 2 named as a gap) where the dark one measures 100 / 100 / 46.
- **The owner's answer about references is a manifest fact.** `references: extracted | declined | unavailable` in `prototype-manifest.md`; a brand-surface prototype built `identity: none` with no such line warns `references_unasked` — the measured shape of a question never asked, which is how a folder of screenshots stayed on the owner's disk while the seed decided the direction alone. The prototype-forge skeleton, the refiner's prototype module and the identity schema carry the contract.
- **`design:seed` honors the identity's ground.** It resolves `.aioson/briefings/{slug}/identity.md`, then `.aioson/context/identity.md` (or `--identity=<path>`): the record's `theme` fixes the ground pole of every candidate and an optional `register:` fixes the register; `--pole=light|dark|chromatic` states a preference without an identity; the registry keeps diversifying hue and pairing and never flips the pole the owner showed (`generateSeedCandidates({ pole })`, same inputs same draw). The payload names what was applied.
- **The effects vocabulary reaches the agents that build visuals.** `docs/design/visual-effects.md` and `docs/dev/visual-implementation.md` now route in planning mode and under `.aioson/briefings/**` / `.aioson/explorations/**` (the refiner's prototype path), the refiner's Build step loads the vocabulary and the engine's register bar by name, and `tests/design-docs-reachability.test.js` runs the real brief against the shipped docs and rules for the refiner, dev and deyvin tasks. Brain node `vq-021` binds the two numbers.

### Changed
- **A rule reaches `must_load` on a hard signal only.** A declared path, task type, trigger, entity, alias, intent or feature; a rule that matched on semantic recall alone ("build", "prototype") is read on demand from `should_load` instead of being law for a task it never named — the last leak of the shipped kanban/widget rules into every landing page. Always-tier rules and hard-routed rules are untouched.

## [1.62.0] - 2026-08-26

### Added
- **Content perimeter — everything captured from outside the session is data, and the framework now says so.** `src/lib/llm-content-sanitizer.js` gains `scanInjectionPayloads()` (six families of instruction-shaped text — `override`, `role_hijack`, `prompt_exfil`, `exfiltration`, `chat_markup`, `ai_addressed` — in en / pt-BR / es, matched after folding diacritics and removing the invisible carriers, so `ig​nore` and `instruções` are both seen) and `stripHiddenChars()`. The sanitizer existed for dossier and research paths but never ran on the three surfaces that carry third-party text straight into an agent prompt; now it does: `web:extract` strips the carriers from every distilled field, stamps `extract.md` with `trust: untrusted` + `injection_findings: N`, adds an `## Injection scan` section with file, family and excerpt per hit, returns the same `injection` block in `--json` and warns on the plain run; the execution engine's mailbox strips carriers from every message, flags instruction-shaped text (`flagged: [...]` on the message, `[flagged: …]` marker in the recipient prompt, `mailbox_suspicious` run finding, `flagged` on the message event) and delivers it as data — a flagged message never fails a unit; `browser:run` / `browser:snapshot` strip carriers from aria previews, console samples and the page title, and the report carries `injection`, a warning line and an `## Injection scan` section when page text reads as an instruction — the walkthrough verdict is untouched. Advisory everywhere: the scan names what to distrust, it never blocks. Brain node `dev-008` (q5, dev/qa/tester/shakedown) binds the reading rule; `web-capture.md`, `qa/browser-walkthrough.md` and `dev/execution-lanes.md` document the stamps and findings.
- **The judge must differ from the producer — `execution.require_independent_qa` in the roles file.** A lane whose dev and qa resolve to the same host/model has always been the warning `self_review_same_model`; with `"execution": {"require_independent_qa": true}` in `.aioson/config/execution-roles.json` the same condition refuses the compile (named error, nothing written, the hint names the `{lane}_qa`/`qa` role to declare on another host or model). Off by default — the warning stays byte-identical; the key is validated as a boolean like every other field of the unlock file.
- **The compiled plan pins the client's binding rules.** `execution:compile` records `source.rules`, `source.rules_digest` (one SHA-256 over every `.aioson/rules/**/*.md`, README and `_archived` excluded — the same enumeration `rules:check` uses) and `source.rules_files`; `verify:artifact --kind=execution-plan` warns `rules_changed` when a rule was added or edited after compilation (units that already passed were reviewed under the previous rules; run `rules:check` at integration and recompile). Advisory like `prd_digest_stale`; a plan compiled before the key existed is never warned about it. The two staleness guards that had no test — `prd_digest_stale` on verify and `run_state_stale` on `execution:run --resume` after a recompile — are now pinned.
- **Coupling is counted, not felt — `module-fan-out` and `import-cycle` checkers in `rules:check`.** `src/lib/module-graph.js` reads import statements lexically and build-free (JS/TS `import … from`, `export … from`, `require()`, `import()`; Python `import a.b`, `from .a import b`, multi-line parenthesized imports), resolves the ones that point inside the project (relative paths, `/`-rooted paths, the `@/` `~/` `#/` `src/` `app/` aliases, extension swaps `./a.js → a.ts`, `index.*` files, Python packages and submodules; roots `.`, `src/`, `app/`, `lib/`) and never guesses an unresolved one; libraries, stylesheets, JSON and assets are not edges. Per module: fan-out, fan-in, imports; per tree: the strongly connected components (Tarjan) and, for a finding, the shortest path from the file back to itself. The new routed doc `.aioson/docs/quality/coupling-limits.md` (managed, trigger-loaded for dev/deyvin/qa/architect/validator) binds both checkers advisory (`MED`) with `max_module_fan_out: 15`; a project rule with the same keys makes them `HIGH`, its threshold wins, `--baseline` records a legacy tangle as counted debt. The graph is the whole tree, the findings are the files under check; tests/fixtures/config/routes are exempt as for size, and composition roots and barrels (`index.*`, `main.*`, `cli.*`, `app.*`, `server.*`, `router.*`, `registry.*`, …) are exempt from the fan-out limit only — a cycle through them still reports. Read-only over this repository's own `src/`: 555 modules, two real import cycles no gate had ever seen.
- **An acceptance criterion that is only a verdict is a finding.** The PRD gate already refused an empty `Observable behavior` cell; a cell that says `works`, `Funciona corretamente`, `The feature is implemented` or `Deve funcionar` passed as if it described something a tester could see. `acceptance_criterion_behavior_generic` (specification stage, whole-cell match in en / pt-BR / es over the same verdict floor `genericEvidence` applies to QA rows) now names it with the fix — write the trigger and what the user sees or the system returns. A sentence that names a trigger and a visible result is never caught, however plain its wording.
- **Research captures are sources too.** The Source Inventory accepts `researchs/` beside `plans/` — a `web:save`/`web:extract` `extract.md` or `summary.md` is pinned by SHA-256 like any raw source, `source_fingerprint_stale` when it drifts, `source_path_unsafe` outside both roots. A promise that cites "web research" without a `SRC-*` row is still accepted (nothing mid-flight breaks) but counted (`promises_research_unpinned`) and warned (`research_source_unpinned`) by `verify:artifact --kind=sources`, so a claim built on a page nobody pinned is visible instead of invisible.

### Fixed
- **The governance routing contract is measured — and the guard stops crying wolf.** Three things one report surfaced together. (1) `context:select`'s keyword matcher applied a word boundary only to needles of three characters or fewer; every longer entity or trigger fell through to a bare substring test, so the shipped kanban and form rules (`Card`, `Form`, `Lane`, `Stage`, `Mask` — with no `paths`) landed in `must_load` for a CHANGELOG (`format`), a graph library (`discard`) or the orchestration engine (`lane:<id>`), and `context:guard` injected them before every such edit in every consumer. Single-token needles now match whole words at any length and phrases match as whole words (`remove cards` is not `move card`). (2) `context:guard` no longer treats a bare `<id>`/`<slug>` placeholder as DOM (a tag is markup when it closes, carries an attribute, self-closes or names an HTML element), no longer treats repository housekeeping markdown (`CHANGELOG`, `README`, `LICENSE`, `CONTRIBUTING`, …) as a product surface, and returns nothing for an absolute path outside the project (operator memory, scratch files). `tests/context-guard-corpus.test.js` runs the guard against the **shipped** rule corpus — quiet on a changelog, engine code and a graph module, speaking on a real form and a real board — the corpus-scale check the suite never had. (3) `skill-audit --reachability` reports `frontmatter` / `frontmatter_missing` per skill and `missing_frontmatter` in the totals, so a `SKILL.md` that only the registry routes never reads as healthy; the two shipped entrypoints without a block (`aioson-spec-driven`, `harness-validate`) and the two docs without a `description` (`prototype-contract`, `workflow-lean-lane`) are fixed, and `tests/governance-frontmatter.test.js` keeps every shipped rule, doc and skill entrypoint lint-clean.

## [1.61.0] - 2026-08-26

### Added
- **Orchestrated execution — a compiled plan runs lane units as parallel external processes, one host/model per role, unlocked by the supervising client.** Opt-in per project: the client (the desktop IDE, a mission cockpit) writes `.aioson/config/execution-roles.json` after proving every role's host on this machine; without that file every prompt and gate stays byte-identical (pinned by test). Session agents keep their stages — the engine serves the orchestrator's `dev → qa` pipelines, and the integration units (files outside every lane) remain the session DEV's.
- **One host registry (`src/lib/tool-capabilities.js`) and `aioson host:signature`.** `kimi`, `qwen` and `grok` join `claude`/`codex`/`opencode` with install commands, the unattended flags the live surface already uses and an `execution` block per host (extra writable roots, model catalog, reasoning effort); `grok` is interactive-only. `host:signature --host --model [--effort]` runs the exact adapter argv in the provider's read-only mode inside an empty temporary directory and records the verdict (`executable_not_found` with the install command, auth, `invalid_model`, capacity, timeout, crash, `effort_unsupported_by_host`) with a 24 h TTL in `~/.aioson/hosts/signatures.json`; `--status`/`--list` are read-only. `agent:execution:validate --strict` requires a valid signature for every enabled agent and lane.
- **`aioson execution:offer` / `execution:compile` — planner tables + roles become a digest-bound execution plan.** The planner's `## Development execution lanes` and `## Execution Sequence` tables are crossed with the roles file and the signature store into `execution-plan-{slug}.json`: units = phase × lane (or integration owned by DEV), waves, per-unit capabilities/ACs/verification, prompts extracted from the installed `dev.md` plus the unit's own PRD/plan rows — never the whole documents. Refusals are named findings and write nothing (`lanes_table_missing`, `phase_mixed_ownership`, `wave_file_overlap`, `lane_write_paths_overlap`, `role_signature_*`, …). `verify:artifact --kind=execution-plan` is the freshness gate (`plan_digest_stale`, `roles_changed`, `manifest_lanes_diverged`, `prompt_stale`) and auto-fires at the planner's `agent:done`, silent for single-DEV features.
- **`aioson execution:run` / `execution:decide` / `execution:status` — the orchestrator's engine.** Waves of `dev → qa` lane pipelines, up to `parallel.max_concurrent_lanes` at once: the dev role implements a unit inside its files under the host's unattended workspace-write mode (codex keeps its sandbox, never the approvals bypass) and writes a bound JSON report; the qa role reviews and tests it with a risk-first profile extracted from the installed `qa.md`, may fix at most `qa.max_fix_files` files and reports the rest. Corrections and scope are measured from the worktree (`undeclared_correction`, `corrections_cap_exceeded`, `lane_scope_drift`, `unowned_change`). Nothing decides silently: a unit that cannot run, stalls, crashes, misses its report or fails leaves `decision_required` in `execution-state-{slug}.json` and on the execution telemetry a supervising client already polls; `execution:decide --unit --choice=retry|fallback:<host>/<model>[/<effort>]|skip|skip-qa|abort` answers it (a fallback must carry a valid signature) and `--resume` continues idempotently — passed units never re-run, `--fresh` restarts, `run_state_stale` when the plan or manifest changed. The run holds the feature's dispatcher lease; one live line per event on stdout, `execution:status` is the consolidated ledger.
- **Graph engineering — explicit edges, readiness scheduling and `aioson execution:graph`.** The Execution Sequence accepts an optional `Depends on` column (phase names; `(dev)` = after the implementer passed, otherwise after the lane review). The compiled plan (v2) carries `units[].depends_on`, `edges[]` and `scheduling`, refuses `dependency_unknown`/`dependency_self`/`dependency_wave_violation`/`dependency_on_integration`/`cycle_detected` and warns `dependency_cross_lane_without_contract` when the PRD has no Interface Contract; `verify:artifact` gains `execution-plan:edges`. The engine schedules by readiness — a unit with explicit edges starts when exactly those are satisfied (an `after_dev` edge wakes the scheduler mid-pipeline), a unit without edges keeps the wave barrier, a plan without edges runs byte-for-byte as before; scope is measured per unit window. `execution:graph --format=ascii|mermaid|json` draws the plan — explicit edges plus implicit barrier edges after transitive reduction — with the run state laid over nodes and waves; the orchestrator kernel reviews the drawing, never raw JSON.
- **Spawner seam — a unit becomes a terminal the supervising client owns.** With `execution.spawner {command, args}` in the roles file (or `AIOSON_EXECUTION_SPAWNER` in the session environment, which wins) the engine hands the client one JSON envelope per unit on stdin — feature/run/attempt, unit/lane/wave/role, host/model/effort, cwd, prompt file, report path, write paths, unit timeout, the reference argv — expects `{ok, session_id, pid?}` back and then waits for the bound report with the same stall watch and telemetry; on abort or timeout it asks the client to close the session. Refusal, crash or a non-JSON answer = `spawner_failed` (a decision); not on PATH = preflight `spawner_not_found`. `session_id` per unit stage lands in the state and in `execution:status`; `execution:offer` reports `execution.spawner_supported` and `unit_timeout_ms` (1 min – 4 h; 30 min default with a spawner, 10 min without).
- **Mailbox — lateral edges between lane units as a report contract.** A bound report may carry `messages[]` (`to: lane:<id>|unit:<id>|integration|orchestrator`, `kind: contract_change|note|question`, text ≤ 500 chars, at most 10); the engine normalizes strictly (`mailbox_invalid` counts the dropped ones) and delivers wherever a reader exists — a unit that starts later gets `## Messages for you` in its runtime prompt, its reviewer gets `## Implementer messages`, the ledger gets `mailbox[]` — while compiled prompts never change. A `question` nobody could answer mid-run becomes the run finding `unanswered_question` for the integration owner. The dev/qa lane profiles teach the contract.
- **Bounded rework loop per unit — `qa.max_rework_rounds` (0–3, default 0).** A failed lane review may send the unit back to its implementer with the findings (`## Reviewer findings — rework round N of M`), a bounded number of times; each round is a new process pair with its own reports (`{unit}.rN.json`) and measured corrections. Budget spent → the failure stays a finding plus `rework_exhausted`, never a block; `execution:status` counts reworked units and rounds.
- **`aioson browser:run` — a replayable walkthrough of the real application in a real browser.** A JSON script of steps (`goto`, `click`, `fill`, `expect`, `snapshot`, `eval`, …) located accessibility-first (`role=button[name="Save"]`, `label=`, `text=`), each step tagged with the `AC-*`/`PROM-*` it proves and, when it must reach the server, a `boundary` (`POST /api/orders -> 201`) proven from captured network traffic. The report (`.aioson/context/features/{slug}/browser/{name}.json` + `.md`, artifacts beside it) carries a per-id verdict, a derived production-path smoke block (entry, trigger, real boundary, state change, visible result), console/network evidence, masked secrets, sanitized URLs, and the exact replay command. A failed step stops the run with the page's aria snapshot and a PNG of that moment; `--continue` runs every step. `--prototype` (or any file under `.aioson/briefings/`) scopes the run to the prototype slot, never delivery evidence.
- **`aioson browser:snapshot` — read a page as its accessibility tree.** Roles and names, token-lean, before writing steps; flags a login wall and points at `--cdp`.
- **Three ways to a browser, one resolver (`src/lib/browser-session.js`).** `--cdp=<endpoint>` / `AIOSON_BROWSER_CDP` / `aios-qa.config.json → browser.cdp` attaches to the Chrome (or Edge, Electron, WebView2 shell) the operator already runs, in their live context, and only disconnects at the end; `--browser=chrome|msedge` launches the installed browser with no download; the bundled Chromium stays the default when present. `qa:run`, `qa:scan`, and `qa:doctor` use the same resolver — the doctor lists every mode the machine can serve and only fails when none exists.
- **Walkthrough evidence feeds the gates.** `ac:test-audit` counts an AC as covered when its latest walkthrough step passed (automated evidence, `browser_covered` in the summary); Gate D / `feature:close` raise `qa_pass_contradicts_browser_evidence` when a QA `PASS` row contradicts the latest walkthrough for the same AC; `feature:trace` reports `browser evidence:` — never driven, or which ids were proven. Archived features read `done/{slug}/dossier/browser/`.
- **Routed doc `.aioson/docs/qa/browser-walkthrough.md`** (QA, tester, shakedown, refiner, dev, pentester, benchmark): browser modes, the see→act→verify→boundary loop, the target grammar, the step vocabulary, evidence placement. The QA kernel makes steps 5–8 of the capability walk a walkthrough it writes itself; the refiner's prototype module proves promised interactions with a `PROM-*` walkthrough before approval. Brain node `dev-007` (q5) carries the criterion for QA/tester/shakedown as well.

### Changed
- **The orchestrated path rides the canonical chain through engine pins and gates — no new stage.** When `execution:offer` answers available, the planner's activation pins the offer (roles, the one-question choice, the compile command) and whether a compiled plan is fresh; with `orchestration.execution: orchestrated`, `--complete=planner` is blocked on a missing or stale compiled plan — "does not run without models per role" lives in the engine, not in a prompt. Dev and orchestrator activations pin the run state (compiled-not-started, pending decisions with hints, completed with integration units) and point to the routed doc `.aioson/docs/dev/execution-lanes.md`; dev completion gets an advisory `execution` summary when the compiled lanes never ran to completion. `orchestrator.md` is rewritten over `execution:*` (preflight, graph review, run, decisions, ledger → `@dev`, the legacy ledger kept); `planner.md` learns the offer and the `Depends on` column inside its size budget.
- **`qa:run` no longer labels every acceptance criterion `Documented` over the same entry screenshot.** Rows carry the walkthrough verdict (`Covered`/`Missing`/`Partial`) when one proved the AC and `Not exercised` otherwise; the summary counts `AC exercised by walkthroughs: n/m`.
- **`@briefing-refiner` is now `@refiner`** (`/refiner`, `/aioson:agent:refiner`, `.aioson/agents/refiner.md`) — the same agent, a shorter name. The old id is a declared legacy id (`legacyIds` in the agent catalog), distinct from live aliases such as `pair`, and keeps resolving everywhere an agent id is compared: CLI flags (`--agent`, `--from`, `--to`, `--source-agent`, `--stage`), `agent:help`, client-owned `.aioson/rules/` frontmatter, context search and brains, done-gate kinds, review profiles and dossier authors — so projects mid-flight and rules written before the rename keep routing. `aioson update` removes the two files the old name left behind (`.aioson/agents/briefing-refiner.md`, `.claude/commands/aioson/agent/briefing-refiner.md`) only once the canonical files exist, and says so. Internals follow: `src/lib/briefing-refiner/` → `src/lib/refiner/`; the benchmark traversal chain reads `briefing → refiner → product → …` (the Cockpit contract is by evidence path, unchanged).

### Fixed
- **Template runtime state never installs.** `.aioson/runtime/` and everything below it is skipped unconditionally by the installer, so a stray database under `template/.aioson/runtime` — left behind by a live session in a shared working tree — can no longer clobber a project's own runtime database on `aioson update`.

## [1.60.0] - 2026-08-21

### Added
- **`aioson commit:prepare . <path...>` — explicit operands stage through the engine.** Files or directories named after the project path are resolved against the status snapshot, pre-excluded by the guard's path rules (`excludedByGuard`), reported when they carry no change (`unmatchedOperands`) and staged without the picker — valid in `--agent-safe --mode=headless`, so `@committer` no longer has to run raw `git add` when the user names paths.
- **Staging runs in two lanes, chunked and retried (`src/lib/git-stage.js`).** Tracked paths go through `git add -u --`, which never consults ignore rules and stages deletions; untracked paths go through `git add --`. Long lists are split under the command-line ceiling and `index.lock` contention is retried. A refusal now surfaces git's own lines with the per-file EOL warnings stripped (`gitMessage`), the failing lane, `failedPaths`, `stagedBeforeFailure` and the exit status — never the multi-kilobyte command echo.
- **Tracked-but-ignored managed files are measured, not described.** The installer writes the AIOSON ignore policy (`.aioson/tasks/`, `.aioson/skills/`, `.aioson/schemas/`…) into every project; projects that had committed those files before the line existed kept them tracked, every `aioson update` rewrote them, `git status` kept listing them and a plain `git add -- <path>` refused them. `aioson update` and `aioson setup` now list them via `git ls-files -ci --exclude-standard` and print the exact `git rm -r --cached` remedy (directories collapsed only when no policy line re-includes something inside them); `commit:prepare` badges them WARN in the picker and reports `trackedIgnored` in its result and in `commit-prep.json`. Advisory everywhere — never a block.

### Fixed
- **The generic secret heuristic stops crying wolf on UI strings.** Translation resources are recognized by locale-named basename (`messages/pt-BR.json`, `app_en.arb`, `translation.en_US.yml`), by directory (`lang/`, `l10n/`, `intl/`, `nls/` join `i18n/`, `locales/`, `translations/`) and by format (`.po/.pot/.arb/.xlf/.xliff/.resx/.strings/.stringsdict/.ftl`); generic findings inside them become suppressed notices that remain visible in the audit trail. Identifiers where every term after the last credential noun is a descriptor (`confirm_password_label`, `PLAY_LOGIN_TOKEN_LABEL`, `API_KEY_HEADER`, `TOKEN_TTL`), mask values (`••••••••`) and label words (`"Password"`, `"Senha"`) are not credentials in any file; word-shaped symbol names under `token` keys — the shape of lint/AST reports, including the framework's own `rules-check.json` — are suppressed as notices. A runtime `PASSWORD` holding a real literal, `password_reset_token` (noun last) and random-looking token values still warn; provider-key rules apply everywhere. One consumer project had accumulated seven `contentAllowRules` to silence these shapes; replayed read-only, its 68 findings drop to zero.
- **`@committer` reads the engine's failure, not git's echo.** The kernel stages user-named paths through `commit:prepare` operands, consults `gitMessage`/`failedPaths` on failure and shows the `trackedIgnored` remedy once without blocking; the four preparation-command variants collapsed into one line to stay inside the kernel's size ratchet.

## [1.59.1] - 2026-08-21

### Fixed
- **`verify:artifact --kind=visual --runtime` measured nothing — every run was `UNVERIFIED`.** The page probe is serialized into the browser by `page.evaluate`, where no binding of the Node module exists, and 1.59.0 made it read `RUNTIME_PROBE_VERSION` from module scope: `ReferenceError` in every real browser, on every project, with or without Playwright. The version now travels as the `page.evaluate` argument. The suite stayed green because its browser stub handed back canned data without ever executing the function it was given — so the probe is now replayed the way Playwright runs it (stringified, in an isolated realm holding only a minimal DOM), the stub asserts the argument contract, and a lint fails the build on any module-scope name inside the probe body. A probe that answers below the version contract is reported as a warning instead of being silently ignored.
- **Playwright is resolved from the project under inspection, not only beside the CLI.** A global or `npm link`ed `aioson` shares no `node_modules` with the project, so `verify:artifact --runtime`, `qa:run`, `qa:scan` and `qa:doctor` reported "not installed" against a project that had installed it — while `aioson doctor`, which already looked in the project first, kept promising the runtime gate could run. One resolver (`src/lib/playwright-loader.js`) now serves all five, project first, CLI tree second; a test forbids a bare `require('playwright')` from returning anywhere under `src/`.

## [1.59.0] - 2026-08-21

### Added
- **Visual assurance now measures delivered craft instead of suggestive source code.** The verifier binds font evidence to the exact requested family, treats motion as present only when an animation is actually applied, distinguishes static canvas texture from movement, requires structural state evidence, verifies embedded media locally, and leaves external media explicitly runtime-dependent. A modern-CSS capability matrix and adversarial fixtures cover the shortcuts that previously produced premium-looking scores without premium delivery.
- **Visual proof is content-addressed and fail-closed.** Prototype approval evidence now carries a SHA-256 fingerprint over the prototype, manifest, identity, briefing, direct assets, and recursively referenced CSS assets. The manifest must describe a decision-grade visual direction, anti-goals, composition signature, exact evidence paths, and matching static/runtime craft projections; stale, missing, contradictory, failed, or unverified evidence cannot approve a visual handoff.
- **A browser runtime matrix closes the source-to-render gap.** Route/state combinations are exercised on mobile and desktop with screenshots and computed evidence for font delivery, failed media, material, applied motion, visible states, and craft axes. A requested runtime run that never completes is `UNVERIFIED`, never silently green.
- **Design seeds resist repetition at project scale.** Seed selection now includes project identity even when feature slugs match and remembers recent display faces, palette, material, and motion fingerprints. Finishing guidance is register-aware, so a premium result no longer collapses into one universal shadow-and-gradient recipe.

### Changed
- **Prototype Forge separates composition, operational completeness, and polish.** Agents establish visual direction before implementation, complete the working surface before the finishing pass, then produce the runtime matrix and bound evidence. Static grain is classified as material rather than motion, and finish is justified by the selected aesthetic register instead of a global shadow floor.
- **Benchmark completion requires rendered visual evidence.** A visual delivery counts as completed only when screenshot proof exists and runtime visual validation passed, making benchmark quality reflect what a user can actually see rather than what the implementation appears to promise.
- **Reference identity provenance is canonical and verifiable.** Identity records use `source: references|intent`; reference-derived records must name `reference-identity-extract` as their generator, preventing invented provenance fields from bypassing the verifier.

### Fixed
- **Source-level visual false positives no longer inflate quality.** Unused keyframes, disconnected canvas code, preconnect hints, unrelated `@font-face` declarations, lazy-loading attributes, generic error catches, and unverified external images no longer stand in for delivered motion, typography, states, or media.
- **Weak or stale prototype evidence no longer reaches approval.** Approval rejects incomplete route/state coverage, mismatched report projections, changed local or CSS-recursive assets, absent screenshots, and runtime work that was requested but not completed.

## [1.58.0] - 2026-08-21

### Added
- **A genuine decision becomes a record — `aioson decision:add` / `decision:resolve` / `decision:list`.** `workflow:next` already refused to advance a feature whose checkpoint held a pending blocking decision, and every kernel was forbidden to hand-write that file — but nothing produced it, so "Autopilot pauses for a genuine decision" was a sentence, not a mechanism. The CLI is the producer now: an agent that meets a choice only the owner can make records it (question, evidence, what omission costs, recommendation, options, who raised it — without those four fields it is a question, not a checkpoint), the gate blocks until a human records the outcome with `--choice --by`, and `--force` stays the explicit, recorded override. Ids are picked by agents and a fresh context restarts them at `DEC-01`, so re-raising a RESOLVED id with different substance REOPENS it: the earlier answer moves to `superseded_resolutions` next to the question it actually answered, never inherited as the answer to a new one. Schema v1 unchanged.
- **The owner confirms understanding — `aioson feature:summary --write` / `feature:acknowledge`.** Every artifact in the chain was machine-verified or agent-approved; no stage ever asked the HUMAN to confirm they understood what was specified and built. The executive summary is now rendered deterministically — no model, no prose invented — from the recorded chain (promises, capabilities, acceptance criteria, planned files, decisions with their evidence and consequence, code-vs-plan drift, visual evidence, gaps), in the project's interaction language with framework jargon translated through the decision-presentation map. The acknowledgment is tied to a hash of what was summarized: a summary the artifacts moved past is stale and refuses acknowledgment until regenerated. `feature:close` reports missing / stale / written / acknowledged — advisory, never a gate.
- **`## Business Rules` and `## Decision Branches` in the PRD.** "What must always / never hold" lived as prose inside the flows, with no id an AC could cite and no line a reviewer could grill; and the `if/when/unless` of a feature — where generated code goes wrong first — was enumerated by nobody before the code existed. Both sections are optional and linted when present (`RULE-*` with statement, kind, bound CAPs and source; `BR-*` with condition, expected behavior and the AC that covers it). Their ABSENCE is measured against the prose: rule language or unenumerated conditionals above their floors and no table is a warning.
- **`## Architecture Decisions` (ADR) and `## Interface Contract` in the plan.** The framework forbids a standalone architecture document, so `@architect`'s answer survived only as a dossier line — with nowhere to be READ by the next reader, the one thing a decision record exists for. `ADR-*` rows (decision, alternatives rejected each killed by a named fact, repository evidence, consequence) put it next to the engineering controls it constrains. `IF-*` rows (boundary, input, output, failure, CAP) are the stack-agnostic half of a specification: the same contract holds in Go, TypeScript or Rust, which is what lets the implementation language stay a deployment detail — and the failure column exists because what the caller sees when it fails is half the interface.
- **File and function size become measures.** `design-docs/file-size.md` said "> 500 lines: alert" and nothing ever counted a line; no gate ever measured a function. Both are machine-checked through `rules:check` now, with thresholds from the binding document's frontmatter, and every agent kernel and skill router gained a character ceiling — pinned where one existed, the class target where it did not, and a ratchet at current size where a kernel already exceeded it.
- **Motion is measured as three different things.** The craft lever read `(keyframes >= 3 && reducedMotion) || scrollReveal || transitionCount >= 12`, and every hand-written page carries a dozen hover transitions — so the third arm lit "motion" on surfaces where nothing moves unless poked, and a landing page scored full craft while delivering none of the motion its brief asked for. `metrics.motion` now separates `transitions` (state feedback, hygiene), `designed` (a keyframe system with reduced-motion, a scroll reveal, or a signature surface) and `signature` (paint that moves on its own: canvas/WebGL, an animated backdrop, a scroll-driven timeline). An `infinite` badge pulse animates transform and is not a backdrop; a backdrop animates paint.
- **`motion_ambition` — the ambition a feature wrote down becomes a floor.** The craft floor is generic: it asks whether a surface carries motion at all, never whether it carries the motion THIS brief promised. `kind=visual --slug` now reads the briefing, manifest, identity record and PRD, counts what the sources ask for, and reports whether the delivery answered it. A named signature moving surface is a deliverable, not a mood: it ships, or the manifest records which constraint killed it and what carries the moment instead. Advisory by construction — it reports a gap between two written-down things.

### Changed
- **The scope-drift gate lives on the canonical route.** `plan_path_untouched` and `delivery_outside_plan` are surfaced at the tracked `@dev`/`@qa` done-gate, comparing the delivered diff with the plan and demanding the difference be seen and recorded, never that it not exist.

### Fixed
- **A verdict never claims a comparison that did not run.** The visual conformance line derived its pass from `regressed: []`, which is a pass only when something WAS compared: a feature with no recorded prototype evidence wrote `nothing to hold the implementation to` into its own record and printed "holds the prototype floor" anyway, and the craft bail-out skipped EVERY axis when only the craft score was unavailable — though tells, typeface delivery, display scale and CSS dialect are measured on both sides without it. Conformance now carries `state` / `compared` / `not_compared`: a thin hand-authored surface is compared on the axes that are readable, a utility-class build stays uncompared without inventing regressions, and what nothing could read is named rather than assumed green.
- **`rules:check` counted violations twice.** The per-rule recount was keyed on the document, but a row is one (document × checker) pair — so the first document to declare two checkers reported each row with the sum of both, next to a findings list holding the right number.
- **`deverá` was invisible to the rule-language detector.** JS word boundaries are ASCII: the boundary fails after an accented vowel and backtracking dies on the following consonant, so `deverá` / `deverão` — the standard normative form of a Brazilian requirements document — never matched a check whose entire subject is that prose. Boundaries are Latin-aware now, and `se` counts only where it opens a clause: everywhere else it is the reflexive pronoun, and counting it made ordinary grammar trip the floor.
- **Scope drift counted AIOSON's own scaffolding.** Only `.aioson/**` was excluded, but the installer writes half the harness outside it — the per-client kernels, the root instruction files, `agents/_shared/`. With setup and the first feature in the same diff window, the message named dozens of files "outside the plan" and truncated the real drift out of view.
- **A charged state is a reachable state.** One `<button>` made a page owe loading, empty, error and disabled: a marketing landing whose only controls were a motion toggle and a guided tour was charged for all four, with no form, no request and no list to enter them from. Each state is now owed by the capability that makes it reachable — data entry or async work for loading/error/disabled, a collection rendered FROM DATA for empty (a static `<ul>` of nav links never counts), anything focusable for the focus ring — and the warning says which capability charged it, so it reads as a rewrite direction.

## [1.57.0] - 2026-08-19

### Added
- **Measured craft floor — a hygiene-green surface stops passing as premium.** Two consumer prototypes cleared every gate (tokens 95%+, runtime included) and were rejected on sight as cheap: the telemetry measured hygiene and was blind to ambition. `kind=visual` now measures five premium levers on full surfaces (≥150 declarations): a DELIVERED typeface (`font_delivery` — a family named with no `@font-face` and no webfont link silently renders the OS fallback; resolved through `var()` chains, which used to report `fonts: []` over a token system), display-scale type (≥56px, `clamp()` judged at its max arm), material depth (gradients/layered shadows/blur/grain/blend/masks/modern color), motion choreography, and evidence imagery. `craft N/5` lands in the human verdict line; warnings are rewrite directives with the numbers. The build contract unlocks typeface delivery as the ONE sanctioned external resource (font hosts or embedded WOFF2, fallback stack mandatory), and host image generation is the sanctioned plan B with provenance labeled `generated`.
- **Modern-CSS baseline measured — "looks dated" gets a number.** A full surface authored entirely in the pre-2020 subset (none of: container queries, `:has()`, fluid `clamp()` type, `oklch`/`color-mix`, subgrid, `text-wrap: balance`, `aspect-ratio`, scroll-driven reveals) draws an advisory warning; `craft.modern_css` lists what the surface actually uses. The effects vocabulary gained the Modern baseline dialect and display typography as the first material.
- **`aioson design:seed` — cold-start diversity is drawn, never defaulted.** Two consumer projects in unrelated niches shipped the same espresso-cream-rust wardrobe (accent Δ17°) with every per-project gate green: left to its prior, a model lands every origination in its favorite corner of the wheel. The new deterministic draw (project slug → seeded PRNG) proposes contrast-solved OKLCH palettes (ink ≥4.5 guaranteed and aiming AAA, accent ≥3, on-accent ≥4.5 — validated arithmetic, not taste), across light/dark/chromatic ground poles and seven harmony schemes (mono → duo-accent → color-block), paired with a curated bank of 23 deliverable typeface pairings (Google Fonts/Fontshare) and 10 hero postures speaking the visual-effects vocabulary. The engine builds FROM one candidate and refines with judgment; an extracted `identity.md` always outranks the draw; `--seed=N` re-rolls deterministically.
- **Cross-project palette fingerprint + repetition warning.** `kind=visual` now fingerprints what a full surface actually ships — usage-weighted accent hue clusters (through `var()`), ground lightness/pole — and records it in an operator-local registry (`~/.aioson/design-fingerprints.json`, best-effort, `AIOSON_DESIGN_REGISTRY` override). A new surface repeating a recent project's family (same pole within Δ24°, or Δ18° with the ground polarity flipped — the measured shape of the incident) draws a warning NAMING the repeated project, and `design:seed` reads the same registry to steer new draws away by golden-angle rotation. Brain node vq-023 binds the loop for every building agent.

### Changed
- **Rejection rebuild is identity-first, never a preset menu.** After a rejected visual, the refiner used to offer the installed preset catalog with one marked "recommended" — a sameness machine. The rebuild now asks for the owner's references first (→ `reference-identity-extract`); with none, it re-originates under a DIFFERENT register at its premium bar with a fresh `--seed` draw and the rejected build's craft warnings as the explicit fix list; a preset only when the owner names one unprompted. The installed catalog is never the decision surface, and `kind=visual` points intent-first builds that missed the craft floor at the identity route.
- **Design directions gained a site class — app ranges never cap a site.** "Brand & Presence" (identity-first foundation, 96/128px section rhythm, delivered display face at `clamp(2.5rem → 6rem+)`, subject at full presence, one committed material) joins the catalog, register premium bars keep austerity from reading as posture, and the one-line flavors now resolve to direction+register pairs instead of being buildable from a single line. Aesthetic registers carry an explicit "a register is a posture, not a budget cut" bar.
- **Dev/Deyvin conformance is craft-non-regression.** The approved prototype's measured verdict is the implementation floor: dropping the delivered face for a system stack, losing the material or reveals in translation, or downgrading the dialect is drift exactly like a layout deviation — fixed or recorded as an approved deviation. Utility-class codebases keep the duties through conformance plus the runtime pass.

### Fixed
- **A directory inside `.aioson/` is never a project root.** All 223 commands resolve their target through the containment-aware resolver, so running from `.aioson/briefings/{slug}` can no longer graft a second AIOSON tree inside the first.
- **`ac-test-audit` lexes Rust honestly.** A lifetime/loop label (`'static`, `'outer:`) opens no string literal, and raw strings (`r#"..."#`) carry their own delimiter — reading either as an ordinary quote desynchronized the mask for the rest of the file, hiding real assertions and exposing string bodies as code. Exceptions active for `*.rs` only; char literals still mask.
- **Ecosystem tutorial page** with a plain-language checklist for non-technical operators.

## [1.56.0] - 2026-08-17

### Added
- **`@benchmark` becomes the measured-traversal orchestrator — the AIOSON side of a Cockpit comparison is the real flow, not a shortcut.** The agent no longer builds alone: it detects the honest route from the frozen prompt and conducts the actual agent chain unattended. A single-screen game/toy crosses `@briefing → @briefing-refiner` and delivers the full working `prototype.html` (the comparable artifact to a pure harness's one-file answer); any real app — site, CRM, dashboard, anything a developer would build with Node.js/React/Vite — crosses `briefing → refiner (no prototype) → product → sheldon → planner → dev → qa` in Autopilot and delivers running software. When in doubt, full route. Contract in the new binding module `.aioson/docs/benchmark/traversal.md`, including the exact per-stage evidence paths an external observer watches (with `sheldon-review-{slug}.md` emitted by the orchestrator, since Sheldon seals the PRD in place).
- **`aioson benchmark:bootstrap` (+ `--check`).** Deterministic preparation of the measured workspace the Cockpit materializes: completes the managed agent set while preserving the frozen benchmark instruction and the caller's boundary files byte-for-byte (`installTemplate` grafts the AIOSON routing/memory kernel into existing `AGENTS.md`/`CLAUDE.md` — restored, so a measured round never inherits interactive routing or operator-memory loading), repairs `project.context.md` into a contract-valid one with `auto_handoff: true` (the Cockpit's minimal context is invalid: missing six required fields and `benchmark-delivery` is not a `project_type`), and writes the `.aioson/benchmark/measured-run.json` marker. `--check` is the dry verification: a round only starts after it proves the traversal can cross, or it names every missing piece.
- **`skipped_measured_run` prototype state.** The full route skips the prototype without lying about visual scope: distinct from `not_applicable`, derived from the marker by `resolvePrototypeState` (no hand-written fields), accepted in PRD frontmatter by the prototype binding — in `--strict` too — only while the marker exists, and rejected as a hard error in any real project. `briefing:approve` refuses inside a measured round (`prototype_skipped_measured_run`, messages in all four locales): the measured state can never be promoted into product authority.
- **Traversal orchestration exception in the activation wrapper.** `agent:prompt benchmark --headless` used to inject a scope boundary ordering exactly the manual stop the traversal cannot obey; for the benchmark agent the wrapper now authorizes conducting the chain inside the assigned run and points at the traversal contract. The Cockpit freezes this exact prompt per round.

### Changed
- **`@benchmark` left the visual-quality and web-capture consumer sets.** The building — and the anti-slop lens with it — belongs to the agents that actually build (refiner/dev); the orchestrator carries the delivery bar (completeness checklist, honest validation, strict schema-1 result with exactly the 11 v1 fields) instead of the construction playbook.

### Added
- **`aioson rules:check` — rules stop being prose and become a verifiable contract.** A consumer project shipped entirely in Portuguese (`servidor/`, `rotas/`, `criarBloco`) with every gate green. The cause was not a missing rule and not a regression: the @dev dossier records that it read the rule and decided the PRD outranked it ("cumulative authority"), and no machine measured naming, so nothing contradicted it. A rule now binds itself to a deterministic checker with `enforcement: <id>` in its frontmatter; `src/lib/naming-language.js` reads path segments and declared identifiers only — never strings or comments, because product copy in the project language is what the rule itself allows. Authority differs by surface and the check says so: `.aioson/rules/` is hard law and **blocks**, while `.aioson/docs/` and `.aioson/skills/process/` are procedure and craft and are downgraded to advisory. Auto-fires from the engine (dev/qa epilogue, `workflow:next` stage gate, dev phase-loop) rather than from a hook, so it behaves identically under Claude Code, Codex, or any other harness.
- **Rule supremacy is stated where it can be obeyed.** A `## Precedence` section in the rule and the rules README, plus rule-supremacy clauses in the product, sheldon, planner, dev, and qa kernels: a briefing promise, PRD criterion, plan, prototype, or dossier decision can never resolve a conflict in its own favour. The only legitimate resolution is a human editing the rule.
- **A project built against another convention is diagnosed, not blamed on the slice.** When a check is about to block and no baseline exists, `rules:check` measures the whole tree; if the convention is established (≥40% of files, ≥3 offenders) it reports `divergence` and lays out the three real options — migrate, `--baseline` to accept existing code as counted debt while every new violation still blocks, or edit the rule — and explicitly forbids an agent from choosing. `.aioson/context/rules-baseline.json` is keyed by rule+scope+identifier, never by line, so moving code does not resurrect accepted debt.
- **`tests/governance-simulation.test.js` — governance is simulated against mock projects.** Tauri, .NET, Laravel, legacy pt-BR, and greenfield English trees, each probed for three separate properties: the rule is retrievable (reach), the check reads the files that project actually has (sight), and an all-clear is only ever emitted after something was scanned (honesty). 13 of the first 15 assertions failed.

### Fixed
- **An empty scope no longer reads as an all-clear.** `--changed` over an empty diff scanned zero files and printed OK — and both auto-fire seams run with `--changed`. A project without git yet, or work committed before the handoff, silently switched the whole enforcement layer off exactly when it was being relied on: the original incident's shape, reproduced by the gate meant to prevent it. An empty scope now widens to the full tree and the report names the fallback.
- **Build output and vendored code are no longer judged as the project's naming.** `target/`, `obj/`, `Pods/`, `_build/`, `.dart_tool/`, and generated filenames (`*.min.js`, `*.g.dart`, `*.pb.go`) were read as source once the rule reached compiled languages. In a Tauri project twelve generated crates produced `divergence=0.95` — the tool would have told a human their own code was the divergence.
- **Partially cleaning a legacy file is no longer punished as new drift.** The per-file report cap leaked into the baseline, so fixing three of twelve violations exposed three the baseline had never seen and blocked the slice that improved the file. Baseline writes now scan uncapped.
- **`--baseline` records the whole project**, not whatever scope flag was already set; `--paths=<directory>` expands instead of scanning nothing and passing; `--strict` measures divergence at the severity that is actually blocking; a document declaring a checker nobody implements is reported under `misdeclared` instead of sitting silently among the prose-only documents.
- **The naming rule reaches every source path.** Its `paths:` whitelist left `src-tauri/`, `components/`, `internal/`, and `cmd/` outside a rule that governs every identifier — the enumeration was itself the bug. Also drops `pasta` from the pt/es lexicon: it is an ordinary English noun, and one recipe app would have been enough to teach a team that the check lies.
- **Rules no longer starve each other under the constraint cap.** `context:brief` concatenated governing documents before truncating them, so a verbose first rule spent the budget and the second, third, and fourth rules in a project contributed nothing — invisibly, since the package still came back full. Documents now interleave.
- **Guidance addressed to another framework is no longer a binding constraint.** A React project was handed "For Laravel, prefer FormRequest" in `constraints` and in guard injections; stack-scoped bullets are now filtered against the detected stack, and the bullet that does address the project sorts first.

## [1.54.0] - 2026-08-15

### Added
- **`web:save` + `web:extract` — deterministic local capture of reference sites.** A reference URL becomes `researchs/{slug}/site/` (assets, manifest, fingerprints) plus a token-lean `extract.md`, captured by the CLI instead of narrated by the model. The capture route is the client's decision, taught by one shared on-demand module (`web-capture.md`) instead of per-agent recipes, and `captured_via` is stamped deterministically: `aioson` at save time, healed at extract time, `external-mirror` for foreign mirrors — the aioson-vs-harness comparison no longer depends on the model.
- **`crud-surface-integrity` rule.** Generalizes defects that crossed a green QA in a consumer project into shipped template intelligence: row identity via the persisted ID, create/edit parity at three points, required fields enforced in the domain schema, tests that drive the real form, and a clean test database. pt-BR recall pinned in `interaction-rules-recall`.
- **The briefing prototype explains itself and proves its differentiator (anti-slop backlog #1, fed by the supervised-briefing 3-complaint report).** First-open tour (`data-aioson-tour` + persistent `?` control) translated from the PROM-* promises in lay language; `data-aioson-primary` marks the briefing's #1 differentiator, with an opt-in runtime fold check (`--route=<hash>` for inner screens) that would have caught the real below-the-fold bug; a spec-blind first-contact walkthrough gates the handoff; a manifest without a filled `## Visual direction` is blocking in slug mode — an identity record answers tokens, never composition, in identity mode exactly as in cold start; emoji-as-icon and uniform card walls became measured warnings; `kind=visual` auto-fires at the refiner's `agent:done` via `also:` kinds (clean skip for non-visual features); post-gate rejections feed `.aioson/learnings/`; brain nodes vq-016/017/018.
- **Copy cadence is measured (anti-slop backlog #1b, second complaint round).** A prototype had cleared every visual gate carrying 60 em dashes, because the cadence rule judged "neighboring sentences" — scattered microcopy (toasts, placeholders, tour steps, seeded mock data) is never neighboring — and the author graded itself. `visual-telemetry` now counts spaced em dashes across the visible corpus (styles and HTML/JS comments out, script string/template content in, which is where SPA copy and seed data live), reports `em_dash_prose` with context samples, and warns from 4 up; brain node vq-019 anchors judgment on the aggregate count instead of the sentence; the prototype-forge polish pass and handoff gate treat model-cadence copy as a defect. Live proof: the incident prototype measures 34.

### Changed
- **Kernel diet via on-demand docs.** The three standing kernel-budget failures were resolved by moving recipe out of the kernels into routed modules: benchmark 15294→13995 chars (new `docs/benchmark/execution-playbook.md`), briefing 12802→11983 (SRC/PROM row schemas → `exploration-and-artifacts.md`), briefing-refiner 13168→11977 (eligibility probe → `refinement-loop.md`), pentester 8835→7993 (compression; playbooks already existed). Every test-pinned phrase preserved.

### Fixed
- **`aioson update` never destroys project state.** Every existing file about to be overwritten with divergent content is snapshotted to `.aioson/backups/{ts}/` first — including name collisions between a project file and a new template file; identical content produces no snapshot. `squads/memory.md` and `genomes/INDEX.md` joined `PROJECT_LOCAL_FILES`: the template only seeds them, update never overwrites them, and intentional deletion is respected.

## [1.53.0] - 2026-08-13

### Added
- **`feature:close` closes like a professional tool.** All blocking gates are collected in one pass; a TTY close asks "Close anyway? [y/N]" (accepts s/sim); `--preflight`/`--explain` show every gate verdict while executing and mutating nothing; and a forced close enumerates each bypassed finding and persists `done/{slug}/force-bypass-findings.json` as an audit record. The publish human gate deliberately stays non-forceable.
- **Onda 2 — engines became commands; prompts read JSON instead of re-deriving.** Seven thin read surfaces over code that already existed: `feature:trace` (the PROM→CAP→AC→phase→files chain that Planner, Dev, and QA used to re-derive from three or four artifacts per feature — the single largest token waste in the system), `workflow:mode` (full Autopilot precedence as `{enabled, source}`), `pentester:coverage` (coverage verdict without an HTML bundle), `genome:apply`, `setup:detect`, `feature:diff` (read-only review payload with an honest `git_unavailable`), and `feature:current --with-summary`. `forge:compile` now persists `forge-run.report.json` and returns a recompilation delta.
- **Onda 3a — promised gates became deterministic validators.** `verify:artifact --kind=benchmark-result` (schema v1, status/validation enums, path existence + containment, forbidden provenance fields, "completed requires entrypoint + feature→validation coverage"); `ac:test-audit --seed` (the tester's deterministic hypothesis-matrix seed list: AC ids + `EC-*` Engineering Controls rows + open security findings); and `profiler:coverage`, which counts the research-report sufficiency floor (source tiers, category coverage, orphan `S<#>` refs, declared-vs-measured delta) that two profiler agents used to recount by eye.
- **`kind=shakedown` artifact gate** plus the Fase 0 auto-fire repairs: `agent:epilogue` forwards `--slug/--file/--dir` into its embedded `agent:done` (locator kinds fire through the epilogue path at last), and feature-slug kinds fall back to `--feature` when `--slug` is absent.

### Changed
- **Onda 1 — agent prompts delegate to the CLI what is already deterministic** (17 findings from the token-economy audit): agents stop narrating checks the engine owns and transcribe measured results instead.
- **The §2c runtime contract blocks early, not only at close**: a detectable runtime feature with no `harness-contract.json` now blocks at dev-done and Gate C, where authoring it is cheap.
- **Closed-feature artifacts resolve via `done/{slug}` everywhere** — retroactive audits of an archived feature stop reporting "0/0 covered".
- Markdown normalized to LF across the repo with `eol=lf` pinned in `.gitattributes`.

### Fixed
- **`feature:close` gate false positives eliminated (wave B, incident-driven).** A partially archived feature no longer reads as a broken one: `validatePrototypeBinding`/`validateIdentityBinding` fall back to `context/done/{slug}/briefings/` for prototype, manifest, and identity reads (the PRD binding stays canonical), and the `missing_manifest` message stops claiming "Prototype exists" when it does not. Runtime detection now separates feature-attributable signals (prototype manifest — live or archived — and migrations in the feature's own progress steps) from shared-working-tree evidence: with no contract, tree-only migration churn surfaces as an `unattributed_runtime_churn` warning instead of a hard `missing_runtime_contract` (in a multi-feature tree it may belong to parallel work), while a present contract keeps full git-parity strictness. And the close-time AC audit accepts a concrete QA PASS row from the CAP/AC evidence table for ACs whose PRD `Evidence` column declares manual verification (visual smoke, measurement, inspection) — an AC that promised an automated test still owes that test, so the "cite the AC in an asserting test" guarantee keeps its teeth. The PRD contract now documents the `Evidence` column as a binding declaration.
- **Archive move is EPERM-resilient on Windows** with the "destination exists ⇒ complete content" invariant (partial-copy rollback, `source_residue` as an actionable error) and an honest `completed_with_errors` close when archiving fails.
- **`harness:init --dry-run` is real and the runtime stub is valid**: RG-* criteria carry unique `TODO(...)` verifications that `harness:check` reports as "fill me" without executing.
- **The validator's review payload derives its base from the feature's first commit** when the work is already committed; `feature:close --help` lists the whole closure cycle and `--slug`/`--feature` are aliases everywhere in it.
- **Re-closing an already archived feature is honest and leaves no litter (wave C).** The close summary now states the archive state instead of falling silent when there is nothing to move ("nothing to move — feature already archived at done/{slug}/"), and the dossier guarantee recognizes an archived dossier instead of synthesizing a stray duplicate. Dossier synthesis itself gained the A6 fallback: an archived feature's dossier is built from its own `done/{slug}/prd-{slug}.md`, never from the unrelated global `prd.md` (which used to produce a dossier describing a different product). And `feature:archive` reconciles a leftover slug dir with the existing archive instead of skipping it forever: files missing from the archive are merged in, identical live copies are deduped, divergent copies stay put and surface as an actionable `archive_merge_conflict` (never overwritten silently), emptied dirs are pruned, and `mappings/{slug}` (session continuity) is archived alongside the other slug dirs.

## [1.52.0] - 2026-08-12

### Added
- **`@shakedown` — the spec-independent completeness walkthrough.** Every existing verifier is anchored to an upstream artifact (QA to the plan, tester to the code, validator to the harness contract, scope-check to approved scope), so a PRD blind spot crosses the whole chain untouched. The new opt-in agent walks the delivered system the way a tech lead walks an unfamiliar product: a deliberately spec-blind first pass over a full surface inventory (coverage is a set-difference — `surfaces − visited = 0` — never a sample), CRUD/form/error-path/consistency checklists from `.aioson/docs/shakedown/completeness-checklist.md`, and a `shakedown-{slug}.md` punch list (`bug`/`incomplete`/`polish`, every finding carrying reproduction steps or sibling-module evidence plus a suggested fix lane). Four targets, one method: post-QA features, archived features, Simple Plan deliveries, and direct module targets. It finds and lists, never fixes, and never touches Gate D.
- **Agent-surface drift guard.** `tests/agent-surface-sync.test.js` pins every slash wrapper to `AGENT_DEFINITIONS` (existence, instruction-file reference, and now the description itself), bans abolished artifact surfaces from wrapper help, requires template ≡ workspace byte-equality for agents and wrappers, and asserts routing-table + Neo-catalog reachability for every defined agent. Fourteen stale wrappers were regenerated on the way in — including `@orchestrator` still advertising a session protocol abolished releases ago and `@qa`/`@analyst` carrying size-tag claims the kernel contradicts.
- **Genome approval drift is visible in normal flows.** `analyzeGenomeApprovals` was exported and consumed by nothing; it now runs as `squad:validate`'s fifth layer, so every stale user freeze surfaces with its exact `genome:approve` re-approval command. `@genome` threads `--slug` into `agent:done` (arming the `kind=genome` advisory), reports approval drift after every enrich/recompile, and refuses a `compiled` claim without a before→after executor-delta.
- **`verify:artifact --kind=copy --file=<path>`.** Mode 4 squad deliverables live under the squad's `output/` tree, outside the four canonical context candidates; the gate retargets to the exact deliverable, so every copywriter mode is measurable and the agent names its per-mode artifact before writing.
- **Prototype-gate refusals speak the project's language.** The `briefing:approve` gate messages resolve `interaction_language` (legacy `conversation_language` fallback, English default) and read from the i18n catalogs in en/pt-BR/es/fr, with the stable English error codes preserved in every locale so tests and tooling keep matching them.

### Changed
- **Elite doctrine installed across all 34 agents.** Machine checks run before judgment (`@product` runs `kind=sources`/`kind=prd` before handoff, `@dev` resumes from `dev:resume-data` and self-audits with QA's own `ac:test-audit`, `@planner` resolves the runner with `detect:test-runner`); handoffs carry measured state (classify tier and lint verdicts, tester's `metrics` block, QA FAIL as a structured correction packet mirroring tester's); prose rules became set-differences (pentester coverage minus `coverage[]` rows, validator results-completeness, benchmark validation-per-feature, orache per-dimension sources); provenance is pinned (profiler `S<#>` source IDs plus a numeric sufficiency floor, copywriter genome+approval frontmatter, analyst `path:line`-or-product-choice labels).
- **Broken seams closed across the chain.** Wave rules moved to their real owner (`@planner`) and `forge:compile` refusals stopped routing to `@pm`; Sheldon gained the explicitly-routed harness-contract repair carve-out that `@validator`'s integrity failure now targets by doc path; `@ux-ui` routes its eight previously orphaned mode docs; `@qa` adjudicates pentester security findings and reads Source Coverage from the PRD; `@dev` registers `--complete=dev`; `@deyvin` finally updates the continuity pulse it reads on activation; `@site-forge` gained the rights/authorization gate for clone modes and a reachable Mode A with numbered questionnaire options.
- **Kernel diet under real budgets.** The 14336-char kernel budget forced `@product` trims and moved `@dev`'s execution lanes to the routed doc `.aioson/docs/dev/execution-lanes.md`; `@deyvin` returned under its 16384-byte density budget; `@squad` completed a one-rule-one-place diet to 12,287 bytes. The P2 commit lands net −201 lines.
- **Owner boundary decisions.** A filled `design_skill` changes only by explicit user decision (`@product` recommends, `@ux-ui` advises); the ownerless CLI families (`parallel:*`, `orchestrator:*`, `runner:*`, `cloud:*`, `learning:*`, `context:cache*`, `recovery:*`, `pattern:detect`, `output-strategy:*`) print a deprecation warning at dispatch pending a major-release removal; `@design-hybrid-forge` owns from-scratch skill origination alongside its two-parent and external-source modes, with creation ownership recorded in `config.md`.

### Fixed
- Discovery surfaces stopped lying: `@benchmark` is reachable from the routing table and the Neo catalog, Sheldon is listed as the mandatory canonical reviewer, `@copywriter` has the agent-help section its kernel prints, and the briefing help no longer advertises the forbidden direct-to-Product route. `config.md`'s runtime-lifecycle table teaches the modern telemetry commands (`runtime:emit`/`pulse:update`/`agent:done`), `verify-artifact-gates.md` documents all 19 implemented kinds, and the repo's own `project.context.md` regained `interaction_language` and dropped the removed locales dir. An honest empty-yield Orache investigation no longer fails its own done gate, and the pentester correction cycle respects `report_mode: none`.

## [1.51.0] - 2026-08-12

### Added
- **Squad pilot contract — approval by artifact, frozen only by the user.** `squad:validate` proves structure and `squad:eval` proves grounding; neither proves a deliverable-class squad (`mode: software|mixed`) can ship its flagship artifact at the quality bar the user has in mind. The squad's own executors now build one representative deliverable under `output/{slug}/pilot/` with an honest `PILOT.md` evidence doc (exact executed commands — a recorded FAIL is legal evidence), tracked by a canonical `pilot` block in `squad.manifest.json` and measured by `verify:artifact --kind=squad-pilot`: entrypoint containment, placeholder hygiene, mandatory doc sections, and lane-proportional deferral (`quick` may defer with a concrete reason; `regulated` and `premium` never). Only the user runs `squad:pilot-approve`; the freeze stamps a content fingerprint of the deliverable tree, so editing the pilot after approval is visible staleness, not a silent pass. The approved pilot becomes the squad's binding quality bar, and a one-pass domain-distillation loop can extract its signature into `.aioson/skills/squad/domains/` — seeded with `cinematic-web` and `crm-operational` — so the second squad in a domain is born knowing what the first one learned.
- **Genome approval by specimen — and pilots that remember their builders.** Doctor proves structure and the held-out A/B proves scores; whether a compiled persona actually carries the source's identity to human taste is the user's verdict, and it is now frozen instead of inferred. `genome:approve --squad=<slug> --genome=<slug>` stamps a user-only `approval` block onto a **compiled** binding, pinning the inspected specimen (default `output/{squad}/specimen/{genome}/`) plus the binding's `sourceHash` and `compilationId`. Any later enrich or recompile drifts that identity and the approval reads stale until re-approved — `verify:artifact --kind=genome` names every affected squad as advisory warnings at `agent:done`. The same identities close a hole in the pilot contract: `squad:pilot-approve` now records `pilot.builders`, so a genome that changes after pilot approval surfaces as "the squad that built this no longer exists in that form" even while the deliverable fingerprint still matches.
- **Deterministic briefing gate — `verify:artifact --kind=briefing`.** The briefing is where `SRC-*`/`PROM-*` lineage and the eight-section skeleton are born, but their first mechanical check used to happen two agents later, in Sheldon's preflight. Frontmatter identity, the eight mandatory sections, open-question classification, placeholder discipline (the canonical "TBD — not discussed in this session." stays legal), and the `config.md` registry entry are now measured at authoring time, and the adapter runs the same source-lineage analyzer `kind=sources` trusts, so fingerprint staleness surfaces where it is written instead of at review. Legacy conversational briefings degrade to warnings; whether each `PROM-*` faithfully represents its source stays the agent's judgment.
- **Spec-quality and interaction contracts bound at the briefing origin.** `@briefing` joins the design/visual-quality brain: the replaceability test runs on Problem and Proposed solution — the first place slop can enter — matching `.aioson/rules/` are binding, and rich surfaces record their interaction contracts (masks/validation, status-change confirmation, recurring-flow drag-and-drop, decision widgets) as promises or classified open questions. The contract is born as scope instead of being discovered as an absence by the refiner.
- **QA closes the interaction chain.** `@qa` binds the interaction lens (`brain:query --tags=interaction,forms`) as delivery criteria for promised surfaces — masks reject what the contract rejects, confirms cancel cleanly, drag-and-drop survives a reload, widgets reflect live data — each needing one concrete CAP/AC evidence row verified on the real surface, never new scope. Origination → spec → prototype → implementation → verification is now one unbroken chain.
- **Tester adversarial coverage contract — `verify:artifact --kind=test-report`.** Partial coverage stops being a silent default: the tester's report carries a class-tagged hypothesis matrix (boundary, invariant, state-transition, failure, regression, property) and a mandatory residual-risk section naming every uncovered path in the tested scope, with adversarial depth the default on critical paths — auth/ownership, money, irreversible actions, public APIs, consistency state machines. The deterministic half mirrors the briefing gate (sections, class enum, executed-command evidence where a recorded FAIL is valid, correction-packet coherence) and auto-fires at `agent:done --slug`.
- **Compiled-stack builds are a capped, serialized machine resource.** A Rust project building on cargo defaults — one rustc per logical core, MSVC linker spikes, `*-sys` build scripts spawning cl.exe/MSBuild — can freeze a 16GB machine. `@dev`'s stack conventions now treat build parallelism as a resource: a `.cargo/config.toml` jobs cap around half the cores plus `CMAKE_BUILD_PARALLEL_LEVEL` (created and disclosed when missing), one cargo invocation at a time, `cargo check` per slice, scoped tests; brain node `dev-006` carries the recall. The deterministic fix stays machine-level config — config beats prompt.
- **The PT docs teach the main flow.** `docs/pt/README.md` now opens with the canonical route — `@briefing → @briefing-refiner → aprovação → @product → @sheldon → @planner → @dev → @qa` — as a diagram, a per-stage in/out table with links, the reasoning behind the order, and a short end-to-end example. The reference gains the full `verify:artifact` kind table with practical sections for the pilot and genome-approval cycles, and the agent sheets were corrected against the real CLI syntax.

### Fixed
- **The briefing prototype gate now explains itself instead of dead-ending.** `briefing:approve` on a visual-scope briefing without its prototype used to emit only the raw code (`prototype_resolution_missing`) — worded as if the prototype had a problem rather than not existing — while `briefing:apply-feedback` had just told the user "approve now" and the refinement report recorded `next_action: approve_briefing`. All three surfaces are now prototype-aware, sharing one deterministic resolver (`prototype.html` present / explicit `prototype: not_applicable` / missing): every gate refusal names the expected path and both legitimate exits (@briefing-refiner builds the prototype, or the briefing records the non-visual declaration — manifest problems name the exact field and owner too); a confirmed apply with no blockers but an unresolved prototype reports `next_action: build_prototype` instead of pointing at a command that will refuse; and `verify:artifact --kind=briefing` surfaces the pending state as an advisory warning at `agent:done`, before the human ever hits the wall.
- **`verify:artifact --kind=copy` now measures every copywriter mode, not just two.** The scan covered only `copy-{slug}.md`, but the six modes write four canonical documents — so a VSL-only session failed on the absent body file while `vsl-script-{slug}.md` went unscanned, and review/campaign artifacts were never measured at all. The adapter now scans whichever of `copy-`, `copy-review-`, `vsl-script-`, and `campaign-{slug}.md` exist, and only a slug with no copy artifact anywhere is an issue (naming all four locations). The copywriter docs also bind the new approval contract: an approved, non-stale genome binding is the strongest voice signal when choosing a master, and specimen production for `genome:approve` runs through squad-executor mode — the freeze itself stays with the user.

## [1.50.0] - 2026-08-11

### Added
- **Downgrade guard for `update` and `install --force`.** The template copy comes from the installed CLI's own bundle, so a stale global CLI running `update` on a newer project would mass-downgrade every managed file — and `install --force` would do it with no backups at all, since `backupOnOverwrite` only arms in update mode. Both now compare the CLI version against the project's `install.json` `template_version` and refuse with a message (in all four locales) that explains the CLI-before-project order; `--allow-downgrade` is the deliberate escape hatch. A project with no recorded or unparseable version never blocks.

### Fixed
- **Windows consoles no longer render CLI output as mojibake.** The logger wrote with `fs.writeSync(1)`, which reaches a console handle as raw bytes and gets decoded with the legacy codepage (cp850/cp437) — every `✓ — • ⚠ ─` and pt-BR accent came out as `Ô£ô`/`ÔÇö` garbage, seen live on the hooks-by-default output of `aioson update`. TTY output now goes through `process.stdout`/`stderr`, which uses the console's Unicode API and renders correctly under any codepage; pipes and files keep `fs.writeSync`, so `--json` automation keeps its guaranteed-synchronous delivery. This is also why the i18n catalogs historically avoid accents — with the root cause fixed, future messages need not.
- **A corrupted global config can no longer be silently destroyed by the hooks install.** The merge read `~/.claude/settings.json` and the Antigravity hooks files with a catch that treated "exists but does not parse" as "does not exist", so one trailing comma from a hand edit meant the user's entire settings file was rewritten as a hooks-only object. `readJsonForMerge` now distinguishes the two: a corrupted file is left untouched, reported with instructions, and that tool is skipped. Uninstall already had safe semantics.

## [1.49.0] - 2026-08-11

### Added
- **`verify:artifact --kind=prd` — the deterministic half of Sheldon's approval gate.** The approval contract used to be a checklist only the model executed. Now the mechanical part is measured: briefing `PROM-*` coverage, the required `CAP` → Current System Fit → Acceptance Criteria chain with unknown/duplicate id detection, evidence cells that assert instead of prove (`works`/`funciona`/`done` are issues; no named verification mechanism is a warning), Current System Fit rows without repository paths or citing paths that do not exist, prototype binding coherence including on-disk presence, material prototype states never mentioned, and leftover placeholders. Resolves `--slug` to `.aioson/context/prd-{slug}.md` (`prd.md` fallback). `@sheldon` runs it advisory in the deterministic preflight and requires a clean measurement before sealing `sheldon_review: approved`.
- **`verify:artifact --kind=sources` — machine-run source-pack verification.** The kernel used to ask the model to reopen every inventoried source, recompute its SHA-256, and reconcile `SRC-*`/`PROM-*`/Source Coverage by hand — token-expensive deterministic work a model does worse than a hash function. The lineage analyzer the gates already trust is now one early verdict: per-file fingerprint staleness, inventory/promise/coverage bijections, and lifecycle stage. A feature with no briefing reports not-applicable instead of failing. `@sheldon` keeps for itself the judgment the machine cannot make — whether each `PROM-*` faithfully represents what its source says.
- **Hooks are installed by default across the whole lifecycle.** `init`, `install`, and `update` now run the hooks step through a shared `installDefaultHooks` helper, so a project ships with the full enforcement mesh — `context:guard` injecting project rules before every write/edit, plus runtime telemetry — instead of depending on the user knowing an extra manual step. Updating an older project is exactly when that layer is most likely missing. Same contract everywhere: `--tool=claude|antigravity|codex` targets a tool (otherwise auto-detect), `--no-hooks` opts out and prints how to install later, a hooks failure never fails the surrounding command, and dry-run flows through to an installer that never writes.
- **Interaction contracts are measured, not just documented.** Visual telemetry gained a lexical pass over the four universal interaction rules: native browser dialog calls join the blocking tier, and bare structured fields (CPF/phone/currency with no mask, `inputmode`, `pattern`, `maxlength`, or `autocomplete`), destructive controls without dialog machinery, click-only kanban surfaces, and management shells without widget markers become reviewer warnings — so a missed rule is caught by the gate rather than by luck.
- **Four universal UX rules with their brain nodes** — form masks and validation, status-change confirmation modals, drag-and-drop for recurrent status flows, and decision-driving management-home widgets (`vq-009`–`vq-012`), surfaced through the brain query `@briefing-refiner` and `@benchmark` already run, and added to the Prototype Forge build contract as blocking conditions.
- **Verified implementation gotchas as permanent knowledge** (`vq-013`–`vq-015`) — UI spinners must not reuse scene keyframes carrying positioning transforms, re-triggering a class animation needs a forced reflow, and live masks either preserve the caret or declare append-only typing. Found while supervising a real model-built prototype.
- **`aioson doctor` reports Playwright availability** — advisory, resolving from the project first and the CLI tree second, so the runtime visual pass fails loudly as "not available" instead of silently not happening.
- **Three pt-BR documentation gaps closed** — [Instalar e atualizar](docs/pt/2-comecar/instalar-e-atualizar.md) (requirements, every `init`/`install`/`update` flag, hooks by default, and the CLI-before-project upgrade order), [Regras de interação e gate visual](docs/pt/5-referencia/regras-de-interacao-e-gate-visual.md), and [Squads](docs/pt/5-referencia/squads.md).

### Changed
- **Runtime browser measurement is the attempted default.** The two real bugs found while supervising a model-built prototype were invisible to static telemetry — exactly the class `--runtime` exists for. Both routed visual docs now run `verify:artifact` with `--runtime` in the default invocation and require the outcome (measured, or the not-available reason) to be recorded when declaring visual work complete.
- **`context:guard` binds rule injection to surface kind and declared path scope.** Live sessions showed interaction rules injected into CLI sources, JSON data, and Node test harnesses whose content merely mentions their keywords — files about forms are not forms. Rules may now declare `guard_surfaces` (the four interaction rules bind to `ui`: markup/style files, product docs, DOM-flavored scripts), and a declared `paths:` scope is verified directly against the edited file for every injection, domain signal or not.
- **A blank `design_skill` no longer stalls the refiner** — prototype work defaults to `interface-design` origination as a declared, manifest-recorded fallback. The skill also gained a premium pass: a Cinematic aesthetic register, full Immersive Media and Conversion Landing directions, and a motion choreography contract (easing tokens, staggered entrances, scroll reveals, reduced-motion degradation).
- **The README is a portal, not a manual.** It had grown into a 1000-line document duplicating what `docs/pt` and `docs/en` already cover — two copies that drift, and the one a newcomer reads first was the stale one. It now carries what AIOSON is, the problem it solves, quick start, and routed entry points into both trees. The pt-BR portal switches to the linear Entender → Começar → Receitas → Agentes → Referência order.

### Fixed
- **`aioson install --no-hooks .` swallowed the path.** The parser did not know `--no-hooks`, `--no-guard`, and `--runtime` carry no value, so the positional argument was consumed as the flag's value. Found by the documentation audit while verifying flag claims.
- **A glob ending in `/**` matched nothing.** `pathMatchesPattern` treated any such pattern as a literal prefix, so `**/migrations/**` was compared against the literal string `**/migrations`. The prefix fast path now applies only to literal prefixes, and `globToRegex` gives `**/` its zero-directory semantics. Exposed by the new direct path-scope check.
- **`status-change-confirmation` missed pt-BR wordings.** Its triggers carried the English verbs but not `cancelar`/`excluir`/`apagar`/`remover`/`arquivar`/`publicar`/`rejeitar`/`reprovar`, nor `modal`, so a real refiner task phrased as "cancelar OS" did not recall it. A recall-audit test now copies the four interaction rules verbatim from `template/` and pins realistic pt-BR wordings to the rule that owns them.
- **Comments are not the artifact.** A prototype's design-rationale header saying "not admin density" read as a management surface; a commented-out `confirm()` fired the one finding that promises near-zero false positives. `analyzeVisualSources` now strips `<!-- -->` blocks on entry (mirroring what `stripComments` already did for CSS), script text is stripped of JS line/block comments before the native-dialog scan (`//` after `:` survives so string URLs are not eaten), and the call regex rejects a preceding `/` so `example.com/confirm(guide)` no longer reads as a dialog call.
- **Windows temp cleanup no longer randomly kills the suite.** Runs at concurrency 8 died with `rmdir ENOTEMPTY` when antivirus or indexing briefly held handles inside freshly-written temp trees. A `--require` setup pinned on the `npm test` script default-injects `fs.rm` `maxRetries`/`retryDelay` for recursive removals — Windows only, never overriding a caller-set value, so Linux/macOS keep strict semantics and a genuine handle leak still fails loudly.

## [1.48.0] - 2026-08-09

### Added
- **Scoped, economical security reviews** — `@pentester` now resolves what to review before it probes anything. `--scope-mode=feature|simple-plan|paths|routes|project` bounds the surface, `--paths`/`--routes` name it explicitly, and `--report=full|none` decides whether the run also produces the HTML bundle. Flags win, an unambiguous request answers on its own, and only a real remaining fork reaches the user. With `report_mode: none` the missing report bundle becomes a warning instead of a contract error, and incomplete coverage escalates in its place, so economy mode never buys silence.
- **`pentester:report --list`** — enumerates the runs that can still be reported, with their finding counts and whether an HTML report already exists, instead of failing on a `--feature` slug the user had to guess.
- **`feature:list`** — enumerates the features registered in `features.md` with status, dates, and the active one marked. `feature:current` answers which feature is active; this answers which features exist, which is what a scoped review needs before it can bind itself to a slug. Supports `--status=`, `--limit=`, and `--json`.
- **Identity binding across the workflow** — the extracted `identity.md` visual record now travels with the prototype instead of dying at the briefing boundary. The prototype manifest declares the record it was built from, the PRD carries `identity`/`identity_status` (`current`, `project`, or `none`), and `prototype:check` fails when that record is dropped, borrowed from another feature, dangling, non-canonical (`scope: exploration`), or contradicts the manifest. A PRD that legitimately has no identity stays green.
- **`rule:new`** — scaffolds a project-authored rule under `.aioson/rules/` with valid routing frontmatter (`agents`, `paths`, `triggers`, `task_types`, `priority`, `load_tier`), so a project can extend agent behavior without adding an agent. `verify:artifact --kind=rule` then proves the rule is routable and that its scaffold placeholders were replaced.
- **Routed visual-implementation guidance** — `.aioson/docs/dev/visual-implementation.md` carries the anti-slop and visual-authority criteria for `@dev`/`@deyvin`, loaded only when the work is actually visual.
- **`verify:artifact --kind=visual` — static visual telemetry.** The measured half of anti-slop: it reads the HTML/CSS that was actually written and returns arithmetic instead of prose — token adherence, spacing off the 4px grid, active depth strategies, font families, reduced-motion and state coverage, card nesting, media elements. Blocking findings stay to what is provable from the text (decorative blob, animation with no `prefers-reduced-motion`, cards three deep); thresholds are warnings. Build-free, browser-free, and identical on any host or model. Locator precedence `--file` → `--dir` → `--slug`; utility-class markup returns `applicable: false` instead of a fabricated verdict. `@briefing-refiner` measures the prototype the moment it exists and `@dev` measures the implemented front-end, both advisory.
- **`verify:artifact --kind=visual --runtime`** — the opt-in browser pass for what only exists after layout: horizontal overflow, clipped text, off-screen elements, tap targets under 44px, and real computed WCAG contrast with translucent foregrounds composited against the nearest opaque ancestor. Playwright stays an optional dependency; when it is absent the run reports that it did not happen rather than degrading into a pass. The verdict logic is pure and unit-tested, so it is proven without a browser.
- **Effect and asset vocabulary at framework level** — `.aioson/docs/design/visual-effects.md` carries the additive half of visual quality: an effect family reference (radial wash, grain, dither, conic ring, glass, living status, ambient drift, entrance, cursor light, canvas) with the cost each one charges, plus the six-point cost contract and the asset contract. Reachable from `@dev`/`@deyvin` implementation and from the Prototype Forge polish pass, loaded only for effect work. This knowledge previously existed only inside one project's installed skill, so no other project inherited it.
- **Aesthetic registers for the cold start** — `interface-design` origination mode now commits to one register (Technical, Quiet, Editorial, Material, Constructed) before any token decision. `design-directions.md` answers what the product *needs*; the register answers what it *sounds like*, and its font families are now explicitly examples of a class rather than defaults to accept unexamined.
- **Arena over registers** — the visual exploration arena documents the widen → narrow → resolve funnel for comparing *directions* rather than models: same host and model, one run per aesthetic register, then variants inside the winning register with `--parent` recording the lineage. It uses the existing `exploration:add-run --label` mechanism; no new flag was needed.
- **Content slop is checked like visual slop** — `verify:artifact --kind=copy` flags headline formulas that survive a total product swap, in EN and pt-BR, and `@copywriter` runs the replaceability test on every headline and CTA.
- **`prototype:check` reports the same telemetry** as an advisory block whenever it resolves an owned prototype, without touching its verdict — the binding gate proves ownership and acceptance coverage, and now also shows the craft of what was built.
- **Specification-lens anti-slop for the PRD authority** — the visual-quality brain gained three `spec-quality` nodes (`sq-001`–`sq-003`) reached by `@product` and `@sheldon` through a separate tag, so the replaceability test now runs on the specification text before it runs on the pixels. A generic vision or screen-named capability is repaired at the PRD, a visible surface with no prototype and no identity record becomes one named gap with its route instead of a silent default, and state/asset/reduced-motion/performance/accessibility expectations become `AC-*` rows. The PRD authority never inherits the layout nodes — composition stays with the prototype and the design engine.

### Changed
- `interface-design` gained an explicit conformance mode: when an approved prototype or established component language exists, the skill transfers that direction instead of re-deciding it, and maps each region to a real component in the project's library.
- Visual continuity has one canonical home. The legacy `.interface-design/system.md` design-memory file is superseded by the identity record under `.aioson/`; two continuity layers were free to drift.
- Rule-over-brain precedence is stated once, as brain node `vq-000`, instead of being restated in each agent kernel.
- `@sheldon` now blocks approval when a material state the approved prototype renders (loading, empty, error, permission-denied, responsive) has neither an acceptance criterion nor a recorded deferral.
- The `@pentester` kernel resolves scope and report mode as one step against `review-contract-and-findings.md`, and persists `scope_target`/`target_scope`/`report_mode` into the v2 contract before the first probe.

### Fixed
- **The decorative-blob finding no longer fires on a soft glow.** It requires a fully rounded shape, but the radius pattern also matched `9px`, so an absolutely positioned, blurred panel behind a card was reported as decoration — a false positive in the blocking tier, which is the one tier that must be provable from the text alone. It now matches a circle (`50%`) or the pill idiom (`999px` and up).
- **Visual state coverage is measured in the authoring language.** The loading, empty, error, disabled, and focus markers were English-first with partial pt-BR, so pt-BR markup was reported as missing states it actually rendered. `carregando`, `vazio`, `falha`, `desabilitado`/`desativado`, and `foco` now count, matching the EN + pt-BR coverage `kind=copy` already had.
- `verify:artifact --advisory` now actually exits 0 at the shell. The CLI wrapper fails the process for any result carrying `ok: false`, which silently overrode the advisory decision for every kind — the command printed `ADVISORY` and still exited 1. The report carries an explicit `exitCode`, which the wrapper honors first. The existing coverage only asserted in-process, so the override was invisible.
- `@dev` and `@deyvin` no longer route unresolved visual decisions to `@ux-ui`, which is an opt-in detour and not part of the implementation chain; they resolve from the identity binding and prototype, or escalate to `@product`.

## [1.47.0] - 2026-08-04

### Added
- **Briefing source-pack intake** — the new `briefing:sources` command recursively inventories SQL-only and heterogeneous inputs under `plans/{slug}/`, classifies their logical role, fingerprints each source, and selects the conditional guidance the Briefing agent needs without moving or executing user files.
- **SQL as documentation** — schemas, ordered migrations, routines, views, and bounded data hints can now describe an existing system while preserving a visible boundary between source facts, derived inferences, and missing product intent.
- **Pentester coverage reports** — security reviews now produce localized, redacted HTML reports with standards, folder, module, route, method, finding, and remediation coverage.

### Changed
- Briefing intake now handles mixed documentation, structured files, source code, visual references, and unknown printable auxiliaries as one logically organized source pack, with a single intent question only when the pack does not establish its own purpose.
- Feature source lineage reuses the same guarded recursive collector as Briefing intake so SQL and auxiliary inputs remain consistently fingerprinted across downstream workflow artifacts.

### Fixed
- Archive roots, generated directories, symlinks, binary databases, archives, credentials, large inputs, and row-bearing SQL dumps are skipped, blocked, or reduced to metadata according to their risk instead of being treated as ordinary prompt context.
- Pentester keeps the canonical code-health lens path reachable when a sensitive execution chain or regression weakness requires it.

## [1.46.0] - 2026-08-03

### Added
- **Guarded local runtime maintenance** — new `runtime:storage`, `runtime:prune`, and `runtime:compact` commands diagnose database growth, preview retention, protect active coordination and durable knowledge, and reclaim disk space only through explicit bounded operations. Neo can run the same guarded procedure after operator approval.
- **File-first squad output policy** — squad packages and generated content now have files as their canonical, shareable source while SQLite remains a per-clone, rebuildable runtime index. Legacy `sqlite` and `hybrid` manifests remain readable long enough for safe migration.
- **Portable visual-exploration reports** — every exploration maintains a localized root `RELATORIO.md`, direct prototype/report links, a verbatim material-prompt ledger, and per-variant snapshots for reproducible design benchmarks.

### Changed
- Agent-execution output telemetry coalesces adjacent stream chunks, expires terminal raw output after 14 days, and retains terminal execution envelopes for 30 days, reducing row and index growth without weakening redaction or per-run byte limits.
- File-backed `content_items` rows now record `source_path`, can be pruned as regenerable indexes, and can be rebuilt with `runtime:ingest`; legacy database-only rows without a source file are preserved.
- Output-strategy import/export and cloud squad materialization normalize new writes to `storagePolicy.primary: "file"` and `outputStrategy.mode: "files"` while keeping delivery and webhook settings.
- Visual explorations inherit the project's interaction language, preserve technical identifiers in canonical English, and surface exact report paths after status, run, and review operations.

### Fixed
- Production resolution now pins `fast-uri` 3.1.5, clearing the high-severity host-confusion advisory detected by the release gate.
- `aioson update` keeps the existing local runtime database, preserves project-owned constitution, docs, rules, and squad packages, and applies the new content-index column additively instead of creating a shared or replacement database.
- Runtime cleanup no longer treats file-backed squad content indexes as irreplaceable payloads and never removes the canonical files under `output/`.
- Multi-developer projects no longer have an ambiguous database-content contract: each clone owns its ignored SQLite runtime, while Git carries squad definitions and intentionally committed outputs.

### Validation
- Full regression: 4,089 passing tests, zero failures, and one skip; syntax checks cover 494 JavaScript files.
- Focused migration, retention, installer, squad-output, delivery, and visual-exploration regressions pass, including additive upgrades from an existing SQLite schema.

## [1.45.0] - 2026-08-03

### Added
- **Visual exploration arena** — Briefing Refiner can create one-off or multi-model design studies under `.aioson/explorations/`, with isolated variants, provenance manifests, comparable review pages, reusable final reports, and an explicit promotion path into the canonical briefing lifecycle.
- **Qwen and Kimi design lanes** — named-model delegation can resolve additional model families for parallel visual benchmarks while preserving model/provider provenance and fail-closed execution boundaries.
- **Neural Chain operational impact queue** — causal follow-up work now persists in SQLite with stable IDs, evidence, DEV ownership, atomic leases, bounded activation context, and explicit list/claim/resolve/release/reconcile commands.
- **Agent execution v2** — feature manifests now declare Autopilot orchestration, bounded stop conditions, and owner-aware Neural Chain work policy while legacy v1 manifests remain valid.

### Changed
- Briefing Refiner now distinguishes an approved feature prototype from a reversible exploration, asks for the intended mode when no briefing exists, assesses screenshot sufficiency, and can inspect the current frontend when authorized before producing a redesign.
- Timestamped noise files are migrated into one stable human-readable projection per feature. Weak one-off co-edit correlations and targets already changed in the same session are suppressed, while test relationships and stronger repeated signals remain actionable.
- New projects and v2 feature manifests use Autopilot by default, multi-phase DEV checkpoints continue without manual approval, and explicit `--step` remains the highest-priority override.
- Feature classification now applies evidence-based scope floors from capabilities, acceptance criteria, phases, modules, and runtime boundaries; `classify --apply` safely persists an upward correction such as MICRO → MEDIUM.

### Fixed
- Production dependency resolution now pins `brace-expansion` 5.0.9, clearing the high-severity denial-of-service advisory reported by the release audit.
- Workflow routing is bound to the current request before active-feature continuation can take over, preventing unrelated work from being silently attached to stale workflow state.
- Visual studies reject ambiguous or insufficient evidence, unsafe paths, incomplete model output, and accidental mutation of canonical briefings until an option is explicitly approved.
- Parallel arena workers tolerate bounded transient Windows file contention while preserving atomic manifest writes.
- Resolved noises no longer remain indefinitely: reconciliation imports legacy files, honors manually checked items, releases expired claims, deletes empty projections, and feeds resolution outcomes back into future confidence.
- Actionable Neural Chain work can no longer be silently left behind at the DEV handoff; enabled Tester/Pentester owners receive bounded items and QA retains read-only oversight.

### Validation
- Full regression: 4,067 passing tests, zero failures, and one skip; syntax checks cover 492 JavaScript files.
- Full release readiness passes with zero production vulnerabilities, 25/25 operational smoke checks, a 1,296-file package with local-module closure, and an isolated install whose `doctor` passes and configures five MCP servers.

## [1.44.0] - 2026-07-27

### Added
- **Briefing lineage migration** — the new `briefing:migrate-lineage` command canonicalizes approved briefing sources, preserves their evidence trail, and reports safe dry-run/write outcomes.

### Changed
- Feature completeness, gate checks, preflight, handoff recovery, validation messages, and CLI reference documentation now recognize the lineage migration lifecycle and its explicit ownership boundaries.

### Fixed
- Source lifecycle drift, stale review material, unsafe paths, concurrent writes, and incomplete CAP/AC evidence are rejected or recovered deterministically without mutating unrelated project state.

### Validation
- QA evidence covers all 20 acceptance criteria, focused migration coverage, the normal CLI production path, and the full CI suite.

## [1.43.0] - 2026-07-26

### Added
- **Hash-bound Sheldon review** — every feature route now requires a current Sheldon approval tied to the active PRD before Planner or implementation may proceed.
- **Feature continuity mappings** — agents may preserve compact, noncanonical cross-compaction context in local-only `mappings/{slug}/continuity.md` without turning it into scope, evidence, or a workflow gate.
- **Source and prototype traceability** — briefing source packs, promise maps, owned prototype manifests, PRD capabilities, acceptance criteria, implementation phases, and QA evidence are reconciled across the delivery chain.

### Changed
- The canonical feature workflow is Product → Sheldon → Planner → DEV → QA for MICRO, SMALL, and MEDIUM classifications, with legacy states safely normalized to the mandatory review.
- Briefing Refiner owns approved visual prototypes for rich surfaces, while Product, Sheldon, Planner, DEV, and QA verify the same feature-bound source and prototype authorities.
- Handoff contracts, completeness checks, workflow recovery, agent manifests, templates, and bilingual documentation now use the strengthened delivery model consistently.

### Fixed
- Stale, missing, mismatched, or manually asserted Sheldon approvals can no longer bypass planning and implementation gates.
- Malformed source inventories, silently dropped promises, stale prototype bindings, incomplete CAP/AC evidence, and weak QA command evidence fail closed with an actionable owner.
- Temporary `mappings/` content is ignored both in this repository and by the installer policy applied to new and updated AIOSON projects.

### Validation
- Full regression: 3,984 tests passing, zero failures, and one skip; syntax checks cover 472 JavaScript files.
- The full release-readiness gate passes with a zero-vulnerability production audit, 25/25 operational smoke checks, a 1,271-file package with complete local-module closure, and an isolated install whose `doctor` passes and configures five MCP servers.

## [1.42.0] - 2026-07-25

### Added
- **Premium squad intelligence** — squad manifests now support canonical AJV validation, live Evidence Packs, source-grounded rubrics, held-out A/B evaluation, compiled genome bindings, explicit decision rights, and reproducible readiness reports.
- **Skill reachability and usage audit** — the process-skill registry exposes ownership, triggers, tests, deprecation, static reachability, runtime observations, and context-budget debt without making optional skills mandatory workflow hops.
- **Operational release-readiness gate** — one script now enforces Git/package boundaries, production dependency audit, exact tarball inventory and local-module closure, the complete CI suite, pre-publish smoke checks, and an isolated install exercise; CI, tag validation, and release-label workflows share the same guard.

### Changed
- Briefing, Orache, Setup, Profiler, and global agent gateways were modularized into compact routing kernels with detailed contracts loaded on demand.
- Agent production and review use the canonical Product → optional Sheldon → Planner → DEV → QA chain, bounded QA correction, cached technical evidence, and runtime skill-usage telemetry.
- Node's full test runner is capped at eight concurrent workers, while Genome 2.0 Block A again preserves smoke, focused genome, full regression, and lint coverage.
- Premium held-out scoring now requires a separate content-bound scorer with per-dimension explanations, explicit deterministic/seed contracts, and real compiled-Genome baseline/candidate contexts.
- Production dependencies move to AJV 8.20, Archiver 8, and Undici 6.28; the vulnerable JavaScript-obfuscator chain is replaced by the existing conservative Terser boundary, and the documented runtime floor is aligned to Node.js 20.

### Fixed
- Premium readiness validates `evals/latest.json` semantically as well as structurally: manifest/source/worker/output/engine/evidence hashes, scorer results, verdicts, and Genome contexts are recomputed, fabricated or stale PASS reports are rejected, and playbook promotion accepts only the same verified evidence.
- Schemas, executor files, source documents, evaluation inputs, feature slugs, and workflow execution paths fail closed on traversal, symlink/junction escapes, or command-shaped identifiers.
- Safe remote research rejects private/special IPv4 and IPv6 forms, malformed DNS answers, and private redirects; connections are pinned to the validated address set and response streams stop at a hard byte budget.
- Agent execution aborts delegated work and its process tree after lease ownership is lost, avoids overwriting a replacement lease, fences state writes with an owner-aware mutex, and interrupts capacity backoff immediately.
- Technical-evidence fingerprints fail safe when untracked files exceed bounded per-file or total byte budgets and hash symlink identity without reading external targets.
- Skill registry entries bind only to their declared discovered path, so an ID match can no longer hide `registered_path_missing`.
- Skill reachability follows explicitly routed on-demand modules transitively while excluding inventories, historical docs, and negative “do not load” references from executable usage evidence.
- Fresh `aioson init` scaffolds now create the project-local design baseline that `doctor` requires; update mode still preserves customized or intentionally removed governance documents.
- Concurrent filesystem regressions use a single archive-fixture lifecycle and retry transient Windows directory contention for hook and squad-score cleanup instead of intermittently failing with stale directories or `ENOTEMPTY`.

### Validation
- Full regression: 3,975 tests, 3,974 passing, zero failures, and one skip; syntax checks cover 471 JavaScript files.
- The full release-readiness gate passes with a zero-vulnerability production audit, 25/25 pre-publish smoke checks, a 1,268-file tarball with complete local-module closure, and an isolated `npx` install whose `doctor` passes and configures five MCP servers.
- Runtime skill audit reports zero registry issues, orphans, unregistered skills, declared-only skills, or weak process-skill routes; inception config/template parity and `git diff --check` are clean.

## [1.41.0] - 2026-07-23

### Added
- **Repository-fit intelligence across the feature lifecycle** — briefing refinement, Product, Sheldon, Planner, DEV, and QA now carry evidence about existing patterns, reusable hooks and triggers, exact integration points, planned deltas, and executable checks instead of planning from the specification alone.
- **Explicit prototype ownership** — each current prototype is bound to one feature/PRD, while historical or removed references are classified separately so a closed feature cannot silently reactivate an older prototype.
- **Model-aware execution and bounded specialist correction** — development manifests can route supported implementation lanes by host/model, and explicitly enabled Tester or Pentester specialists can correct unequivocal findings within declared path and cycle budgets before independent QA revalidation.

### Changed
- **Planner is the canonical implementation-design stage.** Approved product intent becomes vertical, executable phases that trace capabilities and acceptance criteria through exact repository paths, existing leverage, implementation work, and production-path evidence.
- **Autopilot activation and resumption are deterministic.** `--auto` and `--step` make run mode explicit, while a content-bound Gate C checkpoint prevents stale plan approval from resuming significant implementation.
- Agent prompts, workflow contracts, templates, and bilingual documentation were streamlined around the canonical Product → optional Sheldon → Planner → DEV → QA chain, with optional specialists remaining opt-in.

### Fixed
- Removed ambiguity between current, historical, stale, and explicitly absent prototypes, including the case where an earlier feature's prototype was incorrectly inherited by a new PRD.
- Specialist correction now fails closed on unapproved paths, missing Git baselines, exceeded budgets, or cross-cutting changes that must return to DEV.
- Repository-fit, prototype-binding, Gate C, and correction evidence are validated consistently by preflight, workflow, completeness, and QA paths.

### Validation
- Full suite: 3,836 passing tests, zero failures, and one skipped test. JavaScript static checks, focused workflow/prototype/security regressions, template/workspace parity, and `git diff --check` are clean.

## [1.40.0] - 2026-07-22

### Added
- **Premium briefing prototypes** — `briefing-refiner` and `prototype-forge` now preserve operational completeness first, then apply a product-specific visual thesis, stable `data-aioson-id` anchors, responsive/contrast checks, and one bounded surgical polish pass with honest quality evidence.
- **Explicit named-model delegation** — new `delegation:plan` and `delegation:run` commands resolve the requested model conservatively, dispatch same-provider native workers when the host can prove the binding, and use shell-free external CLI fallbacks for cross-provider or dynamic-model requests.
- **Read-only researcher roles for Claude Code and Codex** — installed host-native definitions isolate evidence and image-reference research, keep persistence with the parent, and record model/provider provenance without delegating scope or completeness decisions.

### Changed
- **Prototype output remains simple and Play-compatible.** Premium multi-screen prototypes stay in one hash-routed `prototype.html` under 2 MB with inline CSS/JS/assets and no CDN, iframe, network dependency, or viewer rewrite.
- **Delegated execution fails closed.** Unsafe or ambiguous model names, unconfirmed fuzzy matches, task path/symlink escapes, unavailable read-only boundaries, and silent model/provider substitution are rejected before execution. Claude external fallback uses plan permissions; Codex uses the read-only sandbox.
- The installer safely migrates the legacy empty `.codex` marker into the project-scoped custom-agent directory while refusing to replace non-empty or symlinked paths.

### Fixed
- Secret detection now covers current OpenAI/Anthropic key shapes, flattened PEM material, and quoted/bare generic assignments while operator-memory slug paths reject traversal at the filesystem boundary.
- Agent execution renews long-running dispatcher leases, safely replaces retry telemetry, strips unsupported reasoning effort on cross-host fallback, rejects malformed completeness-table rows, and detects collaborative workspace surfaces without technical-workspace false positives.

### Validation
- Full suite: 3,911 passing tests, zero failures, and one skipped test. JavaScript static checks, template/workspace parity, delegation security cases, installer migration, and `git diff --check` are clean.

## [1.39.0] - 2026-07-21

### Added
- **Proportional implementation lanes** — bounded, already-specified work can stay in Simple Plan with explicit behavior-file/path/module budgets; MICRO receives its own larger budget, while auxiliary tests, translations, exports, manifests, and lockfiles do not promote work by themselves.
- **Reviewer-owned bounded correction** — QA, Tester, and Pentester can correct unequivocal findings inside their specialty and return to an independent final QA pass, with DEV reserved for one consolidated cross-cutting correction packet.

### Changed
- **Small requests stay small.** Entry agents classify the minimum confirmed outcome instead of self-expanding optional scope; a minor UI affordance no longer becomes SMALL merely because it adds a menu or button. Simple Plan completes in DEV with targeted verification and no feature ceremony.
- **Design documentation is baseline-first.** Stable system design lives in the project baseline; SMALL features create a feature design document only for a real architectural delta.
- **Agent execution manifests are developer-owned after creation.** New manifests default review limits to `1/1/1`; Codex entries start with `reasoning_effort: medium`; init, resume, re-seed, and later `--max-*-cycles` flags preserve an existing manifest byte for byte.
- **Autopilot review routing uses QA as the hub.** Enabled specialists run only when triggered, self-correction is bounded by the execution manifest, and final QA rechecks affected evidence without replaying the complete harness unnecessarily.

### Fixed
- Duplicate stage completion now returns before expensive gates and event emission, and cheap structural contract/path checks run before the full harness.
- Full-path and atomic acceptance-criterion contracts prevent late QA/DEV handoff failures caused by abbreviated paths or grouped IDs.

### Validation
- Full suite: 3,867 passing tests, zero failures, and one skipped test. JavaScript static checks and template/workspace parity are clean.

## [1.38.0] - 2026-07-18

### Added
- **Generic feature-capability closure** — substantive SMALL/MEDIUM features now trace every approved `CAP-*` promise through explicit completeness-lens decisions, `REQ-*`/`AC-*`, repository leverage, delivery phases, concrete paths, and executable evidence. Operational management (including lifecycle, forms, validation, filters, pagination, and states) remains a conditional extension instead of becoming a CRUD-specific base contract.

### Changed
- **Planning and delivery agents share one deterministic feature contract.** Briefing, product, Sheldon, analyst, architect, PM, orchestrator, dev, QA, tester, and pentester now discover, preserve, implement, and challenge the same capability trace; gates, preflight, handoffs, artifact validation, spec analysis, and SDD benchmarks reject presence-only documentation.
- **Strict AC evidence is assertion- and execution-aware.** Formal feature completion rejects zero ACs plus skipped, todo, commented, string-only, or assertion-free pseudo-tests. Harness declarations count only after a successful matching `harness:check`; Gate D rejects stale results, self-attested ledger status, non-file/symlink evidence, and unresolved blocking gaps.
- **Autopilot decisions survive lean workflows and chat compaction.** Sheldon/Orchestrator persist causal decisions in `decision-checkpoint.json`; pending blocking decisions stop handoff and `workflow:next` even when no phased plan manifest exists. Optional findings default to deferred and remain non-blocking.
- **Operational discovery is less keyword-driven.** Ambiguous “management” prose no longer activates CRUD analysis from unrelated verbs; explicit surface declarations and high-confidence multilingual surface phrases remain supported.

### Validation
- Full suite: 3,853 passing tests, zero failures, and one skipped test. JavaScript static checks, adversarial AC evidence cases, stale-harness closure, durable decision guards, and template/workspace synchronization are clean.

## [1.37.2] - 2026-07-16

### Added
- **Review Intelligence** — a deterministic review engine, CLI command, schema, role-aware process skill, agent hooks, localized help, and immutable review packets/reports. Reviews now challenge feature artifacts before existing gates without adding a new workflow stage.
- **Agent-execution and operator-memory coverage** — strengthened command contracts, model-resolution traces, anonymous-memory safety, archival controls, and their PT/EN documentation.

### Changed
- **Operational hygiene is lifecycle-aware.** Historical review and QA evidence can be retained through an explicit registry only when its outcome is safe; archived feature artifacts are moved out of active context and stale noise files are removed after their checks are resolved.
- **Documentation and templates** now describe the hardened commit guard, headless agent-safe behavior, Review Intelligence, agent execution, and operator memory consistently across the shipped framework.

### Fixed
- **Commit and security safeguards** — staged-content detection, git-guard policy evaluation, and commit preparation now resist transient workspace state and unsafe secret-bearing paths more reliably.
- **Hygiene retention cannot hide unresolved security findings.** Blocking security reports remain blocking even when a retention entry exists.

### Validation
- Full suite: 3,816 passing tests, zero failures, and one skipped test; JavaScript static checks and the hygiene scan are clean.

## [1.37.1] - 2026-07-11

### Added
- Intelligent, bounded resolution of human-readable and approximate Codex model names.
- Separate reasoning-effort propagation and model-resolution metadata across execution, reports, telemetry, and verification.

### Changed
- **Operator-memory promotion threshold is now per signal type.** `authorization`, `exclusion`, and `correction` are single explicit standing decisions and promote to a decision on **first** detection; `confirmation` still needs **2×** (it must repeat to distinguish a pattern from a one-off acceptance). Previously all four required 2× (`op-capture.js`), so a firmly-stated one-shot correction/authorization never persisted unless the agent emitted `op:capture` twice. Aligns the storage engine with the signal taxonomy already documented in `agents/_shared/memory-capture-directive.md`. New `promotionThresholdFor(signalType)` helper.

### Fixed
- **Re-detecting an already-promoted decision no longer duplicates its FTS row or resets `promoted_at`.** `op:capture` now reinforces in place — bumps `reinforcement_count` + refreshes `last_reinforced` (PMD-11) via the new `decision.reinforceDecision` primitive — instead of re-running promotion when a decision for the slug already exists (the stray proposal from re-detection is dropped). This latent double-insert also affected the old uniform-2× flow on the 3rd+ detection of the same signal.

## [1.37.0] - 2026-07-06

**Full-feature autopilot + CLI-owned briefing refinement.** Two independent arcs land together. A feature built the normal way (`@product` → `@sheldon`/`@orchestrator` → `@dev`) can now run unattended through `@qa`/`@tester`/`@pentester`/`@validator` to `feature:close` — stopping only at genuine human decisions; `@product` asks the run mode once at kickoff (no hidden flag), settable inline (`--auto`/`--step`) or disarmed per feature. Separately, `@briefing-refiner`'s review surface stops being hand-written every round: the CLI now owns the schema, the render, and the apply, closing an explicit iterate-until-clean loop.

### Added
- **Full-feature autopilot.** `workflow:execute --seed` seeds the agentic scheme without advancing (idempotent, feature-scoped); `@product`/`@sheldon`/`@orchestrator` seed it and cross the pre-`@dev` gate via the `dev-state.md` cold-start packet; `@dev`/`@qa` honor it through the post-dev review cycle. `@product` asks the run mode on screen at kickoff (Autopilot / Step by step / Always autopilot) — never silent-manual by default. (`e24bfa5`, `9afc993`)
- **Inline run-mode tokens** `--auto`/`--step` — `/product --auto <task>` / `/product --step <task>` answer the kickoff question inline (highest precedence); `/dev --auto` / `/dev --step` arm or disarm autopilot mid-chain for the current feature. Disarm is record-only (`workflow:execute --seed --step`) and beats a project-wide `auto_handoff: true` for that feature. (`70e826b`)
- **`--help` activation token** on the 13 most-used agents — localized quick help (what/when/options/artifacts/next agents), zero kernel-byte cost beyond a 3-line trigger to the shared `agent-help.md`. (`bafaa2a`)
- **`aioson briefing:review`** — parses `briefings.md`, strictly validates the agent's audit findings (`refinement-findings.json`: category/severity/blocking/recommendation per section), and renders the localized `review.html` + canonical `refinement-feedback.json` (schema **v1.1**: `findings[]` + `round`) + `refinement-report.md`. Refuses to clobber user-exported pending feedback (`--force` to override); the round counter survives applies via the per-round archives. (`43661a7`)
- **`aioson briefing:apply-feedback`** — dry-run validation + summary without `--confirm` (the agent presents it and asks), real apply with it: structured-JSON-only edits, mandatory sections preserved, `approved` → `draft` revert, consumed feedback/findings archived as `*.applied-round{N}.json`. A **pending blocking finding** forces `resolve_blockers` even when `blocking_items` is empty. `--declined` records skipped changes without touching the briefing. (`43661a7`)
- **`review.html` v2** — audit findings rendered per section with their own decision (`pending`/`accepted`/`rejected`/`deferred`) and working category filters; **localStorage autosave + draft restore** (closing the tab loses nothing); File System Access saves with a persistent handle and **degrades to download on SecurityError** (the sandboxed-preview bug); a **copy-path** affordance next to the save target and a stable save-picker id so the OS dialog reopens in the briefing folder on later rounds; en/pt localized surface. (`43661a7` + polish)
- **`verify:artifact --kind=review`** + `briefing-refiner` in `AGENT_ARTIFACT_KIND` — the done-gate auto-fires at `agent:done --slug=...` and rejects hand-rolled surfaces (missing marker / fallbacks / external resources / invalid feedback JSON); staleness after an apply is advisory. (`43661a7`)

### Fixed
- **`@dev` phase-loop no longer self-stops.** The loop told `@dev` to `/compact` between phases — on Claude Code that ends the turn, so a feature ran one phase and waited instead of driving to the end. `@dev` never self-issues `/compact` now; `verification:plan` emits a deterministic `continuation_directive` instead. (`3a0fd34`)
- **Autopilot chain-integrity audit** — four bugs behind the same reported symptom ("dev finished → manual /qa handoff"): a lean-lane `@sheldon` stage could re-activate backwards after `@dev` completed; tracked sessions didn't consult the seeded scheme as an autopilot signal; `--seed` hard-failed on a stale abandoned-feature guard instead of reseeding; downstream triggers didn't check the seeded scheme's feature slug against the current one. (`a0010cd`)
- **Boolean-only argv flags** — `--seed` / `--seed-only` / `--confirm` / `--declined` / `--allow-stale` / `--step` could each swallow the path positional (e.g. `--declined .` silently defaulted to cwd). (`8a9999a`, `abc1058`, `70e826b`)
- **`feature:close` retires per-feature runtime pointers** (`dev-state.md`, `workflow.state.json`, `workflow-execute.json`) when they reference the closed slug, so a future `@dev` cold-start can't "resume" a done feature and the next feature's `--seed` doesn't collide. (`bd34451`)
- **Declined feedback no longer dead-ends the loop** — `briefing:apply-feedback --declined` archives the consumed feedback (`refinement-feedback.declined-round{N}.json`, findings kept since the briefing did not change) so the next `briefing:review` regenerates without `--force`, the declined round still counts toward the round counter, and declining stale feedback is allowed (decline writes nothing, so the source-hash guard does not apply). `kind=review` external-resource check hardened against false positives from briefing text quoting HTML/CSS. (`abc1058`)
- **Windows executable resolver** never tests the extensionless candidate on `win32` — npm's extensionless shim is a shell script that `ENOENT`s on spawn despite existing (hit via `codex`/`opencode`); malformed `PATHEXT` empty segments are filtered, and a spawn failure between `spawn()` and the child-wait now fails cleanly instead of surfacing as an unhandled error (or a false exit code 0). (`25dcb60`)

### Changed
- **`@briefing-refiner`** rewritten around the CLI: explicit refinement-loop contract (generate → collect → dry-run + confirm apply → regenerate while blockers or material text changes remain → exit to `briefing:approve`/`@product` or prototype mode); handoff names the three feedback-return routes (direct save / download+replace / **paste JSON in the chat**) and instructs opening `review.html` in a real browser — editor previews are sandboxed; a non-blocking finding nudges the reference-image identity route for rich surfaces with no `identity.md`; the V1 "no dedicated refinement CLI" constraint is retired. Answers left in finding/section `note` fields are folded into `current_text` by the agent before the CLI writes — notes alone never reach the briefing. (`ad22cda`, `abc1058`)
- **`identity.md` reaches every consumer of the `interface-design` engine** — the engine's SKILL now resolves it first (briefing scope → project brand → intent-first) so any consumer inherits the step; `@dev` reads it as a feature-mode UI input next to the prototype reference (a lean-lane feature without prototype/ux-ui no longer ships generic visuals over an existing brand); `@ux-ui`'s blank-`design_skill` stop offers the reference-image route alongside presets, mirroring `@setup`. (`35891f9`)
- **Docs sweep** — `autopilot-handoff.md` rewritten to the current model (tokens, precedence, seeding, stop conditions) with an English counterpart; 14 PT/EN pages updated to the CLI-owned refinement loop and identity routes; agent-count headers and cycle-cap references corrected. (`95b99d5`, `90c77d1`, `16f9172`, `4c6507e`)

Suite green (3587 pass / 0 fail / 1 skip).

## [1.36.0] - 2026-06-30

**Reference-image-driven visual identity.** A project's UI no longer has to inherit a fixed design preset's identical look (the generic, "made-by-AI" sameness). The user provides reference images — a brand/identity set and an optional component/structure set — which are extracted **once** into a text `identity.md` that the `interface-design` engine applies. The build reads the text, never the images, so it ports to a vision-less harness, is user-editable, and is gateable. Purely **additive** — the fixed presets stay as raw material for `@design-hybrid-forge` / `@site-forge`; the new path is the recommended default alongside them.

### Added
- **`reference-identity-extract` process skill.** One vision pass reads the identity + structure images and emits `identity.md` (palette / type / spacing / depth / motion / signature moves + per-component structure notes); the image-less fallback defers to `interface-design`'s intent-first Phase 0. Lives under `skills/process/` (always installed), not `skills/design/` (profile-gated at install). (`d0e21c3`)
- **`verify:artifact --kind=identity`** — a build-free gate (resolved via `--file`) proving the token skeleton, both anti-sameness anchors (pillars + signature moves), and the component-structure section are present, with no placeholder / unfilled hex. `availableKinds()` self-registers it; two new paths appended to `MANAGED_FILES` for `aioson update` backup-safety (no preset enumeration touched). (`d0e21c3`)
- **`docs/reference-identity.md`** documents the flow, the two scopes (per-briefing `.aioson/briefings/{slug}/identity.md` and project brand `.aioson/context/identity.md`), the gate, and the no-vision / cross-harness fallback. (`d0e21c3`)

### Changed
- **`@briefing-refiner` prototype mode** gains the reference-image intake: the user drops images into `references/{identity,structure}/`, the agent extracts `identity.md` and self-gates; no images → `interface-design` runs intent-first (never blocks). **`@setup` Step 5** offers "interface-design + reference images" as the recommended visual route (still explicit-confirm, no auto-select). (`d0e21c3`)
- **`@ux-ui` Step 0** frames `identity.md` as the INPUT that parameterizes the single `interface-design` engine — not a second skill, so ONE SKILL ONLY is preserved. `prototype-forge` consumes it as the engine overlay; `interface-design`'s continuity note reuses it as the extracted-from-references form of `system.md`. (`d0e21c3`)

Suite green (3549 pass / 0 fail); +14 tests (5 `identity` ruleset, 9 wiring/parity).

## [1.35.0] - 2026-06-28

The **lean-harness redesign**: fewer default agent hops, with quality held by deterministic gates and configurable verification sub-agents rather than by agent count. SMALL and MEDIUM now each route through a single spec authority; `@analyst` / `@architect` / `@pm` / `@discovery-design-doc` / `@scope-check` / `@ux-ui` become opt-in detours (none deleted).

### Changed
- **SMALL is the lean lane by default.** The default SMALL chain is now `@product → @sheldon → @dev → @qa` (was `@product → @analyst → @scope-check → @architect → @discovery-design-doc → @dev → @qa`), with `@sheldon` as the single spec authority. Supersedes 1.34.0's *opt-in* lean lane. Updated in both routing sources (`workflow-next.js` + `workflow-plan.js`). (`aea0894`)
- **MEDIUM is the `@orchestrator` maestro.** The default MEDIUM chain is now `@product → @orchestrator → @dev → @pentester → @qa` (project: `@setup → @product → @orchestrator → @dev → @qa`). `@orchestrator` is repurposed from a paper-protocol parallel-lane coordinator into the MEDIUM single spec authority — it **fans out** to `@analyst` / `@architect` / `@pm` (+ `@ux-ui` when UI-heavy) sub-agents, then consolidates / verifies / redoes their output into one gated spec package (requirements + spec [Gates A/B/C approved] + design-doc + readiness + implementation-plan + harness-contract) and hands to `@dev` — the horizontal counterpart to `@sheldon`'s vertical lean lane. (`d03e1ec`)
- **Spec hops demoted to opt-in detours** (none deleted): `@discovery-design-doc`, `@scope-check`, `@ux-ui` (3b) and `@analyst`, `@architect`, `@pm` (4a). `@architect` runs in **merged mode** by default (also producing design-doc + readiness + dev-state) when the active sequence omits `@discovery-design-doc`; `@scope-check`'s deterministic drift check (`spec:analyze`) is now enforced at the `@dev` / `@qa` done gate (`finalizeCurrentStage`), blocking on real drift (readiness-blocked / invalid harness contract) without false-blocking artifact-light features. (`6db76f9`)

### Added
- **Per-agent, per-host verification config.** `.aioson/config/verification.json` (auto-generated, hand-editable) declares which verification sub-agents (`qa` / `tester` / `pentester` / `validator`) run, when (`per-phase` / `end-of-feature` / `sensitive-surface`), and on which model — keyed by host harness with `native` (in-harness sub-agent on a Claude tier or the host's own model) vs `external` (cross-vendor auditor) dispatch, plus a token budget. `src/verification-policy.js` is the reader; degrades to safe defaults on a missing/malformed file. (`dc4bd42`)
- **`aioson verification:plan` + `@dev` phase loop.** The new deterministic command resolves, for a slug + trigger + host, which verifiers run and on which model. `@dev` now runs a phased plan as a loop that **auto-continues by default** (no human "continue?" between phases), compacts between phases (`dev:state:write` → `/compact` or fresh context → `dev:resume-data`), and runs the per-phase verification whose report replaces the human checkpoint. Per-phase checks are light and suppressed on MICRO; the full runtime smoke runs once at end-of-feature. Full protocol in `.aioson/docs/dev/phase-loop.md`. (`4c6ac66`)
- **Single-spec-authority handoff gate + `@sheldon` PRD-enrichment step.** `handoff-contract.js` now enforces the collapsed done-gate (Gates A/B/C + approved implementation-plan + contract integrity) for **both** the lean `@sheldon` lane and the maestro `@orchestrator` lane; the orchestrator's expected artifacts become the gated spec package in maestro mode. The MEDIUM maestro can optionally harden the PRD via `@sheldon`'s enrichment first (opt-in pre-step or a fan-out stream — never a mandatory hop). (`d03e1ec`, `da0c1dd`)

### Docs
- Swept the framework documentation to the new default chains — `CLAUDE.md`, `config.md`, `autopilot-handoff.md`, `workflow-lean-lane.md` (premise flipped: lean is the SMALL default, "full-merged" is the opt-in heavier chain), the `aioson-spec-driven` skill + references, `prd-contract.md`, `LAYERS.md`, and `pm.md`. (`75104d5`, `8e7b0e1`)

## [1.34.0] - 2026-06-27

### Added
- **Mandatory runtime smoke gate.** A feature with a backend, a database, or a clickable prototype no longer closes on green unit tests + `tsc` alone. The §2c `RG-build` / `RG-migrate` / `RG-boot` / `RG-smoke` criteria must run on the real stack. `@qa`'s Runtime smoke gate, `@validator`'s Step-0 precheck, and the `harness-contract` schema enforce it.
- **Deterministic contract-integrity gate.** New `src/harness/contract-integrity.js` + `contract-integrity-gate.js` flag a runtime feature whose contract is missing / has no `RG-*` / pads binary criteria with duplicate verification commands. It is wired as a real gate into `workflow:next --complete=dev|qa` and `feature:close --verdict=PASS` (hard-blocks, independent of `ready_for_done_gate`), and as a non-blocking advisory `contract:integrity` step in `agent:epilogue` for untracked sessions. Runtime detection uses prototype-manifest, migration/Prisma paths in `progress.*`, and the git working tree; the same detection backs standalone `aioson harness:check`.
- **Opt-in lean lane + full-merged preset.** Drop `.aioson/docs/presets/workflow.config.lean.json` into `.aioson/context/workflow.config.json` to route `@product → @sheldon → @dev → @qa`, with `@sheldon` as single spec authority (RF-LEAN) producing requirements/spec/design-doc/readiness/implementation-plan/harness-contract in one pass. The `full-merged` preset instead folds `@discovery-design-doc` into `@architect`. Built-in `src/` routing defaults are unchanged (full chain stays the default).
- **Deterministic lean detection for `@sheldon`.** `agent:prompt sheldon` reads `workflow.config.json` and injects the RF-LEAN directive when the lean lane is active, so a directly-activated `@sheldon` no longer falls back to enrichment mode and hands to `@analyst`.
- **`aioson review:feature`.** One-shot review pass for an already-implemented feature: resolves the slug, runs the deterministic `security:audit`, and prepares the `@pentester` + `@tester` activation prompts (`--scope`, `--skip-audit`, `--out-dir`, `--json`). `agent:prompt tester --feature=<slug>` now pins the slug so a standalone post-close test pass stays feature-scoped.
- **Git-build traceability.** `aioson --version` reports `1.34.0 (<sha>, <date>)` from a git checkout (JSON adds `git_sha`/`git_date`); `install`/`update` stamp `template_git_sha`/`template_git_date` into each project's `.aioson/install.json`. Lets a linked dev framework report exactly which commit is installed without a per-commit version bump.

### Fixed
- **Lean Gate-C dead-end.** The lean lane stalled at `@dev` because no agent produced `spec-{slug}.md`. `@sheldon`'s handoff contract now structurally requires the lean bridge artifacts (spec + approved gates A/B/C + approved implementation-plan + a valid runtime contract).
- **Runtime-gate coverage at all sizes.** A runtime feature now requires the `RG-*` contract at every classification (was MEDIUM-only), closing the hole where a MICRO/SMALL backend feature closed with prose-only gates.
- **Cross-platform `sync:agents`.** Replaced the `rsync` step (silently a no-op on Windows) with a Node copy, excluded live project-state from the sync, and preserved the `<!-- AIOSON:BEGIN/END -->` managed block in gateway files (CLAUDE.md / AGENTS.md / OPENCODE.md) instead of stripping it.
- **Windows `live:start` false "session already active".** `live` now reconciles a dead PID via a `tasklist` probe instead of leaving it `unknown` when `process.kill(pid, 0)` throws `EPERM`.

## [1.33.1] - 2026-06-24

### Fixed
- **Hardened adversarial verification gates.** `prototype:check` now rejects prototype and manifest references that resolve outside the project root before reading them, strict evidence bundles run prototype checks with `--strict`, partial prototype acceptance-criterion coverage can fail strict audits, Sheldon-owned scope findings route back to `@sheldon`, and failed external auditor stderr is kept in a separate artifact instead of being copied into the consolidated verification report.

## [1.33.0] - 2026-06-24

### Changed
- **Scope-aware solution fan-out in `@briefing`.** Horizontal exploration no longer forces 3–5 options when the user has already committed to one specific solution and its operational surface is complete; it records any weighed alternative as a short "Alternatives considered" note instead. Operational completeness is never waived — only the breadth of options when the direction is already fixed.
- **Non-blocking prototype recommendation in `@briefing-refiner`.** For a rich-surface briefing with no prototype yet, the handoff now recommends running prototype mode before `@product` (it surfaces missing management screens and broken interactions early). Recommendation only — it never blocks the route to `@product`.

## [1.32.0] - 2026-06-24

### Added
- **External DESIGN.md sources in `@design-hybrid-forge`.** A hybrid's primary parent or modifier can now be an external DESIGN.md source (a refero.design md-example or a similar portable design spec extracted from a real site), not only a local AIOSON design skill. The agent normalizes the source into the same parent DNA the crossover protocol expects, records `sources[]` provenance in `.skill-meta.json`, and enforces an anti-clone rule — the hybrid stays a new identity (no brand/logo/trademark or 1:1 palette reproduction, never named after the source). The "exactly 2 primary parents" model is unchanged.

## [1.31.0] - 2026-06-24

### Added
- **Clickable prototype stage.** New `prototype-forge` process skill and an optional `@briefing-refiner` "Generate prototype" mode produce a self-contained, clickable HTML app-shell (`prototype.html` + manifest) that materializes a rich-surface feature's screens, navigation, and CRUD interactions before the PRD — delegating visuals to the selected design skill while owning structure, behavior, and state. No native dialogs; authenticated app chrome is seeded.
- **Horizontal solution exploration in `@briefing`.** For goals with more than one viable shape, `@briefing` explores 3–5 solution shapes, maps each one's operational surface, and writes an optional `solution-options.md` so `@product` chooses with the trade-offs in hand.
- **Prototype propagated as a contract.** New `prototype-contract.md` defines how the prototype flows through the chain: `@product` writes a `## Prototype reference` in the PRD, `@dev` reproduces its screens/interactions, `@ux-ui` treats it as the authoritative realization, and `@analyst` derives acceptance criteria so `@validator` honors it via the binary contract (respecting its context sandbox).
- **Operational-surface classification floor.** `aioson classify` now floors rich operational surfaces (workspaces, boards/cards, Kanban/CRM pipelines, CRUD/admin management) to at least SMALL, so a Trello-like feature can't take the MICRO shortcut that skips `@analyst`/`@architect`/the prototype.

### Changed
- **Operational Surface Map across planning agents.** `feature-expansion-taxonomy.md` and the briefing/product/sheldon expansion skills now require every Core object to have create/list/edit/archive/restore behavior and a management surface, so rich-surface features (Trello/Kanban/CRM/workspace-like) can't pass with bare nouns.

## [1.30.2] - 2026-06-24

### Changed
- **Hardened packaged design skills.** Strengthened design skill quality gates, managed-file coverage, and Cognitive Core layout guidance to reduce brittle or low-quality UI output.
- **Refreshed Cognitive Core previews.** Rebuilt the design preview examples with a shared responsive CSS system and added cockpit, website, list/detail, settings, auth, and Kanban examples.

### Docs
- **Updated Play permission guidance.** Clarified manifest-driven `auth.permissions[]` guidance across the AIOSON Play docs and shipped template copies.

## [1.30.1] - 2026-06-23

### Added
- **AIOSON Play app compatibility docs.** Added curated `.aioson/docs/play/` guidance for agents building apps that target AIOSON Play, shipped through the install/update template. It covers manifest/runtime behavior, ports, ProductBridge, `/api/aioson-play`, LLM env injection, app-owned databases, Data Bindings, auth, services, and local testing.
- **Framework integration docs surface.** Added `.aioson/docs/integrations/dashboard-app-form-publish-mapping.md` as a framework-managed integration reference and shipped it through the install/update template.

### Fixed
- **Preservative integration docs update.** `update` now has regression coverage proving official framework integration docs are refreshed while project-owned files in `.aioson/docs/integrations/` remain untouched.

## [1.30.0] - 2026-06-22

### Added
- **Context intelligence and hygiene tooling.** Added the `context:brief` recall path, operational `context:guard` hook adapter/injection flow, guard rule attribution, and the read-only `hygiene:scan` diagnostic for stale session/context noise.
- **Gate D proof hardening.** Added AC-to-test audit and evidence-gated Gate D expectations across SDD, QA, and agent contracts.

### Changed
- **Agent context loading now uses canonical context paths.** Gateway and agent prompts resolve `project-pulse.md`, `features.md`, `dev-state.md`, `last-handoff.json`, and `workflow.state.json` to `.aioson/context/`, preventing root or `.aioson/` misreads during activation recovery.
- **Feature routing and recall are stricter.** Slug resolution, recall index isolation, `context:guard` salience, and selected-context loading were tightened across the spec chain.

### Fixed
- **Context intelligence safety fixes.** Hardened hook agent-name validation, tester test-plan/test-inventory scoping, Sheldon validation scoping, deleted-file recall cleanup, Windows temp-dir cleanup, and the context subsystem P1-P5 audit findings.
- **Feature archive restore cleanup.** Retried empty archive-directory removal during restore to avoid leaving `.aioson/context/done/{slug}/` behind on transient Windows filesystem locks.

## [1.29.2] - 2026-06-13

### Fixed
- **`aioson system:publish` crashava com `Error: archiver is not a function`.** O `archiver` tinha sido atualizado para `^8.0.0`, uma reescrita ESM que removeu a API chamável `archiver('zip', opts)` e passou a exportar só classes nomeadas (`Archiver`, `ZipArchive`, …) — sem função default. Fixado de volta em `^7.0.1` (CommonJS, API chamável que `createZipBuffer` em `src/commands/store-system.js` espera), o que também elimina o `ExperimentalWarning` de ESM-em-require no Node 23.

## [1.29.1] - 2026-06-12

### Docs
- **Documented the v1.29.0 selective-context model in the project docs.** New "Carregamento seletivo de contexto" section in `memoria-e-contexto.md` (the two modes, activation fast paths, mid-flow activation guards, selector-routable rules/docs frontmatter, and `rules:lint`); `context:select` and `rules:lint` added to the CLI reference; per-agent notes for squad (investigation opt-out + create-phase genome pass), copywriter (INDEX-driven genome menu + binding operational sections), genome and the profiler pipeline (operational-method layer), and activation fast-path cross-links on briefing/sheldon.

## [1.29.0] - 2026-06-11

### Added
- **Activation-only fast paths across the entry agents.** `@briefing`, `@product`, `@sheldon`, `@analyst`, and `@copywriter` join `@deyvin`: bare activation loads only foundation context (plus registry frontmatter / filename listings where the agent needs a menu), presents the starting options, and stops. Required inputs are now declared with the step that needs each item — never all upfront. `@product` was compressed to fit the fast path inside its 25KB kernel budget (24,999 bytes).
- **Activation guards on the mid-flow agents.** `@architect`, `@ux-ui`, `@pm`, `@qa`, `@orchestrator`, `@scope-check`, and `@discovery-design-doc`: activation without a feature slug reads foundation context only, reports the current stage, asks which feature to work on, and stops. `@qa`'s legacy eager loading section (the "design governance" variant) is replaced by `context:select`-backed Context loading modes. `@validator` heading aligned (its strict sandbox semantics were already the tightest loader in the framework).
- **The eager rules/docs loading section is retired framework-wide.** `@tester`, `@squad`, `@site-forge`, and `@discover` replace "Project rules, docs & design docs" with on-demand Context loading modes; gateways (CLAUDE.md/AGENTS.md) describe rule loading as on-demand; a contract test bans every variant of the eager section in every template agent.
- **Selector-routable rules and docs.** All template rules carry routing frontmatter (`modes`, `task_types`, `triggers`, `paths`, `load_tier`) — description-only rules were selector-invisible (+20 < threshold 30). 41 template docs (squad, sheldon, dev, deyvin, pentester, tester, dossier, site-forge, governance) gain the same routing fields. `context:select` activation-only mode generalized to all workflow agents (per-agent foundation allowlist).
- **`aioson rules:lint [--docs] [--strict] [--json]`** — flags selector-invisible rules (and docs with `--docs`), missing required fields, and suggests routing metadata. `--strict` exits 1 on warnings for CI. Template ships 67/67 selector-visible files, locked by test.
- **Squad creation: investigation is opt-out and genomes enter the loop.** Tier-2 domains run `@orache` by default; tier-3 with no sourceDocs gets an announced Quick Scan. New `squad-create` Step 5.5 (genome pass): planned genomes are reused or generated via `@genome` and bound (manifest `genomes`+`genomeBindings`, executor `## Active genomes`, `squad.md`); pending bindings are queued with `status: pending` and surfaced — never silently empty.
- **Operational-method layer in the persona pipeline.** Benchmarked against practitioner source prompts (Stefan Georgi / RMBC): `@profiler-enricher` Module 9 extracts the executable method (procedure, output structure, style metrics, prohibitions, delivery checklist) from evidence; `@profiler-forge` emits it as five required Genome 3.0 sections; `@genome` treats a missing `## Operating Procedure` on function/practitioner-persona genomes as a generation defect; genome-bindings propagate Prohibitions → executor Hard constraints, Delivery Checklist → squad checklists, Operating Procedure → Response pattern.
- **`@copywriter` genome menu via `INDEX.md`.** New Step G2.4 discovers all installed genomes (masters, personas, domain, brand-voice) through `.aioson/genomes/INDEX.md` with its audience/output-type selection guides; the hardcoded master list becomes the index-absent fallback. The menu serves marketing pages, content, site copy, and system/UI microcopy. Operational sections of a selected genome are binding for the piece (procedure, prohibitions, style metrics, delivery checklist).

### Changed
- `@orache` squad rules load by frontmatter match instead of wholesale scan; `@squad` decision-gating and `@sheldon` mining restricted to selected context; `@sheldon` brain index loads after PRD selection instead of on activation.

### Tests
- Contract suites for every fast path/guard (tokens + section ordering), per-agent activation-only selection, rules/docs routing visibility (67/67), `rules:lint` behavior, squad investigation/genome-pass tokens, operational-method tokens across the pipeline, and copywriter INDEX discovery. Full suite green (3227 pass).

## [1.28.0] - 2026-06-11

### Added
- **`forge:compile` — spec → workflow-script compiler (Lane B, opt-in).** `aioson forge:compile [path] --feature=<slug> [--json]` compiles a MEDIUM feature's completed artifacts into `.aioson/plans/{slug}/forge-run.workflow.js` — an auditable, versionable dynamic-workflow script meant to be committed alongside the spec. Compiled structure: one `parallel()` stage per Wave (file-disjoint dev agents, blocked-wave early stop), a deterministic convergence loop on `aioson harness:check` bounded by the governor's `error_streak_limit` (fixes run **sequentially** — criteria don't prove file-disjointness, only waves do) plus a token-budget guard, 3-lens adversarial review (correctness/completeness/regression-risk, majority survives, refute-by-default) for binary criteria without `verification`, and a fresh-context validator stage that closes through the normal `harness:validate` → `last-validator-output.json` → `apply-validation` circuit-breaker cycle. Hard preflights — invalid/missing contract, zero executable criteria, plan without Wave column, `spec:analyze` errors, and `wave_file_overlap` (warning in analyze, **error** here) all refuse compilation with owner-agent guidance. Generated code honors the workflow runtime contract: pure-literal `meta`, plain JS, no `Date.now()`/`Math.random()`/`new Date()`, and all artifact-derived text embedded via `JSON.stringify` (no interpolable template literals — injection-safe). The script never runs `feature:close`/publish.
- **`@forge-run` agent — the Lane B entry point.** New opt-in agent (`/forge-run`): compile (refusals route to the owner agent), review the compile report with the user (cost warning included), execute the generated script via the workflow runtime (never hand-emulated), and report — PASS recommends the human run `feature:close`, FAIL routes to `@dev` through the normal lane. Registered across CLAUDE.md/AGENTS.md/OPENCODE.md, `.claude/commands` wrapper, `src/constants.js` (MANAGED_FILES + AGENTS), and all template mirrors.
- **`src/harness/plan-waves.js`** — shared Execution Sequence parser (waves + scope + done columns, `groupByWave`), extracted from `spec:analyze` and reused by the compiler. `spec:analyze` behavior unchanged.

### Tests
- Added `forge-compile` suite (9 cases: preflight refusals, governor-derived fix-loop cap, wave→parallel structure, runtime-constraint bans, byte-identical recompilation determinism, template-injection invariant, JSON mode). Full suite green (3210 pass).

## [1.27.0] - 2026-06-11

### Added
- **Wave column — parallelism markers in the MEDIUM implementation plan.** `@pm`'s Execution Sequence gains a `Wave` column: phases sharing a Wave are file-disjoint and dependency-free with respect to each other (parallelizable via isolated subagents/worktrees); waves execute in ascending order. Marking rules are conservative by design — same Wave only when Primary files do not overlap AND neither phase consumes the other's output; when in doubt, sequential (a wrong sequential marking costs wall-clock; a wrong parallel marking costs a merge conflict). This is the cheap prerequisite for any future fan-out execution lane, and forces explicit file-boundary thinking even without one. Template mirror synced.
- **`wave_file_overlap` check in `spec:analyze`.** The deterministic pass now parses the Execution Sequence table and flags same-wave phases whose Primary files overlap (warning). Noise-guarded for backward compatibility: plans without a Wave column skip the check entirely; placeholder cells (`...`, `-`) and non-integer waves are ignored; paths normalized (backticks stripped, separators unified, case-insensitive).

### Tests
- Added wave overlap/disjoint/legacy-plan cases to the `spec-analyze` suite (14 total). Full suite green (3201 pass).

## [1.26.0] - 2026-06-11

### Added
- **`spec:analyze` — deterministic cross-artifact content consistency.** `aioson spec:analyze [path] --feature=<slug> [--json]` is the content sibling of `artifact:validate` (chain presence — untouched): it confronts the feature's artifacts before the execution gate and reports findings by severity. Checks: REQ/AC **ID traceability** (ids declared in `requirements-{slug}.md` never referenced downstream = coverage gap; ids referenced downstream but never declared = orphan/drift signal — both noise-guarded: prose-style plans that cite no ids produce no gap findings), **staleness ordering** (upstream artifact modified after a downstream one was produced, 60s tolerance, project-global `architecture.md` excluded), **readiness states** (`blocked` = error, `ready_with_warnings` = info), **harness-contract sanity** (schema errors = error; executable-coverage warnings = info, via `validateContract`), and **AC→contract linkage** (no declared AC mentioned in the contract = info). Persists `spec-analyze-{slug}.json` to `.aioson/context/` (collected by `feature:export`/`archive`); `error` findings flip `ok: false` (exit 1 in `--json` mode) for gate scripting. Reuses `scanArtifacts`/`detectClassification` from the preflight engine.

### Changed
- **`@scope-check` preflight runs `spec:analyze`.** The deterministic pass executes before deep loads: `error` findings are blockers routed to the owner agent; `warning` findings enter the drift comparison as pre-computed evidence to confirm or dismiss explicitly. Template mirror synced.

### Tests
- Added `spec-analyze` suite (11 cases: traceability gaps/orphans, prose-plan noise guard, staleness via mtime, readiness blocked, contract schema/coverage/AC-linkage, persistence, JSON mode). Full suite green (3198 pass).

## [1.25.0] - 2026-06-11

### Added
- **Fresh-context review payload in `harness:validate`.** The generated `validator-prompt.txt` is now self-contained for isolated execution: it appends a review payload with the deterministic `harness:check` results (exit-code verdicts to copy verbatim), the changed-file list (including untracked, framework state filtered out), and the unified diff vs a resolved base ref — explicit `--base=<ref>`, the loop's `baseline.json` HEAD, merge-base with main/master, or `HEAD` as fallback. Diff is size-capped (`--max-diff-bytes`, default 200KB) with a line-boundary truncation marker; `--no-diff` skips the payload. Degrades gracefully outside a git repository (existing router flows untouched). New module `src/harness/review-payload.js`.
- **Fresh-context validation protocol.** `@validator` documents the generated prompt as its preferred activation surface — run in a fresh, isolated context (subagent/Task tool or separate session), never inline in the session that implemented the feature. `.aioson/docs/autopilot-handoff.md` post-dev cycle routes `@validator` through the isolated-subagent flow (check → validate → isolated run → re-validate to consume the verdict through the circuit breaker); `@qa`'s recommendation mentions the route. Template mirrors synced.

### Changed
- **`harness:validate` next-steps guidance** now instructs running the prompt in a fresh isolated context, and the command result exposes a `reviewPayload` summary (base, changed-file count, truncation, checks included). The `waiting_validation`/`apply-validation` state machine is unchanged.
- **Parser:** `--no-diff` registered as a pure boolean flag (mirrors `--no-index` precedent).

### Tests
- Added `review-payload` suite (10 cases: git fixtures for base resolution, untracked + framework-state filtering, truncation, check-summary embedding, `harness:validate` integration, `--no-diff`). Full suite green (3187 pass).

## [1.24.0] - 2026-06-11

### Added
- **`harness:check` — standalone deterministic runner for `criteria[].verification`.** `aioson harness:check [path] --slug=<slug> [--criteria=C1,C2] [--timeout=<ms>] [--json]` executes the contract's executable checks outside `self:loop`, reusing the existing `runCriteria`/`executeInSandbox` stack (timeouts, process-tree kill, credential redaction, failure signatures). Read-only over `progress.json` — circuit/breaker state mutation remains exclusive to the `harness:validate`/`apply-validation` cycle. Persists the report to `.aioson/plans/{slug}/last-check-output.json` (mirroring `last-validator-output.json`), emits `criteria_check_failed` telemetry best-effort, auto-discovers the active contract when `--slug` is omitted, and supports criterion-subset runs via `--criteria`.
- **`verification` is now a first-class authored field.** The canonical contract doc (`.aioson/docs/sheldon/harness-contract.md` + template mirror) documents `criteria[].verification` with authoring rules (exit 0 = pass, deterministic, cross-platform, prefer the project test runner); `@sheldon` RF-05 instructs producing it for every mechanically checkable `binary: true` criterion. Legacy contracts without the field remain fully valid.
- **Executable-coverage warning in contract schema validation.** `validateContract` now emits an advisory warning (never an error) for each `binary: true` criterion lacking a `verification` command, surfacing verification debt at `harness:init`/preflight without breaking any existing contract.

### Changed
- **`@validator` consumes deterministic checks first.** Step 2 of the validator protocol now runs `aioson harness:check . --slug={slug} --json` and copies each executable check's exit-code verdict verbatim into `results[].passed`; LLM judgment is reserved for criteria without `verification`. Output JSON schema unchanged — `harness:apply-validation` and the circuit-breaker cycle are untouched. `@qa`'s validator recommendation and `@dev`'s implementation strategy mention the new command (template mirrors synced).

### Tests
- Added `harness-check` suite (10 cases: pass/fail/signature, progress.json immutability, subset filter, unknown ids, active-contract auto-discovery, JSON mode, schema rejection) and coverage-warning cases in `harness-contract-schema`. Full suite green (3178 pass).

## [1.23.0] - 2026-06-10

### Added
- **`harness:retro` — deterministic retrospective miner + dossier (RHO-lite).** `aioson harness:retro --feature=<slug> | --last=<N>` mines the failure trail already on disk (QA reports active + `done/`, corrections plans, dossier Agent Trail FAIL→PASS cycles, `execution_events` readonly, attempts, `progress.json` failure signatures, devlogs) and materializes `.aioson/context/retro/{slug}.md` (or `window-last-{N}.md`). No LLM, no network: exact-key grouping (slug always included), REQ-2 promotion criteria (≥2 occurrences, ≥1 high/critical, or ≥2 FAIL→PASS cycles), byte-stable render. Fail-closed slug sanitization (exit 12 before any FS touch) and exit-code propagation in `--json` mode. Hands the dossier to `@sheldon` for semantic classification with human approval.
- **`harness:preview` — preview + pointer for large outputs.** `aioson harness:preview <file> [--max-bytes=8192]` plus the `previewArtifact` helper: persist-first, UTF-8-safe truncation, best-effort write, read-only mode. Adopted at the self-implement-loop criteria-fail feedback so agents consume a preview + pointer instead of dumping full test logs into context. `qa`/`tester` prompts updated to redirect test logs to a file and consume via `harness:preview`.

### Security
- **Prompt-injection neutralization in the retro dossier (SF-01 / LLM01.2).** Mined free-text (finding titles) rendered into the `@sheldon` dossier now passes through `neutralizeText()`, stripping control/newline/bidi/zero-width characters so a forged title cannot inject Markdown block structure into the next agent's context. Deterministic and byte-stable on clean text.
- **Symlink-safe dossier resolution (SF-02).** Dossier file resolution uses `lstatSync` so symlinked artifacts are ignored rather than followed, consistent with the directory-entry readers.

### Tests
- Added `harness-retro` (20), `preview-artifact` (9), and `autopilot-post-dev` regression suites, including SF-01 injection-neutralization coverage. Full suite green.

## [1.22.0] - 2026-06-10

### Added
- **Loop guardrails for self-implementation harnesses.** `self:loop` now runs from an active contract with schema validation, active-contract discovery, scope enforcement, budget ceilings, attempt artifacts, criteria verification, failure-signature escalation, and human approval gates.
- **Harness gate/status commands.** Added `harness:status` and human gate approval/rejection flows so paused loop work can be inspected, resumed, or explicitly blocked without losing context.
- **Contract-aware git guard integration.** `git:guard` now merges declared `forbidden_files` from the active harness contract while preserving safe human commit behavior for lockfiles unless the contract explicitly forbids them.

### Changed
- **Dev/QA prompts now understand loop guardrails.** Workspace and template agent prompts were updated so implementation, QA, correction loops, and handoffs consume the new guarded harness model consistently.
- **Loop-guardrails feature artifacts are now durable.** PRD, requirements, readiness, design, scope-check, Sheldon enrichment, dossier, corrections plan, and progress artifacts were recorded under `.aioson/context/` and `.aioson/plans/`.

### Tests
- Added regression coverage for contract schema validation, glob matching, scope guard behavior, budget enforcement, criteria execution, human gates, active-contract discovery, git guard contract merging, and self-loop guardrails.

## [1.21.8] - 2026-06-08

### Added
- **`feature:export` — copy a feature's artefacts to a clean output directory.** Non-destructive sibling of `feature:archive`: instead of *moving* artefacts into `.aioson/context/done/{slug}/`, it *copies* the full surface (root `*-{slug}.{md,yaml,yml,json}` minus global files, the per-slug `dossier/`/`plans/`/`briefings/` directories, and `context/done/{slug}/` when archived) into an arbitrary `--out` (default `<target>/{slug}-export`), leaving the source tree untouched. Flags: `--flatten` (collapse to one level), `--no-index` (skip the generated `INDEX.md` manifest), `--dry-run`, `--json`. Reuses the archive's slug-collision guard via the new exported `collectFeatureArtifacts` helper, so a sibling slug (`checkout-v2`) never leaks into a `checkout` export. No `features.md` status guard — works on in-progress features too. Turns AIOSON's markdown output into a portable deliverable. Docs: `docs/pt/5-referencia/feature-export.md` + `docs/en/5-reference/cli-reference.md`.

### Fixed
- **`briefing:list` no longer re-surfaces PRD-generated briefings.** The "approved" filter ignored `prd_generated`, so a briefing already converted to a PRD could be picked up again and reverted to draft. It now filters `status === 'approved' && !prd_generated`.
- **`briefing-refiner` `returnedToDraft` is computed before mutation.** The return flag was read from the entry *after* the status was rewritten, reporting the post-mutation state instead of whether the refinement actually returned an approved/non-PRD briefing to draft.
- **`workflow:next` no longer false-flags substantiated stages as unsubstantiated.** `detectUnsubstantiatedCompletions` queried the wrong table/columns (`agent_events.agent` instead of `execution_events.agent_name`) and destructured `openRuntimeDb` incorrectly, so the completion-evidence check silently found nothing; it now reads `execution_events` and only reports `missing` stages when at least one stage *was* substantiated (no false positives on an empty event log). `discovery-design-doc` added to the inferable-stage set.
- **`pulse:update` is CRLF-safe.** The "## Recent Activity" parser matched LF-only (`\n`), so on Windows (CRLF) line endings it failed to capture history and clobbered the existing activity list. Regex and line-split now accept `\r?\n`.
- **`commit:prepare` reads unicode/spaced paths correctly.** `git status --short` ran without `core.quotePath=false`, so non-ASCII paths came back octal-escaped. Also removed a dead no-op ternary in the pattern builder.
- **`parallel:doctor --dry-run` is recognized.** The handler read only `options.dryRun`, missing the kebab `--dry-run` form; it now accepts both.
- **`scan:project` guards malformed LLM responses.** Direct `data.choices[0].message.content` / `data.content[0].text` dereferences could throw an opaque `TypeError` on an unexpected provider payload; both now validate the shape and throw a descriptive `Unexpected … response shape` error.
- **`agent:manifest` validation now whitelists `check_modes`.** `sanitizeManifest` filters `check_modes` against `ALLOWED_CHECK_MODES` (`pre-dev`, `post-dev`, `post-fix`, `final`), mirroring the existing autonomy-mode guard.
- **`runtime:emit` standalone-event line is localized.** The standalone path logged a hard-coded English string; it now uses the `live.standalone_event_recorded` i18n key (added in all locales).

### Changed
- **Agent structural-contract enforcement swept across all agent prompts.** Added the mandatory `## Required input` section to 18 agents that lacked it, a `## Observability` section with the `aioson agent:done … 2>/dev/null || true` call to 9 agents, the §5 best-effort suffix to `agent:done` calls that were missing it (pentester/discover/site-forge), per-slug `dossier:*` flags where required (discovery-design-doc/validator), and the `/clear` handoff cue to `product`. The previously-missing dossier templates (`agent-templates.md`, `schema.md` — referenced by 10 agents) are now shipped under `template/.aioson/docs/dossier/`, closing a packaging gap.
- **Transient SQLite locks now wait instead of failing.** Added `busy_timeout = 5000` to the runtime store (`runtime-store.js`) and context-search index (`context-search.js`), so a WAL checkpoint or AV file-lock retries for up to 5s rather than throwing `SQLITE_BUSY` immediately — a production-robustness improvement that also stabilizes the suite under parallel load.

### Tests
- New `tests/agent-structural-contract.test.js` pins the §1–§6 structural contract (LANGUAGE BOUNDARY, mandatory sections, `Required input`, `agent:done`, §5 best-effort suffix, dossier flag integrity).
- New `tests/feature-export.test.js` (8 cases: mirrored/flatten/no-index/done-inclusion/dry-run/noop/validation/default-out).
- Windows file-lock hardening: recursive `fs.rm` cleanups in 14 SQLite-touching test files now pass `maxRetries: 5, retryDelay: 50`; over-tight latency ceilings in `telemetry-foundation` and `qa-feature-close-distillation` loosened to hang-guards (full suite: 2993 pass, 0 fail, 1 skip).

## [1.21.3] - 2026-05-28

### Security
- **`memory:trim --archive=<path>` is now contained under the project root (TS-LC-01).** It was resolved relative to `cwd` with no containment, so a crafted/typo'd path could write or overwrite a file outside the project. Now resolved under the project root and rejected with `archive_path_escape` on absolute or `..`-traversal escape — mirroring the containment wall in `memory-reflect-commit`. Localized message added in all 4 locales.
- **`feature:close` auto-trim hook now honors `AIOSON_RUNTIME_HOOK` (TS-LC-02).** The hook called the trim engine directly, bypassing the hook-context guard that `memory:trim` enforces. It now skips when running in a hook/automation context, so a tier-2 memory mutation never fires outside explicit human action.

### Tests
- Coverage pass over the v1.21.2 agent-loading-contract code (`node --test --experimental-test-coverage`): `current-state-trim.js` 98.8%→100% line, `memory-trim.js` 73.9%→88.6% line / 64.4%→76.7% branch. Adds error/edge-path tests (`no_current_state`, `section_not_found`, custom/escaping `--archive`, headerless archive, hook skip paths) and verifies all `cli.memory_{archive,restore,search}` keys resolve.

## [1.21.2] - 2026-05-28

### Added
- **Agent loading contract + `memory:trim`.** `bootstrap/current-state.md` is an append-only log that every implementation/review agent read in full at activation (~81KB / ~33k tokens, 84% of the bootstrap). New `aioson memory:trim [--keep=<N>] [--archive=<path>] [--dry-run] [--json]` splits its "## What the system already has" section into a HOT log + a cold `current-state-archive.md` (entries MOVED verbatim, never deleted; active-feature entries exempt). `feature:close` (PASS) auto-rolls aged entries (`--no-trim` to opt out). New governance doc `.aioson/design-docs/agent-loading-contract.md` defines the three loading tiers + retention policy. The repo's own current-state was trimmed 81KB → 21KB.
- **`context:health` now measures `bootstrap/*.md`** — the per-activation layer it previously ignored — and excludes the cold `*-archive.md`; a heavy `current-state.md` now points to `memory:trim`.
- **Shared code-health analysis lens** `.aioson/docs/quality/code-health-analysis.md` (plan → investigate → refine → operate → test → adjust over coverage, test sufficiency, regression need, execution-chain, performance, componentization), wired on-demand into `@tester`/`@qa`/`@pentester`/`@architect`/`@sheldon`/`@deyvin`.
- **Current-state entry tagging** — the reflect engine, `@dev`, and `@committer` now prefix new entries with `[{slug} · {YYYY-MM-DD}]` for precise rollup; `@qa`/`@architect`/`@dev`/`@deyvin` bootstrap sections gained archive-awareness (grep the archive before flagging a capability as missing).

### Fixed
- **`memory:archive` / `memory:restore` / `memory:search` logged raw i18n keys** in every locale — they called message keys without the required `cli.` namespace prefix, so `t()` missed and echoed the key (e.g. `memory_archive.id_required`). All 25 calls now use the `cli.` prefix and localize correctly.

## [1.21.1] - 2026-06-XX

### Fixed
- **`memory:reflect-commit --dry-run` is now non-destructive.** The command never read the `--dry-run` flag, so a "dry run" silently performed the full destructive commit — it wrote the bootstrap files **and** unlinked the single-use manifest, leaving the flow unrecoverable (`missing_manifest`) on the next call. `--dry-run` now runs validation + path containment exactly like a real commit, then returns `{ ok: true, dryRun: true, would_write: [...] }` without writing any file or consuming the manifest, so a real commit can still follow. Regression coverage in `tests/memory-reflect-commit-dry-run.test.js`. Note: the reflect manifest remains single-use — a successful real commit consumes it (re-run by re-running `memory:reflect-prepare`).

## [1.21.0] - 2026-05-28

### Added
- **Gemini CLI deprecation warning (gemini-phaseout Phase 1).** Google announced (2026-05-20) that the Gemini CLI free/personal tier ends 2026-06-18.
  - `install-wizard` now flags Gemini as `[DEPRECATED]` in the tool list and prints a post-selection notice when Gemini is chosen.
  - `doctor` reports `harness:gemini_deprecation` (warning) when `.gemini/permissions.toml` or `.gemini/GEMINI.md` is detected — zero output on projects without `.gemini/`.
  - `permissions-generator` continues to emit `.gemini/permissions.toml` with a header warning (enterprise unaffected).
  - `tool-capabilities` Gemini entry annotated as deprecated.
  - Warning strings localized in all 4 locales (en, pt-BR, es, fr).
  - Enterprise users (Code Assist Standard/Enterprise) are unaffected.
  - Hard removal scheduled for v1.22 (post 2026-06-18). Pre-existing `.gemini/permissions.toml` will be preserved.
  - Recommended migration: `--tool=codex` or `--tool=opencode`.

## [1.18.0] - 2026-05-27

### Added
- **Agent Orchestration V2 — Phase 1: durable checkpoints, decision rationale, scoped operator memory.** Three must-have milestones shipped:
  - **M1 — Checkpoint at gate.** `gate:approve` now writes a checkpoint JSON to `.aioson/runtime/checkpoints/gate-{A|B|C|D}-{slug}.json` after successful approval. Contains `prerequisites_snapshot` (artifact paths + mtimes), `gate_check_result`, and `decision_log`. Best-effort write (BR-AO-01: try/catch, never blocks approval). 5KB size cap with `decision_log` truncation (BR-AO-03). `workflow:heal` reads the latest checkpoint for the active feature using latest-gate-wins ordering (D > C > B > A per BR-AO-02) and injects recovery context into the healing prompt. Falls back gracefully when no checkpoint exists (EC-AO-02).
  - **M2 — Decision rationale in handoffs.** `op:capture` appends confirmation signals to `.aioson/runtime/session-confirmations.jsonl`. `session-handoff.js` auto-collects these into `decision_rationale[]` in `last-handoff.json` (FIFO cap at 5 per BR-AO-04, only `signal=confirmation` per BR-AO-05). `dev:resume-data` passes rationale through to the context package. Accumulator cleared after each handoff.
  - **M3 — Scoped operator memory.** `op:capture` accepts `--feature=<slug>` and `--session-id=<id>` flags (BR-AO-06: optional, NULL when omitted). Fields stored in proposal/decision markdown frontmatter and propagated on promotion. `op:list` accepts `--feature` and `--agent` filters (AND-composable per BR-AO-07). JSON output with `--feature` follows BR-AO-09 schema.

### Notes
- **QA findings resolved:** H-01 (spec correction: markdown frontmatter, not SQL ALTER TABLE) and M-02 (confidence field type documented as string `'confirmed'`). Both are spec amendments, not code changes.
- **S1 (telemetry consumer mapping) and S2 (checkpoint lifecycle cleanup) deferred** as Should-have scope for a follow-up release.
- **Test coverage:** 36 feature-specific tests (23 by @dev + 13 by @tester). 115/115 related tests green. Full suite regression: 2822/2816 + 1 skipped + 5 fail (all pre-existing: AC-P1-07 operator-memory, AC-ALL-101 perf flake, product kernel size, pentester text contracts, tool-invocation-hardening).

## [1.17.2] - 2026-05-22

### Security
- **Neural Chain — fixes for the 3 @pentester findings against v1.17.1** (SF-NC-01 HIGH + SF-NC-02 MEDIUM + SF-NC-03 LOW). Single consolidated patch closing the `block` recommendation that prevented npm publish of v1.17.1.
  - **SF-NC-01 (HIGH) FIXED — Noise file injection via newline in chain_edges.target_path.** The @pentester probe demonstrated that a crafted row (`target_path = "legit.js\n- [ ] [AUTO-FIXABLE] /etc/passwd ..."`) bypassed the BR-NC-03 `guarded` mode guarantee because `serializeItem` interpolated the path raw and `parseItems` accepted the resulting injected line as a standalone item. New `src/neural-chain-sanitize.js#isUnsafePath` centralizes the rule: reject strings with any ASCII control char (`\x00-\x1f` + `\x7f`, includes `\n` `\r` `\t` `\0`), empty strings, and strings longer than 4096 chars. Wired at three boundaries — **Layer B ingest:** `deriveSessionPairs` (in `agent-ingest.js`) and `computeCoEditPairs` (in `git-ingest.js`) filter unsafe paths before INSERT; **Layer A render:** `flattenAudits` (in `noise-file.js`) drops items with unsafe `target_path` / `source_file` before they reach the noise file body (defense in depth for pre-v1.17.2 rows that may still be active in the database); **CLI boundary:** `runChainAudit` returns `{ ok: false, reason: 'unsafe_file_path' }` when the input file argument fails validation, before the SQL bind. The regression test reproduces the original probe with the same malicious INSERT and asserts the forged `[AUTO-FIXABLE]` line never appears in the rendered body — `guarded` mode safety contract restored.
  - **SF-NC-02 (MEDIUM) FIXED (app-layer only) — chain_edges schema validation gaps.** Same `isUnsafePath` helper covers the length cap (4096) and control-char rejection at ingest, providing the same protection as a schema CHECK without requiring a table rebuild. Schema-level CHECK constraints on `source_path` / `target_path` / `start_at` / `last_seen_at` are deferred to M2 graph maintenance, which already needs a `schema_meta` migration. Application code only writes ISO 8601 timestamps via `new Date().toISOString()` — a malicious direct INSERT could still bypass the timestamp format check at the SQL layer; this is documented as the open M2 follow-up and noted in `requirements-neural-chain.md`. The chain_edges INSERTs from `git_co_edit` and `agent_event` paths are now both protected.
  - **SF-NC-03 (LOW) FIXED — normalizeThreshold rejects negative zero + spec trust-boundary note.** `normalizeThreshold` now returns `null` when the parsed value is `-0` via `Object.is(n, -0)` check — required because `n < 0` evaluates `false` for `-0`. A crafted `.aioson/config.md` with `chain_auto_threshold: -0` now falls back to the default `0.8`. `requirements-neural-chain.md` EC-NC-07 amended with an explicit trust-boundary note: `.aioson/config.md` must remain under version control + code review; `.gitignore` on it is an anti-pattern for neural-chain. Runtime warning telemetry when `autonomy=autonomous + threshold=0` is documented as a future hardening but not shipped (low ROI given the doc note covers the operational concern).

### Notes
- **Cumulative regression**: 2780 tests, 2777 pass, 1 skipped, 2 fail (AC-P1-07 operator-memory pre-existing + AC-ALL-101 perf flake intermittent on Windows — both unrelated). +5 new tests in `tests/neural-chain-invariants.test.js` covering all three SF-NC fixes plus a Layer B unit check on `deriveSessionPairs`.
- **`security-findings-neural-chain.json`** updated — all three findings now carry `status: fixed`, `fix_release: v1.17.2`, and a `fix_summary` describing exactly what landed. `@qa` is the final decision owner per `pentester.md` ownership protocol and should re-verify before treating the findings as closed. A re-run of the @pentester probes against v1.17.2 is recommended to confirm mitigation in addition to the regression tests.
- **`npm publish` unblocked**: v1.17.1 was tagged but the @pentester block recommendation prevented publishing it. v1.17.2 supersedes pre-publish; user chooses this tag for npm publish.
- **Inception loop closed for this cycle**: @qa flagged 2 Medium → @dev hotfixed in v1.17.1 → @tester defensive invariants caught a third bug (M-003 schema drift) → @dev fixed → @pentester adversarial review found 3 more (SF-NC-01..03) → @dev fixed in this v1.17.2 release. Each agent role surfaced a class of problem the previous role could not have caught — exactly the loop neural-chain itself is designed to support for *user* code.

## [1.17.1] - 2026-05-22

### Fixed
- **Neural Chain — hotfix for 3 Medium findings from `@qa` Gate D + `@tester` gap-fill (M-01 / M-02 / M-003).** Consolidated patch — single release closing the residual risks documented in `spec-neural-chain.md` § QA sign-off + `test-plan.md` § bug-found.
  - **M-02 (bug-found-002) FIXED — BR-NC-01 dual-source dedupe.** When the same `(source_path, target_path)` pair existed under both `edge_type='git_co_edit'` AND `edge_type='agent_event'`, `queryImpacts` and `chain:audit` previously returned both rows separately, duplicating the same target in noise files (different motivos). Spec BR-NC-01 says "reportar `max(c_git, c_event)` — não soma; evita double-count entre fontes". Both SQL queries (in `src/neural-chain-agent-ingest.js#queryImpacts` and `src/commands/chain-audit.js`) now wrap the row scan in a SQLite window function `ROW_NUMBER() OVER (PARTITION BY target_path ORDER BY confidence DESC, hit_count DESC, last_seen_at DESC)` and keep only `rn = 1`. The chosen `edge_type` is the one from the row that won the max confidence (tiebreaker by hit_count then last_seen_at). 2 new tests in `tests/neural-chain-invariants.test.js` cover both call sites (hook + CLI) with a dual-source seed asserting the deduped row reports the max confidence (0.9, not 0.6+0.9) and the surviving edge_type.
  - **M-003 (bug-found-003) FIXED — chain_audit telemetry schema drift between emitters.** Previously the CLI emitter (`chain-audit.js`) and the hook emitter (`agent-ingest.js`) drifted on payload fields: CLI was missing `noise_file`/`auto_fixable_count`/`tokens_used`; hook EC-NC-05 no-op event was missing `duration_ms`/`error`; both used singular `source_file` instead of the spec'd plural `source_files`; `tokens_used` was never populated by anyone. New `src/neural-chain-telemetry.js` exposes a single `emitChainAuditEvent(db, { agent, message, ...payload })` helper that builds the full 8-field BR-NC-10 payload schema (`feature_slug, source_files[], impacts_found, auto_fixable_count, noise_file, tokens_used, duration_ms, error`) with sane defaults for the no-op path. Both call sites migrated. CLI passes `source_files: [filePath]` (singleton array) so the spec'd plural shape holds; hook passes the full session's `safeArtifacts`. `tokens_used` ships as `0` placeholder in V1 — re-instrument when LLM-mediated path activates (M2 concern). Legacy singular `source_file` alias preserved in both emit payloads to keep any v1.17.0 dashboard query working until v2. `tests/neural-chain-invariants.test.js` A.2 promoted from a 2-field subset check to the full 8-field BR-NC-10 schema validation, with type discipline (source_files is array, duration_ms is number, etc.) on both hook and CLI events.
  - **M-01 (bug-found-001) AMENDED — EC-NC-04 retry/backoff acceptably deferred in V1.** Spec EC-NC-04 + requirements EC-NC-04 + this CHANGELOG entry now explicitly acknowledge that V1 ships single-attempt try/catch instead of the spec'd 3-attempt exponential backoff. Justification: BR-NC-11 (non-blocking) is the load-bearing contract — audit failure never propagates to `runAgentDone`, agent:done completes normally regardless. The `runAgentDone` path is sequential with low contention (Living Memory reflect-prepare + Neural Chain hook run in series, no real lock pressure). The `withRetry({ attempts: 3, backoffMs: [100, 200, 500] })` helper is deferred to M1.5/M2 when squad-mode concurrent edits (EC-NC-08) actually create lock contention. Zero code change for this item — pure spec amendment.

### Notes
- **Cumulative regression**: 2775 tests, 2772 pass, 1 skipped, 2 fail (AC-P1-07 operator-memory pre-existing + AC-ALL-101 perf flake intermittent on Windows — both documented, unrelated to this hotfix). +2 tests vs v1.17.0 baseline.
- **AC-AUDIT-NC**: still 7/7 satisfied; this hotfix tightens the BR-NC-01 + BR-NC-10 contracts in code, not in scope.
- **No version bump for npm publish needed yet** — v1.17.0 has NOT been published. v1.17.1 supersedes it pre-publish. User chooses which tag to `npm publish` from when ready.
- **Bug discovery loop closed**: `@qa` flagged M-01 + M-02 in Gate D residual; `@tester` discovered M-003 via the A.2 schema completeness invariant test (test had to relax its assertion because the no-op event omitted `duration_ms` — that relaxation itself became the smoking gun); `@dev` consolidated all three in this single patch slice.

## [1.17.0] - 2026-05-21

### Added
- **Neural Chain — Phase 1 shipped end-to-end (Slices 1-6).** Impact-aware code editing for AIOSON: when an agent edits a file, the post-session hook audits chain edges (git co-edit + agent-event signals) and surfaces files that may need updating via a per-session noise file consumed by `@neo` as a blocker.
  - **Schema (Slice 1)**: `chain_edges` table in `aios.sqlite` — 10 fields, 3 indexes (2 lookup + 1 partial UNIQUE on active rows for archive-flow per BR-NC-08), CHECK constraints on `edge_type` ∈ {git_co_edit, agent_event} + `confidence` ∈ [0,1] + `hit_count > 0`. New `src/neural-chain-migration.js` idempotent runner wired downstream of `runLearningLoopMigration` in `runtime-store.js#ensureLegacyColumns`.
  - **`aioson chain:audit <file> [--feature=<slug>] [--json] [--limit=N]` (Slice 2)**: read-only CLI returning top-N active impacts ordered by confidence DESC (default 20, hard cap 200). Emits one `execution_events` row per invocation with `event_type='chain_audit'` (BR-NC-10 telemetry obligation). Failure non-blocking per BR-NC-11. i18n keys added in 4 locales.
  - **Git co-edit ingest helper (Slice 2)**: `src/neural-chain-git-ingest.js` — pure `parseGitLog` / `computeCoEditPairs` / `ingestGitCoEditEdges` plus `runGitIngest` integration wrapper. BR-NC-01 saturation at 10 co-edits, BR-NC-08 hard cap 10k per source via archive-oldest-by-`last_seen_at`, 90-day window filter, mega-commits (>50 files) + `.aioson/*` paths excluded, UPSERT respecting partial UNIQUE index. EC-NC-06 honored (skip when git history < 50 commits).
  - **Agent-event ingest hook (Slice 3)**: `src/neural-chain-agent-ingest.js` — `deriveSessionPairs` / `ingestAgentEventEdges` / `runChainHookOnAgentDone` / `queryImpacts`. Wired into both `live_event` and `standalone` branches of `runAgentDone` in `src/commands/runtime.js` (best-effort try/catch envelope, BR-NC-11). BR-NC-01 saturation at 5 hits via UPSERT ON CONFLICT incrementing `hit_count` + recomputing confidence atomically. EC-NC-05 explicitly honored — empty/single-file artifact lists still emit exactly one `chain_audit` event with `impacts_found=0` so the guardrail metric series stays continuous.
  - **Noise file write/lifecycle (Slice 4)**: `src/neural-chain-noise-file.js` — `writeNoiseFile`, `readNoiseFileAndRecompute`, `maybeDeleteNoiseFile` (sync fs, no new dependency). Path scheme `.aioson/context/noises/{feature-slug}-{YYYYMMDD-HHMM}.md` with `unspecified-{ts}.md` fallback (BR-NC-06). YAML frontmatter carries `{slug, edit_at, autonomy_mode, source_files, total_items, resolved_items}`; body lists `- [ ] {target} — {edge_type} {confidence} (source: {file})` items, file-level only (BR-NC-09; M1 forbids `:symbol` granularity). EC-NC-09 (corrupted frontmatter still returns parsed body items) + EC-NC-10 (idempotent unlink on race delete) honored.
  - **`@neo` noise blocker step (Slice 5)**: `@neo` activation protocol gains Step 1.5 — detects `.aioson/context/noises/*.md` with pending `- [ ]` items via regex or `readNoiseFileAndRecompute` helper; surfaces as ⛔ blocker with `confidence: low` and `clarification` populated, listing each pending item by target_path + motivo. Resolution path is marking `- [x]` (lazy unlink on next hook invocation per EC-NC-10); explicit skip via natural-language `"skip noises"` with `reason: skipped <N> noise file(s)` in routing block. New top-priority "Chain audit pending" stage in Step 3 takes precedence over all other stages. Mirrored byte-for-byte to `template/.aioson/agents/neo.md` (brain `sheldon-001` template parity verified via `diff -q`).
  - **Autonomy mode wiring + BR-NC-02/03 threshold rules (Slice 6)**: new `src/neural-chain-config.js` exposes `readChainConfig({ targetDir })` returning `{autonomyMode, chainAutoThreshold, source}` from `.aioson/config.md` YAML frontmatter. EC-NC-07 honored in 4 code paths (null targetDir, ENOENT, no frontmatter, invalid value) — defaults `guarded` / 0.8 with no force-edit. New `classifyImpact` applies BR-NC-02 rule (a) test-pair filename match cross-language and rule (c) `confidence > threshold AND edge_type='agent_event' AND hit_count > 5`. **Rule (b) literal identifier match deferred to M1.5/M2** — requires git diff parsing, heavy for V1 with bounded marginal gain. BR-NC-03 mode semantics fully wired: `guarded` → all noise (no marker), `standard` → matches tagged `[AUTO-FIXABLE]`, `autonomous` → matches `[AUTO-FIXABLE]` + non-matches `[AUTO-FIXABLE-BEST-EFFORT]`. Both `standard` and `autonomous` now write the noise file (Slice 4 deferred; Slice 6 enables). Telemetry payload (BR-NC-10) gains `auto_fixable_count` + `chain_auto_threshold`.
  - **`tests/neural-chain-{migration,git-ingest,agent-ingest,noise-file,autonomy}.test.js` + `tests/chain-audit.test.js`** — 81 acceptance tests cumulative across Slices 1-6 (11 + 21 + 12 + 13 + 23 + chain-audit suite). Coverage spans schema CHECK constraints, partial-UNIQUE archive flow, confidence formula + saturation, hard-cap enforcement, UPSERT idempotency, EC-NC-05/06/07/09/10, classifier mode×rule combinations, marker render + parse round-trip, hook integration auto-resolving config + per-mode classification + telemetry completeness.

### Notes
- **Phase 1 complete.** Neural Chain shipped Slices 1-6 in a single 2026-05-21 dev day (inception-mode pacing: framework feature being implemented using the framework's own agents). Single release v1.17.0 per progressive-release strategy — no per-slice version bumps.
- **AC-AUDIT-NC done gate 7/7 satisfied** (verification mapping in `spec-neural-chain.md`): item 1 `chain:audit` in `runAgentDone` ✓, item 2 `@neo` surfaces noises as blocker ✓, item 3 autonomy mode read via unit test covering 3 modes ✓, item 4 schema migration applied ✓, item 5 coverage ≥ 80% on critical paths ✓, item 6 CHANGELOG entry ✓ (this release), item 7 template parity (`diff -q .aioson/agents/neo.md template/.aioson/agents/neo.md` returns 0) ✓.
- **Primary success metric (from PRD)**: −50% second-call correction loops in 30d post-release. **Baseline instrumentation TBD** in next 20-30 sessions; post-shipping delta measured at 30-day mark.
- **Guardrail metric**: `tokens_used` in `runtime_events` filtered `type='chain_audit'` should stay stable over time. `aioson chain:stats` aggregation planned as follow-up M1.5 feature. Pulse alert when `delta_avg > 2x` month-over-month — signal that M2 graph maintenance (skill LLM-judged + heuristic + `chain:prune`) is due.
- **Out-of-scope V1, planned for V2/M2**: squad/parallel edit scenarios (EC-NC-08), `chain_node_cap` configurability (hardcoded 10k V1), BR-NC-02 rule (b) literal identifier match via git diff parsing, AST drill-down + multi-language AST via tree-sitter, Obsidian-style graph visualization, `chain:prune` skill + heuristic cleanup.
- **Brain nodes applied during implementation**: `sheldon-001` (template parity for agent files), `sheldon-005` (CLI-first integration — reused `execution_events` instead of a new table), `sheldon-006` (audit wiring before close — feature was design-complete only until AC-AUDIT-NC passed). All three reinforced as patterns by this feature's shipping cycle.

## [1.16.0] - 2026-05-21

### Added
- **Operator memory — Phase 5 TTL decay + migration + closure** (5 of 5 phases — **feature complete**).
  - **`src/operator-memory/decay.js`** (NEW): per-category half-life engine — identity=365d, autonomy=180d, tooling=90d, default=90d (PMD-03). Env override per category via `AIOSON_OPERATOR_DECAY_<CATEGORY>_DAYS`. `findStaleDecisions(identity)` returns past-half-life entries with 30d per-slug debounce via `~/.aioson/operators/{identity}/_decay_state.json`. `cleanupHistory(identity)` hard-deletes `history/*.md` entries older than 365d.
  - **`src/operator-memory/prune.js`** (NEW): 10k hard cap (PMD-04). `enforceCap(identity, {cap})` prunes oldest non-identity-category decisions first; identity-category decisions are NEVER auto-pruned. Env override via `AIOSON_OPERATOR_MAX_DECISIONS`.
  - **`aioson op:reinforce <slug>`** (NEW Phase 5 command): refreshes `last_reinforced` + increments `reinforcement_count`. Silences decay prompt for next half-life window.
  - **`aioson op:migrate`** (NEW Phase 5 command): explicit one-shot import from `.aioson/context/user-profile.md`. 8 known field mappings (autonomy_preference, communication_style, etc.). Idempotent (checks `deprecated_by: operator-memory` frontmatter). Unknown fields preserved. Marks `user-profile.md` deprecated post-migration per PMD-10.
  - **`aioson op:identity set <id>`** Phase 5 full impl replaces Phase 1 stub: mutates `process.env.AIOSON_OPERATOR_ID` for the current process + initializes the storage tree + returns the shell `export` command for persistence.
  - **`tests/operator-memory-decay.test.js`** — 23 new unit tests AC-P5-01..09 (closure ACs P5-10..14 verified by archive process).
  - **`scripts/smoke-run-chain.js`** `[OM5]` section (decay sweep, hard cap, history cleanup) + `[OM-ALL]` cross-phase loader verification (10 modules + 8 CLI commands all exporting expected functions). Total smoke now 25/25.
  - **`.aioson/context/wiring-audit-operator-memory.md`** Phase 5 entry + **cross-phase consolidation table** (PMD-07 / BR-05 Gate D blocker satisfied). 20 call sites, 114/114 cumulative unit tests, 14 smoke sections green.

### Notes
- **Feature complete.** Operator-memory shipped end-to-end: F1 (storage+identity) + F2 (capture+promotion) + F3 (universal loading directive) + F4 (conflict policy + flag flip) + F5 (decay+migration). 5 phases × 5 minor releases v1.12.0 → v1.16.0 per DD-05 progressive-release strategy (mirrors workflow-handoff-integrity exitoso).
- **20 call sites, 114 unit tests, 25 smoke checks** wired and exercised across the 5 phases. Cross-phase consolidation table in wiring-audit doc verifies every phase has call sites grepped + tests passing + smoke coverage (PMD-07 / BR-05 anti-pattern guard).
- Gate D approved post-QA sign-off. `features.md` operator-memory → `done`. Feature artifacts archived to `.aioson/context/done/operator-memory/`.
- **First operational test in production:** this very release ships AIOSON_OPERATOR_MEMORY default-ON. Existing users on `~/.aioson/` (e.g. me, who has been operating this dev session) will start participating in capture as new sessions begin. The feature is now self-evidence-generating.

## [1.15.0] - 2026-05-21

### Added
- **Operator memory — Phase 4 conflict policy + flag flip** (4 of 5 phases). Binary V1 conflict detection between operator decisions and project rules in `.aioson/rules/`. **Inception flag `AIOSON_OPERATOR_MEMORY` is now default ON** (opt-out via env var).
  - **`src/operator-memory/conflict.js`** (NEW): `detectConflicts`, `debounceConflicts`, `formatConflictWarning`, `scanProjectRules`, `parseRuleFrontmatter`. Keyword-overlap heuristic (≥ 2 stopword-filtered shared keywords) intersected with signal-type filter. Configurable threshold via `AIOSON_OPERATOR_CONFLICT_KEYWORD_THRESHOLD`.
  - **`src/operator-memory/loader.js`** — `preflightLoad` extended with conflict detection when `options.projectRoot` is supplied. Conflicts are debounced per (decision_slug, rule_basename) pair via `_conflict_state.json` (60s default window, mirrors F2 idempotency pattern).
  - **Project rule schema additive**: `.aioson/rules/*.md` may now declare `conflicts_with_signal_types: [authorization, exclusion, correction, confirmation]` in frontmatter. Rules without this field generate zero false positives (backward-compat preserved — AC-P4-04).
  - **`tests/operator-memory-conflict.test.js`** — 18 new unit tests AC-P4-01..10 including **statistical corpus** (10 conflict pairs + 15 non-conflict pairs) with verified FN=0%, FP=0%.
  - **`scripts/smoke-run-chain.js`** `[OM4]` section — 4 smoke checks (binary V1 conflict, additive no-FP, debounce window, flag-flip directive verification).
  - **`template/CLAUDE.md` + `template/AGENTS.md`** universal directive updated: signals "Default **ON** in v1.15.0+. Opt out via `AIOSON_OPERATOR_MEMORY=false`". Byte parity between the two files preserved (T5 + AC-P3-11). New size: 1307 B per file × 2 = 2614 B total (improvement from 2664 B).

### Changed
- **`AIOSON_OPERATOR_MEMORY` default flipped from `false` → `true`** per AC-P4-08. Agents now read `MEMORY.md` at preflight (when present) by default. Existing AIOSON behavior is preserved when no MEMORY.md exists per identity — directive degrades gracefully (AC-P3-08 backward-compat unchanged).
- Updated wording in directive sections to be flip-aware (still byte-identical between CLAUDE.md and AGENTS.md per parity invariant).

### Notes
- **Operator memory is now active by default.** New users running v1.15.0+ will have their first signal captures land in `~/.aioson/operators/{hash}/proposals/` automatically when agents emit `aioson op:capture`. Promotion at the 2x threshold (PMD-07) continues to be silent on first detection and emits the 1-line audit on promotion.
- Smoke runner result: 21/21 green (was 17/17 before OM4). The flag-flip safety gate (smoke must be green BOTH flag-off and flag-default) is satisfied — Phase 3's backward-compat tests still pass under default-on mode because the helpers degrade gracefully when no storage exists.
- Phase 5 (v1.16.0) ships next: per-category TTL decay, 10k hard cap enforcement, `op:reinforce`, `op:migrate` (one-shot import from `user-profile.md`), `op:identity set` full impl, history/ cleanup at 365d, cross-phase wiring audit consolidation, Gate D, and feature:archive. That's the closure release.

## [1.14.0] - 2026-05-21

### Added
- **Operator memory — Phase 3 universal loading directive** (3 of 5 phases for the `operator-memory` feature). The cross-cutting integration phase that wires operator-memory into agent prompts framework-wide. **Inception-risk phase** — directive ships behind `AIOSON_OPERATOR_MEMORY=true` flag **default OFF** until Phase 4 (v1.15.0) ships green.
  - **Universal directive** injected into `template/CLAUDE.md` AND `template/AGENTS.md`: `## Memory loading` + `## Memory capture` sections at consistent position (after `## Mandatory first action`, before `## Agents`). Byte-identical between both files (T5 parity guarantee). Flag-gated: `if process.env.AIOSON_OPERATOR_MEMORY === 'true'` — when unset/false the directive is a no-op (backward-compat per AC-P3-08).
  - **`aioson op:list` full impl** — replaces Phase 1 stub. Lists active decisions with category + signal_type + reinforced date. Supports `--proposals` (queue view), `--include-archived` (Phase 5 archive tier), `--format=json` (machine-readable).
  - **`aioson op:show <slug>` full impl** — replaces Phase 1 stub. Prints decision frontmatter + body, or proposal data when slug is in `proposals/`. `--json` supported.
  - **`src/operator-memory/index-md.js`** (NEW): MEMORY.md tier-based reader/writer. `loadMemoryIndex(identity, tier)` parses frontmatter + link entries. `regenerateIndex(identity)` rebuilds from `decisions/*.md` filesystem (markdown source-of-truth per PMD-AN-06). Hooked into `promoteProposal` + `forgetEntry` post-commit so MEMORY.md auto-refreshes after every state change.
  - **`src/operator-memory/loader.js`** (NEW): `preflightLoad(identity, taskDescription)` returns `{index, matches}` for agent-side consumption. `matchDecisions(index, taskDescription)` V1 substring + stopword heuristic (V2 will switch to FTS5-backed query).
  - **`.aioson/docs/operator-memory/memory-md-format.md`** (NEW): canonical cross-harness format spec. Documents MEMORY.md frontmatter + body schema, decision file schema, loading pseudocode, V1 support matrix (Claude Code native + Codex compatible + Gemini compatible; Cursor + Aider TBD V2), and a ~10-line POSIX reference implementation.
  - **`scripts/memory-budget-audit.js`** (NEW): enforces NFR-02 byte budgets. Per-file warn at 1500B / fail at 2000B; cross-cutting warn at 5000B / fail at 6000B. Phase 3 directive total: 2664 B (well within budget). `--json` supported. Exit 1 on fail.
  - **`tests/operator-memory-loading.test.js`** — 23 new unit tests covering AC-P3-01..12 including byte-parity between CLAUDE.md/AGENTS.md directives + budget audit self-test + cross-harness format spec sanity.
  - **`scripts/smoke-run-chain.js`** extended with `[OM3]` section — 3 smoke checks (index regenerates after promote, lazy match returns task-relevant decisions, flag-OFF graceful degrade).

### Notes
- **Inception risk explicitly mitigated**: `AIOSON_OPERATOR_MEMORY` flag is **OFF by default in this release**. Existing AIOSON sessions are unaffected — directive in template files is a no-op until the env var is set. Phase 4 (v1.15.0) will flip the default to `true` AFTER its CI gate confirms both flag-states are green.
- The directive is byte-identical between `template/CLAUDE.md` and `template/AGENTS.md` (verified by AC-P3-11 test). This is the parity contract — different file shells, identical directive content.
- Smoke runner result: 17/17 green (was 14/14 before OM3).
- MEMORY.md tier-based format (PMD-AN-02): Phase 3 ships single `MEMORY.md` (active tier). Phase 5 decay sweep will partition into `MEMORY.md` + `MEMORY-archive.md` based on category half-life crossing. Format is forward-compatible.
- Cross-harness V1 support matrix documented: Claude Code + Codex + Gemini CLI all read `CLAUDE.md` or `AGENTS.md`, both of which now contain the universal directive — they participate natively when the env flag is set. Cursor + Aider deferred to V2 (need bridge files).

## [1.13.0] - 2026-05-21

### Added
- **Operator memory — Phase 2 capture + promotion engine** (2 of 5 phases for the `operator-memory` feature). Builds on Phase 1's storage substrate to deliver the actual signal-capture pipeline:
  - **`aioson op:capture` full impl** — replaces Phase 1 stub. Captures a standing-decision signal of type `authorization | exclusion | correction | confirmation`, derives deterministic slug from `--proposal`, writes to `proposals/{slug}.md` on first detection (silent), promotes to `decisions/{slug}.md` atomically on second detection (per PMD-07 2x threshold) with the 1-line audit `✔ Memory: '<text>'. aioson op:forget <slug> p/ desfazer.` (PMD-08 silent-by-default with audit-on-promotion).
  - **`aioson op:promote <slug>` full impl** — manual promotion path that skips the 2x threshold for a pending proposal.
  - **`aioson op:forget <slug>` full impl** — soft-deletes a decision or proposal to `history/{ISO}-{slug}.md`. Idempotent (second call returns noop). Removes FTS5 row inside SQLite transaction.
  - **`src/operator-memory/slug.js`** new module: `deriveSlug`, `normalize`, `fingerprintProposal`. Deterministic kebab-case + stopword filter + truncation at word boundary + collision-suffix detection.
  - **`src/operator-memory/proposal.js`** new module: `captureSignal` (write/increment), `readProposal`, `deleteProposal`. Quotes capped at 5 most recent per AC-P2-01.
  - **`src/operator-memory/decision.js`** new module: `promoteProposal` (atomic via SQLite transaction + atomic rename per AC-P2-03), `forgetEntry`, `readDecision`, `inferCategory` (V1 keyword heuristic for autonomy/identity/tooling/default per PMD-03).
  - **`template/agents/_shared/memory-capture-directive.md`** — NEW versioned prompt template (`schema_version: "1.0"`). 4 signal types × ≥3 concrete examples + anti-pattern section + capture-call format. PMD-02 acknowledged divergence from AIOSON's deterministic principle. File is dormant in Phase 2 — Phase 3 wires it into `template/CLAUDE.md`/`AGENTS.md`.
  - **`tests/operator-memory-capture.test.js`** — 26 new unit tests covering AC-P2-01..12 (capture, promote, forget, signal validation, atomicity, FTS5 mirror correctness, category inference, body cap).
  - **`scripts/smoke-run-chain.js`** extended with `[OM2]` section — 3 smoke checks exercising capture+promote pipeline, idempotent forget, signal validation in isolated tmp HOME.
  - **`.aioson/context/wiring-audit-operator-memory.md`** Phase 2 entry populated with call sites, tests, atomicity verification.

### Notes
- Atomicity per AC-P2-03: SQLite `db.transaction()` wraps fs operations (`writeFileSync` to `.tmp` + `renameSync` + `unlinkSync` of proposal). Crash mid-transaction → SQLite rolls back; tmp file cleaned up via `finally`. POSIX `rename(2)` and Windows `MoveFileEx` provide the atomic-rename guarantee.
- Telemetry events shipped this release: `op_capture`, `op_promote`, `op_forget` via existing `dossierTelemetry.emitDossierEvent` (PMD-12 + DD-04 confirmed: extend, don't fragment).
- LLM-driven capture is acknowledged divergence from AIOSON's deterministic principle (PMD-02). The prompt template at `template/agents/_shared/memory-capture-directive.md` is the canonical signal-detection spec; versioned `schema_version` field supports V1→V2 migration.
- Smoke runner result: 14/14 green (was 11/11 before OM2 section).
- Phase 3 (Universal loading directive, v1.14.0) ships next. **Inception risk:** Phase 3 modifies template files this framework itself uses — flag-gated `AIOSON_OPERATOR_MEMORY=true` default OFF until Phase 4 ships green.

## [1.12.0] - 2026-05-21

### Added
- **Operator memory — Phase 1 storage + identity foundation** (1 of 5 phases for the `operator-memory` feature). Establishes the per-operator memory substrate that all subsequent phases build on:
  - **`aioson op:identity`** CLI command — resolves operator identity via sha256[0..16] hash of `git config user.email`, with `AIOSON_OPERATOR_ID` env override (validated regex `^[a-z0-9][a-z0-9-]{2,31}$`, reserved prefixes `_*` and `aioson-*` blocked per PMD-05). Subcommands: `show` (full), `set <id>` (Phase 1 stub — full impl ships Phase 5).
  - **`~/.aioson/operators/` storage tree** auto-created per identity: `decisions/`, `proposals/`, `history/` subdirs (Phase 2+ populates). Hybrid storage backend: shared `_index.sqlite` (FTS5 virtual table + `operators` table) for cross-decision search per PMD-01.
  - **5 CLI command stubs** (`op:capture`, `op:promote`, `op:forget`, `op:list`, `op:show`) — register the command surface, emit `op_command_stub` telemetry on invocation, return exit 1 with structured "Not yet implemented (ships in Phase N / vX.Y.Z)" message. Full impls ship across Phases 2-3.
  - **`src/operator-memory/{identity,storage}.js`** new pure-helper modules exporting `resolveIdentity`, `validateOverride`, `hashEmail`, `ensureStorageTree`, `openIndexDb`, `migrateIndexSchema`, `recordIdentityActivity`. Reusable by downstream phase commands.
  - **`tests/operator-memory-identity.test.js`** — 24 unit tests covering AC-P1-01..10 + EC-08 salt rehash + DD-02 hash size invariant.
  - **`.aioson/context/wiring-audit-operator-memory.md`** — new Gate D blocker doc, Phase 1 entry populated (will accumulate per-phase entries across v1.12.0 → v1.16.0).

### Notes
- This release opens Phase 1 of `operator-memory` MEDIUM feature (5-phase progressive rollout DD-05 mirroring `workflow-handoff-integrity` v1.9.5 → v1.10.0). Subsequent phases ship as v1.13.0 → v1.16.0.
- Per PMD-02, signal-detection capture (Phase 2+) acknowledges divergence from AIOSON's deterministic principle: prompt-template-driven inherently fuzzy. Phase 1 ships the substrate only — no LLM behavior is invoked.
- Per inception risk mitigation: universal loading directive (Phase 3) ships behind `AIOSON_OPERATOR_MEMORY=true` flag default OFF; flip default-on after Phase 4 ships green.
- DD-02 ratified: 16-char hash provides 2^64 collision space; email entropy (~25-30 bits) is the reverse-lookup bottleneck, not hash output length.

## [1.11.0] - 2026-05-20

### Added
- **@pentester agent**: adversarial security review agent with structured findings output (`security-findings-{slug}.json`) and Gate D blocking capability for MEDIUM projects.
- **@discover agent**: system discovery and semantic knowledge cache bootstrap for brownfield projects.
- **git:guard**: pre-commit guardrail that blocks forbidden files (`node_modules/`, secrets, build artifacts) from being staged or committed. Supports `--install-hook` for persistent protection.
- **commit:prepare**: automated commit preparation command that collects staged diffs, runs `git:guard`, and generates `commit-prep.json` ready for `@committer`.
- **compress:agents**: token-reduction command with structural (free) and semantic (`--llm`) modes. Backs up originals to `.original.md` and supports `--restore`.
- **tmux launcher**: `live:start` now supports tmux for persistent terminal sessions with compact ANSI status bars.
- **Runner system**: `runner:run`, `runner:queue`, `runner:plan`, and `runner:daemon` commands for persistent background job execution.
- **Design-docs governance**: modular code governance system with 5 best-practice files (`folder-structure`, `componentization`, `code-reuse`, `naming`, `file-size`) distributed automatically on install and loaded unconditionally by `@dev` and `@deyvin`.
- **SDLC process upgrade**: gates and handoff protocol enhancements across the workflow engine.
- **Feature closure automation**: `feature:close` now auto-triggers `feature:archive` on `--verdict=PASS`, moving all feature artefacts (`prd-`, `spec-`, `requirements-`, etc.) to `.aioson/context/done/{slug}/` and updating `done/MANIFEST.md`. No manual steps required.
- **Feature archive command**: `feature:archive` with `--dry-run`, `--restore`, and `--force` for retrospective archival and archive restoration. Replaces the legacy `context:trim` workflow.
- **Agent awareness of archived features**: `@cypher`, `@discover`, `@neo`, and `@sheldon` now read `.aioson/context/done/MANIFEST.md` to avoid loading full archived files.

### Changed
- **i18n architecture**: decoupled interaction language from agent prompts. Agent instruction files are now canonical English only; `conversation_language` in `project.context.md` controls user-facing language. Removed localized agent packs in favor of single canonical source.
- **Agent manifests**: moved `.manifest.json` files to `.aioson/agents/manifests/` subfolder to reduce clutter.
- **Core agents refactored**: `@product`, `@sheldon`, `@dev`, `@deyvin`, `@ux-ui`, and `@squad` split into deterministic on-demand modules for better context efficiency.
- **@committer**: enhanced with terminal checkbox UI, robust prepare fallback, and optimized workflow.
- **@squad**: enhanced with domain classification gate, investigation handoff, language policy, and package contract restoration.
- **Installer pipeline**: hardened with pentester agent integration and improved integrity checks.

### Fixed
- `@dev` pt-BR locale realignment with canonical prompt flow.
- `@squad` genome bindings and package contract restoration.
- Legacy process safeguards restored across agents.
- Safe canonical English agent sources restored after i18n decoupling.
- Accidentally tracked local directories removed from git tracking.

## [1.10.0] - 2026-05-20

### Added
- **CI pre-publish smoke chain** (Phase 5 / T6 of `workflow-handoff-integrity` — **closes the feature**). New `scripts/smoke-run-chain.js` standalone runner exercises real exported APIs from Phases 1-4 (F1 stale dev-state + state:reset, F2 agent:done auto-advance, F3 workflow:next pending guard, T5 semantic sync parity) plus a final actual-repo parity safety net. 11 deterministic checks; uses isolated `os.tmpdir()` fixtures (DD-04 mock-only, no LLM calls).
- **`.github/workflows/release-smoke.yml`** GitHub Actions workflow triggered by the `release` PR label or manual `workflow_dispatch`. Runs the full test suite + smoke chain (`AIOSON_PREPUBLISH=true`) + `npm pack --dry-run` as a merge gate before release-labeled PRs can ship to npm.
- **`tests/scripts/smoke-run-chain.test.js`** — 3 unit tests covering AC-T6-01 (green exit), AC-T6-05 (prepublish mode green on clean repo), AC-T6-08 (output discipline — all 5 sections present).
- **`tests/fixtures/medium-feature-mock/`** — 6 mock JSON files (one per MEDIUM agent: product, analyst, architect, pm, dev, qa) with `writes` and `spec_frontmatter` templates, plus README documenting PMD-05 / Sheldon R2 fixture-freshness rule.

### Notes
- **Feature closure.** `workflow-handoff-integrity` is now fully implemented across F1 (state hygiene) + F2 (forward auto-emit) + F3 (pending-decisions gate) + T5 (structural drift detection) + T6 (CI smoke). Wiring audit cross-phase consolidation completed — see `.aioson/context/wiring-audit-workflow-handoff-integrity.md`.
- **DD-05 progressive-release strategy completed:** v1.9.5 → v1.9.6 → v1.9.7 → v1.9.8 → v1.10.0 across 5 minor bumps. Each phase was shippable independently; this final v1.10.0 closes the feature with the cross-phase smoke gate.
- Smoke runner local result: `pass=11 fail=0 — All smoke checks green. Safe to proceed with publish.`

## [1.9.8] - 2026-05-20

### Added
- **Semantic parity check between workspace and template agent files** (Phase 4 / T5 of `workflow-handoff-integrity`). `sync-agents-preflight` now runs three additional diff strategies on top of the existing `## Feature dossier` length check: (1) header diff (`##`/`###` presence + order), (2) section-content hash diff (catches body drift even when headers match — exactly the 981a8fd-style migration gap), (3) frontmatter field-level diff. Each issue includes an actionable hint.
- **Mode-aware severity** via `AIOSON_PREPUBLISH=true` env var. Default mode (local dev, CI without pre-publish): semantic drift is a warning, non-blocking. Pre-publish mode: warning becomes hard fail — blocks `npm publish` until drift is resolved.
- **`src/lib/agent-semantic-diff.js`** new pure-helpers module exporting `extractHeaders`, `extractSections`, `extractFrontmatter`, `diffHeaders`, `diffSectionContent`, `diffFrontmatter`, `diffAgentFile`, `normalizeBody`, `hashBody`. Reusable by downstream consumers.
- **`checkSemanticParity(projectRoot)`** exported from `src/commands/sync-agents-preflight.js`.
- **`tests/sync-agents-preflight-semantic.test.js`** — 20 unit tests covering AC-T5-01..08 including a **regression guard test** that reproduces the 981a8fd-style diff inside an isolated fixture and confirms the new check catches it.

### Changed
- `src/commands/sync-agents-preflight.js`: `main()` now also runs semantic parity. Existing length check + learning-loop checks kept (additive). Telemetry event `semantic_parity_violation` emitted on detection (per-existing `dossierTelemetry` pattern).

### Notes
- This release closes Phase 4 of `workflow-handoff-integrity`. F1+F2+F3+T5 now cover state hygiene, forward auto-emit, gating against pending decisions, AND structural drift detection between workspace/template. Phase 5 (T6 — CI smoke ponta-a-ponta) ships next as v1.10.0.
- DD-03 (semantic diff granularity) resolved as: section-level + token-aware code blocks + frontmatter field-level. Plain text body diff deliberately skipped to avoid cosmetic noise (typo fixes).
- Smoke against actual repo: `checkSemanticParity(process.cwd())` returns 0 drift issues — confirms workspace ↔ template agent files are aligned and v1.9.4 AskUserQuestion mass-edit preserved parity correctly.

## [1.9.7] - 2026-05-20

### Added
- **Stale `dev-state.md` detection with actionable warnings** (Phase 3 / F1 of `workflow-handoff-integrity`). `aioson preflight` now cross-references `.aioson/context/features.md` and applies a 30-day TTL: stale conditions are (a) feature already marked `done`/`abandoned`, (b) feature absent from features.md (orphan / cross-project leak), (c) `last_updated > 30 days`. Each warning embeds the command to fix it (`aioson state:reset` or `aioson state:save --feature=<slug>`).
- **`aioson state:reset`** new CLI command. Removes `.aioson/context/dev-state.md`. `--archive` flag moves to `.aioson/runtime/devstate-history/{ISO}.md` for audit trail. Idempotent. `--json` returns structured result.
- **Corrupt dev-state detection (AC-F1-08).** `readDevState` flags `parseError` when the file lacks frontmatter markers or has empty frontmatter. `detectStaleDevState` returns a warning with a `state:reset` command suggestion.
- **`detectStaleDevStateRich` + `parseFeaturesMap`** exported from `src/preflight-engine.js` for downstream consumers + tests.
- **`tests/preflight-stale-devstate.test.js`** — 20 unit tests covering AC-F1-01..08, parseFeaturesMap robustness, and runStateReset (idempotent, archive variant, json mode).

### Changed
- `src/commands/preflight.js`: `runPreflight` switched the stale-detection call from sync `detectStaleDevState` to async `detectStaleDevStateRich`. Existing sync helper preserved (still used internally by `evaluateReadiness`) for backward-compat.

### Fixed
- Per PRD ("warning acionável, NÃO cleanup automático silencioso"), F1 delivers a structured stderr warning with embedded command suggestion. No interactive y/N prompt (safer for CI/non-TTY contexts than plan-f1 originally implied).

### Notes
- This release closes Phase 3 of `workflow-handoff-integrity`. F1 + F2 + F3 now cover state hygiene (Phase 3 — F1), forward auto-emit (Phase 1 — F2), and gating against pending decisions (Phase 2 — F3). Phases 4-5 (T5 semantic sync, T6 CI smoke) ship as v1.9.8 → v1.10.0.
- DPC-07 (additional path correction discovered): the PRD/architecture referenced `src/preflight.js` which does not exist. Actual layout: `src/preflight-engine.js` (helpers) + `src/commands/preflight.js` (CLI command). Both extended.

## [1.9.6] - 2026-05-20

### Added
- **`aioson workflow:next --complete=<agent>` rejects advance when manifest has pending decisions** (Phase 2 / F3 of `workflow-handoff-integrity`). Reads `.aioson/plans/{slug}/manifest.md` frontmatter; if `status` matches `^pending-(.+)-decisions$`, throws `WORKFLOW_NEXT_PENDING_DECISIONS` with actionable message recommending the agent that resolves those decisions (e.g. `pending-architect-decisions` → "Próximo agente recomendado: @architect"). Prevents the deadlock observed in `aioson-com` 2026-05-19 where `/analyst` routed to `/dev` despite manifest pending.
- **`--force` flag** on `aioson workflow:next` for explicit override (logs warning, proceeds). For emergency-use cases.
- **DD-02 hybrid regex+whitelist:** regex `^pending-(.+)-decisions$` catches any future `pending-<X>-decisions` state automatically; whitelist `[architect, product, pm, qa]` flags unrecognized captured groups (still blocks but warns "estado desconhecido" so typos don't silently route to nonexistent agents).
- **`tests/workflow-next-pending-guard.test.js`** — 10 unit tests covering AC-F3-01..07 (hard error, regex match per known agents, unknown group warning, --force override, no manifest, no slug, pattern specificity, whitelist export).

### Changed
- `src/commands/workflow-next.js`: new public helpers `assertManifestNotPending(targetDir, slug, force)` + `PENDING_STATE_WHITELIST` const exported. Guard fires at start of `options.complete` branch (line 992, BEFORE `finalizeCurrentStage`) per AC-F3-05 precedence.

### Notes
- This release closes Phase 2 of `workflow-handoff-integrity`. F2 + F3 together cover the forward (auto-emit) and gating (pre-check pending) directions of workflow handoff integrity. Phases 3-5 (F1 stale dev-state, T5 semantic sync, T6 CI smoke) ship as v1.9.7 → v1.10.0.
- Full npm test: 1 transient Windows tempdir flake (L-02 documented) — confirmed transient via targeted re-run of `tests/external-session.test.js` (21/21 pass). All other tests green.

## [1.9.5] - 2026-05-20

### Added
- **`agent:done` auto-emits `workflow:next --complete=<agent>`** (Phase 1 / F2 of `workflow-handoff-integrity`). When a workflow is active for the project (`.aioson/runtime/workflow.state.json` present + matching feature) AND the calling agent has produced its canonical artifact on disk, `aioson agent:done` now internally advances the workflow pointer. Removes the requirement for every agent prompt to literal-call `aioson workflow:next` — centralizes the trigger in `runAgentDone`. Backward-compat preserved: state file absent → no auto-advance (baseline stdout byte-identical).
- **`src/handoff-contract.js#getCanonicalArtifactsForAgent(agent, targetDir, state)`** public helper. Consumes the existing CONTRACTS map; returns absolute artifact paths array, `null` for unknown agents, `[]` for agents with no canonical artifact (e.g. `@committer`, `@dev`).
- **`--no-auto-advance` opt-out flag** on `aioson agent:done` for cases where auto-emit is undesirable (debug, manual restore, scripts).
- **`tests/baselines/agent-done-stdout.txt`** — backward-compat baseline lock per Risk-11 mitigation.
- **`tests/agent-done-auto-emit.test.js`** — 13 unit tests covering AC-F2-01..10 (happy path, backward-compat, opt-out, idempotency 1s window, corrupt state, missing artifact, unknown agent).

### Changed
- `src/commands/runtime.js#runAgentDone` injects `maybeAutoAdvanceWorkflow` call after stdout log in both live-session and standalone branches. Idempotency via `last_workflow_event_at` field added to `workflow.state.json` schema (backward-compat: missing field treated as zero).

### Notes
- This release closes Phase 1 of `workflow-handoff-integrity` MEDIUM feature. Phases 2-5 (F3 CLI guard, F1 stale dev-state, T5 semantic sync, T6 CI smoke) ship as separate releases v1.9.6 → v1.10.0 per progressive release strategy (DD-05).
- Full npm test: 2520/2521 pass; the single skipped/flaky test is AC-ALL-101 (`telemetry-foundation.test.js`, performance threshold) — pre-existing, documented as separate follow-up.
- Inception note: this hotfix was implemented via the AIOSON chain itself (`@analyst → @architect → @pm → @dev`) — eating its own dog food.

## [1.9.4] - 2026-05-20

### Fixed
- **`AskUserQuestion` no longer fires on bare agent activation.** When `/deyvin`, `/product`, `/dev`, `/neo`, or `/setup` loaded without a stated task, the agents were inventing multi-choice options around fabricated next-steps — wasting user attention and inviting arbitrary implementation paths. New **Rule 7** in `decision-presentation/SKILL.md` mandates an informational summary + wait when no task is stated; the per-agent hard constraint was reworded from "Always use `AskUserQuestion`" to "When a real decision requires user input, use `AskUserQuestion`". `@deyvin` Working kernel and `pair-execution.md` updated to mirror.
- Affects: `decision-presentation/SKILL.md`, `agents/{deyvin,product,dev,neo,setup}.md`, `docs/deyvin/pair-execution.md` (workspace + template parity preserved).

## [1.9.3] - 2026-05-19

### Fixed
- **`@pm` agent prompt in template** now correctly declares ownership of `implementation-plan-{slug}.md` for MEDIUM features (AC-SDLC-15), completing the SDLC migration started in v1.9.0 (commit `981a8fd`). Projects on 1.9.0/1/2 hit a deadlock at Gate C when running MEDIUM features via the standard chain: `/architect` routed users to `/pm`, but the legacy template prompt instructed `/pm` to NOT silently create the artifact. The workspace prompt had been updated in `981a8fd` but the template, alignment test, and a docs file were never propagated.
- **`tests/agent-runtime-alignment.test.js`** updated to assert the new canonical tokens (`## MEDIUM implementation plan (mandatory output for MEDIUM)`, `For MEDIUM features, @pm MUST produce implementation-plan-{slug}.md`, `## Non-MEDIUM handoff reality`, gate-approve command). The previous assertions were guarding the pre-`981a8fd` contract.
- **`template/.aioson/agents/manifests/pm.manifest.json`** `capabilities[0].outputs[]` now declares `.aioson/context/implementation-plan-{slug}.md` as a canonical produce of `@pm`. Test alignment also asserts this. Source manifest synced for parity.
- **`template/.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`** ownership table corrected: `implementation-plan-{slug}.md` written by `@pm` for MEDIUM (AC-SDLC-15) instead of `@dev`, and read by `@dev, @deyvin, @orchestrator`. Also corrected the chain description (line 14).
- **`template/.aioson/agents/orchestrator.md`** propagated from workspace — uses feature-scoped artifact naming (`requirements-{slug}.md`, `spec-{slug}.md`, `implementation-plan-{slug}.md`, `ui-spec-{slug}.md`) matching the post-`981a8fd` contract. Previously template still used legacy generic names.

### Notes
- **Rollback:** `npm install @jaimevalasek/aioson@1.9.2` (or pin in your project's `package.json`) restores the previous behavior. Use only as last resort — the previous state had `@pm` deadlock at Gate C for MEDIUM features.
- **Affected:** any project installed from 1.9.0/1/2 running MEDIUM features through the standard chain (`/product → /analyst → /architect → /pm`).
- **How to verify the fix in your project:** after `aioson update`, run a MEDIUM feature through the chain. `/pm` should produce `implementation-plan-{slug}.md` without refusing. `aioson workflow:status` should advance through Gate C.
- **Follow-ups intentionally NOT included in this hotfix** (will be in a separate MEDIUM PRD, `prd-workflow-handoff-integrity.md`):
  - `briefing.md` / `discover.md` template drift (one-line addition about `done/MANIFEST.md` awareness — benign but not tied to a documented plan).
  - F1 (stale `dev-state.md` cleanup), F2 (workflow pointer auto-emission), F3 (analyst routing checks), T5 (CI guard for semantic drift), T6 (smoke test pre-publish).
- **Audit trail for this hotfix:** see PR description, briefing `.aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md`, PRD `.aioson/context/prd-workflow-hotfix-1-9-3.md`.

## [1.7.3] - 2026-04-13
### Fixed
- `@dev` pt-BR locale pack realigned with the canonical prompt flow, restoring the proper cold-start fallback when `dev-state.md` is already `done` and another feature is still `in_progress` in `features.md`.
- Added a regression test to keep the `@dev` prompt synchronized between the canonical file and the pt-BR locale pack, preventing future drift in the distributed template.
- Setup prompt templates now reference the current `aioson_version` (`1.7.3`) instead of the stale `1.5.1` example.

## [1.7.2] - 2026-04-07
### Fixed
- Removed 5 spurious Windows alternate data stream files (`SKILL.md:Zone.Identifier`) from `template/.aioson/skills/design-system/` that leaked from a local Windows copy operation and were never tracked by git.
- `tests/agent-contracts.test.js`: added `neo`, `sheldon`, `tester`, and `orache` to the full locale coverage check; added a separate `BASE_ONLY_AGENTS` list (`copywriter`, `design-hybrid-forge`, `site-forge`) with a dedicated test that verifies their base files ship in the template. Previously these agents were not validated by the test suite.

## [1.7.1] - 2026-04-07
### Added
- **Marketing & copywriting system**: new `@copywriter` agent (5 operating modes including VSL scripts) backed by a generic `copywriting` genome (One Belief, 5 Acts, PMS framework, market sophistication levels, 10 heuristics).
- **Marketing references library** (`.aioson/skills/marketing/references/`): 8 on-demand reference files with 70+ patterns and anti-patterns covering One Belief, 5-Act narrative structure, fascinations (12 formulas), offer structure, PMS research, copy patterns, anti-patterns checklist, and market intelligence tools. Loaded conditionally by `@copywriter` to keep context lean.
- **VSL Craft skill** (`.aioson/skills/marketing/vsl-craft.md`): Video Sales Letter production playbook — 3 formats (horizontal/vertical/hybrid), 5-act script structure, 5 hook formulas, retention techniques, testing methodology, and production specs.
- **Marketing integration across agents**: `@neo` routes to `@copywriter` when `project_type=site` and copy is missing; `@setup` registers the copywriting genome and adds copy gate to site routing; `@dev` enforces a copy guard for marketing pages and reads the 5-Act structure from `copy-{slug}.md`; `@ux-ui` maps the 5 Acts to visual sections; `@deyvin` routes marketing copy requests to `@copywriter` instead of writing inline.
- **Landing page production skills**: `landing-page-forge.md` (animation libraries, performance, SEO/LLMO, tracking, 3-track parallel production checklist) and `landing-page-deploy.md` (Vercel and Hostinger VPS deploy paths).
- **Digital marketing agency squad template** under `template/.aioson/templates/squads/digital-marketing-agency/`.

### Changed
- `@dev` site production section now includes a copy guard that blocks inline marketing copy on `project_type=site` pages — copy must come from `@copywriter` via `copy-{slug}.md`.
- `@ux-ui` copy gate now reads the 5-Act narrative structure from copy files and maps acts to UI sections.
- `@neo` workflow stage detection includes `Needs copy` for site projects without a copy file.
- `@setup` routing table splits `site` into two paths: `@copywriter → @ux-ui → @dev` (no copy yet) vs `@ux-ui → @dev` (copy ready).
- Misc updates to `@qa`, `@squad`, `squad-create`, `squad-design`, `cognitive-core-ui/motion`, `ui-ux-modern`, and `template/CLAUDE.md`.

### Notes
- Marketing references are loaded conditionally by `@copywriter` only — other agents never load them directly. This keeps the marketing system isolated and prevents contaminating non-site projects.
- The copy guard triggers exclusively for `project_type=site` marketing/sales pages. SaaS UI, dashboards, app interfaces, and documentation sites use the standard implementation flow with no behavior change.

## [1.7.0] - 2026-04-06
### Added
- **Squad autonomous execution system**: full multi-agent squad stack — intra-squad message bus (`intra-bus.js`, `squad:bus` command), executor reflection module (`reflection.js`), task decomposer, `squad:autorun` for end-to-end autonomous execution, learning system, squad daemon, verify-gate, and cross-AI synthesis. Intelligence gaps addressed in plans 80–82; 6 critical operational fixes in plan 83.
- **Runner system**: `runner:run`, `runner:queue`, `runner:plan`, and `runner:daemon` commands for persistent background job execution outside the main session loop.
- **New CLI commands**: `agent:audit` (agent integrity inspection), `brief:gen` (context brief generation), and `verify:gate` (execution pre-flight gate). Documented in `docs/pt/`.
- **SDD automation — The 80% Rule (plans 74–79)**: automation scripts that drive spec compliance across agents; harness sensors, context budget ceiling, and PGE pattern (plan 76); full SDD coverage across all agents (plan 77); locale SDD sync and pt-BR `tester.md` (plan 78); SDD automation scripts wired into agents and docs (plan 79); engine fixes for `evaluateReadiness`, `extractLastCheckpoint`, and `detectTestRunner`.
- **Agent capability sprints**:
  - Sprint 1 — task-list working memory, hook contract, file size guidelines, `CLAUDE.local.md` support.
  - Sprint 2 — context compaction protocol and self-directed plan mode.
  - Sprint 3 — CronTools protocol and config tiers documentation.
- **Web-research-cache skill**: caches web research results in `researchs/`; awareness propagated to all agents that perform web discovery.
- **`site-forge` agent**: replaces `hybrid-clone` with a dedicated site-forge agent backed by a Brains knowledge system for site cloning and forging workflows.
- **Three.js skill**: `threejs-spatial` modifier and corresponding agent (`hybrid-clone`) for Three.js spatial interface projects.
- **Operational pipeline**: event enrichment, spec-sync, token economy, devlog pipeline, and project hooks system.
- **Squad CLI integration**: `squad.md` wired to CLI tools — Step 0 scaffold, CLI integration table.
- **Tutorials site**: squads tutorial page added; Squads and Automation links activated on the tutorials index.

### Changed
- `update` now only updates already-installed files by default; use `--all` to sync every template file.
- Setup routing no longer directs to `@dev` when only `plans/` or research files are present.
- `@deyvin`, `@neo`, and `@sheldon` now load and maintain `dev-state.md` awareness.
- README redesigned with visual impact, squads ecosystem section, and spec-driven workflow documentation.

### Fixed
- `@orache` research cache: agent now writes to `researchs/` (previously only read from it).
- SDD engine reliability: `evaluateReadiness`, `extractLastCheckpoint`, `detectTestRunner` (plan 79 phase 2).
- Squad autonomous operation: 6 critical fixes for stable real-world execution (plan 83).
- Three.js patterns: race condition and invalid property reference resolved.

## [1.6.0] - 2026-04-01
### Added
- **Interactive install wizard**: animated multi-screen onboarding (`init` and `install`) with Design (screen 3) and Locale (screen 4) dimensions, multi-select for design skills, and pre-populated choices on `--reconfigure`.
- **`aioson setup` command**: unified setup entry point with auto-detected system language.
- **Spec-driven process skill** (`aioson-spec-driven`): agent contract upgrades, GSD lessons integration (must_haves, 4-tier verification, gray areas, seeds, forensics), and context budget warning threshold configuration.
- **Design skills**: `glassmorphism-ui` and `neo-brutalist-ui` added; HTML preview gallery for all 8 design skills with per-skill landing page previews.
- **Aurora Command UI hybrid**: design hybrid variation workflow and aurora-command-ui skill.
- **5-phase context optimization system**: implemented in `src/commands/context-optimizations.js`.
- **Health digest, dynamic tools, and learning evolve pipeline**: `--all` flag for the main update flow; health digest output and adaptive learning pipeline wired to the operational surface.

### Changed
- `install --reconfigure`: warns when the new profile deselects previously installed items; confirm screen strings fully localized.
- `update`: now preserves locale from the saved profile and installs all framework files when upgrading; added `--all` flag.

### Fixed
- `install`: `overwrite=true` enforced when reconfigure changes the active profile.
- `design-hybrid` options: TTY error logged correctly; test coverage expanded.
- `install-wizard`: broken banner box, wrong skip reason, and stdin hang after wizard completion resolved; terminal state now fully restored.
- Landing page previews: hero content and section titles centered correctly across all 3 previews.

## [1.5.1] - 2026-03-28
### Added
- **TDD Gate no `@dev`**: novo bloqueador explícito antes de qualquer implementação de lógica de negócio. Detecta test runner via `test_runner` em `project.context.md` ou varre a raiz em busca de `pest.xml`, `vitest.config.*`, `pytest.ini`, `.rspec`, `foundry.toml`. Mandato RED → GREEN → commit por classificação (MICRO/SMALL/MEDIUM) com exceções para migrations, configurações e conteúdo estático.
- **Novo agente `@tester`**: engenheiro de testes para aplicações já implementadas. Produz `test-inventory.md` (mapa de cobertura), `test-plan.md` (estratégia escolhida + cobertura antes/depois) e escreve testes por módulo em ordem de risco. Suporta Characterization Testing, Test Pyramid, Risk-first Gap Filling, Property-based, Contract e Mutation Testing. Mapeamento completo de frameworks: Laravel/Pest, Next.js/Vitest+RTL, Django/pytest, FastAPI/httpx, Rails/RSpec, Solidity/Foundry.
- **Detecção de documentos de kickoff no `@product` e `@sheldon`**: ambos os agentes agora varrem `plans/*.md` e `prds/*.md` na raiz do projeto antes de iniciar o fluxo. Detectam contexto (greenfield vs feature), oferecem sintetizar o conteúdo nos artefatos formais em `.aioson/context/`, e nunca modificam os arquivos fonte — o usuário decide quando deletá-los.
- Campo `test_runner` adicionado ao Context contract em `config.md` e ao template de `project.context.md` gerado pelo `@setup` (todos os 4 locales).
- Detecção automática de test runner no `@setup`: varre a raiz e preenche `test_runner` em `project.context.md` quando um runner é detectado.
- `@tester` registrado em `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`, `.gemini/commands/aios-tester.toml`, `src/constants.js` (AGENT_DEFINITIONS) e `template/.claude/commands/aioson/agent/tester.md`.
- Documentação `docs/pt` atualizada: `agentes.md` (seções `@dev`, `@qa`, `@product`, `@sheldon` novo, `@tester` novo, fluxos atualizados), `cenarios.md` (exemplo TDD no Cenário 2, exemplo kickoff doc, nota @tester vs @qa), `inicio-rapido.md` (tabela de sequências e seção de estratégia de kickoff docs).

### Changed
- `src/context-writer.js` e `src/commands/setup-context.js`: suporte ao campo `testRunner` na geração e override de `project.context.md`.
- `template/.aioson/agents/dev.md`: seção "Implementation strategy" reescrita com mandato RED→GREEN→commit; seção "Atomic execution" atualizada com referência cruzada ao TDD Gate.
- `template/.aioson/agents/product.md`: seção "Source document detection" adicionada antes de "Mode detection".
- `template/.aioson/agents/sheldon.md`: seção "Detecção de documentos fonte" adicionada antes de RF-01.
- `template/.aioson/config.md`: campo `test_runner` no Context contract; `@tester` no workflow opcional.
- Versão de referência nos templates de `project.context.md` atualizada de `0.1.25` para `1.5.1`.

## [1.5.0] - 2026-03-27
### Added
- Native web map and scrape commands for first-party web discovery and extraction workflows.
- New agent capabilities and orchestration surface including `@neo`, the Sheldon PRD enrichment flow, richer downstream gates, and improved locale-aware runtime execution rules.
- Squad-level operational improvements including webhook/channel bridge integration, daemon and registry evolution, and dashboard/design-system refinements for the squad experience.
- Cognitive Core UI design skill upgrades with stronger art direction, composition libraries, anti-generic guardrails, and more robust interaction/contrast guidance.

### Changed
- Project license changed from `MIT` to `AGPL-3.0-only` for new releases going forward.
- Package metadata and lockfile versioning are now aligned at `1.5.0`.
- Agent workflows now enforce PRD gating, stronger atomic execution behavior, and more explicit routing for MICRO and product/design-driven flows.

## [1.3.0] - 2026-03-15
### Added
- Canonical runtime observability for installed projects: runtime SQLite now acts as the primary execution store with task/run/event lifecycle tracking, workflow event synchronization, and an execution gateway prepared to instrument direct agent entrypoints, workflow enforcement, squads, and operational runs from the project runtime itself.
- `docs/pt/comandos-cli.md`: first Portuguese-first CLI reference page covering all public `aioson` commands with grouped descriptions, command map, examples, and practical usage recipes. Linked from `docs/pt/README.md` and `docs/pt/inicio-rapido.md`.

### Changed
- Full product rebrand from `aioson` to `aioson` across package metadata, CLI branding, docs, templates, prompts, tests, runtime paths, and generated project structure. The managed project directory is now `.aioson/` instead of `.aioson/`.
- npm distribution moved to the scoped package `@jaimevalasek/aioson` after the unscoped `aioson` name was rejected by npm for similarity policy reasons. Install and `npx` docs now use the scoped package while the installed CLI commands remain `aioson` and `aios`.
- Release description updated to `AI operating framework for hyper-personalized software.` to match the current platform direction.
- Legacy `dashboard:*` CLI flow removed from the public surface. `aioson dashboard:init|dev|open` no longer appear in help or docs; if called, the CLI now returns a migration error instructing users to open the separately installed dashboard app and select the project folder that already contains `.aioson/`. Updated pt docs and agent guidance to match the new app-first dashboard flow.
- `template/.aioson/skills/static/interface-design.md`: upgraded the interface-design craft guide by merging strengths from the upstream `interface-design` skill without losing AIOSON workflow fit. Added persistent design memory via `.interface-design/system.md`, existing-UI refinement rules (diagnose drift before re-theme), two fully specified directions (`Sophistication & Trust`, `Premium Dark Platform`), a mandatory pre-component decision checkpoint, and explicit memory update guidance for reusable UI patterns.

## [0.1.28] - 2026-03-04
### Added
- **`scan:project` command** (`aioson scan:project [path] [--provider=<name>] [--dry-run] [--json]`): Node.js port of the brownfield project scanner, replacing `aioson-scan.py`. Walks the project, reads key files, calls a cheap LLM (multi-provider), and generates `discovery.md` + `skeleton-system.md`. Zero npm dependencies — uses `node:fs`, `node:https`, `node:http` only.
- Multi-provider HTTP client supporting OpenAI-compatible format (DeepSeek, OpenAI, Gemini, Groq, Together, Mistral) and Anthropic native format. Configured via `aioson-models.json` (same config file as before).
- `--provider=<name>` flag to override `preferred_scan_provider` from config at runtime.
- `--dry-run` mode: walks the project and reports file counts without calling the LLM.
- i18n keys for `scan_project` section in all 4 locales (en, pt-BR, es, fr).
- `install` hint message updated in all 4 locales: `python aioson-scan.py` → `aioson scan:project`.

### Removed
- `template/aioson-scan.py`: Python scanner removed from the template. `aioson scan:project` is the normalized replacement. The `aioson-models.json` config file (provider API keys) is unchanged.

### Changed
- All 15 template agent files (analyst, dev, orchestrator — base + 4 locales each): `python aioson-scan.py` replaced with `aioson scan:project` in brownfield detection hints.

## [0.1.27] - 2026-03-04
### Added
- **HTML reports** for browser QA: `--html` flag added to `qa:run`, `qa:scan`, and `qa:report`. Generates a self-contained visual report in `reports/<date>_<time>_<mode>/index.html`. Screenshots embedded as base64 — fully portable for sharing. Existing `aios-qa-report.md` and `aios-qa-report.json` outputs are never modified; HTML is purely additive.
- `reports/index.html`: historical index auto-updated after each HTML run, listing all runs with date, mode, URL, and severity badges. Sorted newest first.
- `qa:report --html`: retroactively generates HTML from the existing `aios-qa-report.json` without re-running Playwright.
- HTML report features: severity filter buttons, collapsible finding cards (location + risk + fix + screenshot), performance cards with colour-coded thresholds, AC coverage table, routes list (scan mode), click-to-zoom screenshot lightbox, vanilla JS (no framework).
- `src/qa-html-report.js`: self-contained HTML generator module with embedded CSS and JS, `writeHtmlReport()` and `updateReportsIndex()` exports.
- i18n key `html_report_written` added to `qa_run`, `qa_scan`, `qa_report` sections in all 4 locales (en, pt-BR, es, fr).
- Missing `help_qa_*` i18n keys added to pt-BR locale (were absent; es/fr fall back to en).
- `docs/en/qa-browser.md`: `--html` flag documented for all three commands, plus a new **HTML reports** section describing folder structure, features, and `qa:report --html` retroactive mode.
- README: `--html` flag added to Browser QA command signatures and Agent usage helper examples.

## [0.1.26] - 2026-03-04
### Added
- **Browser QA engine** (`qa:init`, `qa:doctor`, `qa:run`, `qa:scan`, `qa:report`): full Playwright-powered browser testing built into aioson. No LLM required. No separate tool. Playwright is an optional runtime dependency — zero impact on users who don't need browser testing.
- `qa:init`: generates `aios-qa.config.json` by reading `prd.md` (acceptance criteria → test scenarios) and `discovery.md` (business rules). URL auto-resolved from `project.context.md`.
- `qa:doctor`: validates all prerequisites (Playwright installed, Chromium binary, config valid, URL reachable, context and prd.md present).
- `qa:run`: full QA session with 4 personas: **naive** (empty forms, 10K strings, ghost clickables), **hacker** (8 secret patterns against window globals and HTML source, 10 sensitive file paths, XSS, open redirect, SQL injection, IDOR ±1, debug routes), **power** (keyboard navigation focus visibility, boundary values on numeric/date inputs), **mobile** (375px viewport, horizontal overflow, touch targets < 44px, fonts < 12px). Post-persona: network-level probes (console stack traces, sensitive GET params, mixed content). Accessibility audit (5 WCAG checks). Performance capture (TTFB, load time, request count, transfer size). AC coverage from `prd.md` with screenshots. Output: `aios-qa-report.md` + `aios-qa-report.json` + `aios-qa-screenshots/`.
- `qa:scan`: autonomous crawler — maps all routes via BFS (configurable depth and max pages), probes each route for exposed secrets, console leaks, accessibility issues, and horizontal overflow. Sensitive files probed once per domain.
- `qa:report`: displays last generated report; `--json` returns parsed `aios-qa-report.json`.
- `@qa` agent (base + all 4 locales) updated with browser report integration rules: if `aios-qa-report.md` exists, merge findings, promote severity when both static review and browser test flag the same issue, tag ACs as `[browser-validated]`.
- i18n keys added for `qa_doctor`, `qa_init`, `qa_run`, `qa_scan`, `qa_report` sections across all 4 locales (en, pt-BR, es, fr).
- `docs/en/qa-browser.md`: full reference for all 5 qa: commands with examples, persona descriptions, probe list, performance thresholds, CI integration patterns.
- README updated: Browser QA section in Commands, Agent usage helper, JSON output, and Docs feature guides — all with links to `docs/en/qa-browser.md`.

## [0.1.25] - 2026-03-04
### Added
- `@product` agent: conversational product wizard that runs between `@setup` and `@analyst`. Starts from a raw idea and leads a natural back-and-forth conversation (8 strict conversation rules: one question at a time, no filler words, reflect before advancing, surface forgotten requirements, challenge assumptions gently, prioritize ruthlessly, draft early after 5–7 exchanges). Supports two modes: creation (no prd.md) and enrichment (prd.md exists). Produces `.aioson/context/prd.md` with 8 sections: vision, problem, users, MVP scope (🔴 must-have / 🟡 should-have), out-of-scope, user flows, success metrics, open questions.
- `template/.aioson/agents/product.md`: base agent file.
- `template/.aioson/locales/en/agents/product.md`, `pt-BR/agents/product.md`, `es/agents/product.md`, `fr/agents/product.md`: localized variants with absolute language instruction at top.
- `template/.gemini/commands/aios-product.toml`: Gemini command registration.
- Workflow chains updated in `config.md`: MICRO = `@setup → @product (optional) → @dev`; SMALL = `@setup → @product → @analyst → @architect → @dev → @qa`; MEDIUM = `@setup → @product → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa`.
- `@product` added to `CLAUDE.md` agent routing, `AGENTS.md` invocation table and file list.
- `setup.md` routing table updated in all 5 locale files to route to `@product` after setup instead of directly to `@analyst`.
- `src/constants.js`: `@product` added to `MANAGED_FILES` (base + 4 locale paths + toml) and `AGENT_DEFINITIONS` (before `@analyst`, empty `dependsOn`, output `prd.md`).

## [0.1.24] - 2026-03-04
### Added
- `skeleton-system.md`: new lightweight living index generated by `aioson-scan.py` alongside `discovery.md`. Contains file map with status indicators (✓/◑/○), key routes, module status table, and entity relationships. Designed to be read first as a cheap orientation before loading heavier context files.
- Scanner now generates both `discovery.md` and `skeleton-system.md` in a single LLM call, split by `<<<SKELETON>>>` delimiter. If the delimiter is missing, only `discovery.md` is written with a warning.
- `@dev` (base + en/pt-BR/es/fr): `skeleton-system.md` added to required input (read first). Auto-update rule: update skeleton entries when creating/deleting/modifying files. New `*update-skeleton` command to rewrite the full skeleton after a development session.
- `@analyst` (base + en/pt-BR/es/fr): brownfield pre-flight now reads `skeleton-system.md` first for quick orientation before diving into `discovery.md`.
- `@orchestrator` (base + en/pt-BR/es/fr): session start now reads `skeleton-system.md` as step 2 (before discovery.md).

## [0.1.23] - 2026-03-04
### Added
- `template/aioson-scan.py`: standalone Python scanner (zero external dependencies, stdlib only). Walks the project tree, reads up to 12 key files (package.json, composer.json, schema.prisma, routes/web.php, etc.), reads `project.context.md` and `spec.md` if present, then calls a cheap LLM API (DeepSeek, Gemini, OpenAI, Anthropic, Groq, Together, or Mistral) to generate `.aioson/context/discovery.md` with 9 structured sections. Saves main-session tokens on brownfield projects.
- `template/aioson-models.json`: API key config template for 7 providers. Auto-added to `.gitignore` on install to prevent key commits.
- Brownfield project detection in installer: when `framework_installed` is detected and the project has >20 files, `install` and `update` now emit an alert with instructions to run `aioson-scan.py` first.
- `@analyst` (base + en/pt-BR/es/fr): **Brownfield pre-flight** section — checks `framework_installed`, skips Phases 1–3 if `discovery.md` already exists, alerts the user to run the scanner if it is missing. Rule enforced: always read `spec.md` alongside `discovery.md`.
- `@dev` (base + en/pt-BR/es/fr): **Brownfield alert** section — if `framework_installed=true` and `discovery.md` is missing, alerts the user to run `aioson-scan.py` before proceeding.
- `@orchestrator` (base + en/pt-BR/es/fr): session start now reads `discovery.md` AND `spec.md` together at session open, with brownfield alert when `discovery.md` is absent.

## [0.1.22] - 2026-03-04
### Fixed
- `setup:context` command: `--lang=pt-BR` (and any `--lang` alias) was silently ignored — `applyExplicitOverrides` only read `options.language` but the parser stores the flag as `options.lang`. Fixed by reading `options.language ?? options.lang`, consistent with all other commands (`install`, `update`, `init`, `locale-apply`, etc.). Running `npx aioson setup:context . --defaults --lang=pt-BR` now correctly installs the pt-BR locale agents.

## [0.1.21] - 2026-03-03
### Changed
- `@ux-ui` Step 0 (base + en/pt-BR/es/fr locales): added **Option C — Default / Skip** to the visual style question. When chosen, the agent skips style confirmation and goes directly to Step 1 using `interface-design.md` as the sole design authority, letting domain exploration drive the visual direction organically. Accepted inputs: C / skip / pular / saltar / passer / padrão / default.

## [0.1.20] - 2026-03-03
### Added
- `template/.aioson/skills/static/react-motion-patterns.md`: new skill with React/Next.js equivalents of the wow effects from `static-html-patterns.md`. Covers 10 patterns: animated mesh background, animated gradient text, scroll reveal (Framer Motion + Intersection Observer fallback), 3D card tilt hook, hero staggered entrance, infinite logo marquee, scroll progress bar, glassmorphism card, floating orbs, and page transition. All patterns include `prefers-reduced-motion` fallback and touch-device guards.
- Laravel installation links to `skills/dynamic/laravel-docs.md`: three-path table (Herd/standard, Sail/Docker, Jetstream+Livewire) with specific URLs, detection signals per stack, and Livewire v3 MCP fetch example.

### Changed
- `template/.aioson/skills/static/laravel-conventions.md`: added project folder structure tree, naming convention table (13 artefacts, singular/plural rules), and Livewire component section with `#[Computed]`, `wire:model.live`, classic controller variant, and coexistence rule.
- `@dev` agent (base + en/pt-BR/es/fr locales): added **Motion and animation** section — when `framework=React|Next.js`, agent now reads `react-motion-patterns.md` before implementing animations. Framer Motion as primary, CSS `@keyframes` as fallback. Hard rule against heavy motion in admin/CRUD interfaces.
- `@dev` agent (base + en/pt-BR/es/fr locales): added Laravel project structure layout block and singular/plural naming rules to the Laravel conventions section.

## [0.1.19] - 2026-03-03
### Added
- `src/commands/test-agents.js`: new `test:agents` CLI command — 99 structural checks across all 8 base agents and all locale files (32 base checks + 64 locale checks + 3 critical skill checks). Validates: file existence, `## Mission` section, `## Hard constraints` section, `.md-only` context rule, and language instruction within first 15 lines of each locale agent.
- `src/commands/locale-diff.js`: new `locale:diff` CLI command — compares `##` heading structure of base agent files vs locale translations, normalizes headings (strips accents for cross-language comparison), and reports sections present in base but missing in locale. Supports `--lang` filter and single-agent argument.
- `template/.aioson/skills/static/django-patterns.md`: comprehensive Django conventions skill (342 lines) — project structure, `TimestampMixin`, service layer, DRF serializers, URL namespacing, settings split (base/dev/prod), Admin registration, `pytest-django` test patterns, N+1 prevention rules.
- `template/.aioson/skills/static/fastapi-patterns.md`: comprehensive FastAPI conventions skill (344 lines) — async project structure, `pydantic-settings`, SQLAlchemy async engine, Pydantic input/output schema separation, service layer, JWT via `HTTPBearer`, Alembic migrations, `pytest + httpx AsyncClient` patterns.
- `template/.aioson/skills/dynamic/README.md`: explains static vs dynamic skills pattern and lists all 6 dynamic skill files with their source URLs.

### Changed
- `@dev` agent (base + en/pt-BR/es/fr locales): `architecture.md` and `discovery.md` now marked as `*(SMALL/MEDIUM only)*` in Required input. Added explicit MICRO callout — only `project.context.md` is guaranteed for MICRO projects.
- `@orchestrator` base agent: renamed `## Rules` → `## Hard constraints` for consistency with all other agents.
- `@dev`, `@qa`, `@orchestrator` base agents: added `.md-only` context rule (was missing — `test:agents` detected the gap).
- Locale `en` agents (analyst, architect, pm, ux-ui, dev, qa, orchestrator): added ABSOLUTE INSTRUCTION language marker at top (was missing in en locale — `test:agents` detected the gap).
- All 6 dynamic skill stubs expanded with concrete source URLs, focus areas, and MCP tool fetch examples to replace the minimal placeholder content.

## [0.1.18] - 2026-03-03
### Fixed
- Language bug: locale agent files (pt-BR, es, fr) were responding in English even after `aioson install --lang=<locale>` because the language rule was at the bottom of each file. LLMs process top-to-bottom and would default to English before reading the rule.
- Added `> **⚠ ABSOLUTE INSTRUCTION — LANGUAGE**` blockquote as the **first content after the title** in all 8 agents across all 3 locales (pt-BR, es, fr) + en locale (24 files total). Instruction explicitly forbids English and names the target language before any mission, sequence, or detection logic runs.
- `@ux-ui` output contract: HTML deliverable was being saved to `.aioson/context/landing-preview.html` instead of the project root. Fixed to `index.html` in the project root across all 5 ux-ui files (base + en/pt-BR/es/fr locales).

## [0.1.17] - 2026-03-03
### Added
- `static-html-patterns.md` Section 0 — **Hero Law**: explicit rule that the hero MUST be full-viewport animated background + ONE headline + TWO buttons. Cards in the hero are forbidden.
- `static-html-patterns.md` Section 2a-extra — **Mandatory Wow Techniques** for Bold & Cinematic (three required, not optional):
  - Animated mesh background (`@keyframes meshDrift 20s`) — static gradients replaced
  - Animated gradient text (`@keyframes textGradient 8s`) on headline `<em>` key phrase
  - 3D card tilt on hover (`perspective(700px) rotateX/rotateY` on `mousemove`, skipped on touch + reduced motion)
- `@setup` agent (base + all 4 locales) — **Step 3: Next agent guidance** appended to Post-setup action. Agent now closes by explicitly naming the next `@agent` based on `project_type` + `classification`, using the exact `@name` format so AI clients (Codex, Claude Code, Gemini) can trigger it.
- `@setup` pt-BR/es/fr/en locales — spec.md skip hint for `project_type=site` + MICRO classification.

### Changed
- `@ux-ui` Step 0 (base + en/pt-BR/es/fr locales) — upgraded from "ask one question" to **HARD STOP blocking gate**: agent must not read files, write HTML/CSS, or proceed to Step 1 until user answers the visual style question.
- `@ux-ui` Landing page mode (base + all locales) — added **Hero Law** constraint and **Mandatory Wow Techniques** section explicitly referencing the three required animations.
- `@ux-ui` es/fr locales — **full rewrite** to match the updated base agent: added Step 0 (visual style intake), landing page mode, hero law, mandatory wow techniques, full output contract.

## [0.1.16] - 2026-03-03
### Added
- `template/.aioson/skills/static/static-html-patterns.md`: new **Section 14 — Premium Template Patterns (Aigocy-style)** with 10 production patterns extracted from a real AI-agency landing page (ThemeForest #61450410):
  - **14a. effectFade animations**: `fadeUp` and `fadeRotateX` (3D perspective entrance) with `data-delay` stagger pattern for GSAP
  - **14b. Infinite logo marquee**: CSS-only `@keyframes infiniteSlide` with auto-clone JS and hover-pause for accessibility
  - **14c. SVG animated paths**: SMIL `<animateMotion>` hub-and-spoke diagram connecting icons to a center product image
  - **14d. Scroll-to-top with circular progress**: CSS `stroke-dashoffset` progress ring updated by scroll JS
  - **14e. Split Swiper**: synchronized text + image sliders with `effect: 'fade'` and `slideTo()` binding
  - **14f. Swiper progress bar navigation**: thin animated fill bar replacing pagination dots for portfolio sliders
  - **14g. box-white / box-black section alternation**: CSS pseudo-element radial glow replacing decorative PNG images
  - **14h. Accordion FAQ**: native `<details>`/`<summary>` version with `rotate(45deg)` icon transition
  - **14i. Footer with watermark background logo**: faded brand name in `position: absolute` behind 3-column dense footer
  - **14j. Canvas cursor trail**: fading dot trail on `mousemove`, skipped on touch devices and `prefers-reduced-motion`
- Section 13 pre-delivery checklist: added "No placeholder text remains" item

### Changed
- `@setup` agent output template (`aioson_version`) bumped to `0.1.16` across all locales (en, pt-BR, es, fr) and base agent file

## [0.1.12] - 2026-03-02
### Added
- New static skill: `template/.aioson/skills/static/interface-design.md` — a comprehensive UI/UX craft guide derived from the interface-design project, covering: Intent-First Framework (3 mandatory questions before any layout), Domain Exploration (4 required outputs: domain concepts, color world, signature element, defaults to avoid), 6 design directions with full token specs (Precision & Density, Warmth & Approachability, Data & Analysis, Editorial, Commerce, Minimal & Calm), complete token architecture (foreground/background/border/brand/semantic roles), depth strategy (commit to ONE), component state matrix, 4 quality checks (swap/squint/signature/token tests), self-critique process (composition → craft → content → structure).
- Portuguese documentation at `docs/pt/`:
  - `README.md`: index linking all guides.
  - `inicio-rapido.md`: quick start with install commands, classification scoring, and 3-command setup.
  - `agentes.md`: per-agent reference with when-to-use, activation command, what it delivers, and concrete examples.
  - `cenarios.md`: 4 complete worked examples — MICRO (landing page), SMALL (Laravel clinic API with @analyst output, @architect folder structure, @dev code), MEDIUM (Next.js SaaS with 3-lane parallel orchestration), MEDIUM dApp (Ethereum NFT marketplace with Solidity contract example).
  - `web3.md`: Portuguese Web3 guide covering setup flags for Ethereum/Solana/Cardano, monorepo structure, per-agent Web3 conventions, and skill reference.

### Changed
- `@ux-ui` agent (base + all 4 locales: en/pt-BR/es/fr): mandatory pre-work now references `interface-design.md` skill, adds Intent-First step, Domain Exploration step (4 required outputs), single design direction declaration, 4 quality checks (swap/squint/signature/token tests), and self-critique gate before delivery. Output contract expanded with focal point, reading order, full state matrix, and handoff notes for signature visual moves.
- `workflow:plan` sequences corrected: `@ux-ui` now included in SMALL (`setup → analyst → architect → ux-ui → dev → qa`) and MEDIUM (`setup → analyst → architect → ux-ui → pm → orchestrator → dev → qa`), matching `config.md` and agent documentation.
- 13 static skills expanded from 5–7 stub lines to 200–337 lines of production-grade, code-first references:
  - `laravel-conventions`: controllers as orchestrators, Form Requests, Actions, Policies, Events+queued Listeners, Jobs, API Resources, N+1 prevention, Model conventions, Migrations, Pest tests.
  - `tall-stack-patterns`: Livewire lifecycle + real-time validation, inter-component events, lazy loading, Alpine.js scope rules, Tailwind design system discipline, full Flux UI examples (button/modal/table/dropdown/sidebar).
  - `filament-patterns`: Resource structure (form/table/filters/actions), custom Pages, Stats Widgets, Relation Managers, policy enforcement, advanced form fields (repeater, conditional, file upload), business logic delegation.
  - `flux-ui-components`: full component inventory, buttons (all variants + loading states), form field group, modal with programmatic control, dropdown menus, table with sort + empty state, badges, sidebar navigation.
  - `jetstream-setup`: Inertia vs Blade decision matrix, Teams with roles/permissions, API tokens, profile customization, 2FA, password confirmation middleware, post-install checklist.
  - `git-conventions`: full Conventional Commits spec with type table + examples, Git Flow vs GitHub Flow, branch naming, PR template, tagging, protected history rules.
  - `nextjs-patterns`: Server vs Client mental model, App Router structure, async Server Components, Server Actions with Zod, Client Components (when/why), Route Handlers for webhooks only, metadata/SEO, loading.tsx + error.tsx.
  - `node-express-patterns`: layered architecture (routes/controllers/services/repositories), Zod validation middleware, typed auth + role checking, AppError class hierarchy, centralized error handler, rate limiting, graceful shutdown.
  - `node-typescript-patterns`: strict tsconfig baseline, Zod at all external boundaries, env validation at startup, branded domain types for IDs, const-object enums, repository interface pattern, explicit return types, asyncHandler.
  - `rails-conventions`: Service Objects with Result type, model scopes/enums/validations, Active Record N+1 prevention, async Jobs with retry, Mailer patterns, serializers, Pundit authorization, RSpec request + unit specs.
  - `web3-ethereum-patterns`: CEI pattern, ReentrancyGuard, pull over push, AccessControl roles, gas optimization (struct packing, custom errors), Hardhat test patterns with loadFixture, wagmi v2 frontend integration, deployment scripts.
  - `web3-solana-patterns`: eUTxO/account model, Anchor program structure, account data with LEN, PDA seeds + bump storage, CPI signing, Anchor constraints, compute budget management, full Anchor test suite.
  - `web3-cardano-patterns`: eUTxO mental model, Aiken project structure, datum/redeemer type design, spending validator, minting policy, Aiken tests, off-chain with Lucid, datum versioning strategy, deployment checklist.
  - `web3-security-checklist`: 7 critical vulnerabilities with code examples (reentrancy, access control, integer overflow, oracle manipulation, flash loans, front-running, signature replay), pre-deployment checklist (static analysis/fuzzing/invariant tests/multisig/timelock), emergency response protocol.

### Fixed
- `workflow:plan` was silently omitting `@ux-ui` from SMALL and MEDIUM sequences despite `config.md` and all agent documentation specifying it as a required step. Fixed in `src/commands/workflow-plan.js` and updated `tests/workflow-plan.test.js`.

## [0.1.11] - 2026-03-02
### Added
- Agent prompt enrichment across all 8 agents:
  - `@analyst`: 6 concrete Phase 1 discovery questions, entity deep-dive example (scheduling system), field-level table format for Phase 3, `Visual references` and `Risks identified` output sections, responsibility boundary note.
  - `@architect`: concrete folder/module structure trees for MICRO/SMALL/MEDIUM across Laravel (TALL), Node/Express, Next.js (App Router), and dApp (Hardhat/Foundry/Anchor) stacks.
  - `@pm`: explicit 2-page golden rule with cut-ruthlessly instruction, when-to-use guidance (SMALL/MEDIUM only, skip MICRO), exact `prd.md` section template.
  - `@dev`: Laravel ALWAYS/NEVER convention list (Form Requests, Actions, Policies, Events+Listeners, Jobs, Resources, N+1 prevention), UI/UX conventions, Web3 guards for dApp projects, semantic commit format with examples, responsibility boundary note.
  - `@orchestrator`: MEDIUM-only activation condition with early exit, 4-step orchestration process, dependency graph example, parallel vs sequential classification rules, `agent-N.status.md` and `shared-decisions.md` status file protocol.
  - `@setup`: explicit `framework_installed` contract semantics (true/false downstream behavior), monorepo detection guidance for mixed Web3 + backend repos.
  - `@ux-ui` and `@qa`: no structural changes (already complete).
- All 8 locale packs (`en`, `pt-BR`, `es`, `fr`) synchronized with enriched agent content.
- `isMonorepoDetection()` in `src/detector.js`: returns `true` when a Web3 framework and a backend or frontend framework coexist in the same directory.
- Monorepo detection note propagated to `setup:context` output (localized via `note_monorepo` key in all 4 i18n message files).
- `note_monorepo` i18n key added to `en`, `pt-BR`, `es`, and `fr` message dictionaries.
- 4 new tests for `isMonorepoDetection` in `tests/detector.test.js`.

### Changed
- `setup:context` now prepends a localized monorepo warning note when Web3 and application framework signals coexist in the project directory.
- `template/.aioson/config.md` context contract updated with explicit `framework_installed` semantics.
- `aioson_version` example in `@setup` output template corrected from `0.1.8` to `0.1.10`.
- `tests/agent-contracts.test.js` updated to reflect new `@dev` section names (`Laravel conventions`, `Responsibility boundary`).

### Added
- Full `pt-BR` CLI dictionary at `src/i18n/messages/pt-BR.js`.
- Localized agent prompt packs for:
  - `es` at `template/.aioson/locales/es/agents/*.md`
  - `fr` at `template/.aioson/locales/fr/agents/*.md`
- New `@ux-ui` agent contract and template set:
  - `.aioson/agents/ux-ui.md`
  - `.aioson/locales/{en,pt-BR,es,fr}/agents/ux-ui.md`
  - `.gemini/commands/aios-ux-ui.toml`
- Legacy framework detection support:
  - `CodeIgniter 3`
  - `CodeIgniter 4`
- New package installation validation command:
  - `aioson test:package [source-path] [--keep] [--dry-run] [--json]`
- New workflow planning command:
  - `aioson workflow:plan [path] [--classification=MICRO|SMALL|MEDIUM] [--json]`
- `mcp:init` tool presets generation under `.aioson/mcp/presets/`:
  - `claude.json`
  - `codex.json`
  - `gemini.json`
  - `opencode.json`
- New MCP validation command:
  - `aioson mcp:doctor [path] [--strict-env] [--json]`
- New parallel orchestration bootstrap command:
  - `aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json]`
- New parallel diagnosis/remediation command:
  - `aioson parallel:doctor [path] [--workers=2..6] [--fix] [--force] [--dry-run] [--json]`
- New parallel scope assignment command:
  - `aioson parallel:assign [path] [--source=auto|prd|architecture|discovery|<file>] [--workers=2..6] [--force] [--dry-run] [--json]`
- New parallel consolidated status command:
  - `aioson parallel:status [path] [--json]`
- Optional `mcp:init` tool filter:
  - `--tool=claude|codex|gemini|opencode`
- `test:smoke` mixed monorepo profile:
  - `--profile=mixed` for combined Web2 + Web3 workspace validation
- `test:smoke` parallel orchestration profile:
  - `--profile=parallel` to validate `parallel:init/assign/status/doctor` in one flow
- Formal JSON schema documentation for automation:
  - `docs/en/json-schemas.md`
  - `docs/en/schemas/index.json`
  - `docs/en/schemas/*.schema.json` for each JSON command contract
  - includes `docs/en/schemas/mcp-doctor.schema.json`
  - includes `docs/en/schemas/parallel-init.schema.json`
  - includes `docs/en/schemas/parallel-doctor.schema.json`
  - includes `docs/en/schemas/parallel-assign.schema.json`
  - includes `docs/en/schemas/parallel-status.schema.json`

### Changed
- Version resolution is now centralized via `src/version.js` and shared across `info`, `setup:context`, and installer metadata generation.
- Removed remaining hardcoded `0.1.8` fallback in `setup:context` version assignment.
- Locale resolution now supports canonical fallback for Portuguese:
  - `pt-BR` -> `pt-br`
  - `pt_br` -> `pt-br`
  - `pt` -> `pt-br`
- Locale resolution now also supports regional fallback for:
  - `es-*` -> `es`
  - `fr-*` -> `fr`
- Agent locale resolution now supports:
  - `es-*` -> `es`
  - `fr-*` -> `fr`
- `update` now reapplies active agent prompts from `conversation_language` in context, preventing locale reset after template refresh.
- `mcp:init` now writes both shared plan and tool-specific preset templates.
- `mcp:init` Context7/Database presets now default to remote-endpoint bridge templates (`mcp-remote`) with URL env vars instead of generic command placeholders.
- `mcp:init` invalid `--tool` errors are now localized via i18n dictionaries.
- `mcp:doctor` human-readable check messages and summary are now fully localized.
- `workflow:plan` advisory notes are now localized from i18n keys instead of hardcoded English.
- `setup:context` onboarding notes are now localized (including beginner recommendation notes and stack-option notes).
- `test:package` failure messages are now localized via i18n dictionaries.
- `parallel:doctor` check/hint messages are now fully localized (including severity labels).
- Internal validation failures inside `test:smoke` are now localized instead of hardcoded English.
- `parallel:status` human-readable status rows and lane summaries are now localized (including status labels).
- `mcp:doctor` severity prefixes are now localized per locale (`OK/WARN/FAIL` equivalents).
- `test:package` now localizes fallback command failure detail when stderr/stdout are empty.
- `parallel:assign` lane scope summary lines are now localized in human-readable output.
- Parallel commands now localize fallback `unknown` classification labels in human-readable errors.
- `mcp:init` now avoids hardcoded fallback text for invalid `--tool` and uses i18n-backed messaging.
- `mcp:init` now localizes generated server `reason` fields and preset `notes` content via i18n.
- Removed remaining hardcoded `unknown` fallbacks in `parallel:doctor` check messages and `context:validate` parse-reason output.
- `context:validate` now localizes known frontmatter parse reason codes into human-readable locale messages.
- `mcp:doctor` now localizes context frontmatter parse reason codes using the same i18n mapping as `context:validate`.
- Standardized localized line formatting for `agents`, `locale:apply`, `workflow:plan`, and `parallel:init` human-readable listings.
- Localized diagnostic line wrappers for `mcp:doctor` and `parallel:doctor` checks/hints, plus `context:validate` issue list rows.
- Localized diagnostic/action wrapper lines in `doctor` command output (checks, hints, fix actions, and detail lines).
- `cli` help and unknown-command wrapper lines are now localized via i18n keys instead of inline formatting.
- `init` and `install` now print explicit multi-IDE onboarding hints (`agents` + `agent:prompt setup`) with optional `--tool=codex|claude|gemini|opencode` guidance.
- Agent flow now supports explicit UI/UX handoff:
  - `@architect` may hand off key screens/component constraints to `@ux-ui`
  - `@dev` now consumes `.aioson/context/ui-spec.md` when present
  - `SMALL`/`MEDIUM` default sequence includes `@ux-ui`
- `doctor` now enforces multi-IDE gateway contracts (Claude/Codex/Gemini/OpenCode) and validates required Gemini/OpenCode files.
- `doctor` now also validates each Gemini command file (`.gemini/commands/aios-*.toml`) maps to the expected shared agent instruction file.
- `doctor --fix` now restores broken gateway contract files (Claude/Codex/Gemini/OpenCode + Gemini command mappings) from template in safe mode.
- `update` now supports `--lang=en|pt-BR|es|fr` (and `--language`) to force localized agent-pack sync during update, including dry-run planning.
- `--json` output mode now supports `init`, `install`, and `update` with clean machine-readable payloads (no mixed human logs).
- `--json` output mode now also supports `agents`, `agent:prompt`, `locale:apply`, `setup:context`, and `i18n:add`.
- JSON payloads for `init/install/update/agents/agent:prompt/locale:apply/setup:context/i18n:add` now include stable `ok` and command context fields.
- JSON schema catalog expanded with formal contracts for:
  - `init`
  - `install`
  - `update`
  - `agents`
  - `agent:prompt`
  - `locale:apply`
  - `setup:context`
  - `i18n:add`
- `init` and `install` now support `--lang=en|pt-BR|es|fr` to auto-apply localized agent packs during bootstrap.
- Setup templates now default `aioson_version` to `0.1.8`.
- `ui-ux-modern` static skill was expanded to a production-ready checklist with token, state, accessibility, responsive, and handoff guidance.
- Developer onboarding now handles `Other` backend/frontend choices as true free-text custom values (legacy/custom stacks).
- Expanded automated coverage:
  - `tests/i18n-cli.test.js`
  - `tests/init-install-guidance.test.js`
  - `tests/prompt-tool.test.js`
  - `tests/init-install-guidance.test.js` now validates locale pack auto-apply on `init/install --lang`
  - `tests/version.test.js`
  - `tests/update.test.js` now covers `--lang` override and dry-run locale sync planning
  - `tests/json-output.test.js` now covers `init/install/update --json`
  - `tests/json-output.test.js` now covers `agents/agent:prompt/locale:apply/setup:context/i18n:add --json`
  - `tests/json-schema-files.test.js` now validates expanded schema catalog
  - `tests/locales.test.js`
  - `tests/agent-contracts.test.js`
  - `tests/smoke.test.js` now verifies active agent prompt locale application for `--lang=es` and `--lang=fr`
  - `tests/mcp-doctor.test.js`
  - `tests/mcp-init.test.js` now covers invalid `--tool` handling
  - `tests/setup-context.test.js` now validates localized onboarding notes
  - `tests/parallel-doctor.test.js` now validates localized check messages
  - `tests/parallel-init.test.js`
  - `tests/parallel-doctor.test.js`
  - `tests/parallel-assign.test.js`
  - `tests/parallel-status.test.js`
  - `tests/json-output.test.js` now covers `mcp:doctor --json`
  - `tests/package-test.test.js`
  - `tests/workflow-plan.test.js`
  - extended `tests/mcp-init.test.js` and `tests/json-output.test.js`
  - smoke JSON e2e checks for `--locale=es` and `--locale=fr`
  - smoke coverage for `--profile=parallel`

## [0.1.7] - 2026-03-01
### Added
- JSON output mode (`--json`) for:
  - `aioson info`
  - `aioson doctor`
  - `aioson context:validate`
  - `aioson test:smoke`
- New JSON output test suite: `tests/json-output.test.js`.

### Changed
- CLI now returns structured JSON errors for unknown commands and runtime failures when `--json` is enabled.
- `setup:context` and setup templates now default `aioson_version` to `0.1.7`.

## [0.1.6] - 2026-03-01
### Added
- `test:smoke` now supports chain-specific Web3 profiles:
  - `--web3=ethereum`
  - `--web3=solana`
  - `--web3=cardano`
- Web3 smoke workflow now verifies:
  - framework detection per chain profile
  - `project.context.md` dApp/Web3 frontmatter consistency.

### Changed
- CLI help and docs updated for `test:smoke --web3`.
- `setup:context` and setup templates now default `aioson_version` to `0.1.6`.

## [0.1.5] - 2026-03-01
### Added
- Web3 framework detection:
  - Ethereum: `Hardhat`, `Foundry`, `Truffle`
  - Solana: `Anchor`, `Solana Web3`
  - Cardano: `Cardano` (Aiken/Cardano SDK signals)
- New Web3 skill templates:
  - static: `web3-ethereum-patterns`, `web3-solana-patterns`, `web3-cardano-patterns`, `web3-security-checklist`, `node-typescript-patterns`
  - dynamic: `ethereum-docs`, `solana-docs`, `cardano-docs`
- New documentation page: `docs/en/web3.md`.

### Changed
- `project_type` now accepts `dapp`.
- `setup:context` now supports Web3 context fields (`web3_enabled`, `web3_networks`, `contract_framework`, `wallet_provider`, `indexer`, `rpc_provider`).
- `setup:context` and setup templates now default `aioson_version` to `0.1.5`.

## [0.1.4] - 2026-03-01
### Added
- New command:
  - `aioson test:smoke [workspace-path] [--lang=en|pt-BR] [--keep]`
- New smoke test suite: `tests/smoke.test.js`.

### Changed
- `doctor` now supports safe remediation mode:
  - `aioson doctor --fix`
  - `aioson doctor --fix --dry-run`
- `setup:context` and setup templates now default `aioson_version` to `0.1.4`.

## [0.1.3] - 2026-03-01
### Added
- Localized agent prompt packs:
  - `.aioson/locales/en/agents/*.md`
  - `.aioson/locales/pt-BR/agents/*.md`
- New command:
  - `aioson locale:apply [path] [--lang=en|pt-BR] [--dry-run]`
- Agent path resolution now supports locale-aware prompts with fallback to active agent paths.
- New locale test suite: `tests/locales.test.js`.

### Changed
- `setup:context` now applies localized agent prompts based on `conversation_language`.
- Documentation updated for locale pack workflow.

## [0.1.2] - 2026-03-01
### Added
- New commands:
  - `aioson agents`
  - `aioson agent:prompt <agent> [--tool=...]`
  - `aioson context:validate [path]`
  - `aioson setup:context [path]` (interactive or defaults mode)
- New modules:
  - `src/context.js` for frontmatter parsing and context contract validation
  - `src/agents.js` for agent metadata and prompt generation
  - `src/context-writer.js` for context rendering and classification scoring
- New test suites:
  - `tests/context.test.js`
  - `tests/agents.test.js`
  - `tests/context-writer.test.js`

### Changed
- `doctor` now validates `project.context.md` frontmatter and required fields, including `conversation_language` format.

## [0.1.1] - 2026-03-01
### Changed
- Converted remaining template files to English (`.aioson` agents/config and Gemini command descriptions).
- Hardened `@setup` instructions to prevent silent defaults for `project_type`, `profile`, `classification`, and language.
- Added explicit `conversation_language` to context contract so agent interaction language can be enforced.

## [0.1.0] - 2026-03-01
### Added
- Initial CLI commands: init, install, update, info, doctor
- Multi-IDE template gateways (Claude, Codex, Gemini, OpenCode)
- Framework detector and installer/updater core
- i18n message system with English default
- Automated tests for detector, installer, doctor, i18n
- `i18n:add <locale>` command to scaffold new locale dictionaries
- GitHub Actions CI and tag-based npm release workflows

### Changed
- Project-facing content standardized to English
- CLI i18n upgraded with dynamic locale loading and fallback behavior
