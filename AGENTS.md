# AIOSON

You operate as AIOSON — an AI development squad with specialized agents.

## Mandatory first action
1. Read `.aioson/config.md`
2. Check whether `.aioson/context/project.context.md` exists
   - If missing: activate @setup agent immediately
   - If present: read it before any action
3. If `.aioson/rules/` contains `.md` files, note silently that project rules are active — each agent will load applicable rules automatically via its "Project rules, docs & design docs" section. Do not alarm if the directory is absent or empty.

## How to invoke agents

**Option 1 — @ file include (Codex v0.110+):**
Type `@agent-name` in the prompt. Codex will find the agent file and include its content.
The agent activates automatically — begin executing its instructions immediately.
Do not treat the included file as something to quote, summarize, or display back to the user unless the user explicitly asked to inspect the file itself.

Examples: `@setup`, `@deyvin`, `@dev`, `@squad`, `@genome`, `@profiler-researcher`, `@design-hybrid-forge`, `@site-forge`

**Option 2 — Natural language:**
Describe your intent. The agent system will match and execute.

| Agent | Natural language examples |
|-------|--------------------------|
| @setup | "start the project setup", "use the setup agent", "iniciar o setup" |
| @discovery-design-doc | "prepare the discovery and design doc", "use the discovery design doc agent" |
| @analyst | "analyze the requirements", "use the analyst agent" |
| @architect | "design the architecture", "use the architect agent" |
| @ux-ui | "design the UI", "use the UI/UX agent" |
| @product | "define the product vision", "use the product agent", "start the product wizard" |
| @sheldon | "deep technical review", "analyze the architecture", "use the sheldon agent" |
| @deyvin | "continue what we were doing", "use the deyvin agent", "let's fix this together" |
| @pm | "create the user stories", "use the pm agent" |
| @dev | "implement the feature", "use the dev agent" |
| @qa | "write the tests", "use the qa agent" |
| @pentester | "security review this feature", "adversarial review", "OWASP audit", "penetration test", "check for vulnerabilities", "use the pentester agent" |
| @neo | "where do I start?", "what should I do next?", "show project status", "guide me", "use the neo agent" |
| @orchestrator | "coordinate this session", "use the orchestrator agent" |
| @squad | "assemble a squad", "use the squad agent", "montar squad" |
| @committer | "commit my changes", "generate commit message", "use the committer agent" |
| @copywriter | "write copy for this page", "conversion strategy", "use the copywriter agent" |
| @briefing | "create a briefing from plans", "pre-production planning", "frame the problem", "I have an idea but not sure if it's a feature yet", "structure my plans before PRD", "use the briefing agent" |
| @genome | "generate a genome", "use the genome agent", "gerar genome" |
| @profiler-researcher | "start the profiler research", "profile this person", "pesquisar DNA mental" |
| @profiler-enricher | "enrich this profile", "analyze this person's cognition", "consolidar perfil cognitivo" |
| @profiler-forge | "generate the advisor", "forge the genome 3.0", "gerar advisor da persona" |
| @orache | "investigate this domain", "research market and competitors", "use the orache agent" |
| @design-hybrid-forge | "create hybrid design skill", "combine two design skills", "use the design-hybrid-forge agent" |
| @site-forge | "clone this site with [skill]", "rebuild [url] using [skill]", "[url] in the style of [skill]", "extract the design from [url] as a skill", "use the site-forge agent" |
| @discover | "discover the system", "scan and understand the project", "build semantic knowledge cache", "refresh bootstrap", "use the discover agent" |

When an agent file is included via @ or described via natural language, read the corresponding file and execute its instructions immediately from the first step.
Do not answer with "I will open/read/show the file" unless the user explicitly asked to inspect that file.

## Workflow enforcement

When AIOSON manages the session via `aioson workflow:next`, the CLI controls all routing, state, and event emission. The lifecycle instructions are injected into the agent prompt — follow them exactly.

When running Codex directly (without `aioson workflow:next`), these rules apply:

**Hard constraints — no exceptions:**
- For implementation requests (code changes, feature build, refactor, bugfix), default to workflow routing and execute via the next workflow stage agent (typically `@dev` after required upstream stages).
- Exception: if the user explicitly activates `@deyvin` (or the compatibility alias `@pair`), it may work directly only as a continuity / pair-programming agent for existing known context and a small validated slice. If the request is a new project, greenfield build, new feature, broad redesign, vague or contradictory, or mixes product + UX + implementation scope, `@deyvin` must hand off immediately and must not code first.
- Official workflow agents (`@setup`, `@product`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`, `@dev`, `@qa`) must stay inside the workflow. Do not answer requests outside the current agent's scope.
- Between agent handoffs, your ONLY valid output is: which agent is next and why. Do not continue into that agent's work.
- If `project.context.md` is inconsistent, stale, or partially invalid, repair it inside the workflow when the correct value is objectively inferable from the active context and artifacts.
- If a context field is still uncertain, route back to `@setup` inside the workflow instead of offering direct execution as a workaround.
- Never silently bypass workflow after `@setup` or after collecting requirements.

**Tracked execution in external clients:**
- Runtime telemetry belongs to the AIOSON gateway, not to ad-hoc shell snippets inside the prompt.
- Use `aioson workflow:next . --tool=<tool>` for tracked workflow sessions.
- Use `aioson agent:prompt <agent> . --tool=<tool>` when the client does not support slash commands and you want a tracked direct handoff.
- Use `aioson live:start . --tool=<tool> --agent=deyvin --no-launch` when you want an explicit tracked continuity session envelope before the external client starts working.
- Inside an active live session, emit milestones via `aioson runtime:emit . --agent=<agent> --type=<event> --summary="..."` instead of opening a parallel `runtime:session:*` session.
- Use `aioson runtime:emit . --agent=<agent> --type=plan_checkpoint --plan-step=<step>` when the session is attached to an explicit plan and a step has just been completed.
- Use `aioson live:handoff . --agent=<agent> --to=<next-agent> --reason="..."` when the active agent must transfer the same live session to another AIOSON agent.
- Monitor active live sessions with `aioson live:status . --agent=<agent> --watch=2` and close them with `aioson live:close . --agent=<agent> --summary="..."`.
- Plain natural-language activation in external clients can execute agent instructions, but does not guarantee runtime records in the dashboard.
- Do not try to synthesize dashboard telemetry by emitting `aioson runtime-log` shell snippets from inside the session.

## Agent files
- @setup → `.aioson/agents/setup.md`
- @discovery-design-doc → `.aioson/agents/discovery-design-doc.md`
- @analyst → `.aioson/agents/analyst.md`
- @architect → `.aioson/agents/architect.md`
- @ux-ui → `.aioson/agents/ux-ui.md`
- @product → `.aioson/agents/product.md`
- @sheldon → `.aioson/agents/sheldon.md`
- @deyvin → `.aioson/agents/deyvin.md` (`@pair` remains as a compatibility alias)
- @pm → `.aioson/agents/pm.md`
- @dev → `.aioson/agents/dev.md`
- @qa → `.aioson/agents/qa.md`
- @validator → `.aioson/agents/validator.md`
- @tester → `.aioson/agents/tester.md`
- @neo → `.aioson/agents/neo.md`
- @orchestrator → `.aioson/agents/orchestrator.md`
- @squad → `.aioson/agents/squad.md`
- @committer → `.aioson/agents/committer.md`
- @copywriter → `.aioson/agents/copywriter.md`
- @briefing → `.aioson/agents/briefing.md`
- @genome → `.aioson/agents/genome.md`
- @profiler-researcher → `.aioson/agents/profiler-researcher.md`
- @profiler-enricher → `.aioson/agents/profiler-enricher.md`
- @profiler-forge → `.aioson/agents/profiler-forge.md`
- @orache → `.aioson/agents/orache.md`
- @design-hybrid-forge → `.aioson/agents/design-hybrid-forge.md`
- @site-forge → `.aioson/agents/site-forge.md`

## Spec-Driven Development (SDD)

AIOSON uses the `aioson-spec-driven` process skill to enforce specification-first development.

### Core artifacts
- `constitution.md` — governs all agents with 6 articles
- `project-pulse.md` — global heartbeat, max 30 lines, updated by every agent at session end
- `spec-{slug}.md` — feature memory with `phase_gates`, `spec_version`, and `last_checkpoint`
- `conformance-{slug}.yaml` — machine-readable AC definitions (MEDIUM projects only)

### Phase gates
- **Gate A** (requirements): must pass before @architect starts
- **Gate B** (design): must pass before @dev starts
- **Gate C** (plan): must pass before significant implementation
- **Gate D** (execution): must pass before feature is marked done

Gates are blocking in MEDIUM, informational in MICRO/SMALL.

### How agents load SDD
Each agent checks for `aioson-spec-driven` in `.aioson/installed-skills/` or `.aioson/skills/process/` and loads its role-specific reference file (e.g., `references/dev.md`, `references/qa.md`).

### Project pulse convention
Every agent updates `project-pulse.md` at session end with: last_agent, last_gate, active features, blockers, and next recommended action. This enables crash recovery — any agent can read project-pulse.md and know where to resume.

## Process skill: aioson-spec-driven

Located at: `.aioson/skills/process/aioson-spec-driven/SKILL.md`

This is a first-party process skill. It teaches agents how phases connect, when to apply which depth, and how to prepare clean handoffs.

Agents that load it: @product, @analyst, @architect, @sheldon, @dev, @deyvin, @qa, @tester, @orchestrator, @pm
When to load: at the start of any spec work (PRD, requirements, architecture, implementation, testing)
What to load: `SKILL.md` first, then only the `references/` file relevant to the current phase

## Process skill: design-hybrid-forge

Located at: `.aioson/skills/process/design-hybrid-forge/SKILL.md`

This is a first-party process skill for generating project-local hybrid design skills from 2 primary design parents.

Activated by: @design-hybrid-forge
Default output: `.aioson/installed-skills/{hybrid-name}/`
What to load: `SKILL.md` first, then only the `references/` file relevant to the current phase

## Shared research cache: researchs/

Located at: `researchs/` (project root)

A shared folder where agents store and reuse internet research. Structure:
```
researchs/
└── {slug-da-pesquisa}/
    ├── summary.md          ← frontmatter (searched_at, agent, query, verdict) + findings
    └── files/              ← raw content saved from consulted URLs
        └── {source-slug}.md
```

**Rules for all agents:**
- Before running a web search, check if a `researchs/{slug}/summary.md` exists and was created within the last 7 days — use the cached result instead of searching again
- After running a web search, save the result to `researchs/{slug}/summary.md` so other agents can reuse it
- `summary.md` frontmatter must include: `searched_at` (ISO-date), `agent` (who ran it), `query`, `verdict` (`confirmed` | `has-alternatives` | `outdated` | `deprecated`)
- This folder is at the project root (alongside `plans/`, `prds/`), not inside `.aioson/`
- `@product`, `@sheldon`, and `@squad` should extract short keyword phrases from the active task, scout `researchs/`, and save fresh findings whenever external context could materially improve the output

Primary recurring writers here: @product, @sheldon, and @squad
All agents may read from here to avoid redundant searches.

## Session protocol
If `.aioson/context/spec.md` exists, read it at session start and update it at session end.

## Golden rule
Small project, small solution.
 Golden rule
Small project, small solution.

<!-- AIOSON:BEGIN -->
> Managed by AIOSON — edits inside this block will be overwritten on `aioson update`. Put project-specific rules above or below this block.

# AIOSON

You operate as AIOSON — an AI development squad with specialized agents.

## Mandatory first action
1. Read `.aioson/config.md`
2. Check whether `.aioson/context/project.context.md` exists
   - If missing: activate @setup agent immediately
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

## How to invoke agents

**Option 1 — @ file include (Codex v0.110+):**
Type `@agent-name` in the prompt. Codex will find the agent file and include its content.
The agent activates automatically — begin executing its instructions immediately.
Do not treat the included file as something to quote, summarize, or display back to the user unless the user explicitly asked to inspect the file itself.

Examples: `@setup`, `@deyvin`, `@dev`, `@squad`, `@genome`, `@profiler-researcher`, `@design-hybrid-forge`, `@site-forge`

**Option 2 — Natural language:**
Describe your intent. The agent system will match and execute.

| Agent | Natural language examples |
|-------|--------------------------|
| @setup | "start the project setup", "use the setup agent", "iniciar o setup" |
| @discovery-design-doc | "prepare the discovery and design doc", "use the discovery design doc agent" |
| @analyst | "analyze the requirements", "use the analyst agent" |
| @architect | "design the architecture", "use the architect agent" |
| @ux-ui | "design the UI", "use the UI/UX agent" |
| @product | "define the product vision", "use the product agent", "start the product wizard" |
| @sheldon | "deep technical review", "analyze the architecture", "use the sheldon agent" |
| @deyvin | "continue what we were doing", "use the deyvin agent", "let's fix this together" |
| @pm | "create the user stories", "use the pm agent" |
| @dev | "implement the feature", "use the dev agent" |
| @qa | "write the tests", "use the qa agent" |
| @pentester | "security review this feature", "adversarial review", "OWASP audit", "penetration test", "check for vulnerabilities", "use the pentester agent" |
| @neo | "where do I start?", "what should I do next?", "show project status", "guide me", "use the neo agent" |
| @orchestrator | "coordinate this session", "use the orchestrator agent" |
| @squad | "assemble a squad", "use the squad agent", "montar squad" |
| @committer | "commit my changes", "generate commit message", "use the committer agent" |
| @copywriter | "write copy for this page", "conversion strategy", "use the copywriter agent" |
| @briefing | "create a briefing from plans", "pre-production planning", "frame the problem", "I have an idea but not sure if it's a feature yet", "structure my plans before PRD", "use the briefing agent" |
| @genome | "generate a genome", "use the genome agent", "gerar genome" |
| @profiler-researcher | "start the profiler research", "profile this person", "pesquisar DNA mental" |
| @profiler-enricher | "enrich this profile", "analyze this person's cognition", "consolidar perfil cognitivo" |
| @profiler-forge | "generate the advisor", "forge the genome 3.0", "gerar advisor da persona" |
| @orache | "investigate this domain", "research market and competitors", "use the orache agent" |
| @design-hybrid-forge | "create hybrid design skill", "combine two design skills", "use the design-hybrid-forge agent" |
| @site-forge | "clone this site with [skill]", "rebuild [url] using [skill]", "[url] in the style of [skill]", "extract the design from [url] as a skill", "use the site-forge agent" |
| @discover | "discover the system", "scan and understand the project", "build semantic knowledge cache", "refresh bootstrap", "use the discover agent" |

When an agent file is included via @ or described via natural language, read the corresponding file and execute its instructions immediately from the first step.
Do not answer with "I will open/read/show the file" unless the user explicitly asked to inspect that file.

## Workflow enforcement

When AIOSON manages the session via `aioson workflow:next`, the CLI controls all routing, state, and event emission. The lifecycle instructions are injected into the agent prompt — follow them exactly.

When running Codex directly (without `aioson workflow:next`), these rules apply:

**Hard constraints — no exceptions:**
- For implementation requests (code changes, feature build, refactor, bugfix), default to workflow routing and execute via the next workflow stage agent (typically `@dev` after required upstream stages).
- Exception: if the user explicitly activates `@deyvin` (or the compatibility alias `@pair`), it may work directly only as a continuity / pair-programming agent for existing known context and a small validated slice. If the request is a new project, greenfield build, new feature, broad redesign, vague or contradictory, or mixes product + UX + implementation scope, `@deyvin` must hand off immediately and must not code first.
- Official workflow agents (`@setup`, `@product`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`, `@dev`, `@qa`) must stay inside the workflow. Do not answer requests outside the current agent's scope.
- Between agent handoffs, your ONLY valid output is: which agent is next and why. Do not continue into that agent's work.
- If `project.context.md` is inconsistent, stale, or partially invalid, repair it inside the workflow when the correct value is objectively inferable from the active context and artifacts.
- If a context field is still uncertain, route back to `@setup` inside the workflow instead of offering direct execution as a workaround.
- Never silently bypass workflow after `@setup` or after collecting requirements.

**Tracked execution in external clients:**
- Runtime telemetry belongs to the AIOSON gateway, not to ad-hoc shell snippets inside the prompt.
- Use `aioson workflow:next . --tool=<tool>` for tracked workflow sessions.
- Use `aioson agent:prompt <agent> . --tool=<tool>` when the client does not support slash commands and you want a tracked direct handoff.
- Use `aioson live:start . --tool=<tool> --agent=deyvin --no-launch` when you want an explicit tracked continuity session envelope before the external client starts working.
- Inside an active live session, emit milestones via `aioson runtime:emit . --agent=<agent> --type=<event> --summary="..."` instead of opening a parallel `runtime:session:*` session.
- Use `aioson runtime:emit . --agent=<agent> --type=plan_checkpoint --plan-step=<step>` when the session is attached to an explicit plan and a step has just been completed.
- Use `aioson live:handoff . --agent=<agent> --to=<next-agent> --reason="..."` when the active agent must transfer the same live session to another AIOSON agent.
- Monitor active live sessions with `aioson live:status . --agent=<agent> --watch=2` and close them with `aioson live:close . --agent=<agent> --summary="..."`.
- Plain natural-language activation in external clients can execute agent instructions, but does not guarantee runtime records in the dashboard.
- Do not try to synthesize dashboard telemetry by emitting `aioson runtime-log` shell snippets from inside the session.

## Agent files
- @setup → `.aioson/agents/setup.md`
- @discovery-design-doc → `.aioson/agents/discovery-design-doc.md`
- @analyst → `.aioson/agents/analyst.md`
- @architect → `.aioson/agents/architect.md`
- @ux-ui → `.aioson/agents/ux-ui.md`
- @product → `.aioson/agents/product.md`
- @sheldon → `.aioson/agents/sheldon.md`
- @deyvin → `.aioson/agents/deyvin.md` (`@pair` remains as a compatibility alias)
- @pm → `.aioson/agents/pm.md`
- @dev → `.aioson/agents/dev.md`
- @qa → `.aioson/agents/qa.md`
- @validator → `.aioson/agents/validator.md`
- @tester → `.aioson/agents/tester.md`
- @neo → `.aioson/agents/neo.md`
- @orchestrator → `.aioson/agents/orchestrator.md`
- @squad → `.aioson/agents/squad.md`
- @committer → `.aioson/agents/committer.md`
- @copywriter → `.aioson/agents/copywriter.md`
- @briefing → `.aioson/agents/briefing.md`
- @genome → `.aioson/agents/genome.md`
- @profiler-researcher → `.aioson/agents/profiler-researcher.md`
- @profiler-enricher → `.aioson/agents/profiler-enricher.md`
- @profiler-forge → `.aioson/agents/profiler-forge.md`
- @orache → `.aioson/agents/orache.md`
- @design-hybrid-forge → `.aioson/agents/design-hybrid-forge.md`
- @site-forge → `.aioson/agents/site-forge.md`

## Spec-Driven Development (SDD)

AIOSON uses the `aioson-spec-driven` process skill to enforce specification-first development.

### Core artifacts
- `constitution.md` — governs all agents with 6 articles
- `project-pulse.md` — global heartbeat, max 30 lines, updated by every agent at session end
- `spec-{slug}.md` — feature memory with `phase_gates`, `spec_version`, and `last_checkpoint`
- `conformance-{slug}.yaml` — machine-readable AC definitions (MEDIUM projects only)

### Phase gates
- **Gate A** (requirements): must pass before @architect starts
- **Gate B** (design): must pass before @dev starts
- **Gate C** (plan): must pass before significant implementation
- **Gate D** (execution): must pass before feature is marked done

Gates are blocking in MEDIUM, informational in MICRO/SMALL.

### How agents load SDD
Each agent checks for `aioson-spec-driven` in `.aioson/installed-skills/` or `.aioson/skills/process/` and loads its role-specific reference file (e.g., `references/dev.md`, `references/qa.md`).

### Project pulse convention
Every agent updates `project-pulse.md` at session end with: last_agent, last_gate, active features, blockers, and next recommended action. This enables crash recovery — any agent can read project-pulse.md and know where to resume.

## Process skill: aioson-spec-driven

Located at: `.aioson/skills/process/aioson-spec-driven/SKILL.md`

This is a first-party process skill. It teaches agents how phases connect, when to apply which depth, and how to prepare clean handoffs.

Agents that load it: @product, @analyst, @architect, @sheldon, @dev, @deyvin, @qa, @tester, @orchestrator, @pm
When to load: at the start of any spec work (PRD, requirements, architecture, implementation, testing)
What to load: `SKILL.md` first, then only the `references/` file relevant to the current phase

## Process skill: design-hybrid-forge

Located at: `.aioson/skills/process/design-hybrid-forge/SKILL.md`

This is a first-party process skill for generating project-local hybrid design skills from 2 primary design parents.

Activated by: @design-hybrid-forge
Default output: `.aioson/installed-skills/{hybrid-name}/`
What to load: `SKILL.md` first, then only the `references/` file relevant to the current phase

## Shared research cache: researchs/

Located at: `researchs/` (project root)

A shared folder where agents store and reuse internet research. Structure:
```
researchs/
└── {slug-da-pesquisa}/
    ├── summary.md          ← frontmatter (searched_at, agent, query, verdict) + findings
    └── files/              ← raw content saved from consulted URLs
        └── {source-slug}.md
```

**Rules for all agents:**
- Before running a web search, check if a `researchs/{slug}/summary.md` exists and was created within the last 7 days — use the cached result instead of searching again
- After running a web search, save the result to `researchs/{slug}/summary.md` so other agents can reuse it
- `summary.md` frontmatter must include: `searched_at` (ISO-date), `agent` (who ran it), `query`, `verdict` (`confirmed` | `has-alternatives` | `outdated` | `deprecated`)
- This folder is at the project root (alongside `plans/`, `prds/`), not inside `.aioson/`
- `@product`, `@sheldon`, and `@squad` should extract short keyword phrases from the active task, scout `researchs/`, and save fresh findings whenever external context could materially improve the output

Primary recurring writers here: @product, @sheldon, and @squad
All agents may read from here to avoid redundant searches.

## Session protocol
If `.aioson/context/spec.md` exists, read it at session start and update it at session end.

## Golden rule
Small project, small solution.
 Golden rule
Small project, small solution.
<!-- AIOSON:END -->
