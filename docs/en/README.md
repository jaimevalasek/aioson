# AIOSON Documentation — English

> **AIOSON** is a framework that gives every AI session a **role**, a **protocol**, and a **lifecycle**.
> Instead of one giant prompt trying to do everything, specialized agents take turns: each owns one slice (discover, plan, implement, test, review) and hands off cleanly to the next.

This is the entry door to the English documentation. It is not an alphabetical index — it is a **map by trails**. Pick yours and follow it.

---

## Trails — pick yours

### I'm new here, I want to understand AIOSON in 15 minutes
1. [What is AIOSON](./1-understand/what-is-aioson.md) — simple analogy and what it solves
2. [Why it exists](./1-understand/why-it-exists.md) — the prompt-monolith problem
3. [Ecosystem map](./1-understand/ecosystem-map.md) — diagram of the agents
4. [Glossary](./1-understand/glossary.md) — every term in one place

### I want to use AIOSON now, on a project
1. [First project from scratch](./2-start/first-project.md) — step by step, with real dialogues
2. [On an existing project](./2-start/existing-project.md) — install + scan + first feature
3. [Initial decisions](./2-start/initial-decisions.md) — MICRO, SMALL, or MEDIUM? Which AI client?

### I want a recipe ready for my case

**Canonical trails — how features reach the dev:**
1. **[Full feature with @sheldon](./3-recipes/full-feature-with-sheldon.md)** — the main trail: `@product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa` (with optional gates from `@tester` and `@pentester`)
2. [From idea to PRD via @briefing](./3-recipes/from-idea-to-prd-via-briefing.md) — when the idea is still vague
3. [Continuity between sessions](./3-recipes/continuity-between-sessions.md) — feature dossier, dev-resume, drift detection

**By scenario** — translation pending; the canonical PT versions are listed for reference:
- External plans for @product *(coming soon — [PT](../pt/3-receitas/plans-externos-para-product.md))*
- Landing page *(coming soon — [PT](../pt/3-receitas/landing-page.md))*
- SaaS app from scratch *(coming soon — [PT](../pt/3-receitas/app-saas-do-zero.md))*
- Integration in large codebase *(coming soon — [PT](../pt/3-receitas/integracao-em-codebase-grande.md))*
- Large refactor *(coming soon — [PT](../pt/3-receitas/refatoracao-grande.md))*
- Security audit *(coming soon — [PT](../pt/3-receitas/auditoria-seguranca.md))*
- Publish on aioson.com *(coming soon — [PT](../pt/3-receitas/publicar-no-aioson-com.md))*
- Clone site design *(coming soon — [PT](../pt/3-receitas/clonar-design-de-site.md))*

See [3-recipes/README.md](./3-recipes/README.md) for the full list.

### I want the technical reference for an agent or command
- **[Agent cards (in progress)](./4-agents/README.md)** — stub today; full set is in [docs/pt/4-agentes/](../pt/4-agentes/README.md) (28 cards)
- **[Technical reference](./5-reference/README.md)** — 11 docs migrated from the previous flat structure (CLI, MCP, parallel, QA browser, squad dashboard, web3, i18n, JSON schemas, release flow)

### Highlights of `5-reference/`
- [CLI reference](./5-reference/cli-reference.md) — every command in one place
- [JSON schemas](./5-reference/json-schemas.md) — `--json` output contracts
- [MCP guide](./5-reference/mcp.md) — Model Context Protocol setup
- [Parallel orchestration](./5-reference/parallel.md) — multi-lane execution
- [Browser QA](./5-reference/qa-browser.md) — Playwright-based smoke runs
- [Squad Dashboard](./5-reference/squad-dashboard.md) — real-time monitoring panel
- [Web3 guide](./5-reference/web3.md) — Hardhat/Foundry/Anchor support
- [i18n](./5-reference/i18n.md) — localization layer
- **[Active Learning Loop](./active-learning-loop/README.md)** — automatic distillation in `feature:close` + BM25 search over learnings + archive/restore with `evolution_log` + 3 new curation checks in doctor
- **[Deyvin Sub-Task Scout](./deyvin-subtask-scout/README.md)** — `@deyvin`'s structured diagnostic primitive: `scout:prep/validate/commit`, isolated context, configurable caps, feature archival

---

## Quick glossary

Terms that show up everywhere. Expanded version in [`1-understand/glossary.md`](./1-understand/glossary.md).

| Term | What it is |
|---|---|
| **Agent** | A specialist persona (`@product`, `@dev`, `@qa`...) with its own prompt and rules |
| **Squad** | A group of custom agents you build for a specific domain |
| **Genome** | The "cognitive DNA" of a persona — used to build advisors with personality |
| **Skill** | A pluggable instruction package (design system, process, domain knowledge) |
| **Dossier** | A feature folder: spec, plan, decisions, status — everything in one place |
| **Classification** | MICRO / SMALL / MEDIUM — defines how much process the project needs |
| **Constitution** | 6 principles every agent respects — non-overridable |

---

## In three commands

```bash
# 1. Install on your machine (one time)
npx @jaimevalasek/aioson init my-project

# 2. Enter the project
cd my-project

# 3. Open your AI client (Claude Code, Codex e OpenCode) and type:
/aioson:agent:setup
```

From there, the agents guide you. Details in [First project from scratch](./2-start/first-project.md).

---

## Other languages

- **Portuguese (`docs/pt/`)** — the canonical reformed documentation: 81 active docs, 5 layers, ~92k words. Use it as a reference whenever an English doc has not been translated yet.
- **Spanish, French** — not started.

---

## Status of this documentation

This English portal is being **incrementally translated** from `docs/pt/`. The phased rollout is:

**Phase 1 (Phased rollout, current)** — entry-door layers translated:
- 1-understand (4 docs) ✓
- 2-start (3 docs) ✓
- 3-recipes (3 canonical trails + index) ✓
- 5-reference (11 docs migrated from previous flat structure) ✓
- 4-agents (stub README; full agent cards pending)

**Phase 2 (next)** — remaining 8 scenario recipes in 3-recipes/.
**Phase 3 (next)** — 28 agent cards in 4-agents/.
**Phase 4 (next)** — remaining ~18 reference docs in 5-reference/ (feature-dossier, agent-chain-continuity, sdd-framework, live-sessions, secure-by-default, aioson-com-store, etc.).

For anything not yet in English, the PT version is current and authoritative — the AIOSON behaviors, agent prompts, and CLI commands are language-agnostic.
