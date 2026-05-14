# How to use the Active Learning Loop

> Concrete examples. Each section solves a real day-to-day need.

---

## 1. Search an existing learning

You want to know if the project already has a learning about authentication before creating a new rule:

```bash
aioson memory:search "authentication"
```

Typical output:

```
3 results for "authentication" (BM25)

[1] authn-refresh-token-ttl  (promoted)
    Refresh tokens must have a 7-day max TTL per decision in auth-flow feature.
    Evidence: 4 sessions

[2] jwt-audience-check  (for_review)
    Validate 'aud' claim on all endpoints. Found in 2 security-audit sessions.
    Evidence: 2 sessions

[3] oauth-state-param  (active)
    State parameter required in OAuth flow to prevent CSRF.
    Evidence: 3 sessions
```

Filter to promoted learnings only:

```bash
aioson memory:search "authentication" --surface=learnings --limit=10
```

Search rules as well:

```bash
aioson memory:search "authentication" --surface=all
```

Include archived entries (for historical audit):

```bash
aioson memory:search "authentication" --include-archived
```

JSON output (for scripts):

```bash
aioson memory:search "authentication" --json
```

```json
{
  "ok": true,
  "query": "authentication",
  "results": [
    {
      "id": "authn-refresh-token-ttl",
      "title": "authn-refresh-token-ttl",
      "status": "promoted",
      "score": -2.14,
      "snippet": "Refresh tokens must have a 7-day max TTL..."
    }
  ],
  "total": 3
}
```

**Note on search:** the query uses token-AND — each whitespace-separated word must appear in the document. `"JWT authentication"` finds documents containing both words, not necessarily the exact phrase. Operators like AND/OR/NOT are stripped — it's keyword search, not a query language.

---

## 2. Declare that an agent loaded a rule

When you (or an agent you're writing) loads a rule at the start of a session, declare it to the telemetry system:

```bash
aioson context:load --target=rule:authn-rules --agent=dev
```

Load multiple rules at once (recommended — minimizes overhead):

```bash
aioson context:load --target=rule:authn-rules --agent=dev --batch="jwt-patterns,oauth-state,session-management"
```

Associate with a feature in progress:

```bash
aioson context:load --target=brain:sheldon-005 --agent=sheldon --feature=authn-flow
```

The command is tier-1 silent — no output by default. Use `--verbose` to confirm:

```bash
aioson context:load --target=rule:authn-rules --agent=dev --verbose
# rule_loaded: authn-rules (agent: dev)
```

Use `--json` to integrate into scripts:

```bash
aioson context:load --target=rule:authn-rules --agent=dev --json
# {"ok":true,"event":"rule_loaded","target":"authn-rules","agent":"dev"}
```

---

## 3. What `feature:close` does now

The existing flow remains unchanged — distillation is added at the end:

```bash
aioson feature:close --slug=authn-flow --verdict=PASS
```

Expected output (in addition to normal feature:close output):

```
[existing] Gate validation: OK
[existing] Dossier finalized: .aioson/context/features/authn-flow/
[existing] features.md updated: authn-flow → PASS

ℹ [learning-loop] distillation: 2 promoted, 1 for review, 0 merge candidates
```

What happened behind the scenes:
1. Read the PRD classification — SMALL, so it proceeded.
2. Acquired the distillation lock in `evolution_log`.
3. Ran `learning:auto-promote --feature=authn-flow` — 2 learnings crossed the threshold and became rules.
4. 1 learning remained in `for_review` — not enough evidence yet.
5. Recorded the result in `evolution_log` and emitted the notify.

**Disable for one call:**

```bash
aioson feature:close --slug=authn-flow --verdict=PASS --no-distill
```

**MICRO project** — distillation is skipped automatically, no need for `--no-distill`:

```
[existing] Gate validation: OK
...
ℹ [learning-loop] skipped: MICRO classification
```

---

## 4. Archive a stale rule

The `doctor` reported staleness on the `legacy-session-cookies` rule. You want to archive it:

```bash
# Simulate first to see what would happen
aioson memory:archive --id=rule:legacy-session-cookies --reason="replaced by JWT-based auth (feature authn-flow)" --dry-run
```

Dry-run output:

```
[dry-run] would archive:
  source:  .aioson/rules/legacy-session-cookies.md
  dest:    .aioson/rules/_archived/2026-05-14/legacy-session-cookies.md
  reason:  replaced by JWT-based auth (feature authn-flow)
  evolution_log: 1 entry to close, 1 entry to insert
```

If the dry-run looks correct, execute:

```bash
aioson memory:archive --id=rule:legacy-session-cookies --reason="replaced by JWT-based auth (feature authn-flow)"
```

Output:

```
⚠ [memory-archive] archiving rule:legacy-session-cookies — legacy-session-cookies.md
archived: .aioson/rules/_archived/2026-05-14/legacy-session-cookies.md
```

Associate with a feature (optional but recommended for traceability):

```bash
aioson memory:archive --id=rule:legacy-session-cookies --reason="..." --feature=authn-flow
```

---

## 5. Archive a learning or brain

The same command works for all three types — `rule`, `learning`, and `brain`:

```bash
# Archive a learning
aioson memory:archive --id=learning:jwt-draft-1 --reason="superseded by promoted version in authn-flow"

# Archive a brain
aioson memory:archive --id=brain:sheldon-003 --reason="version 003 replaced by sheldon-006"
```

---

## 6. Restore an archived item

You archived the `rate-limiting-rules` rule but realized it's still needed:

```bash
aioson memory:restore --id=rule:rate-limiting-rules
```

Output:

```
⚠ [memory-restore] restoring rule:rate-limiting-rules
restored: .aioson/rules/rate-limiting-rules.md
```

With a reason (recommended for traceability):

```bash
aioson memory:restore --id=rule:rate-limiting-rules --reason="rule still needed — removal was premature"
```

Dry-run available too:

```bash
aioson memory:restore --id=rule:rate-limiting-rules --dry-run
```

---

## 7. Check loop health via doctor

```bash
aioson doctor .
```

When the loop is healthy:

```
[OK] living-memory:rule_staleness
[OK] living-memory:learning_orphans
[OK] living-memory:distillation_lag
```

When there are issues:

```
[WARN] living-memory:rule_staleness (2 stale rules)
  Rule 'legacy-session-cookies' has 0 rule_loaded events in last 7 features.
  Rule 'old-rate-limit-policy' has 0 rule_loaded events in last 7 features.
  Hint: consider archiving:
    aioson memory:archive --id=rule:legacy-session-cookies --reason="..."
    aioson memory:archive --id=rule:old-rate-limit-policy --reason="..."

[WARN] living-memory:learning_orphans (1 orphan)
  Learning 'jwt-expiry-pattern' was promoted but its target rule had no rule_loaded after promotion.
  Hint: aioson memory:archive --id=learning:jwt-expiry-pattern --reason="..."

[WARN] living-memory:distillation_lag
  8 features closed, 5 auto_distillation events recorded.
  Hint: Run `aioson feature:close --slug=<slug> --verdict=PASS` on pending features,
        or check if distillation is failing silently (see evolution_log).
```

See [Doctor checks](./doctor-checks.md) for what each check means and how to act.

---

## 8. Inspect `evolution_log` directly

For audit or troubleshooting, query the SQLite directly:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT target_type, target_id, event_type, start_at, end_at, reason
   FROM evolution_log
   ORDER BY start_at DESC
   LIMIT 10;"
```

Check for active distillation lock:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT feature_slug, start_at, payload_json
   FROM evolution_log
   WHERE event_type='auto_distillation' AND end_at IS NULL;"
```

History for a specific rule:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT event_type, start_at, end_at, reason, actor
   FROM evolution_log
   WHERE target_type='rule' AND target_id='authn-rules'
   ORDER BY start_at;"
```

---

## Continue reading

- [CLI reference](./cli-commands.md) — all flags documented
- [Doctor checks](./doctor-checks.md) — what the checks mean and how to act
- [Troubleshooting](./troubleshooting.md) — known issues
