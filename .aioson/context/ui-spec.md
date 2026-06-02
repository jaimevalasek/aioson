---
agent: ux-ui
project: aioson
project_type: script
design_skill: none
status: ready_for_handoff
created_at: "2026-06-02T03:58:00-03:00"
---

# UI Spec - AIOSON

## UX Scope

AIOSON is a Node.js CLI framework. This repository does not ship a product UI or dashboard UI; the dashboard is explicitly out of scope for the core repo. The UX surface for this project is therefore command-line interaction, agent handoff artifacts, localized terminal text, Markdown reports, and workflow-readable context files.

This UI spec is intentionally a CLI UX and artifact UX contract. No `index.html`, React app, dashboard screen, or visual design skill is required for this project lane.

## Users

Primary user: developer operating AIOSON from a terminal or from an LLM client that can run AIOSON commands.

The user needs to:
- understand which workflow stage is active
- know what command or agent comes next
- trust that gates and handoffs are deterministic
- inspect durable artifacts without reading raw runtime internals
- recover after context compaction or a fresh session

## Design Direction

Direction: Precision and Density for developer tooling.

The CLI should feel operational, explicit, and low-drama:
- compact output with clear status fields
- deterministic command signatures
- short summaries before verbose detail
- consistent artifact paths
- no marketing-style copy in command output
- no decorative visual language in framework artifacts

Design skill: not applicable. `project_type=script` and `design_skill` is intentionally blank.

## CLI Interaction Principles

1. Every command output should make state legible before details.
2. Every workflow command should identify mode, stage, feature slug when applicable, and next action.
3. JSON mode must remain machine-consumable and avoid mixed human prose.
4. Human-readable mode may use concise labels, but should not hide blockers or gate failures.
5. Errors should explain the violated contract and the next corrective command when known.
6. Artifact-producing commands should always print the artifact path.
7. Commands must avoid exposing secrets, raw environment values, private config values, or provider raw payloads unless the command contract explicitly owns that output.

## Terminal Status Language

Use these statuses consistently across human-readable output:

| Status | Meaning | UX expectation |
|---|---|---|
| `pass` | Gate or check succeeded | Include next action or artifact path. |
| `warn` | Work can continue with uncertainty | Include advisory and limitation. |
| `fail` | Confirmed blocking problem | Include concise reason and recovery command. |
| `blocked` | Workflow cannot advance | List missing artifacts or decisions. |
| `inconclusive` | Tool/runtime could not prove result | Do not present as pass; include reason. |

Avoid synonyms that change by command. If a command needs custom domain language, map it back to one of these statuses in JSON.

## Required UX Surfaces

### Workflow Status

Purpose: let the developer know where the AIOSON motor is.

Must show:
- workflow mode (`project` or `feature`)
- active stage
- queued next stage when present
- pending gates
- missing artifacts
- suggested command

### Workflow Handoff

Purpose: recover between sessions.

Must show:
- last agent
- completed stage
- what was done
- what comes next
- feature slug when applicable
- open decisions

### Help Output

Purpose: make command discovery fast without reading source code.

Rules:
- Keep command signatures complete.
- Prefer grouped, stable ordering.
- Include aliases only when they are supported.
- Avoid long explanations in top-level help.
- New commands must add localized help strings in all supported locales.

### Reports

Purpose: provide durable gate evidence to the next agent.

Rules:
- Markdown-first under `.aioson/context/`.
- Start with status and scope before findings.
- Include limitations and advisory sections.
- Avoid raw provider JSON in Markdown reports unless the report contract explicitly requires it.
- Use stable headings so agents can parse the document.

### Runtime Events

Purpose: support dashboard and session recovery.

Rules:
- Runtime events should be concise, factual, and stage-bound.
- Do not use runtime telemetry as a replacement for the required context artifact.
- Human-facing summaries should not require opening SQLite.

## Artifact UX Contract

Project artifacts should be readable by a developer scanning quickly.

Required structure for major Markdown artifacts:
- YAML frontmatter with owner, feature or project scope, status, and timestamp where useful
- clear title
- concise verdict or purpose near the top
- sections for scope, decisions, risks, and next action when relevant
- exact file paths for downstream agents

`.aioson/context/` remains Markdown-first. Machine-readable files are allowed only for the existing explicit exceptions.

## Localization

Project interaction language is `pt-BR`, while canonical agent prompts remain English.

CLI UX requirements:
- User-facing help and status text should respect locale where the command already supports it.
- Command names and flags remain English/kebab-case.
- JSON keys remain English and stable.
- Do not translate file paths, command names, flags, or schema keys.
- Portuguese prose should be direct and operational, not ceremonial.

## Accessibility

Although the core project is CLI-only, accessibility still applies:
- Do not rely on color alone for terminal status.
- JSON output must not include ANSI formatting.
- Human-readable output should remain understandable in plain text logs.
- Keep status words explicit for screen readers and copied logs.
- Avoid dense symbol-only outputs; symbols may supplement text but not replace it.

## Component and State Matrix

| Surface | Default | Warn | Fail/Blocked | Empty |
|---|---|---|---|---|
| `workflow:status` | active stage and suggestion | pending optional gate | missing required artifact | no pending stage |
| `workflow:next` | activated agent or completed stage | protocol warnings | blocked contract/gate | workflow complete |
| `quality:audit` | pass report path | provider uncertainty | confirmed new regression | no findings |
| `security:*` | pass summary | inconclusive tool state | blocking finding | no findings |
| Markdown report | status and scope | advisory list | findings and owner | explicit "none" rows |
| Help output | command signatures | n/a | unknown command guidance | n/a |

## Responsive and Visual Rules

No app layout is produced for this repository.

For future external dashboard work, treat that as a separate app with its own PRD, UI spec, and design skill selection. Do not infer dashboard UI requirements from this core CLI spec.

## Handoff Notes

`@pm` can proceed. The project-level UI/UX stage is ready for handoff because the required `ui-spec.md` exists and explicitly scopes UX to CLI and artifact surfaces.

No design approval is pending in a project `spec.md`; no `spec.md` exists for this project lane.
