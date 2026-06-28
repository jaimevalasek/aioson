# Recipes — ready-to-copy guides

Each recipe is an end-to-end guide with simulated dialogues, runnable examples, and troubleshooting. Choose by your scenario:

## Canonical trails (recommended starting point)

These three trails show **how features reach development** in AIOSON. You almost always fall into one of them.

| Trail | When to use | Key agents |
|---|---|---|
| **[Full feature with @sheldon](./full-feature-with-sheldon.md)** | SMALL lean (default) or MEDIUM maestro — the canonical feature trail | SMALL: `@product → @sheldon → @dev → @qa`; MEDIUM: `@product → @orchestrator → @dev → @pentester → @qa` |
| [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md) | Your idea is still vague, several loose notes | @briefing → @product |
| [External plans for @product](./external-plans-for-product.md) *(coming soon)* | You already planned in another chat (ChatGPT, Claude.io Web) | @product (reads `/plans/`) |

## Recipes by scenario

| Recipe | Scenario | Main agents |
|---|---|---|
| [Landing page](./landing-page.md) *(coming soon)* | Create a presentation page with copy and design | @product, @copywriter, @ux-ui, @dev, @qa |
| [SaaS app from scratch](./saas-app-from-scratch.md) *(coming soon)* | Full SaaS: auth, Stripe billing, admin | `@product → @orchestrator → @dev → @pentester → @qa` (MEDIUM maestro) |
| [Integration in large codebase](./integration-in-large-codebase.md) *(coming soon)* | Install AIOSON on a 10k–100k line legacy project | @discover, @analyst |
| [Large refactor](./large-refactor.md) *(coming soon)* | Rewrite a critical module without breaking anything | @sheldon, @tester, @dev, @qa |
| [Security audit](./security-audit.md) *(coming soon)* | Review vulnerabilities before production | @pentester |
| [Publish on aioson.com](./publish-on-aioson-com.md) *(coming soon)* | Distribute a squad, skill, or genome | system:package, system:publish |
| [Clone site design](./clone-site-design.md) *(coming soon)* | Extract a site's visual or combine two styles | @site-forge, @design-hybrid-forge |
| [Continuity between sessions](./continuity-between-sessions.md) | Resume a feature after the session ended | @deyvin, dossier, dev-state |

Back to the main portal: [docs/en/README.md](../README.md)
