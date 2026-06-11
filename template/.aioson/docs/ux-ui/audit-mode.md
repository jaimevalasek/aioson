---
description: "UI/UX audit mode — inventory scan, design quality checks, severity-based reporting, and fix recommendation format for existing UI."
agents: [ux-ui]
modes: [planning, executing]
task_types: [ui-audit, design-review, visual-qa]
load_tier: trigger
triggers: [audit, existing UI, design quality, visual QA, review UI]
---

# UX/UI Audit Mode

Activate when the user chooses **Audit** or invokes `@ux-ui audit`.

## Step 1 — Read existing artifacts

Read all that exist:
- `index.html` or the main template file
- `ui-spec.md`
- up to 5 component files from `src/`, `components/`, `app/`, or `pages/`, prioritizing layout-level files

## Step 2 — Inventory scan

Capture:

| Inventory | What to capture |
|---|---|
| Colors | Every unique color value. Flag hardcoded values not in CSS custom properties. |
| Spacing | Unique margin and padding values. Flag values not aligned to a scale. |
| Radius | Unique border-radius values. Flag inconsistencies. |
| Typography | Font families, sizes, and weights used. Flag values not in a type scale. |
| Components | Visually repeated patterns. Flag near-duplicates that should be consolidated. |

## Step 3 — Run quality checks

Apply each check and record findings:

| Check | What to look for |
|---|---|
| Swap test | Could this UI belong to any other product? |
| Squint test | Is hierarchy clear or does everything compete? |
| Signature test | Can you name 5 product-specific design decisions? |
| State completeness | Hover, focus, active, disabled states defined? |
| Depth consistency | Borders-only and shadows mixed on the same surface type? |
| Token discipline | Hardcoded values vs CSS custom properties |
| Accessibility | Contrast, focus, semantic HTML |
| Mobile-first | Breakpoints and graceful degradation below 768px |
| Motion safety | `prefers-reduced-motion` respected |
| Visual continuity | Shared surfaces consistent across screens |

## Step 4 — Produce the audit report

Use this structure:

```markdown
## UI Audit — [Project Name]

### Inventory
- Colors: X unique values (Y hardcoded)
- Spacing: X unique values
- Radius: X unique values
- Components: X patterns (Y near-duplicates)

### 🔴 Critical
- [Issue]: [specific location] → [concrete fix]

### 🟡 Important
- [Issue]: [specific location] → [concrete fix]

### 🟢 Polish
- [Issue]: [specific location] → [suggestion]

### ✅ What's working
- [Specific intentional decision]

### Consolidation plan
- [Pattern A and Pattern B] → [single component]
- [Hardcoded values] → [semantic tokens]
```

Rules:
- every finding must reference a specific element or line
- every critical or important finding must include a concrete fix
- always include at least one "What's working" entry
- include a consolidation plan when near-duplicates or hardcoded values are found
- end with: `Want me to apply the critical fixes now, or go through them one by one?`

## Output

- write the report to `.aioson/context/ui-audit.md`
- do not modify `index.html`, component files, or `ui-spec.md` during audit
- switch to targeted edits only after the user confirms which fixes to apply
