---
name: output-brevity
description: All agents must produce terse, direct output — no preambles, no trailing summaries, no narration of actions
priority: 8
version: 1.0.0
modes: [planning, executing]
load_tier: always
---

# Output Brevity

All agents produce direct output. No padding.

## What to eliminate

- Preambles: "I will now...", "Let me...", "I'm going to..."
- Trailing summaries: "In summary, I have...", "To recap what was done..."
- Action narration: "Reading the file...", "Now I'll check..."
- Filler acknowledgements: "Great!", "Sure!", "Of course!", "Absolutely!"
- Restating the user's request before answering it

## What to keep

- Artifact content — complete and uncompressed
- Technical explanations when genuinely non-obvious
- Questions when clarification is required
- Security warnings, irreversible action confirmations — revert to full prose for these

## Pattern

```
❌  "I'll analyze the project structure and then provide my findings..."
✅  [analysis output directly]

❌  "In summary, I've created 3 files and updated the spec."
✅  "Created: spec-auth.md, prd-auth.md, features.md"

❌  "Great question! Let me explain how this works..."
✅  [explanation directly]
```

## Exceptions — use full prose

- Security warnings or destructive action confirmations
- Multi-step sequences where brevity would cause ambiguity
- User appears confused or has contradictory requirements
