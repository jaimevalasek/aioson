---
description: "Squad pilot gate — the flagship deliverable a deliverable-class squad proves itself with, frozen only by the user, plus the domain-distillation loop."
agents: [squad]
task_types: [pilot, quality]
triggers: [pilot, flagship deliverable, pilot approve, domain distillation]
---

# Squad Pilot Gate

Approval by artifact, not by prose. `squad:validate` proves structure and
`squad:eval` proves grounding — neither proves the squad can deliver its
flagship artifact at the quality bar the user has in mind. The pilot does: one
representative deliverable of the domain, built by the squad's own executors,
iterated in draft, and frozen by the user as the squad's binding quality bar.

## Scope

- **Deliverable-class squads** (`mode: software` or `mixed`): the pilot is part
  of readiness. Lane semantics: `creation-flow.md` § Delivery lane; the pilot
  delta is that `standard` and above build it, `quick` may defer with a concrete
  `pilot.deferReason`, and `regulated` and `premium` never defer.
- **Content/research squads**: record `pilot.status: not_applicable` — never
  manufacture a deliverable to satisfy the gate.

## Contract

The canonical state is the `pilot` block in `squad.manifest.json`:
`status` (`not_applicable | pending | draft | approved`), `task`, `entrypoint`,
`fingerprint`, `approved_at`, `builders`, `deferReason`. Three locations, each
for a reason:

| Artifact | Path | Why |
|---|---|---|
| Canonical state (`pilot` block) | `squad.manifest.json` | the contract importers already validate; no parallel file to desync |
| Evidence doc | `.aioson/squads/{slug}/docs/PILOT.md` | portable with the package, markdown under `.aioson/` |
| The deliverable | `output/{slug}/pilot/` | file-first; no HTML under `.aioson/` |

`PILOT.md` carries exactly these sections: `## Pilot task`, `## Validations`
(exact executed commands with observed results — honest, never fabricated),
`## Binds`, `## Does not bind`.

**What the pilot binds:** the visual and interaction signature — layout
language, motion, states, mask/validation, confirmation and drag-and-drop
contracts, depth of finish. **What it does not bind:** real data integration,
scale, the full feature surface. The pilot is the smallest representative
vertical — one cinematic landing, one CRM pipeline screen — never the product.

## Order of gates (cheap before expensive)

1. `squad:validate --strict` clean, then a current `squad:eval` PASS.
2. Derive the flagship task from the manifest's domain, mode, and sources; check
   `.aioson/skills/squad/domains/` for a matching domain skill — its
   `## Pilot flagship` section defines the expected artifact.
3. The squad's own executors build the pilot (benchmark posture: complete
   vertical, no dead controls, validation recorded honestly). `@squad`
   orchestrates and never authors the deliverable itself.
4. `aioson verify:artifact . --kind=squad-pilot --slug={slug} --advisory` —
   repair every issue. A web pilot (any HTML under `output/{slug}/pilot/`) is
   also measured by `--kind=visual --dir=output/{slug}/pilot` (the floor in
   `package-contract.md` § Variant C), and the squad's `agent:done` runs that
   measurement itself; answer every warning with a fix or a recorded reason
   before presenting the entrypoint.
5. Present the entrypoint to the user and stop. Only the user runs
   `aioson squad:pilot-approve . --squad={slug}`; it refuses to freeze while the
   gate reports issues, then stamps status, fingerprint, and `approved_at`.

Editing the deliverable after approval makes the fingerprint stale; readiness
drops until the user re-approves. That is correct behavior, not an error.

The freeze also records WHO built the pilot: `pilot.builders` captures the
compiled genome binding identities (`sourceHash`, `compilationId`) at approval
time. The deliverable fingerprint cannot see a genome enrich or recompile — the
executors change without `output/` changing — so builder drift surfaces as lint
warnings: the pilot is still the approved artifact, but the squad that built it
no longer exists in that form. Rebuild and re-approve when the drift matters.

## After approval: the pilot as session authority

Every future session that produces deliverable output loads the `pilot` block
and `PILOT.md` as binding quality reference: a session deliverable that falls
below the approved pilot's signature is a finding, not a style choice.

## Domain distillation (the learning loop)

An approved pilot is evidence of what "good" means in this domain. Distill it —
never automatically:

1. After approval, offer distillation to the user in one line; proceed on yes.
2. Extract the transferable signature from the approved pilot and its PILOT.md:
   domain vocabulary, composition and motion language, interaction contracts,
   quality bar, anti-patterns observed while iterating.
3. Write or update `.aioson/skills/squad/domains/{domain}.md` following the
   existing seed structure (`cinematic-web.md`, `crm-operational.md`): keep it
   general to the domain — squad-specific choices stay in the squad package.
4. Future squads in the domain load the skill at design time; the second squad
   in a domain must be born knowing what the first one learned.

Distillation is capped at one pass per approval and never edits the approved
pilot or its manifest block.

## Hard limits

- Never run `squad:pilot-approve` as the agent; the freeze is exclusively the
  user's.
- Never fabricate validation output in `PILOT.md`; a recorded FAIL is legal
  evidence, a fake PASS is a defect.
- Never widen the pilot beyond one vertical to impress; depth of finish beats
  breadth.
- Never borrow another squad's pilot or deliverable.
