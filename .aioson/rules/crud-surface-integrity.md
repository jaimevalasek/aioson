---
name: crud-surface-integrity
description: Every CRUD surface ships with stable row identity, create-edit field parity, domain-enforced required fields, and at least one test that drives the real form
priority: 10
version: 1.0.0
load_tier: trigger
task_types: [crud, form, listing, registration, bugfix]
triggers: [crud, list view, listing, data table, edit form, create form, row key, duplicate record, required field, formulário, cadastro, listagem, tabela, edição, editar registro, campo obrigatório, validação de campo, registro duplicado, salvar registro]
aliases: [CRUD, listagem, tabela, cadastro, edição]
entities: [List, Table, Row, Record, Form, Edit, Update, Validation, Unique constraint]
retrieval_intents: [implementation, feature, planning]
modes: [planning, executing]
---

# CRUD Surface Integrity

Born from real defects that passed a green QA. A CRUD surface (list + create + edit) is only done when the four guarantees below hold, and the proof is a test that drives the real form — a page-opens smoke test is not evidence that the surface works.

## Rule

- **Row identity is the persisted ID.** Keying list rows by array index is a defect, not a style choice: lists ordered by last update reorder after create/save, and the renderer then reuses DOM and state by position — leaking open panels, typed values, and default-value fields into the neighboring record. Key rows by the record's persisted ID; when an inline row editor must remount closed after saving, derive the key from the record version (e.g. `updatedAt`). A row panel that overlays the following rows must close after a successful save.
- **Create and edit have field parity.** Every field the create form accepts must be editable afterwards, or carry a recorded reason why not. Verify the three points together, not just the screen: the edit form renders the field, the submit action sends it, and the update schema persists it. A field-subset (`pick`-style) update schema is where fields silently disappear.
- **Required is enforced in the domain.** `required` in markup is a convenience; the rule lives in the domain validation schema. Watch optional-plus-refine combinations that let the empty string through both checks. On a column under a unique constraint, a nullable field does not deduplicate in SQL — optional there means duplicates are allowed; make that an explicit decision, never an accident.
- **At least one test drives the form.** Each CRUD surface has at least one test that fills the create form, opens the edit of a specific row, and asserts the correct record changed. Before adjusting a test that started failing, check whether it was encoding the defect as the expected result.
- **Tests start from a clean database.** Tests that depend on state accumulated across runs degrade silently: a closed period stays closed, and a fixed-limit list query hides the record just created. Reset the test database before the run, and check small key spaces (year, month, competence) against the database before use.

## Applies to

- @product / @briefing: specs for CRUD surfaces state the create-edit parity contract and name any field that is immutable after creation, with the reason.
- @dev: implementation keys rows by persisted ID, wires every editable field through form → submit → schema → persistence, and enforces required/unique in the domain schema, not only in markup.
- @qa: delivery evidence for a CRUD surface includes the form-driving test — create, edit a specific row, assert the right record changed. A green page-smoke alone is a FAIL, not a pass.
- @tester: test plans cover row identity under list reorder, per-field create-edit parity, and empty-string bypass of optional-but-validated fields; runs start from a reset test database.
