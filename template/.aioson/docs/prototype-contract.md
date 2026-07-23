---
name: prototype-contract
agents: [product, sheldon, planner, dev, qa, ux-ui, tester, validator]
modes: [planning, executing]
task_types: [prd, implementation-plan, implementation, validation]
load_tier: trigger
triggers: [prototype, prototype.html, prototype reference, app-shell, clickable prototype]
---

# Prototype Contract

When `.aioson/briefings/{slug}/prototype.html` exists, it is authoritative source evidence for screens, navigation, interactions, states, and visual direction. Its data may be mocked; the delivered behavior may not be.

## PRD pointer

The PRD records:

```markdown
## Prototype contract
- prototype: .aioson/briefings/{slug}/prototype.html
- manifest: .aioson/briefings/{slug}/prototype-manifest.md
- binding interactions: [names]
- approved deviations: none / [exact change + reason]
```

## Role usage

- Product reconciles scope with the prototype.
- Sheldon turns binding interactions into ACs in the same PRD and records deliberate deviations.
- Planner maps them to early vertical phases that include the real state/backend boundary.
- Dev reproduces them against the real application stack, preserving the visual/interaction contract.
- QA launches the normal application and proves the binding interactions end to end.

Optional specialists consume the same pointer. They do not create a parallel prototype specification.

## Evidence rule

Prototype parity is proven by running the delivered application:

`normal entry point → demonstrated action → real boundary/state change → visible result`

Source-string assertions, component presence, a structural parity test, detached backend fixtures, or passing `prototype:check` do not prove runtime parity.

Browser automation is useful for web apps but is not mandatory for native/desktop apps; use stack-appropriate runtime evidence.

## Deterministic inventory guard

Run:

```bash
aioson prototype:check . --feature={slug}
```

The command checks that prototype files exist and that manifest interaction names are represented in the PRD/AC inventory. It is an inventory check only. QA still must verify the real application.
