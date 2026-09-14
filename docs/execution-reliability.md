# Orchestration reliability and measurement

New `execution:compile` plans snapshot a quality policy. Existing compiled runs
retain their plan and policy; do not recompile a running feature to adopt runtime
recovery. Updating AIOSON makes the implementation available to other projects;
generating a new compilation applies planning policy changes. Runtime recovery is
selected and persisted when starting or resuming an engine. No running process or
historical record is migrated or restarted automatically.

## Context and bounded units

The operational default is `min(80,000 tokens, 50% of a known model window)`.
Thus both a 200k and a 1M model default to 80k; a known 128k model defaults to 64k.
This is a configurable engineering heuristic, not a measured universal optimum
for model quality. An unknown window stays unknown; the absolute cap still applies.

Optional `.aioson/config/execution-policy.json`:

```json
{
  "version": 1,
  "context": {
    "max_fraction": 0.5,
    "max_tokens": 80000,
    "max_continuations": 2,
    "models": [
      { "host": "codex", "model": "exact-model-id", "context_window_tokens": 200000, "max_tokens": 60000 }
    ]
  },
  "qa": { "require_pass": true, "max_rework_rounds": 1 }
}
```

Use the exact configured model identity. Fractions must be >0 and <=0.5; the
absolute cap is 1,000..200,000 tokens; continuations and rework allow 0..3.
Runtime fallback candidates receive their own budget. Known smaller windows
take precedence over a larger configured window. The compiled policy is immutable
for a run; changing configuration takes effect on subsequent compilations.

Compilation refuses units beyond the existing default ceiling of 10 files or
6 acceptance criteria. The explicit `AIOSON_EXECUTION_UNIT_MAX_FILES` and
`AIOSON_EXECUTION_UNIT_MAX_ACS` overrides remain available. Required source files,
the prompt and declared prototype reads are measured by bytes; a conservative
bytes/2 estimate must fit half the operational budget, reserving the rest for
subsequent reads, tools and output. This estimate is not a tokenizer and cannot
predict hidden host instructions or future tool output. Split large units;
raising a file ceiling does not bypass the token estimate.

For a large existing file, an optional `Read ranges` column in Execution Sequence
can specify initial inclusive lines: `src/editor.ts:1-60; src/editor.ts:400-480`.
Compilation validates ownership and bounds, measures the actual selected UTF-8
bytes (overlaps once), and retains the full file size separately. Unlisted files
remain full reads. The prompt requires focused symbol searches when lines move;
these ranges guide initial reading, not write permissions or total runtime usage.

At runtime, Codex receives its native `model_auto_compact_token_limit` at 80% of
the operational cap. OpenCode and Claude expose per-call input usage; compatible
Codex token-count events expose last-call context. When an observed context reaches
the cap, the engine stops its own child process, preserves files and writes a
checkpoint, then opens a fresh process up to the continuation ceiling. Reports
receive distinct continuation paths. In bounded recovery, exhaustion requires a
decision; continuous recovery starts another attempt with the preserved checkpoint.

To prioritize completion without AIOSON's runtime token cutoff, use
`aioson execution:run . --feature=<slug> --resume --no-context-limit` (omit
`--resume` for a new run). This disables the operational token guard and its
injected Codex compaction threshold for that run; the harness keeps its native
window/compaction. Usage collection, progress notes, dependency checks and QA
remain enabled. The choice persists across subsequent resumes without recompiling
the plan or discarding approved units. `--context-limit` enables the guard again.
Fresh runs use the normal guard unless explicitly opted out. These flags do not
change planning estimates, per-unit timeouts or a harness's own limits. They apply
when starting/resuming an engine, not by attaching to an already running process.

Workers also maintain a small progress notebook (at most 12 KB) per run, unit and
DEV/QA stage under `execution-checkpoints/`. The runtime includes these notes in
each fresh prompt and snapshots them at a context stop. Notes carry concrete code
locations, completed slices, test results and the next action, preventing discovery
from being lost with the conversation. They never count as a QA verdict. Missing
or oversized notes are reported as unavailable, not as completed work. Workers are
instructed to save discoveries within six investigation calls and implement small
slices with focused reads; a hard stop cannot guarantee a noncompliant worker has
written notes. This protocol also applies when resuming an existing policy-enabled
plan with the updated engine; already approved units remain untouched.

**The guard is reactive, not a universal pre-inference hard limit.** A host can
emit usage only after a call, and Codex's ordinary turn totals are cumulative,
not the current window. Antigravity currently has no unambiguous per-call context
measurement in the documented format. For these cases the protection is bounded
units, focused reads and native compaction where available; missing measurements
are never presented as proof that the context remained under the cap.

## Scheduling and acceptance

Planner instructions group independent units from different phases in the earliest
safe wave and require artifact/interface evidence for dependency edges. Compilation
does not guess dependencies or rewrite a live plan. Without explicit edges, existing
wave barriers remain; with edges, units become runnable when their prerequisites
pass. The shared concurrency cap covers DEV-to-QA unit pipelines, not dedicated
backend/frontend slots. Exact file conflicts prevent simultaneous writers across
waves. A unit waiting for a dependency, review or file may leave capacity idle.

Unit DEV and QA prompts use their local `Done when`; capability-wide checks remain
in `integration.verification` for the integration owner. This prevents a frontend
unit from failing simply because another unit has not created its integration test.
Local approval never proves end-to-end feature acceptance. In bounded recovery,
QA gets one automatic rework round by default; an explicit lane manifest value
wins and exhausted failures pause dependent work. `skip-qa` remains an explicit
recorded waiver. `after_dev`
edges can release consumers before QA; if the producer is reworked, the integration
owner receives a finding requiring reconciliation. Final integration and feature QA
remain required under the existing workflow.

Each backend/frontend implementation starts with the project's derived DEV lane
profile, its configured host/model, file ownership and local acceptance criteria.
The engine owns scheduling and stage transitions. A separate QA process then
verifies the delivery with the reviewer configured for that lane.

With `orchestration.mode: autopilot`, an unset recovery choice now defaults to
continuous recovery. `execution:run --resume --until-complete` explicitly enables
it for an existing run without recompilation or loss of approved units. DEV
FAIL/BLOCKED and failed QA acceptance return to the configured DEV with findings,
report references and regression history. QA must replay earlier failing cases;
passing an old test suite alone is insufficient. Process/report errors retry the
affected stage with a fresh attempt identity; a QA process failure does not redo
approved DEV work. Technical retries preserve earlier concrete findings.

Continuous recovery continues beyond the bounded rework budget, with a short
increasing delay for technical retries. It neither switches models nor waives QA.
`--bounded-recovery` restores finite retries and persists that choice. `--step`
disables continuous recovery for that activation. Authentication, unavailable
hosts/capacity, configuration and unresolved product decisions still need their
actual cause addressed; no retry mechanism can invent external access or approval.

Missing, malformed or incorrectly bound reports require the producer to verify
existing work and submit a fresh report using the current execution contract.
Validation errors remain in the repair prompt; the engine never edits identity
fields to turn a rejected report into approval. Codex, Claude, OpenCode, Qwen and
Antigravity receive prompts through stdin. Grok uses its native prompt-file option
for large tasks. Current Kimi Code receives a short instruction to read the full
task file; the legacy kimi-cli `--print` flag is not sent to that different CLI.
Task files preserve the full runtime contract, live under
`.aioson/runtime/adapter-prompts/` and are removed after exit, failure or timeout.
A forcibly killed parent can leave one behind. No context is truncated to fit
Windows' argument limit, and a transport change never changes a verdict.

To execute final integration without leaving a session-owned unit, assign its
exact files to an existing configured lane and give that unit dependencies on
all producers. Include build, runtime and regression checks in that unit's local
Done when. Files outside all lanes remain the supervising session's responsibility.

## Usage and equivalent API cost

Structured JSONL is collected for Codex, OpenCode, Claude and Antigravity. Other
hosts and external-client spawners that return only a report return unknown usage.
Parsers bound line size and record count, deduplicate
turns/steps/messages and discard arbitrary tool text. Failed, retried and continued
attempts retain available usage. Missing data is null, never zero. Old ledgers do
not gain retroactive tokens. Interrupted attempts stop at their last observed
heartbeat and are marked incomplete; archived time remains frozen.

Input includes cache when the protocol defines that relationship. Cost multiplies
disjoint uncached-input, cache-read, cache-write and output buckets. OpenCode's
separate reasoning tokens are included in billable output; Codex reasoning is
already included and is not added twice. Claude assistant output placeholders
are not counted as final output. Antigravity's published examples leave cache
inclusion ambiguous, so its price decomposition remains partial.

`aioson execution:prices . --refresh --json` fetches the official OpenRouter model
catalog over HTTPS and writes `.aioson/config/execution-prices.json` atomically.
Without `--refresh`, the command only reads local metadata. The response is bounded
and invalid data does not replace a previous catalog. No key or billable API call
is required. Each attempt snapshots its exact tariff, date and USD-per-token unit.

Identity matching is exact: known Codex Sol/Astra models use the bundled official
OpenAI Standard snapshot verified on 2026-09-13, before consulting OpenRouter.
The dashboard recomputes their historical display while retaining `recorded_cost`;
it never overwrites the ledger. `execution:prices --refresh` updates OpenRouter,
not this bundled snapshot. Without per-request input sizes, aggregated usage
that could include requests above 272k input tokens is displayed as a base-to-long
context price range. Cumulative input is never treated as one context window.
The equivalent excludes other service tiers, regional uplifts and tool charges.

Other Codex models map to `openai/<model>`, Claude to
`anthropic/<model>`, and OpenCode `openrouter/<provider>/<model>` to that catalog ID.
Aliases, display names and other providers are not guessed. Refresh before a new
run; their recorded estimates are not repriced later. These are equivalent
**API token estimates**, not subscription charges. Missing rates,
usage, additional charges, cache TTL/tier differences or provider routing can make
real charges differ; incomplete measurements are explicitly partial.

Authoritative protocol references consulted on 2026-09-13:

- [Codex JSON output](https://learn.chatgpt.com/docs/non-interactive-mode) and [compaction configuration](https://learn.chatgpt.com/docs/config-file/config-reference).
- [OpenCode CLI](https://opencode.ai/docs/cli/) and [token normalization source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts).
- [Claude usage tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking).
- [Claude headless input](https://code.claude.com/docs/en/headless), [Qwen headless input](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/) and [current Kimi Code CLI](https://moonshotai.github.io/kimi-code/en/reference/kimi-command).
- [Antigravity headless output](https://www.antigravity.google/docs/cli/headless/).
- [OpenRouter models and pricing units](https://openrouter.ai/docs/guides/overview/models).
- [OpenAI Standard pricing and context tiers](https://developers.openai.com/api/docs/pricing), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) and [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).


Oversized progress notebooks retain bounded excerpts from the beginning and end, including the latest discoveries, instead of disappearing from the next attempt. Asynchronous verification records its runner ID, log path and final exit code for later contexts. Recompiling a matching active run with `context_limit_enabled: false` reports excessive initial-read estimates as warnings; source ownership, readable ranges and QA checks remain enforced. This exception does not change new-run defaults or inherit a completed run’s setting.
