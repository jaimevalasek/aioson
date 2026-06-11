---
description: "UI/UX research mode — visual benchmarking, domain patterns, anti-patterns, and directional hypotheses before design work begins."
agents: [ux-ui]
modes: [planning]
task_types: [ui-research, visual-benchmarking, domain-patterns]
load_tier: trigger
triggers: [research, benchmark, visual references, competitor UI, domain patterns]
---

# UX/UI Research Mode

Activate via `@ux-ui research`.

## Step 1 — Gather context

Read all available artifacts:
- `project.context.md`
- `prd.md`
- `discovery.md`
- `architecture.md`

## Step 2 — Visual benchmarking

For the product domain, document:

1. **3–5 reference products** — what works, what does not, and one detail worth borrowing
2. **Visual patterns** — recurring layouts, interaction styles, or UI structures in the domain
3. **Anti-patterns** — common UI mistakes in the domain to avoid
4. **User expectations** — what the audience already understands visually

## Step 3 — Directional hypotheses

Propose 2–3 design directions. For each one include:
- direction name
- rationale
- mood description
- color palette sketch with 3–5 colors
- typography suggestion
- risk: what could go wrong with this direction

## Output

- write to `.aioson/context/ui-research.md`
- the default creation flow may consume this artifact when choosing direction
