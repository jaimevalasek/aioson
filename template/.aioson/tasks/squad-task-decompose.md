# Task: Squad Task Decomposition

> Guide for decomposing executors into granular task files.

## When To Use
- During `@squad create`, while evaluating each executor
- During `@squad extend` when the user asks for retroactive task decomposition

## Task File Format

Save to `.aioson/squads/{squad-slug}/agents/{executor-slug}/tasks/{task-slug}.md`:

```markdown
# Task: {task-name}

> Order: {1, 2, 3...}
> Executor: @{executor-slug}
> Input: {what this task receives}
> Output: {what this task produces}

## Process
1. {Step 1 — concrete action}
2. {Step 2 — concrete action}
3. {Step 3 — concrete action}

## Output Format
{Schema or description of expected output}

## Output Example
{15+ lines of realistic output example}

## Quality Criteria
1. {Measurable criterion}
2. {Measurable criterion}
3. {Measurable criterion}

## Veto Conditions
1. {Hard block — output CANNOT have this}
2. {Hard block — output CANNOT have this}
```

## Decision Tree

```
EXECUTOR
  ├── Does ONE thing well? (reviewer, validator, formatter)
  │   └── NO tasks — the agent file is enough
  │
  ├── Has a repeatable multi-step process?
  │   ├── 2 steps → probably no task files; keep it simple
  │   ├── 3+ steps with distinct outputs → YES, decompose into tasks
  │   └── 3+ internal steps → NO task files; keep steps in the agent file
  │
  ├── Will tasks be reused?
  │   └── YES → decompose for reusability
  │
  └── Is quality critical and each step needs its own criteria?
      └── YES → decompose for granular quality control
```

## Rules
- Keep the agent file focused on identity: mission, focus, constraints.
- Move process details into task files.
- Each task must be independently evaluable.
- Tasks execute sequentially; output from task N is input to task N+1.
- Add quality criteria per task, not only per executor.
