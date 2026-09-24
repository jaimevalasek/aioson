---
name: status-flow-drag-and-drop
description: Recurrent bidirectional status flows (kanban, pipelines, stages, ordered lists) use drag-and-drop as the primary transition interaction, with an accessible fallback
priority: 10
version: 1.0.0
load_tier: trigger
task_types: [workflow, status-transition, kanban, board]
triggers: [kanban, board, pipeline, pipeline stage, stage transition, kanban column, board column, drag and drop, reorder, move card, status flow, funil, coluna do kanban, coluna do quadro, arrastar, quadro, etapa do funil, mudar de etapa, mover card, mover cartão]
aliases: [quadro, funil, arrastar e soltar]
entities: [Kanban, Board, Pipeline, Card, Lane, Swimlane]
retrieval_intents: [implementation, feature, planning]
modes: [planning, executing]
guard_surfaces: [ui]
---

# Drag-and-Drop for Recurrent Status Flows

When items move between statuses or lists repeatedly and in both directions — kanban boards, sales funnels, task pipelines, priority queues, ordered lists — drag-and-drop is the **primary** transition interaction. A dropdown or edit form as the only way to move an item through a recurring flow is a defect.

## Rule

- Show the interaction: a visible drag affordance on the item, a lifted drag state (elevation/tilt), highlighted valid drop targets while dragging, and a clear invalid-target state.
- Apply the move optimistically and offer undo (toast with "Desfazer") instead of a confirmation modal; a modal on every drag kills the flow. Drops onto destructive or terminal targets (delete, cancel) still confirm per `status-change-confirmation`.
- Every drag transition has an accessible equivalent: keyboard move via a context menu or "move to…" control, announced with a live region. Touch drag works on mobile or the menu takes over at small widths.
- Reordering within a list follows the same contract as moving between lists.
- Keep buttons/menus for one-shot transitions that do not recur; drag-and-drop owns the recurring flow, it does not replace every action.

## Applies to

- @briefing: a briefing describing a recurrent stage-based flow records drag-and-drop as the expected primary transition, as a promise or classified open question.
- @dev: persist the new status/order from the drop event; a drag that only mutates the DOM is a defect.
- @refiner / @benchmark: when the surface has a kanban-like flow, the prototype or benchmark build implements working drag-and-drop over mock state — click-only kanban is a blocking finding.
- @product: specs for stage-based surfaces name drag-and-drop as the primary transition and list the accessible fallback.
- @qa: verification drags a real card and confirms the new status/order persists past a reload; movement that only mutates the DOM is a FAIL.
