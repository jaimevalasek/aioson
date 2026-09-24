---
name: form-fields-masks-and-validation
description: Structured form fields always ship with input masks, inline validation, and correct input semantics; project rules and docs define the domain formats
priority: 10
version: 1.0.0
load_tier: trigger
task_types: [form, crud, registration, onboarding, checkout, settings]
triggers: [form, forms, input field, mask, masks, validation, formulário, cadastro, signup, sign up, login, checkout, data entry, campos, field format]
aliases: [formulário, cadastro, campo, input]
entities: [Form, Input, Field, Validation, Mask, Error state]
retrieval_intents: [implementation, feature, planning]
modes: [planning, executing]
guard_surfaces: [ui]
---

# Form Fields: Masks and Validation

Before building or specifying any form, read the project's `.aioson/rules/` and `.aioson/docs/` for domain field formats and reuse the project's existing form components and validation helpers. The project's locale (`conversation_language` / `interaction_language` in project context) decides the default formats — e.g. pt-BR: CPF, CNPJ, CEP, `(11) 91234-5678` phones, `DD/MM/AAAA` dates, `R$` currency.

## Rule

- Every structured field (document IDs, phone, postal code, date, time, currency, percentage, card number, plate, etc.) gets a live input mask or formatter. A bare free-text input for structured data is a defect.
- Use correct input semantics: `type`, `inputmode`, `autocomplete`, and `maxlength` consistent with the mask.
- Validate in layers: the mask constrains typing; semantic validation runs on blur (check digits where the format defines them — CPF/CNPJ, IBAN, card Luhn); required/cross-field rules run on submit.
- Error copy is specific and names the expected format ("CNPJ inválido — use 00.000.000/0000-00"), rendered inline next to the field with `aria-invalid` and `aria-describedby`; never color-only signaling and never a generic "invalid data" toast.
- Show the material states: error, success/valid, disabled, and loading for async checks (uniqueness, address lookup by postal code).

## Applies to

- @briefing: a briefing whose surface collects structured data names the mask/validation contract as a promise or classified open question, never leaving field formats to be discovered at implementation.
- @dev: implementation uses the project's mask/validation utilities; do not hand-roll a second formatting layer when one exists.
- @refiner / @benchmark: prototypes and benchmark builds must demonstrate masks and inline validation actually working in mock state — static unmasked inputs in a form surface are a blocking finding, not polish.
- @product: field lists in specs name the format and mask for each structured field.
- @qa: delivery evidence exercises each structured field with valid and malformed input on the real surface; a field that accepts input its mask/validation contract rejects is a FAIL.
