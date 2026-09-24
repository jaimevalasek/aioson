---
description: "Lean DEV phase loop — continuous implementation, focused checks, one post-DEV QA."
agents: [dev]
task_types: [implementation, verification]
triggers: [phase loop, auto-continue phases, implementation checkpoints]
---

# Lean DEV phase loop

Use this loop when `implementation-plan-{slug}.md` contains more than one vertical phase.

## The loop

Auto-continue is the default. A clean phase checkpoint advances directly to the next phase without launching QA or asking the user to continue.

After finishing each phase:

1. Run the focused automated command and production-path check declared by the phase.
2. Verify the project's own rules against what the phase just wrote:

   ```bash
   aioson rules:check . --changed
   ```

   It is deterministic and scoped to the diff, so it costs almost nothing to repeat every phase — which is the point. A `HIGH` is a rule being broken, and a rule outranks the PRD, the plan, and any deviation recorded in the dossier: fix the code here, while the phase is still in hand, or stop and report the conflict for a human to resolve on the rule file. The same check runs again at DEV completion and blocks the stage gate, so a violation carried forward only costs a re-entry.

   If the report carries `divergence`, the project was already built against a different convention and this slice did not cause it. Do not migrate the tree and do not write a baseline: present the options the command prints and let the user choose.
3. Fix a failing check locally before advancing. Stop only after the configured retry limit or for a genuine product/security decision.
4. Update the non-blocking dossier evidence and write the cold-start checkpoint (`--feature` and `--next` are required — a bare call fails with `missing_feature`):

   ```bash
   aioson dev:state:write . --feature={slug} --phase={n} --next="{next concrete step}" --context=prd,impl-plan 2>/dev/null || true
   ```

5. Continue immediately. The checkpoint exists for crash recovery, not as a handoff or approval gate.

After the last phase, run the full relevant build/tests and production-path smoke once, then hand off to QA:

```bash
aioson verification:plan . --feature={slug} --trigger=end-of-feature
```

QA is the only default reviewer. Tester, Pentester, and Validator appear in this plan only when explicitly enabled in `agent-execution-{slug}.json`; classification and phase count never enable them.

## Development execution lanes

When the manifest explicitly enables split development lanes, DEV dispatches them sequentially before integration:

```bash
aioson agent:execution:dispatch . --feature={slug} --lane={lane} --json
```

Each lane is bound to its declared prompt, host/model, and `write_paths`. DEV then inspects the combined diff, owns shared files and integration, and runs the phase/full checks. An unavailable host/model pauses unless its manifest entry declares an applicable fallback; the current session must not silently imitate it.

Small project, small solution: no per-phase QA loop, no synthesized spec checkpoint, and no mandatory harness unless the approved plan deliberately requires one.
