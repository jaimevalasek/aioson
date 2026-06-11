---
description: "UI/UX token contract mode — extraction and normalization of design tokens for colors, spacing, typography, and semantic ownership."
agents: [ux-ui]
modes: [executing]
task_types: [design-tokens, token-contract, visual-system]
load_tier: trigger
triggers: [tokens, design tokens, colors, spacing, typography, visual system]
---

# UX/UI Token Contract

Activate via `@ux-ui tokens`.

## When to use

- when the project needs a shared token system between design and code
- when multiple developers or squads will implement UI from the same spec
- when migrating from hardcoded values to a token-based system

## Step 1 — Analyze current state

- if UI code exists, extract hardcoded colors, spacing, radius, shadows, and typography
- if `ui-spec.md` exists, extract the token block
- if `design_skill` is set, load the skill token definitions as the source of truth

## Step 2 — Build the contract

Use this structure:

```markdown
## Token Contract — [Project Name]

### Primitive tokens
| Token | Value | Usage |
|---|---|---|
| `--color-slate-50` | `hsl(210, 40%, 98%)` | lightest background |

### Semantic tokens
| Token | Light value | Dark value | Usage |
|---|---|---|---|
| `--color-bg-primary` | `var(--color-slate-50)` | `var(--color-slate-900)` | main background |

### Spacing scale
| Token | Value |
|---|---|
| `--space-1` | `4px` |

### Typography scale
| Token | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `--text-xs` | `12px` | `400` | `1.5` | captions |

### Token ownership
- `:root` → primitives + light-mode semantics
- `[data-theme="dark"]` → dark-mode semantic overrides
- component level → component-specific tokens only
```

## Output

- write to `.aioson/context/ui-tokens.md`
- if `ui-spec.md` exists, update its token block to reference `ui-tokens.md` as the source of truth
