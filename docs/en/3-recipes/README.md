# Recipes — ready-to-copy guides

Each recipe is an end-to-end guide with simulated dialogues, runnable examples, and troubleshooting. Choose by your scenario:

## Canonical trails (recommended starting point)

These three trails show **how features reach development** in AIOSON. You almost always fall into one of them.

| Trail | When to use | Key agents |
|---|---|---|
| **[Full feature with optional @sheldon](./full-feature-with-sheldon.md)** | The canonical tracked feature trail at proportional depth | `@product → optional @sheldon → @planner → @dev → @qa` |
| [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md) | Your idea is still vague, several loose notes | optional `@briefing → @briefing-refiner` → `@product` |
| [External plans for @product (PT)](../../pt/3-receitas/plans-externos-para-product.md) *(EN coming soon)* | You already planned in another chat (ChatGPT, Claude.io Web) | @product (reads `/plans/`) |

## Recipes by scenario

| Recipe | Scenario | Main agents |
|---|---|---|
| [Landing page (PT)](../../pt/3-receitas/landing-page.md) *(EN coming soon)* | Create a presentation page with copy and design | @product, @copywriter, @ux-ui, @dev, @qa |
| [SaaS app from scratch (PT)](../../pt/3-receitas/app-saas-do-zero.md) *(EN coming soon)* | Full SaaS: auth, Stripe billing, admin | `@product → optional @sheldon → @planner → @dev → @qa`; opt into specialists for named risks |
| [Integration in large codebase (PT)](../../pt/3-receitas/integracao-em-codebase-grande.md) *(EN coming soon)* | Install AIOSON on a 10k–100k line legacy project | @discover; @analyst only for a named question |
| [Large refactor (PT)](../../pt/3-receitas/refatoracao-grande.md) *(EN coming soon)* | Rewrite a critical module without breaking anything | `@product → optional @sheldon → @planner → @dev → @qa`; Tester only when explicitly enabled |
| [Security audit (PT)](../../pt/3-receitas/auditoria-seguranca.md) *(EN coming soon)* | Review vulnerabilities before production | explicit @pentester |
| [Publish on aioson.com (PT)](../../pt/3-receitas/publicar-no-aioson-com.md) *(EN coming soon)* | Distribute a squad, skill, or genome | system:package, system:publish |
| [Clone site design (PT)](../../pt/3-receitas/clonar-design-de-site.md) *(EN coming soon)* | Extract a site's visual or combine two styles | @site-forge, @design-hybrid-forge |
| [Continuity between sessions](./continuity-between-sessions.md) | Resume a feature after the session ended | @deyvin, dossier, dev-state |

Back to the main portal: [docs/en/README.md](../README.md)
