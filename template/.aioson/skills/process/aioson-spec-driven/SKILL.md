# Skill: aioson-spec-driven

> Process methodology skill. Covers: phase sequencing, artifact contracts, approval gates, and hardening lane.
> Load this file first. Then load only the `references/` file relevant to your current role and phase.

## When to use

Load this skill when:
- starting spec work for a new feature or project (any agent)
- deciding phase depth based on classification (MICRO / SMALL / MEDIUM)
- preparing a clean handoff to the next agent
- retaking work after a session break (check `last_checkpoint` + `phase_gates` first)

Do NOT load the entire `references/` folder. Load only the file matching your current need.

## What phases exist

| Phase | AIOSON artifact | Primary agent | MICRO | SMALL | MEDIUM |
|-------|----------------|---------------|-------|-------|--------|
| Specify | `prd*.md` | @product | lite | full | full |
| Research/Discuss | `sheldon-enrichment*.md` | @sheldon | optional | recommended | required |
| Requirements | `requirements-{slug}.md` | @analyst | skip | required | required |
| Alignment Check | `scope-check*.md` | @scope-check | skip | early | final before dev |
| Design | `architecture.md`, `design-doc*.md` | @architect | skip | selective | required |
| Tasks/Plan | `implementation-plan*.md` | @dev | optional | recommended | required |
| Execute | code, commits, spec updates | @dev, @deyvin | — | — | — |
| State/Resume | `spec*.md`, runtime | @dev, @deyvin | — | — | — |

## Phase depth by classification

- **MICRO**: Specify (lite) + Execute. Skip Requirements, Design, Plan unless complexity warrants it.
- **SMALL**: Specify + Requirements + scope check + selective Design + Plan. @sheldon recommended before downstream.
- **MEDIUM**: Full pack — all phases, all artifacts, @sheldon validation before @analyst, final scope check before @dev, implementation plan required.

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
