# `@forge-run` — opt-in compiled execution

`@forge-run` is a specialist for projects that deliberately maintain an executable harness contract and Wave-marked plan. It compiles those optional artifacts into a reviewable workflow script and runs that script through the supported runtime.

It is not a canonical feature stage and classification never invokes it automatically.

## Relationship to the canonical workflow

The normal route remains:

```text
Product → optional Sheldon → Planner → DEV → QA
```

Generic `development_lanes` are the supported way for DEV to use different host/model combinations for bounded implementation scopes. Those lanes run sequentially in the shared worktree and return to DEV for final integration.

`@forge-run` is different: it is an explicit compiled-harness path for a feature that already opted into its additional artifacts. It does not replace Product, Planner, DEV, or QA.

## Use it only when

- the user explicitly requests compiled execution;
- a valid `harness-contract.json` exists with executable verification;
- the approved implementation plan contains conservative, file-disjoint Wave markers;
- the cost and execution surface have been reviewed;
- the runtime adapter required by the compiled workflow is available.

MICRO, SMALL, and MEDIUM are all classification labels, not activation switches. In practice this specialist is useful only when the optional harness surface justifies its cost.

## Behavior

The agent:

1. runs the command's hard preflights;
2. compiles `.aioson/plans/{slug}/forge-run.workflow.js`;
3. shows the user the execution and cost surface;
4. runs only after the required approval;
5. reports deterministic checks and residual findings;
6. returns implementation defects to DEV and leaves the final canonical verdict to QA.

It never hand-emulates an unavailable runtime. Missing host/model/capability pauses the run. Fallback must be explicit; the current client is never a silent substitute.

It also never runs `feature:close`, commit, publish, deploy, or release without explicit authorization.

## Optional validator

Validator remains disabled by default. A compiled workflow may use it only when the feature manifest explicitly enables it and the configured trigger applies. The feature's classification is not sufficient.

## See also

- [Executable verification](../5-reference/executable-verification.md)
- [Agent execution and development lanes](../5-reference/agent-execution.md)
- [Autopilot handoff](../5-reference/autopilot-handoff.md)
