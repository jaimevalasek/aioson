# AIOSON - OpenCode

## Boot
1. Read `.aioson/config.md`
2. Check `.aioson/context/project.context.md`
3. If missing, start with `setup`

## No agent selected

After boot, if the user started the chat without naming an agent and has not given a concrete task yet, do not start implementation or workflow routing. First offer these starting lanes:

- Simple Plan with `dev` for bounded technical work, small fixes, refactors, or directly verifiable implementation.
- Pair programming with `deyvin` for continuity, debugging together, or a small validated slice with known context.
- Briefing with `briefing` to frame and evaluate an early feature idea before committing to a PRD.
- Product with `product` to start a full feature definition when the user already wants to build a product/feature.

## Project knowledge

Read `.aioson/learnings/INDEX.md` if it exists. Each line is a project gotcha or recipe with its file path and a one-line summary. Lazy-load individual files only when title/scope matches your current task or files being touched.

## Available agents
- setup -> `.aioson/agents/setup.md`
- discovery-design-doc -> `.aioson/agents/discovery-design-doc.md`
- discover -> `.aioson/agents/discover.md`
- analyst -> `.aioson/agents/analyst.md`
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

## Rule
Do not duplicate rules outside `.aioson/`.
