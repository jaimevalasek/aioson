# React Motion Patterns

> React equivalents of the wow effects from static-html-patterns.md.
> Use Framer Motion as the primary animation library. Plain CSS animations as fallback when Framer Motion is not installed.

---

## When to apply this skill

Read this skill when:
- `framework=React` or `framework=Next.js`
- The project has visual/marketing pages, landing sections, or dashboards that need motion
- The user asks for "wow", "animated", "animation", "effect", "modern"
- `ui_style=Bold & Cinematic` in `project.context.md`

Do NOT apply heavy motion to pure admin/CRUD interfaces — motion must serve the user, not decorate data.

---

## Dependencies

```bash
# Primary — install when any motion pattern is needed
npm install framer-motion

# For scroll-driven animations without Framer Motion
# Use Intersection Observer (built-in browser API — no install needed)

# For sliders
npm install swiper

# For tilt (lightweight, no Framer Motion dependency)
npm install vanilla-tilt
# or use the custom hook below (zero dependencies)
```

---

## 1. Animated mesh background (hero section)

CSS-only. Works in React, Next.js, Vue — no JS library needed.

```tsx
// components/ui/MeshBackground.tsx
export function MeshBackground() {
  return (
    <div className="mesh-bg" aria-hidden="true" />
  )
}
```

```css
/* styles/mesh.css  — or inside CSS Module / Tailwind @layer */
.mesh-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 120% 80% at -15% -10%, hsla(265, 70%, 55%, 0.28), transparent 60%),
    radial-gradient(ellipse 80%  60% at 110%  20%, hsla(190, 80%, 55%, 0.22), transparent 55%),
    radial-gradient(ellipse 60%  50% at  50% 110%, hsla(310, 75%, 65%, 0.18), transparent 60%),
    hsl(240, 15%, 6%);
  background-size: 200% 200%;
  animation: meshDrift 20s ease infinite alternate;
  z-index: 0;
}

@keyframes meshDrift {
  0%   { background-position: 0%   0%;   }
  33%  { background-position: 60%  40%;  }
  66%  { background-position: 40%  80%;  }
  100% { background-position: 100% 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .mesh-bg { animation: none; }
}
```

---

## 2. Animated gradient text

```tsx
// components/ui/GradientText.tsx
interface GradientTextProps {
  children: React.ReactNode
  className?: string
}

export function GradientText({ children, className }: GradientTextProps) {
  return (
    <span className={`gradient-text ${className ?? ''}`}>
      {children}
    </span>
  )
}
```

```css
.gradient-text {
  background: linear-gradient(
    135deg,
    hsl(265, 80%, 65%),
    hsl(190, 80%, 55%),
    hsl(310, 75%, 65%),
    hsl(265, 80%, 65%)
  );
  background-size: 300% 300%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: textGradient 8s ease infinite;
}

@keyframes textGradient {
  0%, 100% { background-position: 0%   50%; }
  50%       { background-position: 100% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .gradient-text {
    animation: none;
    background-position: 0% 50%;
  }
}
```

Usage:
```tsx
<h1>The future of <GradientText>everything</GradientText></h1>
```

---

## 3. Scroll reveal (Framer Motion)

```tsx
// components/ui/Reveal.tsx
'use client' // Next.js only
import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'

interface RevealProps {
  children: React.ReactNode
  delay?: number
  className?: string
}

export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
```

Usage — staggered reveal:
```tsx
<Reveal><SectionLabel>Features</SectionLabel></Reveal>
<Reveal delay={0.1}><h2>Everything you need</h2></Reveal>
<Reveal delay={0.2}><p>Supporting text here.</p></Reveal>
```

**Without Framer Motion** — Intersection Observer hook:
```tsx
// hooks/useReveal.ts
import { useEffect, useRef, useState } from 'react'

export function useReveal(margin = '-80px') {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: margin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [margin])

  return { ref, visible }
}

// Usage
function FeatureCard() {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(40px)',
        transition: 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      ...
    </div>
  )
}
```

---

## 4. 3D card tilt on hover

```tsx
// hooks/useTilt.ts
import { useRef } from 'react'

export function useTilt(intensity = 14) {
  const ref = useRef<HTMLDivElement>(null)

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = ref.current
    if (!card) return
    const r = card.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width  - 0.5
    const y = (e.clientY - r.top)  / r.height - 0.5
    card.style.transform = `perspective(700px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateZ(10px)`
  }

  function onMouseLeave() {
    if (ref.current) ref.current.style.transform = ''
  }

  return { ref, onMouseMove, onMouseLeave }
}
```

```tsx
// components/ui/TiltCard.tsx
import { useTilt } from '@/hooks/useTilt'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
}

export function TiltCard({ children, className }: TiltCardProps) {
  const { ref, onMouseMove, onMouseLeave } = useTilt()

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ transition: 'transform 0.15s ease', willChange: 'transform' }}
    >
      {children}
    </div>
  )
}
```

Usage:
```tsx
<div className="features-grid">
  {features.map(f => (
    <TiltCard key={f.id} className="feature-card">
      <span className="feature-icon">{f.icon}</span>
      <h3>{f.title}</h3>
      <p>{f.description}</p>
    </TiltCard>
  ))}
</div>
```

> Disable on touch devices and `prefers-reduced-motion`:
```tsx
// In useTilt.ts — add guard at top of onMouseMove:
if (window.matchMedia('(hover: none)').matches) return
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
```

---

## 5. Hero intro — staggered entrance (Framer Motion)

```tsx
// components/sections/Hero.tsx
'use client'
import { motion } from 'framer-motion'

const item = {
  hidden: { opacity: 0, y: 30 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
}

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

export function Hero() {
  return (
    <section className="hero">
      <MeshBackground />
      <motion.div
        className="hero__content"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.span variants={item} className="hero__label">
          Category / Tagline
        </motion.span>
        <motion.h1 variants={item} className="hero__title">
          Bold headline that <GradientText>changes everything</GradientText>
        </motion.h1>
        <motion.p variants={item} className="hero__subtitle">
          Supporting text with real context — who benefits, how, what outcome.
        </motion.p>
        <motion.div variants={item} className="hero__actions">
          <a href="#signup" className="btn btn--primary">Get started</a>
          <a href="#demo"   className="btn btn--ghost">Watch demo</a>
        </motion.div>
      </motion.div>
    </section>
  )
}
```

---

## 6. Infinite logo marquee (CSS only)

```tsx
// components/ui/Marquee.tsx
interface MarqueeProps {
  items: React.ReactNode[]
  speed?: number // seconds for one full loop
}

export function Marquee({ items, speed = 24 }: MarqueeProps) {
  // Duplicate items to create seamless loop
  const doubled = [...items, ...items]

  return (
    <div className="marquee" aria-hidden="true">
      <div
        className="marquee__track"
        style={{ animationDuration: `${speed}s` }}
      >
        {doubled.map((item, i) => (
          <div key={i} className="marquee__item">{item}</div>
        ))}
      </div>
    </div>
  )
}
```

```css
.marquee {
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
}

.marquee__track {
  display: flex;
  gap: 3rem;
  width: max-content;
  animation: infiniteSlide linear infinite;
}

.marquee:hover .marquee__track {
  animation-play-state: paused;
}

@keyframes infiniteSlide {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  .marquee__track { animation: none; }
}
```

---

## 7. Scroll progress bar

```tsx
// components/ui/ScrollProgress.tsx
'use client'
import { useScroll, useSpring, motion } from 'framer-motion'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 })

  return (
    <motion.div
      className="scroll-progress"
      style={{ scaleX, transformOrigin: 'left' }}
    />
  )
}
```

```css
.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(to right, hsl(265, 80%, 65%), hsl(190, 80%, 55%));
  z-index: 1000;
}
```

---

## 8. Glassmorphism card

```tsx
// components/ui/GlassCard.tsx
export function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card ${className ?? ''}`}>
      {children}
    </div>
  )
}
```

```css
.glass-card {
  background: hsla(240, 20%, 100%, 0.04);
  border: 1px solid hsla(240, 20%, 100%, 0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 1.5rem;
  /* Subtle inner glow */
  box-shadow:
    0 0 0 1px hsla(265, 70%, 65%, 0.08),
    inset 0 1px 0 hsla(240, 100%, 100%, 0.05);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.glass-card:hover {
  border-color: hsla(265, 70%, 65%, 0.25);
  box-shadow:
    0 0 0 1px hsla(265, 70%, 65%, 0.15),
    0 8px 32px hsla(265, 70%, 55%, 0.12),
    inset 0 1px 0 hsla(240, 100%, 100%, 0.08);
}
```

---

## 9. Floating orbs (decorative)

```tsx
// components/ui/FloatingOrbs.tsx
export function FloatingOrbs() {
  return (
    <div className="orbs" aria-hidden="true">
      <div className="orb orb--1" />
      <div className="orb orb--2" />
      <div className="orb orb--3" />
    </div>
  )
}
```

```css
.orbs {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.35;
  animation: orbFloat 12s ease-in-out infinite;
}

.orb--1 {
  width: 500px; height: 500px;
  top: -200px; left: -100px;
  background: radial-gradient(circle, hsl(265, 80%, 60%), transparent 70%);
  animation-delay: 0s;
}

.orb--2 {
  width: 400px; height: 400px;
  top: 30%; right: -150px;
  background: radial-gradient(circle, hsl(190, 80%, 55%), transparent 70%);
  animation-delay: -4s;
}

.orb--3 {
  width: 350px; height: 350px;
  bottom: -100px; left: 40%;
  background: radial-gradient(circle, hsl(310, 75%, 60%), transparent 70%);
  animation-delay: -8s;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0,  0)   scale(1);    }
  33%       { transform: translate(30px, -40px) scale(1.05); }
  66%       { transform: translate(-20px, 20px) scale(0.95); }
}

@media (prefers-reduced-motion: reduce) {
  .orb { animation: none; }
}
```

---

## 10. Page transition (Next.js App Router)

```tsx
// components/ui/PageTransition.tsx
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

Add to `app/layout.tsx`:
```tsx
<PageTransition>{children}</PageTransition>
```

---

## Hard rules

- Always include `prefers-reduced-motion` fallback for every animation
- Never animate layout properties (width, height, top, left) — animate `transform` and `opacity` only
- Keep animation durations short for UI (150–300ms), longer for hero/decorative (600ms–20s)
- Tilt and 3D effects must be disabled on touch devices (`hover: none` media query)
- Do not install Framer Motion just for one CSS animation — use plain CSS keyframes instead
- Keep decorative elements (`orbs`, `mesh`, `marquee`) `aria-hidden="true"` and `pointer-events: none`

## When CSS is not enough — Three.js (on-demand)

The patterns above cover 95% of animation needs. When the user explicitly requests
particle systems, WebGL scenes, holographic effects, or interactive 3D objects:

Load `.aioson/skills/static/threejs-patterns.md` instead.

**CSS 3D Transforms vs Three.js/WebGL:**

| Technique | CSS 3D Transforms (above) | Three.js (threejs-patterns.md) |
|---|---|---|
| Card tilt | `perspective(700px) rotateY/X` | Not needed — CSS handles it |
| Mesh background | `@keyframes meshDrift` on gradient | Particle aurora backdrop (3D points) |
| Floating orbs | CSS with `border-radius: 50%` blur | Not needed — CSS is cleaner |
| 3D object showcase | Not possible | TorusKnot/Icosahedron with OrbitControls |
| Holographic effect | Not possible | MeshPhysicalMaterial with iridescence + bloom |
| Scroll-driven 3D | Not possible | Camera moves through 3D scene on scroll |
| Particle physics | Not possible | 3,000–8,000 points with drift behavior |

Three.js is CDN-only (no npm install required) for all patterns in threejs-patterns.md.
It is always additive — the design skill tokens (colors, typography, spacing) continue to govern the HTML/CSS layer.
