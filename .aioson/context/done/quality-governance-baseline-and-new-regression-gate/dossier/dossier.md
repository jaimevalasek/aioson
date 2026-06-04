---
feature_slug: quality-governance-baseline-and-new-regression-gate
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-06-02T01:54:16.706Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-06-02T01:54:16.706Z
bootstrap_hash: 7cded8cdb316
---
## Why

AIOSON already tells agents how code should be structured, but it does not consistently require proof that an implementation avoided dead code, duplicated logic, dependency drift, or structural regressions. This leaves @dev and @qa dependent on focused tests and manual review, while repo-wide maintainability can quietly degrade.

## What

_(não encontrado — preencher manualmente)_

## Code Map

```yaml
files:
- path: src/commands/quality-audit.js
  role: command-entry
  coupling_risk: medium
  added_by: architect
  added_at: 2026-06-02T02:31:39.729Z
- path: src/lib/quality/result.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-02T02:43:20.396Z
- path: src/lib/quality/provider.js
  role: io-layer
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-02T02:43:20.807Z
- path: src/lib/quality/report.js
  role: io-layer
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-02T02:43:20.827Z
- path: tests/quality-audit.test.js
  role: test
  coupling_risk: low
  added_by: dev
  added_at: 2026-06-02T02:43:20.870Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(populado via dossier:link-rule)_

## Agent Trail

- **2026-06-02T01:54:16.706Z** | @product | _prd_
- **2026-06-02T01:54:16.706Z** | @analyst | _requirements_
- **2026-06-02T01:54:16.706Z** | @sheldon | _sheldonEnrichment_
- **2026-06-02T01:54:16.706Z** | @architect | _spec_

<!-- sha256:25c2c089a56f9115bfad4b8f4c63006085f77984e2b546ff81e45e643fdd852d -->
**2026-06-02T02:17:33.885Z** | @pm | _Agent Trail_

Plano refinado. Stories: 0. Prioridade: desbloquear Gate C para implementação do quality:audit MVP.

<!-- sha256:00814c90544740cc0ee93be321ee3d658a871a7e95940f0a964150bd52378033 -->
**2026-06-02T02:31:26.707Z** | @architect | _Agent Trail_

Arquitetura definida: quality:audit command orchestration in src/commands, reusable quality logic in src/lib/quality, Markdown-first report artifact.

<!-- sha256:b7e38bbc35e29d98eba666aa97a8935830b4f9a97a7848fba85f1e2a2446ad58 -->
**2026-06-02T02:43:04.852Z** | @dev | _Agent Trail_

Implemented quality:audit MVP: normalized AIOSON result contract, provider boundary, baseline/new classification, Markdown report, CLI registration, and focused node:test coverage. Smoke quality:audit status: warn because local Fallow provider is absent by design.

<!-- sha256:460db45edc095bed3960b2c6bb463ccc0172c8db98642d8e85254af94a68c618 -->
**2026-06-02T03:38:18.163Z** | @qa | _Agent Trail_

QA completed. Verdict: PASS. Gate D approved. Coverage: 18/18 ACs covered. Issues: none Critical/High/Medium/Low. Residual: local Fallow provider absent, so live provider result remains intentional warn advisory.

## Revision Requests

_(vazio)_
