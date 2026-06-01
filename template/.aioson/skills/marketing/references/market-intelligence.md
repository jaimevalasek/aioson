---
name: market-intelligence-reference
description: Competitive intelligence tools and techniques — ad espionage, technology scraping, creative monitoring. Loaded by @copywriter during research phases or when user requests competitive analysis.
---

# Market Intelligence — Tools, Techniques & Workflows

## Philosophy

> "Nothing is created, everything is modeled."

Modeling ≠ plagiarism. Modeling means: take a successful structure, hook, or psychological angle and adapt it to a new expert, product, or niche. Plagiarism means copy-pasting — which fails because it lacks the unique "temperament" of the expert and creates legal risk.

**The 80/20 of market research:** understand what's working NOW so you don't waste money testing what others have already proven fails.

---

## Tier 1 — Ad espionage (what competitors are running right now)

### Facebook/Meta Ads Library
**URL:** `facebook.com/ads/library`
**What to do:**
1. Search by keyword related to the niche (e.g., "emagrecer," "marketing digital," "investimento")
2. Filter by country (Brazil, US, etc.)
3. Look for ads that have been running for 30+ days — longevity = profitability
4. Capture: headline, hook, CTA, visual style, landing page URL
5. Note which ads have multiple localized or angled variations — this means they're testing and scaling

**What to extract:**
- The hook (first 3 seconds / first line)
- The promise structure
- The emotional angle (fear, aspiration, curiosity, anger)
- What they're NOT saying (gap = your differentiator)

### Google Ads Transparency Center
**URL:** `adstransparency.google.com`
**What to do:**
1. Search competitor brand names or product names
2. Find their YouTube ads and search ads
3. Track view counts over time — if views jump from 50k to 200k in days, it's a winner being scaled
4. Capture the ad URL and landing page

### DeepTube
**What it does:** Searches YouTube video transcripts for specific keywords — finds ads that mention certain topics
**Use case:** Find which experts/brands are advertising about your niche on YouTube
**How to use:** Search for keywords from your PMS research (problems, solutions, product names)

### Affbank.com
**What it does:** Free native ads espionage across global networks
**Use case:** See which offers are scaling on native ad platforms (Taboola, Outbrain)
**What to look for:** Advertorial-style pages, health/finance offers, long-running ads

---

## Tier 2 — Landing page intelligence (what competitors are selling)

### SimilarWeb
**What it does:** Estimates monthly traffic volume and traffic sources for any domain
**Use case:** Validate if a competitor's page actually gets traffic (high traffic + long-running ads = confirmed winner)
**What to extract:**
- Total monthly visits
- Traffic sources (paid %, organic %, direct %, social %)
- Top referring pages
- Geographic distribution

### SemRush
**What it does:** Detailed SEO and paid traffic analysis
**Use case:** Find which keywords competitors rank for, which pages get the most traffic, and where their checkout sends leads
**What to extract:**
- Top organic keywords
- Paid keyword estimates
- Backlink profile
- Landing page ranking positions

### BuiltWith
**What it does:** Identifies which technologies a website uses
**Use case:** Find which platforms successful pages use (VTurb for video hosting, Hotmart for checkout, ClickMagic for tracking) — this tells you the sophistication of the operation
**What to look for:**
- Video hosting (VTurb, Wistia, Vimeo Pro = VSL operation)
- Tracking (ClickMagic, Voluum, RedTrack = serious paid media)
- Checkout (Hotmart, Kiwify, Stripe = infoproduct)
- Analytics (Hyros, Triple Whale = e-commerce/DTC)

### ViewDNS.info
**What it does:** Reverse IP/DNS lookup
**Use case:** Find other domains hosted on the same server — often reveals hidden pages, test pages, or other products from the same operation
**How:** Enter competitor's domain → Reverse IP → See all domains on that IP

---

## Tier 3 — Creative intelligence (what hooks are winning)

### CB Snooper
**What it does:** Monitors best-selling offers on ClickBank
**Use case:** Identify which niches and offers are scaling right now
**What to extract:** Offer name, gravity score (higher = more affiliates selling it), sales page URL, VSL structure

### Google Hacking (advanced search operators)
**Techniques:**
```
"competitor CNPJ" site:competitor.com         → Find legal info, disclaimers
"disclaimer" site:competitor.com               → Find hidden sales pages
"termos de uso" site:competitor.com            → Find checkout and legal pages
site:competitor.com inurl:checkout              → Find checkout flows
site:competitor.com filetype:pdf               → Find downloadable materials
```

### Transcription Search (YouTube)
**Method:** Use DeepTube or manually search YouTube with `"exact phrase" + niche keyword`
**What to find:** Ads that are using specific hooks, mechanisms, or proof points
**Example:** Search `"metabolic reset" weight loss` to find who's using that specific mechanism angle

---

## Tier 4 — Trend and audience intelligence

### Google Trends
**URL:** `trends.google.com`
**What to do:**
1. Search your primary keyword
2. Check if interest is rising, stable, or declining
3. Compare related terms to find the "wave" to surf
4. Check seasonal patterns (weight loss peaks in January, etc.)

**Use case:** If a specific ingredient, method, or topic is trending UP, build your One Belief around it.
**Example:** "Ozempic" searches exploded in 2023-2024 — weight loss pages that referenced Ozempic alternatives saw higher CTR.

### Amazon Best Sellers + Reviews
**URL:** `amazon.com/best-sellers-books`
**What to do:**
1. Find the top 5 books in your niche
2. Read 1-star reviews (= problems, objections, unmet expectations)
3. Read 5-star reviews (= dreams fulfilled, transformation language, emotional outcomes)
4. Note the book titles — best-selling titles are essentially tested headlines

### Walmart.com Best Sellers
**Use case:** For health/supplement niches — identify which ingredients the market already trusts
**What to do:** Search best-selling supplements → identify common ingredients → build your mechanism around ingredients people already believe in

---

## Swipe file resources (reference libraries)

### Copy archives
- **Swiped.co** — Largest repository of sales letters and ads (classic and modern)
- **Swiper.com.br** — Portuguese translations and organized references of successful copy
- **Swipfile.com** — Ad archive searchable by category
- **Hard to Find Ads** — Rare and vintage ad collections

### Knowledge resources
- **Briankurtz.net** — Blog archive on direct response marketing since 2014
- **Overdeliverbook.com** — Swipe files from Dan Kennedy, Dick Benson, Gordon Grossman
- **Hooks Bible** — 1000+ validated organic hooks (usually shared by specialists like Amanda Khayat)

---

## Intelligence workflow for @copywriter

When research is needed, follow this sequence:

```
Step 1: Check cache
└─ Does `researchs/{slug}/` have recent intelligence? → Use it

Step 2: PMS Research (audience-first)
├─ Amazon reviews (top 5 niche books)
├─ Reddit (2-3 relevant subreddits)
└─ Google autocomplete (problem + solution queries)

Step 3: Competitive scan (market-first)
├─ Facebook Ads Library (3-5 top competitors)
├─ SimilarWeb (validate traffic volume)
└─ Capture: hooks, promises, CTAs, gaps

Step 4: Trend validation
├─ Google Trends (is the angle rising?)
└─ TikTok/YouTube Shorts (viral content angles)

Step 5: Save
└─ Save to `researchs/{slug}/market-intel-{date}.md`
```

**Time budget:** 2-3 searches max for @copywriter. If deeper intelligence is needed, hand off to @orache for comprehensive domain research.

---

## Modeling checklist

When adapting a competitor's approach:

- [ ] **Structure:** Borrowed the format (5 acts, section order, page flow) → OK
- [ ] **Hook angle:** Adapted the psychological angle (curiosity, fear, aspiration) → OK
- [ ] **Exact words:** Copied specific sentences or paragraphs → NOT OK (plagiarism)
- [ ] **Mechanism name:** Used the same branded term → NOT OK (trademark risk)
- [ ] **Visual style:** Replicated the exact design → borderline (adapt, don't clone)
- [ ] **Proof points:** Used their statistics as your own → NOT OK (must have your own data)

**The test:** If you put your modeled page next to the original, would a reader say "this is a copy" or "this is in the same category"? If the former, you went too far.
