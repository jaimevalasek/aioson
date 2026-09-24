---
name: status-change-confirmation
description: Controls that change an entity's status, delete, archive, or apply hard-to-reverse edits always confirm through a design-system modal, never native dialogs
priority: 10
version: 1.1.0
load_tier: trigger
task_types: [crud, workflow, status-transition, moderation]
triggers: [delete, remove, archive, cancel, approve, reject, publish, deactivate, status change, confirmation, modal, exclusão, confirmação, mudança de status, desativar, aprovar, cancelar, cancelamento, excluir, apagar, remover, arquivar, publicar, rejeitar, reprovar]
aliases: [confirmação, exclusão, modal de confirmação, cancelar]
entities: [Status, Confirmation, Modal, Dialog, Destructive action]
retrieval_intents: [implementation, feature, planning]
modes: [planning, executing]
guard_surfaces: [ui]
enforcement: no-native-dialogs
---

# Status Change and Destructive Action Confirmation

Any control that changes an entity's lifecycle status (approve, reject, cancel, publish, deactivate), deletes or archives it, or applies a hard-to-reverse edit opens a polished design-system confirmation modal before acting.

## Rule

- Modal anatomy: a title naming the action and the object ("Cancelar pedido #1024?"), one consequence line stating what happens and whether it is reversible, a confirm button labeled with the verb (destructive styling for destructive actions), and a secondary cancel. Focus is trapped, `Esc` cancels, and the confirm never sits where a double-click lands by accident.
- Never use native `alert`, `confirm`, or `prompt` — build the modal from the project's design system.
- Require typed confirmation (entity name) only for high-blast-radius deletions (a workspace, an account, bulk data), not for routine records.
- Confirm an **edit** only when it is high-impact — already-published or shared content, financial values, anything with downstream consumers. Routine edits save without interception; over-confirming trains users to click through.
- Drag-and-drop status transitions follow `status-flow-drag-and-drop`: optimistic feedback plus undo instead of a modal — except drops onto destructive/terminal targets (delete, cancel), which still confirm.

## Applies to

- @briefing: a briefing whose flows change status or destroy data records the confirmation contract as a promise or classified open question.
- @dev: wire the modal to the real mutation; the action must not fire before confirmation resolves.
- @refiner / @benchmark: prototypes and benchmark builds show the modal working against mock state; an unconfirmed destructive button is a blocking finding.
- @qa: every status-changing or destructive control has a test path through confirm and through cancel.
