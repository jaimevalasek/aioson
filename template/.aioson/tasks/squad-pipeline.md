# Task: Squad Pipeline

> Inter-squad pipeline management. Connects squads into autonomous production flows through a DAG.

## When To Use
- `@squad pipeline create <name>` — create a new pipeline
- `@squad pipeline connect <pipeline> <source-squad>:<port> → <target-squad>:<port>` — connect squads
- `@squad pipeline show <pipeline>` — show the DAG with nodes, edges, and status
- `@squad pipeline run <pipeline>` — run the pipeline and trigger handoffs

## Concept

A **pipeline** is a directed acyclic graph (DAG) of squads connected by ports.
Each squad declares `ports.inputs` and `ports.outputs` in `squad.manifest.json`.
An edge connects one squad output to another squad input.

When a squad produces output, it creates a **handoff** (`squad_handoffs` table) with payload.
The downstream squad reads `pending` handoffs where `to_squad = its slug` and consumes them.

## Prerequisites

Before creating a pipeline, verify:
1. Participating squads exist in `.aioson/squads/`.
2. Each squad has `squad.manifest.json` with declared `ports`.
3. Input/output ports are compatible by `dataType`.

If a squad has no declared ports, guide the user to:
- Edit `squad.manifest.json` and add the `ports` section.
- Or use `@squad extend <slug>` to add ports interactively.

## Step 1 - Create Pipeline

```json
{
  "slug": "<pipeline-slug>",
  "name": "<human-readable name>",
  "description": "<optional description>",
  "status": "draft",
  "triggerMode": "manual"
}
```

Register through `aioson runtime` or directly in SQLite (`squad_pipelines`).

## Step 2 - Add Nodes To Pipeline

For each participating squad, register in `pipeline_nodes`:
- `pipelineSlug` — pipeline slug
- `squadSlug` — squad slug
- `positionX`, `positionY` — visual canvas position; optional, default `0,0`

## Step 3 - Connect Squads

For each `source:port → target:port` connection, register in `pipeline_edges`:
- `pipelineSlug` — pipeline slug
- `sourceSquad`, `sourcePort` — source squad and output port
- `targetSquad`, `targetPort` — target squad and input port
- `transform` — optional data transform (JSON)

Validate:
- No cycle in the DAG; use Kahn topological sorting.
- Ports exist in manifests.
- DataTypes are compatible, or `any`.

## Step 4 - Show Pipeline

When showing `@squad pipeline show <pipeline>`, display:

```
Pipeline: <name>
Status: draft | active | paused
Trigger: manual | on_output | scheduled

Flow:
  [squad-a] --output-key--> [squad-b] --other-key--> [squad-c]

Topological order: squad-a → squad-b → squad-c

Pending handoffs: 0
```

If a cycle is detected, state in the selected project language that the pipeline is invalid and ask the user to check the connections.

## Step 5 - Run Pipeline

When running `@squad pipeline run <pipeline>`:
1. Calculate topological order.
2. For each squad in order:
   - Read `pending` handoffs with `to_squad = squad_slug`.
   - Create execution context with handoff payloads.
   - Notify the user in the selected project language that `@<squad>` is being activated with input from `@<source>`.
3. After each squad processes its output:
   - Create `pending` handoffs for connected downstream squads.
   - Mark consumed handoffs as `consumed`.

## Handoff Format

```json
{
  "id": "<uuid>",
  "pipelineSlug": "<pipeline>",
  "fromSquad": "<source>",
  "fromPort": "<output-key>",
  "toSquad": "<target>",
  "toPort": "<input-key>",
  "payload": { "contentKey": "...", "filePath": "..." },
  "status": "pending"
}
```

## Output Contract

- Pipeline registered in SQLite (`squad_pipelines`, `pipeline_nodes`, `pipeline_edges`)
- Handoffs in `squad_handoffs`
- Visual report available at `/pipelines/<slug>` in the dashboard

## Hard Constraints

- Never create a pipeline with a cycle; reject it and explain the problem.
- Validate `dataType` compatibility before connecting.
- Handoffs are immutable after creation; create new ones instead of editing existing ones.
- A pipeline in `active` status cannot have nodes removed without returning to `draft`.
