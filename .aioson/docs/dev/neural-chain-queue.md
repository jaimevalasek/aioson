---
description: "Neural Chain impact queue for Dev — claim, inspect, resolve or release the NC-* work items an activation lists, without widening scope."
agents: [dev]
task_types: [neural-chain, impact-queue]
triggers: [neural chain, impact queue, NC work item, chain:claim, chain:resolve, impact item]
---

# Neural Chain impact queue

Load this when the activation context lists `NC-*` work items (the `## Neural Chain impact queue` block the prompt carries).

1. Claim an open item with `aioson chain:claim . --id=<NC-id> --agent=<self> --json` before editing its target.
2. Inspect the originating change and relationship evidence. A work item requires investigation; it is not proof that code must change.
3. Implement the bounded correction or conclude `verified_no_change`, `false_positive`, or `obsolete` with concrete evidence.
4. Resolve it with `aioson chain:resolve` using the claim token and verification evidence. Release the claim when the current session cannot finish it.

Never modify an item claimed by another run. Neural Chain work does not widen product scope or authorize an optional specialist; DEV remains integration owner.
