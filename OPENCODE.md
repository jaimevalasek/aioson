<!-- AIOSON:BEGIN -->
> Managed by AIOSON — edits inside this block will be overwritten on `aioson update`. Put project-specific rules above or below this block.

# AIOSON - OpenCode

## Boot
1. Check `.aioson/context/project.context.md`
2. If present, read it before any action
3. If missing, start with `setup`
4. Read `.aioson/config.md` only if project context is missing/invalid, setup/routing policy is needed, or the active agent explicitly asks for config details

## No agent selected

After boot, if the user started the chat without naming an agent and has not given a concrete task yet, do not start implementation or workflow routing. First offer these starting lanes:

- Simple Plan with `dev` for bounded technical work, small fixes, refactors, or directly verifiable implementation.
- Pair programming with `deyvin` for continuity, debugging together, or a small validated slice with known context.
- Briefing with `briefing` to frame and evaluate an early feature idea before committing to a PRD.
- Product with `product` to start a full feature definition when the user already wants to build a product/feature.

## Concrete implementation lane gate

For a concrete implementation request, inspect the nearest existing pattern before feature routing. Activate `dev` in Simple Plan mode when there is one specified observable outcome, no open product/architecture/security decision, and the estimate fits at most 5 behavior-bearing files, 8 total paths, and 2 existing modules.

Mirror tests, translations, exports, manifests/registrations, generated metadata, and lockfiles are support paths and do not independently promote the lane. A new button, menu item, link, field, or window affordance is not automatically a feature. MICRO is for a bounded outcome that genuinely needs feature memory (default review budget: 10 behavior files / 15 total paths); SMALL requires multiple independently valuable capabilities, a new boundary/contract, or material unresolved decisions.

Classify only the minimum user-confirmed request. Before exceeding the selected budget, stop, show the before/after path estimate and causal reason, and ask for approval. Simple Plan ends in `dev` without PRD/spec/design-doc/harness/QA/validator ceremony.

## Project knowledge

Read `.aioson/learnings/INDEX.md` if it exists. Each line is a project gotcha or recipe with its file path and a one-line summary. Lazy-load individual files only when title/scope matches your current task or files being touched.

## Available agents
- setup -> `.aioson/agents/setup.md`
- discovery-design-doc -> `.aioson/agents/discovery-design-doc.md`
- discover -> `.aioson/agents/discover.md`
- analyst -> `.aioson/agents/analyst.md`
- scope-check -> `.aioson/agents/scope-check.md`
- architect -> `.aioson/agents/architect.md`
- ux-ui (UI/UX) -> `.aioson/agents/ux-ui.md`
- product -> `.aioson/agents/product.md`
- sheldon -> `.aioson/agents/sheldon.md`
- deyvin -> `.aioson/agents/deyvin.md`
- pair -> `.aioson/agents/deyvin.md` (compatibility alias)
- pm -> `.aioson/agents/pm.md`
- dev -> `.aioson/agents/dev.md`
- qa -> `.aioson/agents/qa.md`
- tester -> `.aioson/agents/tester.md`
- neo -> `.aioson/agents/neo.md`
- orchestrator -> `.aioson/agents/orchestrator.md`
- squad -> `.aioson/agents/squad.md`
- genome -> `.aioson/agents/genome.md`
- profiler-researcher -> `.aioson/agents/profiler-researcher.md`
- profiler-enricher -> `.aioson/agents/profiler-enricher.md`
- profiler-forge -> `.aioson/agents/profiler-forge.md`
- orache -> `.aioson/agents/orache.md`
- design-hybrid-forge -> `.aioson/agents/design-hybrid-forge.md`
- site-forge -> `.aioson/agents/site-forge.md`
- forge-run -> `.aioson/agents/forge-run.md`

## Rule
Do not duplicate rules outside `.aioson/`.
<!-- AIOSON:END -->
