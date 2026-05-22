---
description: "Oracle deep guide — strong vs weak briefing examples, JTBD problem framing, Opportunity Solution Tree, Cagan's four risks, gap analysis, open-questions taxonomy, conversation playbook. Load when an existing briefing feels weak, when the conversation goes generic, or when a complex Themes section needs partitioning."
---

# Oracle — Briefing Craft

Load this when:
- The current briefing feels generic, surface-level, or PM-handover-ready (it shouldn't yet — that's `@product`'s job).
- The conversational mode is producing answers that read like feature descriptions instead of problems.
- The briefing has more than 3 unanswered open questions and you need to classify them.
- A Theme is complex enough to warrant a sub-briefing and you need partitioning rules.

Goal of every briefing: give `@product` enough confidence to either commit to a PRD, send it back for more discovery, or shelve it consciously. **Briefings are the bridge between "raw idea" and "committed PRD" — not a draft PRD.**

## 1. Strong vs weak briefing — concrete signals

### Strong briefing markers

- **Problem section reads as a JTBD statement** ("When [situation], I want to [motivation], so I can [outcome]"), not as a feature description.
- **Each open question** has a specific decision-maker named and a research path classified (research-able / testable / decision-required / out-of-scope).
- **Risks are categorized** by Cagan's four (value, usability, feasibility, viability) plus an explicit "risk of NOT doing it".
- **Sources cite specific evidence** — interview count, market sizing with method, competitor URLs, log data, support-ticket counts.
- **Gaps explicitly contrast** current state vs desired state with measurable deltas.
- **Themes break a complex briefing** into 2–4 sub-areas, each with one clear concern.
- **Two voices visible** — at minimum a PM perspective and an engineering or design perspective. Solo briefings underestimate feasibility risk.

### Weak briefing markers (anti-patterns)

- **Problem as solution disguise**: "users need a settings page" — that's a solution. The problem is what they can't accomplish today without it.
- **Open questions without owners**: "TBD: how should this work?" rots forever.
- **Generic risks**: "users may not adopt" applies to every feature; it tells `@product` nothing.
- **Sources = "internal discussion"** with no external research.
- **Themes that repeat the table of contents** instead of partitioning concerns.
- **PM-only briefing** with no engineering or design eyes — a feasibility delusion is hiding somewhere.

### Mitigating weak markers — handoff stays `@product`

When you detect a weak marker (especially **PM-only / single-voice / feasibility delusion**), the **canonical handoff does not change**: `@briefing → @product`. The mitigation is recorded *inside* the briefing, not in the handoff.

- **Acknowledge the marker explicitly** in `## Risks` or `## Open questions` (e.g., *"Single-voice briefing — feasibility claims need second-voice validation"*).
- **Name the specific items** that need expert review: which technical assumption, which sizing call, which architectural choice is at risk.
- **Record the consultation as a recommendation for `@product`'s enrichment phase**, not as a handoff: *"`@product` should consult `@sheldon` during enrichment for second-voice on AST scope and sizing"*. The PRD is the input `@sheldon` needs to run.

**Anti-pattern — never do this:**

> ❌ *"Recommendation: pass through `@sheldon` before `@product` commits a PRD."*

`@sheldon` operates **exclusively on PRDs not yet implemented** (see `sheldon.md` strict scope) and will refuse activation without a PRD (RF-01 block — documented incidents on 2026-05-19 `workflow-handoff-integrity-1-9-2` and 2026-05-21 `neural-chain`). Skipping `@product` breaks the chain.

**Other weak markers map the same way:** mention the gap, name who should weigh in *during PRD enrichment*, hand off to `@product`.

## 2. Problem framing — Jobs-to-be-Done (JTBD)

Customers don't "want a product"; they hire it to make progress. The job is the *progress*, not the surface task.

**JTBD statement format:**
```
When [situation/trigger], I want to [motivation], so I can [expected outcome].
```

**Examples:**

- ❌ Surface task: "User wants to upload a file."
- ✅ JTBD: "When I'm collaborating on a document with my team and need their input fast, I want to share my work with one click, so I can keep momentum without losing context."

- ❌ Feature description: "Add a settings page."
- ✅ JTBD: "When my team's preferences differ from defaults and I'm tired of explaining workarounds, I want to lock in our setup once, so I can stop being the configuration person."

**The "why now?" question** that makes a JTBD complete: *what changed* that makes this surface today? A trigger always exists — a new hire, a competitor launch, a regulation, a project failure. If you can't name the trigger, the problem isn't ripe.

**Switch interview protocol** (when the conversation has a real user the agent can talk through):
1. Reconstruct the moment they switched from one solution to another (or chose to start using something).
2. Capture the trigger, the alternatives considered, the anxieties about switching, the decision criteria, and the first-use experience.
3. Ten to fifteen well-conducted switch interviews provide more actionable insight than months of survey data.

## 3. Opportunity space — Teresa Torres' Opportunity Solution Tree

Use this when the briefing has the shape "we want to improve X, but we're not sure where to invest" — i.e., outcome-shaped problems with multiple possible doors in.

```
                        Outcome
                  (measurable target)
                          |
        +-----------------+------------------+
        |                 |                  |
   Opportunity A     Opportunity B      Opportunity C
   (customer pain)   (customer pain)   (customer pain)
        |                 |                  |
   +----+----+       +----+----+       +-----+
   |    |    |       |    |    |       |     |
  Sol  Sol  Sol     Sol  Sol  Sol     Sol   Sol
   |    |    |       |    |    |       |     |
  AT   AT   AT      AT   AT   AT      AT    AT
       (assumption tests)
```

**Discipline:**
- Outcome is **measurable** (e.g., "increase activation by 20%"), not an output ("ship feature X").
- Opportunities are **customer pain points** that, if relieved, would move the outcome.
- Decompose big opportunities into smaller, solvable ones. Smaller opportunities → smaller solutions → faster tests.
- Each solution is broken into **assumption tests** — desirability ("will they want it?"), feasibility ("can we build it?"), viability ("does it make business sense?"), ethics. Most assumption tests run in 1–2 days; idea tests take weeks. **Test assumptions, not full ideas.**
- The tree is *continuously updated* — the briefing captures a snapshot, not a final answer.

When generating a briefing for an outcome-shaped problem, draw the tree (markdown nesting or a small mermaid diagram) and reference its branches in the Themes section.

## 4. Risk classification — Marty Cagan's four

Discovery exists to address four distinct risks before committing to a solution. Map every risk in the **Risks** section to one of these four buckets. If a risk doesn't map, it's probably an implementation detail (which is `@dev`'s problem, not `@briefing`'s).

| Risk type | Question it answers | Owner to validate |
|---|---|---|
| **Value** | Will customers actually want it? Will they choose it over alternatives? | Product, user research |
| **Usability** | Can they figure out how to use it? | Design, usability testing |
| **Feasibility** | Can engineering build it given time, skills, tech, data? | Engineering |
| **Viability** | Does it work for the business? Legal, ethics, P&L, brand, partnerships, support burden? | Stakeholders, ops, legal |

**Always also ask:** *Risk of NOT doing it.* The cost of inaction is a forcing function — without it, "let's build everything" looks safe.

**Anti-pattern:** "Risk: complexity." That's a feasibility hand-wave. Be specific: which dependency, which migration, which performance concern.

## 5. Gap analysis discipline

Every gap should be expressed as the **diff between current state and desired state** — and the diff should be measurable when possible.

```markdown
### Gap: Onboarding completion rate
- Current state: 38% of signups complete the first task within 7 days (last 90 days).
- Desired state: ≥ 60% within 7 days.
- Delta: +22 pts.
- Why this matters: aligns with the activation outcome (see Themes/Activation).
```

**Anti-patterns:**
- "We don't have onboarding." (Too binary — what *is* there today?)
- "Onboarding is bad." (Not measurable.)
- "We need better onboarding." (That's a solution prefix, not a gap.)

When the delta isn't directly measurable yet, name **what would have to be measured** before deciding ("we'd need to instrument event X to know").

## 6. Open-questions taxonomy

Every numbered open question must be classified by what kind of answer it needs:

| Type | Resolution path | Owner |
|---|---|---|
| **Research-able** | Web search, data analysis, competitor scan in < 4 hours | `@orache` or `@sheldon`, or self |
| **Testable** | An assumption validated by a 1–2 day experiment, prototype, or interview | Discovery experiment — design + product |
| **Decision-required** | Judgment call between explicit alternatives — no more research will resolve it | Human decision-maker (founder, lead, stakeholder) |
| **Out-of-scope** | Worth noting but not blocking | Park in a "later" section |

**Format in the briefing:**
```markdown
1. [research-able] What's our weekly active user count for accounts older than 30 days?
   - Owner: data team. Path: query analytics.
2. [testable] Will a one-click share reduce time-to-second-export by ≥ 20%?
   - Owner: design + dev. Path: prototype + 5-user test, 2 days.
3. [decision-required] Do we ship with Slack-only or Slack+Teams at launch?
   - Owner: founder. Path: trade-off doc, ship within 1 week.
```

**The 3-question quality gate:** if the briefing has more than 3 unclassified or vague open questions, it's not ready to be `approved`. Either classify them, or do another conversation pass to either resolve or scope-cut.

## 7. Theme partitioning rules

When a briefing has a complex problem space, partition into Themes. Each theme should:

1. Have **one concern** (not "auth + billing"; pick one).
2. Be **independently progressable** — could become its own briefing if scope expands.
3. Have **its own** open questions, gaps, and risks reflecting that theme.
4. Map to a single branch of an Opportunity Solution Tree if you've drawn one.

**Heuristic:** if you can't name the theme without using "and", it's two themes.

## 8. Conversation playbook (expanded)

When in conversational mode (`plans/` empty or user wants to plan via chat), use this structure. Don't rush. Each topic gets a reflection ("So basically X is Y — is that right?") before advancing.

### A — Context (the "why now?")
> "Tell me about the context: what is the current situation, and **what changed recently** that made you think about this idea now? A trigger always exists."

Follow-ups:
- "What were you doing differently 3 months ago?"
- "Who or what raised the issue first?"
- "What broke or almost broke?"

### B — Problem (JTBD framing)
> "What specific pain point do you want to solve? For whom? What can't they accomplish today without working around it?"

After the user answers, **try to convert their description into a JTBD statement and reflect**:
> "Let me see if I got this: 'When [situation], I want to [motivation], so I can [outcome].' Is that right? What did I miss?"

Watch for surface-level framings (file upload, settings page, dashboard) and probe for the underlying progress.

### C — Proposed solution
> "What direction are you considering? Multiple is fine — this is not a commitment yet, just hypotheses."

Follow-ups:
- "What's the cheapest version that would tell you if it works?"
- "What would change if we did the opposite of what you're considering?"

### D — Risks (Cagan's four + risk of inaction)
> "Let's go through this in four passes:
> 1. **Value** — will users actually want it?
> 2. **Usability** — can they figure out how to use it?
> 3. **Feasibility** — can we build it given what we know?
> 4. **Viability** — does it work for the business (legal, ethics, P&L, support)?
> And one more: **what's the cost if we don't do it?**"

### E — Gaps (current vs desired state)
> "What's still undefined that would need an answer before moving forward? For each thing, can we frame it as 'today we have X, we want Y, the delta is Z'?"

### F — Open questions classification
After the 5 topics, sweep all unresolved items and classify each:
> "Of the questions still open, which are **research-able** (a few hours of digging), which are **testable** (1–2 day experiment), which are **decision-required** (someone has to choose), and which are **out-of-scope** (note but don't block)?"

This is the gate before proposing a slug and writing the briefing.

## 9. Switch interview script (when JTBD framing requires it)

When the user has a real customer/user the agent can talk to (or the user is themselves the customer), use this script:

1. **Reconstruct the timeline.** "Walk me through the day you switched / started using / decided you needed [thing]. What happened in the hours and days before?"
2. **Identify the trigger.** "What was the specific moment that made you say 'I have to do something about this'?"
3. **List alternatives considered.** "What else did you think about doing? What were you doing before?"
4. **Surface anxieties.** "What worried you about switching? What almost stopped you?"
5. **Capture decision criteria.** "How did you decide which option to go with? What made the final choice?"
6. **Document first use.** "What was the first thing you did with [solution]? Did it work? How did it feel?"

10–15 of these conversations are worth more than months of surveys. Each one takes 30–45 min.

## 10. Reporting hooks

In the briefing's frontmatter and Sources section, when a deep methodology was used:

```markdown
---
slug: {slug}
created_at: {ISO-date}
updated_at: {ISO-date}
source_plans: [...]
methodology: opportunity-solution-tree | jtbd | cagan-discovery | switch-interview
---

## Sources
- Switch interviews conducted: 7 (2026-04-30 to 2026-05-06)
- Competitor scan: [Competitor A](url), [Competitor B](url)
- Internal data: weekly_active_users.sql, churn_cohort_v3.sql
- Market sizing: ARR estimate from public earnings reports + Crunchbase
```

## 11. References

This document distills `researchs/oracle-briefing-craft-2026/summary.md`. See that file for the full source list and verdict.
