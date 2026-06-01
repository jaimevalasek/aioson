---
description: "site-forge Phase 4 — Build Layer: component implementation, interactions, video, asset wiring, assembly"
agents: [site-forge]
---

# site-forge: Phase 4 — Build Layer

**Goal:** Implement all sections and components.

Active token source by mode:
- **Mode A:** skill `references/design-tokens.md`
- **Mode B:** forged skill from Phase 3B
- **Mode C:** skill tokens; slot extracted content/images from component map
- **Mode E:** `blended-tokens.css` from Phase 3E

## 4.1 Complexity budget

- **Simple** (< 3 sub-components): implement directly
- **Moderate** (3–5 sub-components): one worktree builder
- **Complex** (> 5 sub-components): split across multiple builders

## 4.2 Direct implementation (simple sections)

Build inline. Use skill tokens. Reference section spec and component map. Run `npx tsc --noEmit` after each file.

## 4.3 Worktree builders (moderate/complex sections)

```bash
git worktree add ../worktree-<section> -b builder/<section>
```

Each builder receives:
1. Section spec file (inline)
2. Component map rows for this section (inline)
3. Relevant tokens from active token file (inline — only what's needed)
4. Path to screenshots
5. Target file: `src/components/<SectionName>.tsx`
6. Requirement: `npx tsc --noEmit` must pass

After builder completes:
```bash
npx tsc --noEmit
git add -A && git commit -m "build(<section>): implement with <skill-name> tokens"
git worktree remove ../worktree-<section>
git merge builder/<section> --no-ff -m "merge: <section> builder"
```

Conflict resolution: structure wins — preserve DOM hierarchy from spec; replace style values with skill tokens.

## 4.4 Interaction implementation (MANDATORY — do not skip)

Read `docs/research/<hostname>/animations-raw.json` → `jsLibraries` and `dom-mutations.json` before choosing strategy.

### 4.4.A Implementation strategy routing

**Step 1 — Choose animation layer based on detected libraries:**

| Detected | Install | Strategy |
|---|---|---|
| `gsap: true` | `npm install gsap` | GSAP + ScrollTrigger for all scroll-driven |
| `framerMotion: true` | `npm install framer-motion` | `<motion.div>` with `whileInView` / `useScroll` |
| `swiper: true` | `npm install swiper` | Swiper React for carousels/sliders |
| `lottie: true` | `npm install lottie-react` | `<Lottie>` for SVG animations |
| `aos: true` | *(no install)* | `IntersectionObserver` + CSS classes |
| none detected | *(no install)* | `IntersectionObserver` + CSS `@keyframes` |

Install all detected libraries simultaneously.

**Step 2 — Scroll-driven animations from `dom-mutations.json`:**

```typescript
// GSAP ScrollTrigger (when gsap detected)
gsap.from('.hero__headline', {
  opacity: 0, y: 20, duration: 0.4, ease: 'power2.out',
  scrollTrigger: {
    trigger: '.hero__headline',
    start: 'top 80%', // derived from mutation scrollY / pageHeight
    once: true,
  },
});

// IntersectionObserver (when no GSAP)
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-animated'); });
}, { threshold: 0.15 });
document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
```

Use `scrollY` values from `dom-mutations.json` to calibrate `start` offsets or `threshold` values.

**Step 3 — Recreate `@keyframes` from `animations-raw.json`:**

Copy each entry's `cssText` verbatim into `src/app/globals.css`. Apply duration via class, not inside keyframe:

```css
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-slide-up {
  animation: fadeSlideUp var(--transition-slow) var(--ease-out) forwards;
}
```

**Step 4 — Parallax from `animations-raw.json.parallax`:**

- `backgroundAttachment: fixed` → `background-attachment: fixed` — no JS.
- JS parallax (transform changes between scroll positions):
```typescript
useEffect(() => {
  const el = ref.current;
  const handleScroll = () => {
    const rate = 0.4; // adjust to match observed translation ratio
    el.style.transform = `translate3d(0, ${window.scrollY * rate}px, 0)`;
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => window.removeEventListener('scroll', handleScroll);
}, []);
```

**Step 5 — Remaining interactions from `interaction-spec.md`:**

- **SCROLL-DRIVEN without mutation data:** `IntersectionObserver` with `threshold: 0.1`
- **CLICK-DRIVEN:** React `useState` toggle + conditional className
- **HOVER:** Tailwind hover variants or CSS `:hover` + `transition: var(--transition-all)`
- **STATE-TOGGLE:** React `useState` + conditional className

Use motion tokens for all `transition` and `animation-duration`. Never hardcode `ms`.

Every interaction in the spec must be implemented. If too complex, implement simplified and note in QA report as ⚠️ — never leave unimplemented.

### 4.4.B Video background implementation (MANDATORY when videos.json is non-empty)

```tsx
// VideoBackground.tsx
export function VideoBackground({ role }: { role: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <video
        autoPlay muted loop playsInline
        poster={`/images/<hostname>/${role}-poster.jpg`}
        className="w-full h-full object-cover"
        style={{ willChange: 'transform' }}
      >
        <source src={`/videos/<hostname>/${role}.webm`} type="video/webm" />
        <source src={`/videos/<hostname>/${role}.mp4`} type="video/mp4" />
      </video>
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--overlay-dark)' }} />
    </div>
  );
}
```

If skipped (> 10MB or blocked): use poster as `background-image`, note in QA report as ⚠️ with original URL.

- Render video behind content (`z-index: 0` on video, `z-index: 1` on content).
- Always include overlay div for text readability.
- Always add `prefers-reduced-motion` support:
```css
@media (prefers-reduced-motion: reduce) {
  video[autoplay] { display: none; }
}
```

## 4.5 Asset wiring (MANDATORY — do not skip)

Before assembly, verify every downloaded image is referenced in its component.

Check `docs/research/components/<section-slug>.spec.md` → "Content slots" → Image entries. Use `next/image`:

```tsx
// Correct
import Image from 'next/image'
<Image src="/images/<hostname>/hero.webp" alt="hero" fill className="object-cover" />

// Wrong — placeholder when downloaded asset exists
<div className="bg-gray-200 w-full h-64" />
```

If not downloaded (> 2MB or blocked): placeholder + note in QA report as ⚠️ with original URL.

**Asset lifecycle notice (display once before assembly):**
> "Images in `public/images/<hostname>/` are development references. Replace them with your own assets before publishing."

## 4.6 Assembly

1. Create `src/app/page.tsx` importing all sections in page topology order.
2. Apply token root in `src/app/globals.css`:
   - Modes A, B, C: paste skill's `:root {}` block
   - Mode E: paste `blended-tokens.css` content
3. Run `npm run build` — must pass with 0 errors and 0 TypeScript errors.

Fix TypeScript errors first, then CSS token resolution. Do not proceed to Phase 5 with a broken build.

**Exit criterion:** `npm run build` passes. All sections rendered. All interactions implemented. All downloaded assets referenced. Skill tokens active globally.
