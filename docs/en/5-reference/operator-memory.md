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

The slug is deterministic. Promotion now depends on signal type:

| Signal | Detections to promote |
|---|---:|
| `authorization` | 1 |
| `exclusion` | 1 |
| `correction` | 1 |
| `confirmation` | 2 |

An explicit authorization, exclusion, or correction is already a standing decision. `confirmation` still needs two observations so a one-off acceptance does not become a permanent preference.

## Idempotent reinforcement

When an already-promoted signal is detected again, AIOSON does not create another FTS row or reset `promoted_at`. It only refreshes `last_reinforced` and increments `reinforcement_count`.

Manually reinforce a decision with:

```bash
aioson op:reinforce autonomous-commit-after-approval --json
```

The command preserves the title, body, and trigger quotes byte-for-byte. To forget a decision, use the slug printed by `op:capture`:

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

`MEMORY.md` is a small index; the decision body lives in `decisions/{slug}.md`. `MEMORY-archive.md` holds decisions outside the active tier, and `history/` receives forgotten items.

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
5. If a title is not loaded, check whether `.aioson/rules/` is winning or the item moved to the archive tier.
