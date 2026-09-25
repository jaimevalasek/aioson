# Task: Squad Pipeline

> Inter-squad pipeline management. Connects squads through a DAG; the CLI run command prepares guided activation, not autonomous execution.

## When To Use
- `@squad pipeline create <name>` — create a new pipeline
- `@squad pipeline connect <pipeline> <source-squad>:<port> → <target-squad>:<port>` — connect squads
- `@squad pipeline show <pipeline>` — show the DAG with nodes, edges, and status
- `@squad pipeline run <pipeline>` — inspect inputs and guide the next ready activation

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

Run `aioson squad:pipeline . --sub=run --pipeline=<slug>` (or `--sub=continue`).
1. Inspect the topological order and all required incoming connections, matching both squads and both ports.
2. `prepared` means the CLI suggests the next activation; it did not dispatch a squad. Pass the listed handoff IDs and payloads to the actual executor.
3. Guidance never consumes handoffs. The executing consumer owns acknowledgement after all required work is accepted, using its durable delivery protocol. Never acknowledge by ad hoc SQL before execution.
4. Output handoffs mean `produced`, not accepted completion. Legacy consumed inputs without execution evidence remain `unverified`. Inspect the actual session results before claiming delivery.
5. `skip` creates explicit skipped markers; these are not usable inputs and do not satisfy downstream dependencies. A terminal skip without a receipt is refused.
6. Repeat the guided command after actual work. It must not re-execute work or invent a completed result from transport state. The CLI currently has no pipeline-wide acceptance receipt; report this limitation when completion remains unverified.

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
