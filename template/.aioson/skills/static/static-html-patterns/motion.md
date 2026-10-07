# Motion — GSAP Animations & Swiper Sliders

> Load when implementing scroll animations, entrance effects, hero timelines,
> counter animations, or any carousel/slider component.

Use only techniques earned by the `interface-design` direction. The approved prototype and identity govern the result; these timing examples do not prescribe a hero structure, content sequence or aesthetic. Static content must remain useful when scripts fail or reduced motion is requested.

---

## 9. GSAP Animations — Production Patterns (AI Agency / SaaS style)

Source: Aigocy / GSAP ScrollTrigger — gsap.com/docs/v3/Plugins/ScrollTrigger

### Setup

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js" defer></script>
```

```js
// Register plugin once
gsap.registerPlugin(ScrollTrigger);
```

### Reusable animation helpers (add to main.js)

```js
// 1. Reveal elements on scroll (fade + translateY)
function revealOnScroll(selector, options = {}) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  gsap.fromTo(els,
    { opacity: 0, y: options.y ?? 40 },
    {
      opacity: 1, y: 0,
      duration: options.duration ?? 0.7,
      ease: 'power3.out',
      stagger: options.stagger ?? 0.1,
      scrollTrigger: {
        trigger: els[0].closest('section') ?? els[0],
        start: 'top 80%',
        once: true,
      }
    }
  );
}

// 2. Hero intro sequence (run on load, not scroll)
function heroIntroTimeline() {
  return gsap.timeline({ delay: 0.2 })
    .from('.hero__title',    { opacity: 0, y: 30, duration: 0.7, ease: 'power3.out' })
    .from('.hero__subtitle', { opacity: 0, y: 20, duration: 0.6, ease: 'power2.out' }, '-=0.4')
    .from('.hero__actions',  { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' }, '-=0.3')
    .from('.hero__social-proof', { opacity: 0, duration: 0.4 }, '-=0.2');
}

// 3. Card grid stagger (features, services, team)
function cardsStaggerIn(sectionSelector) {
  const section = document.querySelector(sectionSelector);
  if (!section) return;
  gsap.fromTo(section.querySelectorAll('.card, .feature-card, .service-card'),
    { opacity: 0, y: 50, scale: 0.97 },
    {
      opacity: 1, y: 0, scale: 1,
      duration: 0.6, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: section, start: 'top 75%', once: true }
    }
  );
}

// 4. Light parallax on hero background
function parallaxLight(selector) {
  gsap.to(selector, {
    yPercent: 30,
    ease: 'none',
    scrollTrigger: { trigger: selector, start: 'top top', end: 'bottom top', scrub: true }
  });
}

// 5. Counter animation (stats section)
function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(el => {
    const target = +el.dataset.counter;
    ScrollTrigger.create({
      trigger: el, start: 'top 85%', once: true,
      onEnter: () => {
        gsap.fromTo(el,
          { textContent: 0 },
          {
            textContent: target, duration: 1.5, ease: 'power2.out',
            snap: { textContent: 1 },
            onUpdate() { el.textContent = Math.round(+el.textContent).toLocaleString(); }
          }
        );
      }
    });
  });
}

// 6. Animated gradient border on hover (section highlight)
function initGlowCards() {
  document.querySelectorAll('.card--glow-border').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      card.style.setProperty('--mouse-x', `${x}%`);
      card.style.setProperty('--mouse-y', `${y}%`);
    });
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  heroIntroTimeline();
  revealOnScroll('.section-header', { y: 30 });
  revealOnScroll('.step', { stagger: 0.15 });
  revealOnScroll('.testimonial-card', { stagger: 0.1 });
  revealOnScroll('.cta-final__title', { y: 20 });
  cardsStaggerIn('.features');
  cardsStaggerIn('.services');
  parallaxLight('.hero__bg img');
  animateCounters();
  initGlowCards();
});
```

### Anti-patterns to avoid
- Do NOT put all scroll animations in one giant master timeline
- Do NOT animate `width`, `height`, or `padding` — only `transform` and `opacity`
- Do NOT run heavy GSAP work in `scroll` event — always use ScrollTrigger
- Always `once: true` for entrance animations (don't re-trigger on scroll up)
- Disable GSAP on `prefers-reduced-motion`:

```js
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.globalTimeline.timeScale(0); // or skip init entirely
}
```

---

## 10. Swiper Sliders — Production Patterns

Source: swiperjs.com/swiper-api

### CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">
<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js" defer></script>
```

### HTML Structure

```html
<div class="swiper testimonials-swiper" data-swiper-options='{"slidesPerView":1,"spaceBetween":24}'>
  <div class="swiper-wrapper">
    <div class="swiper-slide"><!-- content --></div>
    <div class="swiper-slide"><!-- content --></div>
  </div>
  <div class="swiper-pagination" aria-hidden="true"></div>
  <button class="swiper-button-prev" aria-label="Previous slide"></button>
  <button class="swiper-button-next" aria-label="Next slide"></button>
</div>
```

### Universal Init (handles multiple sliders via data-attribute)

```js
document.querySelectorAll('.swiper').forEach(el => {
  const options = el.dataset.swiperOptions ? JSON.parse(el.dataset.swiperOptions) : {};
  new Swiper(el, {
    loop: true,
    navigation: { nextEl: el.querySelector('.swiper-button-next'), prevEl: el.querySelector('.swiper-button-prev') },
    pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
    a11y: { prevSlideMessage: 'Previous slide', nextSlideMessage: 'Next slide' },
    breakpoints: {
      768:  { slidesPerView: 2, spaceBetween: 24 },
      1024: { slidesPerView: 3, spaceBetween: 32 },
    },
    ...options, // data-attribute options override defaults
  });
});
```

### CSS: fix slider CLS (layout shift)

```css
.swiper { overflow: hidden; }
.swiper-wrapper { display: flex; align-items: stretch; }
.swiper-slide { height: auto; } /* equal height cards */
```
