---
feature: secure-by-default
status: gate_a_ready
created_at: 2026-04-28T20:48:44-03:00
classification: MEDIUM
source_prd: .aioson/context/prd-secure-by-default.md
sheldon_plan: .aioson/plans/secure-by-default/manifest.md
gate_a: approved
scope_focus: phase_1_security_baseline_contract
---

# Requirements — Secure by Default

## Feature summary
Adicionar uma camada transversal de segurança ao AIOSON para que agentes, gates e CLI tratem segurança como comportamento padrão, verificável e barato em tokens.

O primeiro corte implementável é o contrato de baseline: Artigo VII, rule `.aioson/rules/security-baseline.md`, matriz de controles versionados e política por classificação. As fases seguintes do plano Sheldon dependem desse contrato.

## Classification

| Dimension | Value | Score |
|---|---:|---:|
| User types | 3: vibe coder, dev experiente, mantenedores AIOSON | 2 |
| External integrations | 1-2: npm audit/runtime SQLite/CLI filesystem | 1 |
| Business rules | Complexas: gates, severidade, classificação, agentes, fallback, auditabilidade | 2 |
| **Total** |  | **5 — MEDIUM** |

Gate A/B/C são bloqueantes para esta feature.

## New entities and fields

### SecurityControl

Representa um controle de segurança versionado que a rule e os agentes conseguem referenciar.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| control_id | string | no | Unique; format `SEC-SBD-{NN}` |
| title | string | no | Max 120 chars |
| owasp_mapping | string[] | yes | OWASP Top 10 category or ASVS v5.0.0 reference when known |
| default_severity | enum | no | `critical`, `high`, `medium`, `low`, `advisory` |
| applies_to_agents | string[] | no | `analyst`, `architect`, `dev`, `qa` |
| applies_to_classifications | string[] | no | `MICRO`, `SMALL`, `MEDIUM` |
| blocking_policy | enum | no | `never`, `advisory`, `scan-blocking`, `audit-blocking` |
| required_evidence | string[] | no | Evidence expected from downstream artifacts |
| owner_agent | enum | no | `analyst`, `architect`, `dev`, `qa` |
| source | string | no | `security-baseline`, `secure-tdd`, `security-scan`, `security-audit`, `pentester-app-target` |

### SecurityBaselineRule

Arquivo normativo carregado por agentes técnicos.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| path | string | no | `.aioson/rules/security-baseline.md` |
| template_path | string | yes | `template/.aioson/rules/security-baseline.md` when template sync applies |
| agents | string[] | no | Must include `analyst`, `architect`, `dev`, `qa` |
| controls | SecurityControl[] | no | Minimum 7 controls |
| classification_policy | object | no | MICRO/SMALL/MEDIUM behavior |
| version | string | no | Semver or feature version |

### AttackSurfaceMap

Seção obrigatória de requirements para features futuras que usem o baseline.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| feature_slug | string | no | Matches target feature slug |
| authenticated_endpoints | string[] | yes | Required when feature has auth |
| roles | string[] | yes | User roles or permission groups |
| owned_resources | string[] | yes | Resources requiring ownership checks |
| financial_state_changes | string[] | yes | Money or critical balance mutations |
| uploads | string[] | yes | File upload surfaces |
| external_urls | string[] | yes | User-controlled external URL surfaces |
| secrets_or_credentials | string[] | yes | Env vars, API keys, tokens |
| storage_boundaries | string[] | yes | DB/storage/RLS boundaries |
| pentester_trigger | enum | no | `required`, `conditional`, `skip` |

### SecurityFinding

Contrato lógico para findings que será detalhado por `@architect`.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| finding_id | string | no | Unique per slug |
| slug | string | no | Feature slug |
| source | enum | no | `security-scan`, `security-audit`, `pentester-app-target`, `qa-heuristic` |
| severity | enum | no | `critical`, `high`, `medium`, `low`, `info` |
| status | enum | no | `open`, `fixed`, `accepted`, `false_positive` |
| scope | string | no | Affected area |
| attack_path | string | yes | Required for pentester findings |
| preconditions | string[] | yes | Required for High/Critical |
| reproduction | string[] | yes | Required for High/Critical |
| evidence | string[] | no | File path, command output or artifact reference |
| suggested_fix | string | yes | Optional for scan findings, required for pentester findings |
| blocks_gate_d | boolean | no | True for open High/Critical in MEDIUM |

### SecurityRuntimeEvent

Evento de telemetria para medir adoção e bloqueio.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| event_type | enum | no | `security_scan_completed`, `security_audit_completed`, `pentester_app_target_invoked`, `security_gate_blocked` |
| feature_slug | string | no | Target feature |
| stage | enum | yes | `analyst`, `architect`, `dev`, `qa` |
| status | enum | no | `passed`, `failed`, `blocked`, `skipped`, `inconclusive` |
| findings_count | integer | no | Default 0 |
| high_critical_count | integer | no | Default 0 |
| emitted_by | string | no | CLI command or agent |

## Changes to existing entities

| Entity/artifact | Change |
|---|---|
| Constitution artifact | Add Artigo VII or equivalent entry: Zero Trust by Default points to `.aioson/rules/security-baseline.md`. |
| `.aioson/rules/` | Add `security-baseline.md` as Markdown rule with frontmatter for analyst/architect/dev/qa. |
| `template/.aioson/rules/` | Add template copy when template sync is part of implementation. |
| `@analyst` | Add requirement to produce `AttackSurfaceMap` for features with auth, ownership, money, uploads, external URLs, secrets, storage boundaries or integrations. |
| `@architect` | Add secure-by-design decisions for control IDs, storage boundaries, transactionality, secret handling and audit schema. |
| `@dev` | Load `secure-tdd` for MEDIUM features and create adversarial tests before production code when risk surfaces exist. |
| `@qa` | Run/consume `security:audit`, invoke `@pentester app_target` conditionally and block Gate D on open High/Critical findings. |
| `@pentester` | Add `app_target` mode separated from framework-target surfaces. |
| Runtime SQLite | Record security events for adoption metrics. |

## Relationships

- `SecurityBaselineRule` has many `SecurityControl`.
- `AttackSurfaceMap` references one target feature slug and many `SecurityControl` IDs.
- `SecurityFinding` belongs to one feature slug and references zero or more `SecurityControl` IDs.
- `SecurityRuntimeEvent` belongs to one feature slug and may reference one scan/audit/pentester run.
- `@qa` consumes `AttackSurfaceMap`, `security:audit` output and `SecurityFinding` records to decide Gate D.

## Migration additions

No application database migration is required for Phase 1.

Ordered artifact additions:

1. Add constitution entry or equivalent governance line.
2. Add `.aioson/rules/security-baseline.md`.
3. Add template copy if template sync is required.
4. Add requirements-level `Security Control Matrix`.
5. Defer CLI schemas and runtime persistence details to `@architect`.

## Business rules

- REQ-SBD-001: The security baseline must be loaded by `@analyst`, `@architect`, `@dev` and `@qa`, not by product/copy/design agents.
- REQ-SBD-002: Every baseline item must have a stable control ID, severity, responsible agent, classification policy and required evidence.
- REQ-SBD-003: MICRO work is advisory only and must not be blocked by the baseline.
- REQ-SBD-004: SMALL work runs advisory checks plus automatic `security:scan` after `@dev` when implemented.
- REQ-SBD-005: MEDIUM work requires `security:audit` before Gate D and blocks on open High/Critical findings.
- REQ-SBD-006: `security:scan` and `security:audit` are distinct concerns; scan is static/tool-first, audit is feature-artifact and surface assessment.
- REQ-SBD-007: `@pentester app_target` is conditional, not automatic for every MEDIUM feature.
- REQ-SBD-008: `@pentester` reports findings; it must not auto-fix.
- REQ-SBD-009: Findings High/Critical in MEDIUM must include reproducible evidence or be marked inconclusive instead of blocking silently.
- REQ-SBD-010: Brownfield secrets that predate AIOSON adoption do not block by default; new secrets after adoption block.
- REQ-SBD-011: Web3/dapp app-target security is out of v1 unless the project context has `web3_enabled=true` and a later phase explicitly scopes it.
- REQ-SBD-012: Direct LLM mode without CLI must use fallback checklist and record limitation; it must not fabricate runtime events.
- REQ-SBD-013: Honeypots, jump scares and deception techniques are out of MVP unless a future PRD explicitly approves them.
- REQ-SBD-014: Argon2id is preferred for password hashing when applicable, but stack/compliance fallback is decided by `@architect`.
- REQ-SBD-015: Security artifacts in `.aioson/context/` must respect Markdown-first rules; only `conformance-{slug}.yaml` and `security-findings-{slug}.json` are machine-readable exceptions.

## Security Control Matrix

| Control ID | Title | Maps to | Default severity | Owner | Evidence |
|---|---|---|---|---|---|
| SEC-SBD-01 | Server-side input limits | A03/A04 | high | analyst/dev/qa | Field limits, negative tests, audit pass |
| SEC-SBD-02 | Upload file signature validation | A03/A05 deferred | high | architect/dev/qa | Magic Bytes/MIME checks or N/A rationale |
| SEC-SBD-03 | Ownership/IDOR authorization | A01 | critical | analyst/architect/dev/qa | Ownership map, tests, audit/pentester evidence |
| SEC-SBD-04 | Atomic critical state changes | A04 | critical | analyst/architect/dev/qa | Transaction/lock decision, concurrency tests |
| SEC-SBD-05 | Secrets outside code | A02/A07 | critical | dev/qa | scan output, env var handling, no committed secrets |
| SEC-SBD-06 | External URL sanitization | A01/A03/A10 deferred | medium | analyst/dev/qa | Allowlist/proxy/block policy and tests |
| SEC-SBD-07 | Storage default-deny/RLS boundary | A01/A04 | high | architect/dev/qa | RLS/default-deny or stack-specific equivalent |
| SEC-SBD-08 | Auth enumeration/rate limiting | A07 | high | analyst/dev/qa | Generic auth errors, endpoint-specific limits |

## Attack Surface Map — secure-by-default

| Surface | Current feature value |
|---|---|
| Authenticated endpoints | None introduced by this feature. This feature defines controls for future generated apps. |
| Roles | Agent roles: analyst, architect, dev, qa, pentester. Human role: developer using CLI. |
| Owned resources | Future app resources requiring IDOR/ownership checks. No new app resource in AIOSON core Phase 1. |
| Financial state changes | Future generated apps; no AIOSON core money state in Phase 1. |
| Uploads | Future generated apps; no upload endpoint in AIOSON core Phase 1. |
| External URLs | Future generated apps; baseline must require sanitization policy when present. |
| Secrets or credentials | CLI/project repositories; `security:scan` later verifies hardcoded secrets and `.env` leakage. |
| Storage boundaries | `.aioson/context/`, `.aioson/rules/`, template sync, runtime SQLite. |
| Pentester trigger | Conditional for future features with auth/money/ownership; not required for Phase 1 implementation itself. |

## Acceptance criteria

- AC-SBD-001: The repository contains a governance entry for Zero Trust by Default pointing to `.aioson/rules/security-baseline.md`.
- AC-SBD-002: `.aioson/rules/security-baseline.md` exists with frontmatter targeting `analyst`, `architect`, `dev` and `qa`.
- AC-SBD-003: The baseline includes at least `SEC-SBD-01` through `SEC-SBD-08` or equivalent stable IDs.
- AC-SBD-004: Each control declares severity, responsible agent, classification policy and evidence expected from downstream artifacts.
- AC-SBD-005: The classification policy explicitly states MICRO advisory, SMALL scan-oriented, MEDIUM audit-blocking.
- AC-SBD-006: The baseline distinguishes `security:scan` from `security:audit`.
- AC-SBD-007: The baseline defines when `@qa` may invoke `@pentester app_target`.
- AC-SBD-008: The baseline says High/Critical open findings block MEDIUM Gate D.
- AC-SBD-009: The baseline excludes honeypots/jump scares/deception from MVP.
- AC-SBD-010: The baseline records direct LLM fallback: checklist-only, explicit limitation, no fabricated runtime.
- AC-SBD-011: Template sync implications are documented for `template/.aioson/rules/security-baseline.md`.
- AC-SBD-012: The implementation preserves Markdown-first context rules and uses allowed machine-readable exceptions only.
- AC-SBD-013: `@architect` has enough information to decide final schema for scan/audit/finding outputs without re-opening product scope.
- AC-SBD-014: `@dev` has enough information to implement Phase 1 without inventing additional business rules.

## Edge cases

- Missing `aioson` CLI in direct LLM mode: agents use checklist fallback and record limitation.
- Feature with no sensitive surface: `@qa` may skip `@pentester app_target` with rationale.
- Existing brownfield secret from before adoption: reported but not automatically blocking unless policy is changed.
- New secret after baseline adoption: blocking for MEDIUM.
- Non-web project type: controls apply only when the surface exists; N/A requires explicit rationale.
- Stack lacks Argon2id support: `@architect` chooses fallback and records why.
- Runtime event emission fails: security verification result must remain in artifact; telemetry failure is separate.

## Out of scope

- Implementing `security:scan` and `security:audit` in Phase 1.
- Implementing `secure-tdd` skill in Phase 1.
- Extending `@pentester` in Phase 1.
- Web3/dapp surfaces.
- Automatic remediation of findings.
- Rewriting existing PRD sections owned by `@product`.

## Gate A checklist

- [x] Objectives are clear.
- [x] Expected behaviors are described.
- [x] Constraints and out of scope are explicit.
- [x] Open ambiguities are documented as architect/dev/qa decisions.
- [x] Requirement IDs exist for business rules.
- [x] Acceptance criteria exist for behavioral requirements.

> **Gate A:** Requirements ready for `@architect` for Phase 1 — Security Baseline Contract.
