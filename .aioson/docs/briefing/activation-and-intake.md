---
description: Briefing activation, source selection, evidence-first intake, continuation, and slug resolution
agents: [briefing]
task_types: [briefing-activation, briefing-intake, briefing-continuation]
triggers: [bare briefing activation, selected plans, conversational briefing, existing briefing]
---

# Briefing Activation and Intake

Load this module only to resolve the briefing mode, source, unresolved decisions, and slug. After resolution, switch to `exploration-and-artifacts.md`; do not retain unrelated branches.

## Registry and source routing

1. Inspect `.aioson/briefings/config.md` frontmatter.
   - A named slug routes to continuation.
   - An explicit new request bypasses existing-briefing choice.
   - Otherwise list slug, status, and creation date, then offer continue, create, or summarize.
   - Never overwrite an existing slug without explicit confirmation.
2. Run `aioson briefing:sources . --json` to list feature-owned `plans/{slug}/` directory packs plus backward-compatible loose files under `plans/`.
   - Named pack or files: use only those.
   - One selectable pack/file: propose it as the read-only default.
   - Several without selection: use a checkbox intake or one concise selection question, then stop.
   - Known archive roots such as `plans/done/` are not new-source candidates; never alter their contents.
   - Invalid-slug directories remain visible but cannot become a briefing target until a kebab-case slug is confirmed; never rename them automatically.
   - None: offer conversational framing.
3. After selection, inspect a directory pack with `aioson briefing:sources . --slug={slug} --json`, load each path in its returned `load_modules` once, then read permitted contents progressively.

Directory packs may contain only SQL, only Markdown, or heterogeneous auxiliary sources in any physical layout. Never require a manifest or ask the user to reorganize them. Loose `plans/*.md` selection remains supported unchanged.

## New briefing from plans

Read selected loose plans fully. For directory packs, follow the inspector's logical roles and load policies rather than bulk-reading every file. During deduplication, inspect only PRD titles/summaries and `.aioson/context/done/MANIFEST.md`; do not open archived feature bodies unless history is explicitly requested.

Run planning selection before expanding context:

```bash
aioson context:search . --query="<briefing task>" --agent=briefing --mode=planning --task="<briefing task>" --paths="<selected plans>" --json 2>/dev/null || true
aioson context:select . --agent=briefing --mode=planning --task="<briefing task>" --paths="<selected plans>"
```

Synthesize what the evidence already establishes, then ask only unresolved product-owner decisions. Move to `exploration-and-artifacts.md` for solution breadth, research, gaps, risks, and writes.

## Evidence-first questions

A useful question can change the problem, user boundary, promised outcome, operational model, risk, success criterion, terminology, trade-off, or next artifact. Before asking:

- mine project context, selected plans/context, code evidence, memory summaries, and fresh/cached research;
- distinguish repository facts from subjective choices;
- state a supported default when confidence is high;
- ask one focused question per dependent branch;
- reflect the answer in one sentence and propose canonical wording;
- do not reopen a stable decision already captured in the draft.

For 3–6 independent high-signal decisions, the optional structured intake may reduce back-and-forth:

```bash
aioson intake:ask . --agent=briefing --schema=.aioson/context/intake/briefing-{slug-or-session}.questions.json --out=.aioson/context/intake/briefing-{slug-or-session}.answers.json 2>/dev/null || true
```

The schema uses version `1`, agent `briefing`, stable question IDs, and `radio`, `checkbox`, or `input`; put evidence-backed defaults first and set `allow_other: true` when predefined options may be incomplete. If the command is unavailable, cancelled, or insufficient, continue conversationally.

## Conversational framing

Use this as an evidence map, not a compulsory interview:

1. **Context / why now:** current situation and trigger.
2. **Problem / JTBD:** user, situation, motivation, desired progress, and current workaround. Convert feature-shaped language into “When…, I want…, so I can…”.
3. **Solution hypotheses:** possible directions without commitment.
4. **Risks:** value, usability, feasibility, viability, and cost of inaction.
5. **Gaps:** current state, desired state, and measurable delta when possible.
6. **Open questions:** classify every unresolved item as `[research-able]`, `[testable]`, `[decision-required]`, or `[out-of-scope]`.

Fill topics from evidence first. Ask only the next unresolved branch and confirm meaning before advancing. If more than three questions remain vague or unclassified, run one focused clarification pass rather than writing a weak draft.

Load `briefing-craft.md` only when the problem remains solution-shaped, the draft is generic, theme partitioning is unclear, more than three questions need classification, or a switch-interview technique is actually needed.

## Continue or modify

1. Read the named `briefings.md` and full registry entry.
2. Identify incomplete/outdated sections and count unresolved questions.
3. Ask whether to address the highest-impact gap or the user's named change.
4. Apply only the requested/evidence-backed revision.
5. Update `updated_at` in the artifact and registry.
6. Never change `draft`, `approved`, or `implemented` directly.

If an approved briefing already has `prd_generated`, do not repurpose it as a fresh pre-PRD draft; explain the appropriate Product/enrichment route.

## Slug gate

Derive a stable kebab-case slug from the actual problem, not the first proposed UI, and write to `.aioson/briefings/{slug}/` without asking, naming the slug in your next message. A slug the user named wins. If it already exists, offer continuation or a genuinely distinct slug. If the user asks for another name before approval, rename the folder and its registry entry.
