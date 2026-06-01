# Task: Squad Analyze

> Diagnose an existing squad: coverage, redundancy, gaps, and improvement opportunities.

## When To Use
- `@squad analyze <slug>`
- When the user wants to improve an existing squad

## Input
- Existing squad slug

## Process

### Step 1 - Component Inventory
Read `squad.manifest.json` and the real filesystem. Build an inventory:
- Executors: count, names, with/without skills, with/without genomes
- Skills: declared vs. installed in `skills/`
- Content blueprints: count, with/without sections
- Templates: whether `templates/` exists
- Docs: whether `design-doc.md` and `readiness.md` exist
- Output: whether generated HTML sessions exist

### Step 2 - Coverage Metrics
Calculate:
- % of executors with declared skills
- % of executors with genomes
- % of content blueprints with complete sections
- % of docs present (`design-doc`, `readiness`)
- Consistency score: manifest vs filesystem, based on referenced files that exist
- **Depth** (the metric that catches a "basic squad"):
  - % of executors with a depth block in `## Quick context` (Variant A `persona + expertise` or Variant B `operational_breadth`; see `package-contract.md` § Executor depth block)
  - % of executors whose sources were distilled into the prompt (real vocabulary/frameworks, not generic text) when the squad has `sourceDocs`/`analysis`
  - % of executors tracing at least one workflow (`analysis.workflows`/`traces`) when decomposition happened

### Step 3 - Problem Diagnosis
Identify:
- Overlapping responsibilities between executors
- **Basic executor** (central quality failure): standalone `role:` without a depth block, no `persona`+`expertise` (frameworks, vocabulary, signature_moves) and no `operational_breadth`. A role name with generic bullets is the symptom.
- **Undistilled sources**: the squad has `sourceDocs`/`analysis`, but their vocabulary/frameworks do not appear in any executor prompt.
- **Workflow orphan executor**: when decomposition happened, an executor that does not trace any `workflow`; cut it or justify it.
- Missing skills
- Overly generic blueprints
- Weak readiness (`blocked` or `partial` dimensions)
- Excess complexity (more than 6 executors without justification)
- Orphan files
- Broken references

### Step 4 - Prioritized Suggestions
Generate suggestions with priority:
- high: broken references, manifest inconsistency, executor without role, **basic executor**, **undistilled sources**
- medium: missing skills, incomplete blueprints, missing docs, workflow orphan executor
- low: partial readiness, unapplied genomes, empty output

For each suggestion, provide the next concrete command. Route depth gaps to `@squad refresh <slug>`, which deepens basic executors, not only customer-facing breadth.

### Step 5 - Report
Use this format:

```
═══ Squad Analysis: <slug> ═══

Overview
  Name: <name>  |  Mode: <mode>  |  Version: <version>

Components
  Executors:   <n> (<n> with skills, <n> with genomes)
  Skills:      <n> declared, <n> installed
  Blueprints:  <n> (<n> complete)
  Docs:        <status>

Coverage
  Depth:     ███░░░░░░░ 30%   (executors with depth block)
  Skills:    ████░░░░░░ 40%
  Genomes:   ██████░░░░ 60%
  Docs:      ████████░░ 80%
  Manifest:  ██████████ 100%

Suggestions (<n>)
  🔴 <high priority item>
  🟡 <medium priority item>
  🟢 <low priority item>

Next: @squad refresh <slug> to deepen basic executors · @squad extend <slug> to add components
```

## Output
- Chat report
- If `--format markdown`: save to `.aioson/squads/<slug>/docs/ANALYSIS.md`
- If `--format json`: parseable JSON output

## Rules
- Do not modify anything; diagnose and recommend only.
- Always suggest the next concrete command for each problem.
