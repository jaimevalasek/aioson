---
slug: wave-usage-breakdown
status: done
owner: dev
created_at: 2026-09-13
source: direct-user-request
---

# Expand wave consumption by role and model

## Scope
Expand each existing wave row to compare recorded backend/frontend DEV and QA consumption by actual model.

## Context selected
Valid project context; context:brief wave-breakdown-brief.json; Simple Plan and visual implementation rules. Existing execution-metrics aggregation, dashboard usage table, DOM textContent and headless Edge tests are the implementation authority. Preserve unrelated execution-roles-onboarding workflow and active execution/Play processes.

## Implementation intelligence
Reuse summarizeAttempts and aggregateUsage in the read-only metrics boundary, existing semantic table and keyboard-operable button in the browser. Infer lane from the unit when historical attempts lack it. Preserve expanded waves and focus across polling. No dependency or pricing-policy change.

## Useful options considered
- Include now: role/model detail, wave model ranking, missing/partial labels, cache not double counted, responsive detail and refresh persistence.
- Defer: exports, charts, billing integration and additional filters.

## Expected files
- behavior: src/agent-execution/execution-metrics.js
- behavior: src/execution-dashboard/public/app.js
- behavior: src/execution-dashboard/public/style.css
- support: tests/execution-metrics.test.js
- support: tests/execution-monitor.test.js
- support: docs/execution-monitor.md
- support: this plan and dev-state.md

## Done criteria and verification
Every measured wave expands into lane/stage/model usage with actual attempts, time, input/cache/output and cost; highest recorded model consumption is visible. Unknown usage is not zero or a ranking winner. Sum of detail groups reconciles with wave totals. Expansion survives refresh and stays isolated by feature/run. Run metrics and monitor tests with isolated browser enabled; targeted lint and live dashboard smoke. Restart only the verified dashboard on 57510 to serve new assets.

## Session state
Completed: wave rows expand by lane/stage/actual model, preserve expansion and keyboard focus during polling, and rank recorded model totals without double counting cache.

## Verification results
- 19 focused tests passed, none failed or skipped; includes keyboard expansion, refresh persistence, mobile containment and aggregation reconciliation with missing usage/fallbacks.
- Targeted lint: four JavaScript/test files, zero findings.
- Live port 57510 smoke passed: wave 5 shows Backend/Frontend DEV and QA, Muse/Sol/Astra, highest recorded consumer, cache/time/cost, polling persistence and keyboard collapse. Desktop/mobile screenshots and JSON evidence: `.aioson/runtime/quality/orchestration-analysis/wave-breakdown-*`.
- Only dashboard PID 29488 was replaced by 27752 to refresh code/assets. Engine 30292 and Play sessions were preserved. Backend-assets progressed from DEV to QA during verification; no orchestration state was changed by this feature.
