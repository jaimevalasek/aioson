# Multi-Agent Patterns for MEDIUM Projects

> Load only when a MEDIUM project benefits from parallel execution. MEDIUM changes depth and evidence, not the canonical agent chain.

## Pattern: Planner / Generator / Evaluator (PGE)

| Role | AIOSON agents | Durable output |
|---|---|---|
| Product authority | `@product` followed by mandatory independent `@sheldon` review | One implementation-ready, hash-bound reviewed PRD |
| Delivery planner | `@planner` | One vertical implementation plan |
| Generator | `@dev` | Working code and stack-native tests |
| Evaluator | `@qa` | One QA report with production-path evidence |

```text
PRD → implementation plan → working software → QA verdict
 ↑                                      |
 └──────────── concrete findings ───────┘
```

Parallel workers may implement independent approved plan phases, but they do not generate competing specs. Findings route to the owner of the decision:

1. Implementation defect → `@dev`.
2. Missing or contradictory observable outcome → `@sheldon`, editing the same PRD.
3. Invalid sequencing/path choice → `@planner`, editing the same plan.
4. A named architecture, UX, security, or test-engineering question → invoke that specialist once, then fold the decision into PRD or plan.

Cross-role communication uses the PRD, plan, code, and QA report on disk. MICRO work and bounded fixes use Simple Plan directly.
