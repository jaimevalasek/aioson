# Classification Map — Phase Depth by Project Size

> Use this when deciding which phases to run and how deep to go.

## Lane zero — check before feature scoring

Do not create a feature merely because implementation changes product code. First classify the minimum outcome the user actually confirmed, before enriching it with optional behavior.

Use `@dev` Simple Plan when the request has one specified observable outcome, reuses an existing pattern/boundary, has no open product/architecture/security decision, and is estimated at no more than 5 behavior-bearing files, 8 total paths, and 2 existing modules. A menu item, button, link, field, or window affordance is not automatically a feature. Mirror tests, translations, exports/indexes, registrations/manifests, generated metadata, and lockfiles count toward total paths but do not independently promote the lane.

Only score MICRO/SMALL/MEDIUM after Simple Plan has been ruled out for a concrete reason. Record that reason; the global project classification is not one.

## Depth table

| Phase | MICRO (0–1) | SMALL (2–3) | MEDIUM (4–6) |
|-------|-------------|-------------|--------------|
| Specify (PRD) | 1 conversation, lite template | Full PRD conversation | Full PRD + `## Specify depth` section |
| Research (@sheldon) | Skip unless links/external sources provided | Required — `@sheldon` is the single spec authority (lean default) | Required — folded into the `@orchestrator` maestro fan-out (consolidated, not a separate `@sheldon` hop) |
| Requirements (@analyst) | Skip — go @product → @dev | From `@sheldon` in the lean default; `@analyst` only on the full-chain detour | Required — produced via the `@orchestrator` maestro fan-out (`@analyst` sub-agent), with requirement IDs + ACs |
| Design (@architect) | Skip unless auth or external integration | From `@sheldon` in the lean default; `@architect` only on the full-chain detour | Required — produced via the `@orchestrator` maestro fan-out (`@architect` sub-agent), design-doc + `architecture.md` |
| Plan (implementation-plan) | Optional — suggest only if @dev asks | Recommended | Required — produced via the `@orchestrator` maestro fan-out (`@pm` sub-agent), with gate approval + verification criteria |
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

The score calibrates genuine feature depth; it is not permission to expand the request. For feature work, use these scope review budgets alongside the score:

| Lane | Default scope review budget | Additional reason required |
|---|---|---|
| Simple Plan | 1 outcome; <=5 behavior files; <=8 total paths; <=2 existing modules | none of the open decisions above |
| MICRO | 1 coherent outcome; <=10 behavior files; <=15 total paths | needs feature memory, traceability, or one small product decision |
| SMALL | more than the MICRO budget only when causally necessary | multiple independently valuable capabilities, a new boundary/contract, or material unresolved decisions |

File counts are review guardrails, not an automatic promotion formula. If an estimate crosses a budget, compare before/after scope, identify the causal reason, and obtain approval before broadening. Support paths and optional behavior proposed by the agent never justify promotion by themselves.

## Sensitive-surface floor

Independent of the 0–6 score, a feature touching any sensitive surface — money/payments, auth, ownership/authz boundaries, uploads, external URLs/webhooks, secrets/credentials, or sensitive storage — has a **floor of SMALL** (never MICRO). `aioson classify` applies this deterministically and reports `floored: true` + `sensitive_surfaces`. The floor only raises the tier; an explicit `sensitive_surfaces: [..]` in the PRD frontmatter forces it when content detection misses.

## Gate behavior by classification

- **MICRO**: gates are informational, never blocking. @dev may proceed without explicit approval.
- **SMALL**: Gate A (requirements) is recommended before design. Gate B is optional.
- **MEDIUM**: Gates A, B, C are required. Do not proceed to next phase without explicit user confirmation.
