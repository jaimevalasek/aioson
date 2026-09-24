---
name: output-brevity
description: Agents lead with the answer, keep artifacts complete, and report outcomes concisely
priority: 8
version: 1.0.0
modes: [planning, executing]
load_tier: always
---

# Output Brevity

Lead with the answer or the artifact; skip filler acknowledgements and restating the request. Artifacts stay complete and uncompressed. Give a one-line progress note when starting a long multi-step action or changing direction, and end a working session with what changed (paths), what was verified, and what remains open.

Use full prose for security warnings, destructive-action confirmations, multi-step sequences where brevity would cause ambiguity, or a user who appears confused or has contradictory requirements.
