# Components — Warm Craft UI

Reusable component specifications. Every component must use tokens from `design-tokens.md`. Never hardcode colors, sizes, or radii.

---

## Navigation

### Top Bar
```
height: 64px
background: var(--bg-surface)
border-bottom: 1px solid var(--border-subtle)
shadow: var(--shadow-xs)
padding: 0 var(--space-6)
display: flex; align-items: center; justify-content: space-between
```

Content slots:
- **Left:** Logo (mark or wordmark, max-height 28px)
- **Center:** Search bar (optional, rounded pill `var(--radius-full)`, `var(--bg-elevated)` background, max-width 480px)
- **Right:** Notification icon + User avatar (rounded full, 36px)

### Sidebar Navigation
```
width: 240px
background: var(--bg-void)
padding: var(--space-4) var(--space-3)
border-right: 1px solid var(--border-subtle)
```

Nav item:
```
height: var(--control-md)  /* 40px */
padding: 0 var(--space-3)
border-radius: var(--radius-lg)
font: var(--font-body), var(--text-sm), var(--weight-medium)
color: var(--text-secondary)
transition: var(--transition-fast)
display: flex; align-items: center; gap: var(--space-3)
icon: 20px, stroke-width 1.5

hover:
  background: var(--bg-elevated)
  color: var(--text-primary)

active:
  background: var(--bg-elevated)
  color: var(--text-heading)
  font-weight: var(--weight-semibold)
```

Nav section label:
```
font: var(--font-body), var(--text-xs), var(--weight-medium)
color: var(--text-muted)
letter-spacing: var(--tracking-wider)
text-transform: uppercase
padding: var(--space-6) var(--space-3) var(--space-2)
```

### Bottom Tab Bar (mobile)
```
height: 56px
background: var(--bg-surface)
border-top: 1px solid var(--border-subtle)
display: flex; justify-content: space-around; align-items: center

tab item:
  icon: 24px
  label: var(--text-xs), var(--weight-medium)
  color: var(--text-muted)
  gap: var(--space-1)

  active:
    color: var(--accent)
```

---

## Cards

### Base Card
```
background: var(--bg-surface)
border: 1px solid var(--border-subtle)
border-radius: var(--radius-xl)
padding: var(--space-6)
shadow: var(--shadow-sm)
transition: var(--transition-base)

hover (when clickable):
  shadow: var(--shadow-md)
  transform: translateY(-1px)
  border-color: var(--border-medium)
```

### Stat Card
```
extends: Base Card
padding: var(--space-5) var(--space-6)

number:
  font: var(--font-display), var(--text-4xl), var(--weight-bold)
  color: var(--text-heading)
  letter-spacing: var(--tracking-tight)

label:
  font: var(--font-body), var(--text-sm), var(--weight-medium)
  color: var(--text-secondary)
  margin-top: var(--space-1)

trend:
  font: var(--font-body), var(--text-sm), var(--weight-medium)
  color: var(--semantic-green) or var(--semantic-red)
  includes: arrow icon + percentage
```

### Feature Card
```
extends: Base Card
padding: var(--space-8)
border-radius: var(--radius-2xl)

icon area:
  width: 48px; height: 48px
  background: var(--accent-subtle)
  border-radius: var(--radius-lg)
  display: flex; align-items: center; justify-content: center
  icon color: var(--accent)

title:
  font: var(--font-display), var(--text-xl), var(--weight-semibold)
  color: var(--text-heading)
  margin-top: var(--space-4)

description:
  font: var(--font-body), var(--text-base), var(--weight-normal)
  color: var(--text-secondary)
  line-height: var(--leading-relaxed)
  margin-top: var(--space-2)
```

### Media Card
```
extends: Base Card
padding: 0
overflow: hidden
border-radius: var(--radius-2xl)

media:
  width: 100%
  aspect-ratio: 16/9 or 4/3
  object-fit: cover

body:
  padding: var(--space-5) var(--space-6)

title:
  font: var(--font-display), var(--text-lg), var(--weight-semibold)
  color: var(--text-heading)

meta:
  font: var(--font-body), var(--text-sm)
  color: var(--text-secondary)
  margin-top: var(--space-2)
```

---

## Buttons

### Primary Button
```
height: var(--control-md)
padding: 0 var(--space-5)
background: var(--accent)
color: var(--accent-contrast)
border: none
border-radius: var(--radius-lg)
font: var(--font-body), var(--text-sm), var(--weight-semibold)
cursor: pointer
transition: var(--transition-fast)

hover:
  background: var(--accent-hover)

active:
  transform: scale(0.98)

disabled:
  opacity: 0.5
  pointer-events: none
```

### Secondary Button
```
extends: Primary (dimensions, font, radius)
background: transparent
color: var(--text-heading)
border: 1px solid var(--border-medium)

hover:
  background: var(--bg-elevated)
  border-color: var(--border-strong)
```

### Ghost Button
```
extends: Primary (dimensions, font)
background: transparent
color: var(--text-secondary)
border: none

hover:
  background: var(--bg-elevated)
  color: var(--text-heading)
```

### Large CTA (hero sections)
```
height: var(--control-xl)
padding: 0 var(--space-8)
border-radius: var(--radius-xl)
font-size: var(--text-base)
shadow: var(--shadow-md)

hover:
  shadow: var(--shadow-lg)
  transform: translateY(-1px)
```

---

## Forms

### Text Input
```
height: var(--control-md)
padding: 0 var(--space-4)
background: var(--bg-surface)
border: 1px solid var(--border-medium)
border-radius: var(--radius-md)
font: var(--font-body), var(--text-base)
color: var(--text-heading)
transition: var(--transition-fast)

placeholder:
  color: var(--text-muted)

focus:
  border-color: var(--accent)
  box-shadow: 0 0 0 3px var(--accent-dim)
  outline: none

error:
  border-color: var(--semantic-red)
  box-shadow: 0 0 0 3px var(--semantic-red-dim)
```

### Label
```
font: var(--font-body), var(--text-sm), var(--weight-medium)
color: var(--text-heading)
margin-bottom: var(--space-2)
display: block
```

### Helper Text
```
font: var(--font-body), var(--text-sm)
color: var(--text-secondary)
margin-top: var(--space-1)
```

### Error Message
```
font: var(--font-body), var(--text-sm), var(--weight-medium)
color: var(--semantic-red)
margin-top: var(--space-1)
```

### Textarea
```
extends: Text Input
min-height: 120px
padding: var(--space-3) var(--space-4)
resize: vertical
line-height: var(--leading-normal)
```

### Select
```
extends: Text Input
appearance: none
background-image: chevron-down SVG
background-position: right var(--space-3) center
background-repeat: no-repeat
padding-right: var(--space-10)
```

### Checkbox / Radio
```
width: 20px; height: 20px
border: 2px solid var(--border-strong)
border-radius: var(--radius-sm) (checkbox) or var(--radius-full) (radio)
transition: var(--transition-fast)

checked:
  background: var(--accent)
  border-color: var(--accent)
  color: var(--accent-contrast) (checkmark)
```

### Toggle Switch
```
width: 44px; height: 24px
border-radius: var(--radius-full)
background: var(--border-strong)
transition: var(--transition-base)

thumb:
  width: 20px; height: 20px
  border-radius: var(--radius-full)
  background: white
  shadow: var(--shadow-sm)

checked:
  background: var(--accent)
  thumb: translate right
```

---

## Data Display

### Table
```
width: 100%
border-collapse: separate
border-spacing: 0

header row:
  background: var(--bg-elevated)
  font: var(--font-body), var(--text-sm), var(--weight-semibold)
  color: var(--text-heading)
  text-align: left
  padding: var(--space-3) var(--space-4)
  border-bottom: 1px solid var(--border-medium)

body row:
  font: var(--font-body), var(--text-sm)
  color: var(--text-primary)
  padding: var(--space-3) var(--space-4)
  border-bottom: 1px solid var(--border-subtle)
  transition: var(--transition-fast)

  hover:
    background: var(--bg-elevated)

first cell + last cell:
  border-radius: var(--radius-lg) on outer corners (first and last row)
```

### Badge
```
display: inline-flex; align-items: center
height: 24px
padding: 0 var(--space-3)
border-radius: var(--radius-full)
font: var(--font-body), var(--text-xs), var(--weight-medium)

variants:
  default:  background: var(--bg-elevated), color: var(--text-secondary)
  accent:   background: var(--accent-dim), color: var(--accent-strong)
  success:  background: var(--semantic-green-dim), color: var(--semantic-green)
  warning:  background: var(--semantic-amber-dim), color: var(--semantic-amber)
  error:    background: var(--semantic-red-dim), color: var(--semantic-red)
```

### Avatar
```
border-radius: var(--radius-full)
object-fit: cover

sizes:
  xs: 24px
  sm: 32px
  md: 40px
  lg: 56px
  xl: 80px

fallback:
  background: var(--accent-dim)
  color: var(--accent)
  font: var(--font-body), var(--weight-semibold)
  display: flex; align-items: center; justify-content: center
  (shows initials)
```

### Empty State
```
text-align: center
padding: var(--space-16) var(--space-8)

illustration:
  max-width: 240px
  margin: 0 auto var(--space-6)
  (warm, hand-drawn style — never cold geometric)

title:
  font: var(--font-display), var(--text-xl), var(--weight-semibold)
  color: var(--text-heading)

description:
  font: var(--font-body), var(--text-base)
  color: var(--text-secondary)
  max-width: 400px
  margin: var(--space-2) auto var(--space-6)

action:
  Primary Button
```

---

## Feedback

### Toast / Notification
```
background: var(--bg-surface)
border: 1px solid var(--border-medium)
border-radius: var(--radius-xl)
padding: var(--space-4) var(--space-5)
shadow: var(--shadow-lg)
max-width: 420px
display: flex; gap: var(--space-3); align-items: flex-start

icon: 20px, colored by semantic type
title: var(--font-body), var(--text-sm), var(--weight-semibold), var(--text-heading)
message: var(--font-body), var(--text-sm), var(--text-secondary)
dismiss: Ghost Button, icon-only, top-right
```

### Modal
```
background: var(--bg-surface)
border: 1px solid var(--border-subtle)
border-radius: var(--radius-2xl)
shadow: var(--shadow-xl)
padding: var(--space-8)
max-width: 480px
width: min(100%, 42rem)

backdrop:
  background: rgba(45, 40, 35, 0.40)
  backdrop-filter: blur(4px)

title:
  font: var(--font-display), var(--text-xl), var(--weight-semibold)
  color: var(--text-heading)

body:
  font: var(--font-body), var(--text-base)
  color: var(--text-primary)
  margin-top: var(--space-4)

actions:
  margin-top: var(--space-6)
  display: flex; gap: var(--space-3); justify-content: flex-end
```

### Tooltip
```
background: var(--text-heading)
color: var(--text-inverse)
padding: var(--space-2) var(--space-3)
border-radius: var(--radius-md)
font: var(--font-body), var(--text-xs), var(--weight-medium)
shadow: var(--shadow-md)
max-width: 240px
```

### Progress Bar
```
height: 8px
background: var(--bg-elevated)
border-radius: var(--radius-full)
overflow: hidden

fill:
  height: 100%
  background: var(--accent)
  border-radius: var(--radius-full)
  transition: width var(--transition-slow)
```

### Skeleton Loader
```
background: var(--bg-elevated)
border-radius: var(--radius-md) (for text) or var(--radius-xl) (for cards)
animation: warm-pulse 1.8s ease-in-out infinite

@keyframes warm-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```
