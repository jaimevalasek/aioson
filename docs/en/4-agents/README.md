# Agent cards — AIOSON (EN)

This layer will hold one card per AIOSON agent (29 total), translated from [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md).

Cards are being translated progressively. Until a card is available here, the PT version is the canonical reference — it follows the same format and covers the same agents.

---

## Default lanes (v1.35.0)

| Classification | Default lane |
|---|---|
| **MICRO** | `@product → @dev → @qa` |
| **SMALL** (lean — default) | `@product → @sheldon → @dev → @qa` |
| **MEDIUM** (maestro) | `@product → @orchestrator → @dev → @pentester → @qa` |

`@sheldon` (SMALL) and `@orchestrator` (MEDIUM) are the **single spec authorities** for their respective sizes. Agents like `@analyst`, `@architect`, `@pm`, `@ux-ui`, `@scope-check`, and `@discovery-design-doc` are **opt-in detours** or **fan-out sub-agents** — none deleted, none in the default hop sequence.

Building a feature the normal way through this lane can now run the whole chain automatically, up to the `feature:close` recommendation — `feature:close`/publish is always a human gate. See [Autopilot handoff](../5-reference/autopilot-handoff.md) for the run-mode decision (`--auto`/`--step` tokens, the `@product` kickoff question), the post-dev review cycle hub (`@qa` → `@tester`/`@pentester`/`@validator`), and the `--help` quick-help token available on the 13 most-used agents.

---

## The 29 agents (plus @pair alias)

### Workflow core

| Agent | Role |
|---|---|
| `@setup` | Project onboarding — detect stack, classify MICRO/SMALL/MEDIUM, write `project.context.md` |
| `@briefing` | Pre-PRD framing — turn `plans/` sketches into structured briefings with gap analysis |
| `@product` | PRD — vision, problem, users, scope, acceptance criteria |
| `@sheldon` | **SMALL single spec authority** (RF-LEAN): one pass produces requirements + spec (Gates A/B/C) + design-doc + readiness + implementation-plan + harness-contract. Also a PRD-hardening / enrichment capability usable in any lane. |
| `@analyst` | Domain discovery — entities, flows, brownfield mapping. **Opt-in detour / fan-out sub-agent** (invoked by `@orchestrator` in MEDIUM) |
| `@scope-check` | Scope-drift gate — `spec:analyze` runs **automatically** at the `@dev`/`@qa` done gate; also available as an explicit detour |
| `@architect` | Technical decisions — structure, libraries, integration boundaries. **Opt-in detour / fan-out sub-agent**; runs in **merged mode** (also produces design-doc + readiness + dev-state) when `@discovery-design-doc` is omitted |
| `@ux-ui` | UI/UX spec — **opt-in detour** for UI-heavy specs; `@dev` applies design skills directly by default |
| `@pm` | Backlog, user stories, implementation plan (Gate C). **Opt-in detour / fan-out sub-agent** (MEDIUM) |
| `@orchestrator` | **MEDIUM maestro / single spec authority** — fans out `@analyst`/`@architect`/`@pm` (+ `@ux-ui` for UI-heavy) as sub-agents, consolidates the gated spec package. Secondary: coordinate parallel `@dev` lanes post-spec. |
| `@dev` | Feature implementation — any stack. Runs the plan as a **phase loop**: auto-continues between phases, per-phase verification (light sub-agent), context compaction between phases. Full Runtime smoke runs once at end-of-feature. |
| `@qa` | Risk-first review, test generation, autonomous fix/test loop (cap 3), hub of the post-dev autopilot review cycle (routes to `@tester`/`@pentester`/`@validator`). Owns Gate D: **Runtime smoke gate** (build + migrations on real DB + boot + Core happy-path on REAL stack). |
| `@validator` | Binary contract verification against `harness-contract.json` in a **fresh isolated context** (detour when a harness contract exists) |
| [`@forge-run`](./forge-run.md) | Lane B (opt-in) — compile a MEDIUM feature's specs into an executable workflow and run it (`forge:compile`) |
| `@tester` | Systematic test engineering — legacy and coverage gaps. Triggered by `@qa` when conditions fire. |
| `@pentester` | Adversarial security review — OWASP Top 10, LLM Top 10, supply chain. Inline in MEDIUM; opt-in in SMALL. |

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
| [`@discovery-design-doc`](./discovery-design-doc.md) | Discovery, readiness, and design doc package — opt-in; absorbed by `@architect` merged mode, `@sheldon`, or `@orchestrator` by default |

---

For the executable-verification theme that `@forge-run`, `@validator`, `@scope-check`, `@sheldon`, and `@pm` participate in, see [Executable verification](../5-reference/executable-verification.md).

For the full lane walkthrough and opt-in detour guide, see [Full feature with @sheldon](../3-recipes/full-feature-with-sheldon.md).

Full PT cards with dialogue examples, disk outputs, and handoff maps: [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md)
