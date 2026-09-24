---
description: "Measured coupling limits — internal fan-out per module and import cycles, the boundaries rules:check enforces. Advisory by default (a pause to think); a project rule binding the same checkers makes it law."
task_types: [implementation, refactor, extraction, architecture, quality]
triggers: [coupling, fan-out, import cycle, circular dependency, circular import, dependency cycle, too many imports, decouple, module boundary, tangled modules, god module]
agents: [dev, qa, planner, validator]
paths: [src/**, app/**, lib/**, packages/**, services/**]
load_tier: trigger
enforcement: [module-fan-out, import-cycle]
max_module_fan_out: 15
---

# Coupling limits — measured, not felt

> `design-docs/componentization.md` carries the doctrine (one responsibility per module, dependencies point downward). This document makes its boundaries **machine-checked**: the `module-fan-out` and `import-cycle` checkers of `aioson rules:check` read the import statements of every module in the tree — lexically, build-free, for JS/TS (`import … from`, `export … from`, `require()`, `import()`) and Python (`import a.b`, `from .a import b`) — resolve the ones that point inside the project, and report the files under check that cross a limit. Coupling to a library is a dependency decision and is not an edge; coupling to `../../billing/ledger` is architecture and is.

## What is counted

An **edge** is an import that resolves to a module file of the project (relative paths, `/`-rooted paths, the usual source-root aliases `@/`, `~/`, `#/`, `src/`, `app/`; Python relative and absolute imports rooted at the repo, `src/`, `app/` or `lib/`). An import that does not resolve is dropped, never guessed. Stylesheets, JSON and assets are not modules.

**Fan-out** is the number of distinct internal modules a file imports. **Fan-in** is how many import it — reported beside the finding, never a violation: a shared utility is meant to be imported. An **import cycle** is a set of modules that reach each other again through imports; the finding shows the shortest path from the file back to itself.

## Limits and tiers

| Checker | Default | Frontmatter key | Finding |
|---|---|---|---|
| `module-fan-out` | 15 internal modules | `max_module_fan_out` | `MODULE_FAN_OUT` — one per file, keyed by the file (stable for `--baseline`) |
| `import-cycle` | none allowed | — | `IMPORT_CYCLE` — one per file in the cycle, keyed by the cycle's members |

Bound by this **doc**, both report `MED`: advisory, surfaced in the tracked `@dev`/`@qa` done-gate and in `agent:epilogue` over the changed files, never a refused handoff. Bound by a **rule** in `.aioson/rules/` (copy the frontmatter keys there with the project's numbers), they report `HIGH` and block like any rule; a rule's threshold outranks this doc's, and among several documents the strictest value wins.

```yaml
# .aioson/rules/coupling.md — the project decides the law
---
name: coupling
description: "Modules import at most 10 siblings and never each other — this tree is meant to be replaced one piece at a time"
enforcement: [module-fan-out, import-cycle]
max_module_fan_out: 10
---
```

## Exemptions

The size doctrine's exemptions are the coupling doctrine's: tests, fixtures and factories, generated files, locale dictionaries, configuration and route tables (a route table imports every controller by design), migrations. Exempt files still take part in the graph — their edges count for the modules they import — but never carry a finding.

**Composition roots and barrels** — `index.*`, `main.*`, `cli.*`, `app.*`, `server.*`, `bootstrap.*`, `router.*`, `registry.*`, `container.*`, `wiring.*`, `providers.*`, `plugins.*`, `commands.*`, `module.*` — import many modules because that is their job: they are exempt from the fan-out limit only. A composition root inside an import cycle is still a cycle.

## Legacy codebases

A tree that grew tangled before the limit existed is not charged retroactively: the gate runs over the **changed** files, and `aioson rules:check . --baseline` records the existing findings as counted debt — visible in every run, never blocking, while every new edge that crosses a limit still reports.

## When the finding fires

**Fan-out.** Name what the file orchestrates. If it composes many small modules of one area, put them behind one module that owns that boundary (a facade, an index that exports the area's public surface) and import that. If it composes several areas, it is doing several jobs — split it by responsibility (`design-docs/file-size.md` § Common split strategies) and keep the public behavior identical; the ACs are the proof.

**Cycle.** A cycle means neither module can be understood, tested or replaced alone. Break it in the direction the doctrine already points: the lower module owns the interface (a type, a callback, an event) and the upper one depends on it; the piece both need moves below both. Do not "fix" a cycle with a lazy import — that hides the edge from the reader and from this checker alike. If a cycle must stay (a generated parser, a framework's registration pattern), record the reason in the plan's deviation line so the next reader finds a decision, not an accident.
