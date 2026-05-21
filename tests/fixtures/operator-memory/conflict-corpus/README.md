# Conflict corpus — operator-memory Phase 4 (AC-P4-07)

10 conflict pairs (rule + decision that SHOULD conflict) and 15 non-conflict
pairs (rule + decision that share some keywords but address different concerns).

Fixture structure (each pair lives in `pair-{NN}/`):

```
pair-01-conflict/
  rule.md           ← project rule (with conflicts_with_signal_types opt-in)
  decision.md       ← operator decision that should be flagged

pair-11-no-conflict/
  rule.md
  decision.md       ← should NOT be flagged (different concern)
```

The corpus is consumed by `tests/operator-memory-conflict.test.js`. False
positive rate target: ≤ 20%. False negative rate target: 0%.
