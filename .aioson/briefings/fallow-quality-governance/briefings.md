---
slug: fallow-quality-governance
created_at: 2026-06-01T22:11:19.4490945-03:00
updated_at: 2026-06-01T22:11:19.4490945-03:00
source_plans: ["external repo: https://github.com/fallow-rs/fallow", "web research: researchs/fallow-rs-ai-agent-code-quality-2026/summary.md"]
decision_checkpoint: "2026-06-02 — user agreed this should only become PRD as a narrow MVP: quality-governance-baseline-and-new-regression-gate"
---

# Briefing — Fallow Quality Governance for AIOSON

## Context
AIOSON already has rule and design-doc governance for code organization: `.aioson/rules/`, `.aioson/design-docs/`, `.aioson/context/design-doc.md`, SDD gates, `preflight`, `qa`, and project pulse. The current model is strong at instructing agents before implementation, but weaker at deterministic post-edit evidence: unused code, duplicate logic, architectural cycles, complexity hotspots, and change-set regressions.

The external repo `fallow-rs/fallow` was analyzed as a source of patterns for improving AIOSON's code-quality enforcement. Fallow is a Rust-native codebase intelligence tool for JS/TS projects. It produces deterministic JSON findings for dead code, duplication, health/complexity, architecture boundaries, dependency hygiene, and agent-consumable actions. Its own repo also includes useful agent governance patterns: path-scoped rules, specialist reviewer agents, a shared vocabulary file, compliance docs, and a local agent gate before commit/push.

## Problem
AIOSON can currently tell agents how code should be organized, but it does not yet consistently force agents to prove that their implementation avoided dead code and structural degradation. This creates three risks:

1. Agents may add files, exports, dependencies, or feature paths that are never used.
2. Agents may leave complexity, duplication, or circular dependencies that pass focused functional tests.
3. QA may approve a feature because the changed slice works, while repo-wide maintainability quietly worsens.

A non-destructive Fallow run on the AIOSON repo showed the difference clearly: `fallow audit --format json --quiet` passed for the current changeset, but repo-wide `health` and `dead-code` found substantial existing debt. That means the right adoption model is not "block everything now"; it is "baseline existing debt, gate new regressions, and give agents deterministic cleanup/refactor evidence."

## Proposed solution
Introduce a Fallow-inspired quality governance lane for AIOSON, centered on deterministic evidence and staged enforcement.

### Decision checkpoint — PRD scope recommendation
This briefing should not become a broad PRD for the full quality-governance vision. The user explicitly agreed that the safe PRD slice is:

`quality-governance-baseline-and-new-regression-gate`

Recommended MVP:
- Define an AIOSON-native quality result contract.
- Add an experimental `aioson quality:audit` command.
- Use Fallow as the first Node.js/JS provider without hard-coupling the long-term design to Fallow only.
- Record existing repo debt as a baseline.
- Gate only new regressions in changed code.
- Feed structured quality evidence into @qa first, before making any global blocking gate.

Do not start with repo-wide hard blocking, broad design-doc-to-config generation, multi-language analyzer abstraction, or automatic deletion/refactor actions. Those belong in follow-up phases after the first evidence loop proves useful.

Recommended direction:

1. Add AIOSON quality commands that wrap analyzer output into AIOSON-native artifacts.
   - `aioson quality:audit` — changed-code gate, defaulting to new regressions only.
   - `aioson quality:health` — repo or module maintainability snapshot.
   - `aioson quality:dead-code` — cleanup candidates and intentional-exception workflow.
   - `aioson quality:baseline` — record existing debt without normalizing it as acceptable.
   - `aioson quality:gate` — pre-commit/pre-push or @qa gate integration.

2. Extend rules/design-docs from prose governance into executable governance.
   - Rules can declare required quality checks for agents or path scopes.
   - Design-docs can declare allowed boundaries, entry points, generated paths, and intentional exceptions.
   - @dev/@deyvin run changed-code audit after edits.
   - @qa consumes structured quality output as part of Gate D.

3. Adopt the Fallow compliance decision model:
   - Fix real issues in code.
   - Keep intentional exceptions only with narrow, documented mechanisms.
   - Change repo policy only when the policy itself is wrong.
   - Use baselines as migration aids, not as the desired end state.

4. Add an agent-facing local gate.
   - Before `git commit` or `git push`, run a changed-code audit.
   - Allow pass/warn.
   - Block fail and return JSON findings to the agent.
   - Treat analyzer runtime/config errors as visible but non-blocking, to avoid trapping brand-new repos.

## Themes
### Theme 1 — Deterministic Evidence for Agents
Fallow's strongest idea is not its specific rules; it is the separation between LLM reasoning and deterministic graph analysis. AIOSON agents should not infer unused code or duplication from context-window reading when a tool can compute it.

Useful mechanism:
- Agents consume JSON summaries, not terminal prose.
- Findings include actions, severity, path, line, and fix/suppress options.
- Agent outputs report final quality command results as evidence.

### Theme 2 — Rules as Executable Policy
Fallow's `.claude/rules/*.md` files are path-scoped and domain-specific. AIOSON rules currently target agents via frontmatter, but not touched paths. AIOSON could add optional rule fields such as:

```yaml
paths:
  - "src/commands/**"
quality:
  required_checks: ["audit", "health-targets"]
  gate: "new-only"
```

This would let @dev/@qa load the right rule for the changed files and run the correct checks automatically.

### Theme 3 — Design-Docs as Boundary/Entry-Point Source
AIOSON design-docs already cover folder structure, naming, reuse, and file size. They could also become the project-local source for:

- architectural zones and allowed imports
- convention entry points
- generated or intentionally unreferenced files
- public exports that should not be deleted
- dependency exceptions with reasons

This turns design-docs from advice into analyzer configuration input.

### Theme 4 — Baseline Then Ratchet
The AIOSON repo has existing debt. A strict repo-wide gate would be noisy and counterproductive. The safer model is:

- snapshot current findings
- gate only new regressions in changed code
- create targeted cleanup tasks for high-confidence debt
- ratchet thresholds over time

### Theme 5 — Specialist Reviewers and Veto Rights
Fallow's `.claude/agents` include specialist reviewers with explicit scope and veto rights. AIOSON already has specialized agents, but could improve Gate D by adding a quality-review matrix:

- source changes → code-quality reviewer checks complexity/duplication/dead code
- JSON/schema changes → output-contract reviewer checks deterministic machine interfaces
- CI/hook changes → pipeline reviewer checks fail-open/fail-closed semantics
- security-sensitive changes → security reviewer has hard veto

## Risks
1. False positives could make agents delete code that is actually invoked dynamically. Mitigation: require trace commands or human-approved exceptions before deletion of files/exports with uncertain reachability.
2. A strict repo-wide gate could block progress because AIOSON has existing debt. Mitigation: start with `new-only` changed-code gates and baselines.
3. Fallow is JS/TS-focused. AIOSON is Node.js, so it fits now, but AIOSON templates serve many stacks. Mitigation: make analyzer support pluggable by framework/language.
4. Running analyzer commands in parallel via `npx` caused cache/install contention in this session. Mitigation: quality gates should run serially, prefer local dependency or installed binary, and surface runtime errors without blocking.
5. Design-doc-to-config generation could hide real problems if broad ignores are generated. Mitigation: require narrow exceptions with reason fields and stale-exception checks.
6. Agent hooks are harness-specific. Mitigation: provide CLI commands and AGENTS.md fallback instructions, with MCP/hook integration as optional surfaces.

## Identified gaps
1. AIOSON does not yet have a canonical quality artifact format for analyzer results.
2. AIOSON rules do not currently support path-scoped loading or quality-check declarations.
3. Design-docs do not currently map governance sections into executable analyzer config.
4. There is no documented policy for baselines, suppressions, stale exceptions, or cleanup ratcheting.
5. @dev/@deyvin/@qa prompts would need explicit rules for when to run quality checks and how to act on findings.
6. Multi-language projects need an abstraction so Fallow is one provider, not the only quality backend.

## Sources
- `researchs/fallow-rs-ai-agent-code-quality-2026/summary.md`
- `researchs/fallow-rs-ai-agent-code-quality-2026/files/github-fallow-repo.md`
- `researchs/fallow-rs-ai-agent-code-quality-2026/files/fallow-docs-agent-integration.md`
- `researchs/fallow-rs-ai-agent-code-quality-2026/files/fallow-docs-hooks.md`
- Local clone inspected at `C:\Users\jaime\AppData\Local\Temp\fallow-aioson-study`
- Official docs: https://docs.fallow.tools/integrations/mcp
- Official docs: https://docs.fallow.tools/integrations/agent-skills
- Official docs: https://docs.fallow.tools/integrations/claude-hooks
- GitHub repo: https://github.com/fallow-rs/fallow
- npm registry check: `fallow@2.85.0`

## Open questions
1. [decision-required] For the MVP, define a minimal provider boundary while using Fallow as the first Node.js provider. Avoid solving the full multi-language abstraction in the first PRD.
2. [decision-required] Prefer a standalone experimental `aioson quality:audit` command first; integration with `preflight`, `qa-run`, and `artifact:validate` should be follow-up unless @product decides otherwise.
3. [testable] What minimum config makes Fallow accurate for AIOSON's dynamic CLI surfaces, tests, templates, and generated files without broad ignores?
4. [research-able] Which non-JS analyzers should map into the same AIOSON quality contract for Python, Rust, PHP, and frontend frameworks?
5. [decision-required] Which gate should be blocking first: local agent commit gate, @qa Gate D, or CI-only?
6. [testable] Can design-docs safely generate analyzer boundary/entry-point config without increasing false positives?
7. [decision-required] How should AIOSON record intentional exceptions: `.fallowrc`, `.aioson/design-docs`, `.aioson/rules`, or a generated quality policy file?
