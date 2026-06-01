# Skill: Harness-Driven Validation

> **Use:** Implementation and contract validation (Nautilus pattern).
> **Agents:** @dev, @validator.
> **Context:** MEDIUM projects or projects with an existing `harness-contract.json`.

## Mission
Ensure the implementer cycle (@dev) closes with impartial validator review (@validator) before any delivery is considered complete.

## @dev Workflow (Harness-Aware)

### 1. Task Start
Before writing the first file of a feature, check whether the Harness is initialized:

```bash
aioson harness:init . --slug=<feature-slug>
```

This creates the contract stub at `.aioson/plans/<slug>/harness-contract.json`.

### 2. Implementation with Feedback
Whenever you complete a logical slice, such as a migration, service, or route, run validation:

```bash
aioson harness:validate . --slug=<feature-slug>
```

The system invokes `@validator` in a separate process. The result is injected into `progress.json`.

### 3. Failure Recovery (Circuit Breaker)
If validation fails:

- Read the `last_error` field in `progress.json`.
- Fix only the point indicated by the error.
- Re-validate immediately.
- **Warning:** If validation fails repeatedly according to `error_streak_limit`, the system opens the circuit (`OPEN`) and you may not continue without explicit user intervention.

## Done Gate
`@dev` must not manually mark the feature as `done` in `features.md`. The gateway blocks that change when:

1. A `harness-contract.json` exists.
2. `progress.json` does not have `ready_for_done_gate: true`.

## Best Practices

- **Atomic commits:** Commit after each successful `harness:validate`.
- **Binary contracts:** Prefer criteria that can be validated mechanically, such as files, signatures, and tests.
- **Context isolation:** Never try to explain your code to `@validator` through comments. The validator must judge only the final file and the contract.

---

## References

- [Doc] Nautilus & PBQ pattern - `.aioson/docs/integrations/harness-engineering.md`
- [CLI] `harness:init` and `harness:validate` commands - `/help`
