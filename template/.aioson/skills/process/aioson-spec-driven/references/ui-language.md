# UI Language - AIOSON Visual Standards

> Load when an agent needs to present options, status, or checkpoints to the user. Render the text in the selected project language, but keep this canonical reference in English.

## Status symbols

✓ complete / approved
✗ failed / blocked
◆ in progress
○ pending
⚠ attention needed
⚡ auto-approved

## Stage banner

Use when starting a major phase:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AIOSON ► @{AGENT} - {PHASE}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Checkpoint verify (visual confirmation)

Use after implementation that the user needs to see:

```
┌─────────────────────────────────────────────┐
│  ✓ VERIFY: {title}                          │
│  {specific instruction}                     │
│  Confirm? [y/n]                             │
└─────────────────────────────────────────────┘
```

## Checkpoint decision (AskUserQuestion - radio)

Use when there is a fork with different outcomes. Use `AskUserQuestion` with `multiSelect: false` and 2-4 options.

```
┌─────────────────────────────────────────────┐
│  ◆ DECISION NEEDED                          │
│                                             │
│  {decision context}                         │
│                                             │
│  1. {option A} - {consequences}             │
│  2. {option B} - {consequences}             │
│                                             │
│  Choose [1/2]:                              │
└─────────────────────────────────────────────┘
```

## Checkpoint action (manual step)

Use only for steps the agent literally cannot execute:

```
┌─────────────────────────────────────────────┐
│  ⚠ MANUAL ACTION NEEDED                     │
│                                             │
│  {specific instruction}                     │
│  {where to execute it}                      │
│                                             │
│  Tell me when it is ready.                  │
└─────────────────────────────────────────────┘
```

## Checkpoint multi-select (AskUserQuestion - checkbox)

Use for multiple selections such as skills, requirements, or sprint items. Use `AskUserQuestion` with `multiSelect: true`.

## Progress bar

Use for long phases with defined steps:

```
Progress: ████████░░ 80% (4/5 steps)
```

## Rules

- Header length: 12 characters maximum.
- Radio: maximum 4 options. Checkbox: maximum 8 options.
- Include a "None / Skip" checkbox option when relevant.
- Do not use checkboxes for architecture-changing decisions; use radio.
