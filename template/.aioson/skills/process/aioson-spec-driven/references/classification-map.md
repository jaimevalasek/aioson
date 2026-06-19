# Classification Map — Phase Depth by Project Size

> Use this when deciding which phases to run and how deep to go.

## Depth table

| Phase | MICRO (0–1) | SMALL (2–3) | MEDIUM (4–6) |
|-------|-------------|-------------|--------------|
| Specify (PRD) | 1 conversation, lite template | Full PRD conversation | Full PRD + `## Specify depth` section |
| Research (@sheldon) | Skip unless links/external sources provided | Recommended — run before @analyst | Required — run Modo C (full validation) |
| Requirements (@analyst) | Skip — go @product → @dev | Required — `requirements-{slug}.md` | Required — with requirement IDs + ACs |
| Design (@architect) | Skip unless auth or external integration | Selective — only if new architecture pattern | Required — full `architecture.md` |
| Plan (implementation-plan) | Optional — suggest only if @dev asks | Recommended | Required — with gate approval + verification criteria |
| Execute (@dev) | Direct from PRD | From requirements + spec | From approved plan only |
| State (@dev, @deyvin) | Minimal `spec.md` note | `spec-{slug}.md` with phase_gates | Full spec pack — phase_gates + checkpoints + maintenance notes |

## Scoring (from @analyst)

| Dimension | Score |
|-----------|-------|
| User types: 1 | 0 |
| User types: 2 | 1 |
| User types: 3+ | 2 |
| External integrations: 0 | 0 |
| External integrations: 1–2 | 1 |
| External integrations: 3+ | 2 |
| Business rule complexity: none | 0 |
| Business rule complexity: some | 1 |
| Business rule complexity: complex | 2 |

**0–1 = MICRO / 2–3 = SMALL / 4–6 = MEDIUM**

## Sensitive-surface floor

Independent of the 0–6 score, a feature touching any sensitive surface — money/payments, auth, ownership/authz boundaries, uploads, external URLs/webhooks, secrets/credentials, or sensitive storage — has a **floor of SMALL** (never MICRO). `aioson classify` applies this deterministically and reports `floored: true` + `sensitive_surfaces`. The floor only raises the tier; an explicit `sensitive_surfaces: [..]` in the PRD frontmatter forces it when content detection misses.

## Gate behavior by classification

- **MICRO**: gates are informational, never blocking. @dev may proceed without explicit approval.
- **SMALL**: Gate A (requirements) is recommended before design. Gate B is optional.
- **MEDIUM**: Gates A, B, C are required. Do not proceed to next phase without explicit user confirmation.
