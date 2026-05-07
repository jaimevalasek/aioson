# Why AIOSON Exists

> **Who this is for:** anyone already using AI to code who wants to understand the "why" behind the design.
> **Reading time:** 7 min
> **What you'll know after:** the 3 problems AIOSON solves, and the 6 principles of the Constitution.

---

## The 3 problems that motivated AIOSON

### Problem 1 — The monolith prompt

When you open an AI and type "build me a subscription SaaS with Stripe, auth, admin panel, and reports," you're asking it to be **everything at once**: Product Manager, architect, designer, backend dev, frontend dev, QA, security specialist.

Typical result:
- Important decisions are made implicitly, without you noticing.
- The AI picks the first library that comes to mind instead of the right one.
- When you ask for a tweak, it redoes three things that were already fine.
- There's no audit trail: why did it choose Postgres? When? You can't find it.

**How AIOSON solves it:** breaks the monolith into specialist agents. Each one has narrow focus, its own rules, and produces a verifiable artifact before handing off.

### Problem 2 — Amnesia between sessions

You work on a feature for 2 hours with the AI, go to sleep, come back the next day. What does the AI remember?

- In IDEs without persistent memory: **nothing**.
- In IDEs with memory: an approximate summary, usually dropping the "whys."

**How AIOSON solves it:** decisions and context become **disk artifacts** (`project.context.md`, `spec.md`, `dossier.md`, `dev-state.md`, `project-pulse.md`). The next session reads those files before anything else. External memory, not model-internal memory.

### Problem 3 — Inconsistency in the team

In a team, each person has a different prompt style. Each AI client (Claude, Codex, Gemini) responds differently. The result is a codebase stitched together from different aesthetics and patterns.

**How AIOSON solves it:**
- The same agents (`.aioson/agents/`) are read by **any** AI client.
- Project rules (`.aioson/rules/`) and governance (`.aioson/constitution.md`) are shared in Git.
- New team members automatically inherit "how things are done here."

---

## The 6 principles of the Constitution

AIOSON is governed by six articles that **no agent can override**. They live in `.aioson/constitution.md` and are cited by agents when they need to justify a decision.

### Article I — Spec First
> Features start as specification, not code. Implementation without a spec artifact is exploration, not development.

**In practice:** `@dev` refuses to implement before reading a spec. This prevents you from waking up with 800 lines of code solving the wrong problem.

### Article II — Right-Sized Process
> MICRO, SMALL, and MEDIUM don't receive the same process depth. Applying MEDIUM ceremony to a MICRO project wastes more than it protects.

**In practice:** the AI won't ask you for a 30-page PRD for a 50-line script. Each classification has its own flow.

### Article III — Observable Work
> Important actions leave visible artifacts or runtime signals. Work that exists only in conversation history is work that can be lost.

**In practice:** if an agent makes an important decision, it appears in a file. You can review, veto, or roll back.

### Article IV — Testable Behavior
> Acceptance criteria must be independently verifiable. "Works correctly" is not a criterion. "Returns 403 when user A accesses user B's resource" is.

**In practice:** `@qa` rejects vague ACs. You're forced to be specific before approving.

### Article V — Clean Handoffs
> Artifacts must be self-sufficient for the next agent to start without re-reading the entire chain. If the next agent needs to ask "where do I start?", the handoff failed.

**In practice:** a feature's `dossier` includes everything: spec, decisions, touched code, status. When `@dev` hands off to `@qa`, `@qa` doesn't need to interview `@dev`.

### Article VI — Simplicity Over Ceremony
> Don't add layers, files, or workflows unless they reduce ambiguity down the line. Three similar lines are better than premature abstraction. A well-written spec is better than five thin artifacts.

**In practice:** AIOSON constantly fights the temptation to add bureaucracy. **"Small project, small solution"** is the official motto.

### Article VII — Zero Trust by Default
> Security is a baseline, not a feature. Every technical agent (`@analyst`, `@architect`, `@dev`, `@qa`) consumes the baseline declared in `.aioson/rules/security-baseline.md`, with ID-versioned controls (`SEC-SBD-01..08`) that no one can silently weaken.

**In practice:** `@dev` automatically knows it needs to sanitize input, validate authorization, and redact secrets. It's not an extra request from you — it's the default.

---

## The golden rule

Above the 6 articles sits a phrase that appears in nearly every AIOSON prompt:

> **Small project, small solution.**

When you have to choose between an agent doing more things or fewer — always fewer. When you have to choose between creating one more artifact or making do with what already exists — always make do. AIOSON is proactively lazy, and that's a feature.

---

## What is NOT covered by the principles

- **Personal code style.** AIOSON has no opinion on tabs vs spaces, eslint config, etc. That stays in your rules (`.aioson/rules/`).
- **Technology stack.** Agents detect the project stack and adapt. AIOSON works in Node, Python, Go, Rust, PHP, Ruby, etc.
- **Vendor lock-in.** Works with any AI client that reads `.md` files in the project.

---

## Next step

- See the full team mapped out: [Ecosystem map](./ecosystem-map.md)
- Full vocabulary: [Glossary](./glossary.md)
- Put it into practice: [First project from scratch](../2-start/first-project.md)
