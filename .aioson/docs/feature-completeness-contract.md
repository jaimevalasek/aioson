---
description: "Deterministic contract that closes every approved feature promise through requirements, design, delivery, implementation, and executable verification."
agents: [briefing, briefing-refiner, product, sheldon, analyst, architect, discovery-design-doc, pm, orchestrator, dev, qa, tester, pentester, validator]
modes: [planning, executing]
task_types: [feature-framing, prd-writing, requirements, architecture, implementation-plan, implementation, verification]
load_tier: trigger
triggers: [feature completeness, capability map, requirements, implementation plan, acceptance criteria, operational surface]
---

# Feature Completeness Contract

This contract prevents a feature from being declared complete when the artifacts describe only a visible fragment of the promised outcome. It applies to every substantive SMALL or MEDIUM feature. MICRO work stays lightweight unless classification floors it to SMALL because the surface is rich or sensitive.

The `Implementation Leverage Matrix` belongs in the feature design delta when one exists; otherwise a SMALL feature places it in `readiness-{slug}.md` while referencing the stable project `design-doc.md`. Do not create a feature design doc solely to host this table.

Completeness does not mean adding every imaginable enhancement. It means:

1. every approved promise has a stable capability ID;
2. every completeness lens has an explicit `required`, `not_applicable`, or `deferred` decision;
3. required decisions trace into requirements and acceptance criteria;
4. design records what the repository already provides before inventing dependencies;
5. the delivery plan covers every required capability; and
6. implementation and QA provide executable evidence for the same trace.

This is a proportional closure contract, not a complexity generator. MICRO remains compact; SMALL uses the shortest trace that proves its required outcomes; MEDIUM expands only where its capabilities, risks, integrations, or sensitive surfaces require it. A `not_applicable` decision with concrete rationale is preferable to speculative implementation, documentation, or tests.

## Contextual necessity filter

This contract supplies reasoning angles, never a catalog of features. Examples are illustrative only. Before an agent adds a capability, requirement, architecture task, test obligation, or finding, it must derive the candidate from current evidence: an explicit promise/source artifact, a domain invariant implied by the approved flow/data, a repository or dependency constraint, or a failure/risk caused by an approved capability.

Apply the causal test: `evidence -> necessary implication -> observable consequence if omitted -> owner/action`. Keep the candidate only when every link can be named. Then classify it:

- `required-inferable`: correctness follows from evidence without a product choice; incorporate it into the owning artifact and trace.
- `blocking-decision`: alternatives materially change scope, data, cost, risk, or user-visible behavior; route one evidence-backed question to the owner and stop autopilot before downstream work. When a structured plan manifest exists or is needed, set `.aioson/plans/{slug}/manifest.md` to `status: pending-product-decisions` until resolved; the existing workflow guard blocks advancement.
- `optional-contextual`: evidence supports a useful extension, but the approved outcome remains correct without it; keep it excluded/deferred with the safe default and surface it in the spec authority's consolidated decision report. It never fails Gate D unless the user promotes it into a required CAP.
- `speculative`: no causal evidence or consequence; discard it silently. Do not ask, document, plan, test, or report it merely to appear thorough.

The spec authority persists the candidates that survived this filter in `.aioson/context/features/{slug}/decision-checkpoint.json`:

```json
{
  "schema_version": "feature-decision-checkpoint/v1",
  "feature_slug": "checkout",
  "status": "clear",
  "items": [
    {
      "id": "DEC-checkout-reminder",
      "classification": "optional-contextual",
      "status": "deferred",
      "evidence": "The approved flow can leave a cart inactive.",
      "omission_consequence": "Checkout remains correct; only re-engagement is absent.",
      "recommendation": "Defer email reminders until the user promotes them."
    }
  ]
}
```

Use `status: pending` only while at least one `blocking-decision` item has `status: pending`; otherwise use `clear`. `required-inferable` becomes `included`. Optional items default to `deferred`; user answers change them to `included` or `rejected`. The checkpoint is required even when `items` is empty, so decisions survive chat compaction and lean workflows without a plan manifest.

Canonical lenses are prompts for this test. A lens may reveal a contextual need or receive an evidenced `not_applicable`; it never imports authentication, CRUD, notifications, integrations, or any other domain behavior by analogy. QA and security may expose a causal upstream specification gap, but cannot turn an unrelated improvement idea into a delivery defect.

The canonical trace is:

`CAP -> lens decision -> REQ -> AC -> phase -> files -> verification -> executable evidence`

Never infer completeness from artifact presence, test count, line coverage, or a generic sentence such as “manage products”.

## Depth policy

- `MICRO`: a compact inline capability statement is enough when there is one bounded outcome and no rich/sensitive surface. If multiple promises or completeness lenses become material, reclassify to at least SMALL.
- `SMALL`: all four canonical sections below are required. A collapsed spec authority such as `@sheldon` owns the complete chain.
- `MEDIUM`: all four sections are required. `@orchestrator` reconciles analyst, architect, PM, UX, QA, and security inputs into one trace.
- Existing legacy artifacts may be read, but any feature that re-enters an active SMALL/MEDIUM workflow must close the contract before implementation continues.

## 1. Product promise map

The PRD contains this exact heading:

```markdown
## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-checkout-submit | A buyer can submit a valid order once | Buyer confirms checkout | required | This is the primary feature outcome |
| CAP-checkout-reminder | An abandoned cart can trigger a reminder | Scheduled job | deferred | Not required for the first release |
```

Rules:

- Use a stable, unique `CAP-*` ID for every promise accepted into the feature discussion.
- `required` means in scope. `deferred` and `not_applicable` require a concrete rationale and must agree with the PRD scope sections.
- Describe an observable outcome, actor or system trigger, and scope decision. Component names or verbs such as “handle”, “support”, and “manage” alone are not outcomes.
- At least one capability must be `required`.
- New promises discovered downstream are routed back to the PRD map before they enter requirements or code.

## 2. Requirements decision matrix

`requirements-{slug}.md` contains this exact heading:

```markdown
## Feature Capability Matrix

| CAP | Lens | Decision | Behavior / rationale | REQ | AC |
|---|---|---|---|---|---|
| CAP-checkout-submit | primary-outcome | required | Persist one order and return its identifier | REQ-checkout-01 | AC-checkout-01 |
| feature-wide | failure-recovery | required | A retry cannot create a duplicate order | REQ-checkout-04 | AC-checkout-04 |
| feature-wide | import-export | not_applicable | Checkout neither imports nor exports bulk data | — | — |
```

Every canonical lens receives an explicit decision:

- `primary-outcome`
- `user-interaction`
- `data-state-lifecycle`
- `validation-business-rules`
- `failure-recovery`
- `permissions-security`
- `integration-dependency`
- `side-effects-async`
- `notification`
- `import-export`
- `observability`
- `performance-scale`
- `compatibility-migration`
- `accessibility-localization`
- `operational-management`

Rules:

- Every required product `CAP-*` has its own `primary-outcome` row with at least one `REQ-*` and one `AC-*`.
- Cross-cutting rows may use `feature-wide`; otherwise cite one or more declared `CAP-*` IDs.
- `required` rows describe observable behavior and cite at least one `REQ-*` plus one `AC-*`.
- `not_applicable` and `deferred` rows carry a concrete reason. “Not needed”, `TBD`, and empty cells are not decisions.
- Extra domain-specific lenses are allowed, but they do not replace decisions for the canonical lenses.
- Requirements declare at least one REQ and one AC. Zero criteria is never a successful formal requirements gate.

## 3. Repository leverage matrix

Architecture or the feature design doc contains this exact heading:

```markdown
## Implementation Leverage Matrix

| CAP | Concern | Decision | Evidence | Target |
|---|---|---|---|---|
| CAP-checkout-submit | request validation | reuse | package.json has zod 4.x; schemas already live beside routes | src/checkout/checkout-schema.ts |
| CAP-checkout-submit | order persistence | custom | Existing repository pattern inspected; no generic order repository exists | src/checkout/order-repository.ts |
```

Allowed decisions are `reuse`, `framework_native`, `new_dependency`, `custom`, and `not_applicable`.

Rules:

- Every required capability has at least one leverage row.
- Inspect manifests, installed package versions, existing modules, design primitives, test infrastructure, and framework-native facilities before choosing.
- Evidence names the inspected package/version, manifest, module, component, convention, or concrete reason why reuse is not applicable.
- A non-`not_applicable` decision names the package or path to reuse/create.
- A new dependency must include why existing and framework-native options are insufficient.

## 4. Capability delivery plan

`implementation-plan-{slug}.md` contains this exact heading:

```markdown
## Capability Delivery Plan

| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-checkout-submit | 2 | src/checkout/service.ts, tests/checkout.test.ts | npm test -- checkout |
```

Every required product capability appears exactly once with:

- an implementation phase;
- concrete create/modify/reuse paths; and
- a non-placeholder verification command or runtime check.

Path authoring is deterministic: write full repository-relative file paths, one path per comma or `<br>`. Do not use basenames (`index.tsx`), directory-only shorthand (`src/frontend`), globs, ellipses, compressed path prose (`project-prototypes.ts, index.tsx`), or a combined `A/B` abbreviation. Root files such as `package.json` are valid when named exactly. Label create/modify/reuse if useful, but keep the complete path machine-readable.

Deferred and not-applicable capabilities are not implementation tasks. Plan phases may contain more detail, but cannot silently omit or merge away a required `CAP-*`.

## Conditional extensions

The canonical lenses decide which deeper analyses are required. They are extensions of the generic contract, not universal product scope.

### Operational management

When `operational-management` is `required`, use the Operational Surface Map in `.aioson/docs/feature-expansion-taxonomy.md`. For every Core object, explicitly decide lifecycle operations, management surface, validation, search/filter/sort/pagination, empty/loading/error states, permissions, destructive behavior, and restore behavior. Each concern is required, deferred with a reason, or not applicable with a reason.

Record those decisions in requirements with this exact extension:

```markdown
## Operational Decision Matrix

| Object | Concern | Decision | Rationale | CAP | REQ | AC |
|---|---|---|---|---|---|---|
| Product | create | required | Catalog managers register products through the product form | CAP-catalog-manage | REQ-catalog-02 | AC-catalog-02 |
| Product | pagination | not_applicable | The first release is contractually capped at 50 products | — | — | — |
```

For every Core object, decide `create`, `list`, `detail`, `update`, `delete-or-archive`, `restore`, `management-surface`, `input-validation`, `search`, `filter`, `sort`, `pagination`, `empty-state`, `loading-state`, `error-state`, and `permissions`. Required rows cite `CAP-*`, `REQ-*`, and `AC-*`.

This extension covers resource management, admin surfaces, workspaces, catalogs, boards/cards, CRM pipelines, and similar products. It must not be triggered by unrelated technical phrases such as “memory management”.

### Other lenses

- `integration-dependency`: define ownership, authentication, timeouts, retries, idempotency, rate limits, degradation, contract tests, and sandbox strategy when relevant.
- `side-effects-async`: define trigger, queue/job state, retry/dead-letter behavior, deduplication, cancellation, and observability when relevant.
- `notification`: define event, recipient, channel, consent, template/content owner, retries, and suppression when relevant.
- `import-export`: define formats, limits, validation, partial failure, idempotency, privacy, and progress reporting when relevant.
- `permissions-security`: define actors, resources, actions, ownership/tenant boundaries, denial behavior, audit needs, and destructive-action safeguards when relevant.
- `compatibility-migration`: define old/new behavior, migration/backfill, rollback, feature flags, and compatibility window when relevant.

These are reasoning prompts. Only decisions marked `required` become implementation scope.

## Agent ownership and stop conditions

- `@briefing` and `@briefing-refiner` discover candidate promises and missing surfaces without freezing implementation scope.
- `@product` owns the Feature Capability Map and scope decisions.
- `@sheldon` challenges omissions and, in collapsed SMALL mode, produces the complete downstream chain.
- `@analyst` owns the Feature Capability Matrix and REQ/AC trace.
- `@architect` owns the Implementation Leverage Matrix and technical consequences.
- `@pm` owns the Capability Delivery Plan.
- `@orchestrator` reconciles all four sections before MEDIUM implementation.
- `@dev` loads the complete artifact package, executes by `CAP-*`, and cannot mark a phase complete while its required capabilities lack code plus verification evidence.
- Gate D closes each required CAP through a compact implementation-ledger claim with explicit `capability_ids` and an existing implementation file, plus a fresh successful `harness:check` criterion that cites the CAP or one of its ACs. Ledger status strings are trace metadata, never executable proof. Runtime smoke depth remains conditional on a detected runtime surface; a bounded non-runtime SMALL feature needs only its focused executable criterion, not an enterprise harness or a second model.
- Harness trace IDs are atomic. Cite each exact `CAP-*`, `REQ-*`, `AC-*`, `RG-*`, or `SG-*` token separately in the criterion description/assertion. Never synthesize grouped ranges such as `AC-checkout-001-004`; the stable-ID matcher correctly treats that as a different, nonexistent ID.
- `@qa` starts from required capabilities and ACs, not from the tests that happen to exist. It challenges missing behavior and requires executable evidence.
- `@tester`, `@pentester`, and `@validator` consume the same trace for behavioral, adversarial, security, and final validation.

Stop the handoff when any required section, decision, trace link, repository evidence, delivery row, or executable AC evidence is missing. A downstream agent repairs the artifact owned by its upstream role; it does not silently invent scope in code.
