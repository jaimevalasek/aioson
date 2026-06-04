---
id: DD-1
title: Decision instrumentation command
status: closed
closed_at: 2026-05-07
owner: architect
---

# DD-1 - Decision Instrumentation

## Decision
Use `context:load` as the canonical CLI verb for emitting explicit context-load telemetry.

## Rationale
The active-learning loop needs one stable event source for agent-readable context usage. `context:load` records the target, agent, and resolved context path without requiring agents to synthesize dashboard telemetry directly.

## Status
status: closed
