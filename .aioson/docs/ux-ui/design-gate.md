---
description: "UI/UX design gate — context repair, design skill selection, isolation rules, and style ambiguity handling before visual direction is chosen."
agents: [ux-ui]
modes: [planning, executing]
task_types: [ui-design, design-skill-selection, visual-direction]
load_tier: trigger
triggers: [design skill, visual direction, style ambiguity, project_type site, project_type web_app]
---

# UX/UI Design Gate

Load this module before any operation that creates or revises visual direction.

## Step 0 — Design skill gate

Read `.aioson/context/project.context.md` before deciding direction, theme, or density.

Rules:
- if `project.context.md` contains stale or inconsistent metadata that affects visual work, repair the objectively inferable fields before continuing
- if `design_skill` is already set, load `.aioson/skills/design/{design_skill}/SKILL.md` before making visual decisions
- when `design_skill` is set, treat that package as the single source of truth for visual language, typography, component rhythm, and page composition
- if `project_type=site` or `project_type=web_app` and `design_skill` is blank, ask the user which installed design skill to use before producing new visual direction
- if only one packaged design skill is installed, still ask for confirmation instead of auto-selecting it
- if the user chooses to proceed without one, state clearly: `Proceeding without a registered design skill.`
- never silently invent, swap, auto-pick, or mix design skills
- never use context inconsistency as a reason to leave the workflow
- when `design_skill` is set, do not load, reference, or apply visual rules from another design package

Once the gate is resolved:
- if the user gave an explicit theme or style preference, obey it
- otherwise infer the direction from product context and the selected design skill
- ask at most one short style question only when the ambiguity is material
