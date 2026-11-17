# Operator memory

Operator memory stores durable decisions made by the person using AIOSON, isolated by local identity. It is optional, lives under `~/.aioson/operators/`, and should never be committed to the project.

## Enable or disable it

On v1.15.0 and newer installations, automatic loading is **on by default**. To explicitly opt out:

```bash
$env:AIOSON_OPERATOR_MEMORY="false"  # PowerShell
export AIOSON_OPERATOR_MEMORY=false   # macOS/Linux
```

On older installations, `AIOSON_OPERATOR_MEMORY=true` enables the behavior. When enabled, an agent reads `MEMORY.md` at session start and lazy-loads a full decision only when its title or signal type matches the task. If a `.aioson/rules/` rule conflicts with a decision, the project rule always wins and the memory layer reports the warning on stderr.

## Identity and storage

The default identity is `sha256(git config user.email)[0..16]`. In CI or on a shared machine, use an explicit per-process ID:

```bash
aioson op:identity show --json
aioson op:identity set ci-bot-shared
```

Storage layout:

```text
~/.aioson/operators/{identity}/
├── MEMORY.md              # active decisions, loaded at preflight
├── MEMORY-archive.md      # archived decisions, loaded on demand
├── decisions/             # decision source of truth
├── proposals/             # signals waiting for promotion
└── history/               # forgotten/archived items
```

The explicit ID applies to the current process; persist it in the CI environment if that is the intended behavior.

## Capture a decision

Agents watch for four signal types: `authorization`, `exclusion`, `correction`, and `confirmation`.

```bash
aioson op:capture \
  --signal=authorization \
  --quote="You can commit after I approve the slice" \
  --proposal="autonomous commit after explicit approval" \
  --source-agent=dev
```

The slug is deterministic. Promotion depends on the signal type and on what the user's verbatim quote says:

| Signal | Detections to promote |
|---|---:|
| `authorization` | 1 when the quote says it holds from now on; else 2 |
| `exclusion` | 1 |
| `correction` | 1 |
| `confirmation` | 2 |

Exclusions and corrections hold at once: forgetting a prohibition is a failure nobody sees. An authorization holds at once only when its quote carries a standing marker ("always", "from now on", "no need to ask", "sempre", "daqui pra frente", "de ahora en adelante", or naming every project); "yes", "confirmed" or a picked option answer one moment and wait for their repeat. A quote that bounds itself to the moment waits too, whatever marker it holds: "I never saw this; do it now", "finish this task", "run this once" ("now", "this task", "this once"; "from now on" and "a partir de agora" are still markers). "Always" and "never" count only when they govern an instruction: "never saw", "always thought" tell what happened. Phrases that keep the current work going ("keep going", "feel free", "sem pausa", "pode ir fazendo") are no marker. While one waits, `op:capture` says so in one line (`held: "awaiting_repeat"` with `--json`), so the agent never claims it remembered.

A repeat is recognized by meaning, not by text: the agent's paraphrase changes every session, so a signal with nothing at its exact slug is compared with the decisions and proposals of its type by content words (Jaccard ≥ 0.4, at least 3 shared words) and matches only when they name the same identifiers (numbers, versions, feature or file slugs): "phase 2" and "phase 3" stay two decisions. Three guards read the sentence, not just its words: the same polarity ("use Tailwind" and "don't use Tailwind" are two), the same direction when it states a preference or a replacement ("prefer Postgres to MySQL" and "prefer MySQL to Postgres" are two), and no object swapped inside the same frame ("commit the login fix" and "commit the payments migration" are two). Matched by meaning, the output carries `matched_by: "meaning"` and the similarity. Only a close match (similarity ≥ 0.6) carries the signal into a project the entry was never seen in — that second project is what widens a decision to every project; below it the signal joins the entry only in the same project, or stands as its own.

A decision binds the project it was said in until the same signal is detected in a second project or the user's own quote names every project ("em todos os meus projetos", "in every project"). A negation keeps it local only when it negates that scope ("não se aplica a todos os projetos", "doesn't apply to every project", "nem em todos"); a negated action does not: "nunca use yarn em qualquer projeto" and "never push to main in any repo" are prohibitions for every project.

A decision saved before scopes existed (no `scope` field) never recorded where it applies. It falls in one of two classes:

- **Active:** its quote carries a standing marker, or it was reinforced. It stays out of the head every session gets unasked and answers when the task names it (`--match`) with two words or more (or every word asked).
- **Archived (`unproven`):** no marker, never reinforced. It does not answer `--match`; only `aioson op:list . --include-archived --match="<words>"` (or `--limit=0` for all) lists it. `op:list` reports how many were left out in `archived`.

Said again in an identifiable project, an unscoped decision without a marker is adopted by that project (`adopted: true`) — even when an earlier repeat in a folder with no project already reinforced it — and widens in a second project like any other. A decision without `scope` promoted after this CLI began always writing one came from an older CLI sharing the store: it applies to every project, as that CLI answered, and is not archived.

## Idempotent reinforcement

When an already-promoted signal is detected again, AIOSON does not create another FTS row or reset `promoted_at`. It refreshes `last_reinforced`, increments `reinforcement_count` and keeps the new quote with the earlier ones (up to 5: the first, those naming every project, then the newest) — "in all my projects" said on a repeat is the proof that makes the decision a habit.

Captures, promotions, reinforcements and forgets of one operator run one at a time (a cross-process lock in the store's folder): two sessions capturing at once count two repeats, and the daily sweep never archives a proposal another capture just renewed.

Manually reinforce a decision with:

```bash
aioson op:reinforce autonomous-commit-after-approval --json
```

The command preserves the title, body, and trigger quotes byte-for-byte (it takes no quote). To forget a decision, use the slug printed by `op:capture`:

```bash
aioson op:forget autonomous-commit-after-approval
```

## Inspect and administer

```bash
aioson op:list
aioson op:list --proposals
aioson op:list --include-archived
aioson op:show <slug> --json
```

The session-start recall (`aioson op:list --json --titles-only`) prints `items` as one `slug: title` map (signal, category and dates stay in `op:show` and the table; an archived decision or one bound to another project says so in brackets after its title) and lists the 40 decisions ranked first: this project's first; within each group, exclusions and corrections before authorizations and confirmations (forgetting a prohibition is a failure the agent cannot see, forgetting a permission only costs a question); then the freshest by category half-life and reinforcements. Whenever a head applies, the output carries `total` and `omitted` (0 when nothing is left out); `--match="<task words>"` finds the rest (words of two letters or more, such as `CI` and `PR`; with no usable word the output says `match_ignored: true` and the normal head applies) and `--limit=0` lists all. The default head belongs to this activation shape only: `--titles-only` also cuts the text table, while `--feature` and `--proposals` list everything unless `--limit` is given.

Commands that take a slug accept `[path] <slug>` and also `<slug> [path]` (`aioson op:show <slug> .`). The lines `op:capture` and `op:promote` print follow `--locale` when it is given and the project's `interaction_language` otherwise.

`MEMORY.md` is a small index; the decision body lives in `decisions/{slug}.md`. `MEMORY-archive.md` lists the decisions out of the recall, with the reason, and is a reading of each decision, not a file move: `op:show` and `op:list --include-archived` still read them, and a reinforcement brings one back. Two reasons:

- `unproven`: an unscoped decision, never reinforced, whose quote has no standing marker;
- `stale`: a permission (`authorization`, `confirmation`) not reinforced for two of its category's half-lives (180 days for `default`). Exclusions and corrections never age out: an obeyed prohibition is never said again.

`identity` decisions never archive. `op:list` reports how many were left out (`archived`).

Once a day, `op:capture` tends the store: proposals not repeated within 90 days move to `history/` (recoverable there for a year), `history/` entries older than a year go, and the index is rewritten. This upkeep never deletes a decision.

## Projects on this machine

Every session start (`context:digest`) records the project it opens in `~/.aioson/projects.json`: path, name (`project_name`), first and last seen. Only AIOSON roots with `.aioson/context/project.context.md` enter; never a folder inside `.aioson/` nor a throwaway folder under the OS temp dir. The list is written at most once an hour per project, a project whose folder is gone leaves at the next write, and nothing leaves the computer. Turn it off with `AIOSON_PROJECT_REGISTRY=false` (or with operator memory off).

`aioson op:profile` reads that list and answers, with no model, what you usually choose: type, framework, language, Autopilot, test runner, size and design, each counted; the defaults for a new project (clear majorities only: at least 3 projects hold the field, they are at least half the projects, and one value holds 60% of them; size and design are shown, never suggested); the projects behind the CLI version, oldest first; and the decisions standing in two or more projects. `--scan=<folder>` imports the projects already on disk at once (`--depth=<n>`, default 3; dependency and hidden folders and a project's inside are skipped). `--json` returns it all as fields (`choices`, `suggested`, `outdated`, `habits`, `recent`).

In a new project, `aioson setup:detect . --json` carries `portfolio` when 3 or more other projects hold a clear majority: the same defaults (the project being set up never votes) and the `setup:context` `flags` that persist them (`--project-type=web_app --framework=Node --language=pt-BR --auto-handoff=true`). `@setup` offers them as the recommended answer where the workspace proves nothing, saying where they come from; workspace evidence always wins and nothing is written unconfirmed.

At every session start, `context:digest` shows in `memory.habits` up to 5 decisions standing in two or more projects (seen in two distinct projects or said for every project in your own words), apart from this project's head and never listed twice. While there is none, the field is absent.

## Privacy and limits

- memory is identity-scoped and is not synchronized through Git;
- quotes are bounded and provide an audit trail;
- capture is best-effort and must not interrupt an agent session;
- project rules override personal decisions;
- the local SQLite/FTS5 index is rebuildable from Markdown files;
- to share a decision with a team, put it in a versioned project rule or document instead of copying `~/.aioson/operators/`.

## Quick diagnosis

1. Run `aioson op:identity show` and confirm the expected identity.
2. Check `AIOSON_OPERATOR_MEMORY=true` in the same process used by the AI client.
3. Run `aioson op:list --proposals` to distinguish a pending signal from a promoted decision.
4. Use `aioson op:show <slug>` to inspect `signal_type`, `promoted_at`, and `last_reinforced`.
5. If a title is not loaded, check whether `.aioson/rules/` is winning or the item moved to the archive tier (`aioson op:list --include-archived` shows the reason).
