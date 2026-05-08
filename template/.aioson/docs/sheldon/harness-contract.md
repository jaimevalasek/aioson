---
description: "Sheldon harness contract generation procedure — schemas, criteria population, governor and contract_mode selection, MICRO/SMALL/MEDIUM rules."
---

# Sheldon Harness Contract Generation

Load this module when `@sheldon` reaches RF-05 in a MEDIUM enrichment. Implements AC-HD-06 of `harness-driven-aioson`.

## When to run

Run **after** writing `sheldon-enrichment-{slug}.md`, gated by `project.context.md` classification:

| Classification | Action |
|---|---|
| MICRO | Skip entirely. No contract, no progress.json. |
| SMALL | Produce `progress.json` only (no `harness-contract.json`). |
| MEDIUM | Produce both `harness-contract.json` and `progress.json`. |

## Steps

### 1. Initialize stub

If `.aioson/plans/{slug}/harness-contract.json` is absent:

```bash
aioson harness:init . --slug={slug}
```

This creates the contract scaffold and `progress.json` in the same folder. If the CLI command is unavailable, write both files manually using the canonical schemas at the bottom of this doc.

### 2. Populate `criteria[]`

For every AC in the enriched PRD with an objective, mechanically verifiable assertion (file existence, test pass, lint clean, exact API shape, exit code), append to `criteria[]`:

```json
{
  "id": "C1",
  "description": "<AC text — human-readable for PR review>",
  "assertion": "<machine-verifiable expression — e.g. 'tests/foo.test.js passes' or 'src/x/y.js exports parseX'>",
  "binary": true
}
```

ACs that are subjective (UX feel, code style preference) get `binary: false` and become advisory only — `@validator` ignores them in the score.

**Rule of thumb:** if the assertion can be answered by a single shell command exit code or a single test, it qualifies as `binary: true`. Otherwise mark it advisory and let `@qa` cover it.

### 3. Set `contract_mode`

By classification and risk surface:

- **SMALL** → `ECONOMICAL` (relaxed governor)
- **MEDIUM (default)** → `BALANCED`
- **MEDIUM with sensitive surface** (auth, money, ownership, secrets, uploads, external URLs) → `URGENT` (tight governor)

### 4. Set `governor` block

Safe defaults for `BALANCED`:

```json
{ "max_steps": 50, "cost_ceiling_usd": 2.00, "error_streak_limit": 5 }
```

- `URGENT` halves these.
- `ECONOMICAL` doubles `error_streak_limit` only.

## Authoring rules

- The contract is **additive** to the enrichment log; both coexist. Enrichment explains *what* to enrich; contract defines *what "done" means*.
- Contract criteria are derived from the **enriched** PRD ACs — never invent criteria not anchored to an AC.
- Mention the contract path in the post-enrichment handoff message.
- The user approves the contract as part of the post-enrichment gate. Do not declare the contract final without confirmation.
- Once approved, the contract is the source of truth for `@validator`. Subsequent enrichment rounds may add new criteria, never remove approved ones without explicit user instruction.

## Canonical schemas

### `harness-contract.json`

```json
{
  "feature": "<slug>",
  "contract_mode": "ECONOMICAL | BALANCED | URGENT",
  "governor": {
    "max_steps": 50,
    "cost_ceiling_usd": 2.00,
    "error_streak_limit": 5
  },
  "criteria": [
    {
      "id": "C1",
      "description": "...",
      "assertion": "...",
      "binary": true
    }
  ]
}
```

### `progress.json`

```json
{
  "feature": "<slug>",
  "phase": 1,
  "status": "in_progress | waiting_validation | done | circuit_open",
  "completed_steps": [],
  "last_error": null,
  "session_count": 1,
  "last_updated": "<ISO-8601>",
  "circuit_state": "CLOSED | OPEN | HALF_OPEN"
}
```

## Failure modes to anticipate

- **No verifiable ACs in PRD** — go back to enrichment with `@product` and add concrete assertions before generating a contract.
- **All ACs are advisory** — flag to user; the harness adds no value. Skip contract generation, document the decision in `sheldon-enrichment-{slug}.md`.
- **`harness:init` CLI missing** — write stubs manually, but record in handoff that CLI was unavailable so `@dev` can install it.
