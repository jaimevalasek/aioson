# Harness Sensors — Optional Post-Action Feedback

Load only when the approved implementation plan deliberately includes a harness contract. Classification, a prototype, or ordinary runtime behavior never creates this requirement.

Sensors are advisory feedback after an action. They do not create workflow gates or extra feature documents.

## Sensors

### Rule compliance

Use the rules selected for the changed paths and report a concrete violation with its file and impact. Never reread every project rule by default.

### PRD/plan drift

Compare the active PRD `CAP-*`/`AC-*` with the implementation plan and completed harness steps. Report only missing or contradictory mappings. Put a compact finding in the dossier or QA report; never create a spec file.

### Harness contract integrity

When a planned `harness-contract.json` exists, verify that its binary criteria exercise distinct real boundaries and that runtime behavior includes a real production-path criterion. A repeated command is not independent evidence.

### QA evidence

QA still owns the delivery verdict from PRD + plan + implementation + focused tests + normal-entry smoke. Harness output is supporting evidence, not a substitute for shipped behavior.

### Context budget

If context becomes noisy, compact around the PRD, current plan phase, selected project knowledge, changed paths, and concrete evidence. Do not create another summary artifact merely to reduce context.

The harness remains optional and bounded by the plan. A failing planned harness criterion may block that planned phase; absence of a harness never blocks the normal Product → Planner → Dev → QA route.
