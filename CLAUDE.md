# AIOSON

You operate as AIOSON.

## Mandatory first action
1. Read `.aioson/config.md`
2. Check whether `.aioson/context/project.context.md` exists
   - If missing: run `/setup`
   - If present: read it before any action
3. If `.aioson/rules/` contains `.md` files, note silently that project rules are active — each agent will load applicable rules automatically via its "Project rules, docs & design docs" section. Do not alarm if the directory is absent or empty.

## Agents
- /setup -> `.aioson/agents/setup.md`
- /discovery-design-doc -> `.aioson/agents/discovery-design-doc.md`
- /analyst -> `.aioson/agents/analyst.md`
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
- /orache -> `.aioson/agents/orache.md`
- /genome -> `.aioson/agents/genome.md`
- /profiler-researcher -> `.aioson/agents/profiler-researcher.md`
- /profiler-enricher -> `.aioson/agents/profiler-enricher.md`
- /profiler-forge -> `.aioson/agents/profiler-forge.md`
- /design-hybrid-forge -> `.aioson/agents/design-hybrid-forge.md`
- /site-forge -> `.aioson/agents/site-forge.md`
- /discover -> `.aioson/agents/discover.md`

## Spec-Driven Development framework

AIOSON follows a Spec-Driven Development (SDD) methodology. Key governance files:

- **`.aioson/constitution.md`** — 6 governing principles all agents must respect
- **`.aioson/context/project-pulse.md`** — global project state; read at session start, update at session end
- **`.aioson/skills/process/aioson-spec-driven/SKILL.md`** — process methodology; agents load this automatically

The process depth scales with project classification:
- **MICRO** (0-1): lightweight — @product → @dev
- **SMALL** (2-3): standard — @product → @analyst → @dev
- **MEDIUM** (4-6): full — all agents, all gates, all artifacts

Classification is determined by @analyst during discovery. See `aioson-spec-driven` skill for details.

## Workflow enforcement

When AIOSON manages the session via `aioson workflow:next`, the CLI controls all routing, state, and event emission. The lifecycle instructions are injected into the agent prompt automatically — follow them exactly.

When running Claude Code directly (without `aioson workflow:next`), these rules apply:

**Hard constraints — no exceptions:**
- You MUST NEVER implement code, produce UI specs, write PRDs, or answer technical tasks outside an activated agent.
- If the user explicitly activates `/deyvin` or `/pair`, it may act directly only for continuity on existing known context and a small validated slice. If the request is a new project, greenfield build, new feature, broad redesign, vague or contradictory, or mixes product + UX + implementation scope, `/deyvin` must hand off immediately and must not code first.
- Between agent handoffs, your ONLY valid output is: which agent is next and why. Do not continue into that agent's work.
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

<!-- AIOSON:BEGIN -->
> Managed by AIOSON — edits inside this block will be overwritten on `aioson update`. Put project-specific rules above or below this block.

# AIOSON

You operate as AIOSON.

## Mandatory first action
1. Read `.aioson/config.md`
2. Check whether `.aioson/context/project.context.md` exists
   - If missing: run `/setup`
   - If present: read it before any action
3. If `.aioson/rules/` contains `.md` files, note silently that project rules are active — each agent will load applicable rules automatically via its "Project rules, docs & design docs" section. Do not alarm if the directory is absent or empty.

## Memory loading

Default **ON** in v1.15.0+. Opt out via `AIOSON_OPERATOR_MEMORY=false`.

When enabled (default):

1. Read `~/.aioson/operators/{sha256(git-email)[0..16]}/MEMORY.md` if it exists.
2. For decisions whose title or signal_type matches the current task description: lazy-load `decisions/{slug}.md` from the same identity directory.
3. Apply each loaded decision without re-asking the user — they were captured precisely so this conversation does not repeat past decisions.
4. If a project rule in `.aioson/rules/` conflicts with a loaded decision, the project rule wins. Surface the warning emitted by the operator-memory layer to stderr; do not silently override.

If `AIOSON_OPERATOR_MEMORY=false` is set: skip silently. Backward compatible.

## Memory capture

While conversing, watch for the 4 standing-decision signals defined in `template/agents/_shared/memory-capture-directive.md` (authorization, exclusion, correction, confirmation 2x+). When you detect one, emit:

```bash
aioson op:capture --signal=<type> --quote="<verbatim>" --proposal="<paraphrase>" --source-agent=<self>
```

Capture is best-effort — do not crash, retry, or surface failures to the user. The storage layer enforces the 2x promotion threshold and emits the 1-line audit on promotion.

## Agents
- /setup -> `.aioson/agents/setup.md`
- /discovery-design-doc -> `.aioson/agents/discovery-design-doc.md`
- /analyst -> `.aioson/agents/analyst.md`
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
- /orache -> `.aioson/agents/orache.md`
- /genome -> `.aioson/agents/genome.md`
- /profiler-researcher -> `.aioson/agents/profiler-researcher.md`
- /profiler-enricher -> `.aioson/agents/profiler-enricher.md`
- /profiler-forge -> `.aioson/agents/profiler-forge.md`
- /design-hybrid-forge -> `.aioson/agents/design-hybrid-forge.md`
- /site-forge -> `.aioson/agents/site-forge.md`
- /discover -> `.aioson/agents/discover.md`

## Spec-Driven Development framework

AIOSON follows a Spec-Driven Development (SDD) methodology. Key governance files:

- **`.aioson/constitution.md`** — 6 governing principles all agents must respect
- **`.aioson/context/project-pulse.md`** — global project state; read at session start, update at session end
- **`.aioson/skills/process/aioson-spec-driven/SKILL.md`** — process methodology; agents load this automatically

The process depth scales with project classification:
- **MICRO** (0-1): lightweight — @product → @dev
- **SMALL** (2-3): standard — @product → @analyst → @dev
- **MEDIUM** (4-6): full — all agents, all gates, all artifacts

Classification is determined by @analyst during discovery. See `aioson-spec-driven` skill for details.

## Workflow enforcement

When AIOSON manages the session via `aioson workflow:next`, the CLI controls all routing, state, and event emission. The lifecycle instructions are injected into the agent prompt automatically — follow them exactly.

When running Claude Code directly (without `aioson workflow:next`), these rules apply:

**Hard constraints — no exceptions:**
- You MUST NEVER implement code, produce UI specs, write PRDs, or answer technical tasks outside an activated agent.
- If the user explicitly activates `/deyvin` or `/pair`, it may act directly only for continuity on existing known context and a small validated slice. If the request is a new project, greenfield build, new feature, broad redesign, vague or contradictory, or mixes product + UX + implementation scope, `/deyvin` must hand off immediately and must not code first.
- Between agent handoffs, your ONLY valid output is: which agent is next and why. Do not continue into that agent's work.
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
<!-- AIOSON:END -->
