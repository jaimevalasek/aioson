---
name: prototype-contract
description: "How an approved prototype binds the PRD, the plan, implementation and validation — what it proves, what it never proves, and how each stage cites it."
agents: [product, sheldon, planner, dev, qa, tester, validator]
modes: [planning, executing]
task_types: [prd, implementation-plan, implementation, validation]
load_tier: trigger
triggers: [prototype, prototype.html, prototype reference, app-shell, clickable prototype]
---

# Prototype Contract

Prototype authority is feature-owned, never global. A prototype is binding only when all of these agree:

- the active PRD is `prd-{slug}.md`;
- PRD frontmatter declares `prototype_status: current` and `prototype_feature: {slug}`;
- the prototype and manifest use the exact feature-owned paths under `.aioson/briefings/{slug}/`;
- the manifest declares `feature: {slug}`.

An artifact under another briefing folder belongs to that other feature even when its feature is closed. It is historical evidence, not a candidate that Product, Planner, Dev, or QA may silently reactivate.

## PRD pointer

With a binding prototype, the PRD records:

```markdown
---
prototype: .aioson/briefings/{slug}/prototype.html
prototype_status: current
prototype_feature: {slug}
---

## Prototype contract
- status: current
- feature: {slug}
- prototype: .aioson/briefings/{slug}/prototype.html
- manifest: .aioson/briefings/{slug}/prototype-manifest.md
- binding interactions: [names]
- approved deviations: none / [exact change + reason]
```

Without one, the PRD records the absence explicitly:

```markdown
---
prototype: null
prototype_status: none
prototype_feature: null
---

## Prototype contract
- status: none
- feature: {slug}
- prototype: none
- manifest: none
- excluded historical references: none / [.aioson/briefings/{old-slug}/prototype.html — belongs to {old-slug}, closed/current]
```

Historical paths may appear only under `excluded historical references` or an explicitly non-binding research note. Their presence must never override `prototype_status: none`.

## Manifest ownership

Every newly generated `prototype-manifest.md` starts with:

```yaml
---
feature: {slug}
status: draft
---
```

`status` may later become `locked`, but `feature` never changes. Reusing an older experience for a new feature requires a new or deliberately re-synchronized prototype inside the new feature's briefing folder; never point the new PRD at the old folder.

## Role usage

- Refiner writes only into the selected briefing slug and stamps the manifest owner.
- Product resolves the binding from the exact matching folder before writing the PRD. A cross-feature or closed-feature prototype is excluded automatically when the user did not explicitly request a new feature-owned prototype.
- Sheldon independently checks the same ownership before enriching interactions into ACs.
- Planner maps only a verified current binding to vertical phases. With `prototype_status: none`, it plans from PRD plus inspected repository behavior.
- Dev runs the ownership check before using a prototype. With no binding prototype, it inspects the current production path and tests to correct approved behavior; they do not resurrect a closed feature's visual artifact.
- QA launches the normal application and proves the binding interactions end to end, or records that the feature explicitly has no prototype.

Optional specialists consume the same pointer. They do not create a parallel prototype specification.

**How each agent resolves it:** run `aioson prototype:check . --feature={slug} --json` and transcribe `status` + binding owner/path into the evidence line — never re-derive ownership by cross-reading folders and manifests. The evidence line states: `current` plus owner/path, or `none` plus any historical path the command excluded. This is an evidence line, not a confirmation prompt. What stays with the agent is judgment on a failed check (repair vs. request a new feature-owned prototype) — and runtime parity, which no structural check proves (see Evidence rule). Autopilot applies the safe evidence-backed resolution and pauses only if the user explicitly wants a non-owned prototype to become new product authority.

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

The strict command checks status consistency, feature ownership, canonical paths, manifest ownership, file existence, and interaction coverage:

```bash
aioson prototype:check . --feature={slug} --strict
```

A cross-feature path fails even if the old files exist. `prototype_status: none` returns `not_applicable` and ignores explicitly excluded historical references. This remains an inventory/ownership check only; QA still must verify the real application.
