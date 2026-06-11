# Skill: Web Research Cache

> Load this file when you are about to run a web search.
> Check the cache first. Save results after. Never search twice for the same thing.
> Treat `researchs/` as a temporary shared evidence layer for current and nearby sessions.

## Cache location

```
researchs/                        ← project root (alongside plans/, prds/)
└── {slug}/
    ├── summary.md                ← frontmatter + consolidated findings
    └── files/
        └── {source-slug}.md     ← raw content from each consulted URL
```

The `slug` identifies the topic searched (e.g., `stripe-api-2026`, `nextjs-app-router`, `jwt-vs-session`). Use kebab-case, include the year when the decision may age.

## Step 1 — Check cache before searching

Before running any WebSearch:

1. Derive the slug from the topic you are about to search
2. Check if `researchs/{slug}/summary.md` exists
3. Read `searched_at` from its frontmatter
4. If `searched_at` is within the last **7 days** → use the cached result, do not search again
5. If older than 7 days or missing → proceed to search

## Step 2 — Run the search

- Formulate the query including the **current year** when recency matters
- Prefer specific keyword phrases over broad prompts: user segment, domain noun, workflow, technology, pricing/compliance/risk term
- For technical/library decisions, prefer primary sources first: official docs, changelog/release notes, GitHub repo, standards, or vendor API reference
- For product/domain decisions, prefer sources that expose real patterns: official product docs, pricing pages, support docs, market reports, competitor docs, or credible case studies
- Open/extract the source pages before using them. Search result snippets are routing signals, not evidence.
- Run at most one query expansion pass if the first query returns weak results: add domain/source constraints, synonyms, or the concrete decision being evaluated
- Maximum **4 queries per session** — focus on decisions with highest risk of being outdated or materially wrong
- If WebSearch fails for a query: record the error in `summary.md` and continue — do not block

## Search quality model

Good research is a pipeline, not a single search call:

1. **Plan** — name the decision and what would change if the answer is different.
2. **Search** — retrieve candidate sources.
3. **Read/extract** — inspect the pages that actually support the finding.
4. **Compress** — keep only source-grounded deltas that change options, risks, defaults, or open questions.

Optional provider guidance for future integrations:

- Agent/RAG search APIs such as Tavily, Exa, Firecrawl, or Brave can improve retrieval and extraction, especially when they return page content, highlights, or grounded answers.
- Open-source extraction tools such as Crawl4AI are useful when AIOSON needs self-hosted crawling/scraping.
- Do not make any provider mandatory in the core prompt. Use adapters behind the same cache contract so agents keep working with built-in web tools.

## Step 3 — Save results

After searching, always save before using the results:

**`researchs/{slug}/summary.md`:**
```markdown
---
searched_at: {ISO-date}
agent: {agent-name}
prd: {prd-slug or null}
query: "{query used}"
verdict: confirmed | has-alternatives | outdated | deprecated
---

# Research: {topic title}

## Verdict
[One line with the verdict and justification]

## Findings
[Consolidated summary — maximum 5 bullets]

## Sources consulted
- [URL] — [what it contributed]
```

**`researchs/{slug}/files/{source-slug}.md`:** raw content from each URL consulted.

## Step 4 — Surface only what is actionable

Show the user **only** findings with verdict `has-alternatives`, `outdated`, or `deprecated`:

```
🔍 Web Intelligence — {current date}

**[decision or technology]** — {verdict}
→ {finding in 1–2 lines}
→ Alternative: {recommended alternative, if any}
→ Source: [URL]

Want to incorporate this update?
```

If all findings are `confirmed`:
> "✓ Decisions validated against recent research. No updates needed."

`confirmed` findings are **never shown** — they are noise.

## Verdicts

| Verdict | Meaning |
|---|---|
| `confirmed` | Still the best choice — no action needed |
| `has-alternatives` | Valid but better options now exist |
| `outdated` | Superseded by a newer approach |
| `deprecated` | Officially discontinued or abandoned |

## Who reads and who writes

| Agent | Reads cache | Writes cache |
|---|---|---|
| @sheldon | ✅ | ✅ — primary writer for PRD technical decisions |
| @squad | ✅ | ✅ — lightweight domain/pattern scouting for squad packages |
| @analyst | ✅ | ✅ — technology and integration validation |
| @architect | ✅ | ✅ — infrastructure and library trade-offs |
| @dev | ✅ | ✅ — library docs and implementation patterns |
| @product | ✅ | ✅ — market and domain context |
| @deyvin | ✅ | ✅ — continuity session lookups |
| @orache | ✅ (read only) | ❌ — domain intelligence goes to `squad-searches/`, not here |

**Why @orache does not write here:** `researchs/` uses a verdict schema (`confirmed | has-alternatives | outdated | deprecated`) designed for technical decision validation. Domain investigation findings (frameworks, anti-patterns, vocabulary) do not fit this schema and would pollute the cache with non-actionable data for other agents.

## Rules

- **Never search without saving** — unsaved results are lost after the session
- **Never block on search failure** — record the error and continue
- **Never use snippets as final evidence** — inspect source pages or use cached summaries
- **Never show `confirmed` findings** — they add noise without value
- **Never modify the PRD/plan without user confirmation** — surface findings, let the user decide
- **Cache is shared across all agents** — if another agent already searched the same topic this week, use their result
- `@product`, `@sheldon`, and `@squad` should derive short keyword phrases from the active task and scout the cache before finalizing substantial output
- The user decides whether to act on findings. Agents surface, humans decide.
