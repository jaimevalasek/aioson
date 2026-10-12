---
description: "Performance method — who owns speed work, how to find a hotspot, measure it with repeated samples (quality:bench), prove a change with a replayed baseline and pin the win with a work-count regression test."
task_types: [quality, analysis]
triggers: [performance, slow, faster, latency, throughput, benchmark, hotspot, speed up, desempenho, lento, lenta, lentidão, velocidade, mais rápido]
agents: [quality, qa, tester, dev, planner]
---

# Performance: measure, change, prove

Speed work has one owner and a fixed order. A claim of "slow" or "faster" without numbers is a guess, and a single timed run is noise.

| Who | Does |
|---|---|
| `@quality` | finds and measures the hotspot, proves or refutes the speed-up |
| `@planner` | decides structural changes (indexes, caching, pagination, background jobs, schema) — they touch contracts |
| `@dev` | implements the change |
| `@tester` | pins the win with a work-count regression test |
| `@qa` | accepts the delivery |

`@pentester` covers resource exhaustion only when an abuse path drives it (`A06`, `API4`, `LLM10`); plain slowness is not a security finding.

## 1. Find the hotspot

Candidates come from the code-health performance facet (N+1 queries, unbounded queries, synchronous I/O in the request cycle, repeated work in loops, missing indexes, O(n²) on growing collections) and from runtime signals (`qa:run` page timings, slow-query logs, profiler output). A candidate stays a hypothesis until measured.

## 2. Measure with repeated samples

```bash
aioson quality:bench . --argv='["node","bench/orders-list.cjs"]' --label=orders-list --samples=10 --warmup=2
```

- Fixed workload: the harness builds its own data at a fixed size, locally. Never time production or third-party endpoints.
- `--metric=wall` (default) times the whole process, start-up included. `--metric=reported` reads `{"duration_ms": <n>}` from the harness's last stdout line, so only the hot path is timed.
- `noise_pct` above 10 means an unstable machine or workload: remove the noise or add samples before trusting any delta.
- A failing command is an `error`, never a timing. Raw samples stay in `.aioson/runtime/quality/bench/<run>/result.json`.

## 3. Change, then replay the baseline

```bash
aioson quality:bench . --baseline=.aioson/runtime/quality/bench/<run>/result.json
```

The replay re-runs the recorded argv, sample count and metric — the same workload by construction. Verdicts: `faster` / `slower` only when the 95% bootstrap interval of the median change excludes zero and the change reaches `--min-effect` (default 5%); otherwise `inconclusive`. Another machine or Node version gives `not_comparable`. Only `faster` supports a speed-up claim; report `inconclusive` as inconclusive.

## 4. Pin the win

The regression test asserts work — query count, external calls, rows scanned, iterations — never wall-clock time, which flakes across machines. Timing evidence lives in the bench results, not in the suite.

## Report

Record in `quality-review-{target}.md`: the hotspot and why, the harness argv, both result paths, the delta and its interval, the verdict, and the pinned test. `@quality` recommends the owner of each change; it does not apply it.
