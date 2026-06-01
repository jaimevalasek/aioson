---
description: "System-wide AIOSON cost and context optimization analysis across agents, skills, genomes, rules, docs, context memory, and model-routing surfaces."
agents: [architect, dev, qa, sheldon, squad]
created_at: "2026-06-01"
status: analysis
---

# AIOSON Cost Optimization Analysis

## Scope

This analysis reviews AIOSON's agent, skill, genome, rule, docs, context, and runtime surfaces with one goal: keep behavior equal or better while reducing token spend and avoiding stale or irrelevant context loading.

The project already has several strong primitives:

- English canonical prompts plus localized user-facing replies.
- `context:pack` for scoped context.
- `memory:trim` for hot/cold bootstrap retention.
- `agent:audit` for prompt size measurement.
- `agent:load` / `AgentLoader` for shard-based agent loading.
- `modelTier` for squads.
- `scan:project` with configurable LLM provider.

The main gap is not "invent cost discipline"; it is enforcing the existing primitives as default behavior.

## Confirmed Measurements

### Context load

`aioson context:health .` reported an estimated `~52,472` tokens across context files currently visible to agents.

Largest hot-path files:

- `.aioson/context/architecture.md` — `39.7KB`, `~10,163` tokens.
- `.aioson/context/bootstrap/current-state.md` — `26.9KB`, `~6,898` tokens.
- `.aioson/context/context-pack.md` — `18.1KB`, `~4,634` tokens.
- `.aioson/context/prd-gemini-phaseout.md` — `14.1KB`, `~3,619` tokens.
- `.aioson/context/discovery.md` — `10.7KB`, `~2,736` tokens.

`memory:trim --dry-run` would archive 15 of 27 current-state entries and reduce `current-state.md` from `27,734` bytes to `19,138` bytes, saving `8,596` bytes. It still leaves the hot log above the governance target of about `10KB`.

### Agent prompt size

`aioson agent:audit .` scanned template and workspace agents plus auto-loaded entrypoints.

Headline result:

- `62` files scanned.
- `~266,926` estimated tokens if counted together.
- `20` files over hard limit.
- `24` files over target.
- `~20,602` tokens/session identified as on-demand split savings by the current heuristic.

Largest prompt surfaces:

- `genome.md` — `87KB`, about `22.3k` tokens, `1,904` lines.
- `copywriter.md` — `44KB`, about `11.3k` tokens, `938` lines.
- `tester.md` — `27.5KB`, about `7k` tokens.
- `pentester.md` — `24.9KB`, about `6.4k` tokens.
- `neo.md` — `24.3KB`, about `6.2k` tokens.
- `qa.md` — `21.5KB`, about `5.5k` tokens.
- Root `AGENTS.md` — `25.9KB`, above the auto-loaded hard limit.
- Root `CLAUDE.md` — `14.1KB`, above the auto-loaded hard limit.

The audit double-counts template and workspace files in inception mode. That is useful for parity checks, but not for installed-project runtime cost. The audit should report these as separate categories.

### Shard loader

`agent:load genome --goal="generate a compact genome from persona sources" --json` selected 3 shards and `802` tokens out of 122 shards.

`agent:load copywriter --goal="write landing page copy with funnel framework" --json` selected 3 shards and `292` tokens out of 87 shards.

This proves the shard loader can massively reduce activation cost. The issue is that `agent:prompt` still builds the full prompt path and does not use shard loading by default.

### Stale context routing

`context:pack --agent=architect --goal="analisar agentes skills genomes rules docs custo tokens gaps economia gpt-5.5" --json` selected `.aioson/context/features/gemini-phaseout/dossier.md` even though `project-pulse.md` says `active_feature: (none)`.

`features.md` still marks `gemini-phaseout` as `in_progress`, which explains the selection, but it is wrong for unrelated system-wide analysis. This is a retrieval precision issue: stale active features can leak into new work.

### Classification drift

`.aioson/context/project.context.md` says `classification: MEDIUM`.

`workflow:status` reported `Project: aioson (SMALL)` for the current workflow state.

This drift affects phase depth, security strictness, and how aggressively agents load context.

## OpenAI Cost Patterns Relevant To AIOSON

Current OpenAI docs and model pages support the following product-level levers:

- Prompt caching reduces latency and input cost when static prompt prefixes are stable. For GPT-5.5, extended 24h prompt caching is the supported cache mode.
- Batch API gives lower-cost asynchronous processing for evaluations, classification, embeddings, and other non-immediate jobs.
- Flex processing gives lower cost for Responses/Chat Completions in exchange for slower and sometimes unavailable capacity.
- GPT-5.5 is the frontier model for complex reasoning and coding; lower-cost variants like GPT-5.4, GPT-5.4 mini, and GPT-5.4 nano are recommended when optimizing for cost/latency.
- GPT-5.5 pricing has a long-context threshold: prompts above 272K input tokens are priced at a higher multiplier for the full session.

AIOSON should treat these as architecture constraints:

- Stable, canonical English prompt prefixes are good because they improve cache-hit probability.
- Variable project data must be appended after static agent instructions.
- Large analyses, audits, evals, role scans, and marketplace enrichment should be queueable as Batch/Flex-style workloads when AIOSON owns the LLM call.
- The default model strategy should be tiered by task and risk, not "one best model for everything".

## Priority Findings

### P0 — Auto-loaded entrypoints are too large

`AGENTS.md` and `CLAUDE.md` exceed the stated auto-loaded budget. This is the most direct cost risk because the harness can load them before any project-level intelligence decides what is relevant.

Recommended fix:

- Make root entrypoints thin routers only.
- Move long AIOSON managed protocol sections into `.aioson/docs/entrypoint/`.
- Keep only mandatory first action, agent invocation map, and workflow routing in auto-loaded files.
- Add a test that fails when root entrypoints exceed 3,500 chars or 4,000 hard.

Expected impact: lower every session's fixed token floor.

### P0 — `agent:prompt` should support shard mode

`agent:load` proves that large agents can be reduced from tens of thousands of tokens to hundreds for a given goal. But direct handoff still uses full `buildAgentPrompt`.

Recommended fix:

- Add `agent:prompt --sharded --goal="<task>"`.
- Or make shard mode automatic when agent file exceeds threshold and a goal is available.
- Always include invariant shards: language boundary, mission, required input, hard constraints, observability.
- Add a fallback to full prompt when no relevant shard is found.

Expected impact: largest savings for `genome`, `copywriter`, `tester`, `pentester`, `neo`, and `qa`.

### P0 — Stale active features pollute `context:pack`

`context:pack` selected `gemini-phaseout` for an unrelated system analysis because `features.md` still has it `in_progress`.

Recommended fix:

- If `project-pulse.md` says no active feature, do not auto-include any dossier unless the goal explicitly matches the slug or title.
- Add `--exclude-active-feature` / `--project-mode` option for system-wide work.
- In `context:health`, warn when `features.md` says active/in_progress but `project-pulse.md` says none.

Expected impact: fewer irrelevant tokens and fewer wrong assumptions in broad sessions.

### P0 — Classification drift needs one source of truth

The same project is MEDIUM in `project.context.md` and SMALL in workflow status.

Recommended fix:

- `workflow:status` should display both project classification and active feature classification, clearly labeled.
- `context:validate` should warn on drift when workflow state carries a different classification than `project.context.md`.
- Agents should resolve security and context depth from feature classification when a feature is active; otherwise project classification.

Expected impact: prevents overloading MEDIUM artifacts for SMALL features and under-enforcing MEDIUM project policies.

### P1 — Agent audit should separate distribution cost from inception parity

The current audit counts both `template/.aioson/agents` and `.aioson/agents`, inflating runtime interpretation in the AIOSON repo.

Recommended fix:

- Split report into `canonical template`, `active workspace`, and `auto-loaded`.
- Add `--runtime-only`, `--template-only`, and `--inception` modes.
- Compute savings against the mode, not the merged set.

Expected impact: clearer prioritization and less noise in cost reports.

### P1 — `current-state.md` hot log is still too hot

The current hot log remains about `26.9KB`. Dry-run trimming saves only `8.6KB`, leaving it above target.

Recommended fix:

- Lower default `memory:trim --keep` for this repository from 25/12 style retention to a target-bytes policy.
- Add `--target-kb=10`.
- Make `context:health` recommend the exact command needed to hit target size.
- Move verbose shipped-slice entries to archive sooner and keep hot entries as one-line pointers.

Expected impact: every dev/qa/architect/deyvin activation becomes cheaper.

### P1 — Skills need the same audit and sharding discipline as agents

Many skills are larger than agents and can be loaded by trigger:

- `threejs-patterns.md` — `32.8KB`.
- design skill reference files commonly range from `12KB` to `26KB`.
- marketing references include large matrices.

Recommended fix:

- Add `skill:audit` equivalent to `agent:audit`.
- Enforce `SKILL.md` as a small router with a reference map.
- Add machine-readable trigger metadata for references: task types, required order, approximate tokens.
- For design skills, keep tokens and component references separate and load only the needed viewport/workflow class.

Expected impact: large UI/design/copy sessions stop loading encyclopedic references unnecessarily.

### P1 — Model tiering exists for squads but is too coarse

Current squad archetypes default many important roles to `powerful`, including developers and orchestrators. That is defensible for hard tasks, but too expensive as a default.

Recommended fix:

- Change default from role-based tiering to task-risk tiering.
- Use `none` for deterministic workers.
- Use `fast` for formatting, extraction, lint-like checks, short summarization.
- Use `balanced` for normal implementation and review.
- Use `powerful` only for high-ambiguity architecture, critical security, difficult debugging, or synthesis from conflicting sources.
- Store model-tier rationale in squad manifests.

Expected impact: lower squad cost without reducing quality where high reasoning matters.

### P1 — OpenAI-compatible scan calls do not expose cost parameters

`scan:project` uses Chat Completions-compatible calls with `temperature: 0.2` and max token fallback, but does not expose `service_tier`, prompt cache retention, prompt cache key, or Responses API.

Recommended fix:

- Add optional provider config fields:
  - `service_tier`
  - `prompt_cache_key`
  - `prompt_cache_retention`
  - `endpoint: "chat_completions" | "responses"`
  - `reasoning_effort`
  - `max_output_tokens`
- Keep defaults backward compatible.
- Only apply provider-specific parameters when supported.

Expected impact: cheaper scans for providers/models that support caching/flex, without breaking OpenAI-compatible providers.

### P2 — Full prompts should be structured for cache hit rate

Canonical English prompts are now aligned with prompt caching economics, but prefix stability can be improved.

Recommended fix:

- Keep static agent instructions first and identical across calls.
- Move dynamic activation context, project context, selected locale, feature slug, and user request to the end.
- Avoid injecting volatile timestamps into the static prefix.
- Where the API is owned by AIOSON, set stable `prompt_cache_key` values by agent+version+tool.

Expected impact: higher cache hit probability for repeated agent activations.

### P2 — Large generated artifacts need summaries and manifests

`architecture.md` is currently about `39.7KB`, and old feature artifacts remain prominent. Agents need a small index and explicit deep-load triggers.

Recommended fix:

- Add `architecture.summary.md` or a frontmatter summary section maintained by `context:pack`.
- Store large artifacts with section IDs and a table of concerns.
- Teach `context:pack` to select sections, not entire files, when a file exceeds a threshold.

Expected impact: broad technical sessions can load relevant architecture decisions without ingesting every historical phase.

## Recommended Execution Plan

### Slice 1 — Measurement correctness

- Add `agent:audit --runtime-only|--template-only|--inception`.
- Add `skill:audit`.
- Add `context:health` drift warnings for project/workflow classification and feature/pulse active-state mismatch.
- Add tests for these outputs.

### Slice 2 — Hot-path size reductions

- Slim root `AGENTS.md` and `CLAUDE.md`.
- Move managed long sections to docs.
- Add entrypoint size tests.
- Run `memory:trim` with a target-bytes mode after implementing it.

### Slice 3 — Sharded agent activation

- Add `agent:prompt --sharded --goal`.
- Auto-shard agents over threshold.
- Keep invariant sections always included.
- Add regression tests with `genome` and `copywriter` proving full prompt fallback and sharded savings.

### Slice 4 — Context retrieval precision

- Fix `context:pack` stale active-feature inclusion.
- Add project-mode/system-mode context selection.
- Add section-level loading for heavy artifacts.

### Slice 5 — Provider cost controls

- Extend `aioson-models.json` schema and scan provider call path with optional cost fields.
- Add OpenAI-specific mapping for cache/flex/reasoning where safe.
- Keep existing OpenAI-compatible providers unchanged unless config opts in.

### Slice 6 — Squad model economics

- Update squad archetypes and templates to task-risk model tiering.
- Add `squad:validate` warnings for unnecessary `powerful` tiers.
- Add ROI/cost estimate per squad plan from model tiers.

## Non-Goals

- Do not build a second orchestration motor.
- Do not force one vendor's model policy into AIOSON's core runtime.
- Do not localize canonical prompts again; localization belongs to user-facing output and reference maps.
- Do not delete historical context; archive it and retrieve by query.

## Source Notes

OpenAI docs consulted:

- GPT-5.5 model page: `https://developers.openai.com/api/docs/models/gpt-5.5`
- Models overview: `https://developers.openai.com/api/docs/models`
- Prompt caching guide: `https://developers.openai.com/api/docs/guides/prompt-caching`
- Batch API guide: `https://developers.openai.com/api/docs/guides/batch`
- Flex processing guide: `https://developers.openai.com/api/docs/guides/flex-processing`

Local commands run:

- `node bin/aioson.js workflow:status .`
- `node bin/aioson.js context:validate .`
- `node bin/aioson.js context:health .`
- `node bin/aioson.js agent:audit .`
- `node bin/aioson.js agent:load genome --goal="generate a compact genome from persona sources" --json`
- `node bin/aioson.js agent:load copywriter --goal="write landing page copy with funnel framework" --json`
- `node bin/aioson.js memory:trim . --dry-run --json`
- `node bin/aioson.js context:pack . --agent=architect --goal="analisar agentes skills genomes rules docs custo tokens gaps economia gpt-5.5" --json`
