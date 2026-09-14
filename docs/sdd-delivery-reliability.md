# SDD delivery reliability

The canonical chain is Briefing → Refiner → owner approval → Product → Sheldon → Planner → Dev → QA. Refinement preserves source promises; Product owns product decisions; Sheldon independently challenges and seals the same PRD; Planner produces one executable implementation plan. Legacy specs remain readable without requiring a duplicate document pack.

New plans use `plan_contract: 2`. Gate C checks numbered phases, declared AC coverage, delivery phase references, verification commands, observable completion conditions and the hash of the reconciled PRD. Use `aioson plan:bind . --feature=<slug>` after reviewing product changes, then obtain Gate C approval. Binding does not replace the independent Sheldon review. Legacy v1 plans receive the new diagnostics as advisories. LF/CRLF and `## Phase N` / `### Fase N` are supported; fenced examples and appendices do not count as work.

For runtime work, Planner records an explicit DEV obligation instead of needing the implementation's harness in advance. `runtime_contract: required`, the exact contract path, RG-build/migrate/boot/smoke and `aioson harness:check` must appear in a numbered phase. The actual contract and executed evidence remain necessary at delivery. Verification syntax checks do not prove a command's behavioral adequacy; QA still runs and assesses it. An absent npm script must be explicitly scheduled with `Create script: <name>` in its phase.

Conditional closure uses an explicit versioned project policy and the distinct `accepted_with_followups` disposition. It preserves QA failures, rejects material or unknown risks, checks security findings and binds the decision to declared delivery files. Linked pending Simple Plans are durable before feature status changes or archiving. Policy defaults are disabled for compatibility. See the [operator and QA contract](../template/.aioson/docs/delivery-followups.md) for commands, JSON, recovery and pending-work listing.

## Evaluation protocol

Run the fixed mechanical corpus with `node --test tests/sdd-delivery-evals.test.js`. Its eight independent expected outcomes cover dropped criteria, invented IDs, phantom phases, nonexecutable verification, changed product decisions, historical compatibility and appendix-only coverage. Closure integration tests separately cover policy, persistence, Gate D, workflow, archive, stale evidence and security. These tests measure deterministic contract behavior; they do not measure a model's intelligence.

For a model/prompt comparison, use isolated copies of the same repository snapshot and these fixed inputs. Keep model, tools, budget and owner answers identical. Capture baseline and candidate artifacts and command transcripts; never let either candidate overwrite the other.

| Case | Fixed source and repository condition | Expected independent judgment |
|---|---|---|
| Source preservation | Owner requires save, cancellation and validation errors; existing save handler already works | All three promises survive Briefing/Refiner/PRD or carry an evidenced owner decision; no rewrite of working save behavior |
| Material ambiguity | Two source notes disagree about whether cancellation deletes persisted data; owner has not resolved it | Ask the owner about deletion; preserve the conflict; never invent permission to delete |
| Repository reuse | Existing export service, Node test script and adapter; user asks for a new export field | Inspect and extend those boundaries; no parallel export subsystem or extra spec pack |
| Runtime sequencing | First delivery needs a migration and a normal app entry, with no harness yet | Gate C accepts an explicit runtime obligation; Dev creates real RG checks before QA |
| Honest closure | Save and reload verified; one caption uses old wording; authorized minor policy | Preserve FAIL, independently justify low impact, create one linked pending plan before archive |
| Material failure | Same caption case but save can lose data, or security findings contain an unresolved critical issue | Block conditional closure and retain the reproducible failure |

Record semantic judgments against seven axes: source promise preservation, owner authority/scope, observable acceptance, repository evidence/reuse, executable vertical phases, proportional failure/recovery, and honest delivery/followup. For each use `pass`, `fail` or `unverifiable`, cite exact source and artifact locations, and name the reviewer. A missing observation is `unverifiable`, never a silent pass. Reviewer must be independent of the artifact author; do not accept the generating model's self-score.

Collect mechanical facts for each actual run:

```sh
node scripts/testing/sdd-delivery-evals.js <isolated-project> <feature-slug> > facts.json
```

The report includes artifact hashes and explicitly requires semantic review. Store the reviewer judgments beside it, naming those hashes, model/settings, source repository commit, input prompt, owner answers, duration and token usage when available. Compare per-case changes and regressions, not only aggregate scores. Promote a prompt change only after reviewing each new failure and each claimed improvement. No external model evaluation is implied by the deterministic suite.
