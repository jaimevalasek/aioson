---
slug: agent-orchestration-v2
created_at: 2026-05-27
updated_at: 2026-05-27
source_plans: ["squad-searches/standalone/agent-orchestration-upgrade-20260527.md"]
---

# Briefing — Agent Orchestration V2: Durable Execution & DAST Depth

## Context

AIOSON v1.17 completed a comprehensive CLI integration upgrade for 9 agents: observability standardization (pulse:update + runtime:emit milestones), gate commands (gate:approve for Gates A/B/C), operator memory capture (op:capture), pentester browser DAST (Playwright-based TS-A08 surface), and tester security regression tests (Phase 4.6). A governance rule (`agent-structural-contract.md`) now enforces structural consistency.

An @orache investigation (2026-05-27) compared AIOSON's patterns against LangGraph 1.2, OpenAI Agents SDK, CrewAI, Nuclei, and Playwright MCP — revealing 6 concrete gaps where the industry has moved ahead. These gaps don't invalidate the upgrade; they represent the next layer of maturity.

## Problem

When [an AIOSON workflow fails at Gate C after 3 agents have already completed], I want to [resume from the exact state at Gate B instead of re-running from scratch], so I can [save 70-80% of the tokens and time that re-execution costs].

When [a downstream agent reads the handoff artifacts], I want to [understand WHY the upstream agent chose this approach over alternatives], so I can [make informed decisions without re-asking questions the user already answered].

When [the pentester runs browser DAST probes], I want to [also catch request-level attacks via an HTTP proxy layer], so I can [detect vulnerabilities that browser-only probes structurally cannot see (e.g., blind SSRF, header injection on non-rendered responses)].

## Proposed solution

Three themes, each independently shippable:

### Theme 1 — Durable Execution (checkpoint-at-gate + decision rationale)
- Extend `gate:approve` to persist a full context snapshot at each gate boundary (`.aioson/runtime/checkpoints/gate-{A|B|C|D}-{slug}.json`)
- Checkpoint includes: loaded artifacts list, decision log, pending work, resume instruction
- `workflow:heal` reads the latest checkpoint for exact resume instead of artifact reconstruction
- Extend `last-handoff.json` with `decision_rationale[]` array — each entry: `{ agent, decision, alternatives_considered, rationale, confidence }`, capped at 5 entries
- Extend `dev:state:write` to include `decision_rationale` in context packages

### Theme 2 — DAST Depth (ZAP proxy + Nuclei reference)
- Add optional Phase 0.5 to `browser-dast-playbook.md`: configure Playwright to proxy through ZAP, run passive scan during Phase 0 (qa:run), import ZAP findings
- Reference Nuclei templates (11,000+) as complementary DAST layer for infrastructure-level issues in the pentester tool stack
- Flag Playwright MCP as V2 opportunity for tool-call-based browser testing (monitor adoption before committing)

### Theme 3 — Scoped Operator Memory
- Extend `op:capture` with `--feature=<slug>` and `--session-id=<id>` indexed fields
- Extend `op:list` to support filters: `--feature=<slug> --agent=<name>`
- Enable queries like "all decisions the user made on feature X" or "what did the user decide about testing patterns?"

## Themes

### Theme 1 — Durable Execution
**Trigger:** LangGraph 1.2 (May 2026) introduced durable graph execution with checkpoint at every node transition + time-travel debugging. AIOSON's `runtime:emit` milestones and `workflow:heal` are a directional match but can't replay or resume from a specific state.

**What changes:**
- `gate:approve` writes checkpoint JSON alongside the gate status update
- `workflow:heal` reads checkpoint for exact recovery
- `last-handoff.json` gains `decision_rationale[]` field
- Consumers are defined for every telemetry event (anti-pattern: fire-and-forget)

**Sizing estimate:** SMALL — 2 files touched in CLI (gate-approve.js, workflow-heal.js), 1 schema extension (last-handoff.json), prompt updates in 3 agents. No new CLI commands.

### Theme 2 — DAST Depth
**Trigger:** Industry DAST standard is Playwright (authenticated navigation) + ZAP (attack patterns via proxy). AIOSON's current browser-dast-playbook does both navigation AND probes in Playwright alone, missing request-level attacks.

**What changes:**
- Optional Phase 0.5 in the playbook (doc-only if no CLI changes)
- Nuclei reference added to pentester tool stack table
- Playwright MCP flagged as V2 watch item

**Sizing estimate:** MICRO — documentation changes only. No CLI code unless ZAP proxy setup is automated.

### Theme 3 — Scoped Operator Memory
**Trigger:** Multi-scope memory tagging (Mem0/Cloudflare pattern) is the 2026 production standard. AIOSON's `op:capture` is fire-and-forget without scope tags.

**What changes:**
- 2 new flags on `op:capture` (--feature, --session-id)
- Filter support on `op:list`
- Schema migration for indexed fields in operator-memory SQLite

**Sizing estimate:** SMALL — 2 command files (op-capture.js, op-list.js), 1 migration, prompt updates in 3 agents.

## Risks

### R1 — Checkpoint bloat (Theme 1)
Full context snapshots at every gate could grow large (4 gates x N features). Mitigation: cap snapshot size, archive old checkpoints with `runtime:prune`.

### R2 — ZAP dependency friction (Theme 2)
ZAP is a Java application — adding it as a dependency increases setup complexity. Mitigation: Phase 0.5 is explicitly OPTIONAL ("if ZAP is available"). Users without ZAP skip it silently.

### R3 — Scoped memory migration complexity (Theme 3)
Adding indexed fields to existing operator-memory tables requires a schema migration. Mitigation: follow the established pattern from `learning-loop-migration.js` and `neural-chain-migration.js` (idempotent, IF NOT EXISTS guards).

### R4 — Playwright MCP maturity (Theme 2, V2)
Playwright MCP is new in 2026 with limited adoption data. Risk of investing in a pattern that doesn't stabilize. Mitigation: flag only — no implementation until adoption data confirms stability.

## Identified gaps

1. **Consumer mapping for runtime:emit events** — today milestones go to the dashboard but `workflow:heal` doesn't read them. Theme 1 closes this gap but the mapping should be explicit (which events does each consumer read?).
2. **Checkpoint schema** — what exactly goes into the checkpoint JSON? Need to define the schema before implementation. Context size varies per agent (analyst produces heavy context, briefing produces light context).
3. **ZAP version pinning** — which ZAP version to reference? The playbook should pin a minimum version for reproducibility.
4. **op:capture retroactive scoping** — existing captures (from sessions before this upgrade) have no scope tags. Should we backfill or leave them unscoped?

## Sources

- [LangGraph Persistence Docs](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [OpenAI Agents SDK Handoffs](https://openai.github.io/openai-agents-python/handoffs/)
- [Agent Memory Architectures: 5 Patterns](https://atlan.com/know/agent-memory-architectures/)
- [State of AI Agent Memory 2026 — Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Nuclei Overview — ProjectDiscovery](https://docs.projectdiscovery.io/opensource/nuclei/overview)
- [Playwright Security Testing — ZeroThreat](https://zerothreat.ai/playwright-security-testing)
- @orache investigation report: `squad-searches/standalone/agent-orchestration-upgrade-20260527.md`
- Cached: `researchs/cursor3-harness-evolution-2026/summary.md`
- Cached: `researchs/agent-memory-backends-2026/summary.md`

## Open questions

1. [decision-required] Theme 1+3 como um único PRD (SMALL bundled) ou 2 PRDs separados? Timelines são independentes mas compartilham o pattern de "enriquecer infraestrutura existente".
2. [decision-required] Theme 2 DAST — merece PRD próprio ou é doc-only update no playbook (MICRO sem PRD)?
3. [research-able] Checkpoint schema: qual o payload mínimo viável que permite resume sem re-leitura de artefatos? (< 4h de investigação nos 4 agentes que produzem gates)
4. [decision-required] Op:capture retroativo: backfill captures antigas com scope tags genéricos, ou leave as-is e só tagear novas capturas?
5. [out-of-scope] Playwright MCP — parked para V2. Monitorar adoção antes de qualquer investimento.
6. [research-able] ZAP version mínima e Docker image oficial para referenciar no playbook (< 2h).
