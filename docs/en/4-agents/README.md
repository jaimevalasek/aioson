# Agent cards — AIOSON (EN)

This layer will hold one card per AIOSON agent (29 total), translated from [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md).

Cards are being translated progressively. Until a card is available here, the PT version is the canonical reference — it follows the same format and covers the same agents.

---

## The 29 agents (plus @pair alias)

### Workflow core (pipeline order)

| Agent | Role |
|---|---|
| `@setup` | Project onboarding — detect stack, classify MICRO/SMALL/MEDIUM, write `project.context.md` |
| `@briefing` | Pre-PRD framing — turn `plans/` sketches into structured briefings with gap analysis |
| `@product` | PRD — vision, problem, users, scope, acceptance criteria |
| `@sheldon` | PRD quality guardian — gap detection, web research, sizing, in-place enrichment or phased plan |
| `@analyst` | Domain discovery — entities, flows, brownfield mapping |
| `@scope-check` | Alignment gate before implementation — validates intent vs plan and catches scope drift |
| `@architect` | Technical decisions — structure, libraries, integration boundaries |
| `@ux-ui` | Design system and UI component specs (MEDIUM) |
| `@pm` | Backlog and user stories (MEDIUM) |
| `@orchestrator` | Parallel lane coordination (MEDIUM) |
| `@dev` | Feature implementation — any stack |
| `@qa` | Risk-first review, test generation, autonomous fix/test loop |
| `@validator` | Binary contract verification against `harness-contract.json` |
| `@tester` | Systematic test engineering — legacy and coverage gaps |
| `@pentester` | Adversarial security review — OWASP Top 10, LLM Top 10, supply chain |

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
| [`@discovery-design-doc`](./discovery-design-doc.md) | Discovery, readiness, and design doc package |

---

Full PT cards with dialogue examples, disk outputs, and handoff maps: [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md)
