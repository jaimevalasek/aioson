# Structure — HTML Production Shell

> Load when building a static landing page. Resolve art direction through `interface-design` first; this reference governs semantic structure and content order.

## Choose the opening from the brief

Decide what the visitor needs to understand, inspect or do first. Set the opening's composition from that decision and the real assets:

| Evidence or task | Compositions to consider | Check before choosing |
|---|---|---|
| A physical object, place or body of work | Image-led opening, framed plate, asymmetric text/media | Crop, focal point, credits and mobile treatment |
| A product the visitor must evaluate | Product demonstration, annotated interface, comparison | Real readable evidence instead of decorative dashboard shapes |
| A service or editorial argument | Typographic opening, editorial columns, concise introduction | Specific copy, reading order and an appropriate line length |
| Exploration or selection | Collection index, navigable grid, list with a featured item | Information scent and a clear next action |

These are options, not category-to-template mappings. Compare the composition against recent work: changing hue and font while keeping the same centered headline, floating cards and gradient field does not create a new direction.

Use a full viewport only when the subject and sequence earn that space. A compact opening may expose useful content sooner. Choose alignment and action count from the task; do not manufacture a secondary CTA, label, logo rail or proof strip.

## Build a content outline before the shell

List the visitor's questions and put the available answers in reading order. Include a section only when it provides evidence or enables a decision. Pricing, testimonials, FAQs and closing CTAs are conditional. Do not invent customer counts, ratings, quotations, logos or product claims to fill a template.

Preserve the approved prototype's content, layout and interactions in conformance mode. In origination mode, record the selected composition and the reason it serves this product in the manifest's `## Visual direction`.

## Minimal semantic shell

The comments below are authoring instructions. Replace them with real content before delivery; they do not prescribe the page's visual arrangement.

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><!-- Real product name and page purpose --></title>
  <meta name="description" content="<!-- Accurate page description -->">
  <!-- Deliver the chosen fonts; preload only critical resources actually used. -->
  <link rel="stylesheet" href="styles.css">
  <script src="main.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <!-- Real identity and navigation, only for destinations that exist. -->
    <nav aria-label="Main navigation"></nav>
  </header>
  <main id="main">
    <section aria-labelledby="page-title">
      <h1 id="page-title"><!-- Specific proposition or page purpose --></h1>
      <!-- Real evidence, context and the actions this opening needs. -->
    </section>
    <!-- Further sections follow the content outline, each with a heading. -->
  </main>
  <footer><!-- Real contact, legal and secondary navigation as applicable. --></footer>
</body>
</html>
```

Keep visible focus and useful link text. Give the main informative image a descriptive alt; decorative images use empty alt. Reserve intrinsic image dimensions and load the main visible image eagerly, with later images lazy-loaded. A collapsed menu needs keyboard behavior, an accessible name and synchronized `aria-expanded`.

## Responsive composition

Recompose the reading order and media crop for narrow screens. Use content-driven breakpoints; preserve hierarchy, action reachability and meaningful evidence rather than scaling the desktop canvas down. Inspect desktop, mobile, long text and zoom. A horizontal collection needs accessible controls or a readable wrapping/list alternative.

Animation is an optional layer. Content must remain visible and usable when scripts fail or reduced motion is requested. Load `motion.md` or `premium.md` only for a technique justified by the selected direction.
