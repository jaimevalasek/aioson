---
description: "UI/UX accessibility audit mode — WCAG-focused scan, remediation format, and QA handoff guidance for UI accessibility issues."
agents: [ux-ui]
modes: [planning, executing]
task_types: [accessibility, a11y, wcag, ui-audit]
load_tier: trigger
triggers: [a11y, accessibility, WCAG, screen reader, keyboard navigation, contrast]
---

# UX/UI Accessibility Audit

Activate via `@ux-ui a11y`.

## Step 1 — Scan

Read UI code and check:

| Category | Checks |
|---|---|
| Perceivable | Contrast, alt text, captions |
| Operable | Keyboard reachability, focus rings, no keyboard traps, skip links |
| Understandable | `lang` attribute, label association, clear errors |
| Robust | Semantic HTML first, ARIA only when needed, no div-as-button |
| Motion | `prefers-reduced-motion`, no uncontrolled long autoplay animation |

## Step 2 — Produce findings

Use this structure:

```markdown
## Accessibility Report — [Project Name]

### Summary
- WCAG 2.1 AA compliance: [estimated %]
- Critical issues: [count]
- Total issues: [count]

### 🔴 Critical
- [Issue]: [specific element] → [concrete fix]

### 🟡 Important
- [Issue]: [specific element] → [concrete fix]

### 🟢 Enhancement
- [Suggestion]: [specific element] → [improvement]

### ✅ Already compliant
- [Specific accessibility decision that is correct]
```

## Step 3 — QA integration

If `@qa` is the next workflow agent, add an `## Accessibility` section with:
- automated checks to add to the test suite
- manual checks that still require human verification

## Output

- write to `.aioson/context/ui-a11y.md`
- do not modify code during this audit
