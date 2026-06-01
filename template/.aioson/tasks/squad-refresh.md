# Task: Squad Refresh

> Deepen executors in an existing squad: both **knowledge depth** (persona + expertise: frameworks, vocabulary, signature_moves — Variant A) and customer-facing **world-model breadth** (operational_breadth + yes-and — Variant B). Unlike `analyze` (diagnosis only), `extend` (additive only), and `repair` (structure only), this is the right task when `@squad analyze` finds a **basic executor** (role name without depth block), or when the user reports that a squad behaves too narrowly or generically.

## When To Use

- `@squad refresh <slug>` — interactive mode (default)
- The user reports a real squad failure case, for example: "the customer asked for X and the agent said it only knows Y"
- `@squad analyze` identified breadth or rigidity gaps
- Older squads created before `domain-breadth.md` was introduced (pre-2026-05-07 commits)

## Input

- Existing squad slug under `.aioson/squads/<slug>/`

## Mandatory Preload

Before anything else, load the depth contract for the executor type being refreshed:
- **Variant A (knowledge/creative/technical):** `.aioson/docs/squad/package-contract.md` § Executor depth block — `persona + expertise (frameworks, vocabulary, signature_moves) + quality_bar + anti_patterns`.
- **Variant B (customer-facing):** `.aioson/docs/squad/domain-breadth.md` — the `role + backstory + goal + operational_breadth + interaction_principles` template, yes-and patterns, HEARD refusal method, and worked examples (pharmacy, restaurant, gym, hotel).

Also load `.aioson/docs/squad/quality-lens.md` (scorecard with "persona depth" and "domain breadth" criteria).

## Process

### Step 1 - Read Squad Package

Full inventory:

- `.aioson/squads/<slug>/squad.manifest.json` — metadata + declared executors
- `.aioson/squads/<slug>/squad.md` — canonical text
- `.aioson/squads/<slug>/agents/agents.md` — text map
- `.aioson/squads/<slug>/agents/<executor>.md` — all prompts
- `.aioson/squads/<slug>/docs/design-doc.md`, `readiness.md` — if present
- `.aioson/squads/<slug>/skills/`, `templates/`, `workflows/` — listing

If the slug has no `squad.manifest.json` (legacy squad), run `squad-repair.md` first to generate the manifest before continuing.

### Step 2 - Silent Depth Diagnosis

For **each** executor, choose the variant by role and verify:

**Variant A — knowledge/creative/technical executor** (researcher, analyst, strategist, writer, editor, engineer, specialist):

- [ ] Does it have a depth block in `## Quick context` with `persona` anchored in real seniority/experience, not "you are an analyst"?
- [ ] Does it have `expertise` with named `frameworks`, `vocabulary` (real terms of art), and `signature_moves`?
- [ ] Did `anti_patterns` become lines in `## Hard constraints`?
- [ ] If the squad has `sourceDocs`/`analysis`: do source vocabulary/frameworks appear in the prompt, or is the executor generic?

**Variant B — customer-facing executor** (support, sales, reception, host, concierge):

- [ ] Does it have `role + backstory + goal` in Quick Context, or equivalent?
- [ ] Does it have `operational_breadth` with `primary`, `adjacent` (>= 5 items), and `out_of_scope`?
- [ ] Does it have `interaction_principles` with explicit yes-and ("default 'yes, and...'")?
- [ ] Is the backstory grounded in real-world venues, experience years, and customer types? Does it include the anti-pattern "never say 'we only sell X'"?

Build a silent matrix `{executor: [gaps]}`. Do not show it yet; use it to generate the plan.

### Step 3 - Conversational Intake

Present a single message in the selected project language. Do not bounce through many questions. The message should cover:

1. **Real failure case:** what is not working today? Any specific example where the squad acted too narrowly or refused something legitimate?
2. **Operational reality:** what do real practitioners in this domain handle day to day beyond the obvious? Offer to research if the user does not know.
3. **Other improvements:** tone, language, new executors, flows, or only breadth/depth.

If the user answers briefly, assume high autonomy and infer the rest. If the user describes a specific pain case, that case becomes the **anchor case** for the refresh.

### Step 4 - Web Research (Conditional)

Trigger research only when one of these signals occurs:

- The user explicitly asks for research.
- The domain is unfamiliar or declared `operational_breadth` is vague.
- The pain case involves a product/service/scenario you are not confident about.

When triggered, prefer invoking `@orache` for a focused investigation pass. It should scout real venues, reviews, competitor stores, and return an adjacency map. Use `@orache` instead of scattered web searches.

Save output in `researchs/<slug>-refresh-<ISO-date>/summary.md`; `researchs/` is gitignored local cache.

### Step 5 - Generate Correction Plan

Create `.aioson/squads/<slug>/docs/REFRESH-<ISO-date>.md` with this format:

```markdown
---
slug: <slug>
created_at: <ISO-date>
trigger: user-reported breadth failure | analyze recommendation | preventive
status: draft
based_on:
  user_pain: "<user quote, if any>"
  research: "<summary path, if any>"
  diagnosis: "<silent matrix summary>"
---

# Refresh Plan — <slug> — <date>

## Anchor case (the user's pain story, if any)
"<literal user quote>"

## Diagnosis matrix
| Executor | Gaps detected |
|---|---|
| attendant | missing operational_breadth.adjacent; generic backstory; no yes-and |
| orchestrator | no breadth context propagation |

## Research synthesis (if web research happened)
- Real practitioners in <domain> handle: <adjacency list>
- Adjacent businesses customers come from: <list>
- Yes-and patterns observed in industry: <list>

## Per-executor changes

### Executor: attendant

**Current state (relevant excerpt):**
```yaml
role: "Pharmacy attendant"
mission: "Serve customers and sell medicine"
```

**Refresh — replace Quick Context block with:**
```yaml
role: "Neighborhood pharmacy counter attendant"
backstory: |
  You have worked behind the counter of a neighborhood pharmacy for 8+ years.
  Customers come for prescriptions, but they also ask for candy, snacks,
  cosmetics, vitamins, sunscreen, baby products, and quick practical guidance.
goal: "Every customer leaves with what they need or a clear next step."

operational_breadth:
  primary: ["prescription medicine", "OTC medicine", "pharmacist consultation"]
  adjacent:
    - "candy, chocolate, gum"
    - "cosmetics, moisturizers, sunscreen"
    - "baby products such as formula and diapers"
    - "vitamins and supplements"
    - "condoms and hygiene products"
    - "first aid and thermometers"
    - "gift cards and convenience counter services"
  out_of_scope:
    - "medical diagnosis"
    - "controlled medicine without prescription"

interaction_principles:
  - "Default to 'yes, and...' — accept the customer need and build from it"
  - "Refuse only when illegal, unsafe, or genuinely unavailable"
  - "Never say 'we only sell medicine' — say what you do have"
  - "Validate the underlying need before answering only the literal request"
```

### Executor: <next>
...

> For **Variant A** executors (knowledge/technical), the replaced block is the depth block `persona + expertise (frameworks, vocabulary, signature_moves) + quality_bar + anti_patterns` from package-contract § Executor depth block. Same refresh mechanics, but depth content instead of breadth.

## Files to update
- `.aioson/squads/<slug>/agents/attendant.md` — replace Quick Context
- `.aioson/squads/<slug>/agents/orquestrador.md` — add breadth context line
- `.aioson/squads/<slug>/squad.md` — version bump

## Validation
After apply, mentally run `squad-validate`. Recommend a warm-up round with the anchor case.
```

### Step 6 - Show Diff And Ask For Confirmation

Present compactly in the selected project language:

```
Refresh plan for "<slug>" saved at:
  .aioson/squads/<slug>/docs/REFRESH-<date>.md

Proposed changes:
  UPDATE  agents/attendant.md       — replace Quick Context block (+~40 lines)
  UPDATE  agents/orquestrador.md    — add breadth propagation line (+~5 lines)
  UPDATE  squad.md                  — version bump <n> → <n+1>

Apply all? [Y/n/select specific]
```

If the user says "select specific", offer a numbered list and apply only approved items.

### Step 7 - Apply Changes

For each affected executor:

1. Read the current file.
2. Identify the `## Quick context` section, or equivalent.
3. **Preserve:** `## Mission`, slug header, `## Active genomes`, `## Hard constraints`, `## Output contract`, and any custom instruction the user added.
4. **Replace or insert:** YAML block `role + backstory + goal + operational_breadth + interaction_principles` inside Quick Context.
5. If the executor has no Quick Context section, insert it right after `## Mission`.
6. Save the file.

Update `squad.md`:
- Bump `version` (1.0.0 → 1.1.0)
- Add refresh history entry: `<date>: breadth/depth refresh based on <pain quote summary>`

Update `squad.manifest.json` only if metadata changes; usually only `squad.md` changes.

### Step 8 - Validate

Mentally run `.aioson/tasks/squad-validate.md`:
- Manifest ↔ filesystem consistent?
- Do all referenced executors still exist?
- Executor frontmatter valid?

If something broke, stop and ask the user before trying to fix it.

### Step 9 - Recommend Warm-Up

Conclude in the selected project language:

> Refresh applied to **`<slug>`**. I recommend a warm-up round using the real case that motivated the refresh: `<anchor case>`. The affected executor should now answer with yes-and instead of the prior narrow response. If behavior still does not match, run `@squad refresh <slug>` again and describe what is still missing.

## Differences From Other Tasks

| Task | Focus | Modifies executor prompts? |
|---|---|---|
| `analyze` | Coverage/structure diagnosis | No |
| `extend` | Add NEW components | No |
| `repair` | Fix manifest↔filesystem inconsistency | Regenerates missing files only |
| **`refresh`** | **Deepen executors (Variant A depth + Variant B breadth)** | **Yes — updates Quick Context blocks** |

## Rules

- Never apply changes without explicit user approval.
- Always show the diff first.
- Preserve executor Mission, headers, hard constraints, and output contracts; modify only the Quick Context block.
- Save plan to `.aioson/squads/<slug>/docs/REFRESH-<date>.md` before applying.
- Load the depth contract for the variant before Step 1.
- For squads without formal manifest, run `squad-repair` first.
- Bump version in `squad.md` on every applied refresh.
- Refresh is incremental; it can run multiple times on the same squad over time.

## Output

- `.aioson/squads/<slug>/docs/REFRESH-<date>.md` persisted plan
- Updated `agents/<executor>.md` files
- `squad.md` with version bump + refresh history entry
- Warm-up recommendation in chat
