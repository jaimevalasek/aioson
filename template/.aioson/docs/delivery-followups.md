---
description: Authorized minor delivery followups, honest QA verdicts and durable Simple Plan closure
load_tier: trigger
agents: [qa, dev]
task_types: [feature-close, delivery-followups]
triggers: [accepted_with_followups, closure-policy, minor delivery followups]
---

# Delivery with minor followups

The default remains independent QA PASS followed by explicit close. An owner can authorize a persistent policy once:

```sh
aioson feature:closure . --enable --auto --allow-secondary --by="owner"
```

This writes `.aioson/closure-policy.json` (schema version 1). `enabled` permits conditional acceptance; `auto_close` permits workflow closure after final QA; `allow_secondary_ac_deferral` permits explicit secondary AC failures. Omit `--auto` for manual closure and omit `--allow-secondary` to require PASS on every AC. `--disable --by="owner"` disables the policy. QA cannot grant itself authorization. Ordinary `--auto` alone does not enable this policy. `--step` suppresses automatic closure for that activation. Existing features are never swept or silently migrated.

## Eligibility

All normal implementation, runtime, technical, security and product gates still apply. Only 1–5 independently verified low-impact findings are eligible: cosmetic, wording, documentation or a noncritical defect. Each finding must fit a Simple Plan: at most five behavior files, eight paths including tests, and two module prefixes. Unknown impact, unverified behavior, failed primary flow, data loss, security exposure or availability risk remains blocked. A missing verification is not a minor defect.

Each nondeferred AC needs concrete PASS evidence. Deferring a secondary AC also requires policy authorization and its concrete FAIL row in the QA report. Every required capability still needs a verified PASS behavior. Preserve the original expected and observed behavior; never relabel a failed test PASS or remove an AC to pass Gate D. Failed technical suites or runtime gates must be corrected before closure. Specialist security findings remain authoritative.

## QA preparation

Write the normal `qa-report-{slug}.md`, including independent production-path smoke, commands and CAP/AC evidence. Set `verdict: accepted_with_followups` only for the eligible case. Save a project-relative review JSON, for example `.aioson/context/features/{slug}/closure-input.json`:

```json
{
  "schema_version": 1,
  "findings": [{
    "id": "result-caption",
    "severity": "low",
    "kind": "wording",
    "verified": true,
    "risk": { "primary_flow": false, "data_loss": false, "security": false, "availability": false },
    "summary": "Correct the saved-result caption",
    "reproduction": "Save a valid value and inspect the displayed caption.",
    "expected": "The caption uses the approved terminology.",
    "observed": "The correct value is saved but the caption uses legacy terminology.",
    "verification": "node --test tests/result.test.js; inspect the saved-result caption",
    "rationale": "Save and reload work; the caption remains understandable.",
    "files": ["src/result.js", "tests/result.test.js"],
    "ac_ids": ["AC-demo-caption"]
  }]
}
```

Consolidate related observations into one coherent correction before preparing the review; its `ac_ids` may contain several criteria. Do not split an oversized correction into artificial small findings. Use actual inspected paths and existing AC IDs. Use an empty `ac_ids` array for a minor finding outside the AC promises when all ACs pass. Each risk field must be explicitly false based on QA evidence. A CLI shape check cannot substitute for independent judgment.

```sh
aioson feature:closure . --feature={slug} --prepare=.aioson/context/features/{slug}/closure-input.json --json
aioson gate:check . --feature={slug} --gate=D
aioson gate:approve . --feature={slug} --gate=D
aioson workflow:next . --expect-feature={slug} --complete=qa
```

Preparation binds the PRD, plan, QA, policy, declared implementation paths and dependency manifests by content hash. Changed evidence invalidates the decision; independently recheck before preparing again. This covers declared files, not arbitrary unlisted repository changes. Keep Implementation Delta complete. The JSON verdict remains `PASS|BLOCKED` for gate compatibility, with `disposition: accepted_with_followups` for the conditional case. Gate approval preserves the QA report bytes and FAIL rows.

Without automatic closure, use:

```sh
aioson feature:close . --feature={slug} --verdict=ACCEPTED_WITH_FOLLOWUPS
```

Conditional acceptance never uses `--force`. A PASS close cannot overwrite a conditional QA verdict. Followup plans and the bound closure record are persisted before index/workflow changes and archiving. If persistence fails, the feature stays open. Repeated persistence reuses the same finding-derived paths and refuses conflicting content. An interrupted archive reports its recovery command, `aioson feature:archive . --feature={slug}`.

## Finding the deferred work

```sh
aioson feature:closure . --list --json
aioson feature:closure . --list --include-resolved --json
aioson workflow:status .
```

Plans remain at `.aioson/context/simple-plans/{feature}-followup-{finding}.md` with `status: pending`, source feature, finding and content hash. The archive contains `done/{feature}/closure-review.json` with the evidence and plan links. Route a selected plan directly to Dev through the normal Simple Plan lane; verify its acceptance before setting `status: done`. An owner may explicitly dismiss obsolete work with a recorded reason and `status: dismissed`. Closure never deletes pending plans or authorizes publishing.
