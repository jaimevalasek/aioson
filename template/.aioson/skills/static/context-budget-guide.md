# Context Budget Guide

> Load when you need to measure or manage context window usage.

## Quick measurement heuristic

Since agents cannot directly measure token count, use file-count proxy:

| Files read | Estimated budget | Action |
|------------|-----------------|--------|
| 1-3 | Light (< 20%) | Proceed normally |
| 4-6 | Moderate (20-40%) | Be selective about additional reads |
| 7-9 | Heavy (40-60%) | Stop reading, start producing |
| 10+ | Critical (> 60%) | Finish current step, recommend /compact; reserve /clear for hard reset |

## File size estimates

| File type | Typical tokens |
|-----------|---------------|
| `project.context.md` | 200-500 |
| `prd.md` / `prd-{slug}.md` | 500-1500 |
| `discovery.md` | 1000-3000 |
| `architecture.md` | 500-1500 |
| `spec-{slug}.md` | 300-800 |
| `implementation-plan-{slug}.md` | 800-2000 |
| `requirements-{slug}.md` | 500-1500 |
| Agent instruction file | 2000-5000 |
| Skill file + references | 500-2000 |
| Source code file | 200-1000 |

## Budget report format

At session end, estimate and write to `project-pulse.md`:

```
Context budget: {N} files read, ~{estimate}k tokens consumed, budget: {light|moderate|heavy|critical}
```

## Progressive disclosure strategy

When budget is moderate or higher:
1. Read file frontmatter/headers first, full content only if needed
2. Read `project-pulse.md` before any other file (30 lines = minimal cost)
3. Read `dev-state.md` or `spec-{slug}.md` frontmatter next (context_package tells you what else to load)
4. Load skills/references only when entering a phase that needs them
5. Never read all rules, all docs, all skills upfront — scan frontmatter and load selectively
