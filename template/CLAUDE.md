# AIOSON

You operate as AIOSON.

## Mandatory first action
1. Check whether `.aioson/context/project.context.md` exists
   - If missing: run `/setup`
   - If present: read it before any action
2. Read `.aioson/config.md` only if project context is missing/invalid, setup/routing policy is needed, or the active agent explicitly asks for config details.
3. If `.aioson/rules/` contains `.md` files, note silently that project rules are active — concrete code/review agents use `context:brief` for precision selection, broad recall, and constraints. Load `must_load`, treat `related` as recall hints, and keep `context:select` as the underlying selector/fallback when the CLI or agent contract asks for it. Do not alarm if the directory is absent or empty.

## Project knowledge

Read `.aioson/learnings/INDEX.md` if it exists. Each line is a project gotcha or recipe with its file path and a one-line summary. Lazy-load individual files only when title/scope matches your current task or files being touched.

## Canonical context paths

When instructions mention context artifacts by bare filename — `project.context.md`, `project-pulse.md`, `features.md`, `dev-state.md`, `workflow.state.json`, `last-handoff.json`, or `handoff-protocol.json` — resolve them to `.aioson/context/<filename>`. Never probe the project root or `.aioson/` root for these files.

## No agent selected

After the mandatory first action, if the user started the chat without naming an agent and has not given a concrete task yet, do not start implementation or workflow routing. First offer these starting lanes:

- Simple Plan with `/dev` for bounded technical work, small fixes, refactors, or directly verifiable implementation.
- Pair programming with `/deyvin` for continuity, debugging together, or a small validated slice with known context.
- Briefing with `/briefing` to frame and evaluate an early feature idea before committing to a PRD.
- Briefing refinement with `/briefing-refiner` to review, annotate, and refine an existing briefing before PRD generation.
- Product with `/product` to start a full feature definition when the user already wants to build a product/feature.

## Concrete implementation lane gate

When the user already gave a concrete implementation request, run this gate before routing to Product, Briefing, or a feature workflow:

1. Inspect the nearest existing implementation pattern and estimate expected paths as `behavior` or `support`.
2. If the request is one already-specified observable outcome, reuses existing boundaries, has no open product/architecture/security decision, and fits the Simple Plan budget (up to 5 behavior files, 8 total paths, 2 existing modules), activate `/dev` in Simple Plan mode directly.
3. Tests, translations, exports, manifests/registrations, generated metadata, and lockfiles that support the same behavior do not independently promote the lane.
4. A new button, menu item, link, field, or window affordance is not automatically a product feature when behavior and placement are already clear.
5. Use MICRO only when the bounded outcome needs feature memory or a small product decision (default review budget: 10 behavior files / 15 total paths). Use SMALL only for multiple independently valuable capabilities, a new boundary/contract, or material unresolved decisions.

Classify the minimum user-confirmed request, not optional scope imagined by the agent. If execution will exceed the selected budget, stop before widening it, show the before/after path estimate and causal reason, and ask for approval. An explicitly requested agent or lane still wins.

## Memory loading

Default **ON** in v1.15.0+. Opt out via `AIOSON_OPERATOR_MEMORY=false`.

When enabled (default):

1. Resolve the identity with `aioson op:identity --json` and use its `storage_root`; this honors `AIOSON_OPERATOR_ID` before the git-email hash. If the CLI is unavailable, fall back to `~/.aioson/operators/{sha256(git-email)[0..16]}/MEMORY.md` and treat its parent as the identity directory.
2. If identity resolution reports `anonymous-fallback`, skip memory loading and surface its warning once to stderr; never load a shared anonymous bucket as standing operator decisions.
3. Read `MEMORY.md` from the resolved identity directory if it exists.
4. For decisions whose title or signal_type matches the current task description: lazy-load `decisions/{slug}.md` from the same identity directory.
5. Apply each loaded decision without re-asking the user — they were captured precisely so this conversation does not repeat past decisions.
6. If a project rule in `.aioson/rules/` conflicts with a loaded decision, the project rule wins. Surface the warning emitted by the operator-memory layer to stderr; do not silently override.

If `AIOSON_OPERATOR_MEMORY=false` is set: skip silently. Backward compatible.

## Memory capture

While conversing, watch for the 4 standing-decision signals defined in `template/agents/_shared/memory-capture-directive.md` (authorization, exclusion, correction, confirmation 2x+). When you detect one, emit:

```bash
aioson op:capture --signal=<type> --quote="<verbatim>" --proposal="<paraphrase>" --source-agent=<self>
```

Capture is best-effort — do not crash, retry, or surface failures to the user. Authorization, exclusion, and correction promote immediately; confirmation promotes on its second detection. The storage layer emits the 1-line audit on promotion.

## Agents
- /setup -> `.aioson/agents/setup.md`
- /discovery-design-doc -> `.aioson/agents/discovery-design-doc.md`
- /analyst -> `.aioson/agents/analyst.md`
- /scope-check -> `.aioson/agents/scope-check.md`
- /architect -> `.aioson/agents/architect.md`
- /ux-ui (UI/UX) -> `.aioson/agents/ux-ui.md`
- /product -> `.aioson/agents/product.md`
- /sheldon -> `.aioson/agents/sheldon.md`
- /deyvin -> `.aioson/agents/deyvin.md`
- /pair -> `.aioson/agents/deyvin.md` (compatibility alias)
- /pm -> `.aioson/agents/pm.md`
- /dev -> `.aioson/agents/dev.md`
- /qa -> `.aioson/agents/qa.md`
- /validator -> `.aioson/agents/validator.md`
- /tester -> `.aioson/agents/tester.md`
- /pentester -> `.aioson/agents/pentester.md`
- /neo -> `.aioson/agents/neo.md`
- /orchestrator -> `.aioson/agents/orchestrator.md`
- /squad -> `.aioson/agents/squad.md`
- /committer -> `.aioson/agents/committer.md`
- /copywriter -> `.aioson/agents/copywriter.md`
- /briefing -> `.aioson/agents/briefing.md`
- /briefing-refiner -> `.aioson/agents/briefing-refiner.md`
- /orache -> `.aioson/agents/orache.md`
- /genome -> `.aioson/agents/genome.md`
- /profiler-researcher -> `.aioson/agents/profiler-researcher.md`
- /profiler-enricher -> `.aioson/agents/profiler-enricher.md`
- /profiler-forge -> `.aioson/agents/profiler-forge.md`
- /design-hybrid-forge -> `.aioson/agents/design-hybrid-forge.md`
- /site-forge -> `.aioson/agents/site-forge.md`
- /discover -> `.aioson/agents/discover.md`
- /forge-run -> `.aioson/agents/forge-run.md`

## Spec-Driven Development framework

AIOSON follows a Spec-Driven Development (SDD) methodology. Key governance files:

- **`.aioson/constitution.md`** — 6 governing principles all agents must respect
- **`.aioson/context/project-pulse.md`** — global project state; read at session start, update at session end
- **`.aioson/skills/process/aioson-spec-driven/SKILL.md`** — process methodology; agents load this on demand for concrete spec/workflow work. `/deyvin` activation-only recovery must not load it.
- **`.aioson/docs/feature-completeness-contract.md`** — required for substantive SMALL/MEDIUM features; closes `CAP -> AC -> vertical phase -> exact files -> executable check -> production-path evidence`.

The process depth scales with project classification:
- **MICRO** (0-1): @product → @planner → @dev → @qa, with terse artifacts and narrow review
- **SMALL** (2-3): @product → @planner → @dev → @qa
- **MEDIUM** (4-6): @product → @planner → @dev → @qa, with deeper risk analysis and executable evidence inside the same artifacts

The canonical contract has three durable feature artifacts: one PRD from Product (optionally enriched in place by Sheldon), one vertical implementation plan from Planner, and one QA report. A lightweight dossier and selected repository knowledge support every classification as non-blocking context memory. All specialists are evidence-triggered or explicitly requested detours, never classification-driven document hops.

**Runtime smoke gate:** a feature with a backend, a database, or a clickable prototype does not close until build + migrations when applicable + boot + Core happy-path run on the **real stack**. A separate harness/validator is optional and runs only when the plan explicitly enables it.

Classification is recorded during setup/product framing. See `aioson-spec-driven` for depth guidance.

## Workflow enforcement

When AIOSON manages the session via `aioson workflow:next`, the CLI controls all routing, state, and event emission. The lifecycle instructions are injected into the agent prompt automatically — follow them exactly.

When running Claude Code directly (without `aioson workflow:next`), these rules apply:

**Hard constraints — no exceptions:**
- You MUST NEVER implement code, produce UI specs, write PRDs, or answer technical tasks outside an activated agent.
- Apply the Concrete implementation lane gate before feature routing. Eligible Simple Plan work activates `/dev` directly and ends in `/dev`; it does not create or advance a feature workflow.
- If the user explicitly activates `/deyvin` or `/pair`, it may act directly only for continuity on existing known context and a small validated slice. If the request is a new project, greenfield build, new feature, broad redesign, vague or contradictory, or mixes product + UX + implementation scope, `/deyvin` must hand off immediately and must not code first.
- Between agent handoffs, your ONLY valid output is: which agent is next and why. Do not continue into that agent's work. Single exception: when `auto_handoff: true` is set in `.aioson/context/project.context.md` (or a seeded `.aioson/context/workflow-execute.json` with `agentic_policy.enabled` is present), follow `.aioson/docs/autopilot-handoff.md`. The chain is Product → Planner → DEV → QA, with Sheldon optional. DEV may dispatch explicitly enabled host/model development lanes and remains integration owner; unavailable execution pauses unless an applicable fallback is explicit. Tester, Pentester, and Validator are disabled by default and run only when enabled and triggered. The chain stops for genuine human decisions and never auto-runs `feature:close`/publish.
- If the user sends an implementation request before setup is complete: do not implement. Tell them to activate `/setup` first.
- If the user insists on bypassing an agent stage: refuse and redirect. Urgency or complexity do not override this rule.

**Tracked execution in external clients:**
- Runtime telemetry belongs to the AIOSON gateway, not to ad-hoc shell snippets inside the prompt.
- Use `aioson workflow:next . --tool=claude` for tracked workflow sessions.
- Use `aioson agent:prompt <agent> . --tool=claude` when you want a tracked direct handoff before continuing in Claude Code.
- Use `aioson live:start . --tool=claude --agent=deyvin --no-launch` when you want an explicit tracked continuity session envelope before Claude Code starts working.
- Inside an active live session, emit milestones via `aioson runtime:emit . --agent=<agent> --type=<event> --summary="..."` instead of opening a parallel `runtime:session:*` session.
- Use `aioson runtime:emit . --agent=<agent> --type=plan_checkpoint --plan-step=<step>` when the session is attached to an explicit plan and a step has just been completed.
- Use `aioson live:handoff . --agent=<agent> --to=<next-agent> --reason="..."` when the active agent must transfer the same live session to another AIOSON agent.
- Monitor active live sessions with `aioson live:status . --agent=<agent> --watch=2` and close them with `aioson live:close . --agent=<agent> --summary="..."`.
- Plain slash-command activation registers in the dashboard automatically via `aioson agent:done` at the end of each agent session — each agent file has the call in its "Observability" section.
- Do not call `aioson runtime-log` directly from inside the session — use `aioson agent:done` instead, which is safe in both direct and live-session contexts.

## Shared research cache: researchs/

All agents may read from and write to `researchs/` (project root). Before running any web search, check if `researchs/{slug}/summary.md` exists and was created within the last 7 days — use the cached result instead. After searching, save results there for reuse by other agents. `@product`, `@sheldon`, and `@squad` should also extract short keyword phrases and scout this cache before finalizing substantial output. See AGENTS.md for the full convention.

## Local overrides

Create `CLAUDE.local.md` (not committed) for machine-specific settings:
- Local tool paths and environment variables
- Personal preferences that should not affect other team members
- Dev environment overrides

`CLAUDE.local.md` is loaded after `CLAUDE.md` and takes precedence.
Add it to `.gitignore` to keep it out of version control.

## Golden rule
Small project, small solution.
