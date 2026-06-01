---
name: aioson-context-boundary
description: .aioson/context/ is Markdown-first with explicit machine-readable exceptions
priority: 10
version: 1.0.0
agents: [product, analyst, architect, ux-ui, pm, dev, qa, sheldon]
---

# Context Boundary: .aioson/context/

`.aioson/context/` is Markdown-first. Human-authored feature and project artifacts should be Markdown unless a file is one of the explicit machine-readable exceptions below.

Prohibited by default: `.json`, `.yaml`/`.yml`, `.js`, `.ts`, `.py`, any non-Markdown format.

Allowed machine-readable exceptions:

- `.aioson/context/conformance-{slug}.yaml`
- `.aioson/context/security-findings-{slug}.json`
- `.aioson/context/workflow.state.json`
- `.aioson/context/handoff-protocol.json`
- `.aioson/context/last-handoff.json`
- `.aioson/context/parallel/*.json`

## Correct location by artifact type

| Artifact type | Correct location |
|---|---|
| Project configuration | `.aioson/config.md` |
| Conformance schema | `.aioson/context/conformance-{slug}.yaml` ← machine-readable exception |
| Security findings | `.aioson/context/security-findings-{slug}.json` ← machine-readable exception |
| Workflow handoff/runtime state | `.aioson/context/workflow.state.json`, `.aioson/context/handoff-protocol.json`, `.aioson/context/last-handoff.json` |
| Parallel coordination machine files | `.aioson/context/parallel/*.json` |
| Simple implementation plans | `.aioson/context/simple-plans/{slug}.md` |
| Squad definitions | `.aioson/squads/{slug}/` |
| Skill manifests | `.aioson/skills/{category}/{slug}/SKILL.md` |
| Feature artifacts | `.aioson/context/{artifact}-{slug}.md` |
| Project artifacts | `.aioson/context/{artifact}.md` |

## Valid artifacts in .aioson/context/

```
project.context.md            ← setup
discovery.md                  ← analyst
requirements-{slug}.md        ← analyst
architecture.md               ← architect
ui-spec-{slug}.md             ← ux-ui
prd.md / prd-{slug}.md        ← product
spec-{slug}.md                ← dev
implementation-plan-{slug}.md ← pm
simple-plans/{slug}.md       ← dev / deyvin
features.md                   ← product / pm
project-pulse.md              ← all agents (update at session end)
conformance-{slug}.yaml       ← conformance machine-readable exception
security-findings-{slug}.json ← pentester/qa security findings exception
workflow.state.json           ← workflow runtime exception
handoff-protocol.json         ← workflow handoff exception
last-handoff.json             ← workflow handoff exception
parallel/*.json               ← parallel coordination exception
```

## On violation detected

1. Do not create the file.
2. Identify correct format and location.
3. Inform user: "`.aioson/context/` is Markdown-first. Non-Markdown is allowed only for the listed machine-readable exceptions. Creating `{artifact}` in `{correct-location}` instead."
