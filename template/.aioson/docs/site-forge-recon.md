---
description: "site-forge Phase 1 — Reconnaissance and Phase 1.5 — Deep Animation & Video Extraction"
agents: [site-forge]
---

# site-forge: Phase 1 — Reconnaissance

**Goal:** Capture raw information about the site. All modes run this phase.

## 1.1 Multi-viewport screenshots

Navigate to URL and capture at three widths: Desktop 1440px, Tablet 768px, Mobile 390px.

Save to `docs/research/<hostname>/screenshots/desktop.png`, `tablet.png`, `mobile.png`.

**Bot protection:** If page renders blank, shows CAPTCHA, or redirects to a challenge:
> "This site has bot protection. Please provide session cookies or a local HAR capture to continue."

## 1.2 Deep asset inventory (CRITICAL — do not skip steps)

**Step A — Trigger lazy loads before extraction:**

```javascript
await page.evaluate(() => {
  return new Promise(resolve => {
    let totalHeight = 0;
    const distance = 300;
    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      totalHeight += distance;
      if (totalHeight >= document.body.scrollHeight) {
        clearInterval(timer);
        window.scrollTo(0, 0);
        resolve();
      }
    }, 100);
  });
});
```

Wait 1 second after scroll for lazy-loaded content.

**Step B — Collect all image URLs:**

```javascript
const allAssets = new Set();

// img tags — including srcset variants
document.querySelectorAll('img').forEach(img => {
  if (img.src) allAssets.add(img.src);
  if (img.srcset) {
    img.srcset.split(',').forEach(s => {
      const url = s.trim().split(' ')[0];
      if (url) allAssets.add(new URL(url, window.location.href).href);
    });
  }
  if (img.dataset.src) allAssets.add(new URL(img.dataset.src, window.location.href).href);
  if (img.dataset.srcset) {
    img.dataset.srcset.split(',').forEach(s => {
      const url = s.trim().split(' ')[0];
      if (url) allAssets.add(new URL(url, window.location.href).href);
    });
  }
});

// picture source elements
document.querySelectorAll('picture source').forEach(s => {
  if (s.srcset) {
    s.srcset.split(',').forEach(src => {
      const url = src.trim().split(' ')[0];
      if (url) allAssets.add(new URL(url, window.location.href).href);
    });
  }
});

// CSS background-image on ALL elements
document.querySelectorAll('*').forEach(el => {
  const bg = window.getComputedStyle(el).backgroundImage;
  if (bg && bg !== 'none') {
    const matches = bg.match(/url\(["']?([^"')]+)["']?\)/g) || [];
    matches.forEach(m => {
      const url = m.replace(/url\(["']?|["']?\)/g, '').trim();
      if (url && !url.startsWith('data:')) allAssets.add(new URL(url, window.location.href).href);
    });
  }
});

// video elements (poster + source)
document.querySelectorAll('video').forEach(v => {
  if (v.poster) allAssets.add(v.poster);
  if (v.src && v.src !== window.location.href) allAssets.add(v.src);
  v.querySelectorAll('source').forEach(s => { if (s.src) allAssets.add(s.src); });
});

// SVG use references
document.querySelectorAll('use').forEach(u => {
  const href = u.getAttribute('href') || u.getAttribute('xlink:href');
  if (href && !href.startsWith('#'))
    allAssets.add(new URL(href.split('#')[0], window.location.href).href);
});

// inline style background-image
document.querySelectorAll('[style]').forEach(el => {
  const style = el.getAttribute('style') || '';
  const matches = style.match(/url\(["']?([^"')]+)["']?\)/g) || [];
  matches.forEach(m => {
    const url = m.replace(/url\(["']?|["']?\)/g, '').trim();
    if (url && !url.startsWith('data:')) allAssets.add(new URL(url, window.location.href).href);
  });
});

// og:image and twitter:image meta
document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(m => {
  const content = m.getAttribute('content');
  if (content) allAssets.add(new URL(content, window.location.href).href);
});

return {
  images: [...allAssets].filter(url => url.startsWith('http')),
  fonts: [...document.querySelectorAll('link[rel=stylesheet]')]
    .map(l => l.href)
    .filter(h => h.includes('fonts') || h.includes('typekit') || h.includes('adobe'))
};
```

Download all collected images to `public/images/<hostname>/`. Skip images > 2MB unless structural (hero, logo, background). Preserve original filenames; sanitize paths.

**Download is mandatory in Modes A, B, C, E.** Skip in Mode D — record URLs only.

**Copyright notice after Phase 1:**
> "Images were downloaded to `public/images/<hostname>/` as references.
> These are temporary files — replace them with your own assets before publishing."

## 1.3 Font discovery

Extract from `<link>` tags and `getComputedStyle()` on heading, body, and code elements: font families, weights loaded, where each is applied.

## 1.4 Internal link crawl

```javascript
const hostname = window.location.hostname;
const links = [...document.querySelectorAll('a[href]')]
  .map(a => a.href)
  .filter(href => {
    try { return new URL(href).hostname === hostname; } catch { return false; }
  });
return [...new Set(links)];
```

Default crawl depth:
- Mode B, D: up to 5 internal links
- Mode A, C: up to 10 internal links
- Mode E: up to 5 internal links

Per crawled sub-page: screenshots, asset inventory, note layout differences.

Save `docs/research/<hostname>/crawl-manifest.json`:
```json
{
  "mainUrl": "<url>",
  "crawledUrls": ["<url1>", "<url2>"],
  "assetsPerPage": { "<url>": ["<asset-path>"] }
}
```

Skip sub-page crawl: `--no-crawl` flag.

## 1.5 Interaction sweep (CRITICAL — complete before Phase 2)

1. Slow scroll top→bottom: observe sticky headers, scroll-driven animations, parallax, lazy loads
2. Click all interactive elements: tabs, dropdowns, modals, accordions, carousels
3. Hover suspect elements: nav items, cards, buttons, tooltips
4. Resize to 768px then 390px: observe nav collapses, layout reflows

Document per section: triggers, what animates, sticky positions, viewport changes.

## 1.6 Page topology

Map all sections top→bottom:
```
1. Header — sticky nav, logo left, links right, CTA button
2. Hero — full-viewport, headline + subtitle + 2 CTAs, background gradient
3. Features — 3-column card grid, icon + title + body each
...
```

**Output:** `docs/research/<hostname>/reconnaissance.json`
```json
{
  "url": "https://example.com",
  "hostname": "example.com",
  "screenshotsTaken": ["desktop", "tablet", "mobile"],
  "fonts": [{ "family": "Inter", "weights": [400, 500, 600], "usedFor": "body" }],
  "assetsDownloaded": ["hero.webp", "logo.svg"],
  "crawledPages": [],
  "interactionModel": {
    "header": "scroll-driven shrink at 50px",
    "featureTabs": "click-switch content"
  },
  "pageTopology": ["Header", "Hero", "Features", "Pricing", "Footer"],
  "breakpoints": { "tablet": 768, "mobile": 390 }
}
```

**Exit criterion:** Screenshots at all viewports. Assets inventoried from all sources. Lazy loads triggered before extraction. Interaction model documented. Page topology complete.

---

# site-forge: Phase 1.5 — Deep Animation & Video Extraction

**Goal:** Extract animation machinery — CSS keyframes, JS libraries, video assets, scroll-triggered mutations.

Skip only if `--no-deep` flag is set.

## 1.5.1 Animation library detection

Run immediately after Phase 1.1. Result determines Phase 4.4 implementation strategy.

```javascript
return {
  gsap:          typeof window.gsap !== 'undefined',
  scrollTrigger: typeof window.ScrollTrigger !== 'undefined',
  framerMotion:  !!document.querySelector('[data-framer-component-type]'),
  aos:           typeof window.AOS !== 'undefined',
  lottie:        typeof window.lottie !== 'undefined',
  threejs:       typeof window.THREE !== 'undefined',
  swiper:        typeof window.Swiper !== 'undefined',
  motionOne:     typeof window.animate !== 'undefined' && !!window.animate?.toString?.().includes('motion'),
};
```

Save to `docs/research/<hostname>/animations-raw.json` under key `jsLibraries`.

## 1.5.2 CSS animation rules extraction

```javascript
const animationRules = [];
const keyframes = [];
const scrollLinked = [];

for (const sheet of document.styleSheets) {
  try {
    for (const rule of sheet.cssRules) {
      const text = rule.cssText;

      if (rule instanceof CSSKeyframesRule) {
        keyframes.push({ name: rule.name, cssText: text, keyCount: rule.cssRules.length });
        continue;
      }

      if (
        text.includes('animation') || text.includes('transition') ||
        text.includes('transform') || text.includes('will-change') ||
        text.includes('scroll-timeline') || text.includes('animation-timeline') ||
        text.includes('view-timeline')
      ) {
        animationRules.push({
          selector: rule.selectorText || rule.cssText.split('{')[0].trim(),
          cssText: text,
        });
      }

      if (
        text.includes('scroll-timeline') || text.includes('animation-timeline') ||
        text.includes('view-timeline') || text.includes('scroll()')
      ) {
        scrollLinked.push({
          selector: rule.selectorText || rule.cssText.split('{')[0].trim(),
          cssText: text,
        });
      }
    }
  } catch { /* Cross-origin stylesheets — skip silently */ }
}

return { animationRules, keyframes, scrollLinked };
```

Save to `animations-raw.json` under keys `animationRules`, `keyframes`, `scrollLinked`.

Also extract computed animation properties on visible elements:

```javascript
const animated = [];
document.querySelectorAll('*').forEach(el => {
  const s = window.getComputedStyle(el);
  if (
    s.animationName !== 'none' || s.transition !== 'all 0s ease 0s' ||
    s.transform !== 'none' || s.willChange !== 'auto'
  ) {
    animated.push({
      selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + [...el.classList].join('.') : ''),
      animationName: s.animationName,
      animationDuration: s.animationDuration,
      animationTimingFunction: s.animationTimingFunction,
      transition: s.transition,
      transform: s.transform,
      willChange: s.willChange,
    });
  }
});
return animated;
```

Save to `animations-raw.json` under key `activeAnimations`.

## 1.5.3 Video extraction and download

```javascript
return [...document.querySelectorAll('video')].map(v => ({
  sources: [...v.querySelectorAll('source')].map(s => ({ src: s.src, type: s.type })),
  src: v.src || null,
  poster: v.poster || null,
  autoplay: v.autoplay,
  muted: v.muted,
  loop: v.loop,
  playsInline: v.playsInline,
  width: v.offsetWidth,
  height: v.offsetHeight,
  role: v.closest('section')?.id || v.closest('[class]')?.className || 'unknown',
}));
```

Save to `docs/research/<hostname>/videos.json`.

**Download in Modes A, B, C, E:**
- `public/videos/<hostname>/<role>.<ext>`
- Skip files > 10MB — note as `skipped: true`
- Prefer `video/webm` or `video/mp4`
- Always download poster alongside video

**Skip in Mode D** — record URLs only.

**Copyright notice (display once):**
> "Videos were downloaded to `public/videos/<hostname>/` as references. Replace them with your own videos before publishing."

## 1.5.4 Scroll recording with DOM mutation tracking

**Step A — Attach MutationObserver BEFORE scrolling:**

```javascript
const mutations = [];
const mo = new MutationObserver(entries => {
  for (const m of entries) {
    if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
      const el = m.target;
      mutations.push({
        scrollY: window.scrollY,
        element: el.tagName + (el.id ? '#' + el.id : '') +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().replace(/\s+/g, '.') : ''),
        attribute: m.attributeName,
        from: m.oldValue,
        to: el.getAttribute(m.attributeName),
      });
    }
  }
});
mo.observe(document.body, {
  subtree: true, attributes: true,
  attributeFilter: ['class', 'style'], attributeOldValue: true,
});
window.__sfMutations = mutations;
```

**Step B — Scroll to 8 checkpoints, wait 600ms, screenshot each:**

| Checkpoint | Scroll % | Purpose |
|---|---|---|
| `scroll-00pct` | 0% | Initial state |
| `scroll-12pct` | 12% | Nav solidifies |
| `scroll-25pct` | 25% | First section entry |
| `scroll-37pct` | 37% | Second section |
| `scroll-50pct` | 50% | Mid-page |
| `scroll-62pct` | 62% | Third section |
| `scroll-75pct` | 75% | Fourth section |
| `scroll-100pct` | 100% | Footer |

Save to `docs/research/<hostname>/scroll-recording/`.

**Step C — Collect mutations:**
```javascript
return window.__sfMutations;
```
Save to `docs/research/<hostname>/dom-mutations.json`.

**Step D — Analyze mutation patterns:**

Group by scroll position range and element. Append to `docs/research/<hostname>/interaction-spec.md`:

```markdown
## Scroll-triggered: <element-selector>
- **Trigger:** scrollY ≈ <N>px (≈ <pct>% of page height)
- **Change:** class `<from>` → `<to>` (or style `<property>: <from>` → `<to>`)
- **Effect type:** [REVEAL | HIDE | STATE-CHANGE | PARALLAX | STICKY]
- **Implementation note:** <inferred mechanism>
```

## 1.5.5 Parallax detection

```javascript
const targets = document.querySelectorAll('[class*="parallax"], [data-parallax], [style*="transform"]');
const results = [];
for (const el of targets) {
  const s = window.getComputedStyle(el);
  results.push({
    selector: el.className,
    transformAtCurrentScroll: s.transform,
    backgroundAttachment: s.backgroundAttachment,
  });
}
return results;
```

- `backgroundAttachment: fixed` → CSS parallax (implement with `background-attachment: fixed`)
- `transform` changes between scroll positions → JS parallax (scroll listener + `translate3d`)

Save to `animations-raw.json` under key `parallax`.

## 1.5.6 Phase 1.5 output files

```
docs/research/<hostname>/
├── animations-raw.json     ← jsLibraries, keyframes, animationRules, scrollLinked, activeAnimations, parallax
├── videos.json             ← video elements and sources
├── dom-mutations.json      ← class/style changes keyed by scrollY
└── scroll-recording/
    ├── scroll-00pct.png … scroll-100pct.png

public/videos/<hostname>/
└── [downloaded video assets]
```

**Exit criterion:** `animations-raw.json` populated with `jsLibraries`, `keyframes`, `activeAnimations`. `videos.json` written. `dom-mutations.json` written. Scroll screenshots saved. `interaction-spec.md` updated with scroll-triggered entries.
