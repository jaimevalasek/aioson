# Checklists — Section Map & Pre-delivery

> Load when planning which sections to include or doing final QA before delivery.

---

## 12. Full Section Checklist (AI / SaaS Landing Page)

Use this as a content inventory, not a required order or section quota. Choose the sequence from the visitor's questions and real evidence, following `structure.md` and the approved visual direction. A small page may need only an opening, evidence and contact; omit unsupported sections and claims.

| # | Section | Purpose |
|---|---|---|
| 1 | Header | Identity and useful navigation; sticky only when it helps |
| 2 | Opening | Proposition, focal evidence and the actions the task requires |
| 3 | Logos bar | "Trusted by" brand names |
| 4 | Capabilities | Demonstration, comparison, list or cards according to the evidence |
| 5 | How it works | The real sequence; illustrate only meaningful steps |
| 6 | Services | Cards with deeper service descriptions |
| 7 | Stats / Numbers | Verifiable figures with context; animation optional |
| 8 | Case studies | Portfolio cards with hover image reveal |
| 9 | Testimonials | Real attributed quotes; slider only if browsing benefits |
| 10 | Pricing | Actual plans and comparison criteria; no fabricated popularity |
| 11 | FAQ | Accordion with open/close animation |
| 12 | Closing action | A useful next step, with urgency only when factual |
| 13 | Footer | Dense: links + social + newsletter + copyright |

Do not add testimonials, pricing or a closing CTA solely to complete this table. Techniques such as sliders and animated counters are optional implementations, not quality criteria.

---

## 13. Pre-delivery Checklist

- [ ] Mobile menu opens/closes, body scroll locked when open
- [ ] Sliders have correct breakpoints and accessible buttons
- [ ] GSAP scroll animations work on mobile (use `start: 'top 85%'` for shorter viewports)
- [ ] Hero image loads eagerly with `fetchpriority="high"`, all others `loading="lazy"`
- [ ] No layout shift (CLS): img/video elements have explicit width+height
- [ ] `prefers-reduced-motion: reduce` disables all animations
- [ ] All interactive elements reachable by keyboard
- [ ] Color contrast ≥ 4.5:1 checked
- [ ] `<title>` and `<meta description>` are real content (not placeholders)
- [ ] Open Graph meta tags present (`og:title`, `og:description`, `og:image`)
- [ ] No placeholder text remains anywhere in the HTML
