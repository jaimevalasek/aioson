---
name: agent-language-policy
description: Agent files default to English for universal reuse. Locale-specific squads may declare a locale_scope to write agent files in their native language.
priority: 9
version: 1.1.0
agents: [squad, genome, orache, design-hybrid-forge, site-forge]
---

# Agent Language Policy

Agent files are instruction code. Default is English because it maximizes LLM reasoning quality, reduces token cost, and enables universal reuse. User-facing replies still follow the selected project language (`interaction_language`, fallback `conversation_language`). Locale-scoped generated squads may declare `locale_scope` when their own generated agent files must be locale-native.

## Language decision tree

```
New or existing squad
  ├── ephemeral: true → any language
  └── ephemeral: false
      ├── locale_scope: "universal" (or absent) → agent files in English
      └── locale_scope: "{locale}" declared → generated squad agent files in that locale language
```

## Declaring locale_scope

In `squad.manifest.json`:

```json
{
  "slug": "pharmacy-support",
  "locale_scope": "pt-BR",
  "locale_rationale": "Domain regulated by ANVISA; law, prescriptions, and customer interactions are exclusively Brazilian."
}
```

Valid values: `"universal"` (default) or any BCP-47 code: `"pt-BR"`, `"en-US"`, `"es-MX"`, `"fr-FR"`.

## When locale_scope is legitimate — ALL criteria must be true

| Criterion | Question |
|---|---|
| Local regulation | Legislation governs a specific country? (ANVISA, OAB, NHS, FDA…) |
| Local end user | Users interact exclusively in that language? |
| No portability | Squad never reused in another country without full rewrite? |
| Native domain reasoning | Technical domain richer in native language? |

Justified: ANVISA pharmacy support, eSocial tax/payroll, Brazilian legal support, national support desk.
Not justified: digital marketing, software development, YouTube creator, psychology/coaching.

## Rules by layer

### Universal squad

| Layer | Language |
|---|---|
| Agent slug / name | English |
| Agent file (mission, focus, constraints) | English |
| Source code (vars, functions, classes) | English |
| Agent output to user | `interaction_language` (fallback: `conversation_language`) |
| Content docs (PRD, specs, plans) | Project language |

### Locale-scoped squad

| Layer | Language |
|---|---|
| Agent slug / name | Locale language |
| Agent file (mission, focus, constraints) | Locale language |
| Source code | **English — no exception** |
| Agent output | Locale language |
| Content docs | Locale language |

## Mandatory Question During Squad Creation

Before generating any generated squad file, ask in the selected project language:

```
Is this squad for one specific country/language, or should it be universal?

1. Universal (English) — reusable in any project, publishable on aiosforge.com
2. Specific locale — for example Brazil-only in Portuguese
```

If (2): request locale code. If unclear: infer from domain and confirm.

**Auto-inference:**
- Domain with specific country legislation → suggest that country's locale
- Portuguese content with clearly Brazilian audience → suggest `pt-BR`
- Generic domain, no geographic reference → suggest universal

## On file creation

- Universal → write in English, no prompt needed.
- Locale declared → write in locale language, no prompt needed.
- Ambiguous → ask the mandatory question before generating any file.
