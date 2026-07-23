---
description: "Lean DEV phase loop — continuous implementation, focused checks, one post-DEV QA."
agents: [dev, deyvin]
task_types: [implementation, verification]
triggers: [phase loop, auto-continue phases, implementation checkpoints]
---

# Lean DEV phase loop

Use this loop when `implementation-plan-{slug}.md` contains more than one vertical phase.

## The loop

Auto-continue is the default. A clean phase checkpoint advances directly to the next phase without launching QA or asking the user to continue.

After finishing each phase:

1. Run the focused automated command and production-path check declared by the phase.
2. Fix a failing check locally before advancing. Stop only after the configured retry limit or for a genuine product/security decision.
3. Update the non-blocking dossier evidence and write the cold-start checkpoint:

   ```bash
   aioson dev:state:write
   ```

4. Continue immediately. The checkpoint exists for crash recovery, not as a handoff or approval gate.

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
