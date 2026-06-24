# Patterns — pt.squarespace.com

## Page Layout Patterns

### Homepage Structure

```
┌─────────────────────────────────────┐
│ Header (sticky, transparent → solid)│
├─────────────────────────────────────┤
│ Hero (full-viewport, dark)          │
│ - Centered headline                │
│ - Subtext                           │
│ - Single CTA                        │
├─────────────────────────────────────┤
│ Content Section (light)             │
│ - H2 headline                       │
│ - 3-column grid                     │
├─────────────────────────────────────┤
│ Content Section (alternating)       │
│ - Split layout                      │
├─────────────────────────────────────┤
│ CTA Section (teal or dark)          │
│ - Centered headline + CTA           │
├─────────────────────────────────────┤
│ Domain Search (light gray)          │
│ - Input + button inline             │
├─────────────────────────────────────┤
│ Stats Row (dark)                    │
│ - Numbers in row                    │
├─────────────────────────────────────┤
│ Support Section (light)             │
│ - Grid of support options           │
├─────────────────────────────────────┤
│ Final CTA (dark teal)               │
│ - Headline + CTA                    │
├─────────────────────────────────────┤
│ Footer (4-column grid + legal)      │
└─────────────────────────────────────┘
```

### Responsive Breakpoints

| Breakpoint | Width | Changes |
|------------|-------|---------|
| Desktop | 1440px+ | Full layout, 4-col footer |
| Tablet | 768px | 2-col grids, hamburger nav |
| Mobile | 390px | Single column, stacked |

---

## Hero Pattern

### Layout
- **Container:** width: 100%; min-height: 100vh with overflow guarded
- **Background:** solid dark (`--bg-inverse: rgb(0,0,0)`)
- **Content:** centered flex column, max-width container

### Typography
- **Headline:** Clarkson, 42px, weight 300, white
- **Subtext:** Clarkson, 26px, weight 400, white
- **CTA:** 14px weight 500, white bg, black text

### Spacing
- Vertical padding: 120px+
- Content gap: 24px

---

## Feature Grid Pattern

### Layout
- **Container:** max-width 1200px, centered
- **Grid:** 3 columns on desktop, 2 on tablet, 1 on mobile
- **Gap:** 32px

### Items
- Icon (if applicable)
- Title (H3 or bold)
- Description (body text)
- Optional CTA link

---

## CTA Section Pattern

### Layout
- Full-width container
- Centered content
- Max-width 800px

### Colors
- Background: `--bg-teal: rgb(30, 76, 65)` OR `--bg-inverse`
- Text: white
- CTA: white button on dark, black button on light

### Typography
- Headline: 26px (same as H2)
- Subtext: 16px
- Button: 14px weight 500

---

## Footer Pattern

### Layout
- **Grid:** 4 columns desktop, 2 tablet, 1 mobile
- **Bottom row:** copyright + legal links

### Columns
1. Products
2. Solutions
3. Resources
4. Company

### Colors
- Background: `--bg-inverse` (black)
- Text: white or `--text-light-gray`
- Links hover: `--text-muted`

### Typography
- Column headers: 14px weight 500
- Links: 14px weight 400
- Legal: 12px

---

## Domain Search Pattern

### Layout
- Inline: input + button side by side
- Mobile: stacked

### Elements
- Input: max-width 300px
- Button: "Buscar" or similar

### Colors
- Background: `--bg-elevated` (rgb(223, 221, 216))
- Input: white background
- Border: subtle gray

---

## Stats Row Pattern

### Layout
- Horizontal flex row
- Evenly spaced
- Mobile: wraps to 2×2 grid

### Content
- Large number (Clarkson, bold)
- Label below (gray, smaller)

### Colors
- Background: dark section
- Numbers: white
- Labels: light gray

---

## Navigation Pattern

### Desktop
- Logo: left
- Links: center (Products, Solutions, Resources)
- CTAs: right (Login, Get Started)

### Mobile
- Logo: left
- Hamburger: right
- Drawer: slides from right

### Scroll Behavior
- Starts transparent
- Adds solid background + shadow after 50px scroll

---

## Content Spacing Scale

| Section Type | Padding Y | Padding X |
|--------------|-----------|-----------|
| Hero | 120px+ | 24px |
| Content | 80px | 24px |
| CTA | 80px | 24px |
| Footer | 64px | 24px |
| Tight | 48px | 24px |
