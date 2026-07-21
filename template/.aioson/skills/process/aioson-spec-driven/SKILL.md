# Skill: aioson-spec-driven

> Process methodology skill. Covers: phase sequencing, artifact contracts, approval gates, and hardening lane.
> Load this file first. Then load only the `references/` file relevant to your current role and phase.

## When to use

Load this skill when:
- starting spec work for a new feature or project (any agent)
- deciding phase depth based on classification (MICRO / SMALL / MEDIUM)
- preparing a clean handoff to the next agent
- retaking work after a session break (check `last_checkpoint` + `phase_gates` first)

Do not load this skill for `@deyvin` activation-only recovery. A bare `@deyvin` activation is status recovery, not spec work; run Deyvin's fast path and stop before opening this file.

Do NOT load the entire `references/` folder. Load only the file matching your current need.

## What phases exist

| Phase | AIOSON artifact | Primary agent | MICRO | SMALL | MEDIUM |
|-------|----------------|---------------|-------|-------|--------|
| Specify | `prd*.md` | @product | lite | full | full |
| Research/Discuss | `sheldon-enrichment*.md` | @sheldon | optional | recommended | required |
| Requirements | `requirements-{slug}.md` | @analyst | skip | required | required |
| Alignment Check | `scope-check*.md` | @scope-check (detour) | skip | opt-in detour | opt-in detour |
| Design | `architecture.md`, `design-doc*.md` | @architect | skip | selective | required |
| Tasks/Plan | `implementation-plan*.md` | @dev | optional | recommended | required |
| Execute | code, commits, spec updates | @dev, @deyvin | — | — | — |
| State/Resume | `spec*.md`, runtime | @dev, @deyvin | — | — | — |

## Phase depth by classification

- **MICRO**: Specify (lite) + Execute. Skip Requirements, Design, Plan unless complexity warrants it.
- **SMALL**: lean by default — Specify (`@product`) + `@sheldon` as the single spec authority (requirements + ACs, design-doc + readiness, plan, and harness contract in one pass) → `@dev` → `@qa`. The heavier multi-agent chain (`@analyst` + selective Design + `@scope-check` detour) is an opt-in escape hatch.
- **MEDIUM**: `@orchestrator` maestro — `@product → @orchestrator → @dev → initial @qa → enabled/triggered @tester/@pentester → final @qa` (feature). `agent-execution-{slug}.json` controls reviewer participation. `@orchestrator` is the single spec authority: it fans out to `@analyst` + `@architect` + `@pm` (+ `@ux-ui` when UI-heavy) as sub-agents, then consolidates/verifies/redoes their output into one gated spec package (requirements + spec[Gates A/B/C] + design-doc + readiness + implementation-plan + harness-contract) for `@dev` — the horizontal counterpart to `@sheldon`'s lean lane. `@analyst`, `@architect`, `@pm`, `@discovery-design-doc`, `@scope-check`, and `@ux-ui` are no longer default hops (sub-agents the orchestrator invokes) and remain opt-in detours; `@architect`'s merged mode survives only for the opt-in full-chain detour. The deterministic drift check (`spec:analyze`) runs at the `@dev`/`@qa` done gate, not as a separate scope-check hop. Implementation plan required.

**Lean lane (SMALL default; opt-in for MEDIUM):** `@product → @sheldon → @dev → @qa`, where `@sheldon` runs **Lean lane mode (RF-LEAN)** and produces the requirements/ACs, design-doc + readiness, implementation plan, and §2c runtime-gated harness contract in one pass — replacing the analyst/architect/discovery-design-doc/pm hops. SMALL runs this by default; MEDIUM opts in via `.aioson/context/workflow.config.json`. See `.aioson/docs/workflow-lean-lane.md`. The runtime smoke gate is mandatory in both lanes.

## References available

Load the file that matches your current context — do not load all at once:

| File | Load when |
|------|-----------|
| `references/artifact-map.md` | You need to know which artifact lives where and who owns it |
| `references/classification-map.md` | You need to decide phase depth for a project or feature |
| `references/approval-gates.md` | You are preparing a handoff and need to know what must be ready |
| `references/hardening-lane.md` | The input is vague, exploratory, or "vibe-style" and needs to be converted |
| `references/maintenance-and-state.md` | You are writing or reading `spec*.md`, checkpoints, or retaking work |
| `references/ui-language.md` | You need to present options, status symbols, or checkpoints to the user with consistent visual standards |
| `references/qa.md` | You are running QA review and need Gate D verification criteria or artifact validation |
