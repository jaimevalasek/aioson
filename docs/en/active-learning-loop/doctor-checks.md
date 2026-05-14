# Doctor checks — memory curation

> The three new checks appear in `aioson doctor .` with `severity='warning'`. Warnings do not affect `ok=true` — the project keeps working. But each one represents a curation gap that, if ignored, makes project memory less useful over time.

---

## How the checks appear

```bash
aioson doctor .
```

When everything is healthy:

```
[OK] living-memory:rule_staleness
[OK] living-memory:learning_orphans
[OK] living-memory:distillation_lag
```

When there are gaps:

```
[WARN] living-memory:rule_staleness (2 stale rules)
  ...
[WARN] living-memory:learning_orphans (1 orphan)
  ...
[WARN] living-memory:distillation_lag
  ...
```

All three checks only run on projects with **SMALL** or **MEDIUM** classification. MICRO projects opt out automatically — none of the three will appear.

---

## `living-memory:rule_staleness`

**What it detects:** rules (files in `.aioson/rules/`) with zero `rule_loaded` events in the last N closed features.

**Why it matters:** if no agent loaded a rule in the last N features, it has likely lost relevance — the project context changed, the rule was superseded, or it was simply never used. Stale rules occupy space in agents' context windows without adding value.

**How N is calculated:**

```
N = max(5, ceil(average days between last 5 features / 7))
```

Projects with frequent features (1 per week) get N = 5. Projects with a slower pace (1 per month) get a larger N — the window expands to cover the same real period of time.

`staleness_window_features_min: 5` in `learning-loop.json` defines the floor.

**Typical output:**

```
[WARN] living-memory:rule_staleness (2 stale rules)
  Rule 'legacy-session-cookies' has 0 rule_loaded events in last 7 features.
  Rule 'old-rate-limit-policy' has 0 rule_loaded events in last 7 features.
  Hint:
    aioson memory:archive --id=rule:legacy-session-cookies --reason="<reason>"
    aioson memory:archive --id=rule:old-rate-limit-policy --reason="<reason>"
```

**How to act:**

1. Check if the rule is still relevant to the current project.
2. If not: use the doctor's hint to archive it.
3. If still relevant but not being loaded: add `context:load` to the agents that should use it.
4. If unsure: archive with `--dry-run` to see the impact before executing.

**False positive:** the check only works when agents are using `aioson context:load` to declare loads. If your custom agents don't do this, the check will report everything as stale. Solution: add `aioson context:load` to the beginning of sessions.

---

## `living-memory:learning_orphans`

**What it detects:** learnings with `status='promoted'` whose target rule had no `rule_loaded` events after the promotion date.

**Why it matters:** when a learning is promoted, it generated (or should have generated) a rule. If that rule was never loaded by any agent since the promotion, it means one of two things: either the rule was never actually created (a failure in the promotion flow), or it was created but agents aren't consulting it. Either way, it's a gap.

**Typical output:**

```
[WARN] living-memory:learning_orphans (1 orphan)
  Learning 'jwt-expiry-pattern' (promoted 2026-04-10) — target rule had no
  rule_loaded events after promotion date.
  Hint:
    aioson memory:archive --id=learning:jwt-expiry-pattern --reason="<reason>"
```

**How to act:**

1. Check if the corresponding rule exists in `.aioson/rules/`.
2. If the rule doesn't exist: the learning was promoted but never materialized a rule — create the rule manually or archive the learning.
3. If the rule exists but was never loaded: add `context:load` where appropriate, or archive the rule if it's no longer relevant.
4. If the learning was promoted by mistake: archive it.

---

## `living-memory:distillation_lag`

**What it detects:** projects where the number of closed features significantly exceeds the number of `auto_distillation` events recorded in `evolution_log`. Threshold: 5+ features closed with fewer distillations than closures.

**Why it matters:** if `feature:close` is being called but distillation isn't running, the loop is silently broken. Learnings are accumulating without distillation. It may be that `--no-distill` is being used consistently, that the hook is failing silently, or that the project migrated to the framework after closing several features.

**Typical output:**

```
[WARN] living-memory:distillation_lag
  8 features closed, 5 auto_distillation events recorded.
  Hint: check if distillation is failing silently:
    sqlite3 .aioson/runtime/aios.sqlite \
      "SELECT feature_slug, payload_json FROM evolution_log \
       WHERE event_type='distillation_failed' ORDER BY start_at DESC LIMIT 5;"
  Or run distillation manually on recent features.
```

**How to act:**

1. Run the SQLite command from the hint to see if there are recorded silent failures.
2. If there are `distillation_failed` entries: check `payload_json.error_phase` to understand where it's failing and consult [Troubleshooting](./troubleshooting.md).
3. If there are no failures but there is lag: features were probably closed with `--no-distill` or before the hook existed. The lag will decrease naturally as new features are closed.
4. If the project is new to the framework but had old features: the lag is expected and will resolve itself.

---

## Quick summary

| Check | Problematic signal | Immediate action |
|---|---|---|
| `rule_staleness` | Rule with no `rule_loaded` in N features | Check relevance → archive or add `context:load` |
| `learning_orphans` | Promoted learning, rule never loaded | Check if rule exists → create, archive learning, or add `context:load` |
| `distillation_lag` | More features closed than distillations | Inspect `distillation_failed` in `evolution_log` |

---

## About `warning` severity

The three checks have `severity='warning'`, not `severity='error'`. This means:

- `report.ok` remains `true` even with warnings.
- `report.failedCount` includes warnings.
- There is no automatic `doctor --fix` for these checks — the actions are semantic and require human judgment.
- The hint for each check includes the exact command to run when you decide to act.

---

## Continue reading

- [How to use](./how-to-use.md) — examples of archive and restore
- [CLI reference](./cli-commands.md) — flags for `memory:archive` and `memory:restore`
- [Troubleshooting](./troubleshooting.md) — stuck lock, distillation failures
