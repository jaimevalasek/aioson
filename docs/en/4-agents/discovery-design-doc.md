# @discovery-design-doc - Discovery, readiness, and design doc

> **For whom:** people who need to turn a vague idea into initial clarity, or consolidate PRD, requirements, and architecture into a technical contract before `@dev`.
> **Reading time:** 3 min.
> **What you will learn:**
> - The two correct usage modes: exploratory and pre-dev
> - Why this agent can appear after `@analyst` and `@architect` in the workflow
> - What the design doc and readiness note provide to downstream agents

---

## What it is for

`@discovery-design-doc` has two valid uses:

- **Exploratory mode:** when a request is still vague, such as a ticket, feature idea, or meeting note. It normalizes the problem, identifies ambiguities, and recommends the next agent.
- **Explicit pre-dev opt-in:** when you want a standalone design doc + readiness package between the spec phase and `@dev`. In the default SMALL lean and MEDIUM maestro lanes, this role is absorbed by `@sheldon` (SMALL) or `@architect` in merged mode / `@orchestrator` (MEDIUM) — invoke `@discovery-design-doc` explicitly only when you need it as a separate step.

**Note (v1.35.0):** this agent is **not in the default hop sequence** for either SMALL or MEDIUM. It is an opt-in detour.

---

## When to invoke

- You have a ticket, briefing, or idea and want to turn it into a structured document quickly
- You want to know what is defined vs ambiguous before invoking `@product` or `@dev`
- You are in exploratory mode and want a clarity checkpoint without committing to the full workflow
- You are in the SMALL/MEDIUM workflow after `@architect` and need the pre-dev technical contract
- `@dev` needs exact paths, modules, reuse decisions, and file-size risks before editing code

---

## When not to invoke

- To redo broad discovery when PRD, requirements, spec, and architecture are already clear
- You need deep domain discovery and entity mapping - use `@analyst` inside the SMALL/MEDIUM workflow
- You want pre-PRD framing with framing frameworks - use `@briefing`
- The task is MICRO and already has a simple plan that is enough for `@dev`

> Having PRD/spec defined does **not** block this agent. In the SMALL/MEDIUM workflow, those artifacts are inputs for the pre-dev `design-doc` and `readiness` package.

---

## Where it fits in the workflow

**Manual exploratory flow** (unchanged):

```text
@setup -> @discovery-design-doc -> recommended next agent
```

**Default SMALL lean flow** — this agent is absorbed by `@sheldon`:

```text
@product -> @sheldon -> @dev -> @qa
```

**Opt-in SMALL detour** (explicit invocation after @sheldon or between @analyst and @dev):

```text
@product -> @sheldon -> [@analyst] -> @discovery-design-doc -> @dev -> @qa
```

**Default MEDIUM maestro flow** — this agent is absorbed by `@orchestrator` (via `@architect` sub-agent in merged mode):

```text
@product -> @orchestrator -> @dev -> @pentester -> @qa
```

**Opt-in MEDIUM detour** (explicit invocation after @orchestrator):

```text
@product -> @orchestrator -> @discovery-design-doc -> @dev -> @pentester -> @qa
```

When invoked, its role is not to replace `@analyst` or `@architect` — it turns those artifacts into an executable implementation package.

---

## Typical dialogue - exploratory mode

```text
You > @discovery-design-doc
      I want to add offline mode to the mobile app so users can read
      content without internet access.

@discovery-design-doc > Normalizing request...
                        Problem: users lose content access without connection
                        Scope: offline reading mode, not offline creation

                        Ambiguities:
                        - How much content can be stored offline?
                        - Automatic or manual sync?
                        - What happens when offline and online versions diverge?

                        Already defined:
                        - Stack: React Native + local SQLite available
                        - Auth: token can survive offline usage

@discovery-design-doc > Design doc created at: .aioson/context/design-doc.md
                        Readiness: MEDIUM - 3 ambiguities need decisions.
                        Recommendation: @product to close scope before @dev.
```

---

## Typical dialogue - pre-dev mode

```text
You > @discovery-design-doc
      Consolidate the checkout feature after architecture.

@discovery-design-doc > Reading PRD, requirements, spec, and architecture...
                        Scope: checkout with one-time payment
                        Readiness: ready_with_warnings

                        Technical plan:
                        - Reuse the existing orders module
                        - Create payment service under src/lib/payments/
                        - Avoid changing cart flow outside checkout
                        - Risk: controller may exceed 500 lines; split into service + validator

@discovery-design-doc > Design doc created at: .aioson/context/design-doc-checkout.md
                        Readiness created at: .aioson/context/readiness-checkout.md
                        Recommendation: proceed to @dev when Gate B is approved.
```

---

## Disk outputs

```text
.aioson/context/design-doc.md              <- project design doc
.aioson/context/readiness.md               <- project readiness
.aioson/context/design-doc-{slug}.md       <- feature design doc
.aioson/context/readiness-{slug}.md        <- feature readiness
```

---

## How it reads your project

- `.aioson/context/project.context.md`
- Existing artifacts: `prd.md`, `prd-{slug}.md`, `requirements-{slug}.md`, `spec.md`, `spec-{slug}.md`, `discovery.md`, `architecture.md` when relevant
- Existing design docs: `design-doc.md`, `design-doc-{slug}.md`, `readiness.md`, `readiness-{slug}.md`
- `.aioson/context/project-map.md` when present, to resolve canonical paths
- Direct input: briefing, ticket, screenshots, files you provide

---

## Typical handoff

- **Comes from:** direct request with a vague idea or ticket
- **Also comes from:** `@architect` in the SMALL/MEDIUM workflow, as pre-dev consolidation
- **Goes to:** the agent recommended in `readiness.md` - usually `@product` when scope is still open, or `@dev` when readiness is high

---

## Next step

- For pre-PRD framing with discovery frameworks: use `@briefing`
- For the full cycle: see [First project from scratch](../2-start/first-project.md)
