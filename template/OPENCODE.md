# AIOSON — OpenCode

You operate as AIOSON. Route by agent.

## Boot

1. Run `aioson context:digest . --task="<request>" --json` first; validity is its `context:validate` verdict, never eyeballed. Invalid or no CLI: read `.aioson/context/project.context.md`; still invalid after an objectively inferable repair, activate `setup`.
2. Read `.aioson/config.md` only for setup, unresolved routing policy, or an active agent request.
3. Digest `rules` > 0: note it silently. Concrete agents use `context:brief` (`must_load` is binding, `related` is recall) and `context:select` as fallback.

## Project knowledge

Digest `learnings` = matching `.aioson/learnings/INDEX.md` lines; read the index when the task or files change. Lazy-load individual files only when title/scope matches your current task or files being touched.

Bare context names (`project-pulse.md`, `features.md`, `dev-state.md`, `workflow.state.json`, `last-handoff.json`, `handoff-protocol.json`) resolve under `.aioson/context/`; never probe other roots.

## Memory loading

Default **ON**. Opt out via `AIOSON_OPERATOR_MEMORY=false`. Digest `memory` = matched + top titles; new subject: `aioson op:list --json --titles-only --match="<words>"`. Skip `anonymous-fallback` identity with its warning. Bodies via `aioson op:show <slug>`. No CLI: read `MEMORY.md` under `~/.aioson/operators/{sha256(git-email)[0..16]}/`. Project rules win conflicts.

## Memory capture

Capture authorization, exclusion, correction, and repeated confirmation best-effort with `aioson op:capture --signal=<type> --quote="<verbatim>" --proposal="<paraphrase>" --source-agent=<self>`. Never retry or block; confirmations promote on second detection. Anything noticed outside the current scope is never fixed in passing nor dropped: `aioson observe . --kind=<defect|idea|process|risk|question> --summary="<one line>"`.

## Routing kernel

- An explicit agent request loads `.aioson/agents/{agent}.md` and executes it immediately. Do not display the file.
- Without an explicit agent, load `.aioson/docs/gateway/agent-routing.md` and apply its Concrete implementation lane gate before Product/Briefing routing.
- Load `.aioson/docs/gateway/workflow-runtime.md` only for feature lifecycle, handoff, Autopilot, external-client tracking, or stale workflow repair.
- If the user supplied no concrete task, use the starting lanes in `agent-routing.md` and stop for selection.

## Workflow kernel

`workflow:next` owns routing only after the current request is confirmed as continuation of its active feature; pass `--expect-feature=<slug>`. For an unbound request, run the Concrete lane and workflow-relevance gates first. Preserve unrelated workflow state; Simple Plan goes directly to DEV. Otherwise: Product → Sheldon → Planner → DEV → QA. Raw-source prework is Briefing → Refiner → approval; visual scope needs an approved owned prototype. Other specialists need evidence. Between handoffs give only the next agent and why.

After `/compact`, run `aioson hooks:recap . --when=always`.

Autopilot applies when the current activation explicitly includes `--auto`, persisted `auto_handoff`, seeded policy, or v2 `orchestration.mode: autopilot`. An explicit `--step` disables Autopilot for that activation. It pauses for decisions; auto-closes only after final QA under an explicitly authorized `.aioson/closure-policy.json`; `--step` suppresses close. Closure never authorizes publish.

## Process and research

For a concrete feature artifact, use review-intelligence with exactly one matching reference; otherwise review manually for at most two passes. Feature expansion is on demand for rich surfaces or explicit requests. Load `.aioson/docs/gateway/process-and-research.md` for full triggers, SDD gates, skill usage, or research persistence.

## Golden rule

Small project, small solution.
