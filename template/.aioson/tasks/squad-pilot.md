# Task: Squad Pilot

> Build the squad's flagship deliverable and lint it deterministically. Judge
> nothing for the user: only `aioson squad:pilot-approve` — run by the user —
> freezes a pilot.

## When To Use

- `@squad pilot <slug>`
- Closing `default-create`/`create` for a deliverable-class squad
  (`mode: software|mixed`)
- After executor/skill changes that made an approved pilot stale

## Mandatory Preload

Load `.aioson/docs/squad/pilot-gate.md` and
`.aioson/docs/squad/package-contract.md`.

## Process

1. Preconditions and gate order: `pilot-gate.md` § "Order of gates" —
   `aioson squad:validate . --squad=<slug> --strict --json` clean and a current
   `squad:eval` PASS first. On failure, route there; the pilot is the last gate,
   not a repair tool.
2. Derive the flagship task from the manifest's mode, domain, goal, and sources;
   a matching skill under `.aioson/skills/squad/domains/` defines the expected
   artifact in its `## Pilot flagship` section. Record it in `pilot.task`.
3. Build the pilot with the squad's own executors under `output/<slug>/pilot/`
   (benchmark posture: one complete vertical, no dead controls, real states,
   honest validation). Do not author the deliverable as `@squad`.
4. Write `.aioson/squads/<slug>/docs/PILOT.md` with exactly `## Pilot task`,
   `## Validations` (exact commands + observed results), `## Binds`,
   `## Does not bind`. Set the manifest `pilot` block to `status: draft` with
   `entrypoint`.
5. Run `aioson verify:artifact . --kind=squad-pilot --slug=<slug> --advisory`
   and repair every issue.
6. Hand the user the entrypoint path and the approval command
   (`aioson squad:pilot-approve . --squad=<slug>`), then stop. Iterate on
   feedback; never approve, and never loop without new user input.

## Output

- Deliverable under `output/<slug>/pilot/` with a working `pilot.entrypoint`
- `pilot` block in `squad.manifest.json` (`status: draft`)
- `.aioson/squads/<slug>/docs/PILOT.md`
- Chat: entrypoint path + approval command + any residual limits

## Rules

- A content/research squad records `pilot.status: not_applicable`; never
  manufacture a deliverable to satisfy the gate.
- Lane semantics: `.aioson/docs/squad/creation-flow.md` § Delivery lane; `quick`
  may defer with a concrete `pilot.deferReason`, `premium` and `regulated` never
  defer.
- A recorded FAIL in Validations is legal evidence; a fabricated PASS is a
  defect.
- One vertical only; depth of finish beats breadth.
- After approval, offer the domain distillation from
  `.aioson/docs/squad/pilot-gate.md` in one line; proceed only on yes.
