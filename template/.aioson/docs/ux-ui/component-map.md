---
description: "UI/UX component map mode — component inventory, atomic classification, variants, states, and gap analysis between spec and implementation."
agents: [ux-ui]
modes: [planning, executing]
task_types: [component-map, component-inventory, ui-components]
load_tier: trigger
triggers: [component-map, component inventory, variants, states, duplicate components]
---

# UX/UI Component Map

Activate via `@ux-ui component-map`.

## Step 1 — Scan

- if code exists, scan `src/`, `components/`, `app/`, and `pages/` for visual patterns
- if `ui-spec.md` exists, extract the component list from the spec
- if `design_skill` is set, load the skill's component catalog

## Step 2 — Classify

For each component found, record:

| Component | Category | Variants | States | Used in |
|---|---|---|---|---|
| `Button` | atom | primary, secondary, ghost | default, hover, focus, active, disabled, loading | Header, Hero CTA, Forms |

Categories follow Atomic Design: atom → molecule → organism → template.

## Step 3 — Gap analysis

Identify:
- components that exist in the spec but not in code
- components that exist in code but not in the spec
- near-duplicate components that should be consolidated
- missing states or variants

## Output

- write to `.aioson/context/ui-component-map.md`
