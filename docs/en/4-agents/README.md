# Agent cards — AIOSON (EN)

This layer will hold one card per AIOSON agent (29 total), translated from [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md).

Cards are being translated progressively. Until a card is available here, the PT version is the canonical reference — it follows the same format and covers the same agents.

---

## Canonical feature route

```text
optional @briefing → optional @refiner → @product
→ @sheldon → @planner → @dev → @qa
```

MICRO, SMALL, and MEDIUM change depth, risk coverage, and work budget—not the stage chain. Product owns one PRD, Planner owns one implementation plan, and QA owns one final verdict. `@sheldon` may enrich the PRD in place. Former consultants were folded into the main cycle: domain rules and interaction decisions live in Product's PRD, architecture decisions, code mapping, and sequencing in Planner's plan, and scope drift and accessibility audits in QA.

Autopilot defaults to the DEV → QA handoff and can cover the full canonical chain when configured. Tester, Pentester, and Validator are disabled by default and never activate because of classification alone. `feature:close`/publish remains a human gate. See [Autopilot handoff](../5-reference/autopilot-handoff.md).

---

## The 29 agents

### Workflow core

| Agent | Role |
|---|---|
| `@setup` | Project onboarding — detect stack, classify MICRO/SMALL/MEDIUM, write `project.context.md` |
| `@briefing` | Pre-PRD framing — turn `plans/` sketches into structured briefings with gap analysis |
| [`@refiner`](./refiner.md) | Briefing refinement loop — audits the briefing into structured findings, the CLI renders the localized `review.html` surface (`briefing:review`), confirmed feedback is applied via `briefing:apply-feedback`, rounds repeat until nothing blocks the PRD |
| `@product` | PRD — vision, problem, users, scope, acceptance criteria, domain rules, and interaction decisions; resolves and records the prototype and identity bindings (`identity`/`identity_status`) the PRD carries forward |
| `@sheldon` | Optional PRD review and enrichment; updates Product's single PRD instead of creating a parallel specification package; blocks approval when a material state the approved prototype renders (loading, empty, error, permission-denied, responsive) has neither an acceptance criterion nor a recorded deferral |
| `@planner` | Converts the approved PRD into the single vertical implementation plan — Architecture Decisions rows, repo discovery/code map, sequencing and rollout |
| `@orchestrator` | Opt-in coordination specialist, not a default feature stage or specification authority |
| `@dev` | Feature implementation and final integration. Resolves visual authority from the PRD identity binding → approved prototype → design skill → repository conventions, escalating a genuinely unresolved visual decision to `@product`. May dispatch configured development lanes sequentially in the shared worktree, then verifies the integrated plan. Also owns Simple Plan, below-lane direct fixes, site delivery, continuity recovery (a bare `@dev` activation resumes from `dev-state.md` with `confirmed/inferred`), and the read-only [sub-task scout](../deyvin-subtask-scout/README.md). |
| `@qa` | Proportional final review with a bounded investigation budget, including scope drift and the accessibility audit; writes the single QA verdict and returns reproducible defects to DEV. |
| `@validator` | Opt-in binary contract verification in a fresh isolated context |
| [`@forge-run`](./forge-run.md) | Lane B (opt-in) — compile a MEDIUM feature's specs into an executable workflow and run it (`forge:compile`) |
| `@tester` | Opt-in systematic test engineering for legacy systems and coverage gaps |
| `@pentester` | Opt-in adversarial security review — OWASP Top 10, LLM Top 10, and supply chain |

### Continuity & delivery

| Agent | Role |
|---|---|
| `@committer` | Professional Git commit message generation |
| `@discover` | Semantic project cache — `bootstrap/` (structured) and `brains/` (Zettelkasten) |
| `@neo` | Session router — "I don't know what to do next" |
| `@help` | Beginner-friendly guide to AIOSON concepts, workflows, commands, and next steps |
| `@quality` | Optional engineering quality assessment, static analysis, and reproducible evaluations |
| `@shakedown` | Opt-in spec-independent post-delivery completeness walkthrough and bug hunt |
| `@benchmark` | One measured AIOSON traversal with honest run artifacts |

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

Retired agents (`@deyvin`/`@pair`, `@analyst`, `@architect`, `@pm`, `@ux-ui`, `@scope-check`, `@discovery-design-doc`) were absorbed by `@dev`, `@product`, `@planner`, `@refiner`, and `@qa`; their ids still resolve on the CLI.

---

For the executable-verification theme that `@forge-run`, `@validator`, `@qa`, `@sheldon`, and `@planner` participate in, see [Executable verification](../5-reference/executable-verification.md).

For the full lane walkthrough and opt-in detour guide, see [Full feature with @sheldon](../3-recipes/full-feature-with-sheldon.md).

Full PT cards with dialogue examples, disk outputs, and handoff maps: [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md)
