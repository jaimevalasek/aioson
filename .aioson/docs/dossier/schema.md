---
description: "Feature dossier schema (canônico v1.0 + v1.1 Phase 3). Lido por src/dossier/schema.js — toda mudança aqui exige bump de schema_version."
---

# Feature Dossier — Schema canônico

## Path

`.aioson/context/features/{slug}/dossier.md`

Onde `{slug}` é kebab-case: `^[a-z0-9][a-z0-9-]*$`.

## Estrutura geral

```markdown
---
<frontmatter YAML — ver § Frontmatter>
---

## Why
<extraído de prd-{slug}.md, ou prompt interativo>

## What
<extraído de prd-{slug}.md § Escopo do MVP, ou prompt interativo>

## Code Map

```yaml
files: []
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

(vazio na Phase 1 — populado a partir da Phase 2 via `dossier:link-rule`)

## Agent Trail

(vazio na Phase 1 — populado a partir da Phase 2 via `dossier:add-finding`)

## Revision Requests

(vazio na Phase 1 — populado a partir da Phase 2 via `revision:open`)
```

## Frontmatter (v1.0)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `feature_slug` | string | sim | kebab-case; deve bater com o nome do diretório pai |
| `schema_version` | string | sim | `"1.0"` em Phase 1 |
| `created_by` | string | sim | id de agente canônico OU `dossier-init` |
| `created_at` | string | sim | ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ` ou `YYYY-MM-DDTHH:mm:ss.sssZ`) |
| `status` | string | sim | `active` \| `completed` |
| `classification` | string | sim | `MICRO` \| `SMALL` \| `MEDIUM` |
| `last_updated_by` | string | sim | id de agente canônico OU `dossier-init` |
| `last_updated_at` | string | sim | ISO 8601 |

## IDs de agentes canônicos (v1.0)

Fonte de verdade: `.aioson/agents/*.md`. A lista abaixo deve estar sincronizada com `src/dossier/schema.js#CANONICAL_AGENT_IDS`.

```
analyst, architect, committer, copywriter, cypher, design-hybrid-forge,
dev, deyvin, discover, discovery-design-doc, genome, neo, orache, orchestrator,
pair, pentester, pm, product, profiler-enricher, profiler-forge, profiler-researcher,
qa, setup, sheldon, site-forge, squad, tester, ux-ui, validator
```

Pseudo-id permitido em `created_by` / `last_updated_by` apenas: `dossier-init` (origem CLI).

## Seções obrigatórias

Em ordem (parser tolera ordem mas writers devem manter):

1. `## Why`
2. `## What`
3. `## Code Map`
4. `## Rules & Design-Docs aplicáveis`
5. `## Agent Trail`
6. `## Revision Requests`

## Code Map — estrutura v1.1 (Phase 3)

O bloco `## Code Map` contém YAML embutido com schema:

```yaml
files:
- path: src/commands/dossier.js    # caminho relativo (obrigatório)
  lines: 1-180                      # intervalo int-int (opcional)
  role: command-entry               # enum (opcional)
  coupling_risk: low                # low | medium | high (opcional)
  added_by: dev                     # agente canônico (opcional)
  added_at: 2026-04-28T00:00:00Z   # ISO 8601 (opcional)
modules:
- name: dossier-store               # nome do módulo (obrigatório)
  path: src/dossier/store.js        # caminho (opcional)
  purpose: io layer for dossier.md  # descrição livre (opcional)
patterns:
- id: append-only-trail             # identificador (obrigatório)
  why: evita corromper findings históricos
```

**Roles permitidos (`code_map.files[].role`):**
`command-entry`, `core-module`, `io-layer`, `store`, `schema`, `test`, `util`, `config`, `integration`, `cli`, `other`

**Coupling risk:** `low` | `medium` | `high`

**Regra de idempotência:** `dossier:add-codemap` deduplica por `(path, lines)` — mesma entrada nunca é duplicada.

**Compaction (`dossier:compact`):**
- Threshold: 15KB. Seções de gates encerrados migram para `dossier-history.md` (append-only).
- Active dossier fica < 10KB após compaction.
- `dossier-history.md` nunca é recompactado.

**Bootstrap (`dossier:init --from-existing`):**
- Sintetiza dossier a partir de `prd-{slug}.md`, `spec-{slug}.md`, `sheldon-enrichment-{slug}.md`, `requirements-{slug}.md`, `done/{slug}/`.
- Idempotente via `bootstrap_hash` no frontmatter.
- Sem artefatos disponíveis: exit com `EBOOTSTRAPEMPTY`.

**Active retrieval:**
- `context:pack` inclui dossiers com `status: active` como fontes ranqueadas (rank 55–70, entre PRD e bootstrap).
- Dossier mais recente (`last_updated_at`) tem rank maior.
- Dossiers `paused` ou `closed` são excluídos do pack.

## CLI de suporte (Phase 3)

| Comando | Descrição |
|---------|-----------|
| `aioson dossier:add-codemap {.} --slug={slug} --file=<path> [--lines=<int-int>] [--role=<role>] [--coupling=<low\|medium\|high>]` | Adiciona entry ao Code Map (idempotente por path+lines) |
| `aioson dossier:link-rule {.} --slug={slug} --rule=<path> [--reason="..."]` | Registra rule ou design-doc aplicável |
| `aioson dossier:compact {.} --slug={slug} [--force]` | Compacta dossier ativo (migra para history) |
| `aioson dossier:init {.} --slug={slug} --from-existing` | Bootstrap retroativo a partir de artefatos existentes |

## Frontmatter campos adicionais (Phase 3)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `bootstrap_hash` | string | não | SHA-256 truncado dos artefatos de origem; usado por `init --from-existing` para idempotência |

## Compatibilidade

`dossier:show` lê v1.0 e v1.1 sem erro. Campos extras em frontmatter são ignorados (forward-compat). `dossier-history.md` corrompido: `dossier:show` lê só o ativo, exit 0, warn explícito.

## Roadmap de schema

- **v1.0** (Phase 1): schema base — frontmatter obrigatório + 6 seções.
- **v1.1** (Phase 3): `code_map` estruturado com validation, `bootstrap_hash`, active retrieval, compaction, `dossier:init --from-existing`. Compatível com leitores v1.0.
