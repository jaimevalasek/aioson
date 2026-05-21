---
feature: operator-memory
slug: operator-memory
classification: MEDIUM
created_by: architect
created_at: 2026-05-21
sources:
  - .aioson/context/prd-operator-memory.md
  - .aioson/context/requirements-operator-memory.md
  - .aioson/context/spec-operator-memory.md
  - .aioson/context/sheldon-enrichment-operator-memory.md
  - .aioson/plans/operator-memory/manifest.md
  - .aioson/plans/operator-memory/plan-*.md
  - researchs/agent-memory-backends-2026/summary.md
deferred_decisions_resolved: 7
new_modules: 12
---

# Architecture — Operator Memory

## Architecture overview

Per-operator decision-memory layer implemented as a Node.js CLI extension to AIOSON. Storage = hybrid SQLite (`_index.sqlite` with FTS5 virtual table for cross-decision search) + markdown source-of-truth (`decisions/*.md`, `proposals/*.md`). Distribution: 5 progressive releases v1.12.0 → v1.16.0 (DD-05 from sheldon, mirrors workflow-handoff-integrity DD-05). Universal loading directive (Phase 3) injected behind feature flag `AIOSON_OPERATOR_MEMORY` (default OFF until Phase 4 ships green).

## Resolved deferred decisions (7)

### DD-01 — Validity window completeness

**Decision:** Minimal Zep pattern (PMD-AN-01 ratified). V1 schema: `last_reinforced` + `superseded_by` + `reinforcement_count` + `version_schema`. NO per-fact `start_at`/`end_at` (full Zep).

**Rationale:** `last_reinforced` answers "still current?" (drives decay); `superseded_by` answers "what replaced this?" (drives audit). Both queries are satisfied. Full Zep `start_at`/`end_at` becomes interesting when supersedence chains are routinely queried — not a V1 use case. Defer to V2 if telemetry shows chain-walk patterns emerge.

**Constraint for @dev:** `version_schema: "1.0"` MUST be written to every decision frontmatter — V2 migration relies on this discriminator.

### DD-02 — Hash size (16 vs 64 chars)

**Decision:** **16 chars** (sha256[0..16] truncated). Confirmed PMD-AN-04 default.

**Rationale:**
- Collision probability via birthday bound for 64-bit space (2^64 ≈ 1.8e19): N=1000 emails → ~2.7e-14; N=1e9 → ~2.7e-2 (acceptable but at edge for global-scale).
- Reverse-lookup defense: email entropy is the bottleneck (~25-30 bits for typical emails per published studies), NOT hash output. Extending to 64 chars adds zero meaningful reverse-lookup resistance — hash is deterministic regardless of output length.
- Path length: 16 chars keeps `~/.aioson/operators/{16-chars}/` under typical OS path limits with margin.
- **Escape hatch:** if a deployment encounters collision (logged via `op_identity_collision` telemetry), `AIOSON_OPERATOR_ID` override is the documented fix.

### DD-03 — Universal directive byte budget

**Decision:** ≤ 300 tokens per agent file (per AC-NFR-02-a). Cross-cutting total ≤ 6k tokens (per AC-NFR-02-b). Audit script warns at 5k, fails CI at 6k.

**Rationale:**
- 30 agent files × 300 tokens = 9k worst-case if every agent loaded directive at full budget. Target 6k means avg 200 tokens/agent — leaves slack for any single agent needing larger directive.
- Directive is essentially: 2 sentences of guidance + 1 file-path reference + flag-check pseudocode. ≤ 200 tokens is realistic; 300 is generous ceiling.
- Audit enforcement at CI level (Phase 3 `scripts/memory-budget-audit.js`) prevents budget creep across releases.

### DD-04 — Telemetry storage

**Decision:** **Extend `dossierTelemetry`** existing table (single events surface with `event_type` discriminator + `event_data` JSON column). 7 new event types: `op_capture`, `op_promote`, `op_forget`, `op_conflict_warning`, `op_decay_prompt`, `op_migrate`, `op_history_cleanup`. Plus auxiliary: `op_identity_unresolved`, `op_identity_collision`, `op_index_rebuild`, `op_migrate_skip`, `op_command_stub`.

**Rationale:**
- Workflow-handoff-integrity F2/F3/F1/T5 already use this pattern successfully (4 event types added to existing infra). Operator-memory shipping 12 event types is the same evolution path.
- Single table = single query interface for analytics + dashboards. New `operator_events` table would fragment telemetry across two tables that have to be UNION'd for cross-feature analytics.
- Schema impact: zero (existing `event_type TEXT` + `event_data TEXT JSON` columns absorb new types additively).

### DD-05 — Migration UX

**Decision:** **Explicit `aioson op:migrate` command only**. NO auto-import on first `op:capture`.

**Rationale:**
- PRD principle: operator-memory is opinionated, not silent magic. PMD-08 silent-audit-on-promote applies to NEW signals — NOT to bulk-importing existing config.
- Auto-import-on-first-capture surprises users (they captured signal X about commit, suddenly 8 unrelated decisions appear).
- One-shot explicit `op:migrate` is the same UX shape as `op:promote` / `op:forget` — user controls when memory state changes.
- Idempotency (AC-P5-05) protects against accidental double-imports.

**Deprecation timeline:** `user-profile.md` deprecated when `features.md` marks `operator-memory: done` (PMD-10). Agents emit one-time per-session warning when reading deprecated `user-profile.md`. Removal in V2 release post-stabilization.

### DD-A1 — Atomic move semantics on archive tier transition

**Decision:** **Decision file stays in `decisions/{slug}.md`** during active ↔ archive tier transitions. Only the pointer in `MEMORY.md` vs `MEMORY-archive.md` changes. NO file moves.

**Rationale:**
- Filesystem locality: same directory = same physical inode region (improves read cache hit rate).
- Atomicity: tier transition becomes a single atomic edit of one or both MEMORY*.md files (write-tmp-then-rename), vs N-file moves which can partial-fail mid-operation.
- Human-readable storage: `decisions/` is browsable as the canonical "this operator's memory" view — splitting active/archived across directories breaks `ls decisions/`.
- Audit trail: file's mtime reflects last update; tier-transition events emit telemetry without touching the markdown file.

### DD-A2 — FTS5 schema migration strategy

**Decision:** **Drop-and-rebuild `_index.sqlite` from markdown filesystem** on `version_schema` bump. Same recovery path as PMD-AN-06 corruption-recovery (already implemented for EC-04).

**Rationale:**
- Performance acceptable: 10k decisions × ~5KB body = 50MB → ~5s rebuild on commodity SSD. Typical user (50 decisions) → ~50ms.
- Markdown is source-of-truth (PMD-AN-06 + PMD-AN-04 commit). Rebuild path already tested for corruption.
- Incremental ALTER VIRTUAL TABLE is FTS5-version-dependent (SQLite/FTS5 has had breaking changes across releases) and adds complexity for marginal gain.
- One code path (`rebuildIndexFromMarkdown()`) serves corruption recovery, schema migration, AND fresh-install — DRY.

## Module layout

All new code lives in two new namespaces inside the existing AIOSON `src/`:

```
src/
├── operator-memory/                        ← NEW namespace — pure helpers, no CLI plumbing
│   ├── identity.js                         ← Phase 1 — resolveIdentity, validateOverride, hashEmail
│   ├── storage.js                          ← Phase 1 — ensureStorageTree, openIndexDb, migrateIndexSchema, rebuildIndexFromMarkdown
│   ├── proposal.js                         ← Phase 2 — proposal CRUD on markdown + FTS5
│   ├── decision.js                         ← Phase 2 — decision CRUD with atomic promote/forget
│   ├── slug.js                             ← Phase 2 — deterministic slug derivation (kebab + truncate + collision suffix)
│   ├── loader.js                           ← Phase 3 — loadMemoryIndex, matchDecisions, regenerateIndex
│   ├── index-md.js                         ← Phase 3 — MEMORY.md tier-based reader/writer
│   ├── conflict.js                         ← Phase 4 — detectConflicts, formatConflictWarning
│   ├── decay.js                            ← Phase 5 — category half-life logic + decay sweep
│   └── prune.js                            ← Phase 5 — 10k hard cap enforcement
│
├── commands/                                ← existing namespace — extended
│   ├── op-identity.js                      ← Phase 1 (full) — show + set (Phase 5 completes set)
│   ├── op-capture.js                       ← Phase 1 stub → Phase 2 full impl
│   ├── op-promote.js                       ← Phase 1 stub → Phase 2 full impl
│   ├── op-forget.js                        ← Phase 1 stub → Phase 2 full impl
│   ├── op-list.js                          ← Phase 1 stub → Phase 3 full impl (--with-conflicts in Phase 4)
│   ├── op-show.js                          ← Phase 1 stub → Phase 3 full impl
│   ├── op-reinforce.js                     ← NEW Phase 5
│   └── op-migrate.js                       ← NEW Phase 5
│
└── cli.js                                   ← existing — wire 8 new command aliases (Phase 1 wires 6, Phase 5 adds 2)
```

**Template files modified (Phase 3, behind flag):**
```
template/CLAUDE.md                          ← inject ## Memory loading + ## Memory capture sections
template/AGENTS.md                          ← same directive (T5 semantic parity verifies)
template/agents/_shared/memory-capture-directive.md  ← NEW versioned prompt template (Phase 2 ships, Phase 3 wires)
```

**Documentation:**
```
.aioson/docs/operator-memory/memory-md-format.md     ← NEW Phase 3 — cross-harness format spec + support matrix
```

**Tests + smoke:**
```
tests/operator-memory-identity.test.js               ← Phase 1
tests/operator-memory-capture.test.js                ← Phase 2
tests/operator-memory-loading.test.js                ← Phase 3
tests/operator-memory-conflict.test.js               ← Phase 4
tests/operator-memory-decay.test.js                  ← Phase 5
tests/operator-memory-migrate.test.js                ← Phase 5
tests/fixtures/operator-memory/                      ← per phase — FP/FN corpora
scripts/smoke-run-chain.js                           ← extended per phase ([OM1]..[OM5], [OM-ALL])
scripts/memory-budget-audit.js                       ← NEW Phase 3
```

**Wiring audit:**
```
.aioson/context/wiring-audit-operator-memory.md      ← NEW Phase 1, populated incrementally
```

## Storage architecture

**`~/.aioson/operators/` tree:**

```
~/.aioson/operators/
├── _index.sqlite                ← shared across identities (PMD-01 hybrid backend)
├── {identity-1}/                ← e.g. a1b2c3d4e5f6a7b8 (16-char sha256[0..16])
│   ├── MEMORY.md                ← active tier index (lazy-loaded by preflight)
│   ├── MEMORY-archive.md        ← archive tier index (lazy-loaded only on --include-archived)
│   ├── decisions/
│   │   ├── commit-autonomy-after-slice.md
│   │   └── npm-publish-manual.md
│   ├── proposals/
│   │   └── new-thing-pending-second-detection.md
│   ├── history/                 ← soft-deleted, cleaned at 365d (Phase 5)
│   │   └── 2026-04-20T10-30-00-pruned-old-decision.md
│   ├── _conflict_state.json     ← Phase 4 — debounce timestamps per (slug, rule) pair
│   └── _decay_state.json        ← Phase 5 — debounce timestamps per slug
├── {identity-2}/
│   └── ...
└── ci-bot-shared/               ← override identity (PMD-05) — no hash prefix
    └── ...
```

**`_index.sqlite` schema (cumulative across phases):**

```sql
-- Phase 1
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS operators (
  identity       TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,         -- ISO
  source         TEXT NOT NULL,         -- email-hash | override | anonymous-fallback
  last_active_at TEXT NOT NULL          -- ISO, updated each op:*
);

-- Phase 2 (created Phase 1, populated Phase 2)
CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
  identity        UNINDEXED,
  slug            UNINDEXED,
  signal_type,                          -- INDEXED via fts5
  category,                             -- INDEXED via fts5
  body,                                 -- INDEXED, porter tokenizer
  last_reinforced UNINDEXED,            -- for in-memory decay scan
  tokenize = 'porter'
);

CREATE INDEX IF NOT EXISTS idx_operators_last_active
  ON operators(last_active_at);          -- decay sweep convenience
```

**FTS5 mirror policy:**
- Markdown is source-of-truth (PMD-AN-06).
- FTS5 row is created/updated on `op:promote` (decision moves to `decisions/`).
- FTS5 row is deleted on `op:forget`.
- FTS5 is NEVER consulted to fetch decision body — always reads `decisions/{slug}.md`. FTS5 only returns matching slugs.

## Per-phase architecture

### Phase 1 — Storage + Identity (v1.12.0)

**Concerns:** identity resolution algorithm, storage tree initialization, SQLite schema setup, CLI command plumbing without business logic.

**Data flow — identity resolution:**

```
caller wants identity
        ↓
read process.env.AIOSON_OPERATOR_ID
        ↓
        ├─ present → validateOverride(id) [PMD-05 regex]
        │            ↓
        │            ├─ valid → identity = id, source = 'override'
        │            └─ invalid → log stderr, fall through to email hash
        │
        ↓ (no override OR override invalid)
exec `git config --get user.email`
        ↓
        ├─ empty/error → identity = '_anonymous', source = 'anonymous-fallback', emit op_identity_unresolved
        │
        └─ has email →
            hash = sha256(email.trim())[0..16]
            ↓
            startsWith('_') OR startsWith('aioson-') ?
                ↓
                ├─ yes → hash = sha256(`aioson-v1:${email}`)[0..16]  -- salt rehash (EC-08)
                └─ no  → identity = hash, source = 'email-hash'
        ↓
ensureStorageTree(identity)
        ↓
INSERT OR UPDATE operators(identity, ...)
        ↓
return { identity, source, storage_root }
```

**Key files:** `src/operator-memory/identity.js`, `src/operator-memory/storage.js`, `src/commands/op-identity.js`, `src/commands/op-{capture,promote,forget,list,show}.js` (stubs), `src/cli.js`.

**Test coverage:** 12+ tests in `tests/operator-memory-identity.test.js` covering AC-P1-01..10.

### Phase 2 — Capture + Promotion (v1.13.0)

**Concerns:** signal capture pipeline (LLM-driven per PMD-02), promotion atomicity, FTS5 mirroring, prompt template versioning.

**Data flow — capture pipeline:**

```
agent emits: aioson op:capture --signal=authorization --quote="..." --proposal="..." --source-agent=dev
        ↓
parse args + validate signal_type ∈ {authorization, exclusion, correction, confirmation}
        ↓
slug = deriveSlug(proposal)  [src/operator-memory/slug.js]
        ↓
identity = resolveIdentity()  [Phase 1]
        ↓
check existing proposal at proposals/{slug}.md
        ↓
        ├─ absent → write proposal with detected_count=1, first_detected=now
        │           emit op_capture event {identity, signal_type, slug, proposal_count: 1}
        │           exit 0 silent
        │
        └─ present → detected_count++
                     ↓
                     count >= 2 ?
                         ↓
                         ├─ yes → BEGIN TRANSACTION:
                         │          write decisions/{slug}.md with promoted_at=now, last_reinforced=now,
                         │            reinforcement_count=0, category=inferCategory(signal_type, body),
                         │            version_schema="1.0"
                         │          INSERT INTO decisions_fts
                         │          delete proposals/{slug}.md
                         │          regenerateIndex(MEMORY.md) [Phase 3, no-op in Phase 2]
                         │        COMMIT
                         │        emit op_promote event {identity, slug, signal_type, days_to_promote}
                         │        stdout: ✔ Memory: '<proposal>'. aioson op:forget {slug} p/ desfazer.
                         │
                         └─ no  → update proposal {detected_count: 2, last_detected: now, append quote}
                                  emit op_capture {proposal_count: 2}
                                  exit 0 silent
```

**Atomicity boundary (AC-P2-03):** SQLite transaction + atomic file rename. Implementation pattern:
```js
const stmt = db.transaction(() => {
  db.prepare('INSERT INTO decisions_fts ...').run(...);
  fs.writeFileSync(decisionTmpPath, decisionBody);
  fs.renameSync(decisionTmpPath, decisionFinalPath);  // atomic on POSIX + Windows MoveFileEx
  fs.unlinkSync(proposalPath);
});
stmt();
```

Crash mid-`stmt()` → SQLite rolls back. Crash post-stmt but pre-process-exit → state is consistent (transaction succeeded). The `regenerateIndex` step (Phase 3) is outside the transaction since MEMORY.md is regenerable from FTS5 query.

**Category inference (Phase 2 V1 — simple keyword-based):**
- `identity`: signal_type=authorization AND body contains `["preferência", "estilo", "communication", "linguagem"]`
- `autonomy`: signal_type=authorization AND body contains `["commit", "push", "publish", "deploy", "merge"]`
- `tooling`: signal_type=authorization AND body contains `["cli", "tool", "comando", "aws", "gcp", "kubectl"]`
- `default`: everything else
- V2: LLM-tagged categorization (deferred).

**Key files:** `src/operator-memory/{proposal,decision,slug}.js`, `src/commands/op-{capture,promote,forget}.js`, `template/agents/_shared/memory-capture-directive.md`, extended `dossierTelemetry` event types.

### Phase 3 — Universal loading directive (v1.14.0)

**Concerns:** cross-cutting prompt directive injection (affects ~30 agent files), feature flag gating, byte budget audit, MEMORY.md tier-based format (PMD-AN-02), lazy decision loading.

**Data flow — agent preflight loading:**

```
agent session starts (template/CLAUDE.md or AGENTS.md preflight)
        ↓
check process.env.AIOSON_OPERATOR_MEMORY === 'true'
        ↓
        ├─ false/unset → skip (silent, AC-P3-02 backward-compat)
        │
        └─ true →
            identity = resolveIdentity()  [Phase 1]
            ↓
            read ~/.aioson/operators/{identity}/MEMORY.md  [active tier only]
            ↓
            file absent OR empty → skip silently
            ↓
            parse frontmatter + decision list
            ↓
            inject MEMORY.md content into agent context
            ↓
            agent receives task description
            ↓
            matchDecisions(memoryIndex, taskKeywords)  [V1: substring match on title + signal_type]
            ↓
            returns top-5 matched decision slugs
            ↓
            for each: lazy-load decisions/{slug}.md into agent context
```

**MEMORY.md format (PMD-AN-02 tier-based):**

```markdown
---
identity_prefix: a1b2c3d4
decisions_count: 12        # active tier
archived_count: 47         # MEMORY-archive.md
last_promoted: 2026-05-21T12:34:56Z
schema_version: "1.0"
---

# Operator Memory — Index

## Active decisions

- [Commit autonomy after slice approval](decisions/commit-autonomy-after-slice.md) — authorization, reinforced 2026-05-21
- [npm publish stays manual](decisions/npm-publish-manual.md) — exclusion, reinforced 2026-05-20
- ...

## See also

- `MEMORY-archive.md` — 47 archived decisions (last archival 2026-04-15)
```

**Tier transition (active → archive, runs in Phase 5 decay sweep but format defined here):**

```
decay sweep iterates active decisions in MEMORY.md
        ↓
for each: (now - last_reinforced) >= category_half_life ?
        ↓
        ├─ no → keep in active
        │
        └─ yes → remove line from MEMORY.md, add line to MEMORY-archive.md
                  decision file stays at decisions/{slug}.md (DD-A1 — file does not move)
                  emit op_decay_prompt {identity, slug, category, days_stale} (also fires preflight stderr message)
                  update _decay_state.json with last_decay_prompt_at
```

**Universal directive — exact insertion (≤ 300 tokens per AC-NFR-02-a):**

Insertion point in template/CLAUDE.md: AFTER existing `## Mandatory first action` numbered list, BEFORE `## Agents` heading. Two new sections:

```markdown
## Memory loading
If `process.env.AIOSON_OPERATOR_MEMORY === 'true'`:
1. Read `~/.aioson/operators/{sha256(git-email)[0..16]}/MEMORY.md` if it exists.
2. For decisions whose description matches the current task: lazy-load `decisions/{slug}.md`.
3. Apply each loaded decision without asking the user.
4. If a project rule in `.aioson/rules/` conflicts with a loaded decision, project rule wins — surface the warning, do not silently override.

## Memory capture
While conversing, watch for the 4 standing-decision signals defined in `template/agents/_shared/memory-capture-directive.md` (authorization, exclusion, correction, confirmation 2x+). When detected, emit `aioson op:capture --signal=<type> --quote="<verbatim>" --proposal="<paraphrase>" --source-agent=<self>`. Capture is best-effort — do not crash the session on capture failure.
```

Token count for directive: ~210 tokens (well under 300 cap). Audit script verifies + reports.

**Key files:** template/CLAUDE.md (additive insertion), template/AGENTS.md (mirror via T5 semantic parity), `src/operator-memory/loader.js`, `src/operator-memory/index-md.js`, `src/commands/op-{list,show}.js`, `scripts/memory-budget-audit.js`, `.aioson/docs/operator-memory/memory-md-format.md`.

### Phase 4 — Conflict policy (v1.15.0)

**Concerns:** binary conflict policy enforcement (PMD-09), keyword-based detection heuristic, debounce, feature flag flip default-on.

**Data flow — conflict detection at preflight:**

```
memory loading completes (Phase 3 directive)
        ↓
detectConflicts(memoryIndex, .aioson/rules/*.md):
   for each loaded decision D:
     for each project rule R:
       R has frontmatter conflicts_with_signal_types?
         ↓
         ├─ no → skip (R doesn't opt in)
         │
         └─ yes → D.signal_type ∈ R.conflicts_with_signal_types ?
                    ↓
                    ├─ no → skip
                    │
                    └─ yes → keyword overlap between R.body and D.body >= 2 (case-insensitive, stopwords filtered) ?
                                ↓
                                ├─ no → skip
                                │
                                └─ yes → record conflict {decision_slug, rule_path, reason, severity: 'warning'}
        ↓
for each recorded conflict C:
  check _conflict_state.json — last_warned[C.key] < now - 60s ?
        ↓
        ├─ no → silent (debounced)
        │
        └─ yes → emit stderr: ⚠ Operator memory '{C.decision_slug}' conflicts with project rule '{C.rule_basename}'. Project rule applies.
                  emit op_conflict_warning event
                  update _conflict_state.json
```

**Keyword overlap implementation (V1 simple — V2 LLM-tagged):**
```js
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'of', 'to', 'for', 'in', 'on', 'with', 'que', 'de', 'em', 'para', 'sem', 'com']);
function keywordOverlap(textA, textB) {
  const wordsA = new Set(textA.toLowerCase().match(/[a-z0-9-]+/g).filter(w => !STOPWORDS.has(w)));
  const wordsB = new Set(textB.toLowerCase().match(/[a-z0-9-]+/g).filter(w => !STOPWORDS.has(w)));
  return [...wordsA].filter(w => wordsB.has(w)).length;
}
```

Threshold ≥ 2 shared keywords. Configurable via `AIOSON_OPERATOR_CONFLICT_KEYWORD_THRESHOLD` (default 2). FP corpus tests tune threshold.

**Feature flag flip:** Phase 4 CHANGELOG entry documents `AIOSON_OPERATOR_MEMORY` default changing from `false` → `true`. Backward-compat: `AIOSON_OPERATOR_MEMORY=false` still respected for opt-out. CI gate before merge: smoke runs both flag=false (baseline) AND flag=true (post-flip) — both must be green.

**Key files:** `src/operator-memory/conflict.js`, extended `src/operator-memory/loader.js`, template directive update, `tests/operator-memory-conflict.test.js`, FP/FN corpus in `tests/fixtures/operator-memory/conflict-corpus/`.

### Phase 5 — TTL decay + migration + closure (v1.16.0)

**Concerns:** per-category decay (PMD-03), 10k hard cap enforcement (PMD-04), `user-profile.md` migration, history cleanup, cross-phase consolidation.

**Data flow — decay sweep:**

```
preflight after Phase 3 loading
        ↓
read _decay_state.json
        ↓
read MEMORY.md active tier
        ↓
for each decision D in active:
  category_half_life = HALF_LIFE_DAYS[D.category]  // 365|180|90|90
  stale = (now - D.last_reinforced) >= category_half_life
        ↓
        ├─ not stale → skip
        │
        └─ stale →
            last_prompted = _decay_state.json[D.slug] OR never
            (now - last_prompted) >= 30d ?
                ↓
                ├─ no → skip (debounced)
                │
                └─ yes → emit stderr: ⏱ Memory '{D.slug}' is {N}d stale ({D.category}, half-life={H}d). Still valid? aioson op:reinforce {D.slug} | op:forget {D.slug}
                          update _decay_state.json[D.slug] = now
                          emit op_decay_prompt event
            tier transition (DD-A1): remove from MEMORY.md, add to MEMORY-archive.md
                                      (decision file stays at decisions/{slug}.md)
```

**Data flow — hard cap enforcement at promotion:**

```
op:promote about to write decision N+1 where N = count(decisions for identity)
        ↓
N + 1 > 10000 ?
        ↓
        ├─ no → proceed normally
        │
        └─ yes →
            scan decisions WHERE category != 'identity'
            sort by last_reinforced ASC
            pick oldest M = N + 1 - 10000 = 1 (typically)
            for each: move to history/{ISO}-pruned-{slug}.md (soft-delete)
                       remove from FTS5
                       remove from MEMORY.md (active) or MEMORY-archive.md (archive)
                       emit op_history_cleanup {reason: 'hard_cap', pruned_count: 1}
            proceed with promotion of N+1
```

**Data flow — `op:migrate`:**

```
aioson op:migrate
        ↓
read .aioson/context/user-profile.md
        ↓
already deprecated (frontmatter has deprecated_by: operator-memory) ?
        ↓
        ├─ yes → exit 0, emit op_migrate_skip
        │
        └─ no →
            extract known fields (8-dimension schema: autonomy_preference, communication_style, ...)
            for each field:
              slug = `{field-name}-{value}` (e.g. autonomy-preference-high)
              decision already exists at decisions/{slug}.md ?
                ↓
                ├─ yes → skip + emit op_migrate_skip {field, reason: 'already_exists'}
                │
                └─ no → write decisions/{slug}.md with:
                        category='identity', signal_type='authorization',
                        promoted_at=now, last_reinforced=now,
                        source_agent='migrate', body=value,
                        version_schema="1.0"
                        emit op_migrate {field, slug}
            update user-profile.md frontmatter: deprecated_by: operator-memory, deprecated_at: <ISO>
            stdout: ✔ Migrated N fields from user-profile.md (M skipped as existing).
```

**History cleanup (background-like, runs at decay sweep):**

```
read history/ entries
        ↓
for each: (now - mtime) >= 365d ?
        ↓
        ├─ no → skip
        │
        └─ yes → fs.unlink (hard delete)
                  emit op_history_cleanup {reason: 'age_365d', count++}
```

**Key files:** `src/operator-memory/{decay,prune}.js`, `src/commands/op-{reinforce,migrate}.js`, `src/commands/op-identity.js` (full `set` impl replacing Phase 1 stub), tests, smoke runner `[OM-ALL]` cross-phase section, `.aioson/context/wiring-audit-operator-memory.md` cross-phase consolidation table.

## Cross-cutting concerns

### Error handling

- **Best-effort capture** (BR-AN-03): `op:capture` failures NEVER crash agent sessions. Catch-all error handler in `runOpCapture` logs to stderr + exits 1, but the agent's caller treats this as informational.
- **Best-effort loading** (Phase 3): if MEMORY.md is malformed or directory missing, directive's pseudocode degrades silently (no memory loaded; behaves like flag=false).
- **Fail-loud on identity validation** (PMD-05): invalid `AIOSON_OPERATOR_ID` emits stderr warning + falls back to email-hash. Documented behavior.
- **Fail-loud on schema corruption** (EC-04): `_index.sqlite.corrupt.{ISO}` renamed + rebuild from markdown. Telemetry `op_index_rebuild` captures incident.

### Atomicity boundaries

- **Single-file writes:** atomic via `fs.writeFileSync` to `.tmp` + `fs.renameSync` to final path. POSIX `rename(2)` and Windows `MoveFileEx` are atomic.
- **Multi-file operations** (e.g. promote which writes decision + deletes proposal + updates FTS5): SQLite transaction wraps all FS operations. Commit-or-rollback semantics inherited from SQLite.
- **Cross-process safety:** SQLite WAL mode enables concurrent reads + serialized writes. No file-level locking needed.

### Security

- **Email never on disk:** identity resolution hashes in-process; raw email never written to `~/.aioson/` or telemetry payloads.
- **Override validation** (PMD-05): regex rejects malformed `AIOSON_OPERATOR_ID`. Reserved prefixes `_*` + `aioson-*` blocked (with `_anonymous` and `aioson-v1` salt as documented internal exceptions).
- **No remote calls:** V1 is machine-local. No network, no telemetry endpoint, no cloud sync.
- **History soft-delete:** `op:forget` moves to `history/`, not hard-delete. User-recoverable via `op:restore` (V2). Hard-delete at 365d age (Phase 5 cleanup).
- **Project-rule precedence** (PMD-09): operator decisions can never override explicit `.aioson/rules/`. Audit trail via `op_conflict_warning` telemetry.

### Observability

- **Telemetry events** (PMD-12 + DD-04 ratified): 12 event types via existing `dossierTelemetry`. Existing dashboard infrastructure reads them automatically.
- **State files** (`_conflict_state.json`, `_decay_state.json`): inspectable JSON for debugging debounce behavior.
- **Wiring audit cross-phase table:** `.aioson/context/wiring-audit-operator-memory.md` Gate D blocker (BR-05/PMD-07 pattern from workflow-handoff-integrity).
- **Smoke runner cross-phase section** (`[OM-ALL]`): end-to-end validation in CI per T6 pattern.

### Backward compatibility

- **AIOSON_OPERATOR_MEMORY flag**: default OFF until Phase 4 ships green. Opt-in until v1.15.0.
- **Additive schemas only**: every phase adds files/columns/event types. Zero destructive migrations within V1.
- **`user-profile.md`**: preserved (read-only post-migration), marked deprecated. Existing agents reading it still work.
- **Project rules schema**: `conflicts_with_signal_types` is OPTIONAL frontmatter field. Existing rules without it generate zero false-positive warnings.
- **CLI surface stable**: 8 `op:*` commands ship across phases (6 in Phase 1 stubs, 2 added in Phase 5). No removals.

## Implementation sequence for @dev

Mapped to existing AIOSON patterns. Each slice is a self-contained PR/commit.

### Phase 1 (v1.12.0) — 5 slices

1. **Identity helpers** (`src/operator-memory/identity.js`): pure functions — `resolveIdentity`, `validateOverride`, `hashEmail`, salt-rehash for reserved prefix collision. Unit tests AC-P1-01..05.
2. **Storage tree** (`src/operator-memory/storage.js`): `ensureStorageTree`, `openIndexDb`, `migrateIndexSchema`. Idempotent. AC-P1-06, AC-P1-08, AC-P1-09.
3. **`op:identity` command full** (`src/commands/op-identity.js`): `show` + `set` (Phase 5 completes set). Wire in `src/cli.js`. AC-P1-03, AC-P1-04.
4. **5 CLI stubs** (`src/commands/op-{capture,promote,forget,list,show}.js`): each emits `Not yet implemented (Phase 2+)` with `op_command_stub` telemetry. AC-P1-07.
5. **Tests + wiring audit Phase 1 entry**: `tests/operator-memory-identity.test.js` (12+ tests); `wiring-audit-operator-memory.md` Phase 1 section + call sites grep.

### Phase 2 (v1.13.0) — 6 slices

1. **Slug derivation** (`src/operator-memory/slug.js`): deterministic kebab + truncate + collision suffix. AC-P2-02.
2. **Proposal CRUD** (`src/operator-memory/proposal.js`): write, increment, delete operations on `proposals/*.md`. AC-P2-01.
3. **Decision CRUD + atomic promote** (`src/operator-memory/decision.js`): transactional promote with FTS5 mirror. AC-P2-03, AC-P2-09.
4. **`op:capture`, `op:promote`, `op:forget` impls**: replace Phase 1 stubs. Telemetry. AC-P2-04..08.
5. **Versioned prompt template** (`template/agents/_shared/memory-capture-directive.md`): 4 signal types × 3+ examples + anti-patterns + capture-call format. AC-P2-10..11.
6. **Tests + smoke OM2 + wiring audit Phase 2 entry**: 18+ unit tests + smoke runner `[OM2]` section.

### Phase 3 (v1.14.0) — 6 slices

1. **Loader + index-md** (`src/operator-memory/{loader,index-md}.js`): pure functions — `loadMemoryIndex`, `matchDecisions`, `regenerateIndex`. Substring match V1 (AC-P3-09, AC-P3-10).
2. **Directive injection** (`template/CLAUDE.md` + `template/AGENTS.md`): two sections at consistent position; T5 semantic parity verifies (AC-P3-01, AC-P3-11).
3. **`op:list`, `op:show` impls**: `--format=table` + `--format=json`. AC-P3-03, AC-P3-04.
4. **Byte budget audit script** (`scripts/memory-budget-audit.js`): count directive bytes; threshold 5k warn / 6k fail. CI integration. AC-P3-06.
5. **Cross-harness format spec** (`.aioson/docs/operator-memory/memory-md-format.md`): canonical schemas + support matrix (Claude Code / Codex / Gemini native; Cursor / Aider TBD). AC-P3-07.
6. **Tests + smoke OM3 + wiring audit Phase 3 entry**: 15+ unit tests + backward-compat baseline (AC-P3-08) + smoke runner `[OM3]` section.

### Phase 4 (v1.15.0) — 5 slices

1. **Conflict detection** (`src/operator-memory/conflict.js`): `detectConflicts`, `formatConflictWarning`. Keyword threshold + stopword filter. AC-P4-01, AC-P4-06.
2. **Debounce state** (`_conflict_state.json` handling in loader): 60s window per (decision_slug, rule_path) pair. AC-P4-03.
3. **Directive update** (`template/CLAUDE.md` + `template/AGENTS.md`): wire conflict-warning emission into preflight. T5 parity. AC-P4-09.
4. **FP/FN corpus** (`tests/fixtures/operator-memory/conflict-corpus/`): 10 conflict pairs + 15 non-conflict pairs. AC-P4-07.
5. **Feature flag flip + tests + smoke OM4 + wiring audit Phase 4 entry**: AIOSON_OPERATOR_MEMORY default → true (AC-P4-08), 15+ unit tests, smoke runner `[OM4]` section, CI gate.

### Phase 5 (v1.16.0) — 7 slices

1. **Decay engine** (`src/operator-memory/decay.js`): per-category half-life, decay sweep, debounce 30d. AC-P5-01, AC-P5-03.
2. **Prune engine** (`src/operator-memory/prune.js`): 10k cap, oldest non-identity first, history/ archive. AC-P5-07.
3. **`op:reinforce` impl** (`src/commands/op-reinforce.js`): updates `last_reinforced`; archive→active tier transition. AC-P5-04.
4. **`op:migrate` impl** (`src/commands/op-migrate.js`): reads user-profile.md, creates decisions, marks deprecated. Idempotent. AC-P5-05, AC-P5-06.
5. **`op:identity set` full** (`src/commands/op-identity.js` extended): replace Phase 1 stub. AC-P5-09.
6. **History cleanup**: hard-delete entries > 365d in history/. AC-P5-08.
7. **Cross-phase consolidation + closure**: wiring audit Phase 5 + cross-phase table (AC-P5-10), smoke runner `[OM-ALL]` (AC-P5-11), CHANGELOG v1.16.0 (AC-P5-12), `gate:approve --gate=D`, `features.md` → done, `feature:archive`.

## Migration order

Additive across phases — see `requirements-operator-memory.md` § Migration order. Architect ratifies that order. **No destructive migrations within V1.** V1 → V2 schema bumps reset via `rebuildIndexFromMarkdown` (DD-A2).

## Explicit non-goals / deferred items

### V2 deferred (post-stabilization)

- Cross-machine sync via git share of `~/.aioson/operators/.sync/` (privacy risk review pending)
- GUI / TUI dashboard
- LLM-tagged categorization (Phase 2 uses keyword heuristic for V1)
- LLM-tagged conflict detection (Phase 4 uses keyword threshold for V1)
- Full Zep validity-window pattern (`start_at`/`end_at` per fact)
- `op:restore` for history/ items
- `op:override` for project-rule-conflict gradient (PMD-09 binary V1)
- Auto-detect profile via behavioral heuristics
- Scope tags (`this-turn`/`this-project`/`always`) for over-fire prevention beyond 2x threshold
- Email-change rebase command (`op:identity rebase <old-hash>` for EC-02)

### Out of scope entirely (not planned)

- Java/Python SDK ports — AIOSON is Node.js CLI
- Memory cloud service — V1 is machine-local; commercial offering not in scope
- Encryption-at-rest for decisions — OS-level filesystem permissions sufficient for V1 threat model
- Multi-language signal detection beyond pt-BR + en — coverage acceptable for V1

## Handoff to @ux-ui

**N/A** — operator-memory is a CLI-only feature with no UI. `op:list --format=table` is the only "view"; ASCII formatting is documented in `requirements-operator-memory.md` § MEMORY.md format spec. No `@ux-ui` involvement required.

> **Gate B:** Architecture approved — @pm can proceed (MEDIUM chain: architect → pm → dev → qa).
