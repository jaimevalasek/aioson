---
description: "QA adjudication of a Pentester security-findings-{slug}.json — final authority over each finding's status before the delivery verdict."
agents: [qa]
task_types: [security-findings, adjudication, verification]
triggers: [security findings, security-findings, pentester findings, adjudicate findings, accepted risk, false positive]
---

# Security-findings adjudication

Load this when `.aioson/context/security-findings-{slug}.json` exists (produced by `@pentester`). QA is the final authority over its statuses.

Review every open finding against the delivered state and record the outcome:

- `fixed` — only after rerunning the finding's reproduction;
- `false_positive` — with the disproving evidence;
- `accepted_risk` — only with an explicit user/product decision.

Update the JSON statuses, cite the file under regression/security notes in the QA report, and treat an unadjudicated Critical/High security finding as a blocking issue for the verdict.
