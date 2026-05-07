# AIOSON Brains — Procedural Memory System

> Inspired by: A-MEM (Zettelkasten networks), MemRL (quality-scored pattern extraction), Letta (OS-tiered loading), and retrieval-as-tool (agents call memory explicitly, not pre-injected).

## What is this?

Brains are **quality-scored pattern memory** — not event logs, not session history.  
Each brain node answers: *"I've seen this before. Here's what works, what to avoid, and why."*

Unlike RAG (retrieve-and-prepend), agents load only what's relevant, when it's relevant.

## Loading strategy (tiered — OS-inspired)

| Layer | File | When loaded | Token cost |
|-------|------|-------------|------------|
| Index | `_index.json` | Always, on activation | ~2KB |
| Brain file | `agent/domain.brain.json` | Only when tags match the task | ~8–20KB |
| Node detail | inside brain file | Read selectively by ID | negligible |

**Rule:** Load `_index.json` first. If task tags match a brain's tag list, load that brain file. Use `query.js` for cross-referencing across multiple brains.

## Brain node schema

```json
{
  "id": "css-001",
  "title": "Short name",
  "tags": ["css", "hover", "animation"],
  "q": 5,
  "v": "EXCELLENT",
  "s": "One-line summary of the pattern and why it works.",
  "p": "code snippet or pseudocode",
  "src": "source site or context",
  "date": "YYYY-MM-DD",
  "not": "what NOT to use instead — the anti-pattern this replaces",
  "warn": "gotcha or edge case to watch out for",
  "see": ["css-002", "css-007"]
}
```

### Verdict values

| Verdict | Meaning |
|---------|---------|
| `EXCELLENT` | Best-in-class — use by default |
| `GOOD` | Solid choice — use when EXCELLENT variant isn't applicable |
| `BEST_PRACTICE` | Mandatory baseline — always include |
| `AVOID` | Anti-pattern — explicitly do NOT use this |
| `BROKEN` | Known broken in current context |

### Quality score (q)

| Score | Meaning |
|-------|---------|
| 5 | Verified excellent — used in production, great result |
| 4 | Verified good — used, worked well |
| 3 | Theoretical — not yet validated in a real project |
| 2 | Mixed results — use with caution |
| 1 | Avoid — kept only for anti-pattern documentation |

## Agent integration

In your agent file, add a **Brain** section:

```markdown
## Brain (procedural memory)

1. Load `.aioson/brains/_index.json` on activation.
2. Identify relevant tags from the current task.
3. Load matching brain files (from index `path` field).
4. For patterns with q ≥ 4: apply as default approach.
5. For nodes with v === "AVOID": never implement what's in `not` field.
6. Use `see[]` to traverse linked nodes.

Cross-reference query:
  node .aioson/brains/scripts/query.js --tags <tags> --min-quality 4 --format compact

After completing a project, record new learnings:
  - Add nodes to the appropriate brain file
  - Rate quality honestly (1-5)
  - Update `_index.json` nodes count and updated date
  - Add `see[]` links to related nodes (Zettelkasten web)
```

## Query script

```bash
# All EXCELLENT patterns about CSS animation
node .aioson/brains/scripts/query.js --tags css,animation --verdict EXCELLENT --format compact

# All anti-patterns (to know what NOT to do)
node .aioson/brains/scripts/query.js --avoid --format compact

# Best practices for site-forge cloning
node .aioson/brains/scripts/query.js --agent site-forge --min-quality 4 --format compact

# Get specific nodes by ID
node .aioson/brains/scripts/query.js --id css-001,css-007,js-001

# All patterns that match ALL these tags (AND)
node .aioson/brains/scripts/query.js --tags css,hover,no-js --match all
```

## File structure

```
.aioson/brains/
├── README.md                              # This file
├── _index.json                            # Master index (always loaded, ~2KB)
├── scripts/
│   └── query.js                           # Cross-reference query script
├── dev/
│   └── patterns.brain.json                # Implementation patterns for @dev (5 nodes)
├── sheldon/
│   └── architecture-decisions.brain.json  # Architecture decisions for @sheldon (5 nodes)
└── site-forge/
    └── visual-patterns.brain.json         # CSS/animation/interaction patterns (14 nodes)
```

## Adding a new brain

1. Create `agentname/domain.brain.json` following the node schema above
2. Add an entry to `_index.json` with relevant tags, agent name, and path
3. Annotate agents that should load it with the relevant tags in their Brain section

## Design philosophy

- **Procedural, not episodic** — "what works" not "what happened"
- **Explicit anti-patterns** — `not` and `v:AVOID` nodes prevent regressions
- **Zettelkasten web** — `see[]` links create traversable knowledge graphs
- **Token-efficient** — index is tiny; brain files are loaded only when needed
- **Agent-directed** — agents decide what to load, not an auto-injection system
