# Multi-Agent Patterns for MEDIUM Projects

> Load when orchestrating a MEDIUM project with 3+ features or 5+ phases.

## Pattern: Planner / Generator / Evaluator (PGE)

### Roles

| Role | AIOSON Agents | Responsibility |
|------|--------------|----------------|
| Planner | @product → @sheldon → @analyst → @architect | Produce spec pack: PRD + requirements + architecture + implementation plan |
| Generator | @dev, @deyvin | Implement against the spec pack, one phase at a time |
| Evaluator | @qa, @tester | Verify implementation against spec, report findings |

### Feedback loops

```
Planner ──spec-pack──→ Generator ──code──→ Evaluator
    ^                                          |
    └──────── findings + drift report ─────────┘
```

When Evaluator finds issues:
1. **Minor (Low/Medium findings):** Generator fixes in next phase
2. **Major (Critical/High findings):** Generator stops, Evaluator reports to user
3. **Spec drift detected:** Route back to Planner (@analyst or @sheldon) for spec update
4. **Architecture issue:** Route to @architect for design revision

### Session isolation

Each role should run from a compact operational handoff:
- Planner sessions: produce artifacts, then /compact for same-feature continuation
- Generator sessions: read spec pack + implement, then /compact for same-feature continuation
- Evaluator sessions: read code + spec + verify, then /compact for same-feature continuation
- Use /clear only for a hard reset, feature switch, polluted context, or security-sensitive reset

Cross-role communication happens through artifacts on disk, not conversation history.

### When NOT to use PGE

- MICRO projects: skip Planner (except @product), go direct to Generator
- SMALL projects: compressed PGE — Planner is 1-2 sessions, not 4
- Bug fixes: Generator only, Evaluator optional
- Exploration: not PGE at all — use @deyvin in pair mode
