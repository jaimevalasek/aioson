# Task: Squad Learning Review

> Periodic review of accumulated squad learnings.

## When to use
- `@squad learning review <slug>` — manual review
- Automatically when learnings > 15 (consolidation needed)
- Periodically suggested by @orquestrador after 10+ sessions

## Process

### Step 1 — Inventory
List all active learnings in `learnings/index.md`.

### Step 2 — Consolidation
Identify redundant learnings and consolidate:
- Two learnings saying the same thing → merge into one with combined evidence
- Keep reference to originals in the consolidated learning

### Step 3 — Promotion
Identify candidates for promotion (rules or skills):
- Quality learnings with frequency >= 3 → candidate for rule
- Domain learnings totaling >= 7 for same domain → candidate for domain skill
- Process learnings confirmed across 3+ sessions → candidate for rule

### Step 4 — Archive
Move stale learnings to `learnings/archive/`:
- Learnings not reinforced in 90+ days
- Learnings contradicted by newer learnings
- Learnings that were promoted (keep original as historical record)

### Step 5 — Report
Present summary:
- Learnings active: N
- Consolidated: M
- Promoted: P
- Archived: A

## CLI support
- `aioson squad:learning . --sub=list --squad=<slug>` — list active learnings
- `aioson squad:learning . --sub=stats --squad=<slug>` — statistics by type and status
- `aioson squad:learning . --sub=archive --squad=<slug>` — archive stale learnings
- `aioson squad:learning . --sub=promote --squad=<slug> --id=<id>` — promote learning to rule
- `aioson squad:learning . --sub=export --squad=<slug>` — export learnings as JSON
