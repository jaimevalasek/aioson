# Optional Production Techniques

> Load only for a technique already justified by the visual direction. These examples originated in one agency template; they are not a definition of premium quality or a prescribed aesthetic.
> The approved prototype, identity and `interface-design` decisions govern the result. Resolve color variables from that identity or the selected `design:seed` candidate.

## 14. Optional production patterns

Choose each technique independently for its communication or interaction value. Static composition, image treatment and typography remain complete design options.

---

### 14a. effectFade Animations (signature 3D entrance)

Two animation modes used by the Aigocy template — add these classes to any element
and trigger via GSAP ScrollTrigger or IntersectionObserver.

**HTML markup:**
```html
<!-- Simple fade up — most common -->
<h2 class="effectFade fadeUp" data-delay="0">Headline</h2>
<p class="effectFade fadeUp" data-delay="0.15">Supporting text</p>

<!-- 3D perspective rotate — signature "cinematic" entrance -->
<div class="effectFade fadeRotateX" data-delay="0.1">Card content</div>
```

**CSS:**
```css
/* Base state (invisible, ready to animate in) */
.effectFade { opacity: 0; }
.effectFade.fadeUp { transform: translateY(50px); }
.effectFade.fadeRotateX {
  transform: perspective(800px) rotateX(25deg) translateY(40px);
  transform-origin: 50% 0%;
}

/* Animated state (JS adds .animated class) */
.effectFade.animated {
  opacity: 1;
  transform: none;
  transition: opacity 0.7s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
```

**JS (GSAP + data-delay stagger):**
```js
// Use data-delay for precise per-element stagger control
gsap.utils.toArray('.effectFade').forEach(el => {
  const delay = parseFloat(el.dataset.delay ?? '0');
  gsap.fromTo(el,
    { opacity: 0, y: el.classList.contains('fadeUp') ? 50 : 0,
      rotateX: el.classList.contains('fadeRotateX') ? 25 : 0,
      transformPerspective: 800, transformOrigin: '50% 0%' },
    {
      opacity: 1, y: 0, rotateX: 0,
      duration: 0.8, ease: 'power3.out', delay,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true }
    }
  );
});
```

---

### 14b. Infinite Marquee Logo Rail

Seamlessly looping logo strip with CSS animation — no JS needed.

**HTML:**
```html
<section class="logos-marquee" aria-label="Trusted by">
  <div class="marquee-track">
    <!-- Original items -->
    <ul class="marquee-list" aria-hidden="false">
      <li><img src="logo-1.svg" alt="Company A" height="32"></li>
      <li><img src="logo-2.svg" alt="Company B" height="32"></li>
      <li><img src="logo-3.svg" alt="Company C" height="32"></li>
      <li><img src="logo-4.svg" alt="Company D" height="32"></li>
      <li><img src="logo-5.svg" alt="Company E" height="32"></li>
    </ul>
    <!-- Cloned items for seamless loop (aria-hidden) -->
    <ul class="marquee-list" aria-hidden="true">
      <!-- same items, duplicated -->
    </ul>
  </div>
</section>
```

**CSS:**
```css
.logos-marquee { overflow: hidden; padding: var(--space-xl) 0; }

.marquee-track {
  display: flex;
  width: max-content;
  animation: infiniteSlide 24s linear infinite;
}

.marquee-list {
  display: flex; align-items: center; gap: 64px;
  list-style: none; padding: 0 32px;
}

.marquee-list img {
  height: 32px; width: auto;
  filter: grayscale(1) opacity(0.5);
  transition: filter 0.3s ease;
}
.marquee-list img:hover {
  filter: grayscale(0) opacity(1);
}

@keyframes infiniteSlide {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); } /* -50% because track = 2× list width */
}

/* Pause on hover for accessibility */
.logos-marquee:hover .marquee-track { animation-play-state: paused; }

@media (prefers-reduced-motion: reduce) {
  .marquee-track { animation: none; }
}
```

**JS (optional: auto-clone):**
```js
// Auto-clone the list so you only maintain one set of logos in HTML
document.querySelectorAll('.marquee-track').forEach(track => {
  const list = track.querySelector('.marquee-list');
  const clone = list.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  track.appendChild(clone);
});
```

---

### 14c. SVG Animated Paths (hub-and-spoke diagram)

Dots traveling along SVG paths connecting a center image to surrounding icons.
Pure SMIL animation — no JS or GSAP needed. Great for "how it works" or "integrations" sections.

**HTML:**
```html
<div class="tools-hub" aria-hidden="true">
  <!-- Center image -->
  <div class="hub-center">
    <img src="product-logo.svg" alt="">
  </div>

  <!-- Surrounding tool icons (positioned absolutely) -->
  <div class="tool-item tool-item--1"><img src="icon-1.svg" alt=""></div>
  <div class="tool-item tool-item--2"><img src="icon-2.svg" alt=""></div>
  <div class="tool-item tool-item--3"><img src="icon-3.svg" alt=""></div>

  <!-- SVG paths with animated dots -->
  <svg class="hub-svg" viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Path from center to tool-1 -->
    <path id="path-1" d="M300 300 C 240 240, 160 200, 100 160" stroke="color-mix(in srgb, var(--accent-primary) 30%, transparent)" stroke-width="1" fill="none"/>
    <circle r="4" fill="var(--accent-primary)">
      <animateMotion dur="3s" repeatCount="indefinite" begin="0s">
        <mpath href="#path-1"/>
      </animateMotion>
    </circle>

    <!-- Path from center to tool-2 -->
    <path id="path-2" d="M300 300 C 360 240, 440 200, 500 160" stroke="color-mix(in srgb, var(--accent-primary) 30%, transparent)" stroke-width="1" fill="none"/>
    <circle r="4" fill="var(--accent-secondary)">
      <animateMotion dur="4s" repeatCount="indefinite" begin="1s">
        <mpath href="#path-2"/>
      </animateMotion>
    </circle>
  </svg>
</div>
```

**CSS:**
```css
.tools-hub {
  position: relative; width: 600px; height: 600px;
  margin: 0 auto;
}
.hub-center {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 120px; height: 120px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: center;
}
.tool-item {
  position: absolute;
  width: 64px; height: 64px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-faint);
  display: flex; align-items: center; justify-content: center;
}
/* Position items around the hub */
.tool-item--1 { top: 8%;  left: 8%; }
.tool-item--2 { top: 8%;  right: 8%; }
.tool-item--3 { bottom: 8%; left: 50%; transform: translateX(-50%); }

.hub-svg {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}

@media (max-width: 768px) { .tools-hub { display: none; } /* hide on mobile */ }
```

---

### 14d. Scroll-to-top with Circular Progress

A back-to-top button that shows reading progress as a circular arc.
Uses a CSS custom property `--progress-angle` updated by JS.

**HTML:**
```html
<button class="scroll-top" id="goTop" aria-label="Back to top" title="Back to top">
  <svg class="scroll-top__ring" viewBox="0 0 48 48" aria-hidden="true">
    <circle class="scroll-top__track" cx="24" cy="24" r="20" fill="none" stroke-width="2"/>
    <circle class="scroll-top__progress" cx="24" cy="24" r="20" fill="none" stroke-width="2"
            style="stroke-dasharray: 125.66; stroke-dashoffset: var(--dash-offset, 125.66)"/>
  </svg>
  <span class="scroll-top__icon" aria-hidden="true">↑</span>
</button>
```

**CSS:**
```css
.scroll-top {
  position: fixed; bottom: 32px; right: 32px; z-index: 50;
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.3s ease, transform 0.2s ease;
}
.scroll-top.visible { opacity: 1; pointer-events: auto; }
.scroll-top:hover { transform: translateY(-2px); }

.scroll-top__ring {
  position: absolute; inset: 0;
  transform: rotate(-90deg); /* start progress from top */
}
.scroll-top__track { stroke: var(--border-faint); }
.scroll-top__progress {
  stroke: var(--accent-primary);
  transition: stroke-dashoffset 0.1s linear;
}
.scroll-top__icon {
  font-size: 18px; font-weight: 700;
  color: var(--text-primary); line-height: 1;
}
```

**JS:**
```js
const goTop = document.getElementById('goTop');
const progressCircle = goTop?.querySelector('.scroll-top__progress');
const circumference = 125.66; // 2π × r (r=20)

window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const total = document.body.scrollHeight - window.innerHeight;
  const progress = scrolled / total;
  const offset = circumference * (1 - progress);

  goTop?.classList.toggle('visible', scrolled > 300);
  progressCircle?.style.setProperty('--dash-offset', offset);
}, { passive: true });

goTop?.addEventListener('click', () =>
  window.scrollTo({ top: 0, behavior: 'smooth' })
);
```

---

### 14e. Split Swiper (synchronized text + image sliders)

Two separate Swiper instances that scroll together — one shows testimonial text,
the other shows the matching portrait. Classic premium agency pattern.

**HTML:**
```html
<section class="split-testimonials">
  <div class="container split-testimonials__grid">
    <!-- Left: text slides -->
    <div class="swiper testimonials-text-swiper">
      <div class="swiper-wrapper">
        <div class="swiper-slide">
          <blockquote class="split-quote">
            <p>"This is the most impactful tool we've adopted this year. Our team velocity doubled."</p>
            <footer>
              <cite class="split-quote__name">Maria Silva</cite>
              <span class="split-quote__role">CTO, Acme Corp</span>
            </footer>
          </blockquote>
        </div>
        <!-- more slides -->
      </div>
      <div class="split-testimonials__controls">
        <button class="swiper-button-prev" aria-label="Previous testimonial"></button>
        <div class="swiper-pagination"></div>
        <button class="swiper-button-next" aria-label="Next testimonial"></button>
      </div>
    </div>

    <!-- Right: image slides (synchronized) -->
    <div class="swiper testimonials-image-swiper">
      <div class="swiper-wrapper">
        <div class="swiper-slide">
          <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=480&h=560&fit=crop&crop=face"
               alt="Maria Silva" loading="lazy">
        </div>
        <!-- more slides -->
      </div>
    </div>
  </div>
</section>
```

**CSS:**
```css
.split-testimonials__grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3xl);
  align-items: center;
}
.split-quote p {
  font-size: var(--text-xl); line-height: 1.7;
  color: var(--text-secondary); font-style: italic;
  margin-bottom: var(--space-xl);
}
.split-quote::before { content: '"'; font-size: 80px; color: var(--accent-primary); line-height: 0.6; display: block; }
.split-quote__name { display: block; font-weight: 700; color: var(--text-primary); }
.split-quote__role { font-size: var(--text-sm); color: var(--text-muted); }

.testimonials-image-swiper img {
  border-radius: var(--radius-lg); width: 100%; height: 480px; object-fit: cover;
}

.split-testimonials__controls {
  display: flex; align-items: center; gap: var(--space-md); margin-top: var(--space-xl);
}

@media (max-width: 768px) {
  .split-testimonials__grid { grid-template-columns: 1fr; }
  .testimonials-image-swiper { display: none; }
}
```

**JS:**
```js
const textSwiper = new Swiper('.testimonials-text-swiper', {
  loop: true,
  navigation: {
    nextEl: '.testimonials-text-swiper .swiper-button-next',
    prevEl: '.testimonials-text-swiper .swiper-button-prev',
  },
  pagination: { el: '.testimonials-text-swiper .swiper-pagination', clickable: true },
});

const imageSwiper = new Swiper('.testimonials-image-swiper', {
  loop: true,
  allowTouchMove: false,  // image slider is controlled only by text slider
  effect: 'fade', fadeEffect: { crossFade: true },
});

// Synchronize: text controls image
textSwiper.on('slideChange', () => {
  imageSwiper.slideTo(textSwiper.realIndex);
});
```

---

### 14f. Swiper with Progress Bar Navigation

Instead of dots, show a thin animated progress bar for long testimonial or case study sliders.

**HTML:**
```html
<div class="swiper portfolio-swiper">
  <div class="swiper-wrapper">
    <!-- slides -->
  </div>
  <div class="swiper-progress-bar" aria-hidden="true">
    <div class="swiper-progress-fill"></div>
  </div>
  <div class="swiper-nav">
    <button class="swiper-button-prev" aria-label="Previous"></button>
    <button class="swiper-button-next" aria-label="Next"></button>
  </div>
</div>
```

**CSS:**
```css
.swiper-progress-bar {
  width: 100%; height: 2px;
  background: var(--border-faint); border-radius: 2px;
  margin-top: var(--space-lg); overflow: hidden;
}
.swiper-progress-fill {
  height: 100%; background: var(--accent-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

**JS:**
```js
const slider = new Swiper('.portfolio-swiper', {
  loop: false,
  navigation: {
    nextEl: '.portfolio-swiper .swiper-button-next',
    prevEl: '.portfolio-swiper .swiper-button-prev',
  },
  on: {
    init(swiper) { updateProgress(swiper); },
    slideChange(swiper) { updateProgress(swiper); },
  },
});

function updateProgress(swiper) {
  const fill = document.querySelector('.swiper-progress-fill');
  if (!fill) return;
  const pct = ((swiper.activeIndex + 1) / swiper.slides.length) * 100;
  fill.style.width = pct + '%';
}
```

---

### 14g. box-white / box-black Section Alternation

Aigocy alternates full-width section containers between dark (`box-black`) and light (`box-white`)
with decorative gradient glow images for depth. This creates the "cinematic layer cake" effect.

**HTML:**
```html
<div class="box-black">
  <img class="light-top" src="light-bg-top.png" alt="" aria-hidden="true">
  <section class="features"> ... </section>
  <img class="light-bot" src="light-bg-bot.png" alt="" aria-hidden="true">
</div>

<div class="box-white">
  <section class="how-it-works"> ... </section>
</div>
```

**CSS (generate glow with CSS instead of images):**
```css
.box-black {
  background: var(--bg-base);
  position: relative; overflow: hidden;
}
.box-white {
  background: var(--bg-surface);
  position: relative; overflow: hidden;
}

/* Decorative ambient glow (replaces light-top/light-bot PNG images) */
.box-black::before {
  content: '';
  position: absolute; top: -200px; left: 50%;
  transform: translateX(-50%);
  width: 800px; height: 400px;
  background: radial-gradient(ellipse at center,
    color-mix(in srgb, var(--accent-primary) 15%, transparent) 0%,
    transparent 70%
  );
  pointer-events: none; z-index: 0;
}
.box-black::after {
  content: '';
  position: absolute; bottom: -200px; left: 50%;
  transform: translateX(-50%);
  width: 800px; height: 400px;
  background: radial-gradient(ellipse at center,
    color-mix(in srgb, var(--accent-primary) 10%, transparent) 0%,
    transparent 70%
  );
  pointer-events: none; z-index: 0;
}

/* Ensure section content is above glow */
.box-black > section, .box-white > section { position: relative; z-index: 1; }
```

---

### 14h. Accordion FAQ (Bootstrap collapse pattern)

Clean accordion FAQ that works without JS library if you use the native `<details>` element,
or with Bootstrap's collapse for richer animations.

**HTML (native, no-library version):**
```html
<section class="faq" id="faq" aria-labelledby="faq-title">
  <div class="container">
    <div class="section-header">
      <span class="section-label">FAQ</span>
      <h2 class="section-title" id="faq-title">Common questions</h2>
    </div>
    <div class="faq__list">
      <details class="faq__item">
        <summary class="faq__question">
          How long does setup take?
          <span class="faq__icon" aria-hidden="true">+</span>
        </summary>
        <div class="faq__answer">
          <p>Setup takes under 5 minutes. Connect your account, configure your first workflow, and you're live.</p>
        </div>
      </details>
      <!-- repeat -->
    </div>
  </div>
</section>
```

**CSS:**
```css
.faq__list { max-width: 800px; margin: 0 auto; }

.faq__item {
  border-bottom: 1px solid var(--border-faint);
  padding: var(--space-lg) 0;
}
.faq__item:first-child { border-top: 1px solid var(--border-faint); }

.faq__question {
  display: flex; justify-content: space-between; align-items: center;
  font-size: var(--text-lg); font-weight: 600;
  color: var(--text-primary); cursor: pointer;
  list-style: none; /* hide default marker */
}
.faq__question::-webkit-details-marker { display: none; }

.faq__icon {
  font-size: var(--text-xl); font-weight: 300;
  color: var(--accent-primary);
  transition: transform var(--duration-base) var(--ease-out);
  flex-shrink: 0; margin-left: var(--space-lg);
}
details[open] .faq__icon { transform: rotate(45deg); }

.faq__answer {
  padding-top: var(--space-md);
}
.faq__answer p {
  font-size: var(--text-base); color: var(--text-secondary); line-height: 1.7;
}
```

---

### 14i. Footer with Watermark Background Logo

Premium footer pattern: brand name as a large faded watermark behind footer content,
with dense 3-column layout (links / copyright / social).

**HTML:**
```html
<footer class="footer" role="contentinfo">
  <div class="footer__watermark" aria-hidden="true">ProductName</div>
  <div class="container footer__body">
    <div class="footer__col footer__col--links">
      <strong>Product</strong>
      <a href="#">Features</a>
      <a href="#">Pricing</a>
      <a href="#">Docs</a>
    </div>
    <div class="footer__col footer__col--center">
      <a href="/" class="footer__logo" aria-label="Home">
        <img src="logo.svg" alt="ProductName" height="32">
      </a>
      <p class="footer__copy">© 2026 ProductName, Inc. All rights reserved.</p>
    </div>
    <div class="footer__col footer__col--social">
      <strong>Follow us</strong>
      <div class="footer__social">
        <a href="#" aria-label="Twitter" class="social-link">
          <svg width="20" height="20" aria-hidden="true"><!-- twitter icon --></svg>
          Twitter
        </a>
        <a href="#" aria-label="LinkedIn" class="social-link">
          <svg width="20" height="20" aria-hidden="true"><!-- linkedin icon --></svg>
          LinkedIn
        </a>
      </div>
    </div>
  </div>
</footer>
```

**CSS:**
```css
.footer {
  position: relative; overflow: hidden;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-faint);
  padding: var(--space-3xl) 0 var(--space-xl);
}

/* Faded watermark behind content */
.footer__watermark {
  position: absolute; bottom: -20px; left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-display); font-size: clamp(80px, 15vw, 160px);
  font-weight: 900; line-height: 1;
  color: var(--text-primary); opacity: 0.04;
  white-space: nowrap; pointer-events: none; user-select: none;
}

.footer__body {
  display: grid; grid-template-columns: 1fr auto 1fr;
  gap: var(--space-xl); align-items: start;
  position: relative; z-index: 1;
}
.footer__col { display: flex; flex-direction: column; gap: var(--space-sm); }
.footer__col--center { text-align: center; align-items: center; }
.footer__col--social { align-items: flex-end; }

.footer__col strong {
  font-size: var(--text-sm); font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-primary); margin-bottom: var(--space-xs);
}
.footer__col a {
  font-size: var(--text-sm); color: var(--text-muted);
  transition: color var(--duration-fast) ease;
}
.footer__col a:hover { color: var(--text-primary); }

.social-link {
  display: flex; align-items: center; gap: var(--space-sm);
}

.footer__copy {
  font-size: var(--text-sm); color: var(--text-muted); margin-top: var(--space-md);
}

@media (max-width: 768px) {
  .footer__body { grid-template-columns: 1fr; text-align: center; }
  .footer__col--social { align-items: center; }
  .footer__watermark { display: none; }
}
```

---

### 14j. Canvas Cursor Trail (optional, cinematic touch)

A subtle canvas trail that follows the cursor — drawn as fading dots.
Only activate for Bold & Cinematic direction, and skip on touch devices.

```js
// Add <canvas id="cursorTrail" style="position:fixed;inset:0;pointer-events:none;z-index:9999"></canvas>
// to <body> to use this.

(function initCursorTrail() {
  if (window.matchMedia('(hover: none)').matches) return; // skip on touch
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('cursorTrail');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  const dots = [];
  const MAX_DOTS = 20;
  const COLOR = getComputedStyle(canvas).getPropertyValue('--accent-primary').trim();

  window.addEventListener('mousemove', (e) => {
    dots.push({ x: e.clientX, y: e.clientY, alpha: 1 });
    if (dots.length > MAX_DOTS) dots.shift();
  }, { passive: true });

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dots.forEach((dot, i) => {
      const size = (i / dots.length) * 8 + 2;
      dot.alpha = (i / dots.length) * 0.6;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
      ctx.fillStyle = COLOR;
      ctx.globalAlpha = dot.alpha;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
})();
```
