---
description: "Feature dossier schema (canônico v1.0 + v1.1 Phase 3 + v1.2 Research Index) e handoff-protocol artifact_uris v2. Lido por src/dossier/schema.js e src/session-handoff.js — toda mudança aqui exige bump de schema_version."
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
analyst, architect, briefing, committer, copywriter, cypher, design-hybrid-forge,
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

## Research Index — estrutura v1.2 (agent-chain-continuity Phase 1)

A partir de `schema_version: "1.2"`, o dossier inclui uma seção opcional `## Research Index` para registrar pesquisas (`researchs/{slug}/summary.md`) consultadas ou produzidas pelos agentes ao longo do ciclo da feature. A seção é inserida entre `## Rules & Design-Docs aplicáveis` e `## Agent Trail`, e carrega YAML embutido:

```yaml
researchs:
- slug: payment-providers-2026          # kebab-case, único na lista (obrigatório)
  verdict: confirmed                    # enum (obrigatório)
  agent_who_added: orache               # agente canônico (obrigatório)
  why_relevant: "alinha com decisão de stack do PRD §4" # string ≤200 chars (obrigatório)
  added_at: 2026-05-07T14:00:00Z        # ISO 8601 (obrigatório)
  summary_path: researchs/payment-providers-2026/summary.md  # default: researchs/{slug}/summary.md
```

**Verdict enum (`RESEARCH_VERDICTS`):** `confirmed` | `has-alternatives` | `outdated` | `deprecated`

**Idempotência:** `aioson dossier:add-research` deduplica por `slug` com last-write-wins em `verdict`, `why_relevant` e `summary_path`; `agent_who_added` e `added_at` originais da primeira gravação são preservados.

**Forward-compat:** parser v1.2 lê dossiers v1.0 e v1.1 sem `## Research Index` (seção ausente = `researchs: []`).

## handoff-protocol — `artifact_uris` v2

`handoff-protocol.json` (escrito por `src/session-handoff.js`) trafega o campo `artifact_uris` em duas versões:

- **v1 (legado):** array de strings. Cada item é um path relativo (ex.: `.aioson/context/prd-foo.md`).
- **v2 (atual):** array de objetos `{ path, kind, agent, added_at }`.

### v2 schema do item

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `path` | string | sim | path relativo ao projeto (ex.: `.aioson/context/spec-foo.md`) |
| `kind` | string (enum) | sim | ver enum abaixo; valores desconhecidos colapsam para `other` |
| `agent` | string | sim | id de agente canônico produtor; `unknown` quando origem é v1 ou ausente |
| `added_at` | string \| null | sim | ISO 8601 quando conhecido; `null` para itens v1 coercidos |

### Enum `kind` (`ARTIFACT_KINDS`)

```
prd | requirements | spec | plan | dossier | code | test | manifest | conformance | research | other
```

### Política de compatibilidade

- **Writers sempre emitem v2.** As funções `buildWorkflowHandoffProtocol` e `buildBasicHandoffProtocol` em `src/session-handoff.js` aplicam `coerceArtifactUris(...)` antes de escrever. Strings recebidas dos callers são convertidas para `{ path, kind: "other", agent: <fromAgent | "unknown">, added_at: null }`.
- **Readers coercem v1 transparentemente.** `readHandoffProtocol(...)` aplica a mesma coerção pós-`JSON.parse`, então arquivos legados em disco continuam consumíveis sem migração.
- **Sem `sha256`.** Decisão arquitetural: custo-benefício baixo (ver `architecture-agent-chain-continuity.md` § 11). Pode virar v3 se drift entre handoff e estado real virar problema observável.
- **Sem deprecation.** A backwards compat é indefinida — não há plano de remover suporte a leitura de v1.

### Exemplo v2

```json
{
  "version": "1.0",
  "protocol_id": "hnd-product-analyst-1715098200000",
  "from": { "agent_id": "product", "capability_transferred": "define_product_scope" },
  "to": { "agent_id": "analyst", "capability_required": "analyze_requirements" },
  "artifact_uris": [
    {
      "path": ".aioson/context/prd-agent-chain-continuity.md",
      "kind": "prd",
      "agent": "product",
      "added_at": "2026-05-07T14:00:00Z"
    }
  ]
}
```

## Roadmap de schema

- **v1.0** (Phase 1): schema base — frontmatter obrigatório + 6 seções.
- **v1.1** (Phase 3): `code_map` estruturado com validation, `bootstrap_hash`, active retrieval, compaction, `dossier:init --from-existing`. Compatível com leitores v1.0.
- **v1.2** (agent-chain-continuity Phase 1): seção `## Research Index` com YAML embutido + bump do `handoff-protocol.json.artifact_uris` para v2 (objetos `{path, kind, agent, added_at}`). Compatível com leitores v1.0 e v1.1; `handoff-protocol` v1 (strings) continua legível via coerção em `readHandoffProtocol`.
