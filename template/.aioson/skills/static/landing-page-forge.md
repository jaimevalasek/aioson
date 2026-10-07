---
name: landing-page-forge
description: Advanced landing page production skill — animation libraries (GSAP, AnimeJS), high-impact motion patterns (horizontal scroll, magnetic mouse, hero sequences), performance checklist, SEO/LLMO setup, tracking integration. Load when building landing pages, sales pages, event pages, or any conversion-focused page.
---

# Landing Page Forge

Production playbook for landing pages. The approved prototype, identity and `interface-design` direction govern the visual result. Motion patterns below are optional techniques, not a premium checklist; a static page can succeed through typography, composition and real evidence. Resolve effect colors from the identity or selected `design:seed` candidate. Apply performance, discoverability and tracking sections only within the project scope.

---

## 1. Animation library choice

### GSAP (GreenSock Animation Platform)
**Use when:** you need scroll-driven horizontal sections, magnetic mouse effects, SVG animations, or complex sequenced timelines.

```html
<!-- CDN (free tier covers most needs) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
```

```js
gsap.registerPlugin(ScrollTrigger);
```

**npm:** `npm install gsap`

### AnimeJS
**Use when:** you want lightweight, zero-dependency micro-animations — counters, SVG morphing, staggered list reveals, hover interactions.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></script>
```

**npm:** `npm install animejs`

### When to use which

| Effect | Library |
|---|---|
| Horizontal scroll section | GSAP + ScrollTrigger |
| Magnetic mouse / cursor aura | GSAP |
| Scroll-reveal stagger | Either (GSAP for precision, AnimeJS for light pages) |
| Number count-up | AnimeJS |
| SVG path drawing | AnimeJS |
| Complex parallax | GSAP |
| Simple fade-in sequence | CSS keyframes (no library needed) |

---

## 2. High-impact motion patterns

### 2.1 Horizontal scroll marquee (infinite ticker)

Feature strip, client logos, testimonials — scrolls sideways while user scrolls down.

```html
<section class="marquee-section">
  <div class="marquee-track">
    <div class="marquee-items" id="marqueeItems">
      <!-- items duplicated in JS -->
    </div>
  </div>
</section>
```

```css
.marquee-section { overflow: hidden; }
.marquee-track { display: flex; }
.marquee-items { display: flex; gap: 48px; white-space: nowrap; will-change: transform; }
```

```js
// GSAP infinite marquee
gsap.to("#marqueeItems", {
  x: "-50%",
  duration: 20,
  ease: "none",
  repeat: -1
});
// Clone items for seamless loop
const items = document.getElementById("marqueeItems");
items.innerHTML += items.innerHTML;
```

### 2.2 Horizontal scroll section (scroll → move sideways)

Cards or features that slide horizontally as user scrolls vertically.

```html
<section class="h-scroll-wrapper">
  <div class="h-scroll-pin">
    <div class="h-scroll-track" id="hTrack">
      <div class="h-scroll-card">...</div>
      <div class="h-scroll-card">...</div>
      <div class="h-scroll-card">...</div>
    </div>
  </div>
</section>
```

```css
.h-scroll-wrapper { height: 300vh; }
.h-scroll-pin { position: sticky; top: 0; overflow: hidden; height: 100vh; }
.h-scroll-track { display: flex; width: max-content; }
.h-scroll-card { width: 80vw; flex-shrink: 0; margin-right: 32px; }
```

```js
const track = document.getElementById("hTrack");
const totalWidth = track.scrollWidth - window.innerWidth;

gsap.to(track, {
  x: () => -totalWidth,
  ease: "none",
  scrollTrigger: {
    trigger: ".h-scroll-wrapper",
    start: "top top",
    end: "bottom top",
    scrub: 1,
    pin: ".h-scroll-pin",
    anticipatePin: 1
  }
});
```

### 2.3 Magnetic mouse effect (cursor aura / hover field)

Interactive element that subtly follows the cursor — gives premium tactile feel.

```html
<div class="magnetic-btn" id="magneticBtn">
  <span>Get Started</span>
</div>
```

```js
const btn = document.getElementById("magneticBtn");

btn.addEventListener("mousemove", (e) => {
  const rect = btn.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  const strength = 0.35;

  gsap.to(btn, {
    x: x * strength,
    y: y * strength,
    duration: 0.3,
    ease: "power2.out"
  });
});

btn.addEventListener("mouseleave", () => {
  gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
});
```

**Cursor aura (glow that follows mouse globally):**
```html
<div class="cursor-aura" id="cursorAura"></div>
```

```css
.cursor-aura {
  position: fixed;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 12%, transparent) 0%, transparent 70%);
  pointer-events: none;
  transform: translate(-50%, -50%);
  z-index: 0;
  transition: opacity 0.3s;
}
```

```js
document.addEventListener("mousemove", (e) => {
  gsap.to("#cursorAura", {
    x: e.clientX,
    y: e.clientY,
    duration: 0.6,
    ease: "power2.out"
  });
});
```

### 2.4 Scroll-reveal stagger (IntersectionObserver)

Elements fade in as they enter the viewport — staggered per group.

```html
<div class="reveal-group">
  <div class="reveal-item">...</div>
  <div class="reveal-item">...</div>
  <div class="reveal-item">...</div>
</div>
```

```css
.reveal-item {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal-item.visible {
  opacity: 1;
  transform: translateY(0);
}
```

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add("visible"), i * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll(".reveal-item").forEach(el => observer.observe(el));
```

### 2.5 Number counter animation (AnimeJS)

Stats and metrics that count up when scrolled into view.

```html
<span class="counter" data-target="200">0</span>
```

```js
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = +el.dataset.target;
    anime({
      targets: el,
      innerHTML: [0, target],
      round: 1,
      duration: 1800,
      easing: "easeOutExpo",
      update: () => { el.innerHTML = Math.round(el.innerHTML); }
    });
    counterObserver.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll(".counter").forEach(el => counterObserver.observe(el));
```

### 2.6 Hero entrance sequence

Staggered load sequence for above-the-fold hero sections.

```js
// GSAP timeline — fires on page load
const heroTL = gsap.timeline({ defaults: { ease: "power3.out" } });

heroTL
  .from(".hero-heading",  { y: 30, opacity: 0, duration: 0.8 }, "-=0.3")
  .from(".hero-sub",      { y: 20, opacity: 0, duration: 0.6 }, "-=0.4")
  .from(".hero-cta",      { y: 20, opacity: 0, duration: 0.5, stagger: 0.1 }, "-=0.3")
  .from(".hero-media",    { scale: 0.96, opacity: 0, duration: 0.8 }, "-=0.5");
```

---

## 3. Performance checklist (< 2.5 s load target)

### Images
- [ ] Use WebP format for all photography and illustrations
- [ ] Set `loading="lazy"` on all images below the fold
- [ ] Preload hero/above-the-fold image: `<link rel="preload" as="image" href="hero.webp">`
- [ ] Specify `width` and `height` on every `<img>` to prevent layout shift
- [ ] Use `srcset` for responsive image sizes

### Fonts
- [ ] Self-host or use `font-display: swap`
- [ ] Preconnect to font CDN: `<link rel="preconnect" href="https://fonts.googleapis.com">`
- [ ] Preload critical font file: `<link rel="preload" as="font" type="font/woff2" crossorigin>`
- [ ] Load only the weights actually used (400, 500, 600 typically sufficient)

### CSS / JS
- [ ] No unused CSS (purge TailwindCSS or use inline critical CSS)
- [ ] Defer non-critical JS: `<script defer src="..."></script>`
- [ ] Load animation libraries only after hero is painted (use `defer` or dynamic import)
- [ ] Minify all assets before deploy

### Animation performance
- [ ] Use `transform` and `opacity` only — never animate `width`, `height`, `top`, `left`
- [ ] Add `will-change: transform` to elements with heavy animation (sparingly)
- [ ] Respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

### Validation targets
- PageSpeed Insights score: ≥ 90 mobile, ≥ 95 desktop
- LCP (Largest Contentful Paint): < 2.5 s
- CLS (Cumulative Layout Shift): < 0.1
- FID/INP: < 200 ms

---

## 4. SEO / LLMO setup

### HTML head — minimum viable

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Primary Keyword — Brand Name</title>
<meta name="description" content="150–160 character description with primary keyword.">
<link rel="canonical" href="https://yourdomain.com/page-slug">

<!-- Open Graph -->
<meta property="og:title" content="Page Title">
<meta property="og:description" content="Description">
<meta property="og:image" content="https://yourdomain.com/og-image.jpg"> <!-- 1200×630 -->
<meta property="og:url" content="https://yourdomain.com/page-slug">
<meta property="og:type" content="website">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Page Title">
<meta name="twitter:description" content="Description">
<meta name="twitter:image" content="https://yourdomain.com/og-image.jpg">
```

### H-tag hierarchy (one page = one H1)

```
H1 — Primary keyword, page purpose (ONE per page)
  H2 — Major sections
    H3 — Sub-topics within sections
```

### JSON-LD schema (place before `</body>`)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Page Title",
  "description": "Page description",
  "url": "https://yourdomain.com/page-slug",
  "publisher": {
    "@type": "Organization",
    "name": "Brand Name",
    "url": "https://yourdomain.com"
  }
}
</script>
```

For events:
```json
{
  "@type": "Event",
  "name": "Event Name",
  "startDate": "2025-05-10T19:00",
  "location": { "@type": "Place", "name": "Venue" },
  "offers": { "@type": "Offer", "price": "997", "priceCurrency": "BRL" }
}
```

### Sitemap and robots

**`/sitemap.xml`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yourdomain.com/</loc>
    <lastmod>2025-04-01</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
```

**`/robots.txt`:**
```
User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml
```

**`/llms.txt`** (LLMO — AI discoverability):
```markdown
# Brand Name

> One-line description of what this site/product is.

## What we offer
- Feature or service 1
- Feature or service 2

## Contact
- Site: https://yourdomain.com
- Email: contact@yourdomain.com
```

---

## 5. Tracking integration

### Meta Pixel + Advanced Matching

Place in `<head>`, replace `PIXEL_ID`:

```html
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');

fbq('init', 'PIXEL_ID', {
  em: '<hashed_email_if_known>'  // Advanced Matching — pass SHA256 hashed email
});
fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=PIXEL_ID&ev=PageView&noscript=1"/>
</noscript>
```

**Standard events to fire on key actions:**
```js
// Lead capture form submit
fbq('track', 'Lead', { content_name: 'Newsletter Signup' });

// Checkout / purchase intent
fbq('track', 'InitiateCheckout', { value: 997, currency: 'BRL' });

// Purchase confirmed
fbq('track', 'Purchase', { value: 997, currency: 'BRL' });
```

### Google Tag Manager

```html
<!-- In <head> -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>

<!-- Immediately after <body> -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
```

### UTM capture and persistence

Captures UTM parameters on landing and persists them through the session for downstream form submissions.

```js
(function() {
  const params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const url = new URL(window.location.href);
  
  params.forEach(param => {
    const value = url.searchParams.get(param);
    if (value) {
      sessionStorage.setItem(param, value);
      // Also set cookie for cross-page persistence
      document.cookie = `${param}=${encodeURIComponent(value)};path=/;max-age=1800`;
    }
  });

  // Attach UTMs to all form submissions
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', () => {
      params.forEach(param => {
        const value = sessionStorage.getItem(param);
        if (value) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = param;
          input.value = value;
          form.appendChild(input);
        }
      });
    });
  });
})();
```

---

## 6. Mobile-first responsive rules for landing pages

```css
/* Base: mobile (< 640px) */
.hero-heading { font-size: clamp(2rem, 8vw, 4.5rem); }
.section-padding { padding: 64px 24px; }
.grid-cols { grid-template-columns: 1fr; }

/* Tablet (≥ 768px) */
@media (min-width: 768px) {
  .section-padding { padding: 96px 48px; }
  .grid-cols { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop (≥ 1024px) */
@media (min-width: 1024px) {
  .section-padding { padding: 128px 80px; }
  .grid-cols { grid-template-columns: repeat(3, 1fr); }
}
```

**Key landing page responsive rules:**
- CTA buttons: minimum 48px height on mobile, full-width on < 480px
- Horizontal scroll sections: disable on mobile, show vertical stack instead
- Magnetic mouse effects: disable on touch devices (`@media (hover: none)`)
- Font size: use `clamp()` for fluid scaling between breakpoints
- Hero text: max 2 lines on mobile — truncate copy if needed

```js
// Disable magnetic effects on touch
const isTouchDevice = () => window.matchMedia("(hover: none)").matches;
if (!isTouchDevice()) {
  // init magnetic effects
}
```

---

## 7. Pre-launch validation checklist

### Visual
- [ ] Renders correctly on iPhone SE (375px), iPhone 14 (390px), iPad (768px), Desktop (1280px)
- [ ] All CTAs visible above fold on mobile
- [ ] No horizontal overflow on any breakpoint
- [ ] All images have `alt` text

### Functional
- [ ] All CTA buttons and links work
- [ ] Form submits correctly and shows success/error state
- [ ] No console errors in Chrome, Firefox, Safari

### Performance
- [ ] PageSpeed score ≥ 90 mobile
- [ ] LCP < 2.5 s on mobile (test on throttled 3G in DevTools)

### Tracking
- [ ] Meta Pixel fires PageView on load (verify in Meta Pixel Helper)
- [ ] GTM fires on load (verify in Tag Assistant)
- [ ] UTM params captured in sessionStorage when visiting with `?utm_source=test`
- [ ] Lead event fires on form submit

### SEO / LLMO
- [ ] Single H1 present
- [ ] Meta description populated
- [ ] Canonical URL correct
- [ ] OG image renders correctly (test at opengraph.xyz)
- [ ] /robots.txt accessible
- [ ] /sitemap.xml accessible and valid
- [ ] /llms.txt present

### SSL and deploy
- [ ] HTTPS certificate active (no mixed content warnings)
- [ ] Domain resolves correctly on all subdomains being used
- [ ] Redirects from www/non-www consistent

---

## 8. Tech stack recommendations

| Need | Recommended |
|---|---|
| Static HTML/CSS/JS page | Plain HTML + Vite for bundling |
| React-based | Next.js (Static Export for max speed) |
| Animation library | GSAP (complex) or AnimeJS (lightweight) |
| Image generation | Google Imagen via API, or Flux |
| Hosting (BRL-friendly) | Hostinger VPS (LiteSpeed) |
| Hosting (automated deploy) | Vercel (Git-connected, CDN edge) |
| DNS / CDN | Cloudflare (free tier covers most pages) |
| Form backend | Formspree, Basin, or native webhook to CRM |

---

## 9. Production execution pattern — 3 parallel tracks

The most common failure in AI-generated landing pages: the page looks good but doesn't have tracking, doesn't have SEO, and fails PageSpeed. These three tracks must run **simultaneously** during implementation — not as an afterthought checklist.

### How to execute in parallel

When building a page, structure the implementation in two phases:

**Phase 1 — Structure & visual** (sequential prerequisite)
Build the HTML structure, CSS design system, content sections, and animations. Get the page looking correct on desktop and mobile.

**Phase 2 — Production readiness** (3 tracks in parallel)
Once Phase 1 is complete, execute all three tracks before considering the page done:

```
Phase 2 — run all three simultaneously:

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Track A: SEO/LLMO │  │  Track B: Tracking  │  │ Track C: Performance│
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│ • Single H1         │  │ • Meta Pixel init   │  │ • Images → WebP     │
│ • Meta description  │  │ • PageView event    │  │ • lazy loading      │
│ • Canonical URL     │  │ • Lead event (form) │  │ • Hero preload      │
│ • OG tags           │  │ • GTM container     │  │ • Defer JS          │
│ • JSON-LD schema    │  │ • UTM capture       │  │ • Remove unused CSS │
│ • /robots.txt       │  │ • UTM → form inject │  │ • will-change       │
│ • /sitemap.xml      │  │ • Cookie consent    │  │ • prefers-reduced-  │
│ • /llms.txt         │  │   (LGPD if BR)      │  │   motion fallback   │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
         ↓                         ↓                         ↓
         └─────────────────────────┴─────────────────────────┘
                                   ↓
                    Phase 3 — Validation (sequential)
                    • PageSpeed ≥ 90 mobile
                    • Cross-browser check
                    • CTAs and forms functional
                    • Pixel fires on load (Pixel Helper)
                    • Deploy
```

### Track A delivery checklist
```html
<!-- SEO/LLMO minimum — all in <head> -->
<title>Primary Keyword — Brand Name</title>
<meta name="description" content="150–160 chars">
<link rel="canonical" href="https://yourdomain.com/page">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="..."> <!-- 1200×630 -->
<meta property="og:url" content="...">
```
```
# /robots.txt
User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml
```
```markdown
# /llms.txt — brand summary for AI discoverability
# [Brand Name]
> [One-line description]
## Products/Services
- [item]
## Contact
- [url]
```

### Track B delivery checklist
```html
<!-- Pixel in <head> — replace PIXEL_ID -->
<script>
!function(f,b,e,v,n,t,s){...}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'PIXEL_ID');
fbq('track', 'PageView');
</script>

<!-- GTM in <head> — replace GTM-XXXXXXX -->
<script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>

<!-- UTM capture — in <body> before </body> -->
<script>
(function() {
  const params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
  const url = new URL(window.location.href);
  params.forEach(p => {
    const v = url.searchParams.get(p);
    if (v) { sessionStorage.setItem(p, v); document.cookie = `${p}=${encodeURIComponent(v)};path=/;max-age=1800`; }
  });
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', () => {
      params.forEach(p => {
        const v = sessionStorage.getItem(p);
        if (v) { const i = document.createElement('input'); i.type='hidden'; i.name=p; i.value=v; form.appendChild(i); }
      });
    });
  });
})();
</script>
```

### Track C delivery checklist
```html
<!-- Hero image preload — always first in <head> -->
<link rel="preload" as="image" href="hero.webp">

<!-- Font preconnect -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preload" as="font" type="font/woff2" href="/fonts/selected-display.woff2" crossorigin>

<!-- Animation libraries — defer so they don't block render -->
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```
```css
/* Reduced motion fallback — always present */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
/* will-change only on actively animated elements */
.hero-bg { will-change: transform; }
```

### Why this matters (from production data)
Pages without tracking have no conversion data → impossible to optimize → wasted ad spend.
Pages without SEO/LLMO miss organic and AI-referred traffic → dead investment.
Pages loading in 3+ seconds lose 40%+ of mobile traffic before the first CTA is seen.

Running the three tracks in parallel (not as afterthought) means a page is truly production-ready when it launches, not just visually finished.
