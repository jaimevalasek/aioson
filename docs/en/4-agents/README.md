# Agent cards — AIOSON (EN)

This layer will hold one card per AIOSON agent (31 total), translated from [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md).

Cards are being translated progressively. Until a card is available here, the PT version is the canonical reference — it follows the same format and covers the same agents.

---

## Canonical feature route

```text
optional @briefing → optional @briefing-refiner → @product
→ optional @sheldon → @planner → @dev → @qa
```

MICRO, SMALL, and MEDIUM change depth, risk coverage, and work budget—not the stage chain. Product owns one PRD, Planner owns one implementation plan, and QA owns one final verdict. `@sheldon` may enrich the PRD in place. Agents such as `@analyst`, `@architect`, `@pm`, `@ux-ui`, `@scope-check`, and `@discovery-design-doc` are explicitly requested consultants whose evidence may enrich canonical artifacts without becoming gates.

Autopilot defaults to the DEV → QA handoff and can cover the full canonical chain when configured. Tester, Pentester, and Validator are disabled by default and never activate because of classification alone. `feature:close`/publish remains a human gate. See [Autopilot handoff](../5-reference/autopilot-handoff.md).

---

## The 31 agents (plus @pair alias)

### Workflow core

| Agent | Role |
|---|---|
| `@setup` | Project onboarding — detect stack, classify MICRO/SMALL/MEDIUM, write `project.context.md` |
| `@briefing` | Pre-PRD framing — turn `plans/` sketches into structured briefings with gap analysis |
| [`@briefing-refiner`](./briefing-refiner.md) | Briefing refinement loop — audits the briefing into structured findings, the CLI renders the localized `review.html` surface (`briefing:review`), confirmed feedback is applied via `briefing:apply-feedback`, rounds repeat until nothing blocks the PRD |
| `@product` | PRD — vision, problem, users, scope, acceptance criteria |
| `@sheldon` | Optional PRD review and enrichment; updates Product's single PRD instead of creating a parallel specification package |
| `@planner` | Converts the approved PRD into the single vertical implementation plan |
| `@analyst` | Explicit consultant for domain discovery, entities, flows, and brownfield mapping |
| `@scope-check` | Explicit consultant for bounded intent/plan/delivery drift review |
| `@architect` | Explicit consultant for named technical decisions, integration boundaries, and security-sensitive structure |
| `@ux-ui` | UI/UX spec — **opt-in detour** for UI-heavy specs; `@dev` applies design skills directly by default |
| `@pm` | Explicit consultant for backlog and user-story questions; not the implementation-plan owner |
| `@orchestrator` | Opt-in coordination specialist, not a default feature stage or specification authority |
| `@dev` | Feature implementation and final integration. May dispatch configured development lanes sequentially in the shared worktree, then verifies the integrated plan. |
| `@qa` | Proportional final review with a bounded investigation budget; writes the single QA verdict and returns reproducible defects to DEV. |
| `@validator` | Opt-in binary contract verification in a fresh isolated context |
| [`@forge-run`](./forge-run.md) | Lane B (opt-in) — compile a MEDIUM feature's specs into an executable workflow and run it (`forge:compile`) |
| `@tester` | Opt-in systematic test engineering for legacy systems and coverage gaps |
| `@pentester` | Opt-in adversarial security review — OWASP Top 10, LLM Top 10, and supply chain |

### Continuity & delivery

| Agent | Role |
|---|---|
| `@deyvin` (alias `@pair`) | Continuity-first pair — recovers state with `confirmed/inferred`, small validated batches |
| `@committer` | Professional Git commit message generation |
| `@discover` | Semantic project cache — `bootstrap/` (structured) and `brains/` (Zettelkasten) |
| `@neo` | Session router — "I don't know what to do next" |

### Specializations

| Agent | Role |
|---|---|
| `@squad` | Create and manage custom multi-agent squads |
| `@genome` | Create and apply cognitive genomes (domain, function, persona, hybrid) |
| `@profiler-researcher` | Collect raw material on a public person |
| `@profiler-enricher` | Cognitive analysis — DISC, Enneagram, Big Five, MBTI |
| `@profiler-forge` | Generate Genome 3.0+ persona advisor |
| `@site-forge` | Clone, extract, and forge design skills from any URL |
| `@design-hybrid-forge` | Combine two design skills into a hybrid |
| `@orache` | Domain investigation and strategic research |
| `@copywriter` | Conversion copy — landing pages, VSL scripts |
| [`@discovery-design-doc`](./discovery-design-doc.md) | Explicit consultant for a standalone discovery/design investigation; its findings enrich the PRD or plan without becoming a required package |

---

For the executable-verification theme that `@forge-run`, `@validator`, `@scope-check`, `@sheldon`, and `@pm` participate in, see [Executable verification](../5-reference/executable-verification.md).

For the full lane walkthrough and opt-in detour guide, see [Full feature with @sheldon](../3-recipes/full-feature-with-sheldon.md).

Full PT cards with dialogue examples, disk outputs, and handoff maps: [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md)
