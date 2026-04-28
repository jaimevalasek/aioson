---
feature: feature-dossier
classification: MEDIUM
created_by: analyst
created_at: 2026-04-28
schema_version: "1.0"
sources:
  - .aioson/context/prd-feature-dossier.md
  - .aioson/context/sheldon-enrichment-feature-dossier.md
  - .aioson/plans/feature-dossier/manifest.md
  - .aioson/plans/feature-dossier/plan-mvp-read-only.md
  - .aioson/plans/feature-dossier/plan-write-revisions.md
  - .aioson/plans/feature-dossier/plan-codemap-bootstrap.md
---

# Requirements — Feature Dossier & Reverse Invocation

## 1. Feature summary

Documento vivo por feature (`.aioson/context/features/{slug}/dossier.md`) lido e enriquecido por todos os agentes da cadeia AIOSON, sintetizando contexto-da-feature × código-real, com mecanismo de invocação reversa em modo sugerido (downstream → upstream com aprovação humana). Project_type=script (CLI Node.js); entidades são file-based (Markdown + YAML embutido + JSON), não tabelas SQL.

## 2. New entities (file-based)

### 2.1 `Dossier` — `.aioson/context/features/{slug}/dossier.md`

Frontmatter YAML:

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| feature_slug | string | no | matches `[a-z0-9-]+`; matches dir name |
| schema_version | string | no | enum: `"1.0"` (Fase 1-2), `"1.1"` (Fase 3) |
| created_by | string | no | enum: `dossier-init`, `dossier-bootstrap`, agent-id |
| created_at | ISO-8601 | no | UTC |
| status | enum | no | `active`, `paused`, `closed` |
| classification | enum | no | `MICRO`, `SMALL`, `MEDIUM` |
| last_updated_by | string | no | agent-id ou `dossier-init` |
| last_updated_at | ISO-8601 | no | UTC; atualizado a cada write |
| linked_prd | string | yes | path relativo para PRD (ausente = sem PRD) |
| linked_spec | string | yes | path relativo para spec |
| linked_requirements | string | yes | path relativo para requirements |

Body sections (ordem fixa, headings nunca renomeados):
- `## Why` — texto livre, fonte `@product`
- `## What` — texto livre, fonte `@product` enriquecida por `@sheldon`
- `## Code Map` — bloco YAML embutido (schema 2.3)
- `## Rules & Design-Docs aplicáveis` — lista de `RuleLink` (schema 2.5)
- `## Agent Trail` — append-only de `AgentFinding` (schema 2.4)
- `## Revision Requests` — resumo legível de `Revision` ativos/históricos (detalhes em `revisions.json`)

### 2.2 `Revision` — entrada em `.aioson/context/features/{slug}/revisions.json`

Schema do JSON root:

```json
{
  "schema_version": "1.0",
  "feature_slug": "{slug}",
  "next_id": 1,
  "requests": [ /* array de Revision */ ]
}
```

Campos de cada `Revision`:

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| id | string | no | formato `rev-NNN`, sequencial por feature |
| created_at | ISO-8601 | no | UTC |
| requested_by | string | no | agent-id |
| target_agent | string | no | agent-id |
| target_artifact | string | no | path relativo para artefato (.md/.json) que requer refino |
| reason | string | no | máximo 1000 chars |
| evidence | object | no | `{ code_refs: string[], dossier_section: string }` |
| severity | enum | no | `blocking`, `advisory` |
| status | enum | no | `pending_user_approval`, `approved`, `rejected`, `resolved` |
| resolution | string | yes | mensagem livre quando resolvida |
| resolved_at | ISO-8601 | yes | UTC; preenchido quando status muda para `approved`/`rejected`/`resolved` |
| revision_round_gate | string | yes | gate em que foi aprovada (preenchido por `--approve`) |

Estado: `pending_user_approval` é o estado inicial. `approved` → re-execução do `target_agent` em curso. `resolved` → após o agente upstream completar refino. `rejected` → terminal.

### 2.3 `CodeMapEntry` — YAML embutido em `## Code Map`

Bloco YAML único dentro da seção:

```yaml
code_map:
  schema_version: "1.0"
  files:
    - path: <string, path relativo>
      lines: <string, formato "N-M">
      role: <enum: core-module|command-entry|test|config|integration|util>
      coupling_risk: <enum: low|medium|high>
      added_by: <agent-id>
      added_at: <ISO-8601>
  modules:
    - name: <string>
      path: <string>
      purpose: <string ≤ 200 chars>
  patterns:
    - id: <string, kebab-case>
      why: <string ≤ 200 chars>
```

Constraints:
- `(path, lines)` é chave única para `files[]` — append duplicado é no-op.
- `name` é chave única para `modules[]`.
- `id` é chave única para `patterns[]`.
- `lines` aceita `"1-180"` ou `"42"` (linha única).

### 2.4 `AgentFinding` — entrada em `## Agent Trail`

Formato Markdown padronizado:

```markdown
### {agent} — {ISO-8601 timestamp} — {hash:8}
**Section:** {nome-da-seção-impactada}

{conteúdo livre, máximo 2KB}
```

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| agent | string | no | agent-id |
| timestamp | ISO-8601 | no | UTC |
| hash | string | no | SHA-256(section + content), primeiros 8 chars exibidos |
| section | string | no | nome da seção referida (`Why`, `What`, `Code Map`, etc.) |
| content | string | no | texto livre, máximo 2048 bytes |
| synthetic | boolean | yes | `true` quando criado por `dossier:init --from-existing` |

Hash duplicado = no-op silencioso (idempotência).

### 2.5 `RuleLink` — entrada em `## Rules & Design-Docs aplicáveis`

Formato Markdown:

```markdown
- `{rule_path}` — {reason} _(by {linked_by} at {linked_at})_
```

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| rule_path | string | no | path relativo para `.aioson/rules/*.md` ou `.aioson/design-docs/*.md` |
| reason | string | no | máximo 200 chars |
| linked_by | string | no | agent-id |
| linked_at | ISO-8601 | no | UTC |

Constraint: `rule_path` deve existir no filesystem no momento do `dossier:link-rule`.

### 2.6 `GateRevisionRound` — campo em `workflow.state.json`

Novo objeto top-level no `workflow.state.json`:

```json
{
  "gate_revision_rounds": {
    "requirements": 0,
    "design": 0,
    "plan": 0,
    "execution": 0
  }
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| gate name | string | enum: gates do SDLC engine |
| count | integer | ≥ 0; reset a 0 quando feature muda |

Limite: `count >= 3` exige `--force-revision` em `revision:resolve --approve`.

## 3. Changes to existing entities

### 3.1 `handoff-contract.json` (extensão backwards-compatible)

Novos campos opcionais no top-level:

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| dossier_uri | string | yes | path relativo para `dossier.md` ativo |
| pending_revisions_count | integer | yes | default 0; total de `Revision` em `pending_user_approval` |
| blocking_revisions | array<string> | yes | array de `rev-id` com `severity: blocking` ainda não resolvidas |

**Backwards-compat:** ausência dos campos = handoff legado, tratado como `dossier_uri=null`, `pending_revisions_count=0`, `blocking_revisions=[]`. Handoffs históricos em `done/*/` são imutáveis e nunca migrados.

### 3.2 `feature:archive` (extensão de comportamento)

Quando `feature:close --verdict=PASS` dispara archive:
- Se `.aioson/context/features/{slug}/` existe, mover **diretório inteiro** para `.aioson/context/done/{slug}/dossier/` preservando estrutura interna (`dossier.md`, `revisions.json`, `dossier-history.md`).
- Atualizar `done/MANIFEST.md` com referência ao dossier arquivado.
- Snapshot do `revisions.json` final inclui revisões `rejected` e `resolved` (auditoria).

### 3.3 `aioson workflow:execute` / `workflow:next` (extensão)

Antes de qualquer handoff:
1. Resolver `dossier_uri` da feature ativa.
2. Carregar `revisions.json`.
3. Computar `blocking_revisions = revisions.filter(r => r.severity == 'blocking' && r.status == 'pending_user_approval')`.
4. Se `blocking_revisions.length > 0`: recusar handoff com exit-code != 0 e mensagem listando os `rev-id`.
5. Caso contrário: prosseguir.

### 3.4 `aioson context:pack` (active retrieval, commit 5cc7074)

Quando feature ativa existe (`status: active` em qualquer dossier):
- Incluir dossier ativo como **fonte ranqueada** no context-pack output.
- Rank baseado em `last_updated_at` (mais recente = maior). Decay: dossier sem update há > 30 dias cai abaixo de PRD genérico.
- Snapshot é tirado no início da sessão; dossier permanece a fonte VIVA (não é mutado pelo context:pack).

### 3.5 Prompts dos agentes (`.aioson/agents/*.md`)

Pilotos Fase 1 (read-only): `@analyst`, `@architect`, `@dev` ganham seção "Feature dossier" indicando ler `.aioson/context/features/{slug}/dossier.md` ANTES de PRD/spec específicos. Cair silenciosamente para fluxo legado se ausente.

Fase 2: todos os agentes da cadeia MEDIUM ganham instrução para abrir `revision_request` ao detectar gap em decisão upstream + `dossier:add-finding` ao concluir análise.

Fase 3: instrução adicional para `dossier:add-codemap` quando tocarem código real e `dossier:link-rule` ao identificar regra aplicável.

## 4. Relationships

```
Dossier 1 ─── 1..N AgentFinding   (dentro de ## Agent Trail, append-only)
Dossier 1 ─── 1..N RuleLink       (dentro de ## Rules & Design-Docs)
Dossier 1 ─── 1   CodeMap         (bloco YAML único)
CodeMap 1 ─── 0..N CodeMapEntry   (files[], modules[], patterns[])
Dossier 1 ─── 1   revisions.json  (mesmo diretório)
revisions.json 1 ─── 0..N Revision

Feature ─── 1   Dossier
Feature ─── 1   workflow.state.json (compartilhado com SDLC engine, GateRevisionRound)
Feature ─── 1   handoff-contract.json (estendido com dossier_uri)

Revision ─── 1   target_artifact (PRD/spec/etc — referência por path, nunca FK rígido)
Revision ─── 1   target_agent (agent-id, validado contra lista canônica)
```

Sem foreign keys hard — projeto é file-based. Integridade verificada por validators (ver § 6 Critical business rules).

## 5. Migration additions (file system)

Esta feature não cria tabelas SQL. "Migrations" aqui = diretórios e arquivos novos a serem criados pelo CLI quando uma feature é inicializada:

Ordem de criação (atomicidade por feature):
1. `mkdir -p .aioson/context/features/{slug}/`
2. Escrever `.aioson/context/features/{slug}/dossier.md` (Fase 1) — flag `wx`, falha se existe.
3. Escrever `.aioson/context/features/{slug}/revisions.json` (Fase 2) — `{schema_version, feature_slug, next_id: 1, requests: []}`.
4. (Fase 3, sob demanda): `dossier-history.md` quando primeira compaction dispara.

Adições estruturais ao filesystem aioson (uma vez por instalação):
- Schema canônico: `.aioson/docs/dossier/schema.md` (Fase 1).
- Templates por agente: `.aioson/docs/dossier/agent-templates.md` (Fase 2).

## 6. Critical business rules

**BR-1 — Sintetiza, não substitui.** Dossier referencia PRD/spec/requirements/conformance por path; nunca copia conteúdo inline. Drift detection: `dossier:show` exibe `last_updated_at` de cada referência e sinaliza staleness.

**BR-2 — Append-only no `## Agent Trail`.** Nunca reescrever entradas existentes. Idempotência por hash SHA-256(section + content). Lockfile `.dossier.lock` (PID + timestamp; TTL 60s) protege escrita concorrente na mesma seção.

**BR-3 — `revisions.json` é fonte de verdade.** SQLite (`aios.sqlite`) é mirror para dashboard. Telemetria via `runtime:emit` não é canônica — perda da SQLite não invalida o estado da feature.

**BR-4 — Gates aprovados permanecem aprovados durante invocação reversa.** Re-execução de agente upstream NÃO faz rewind; incrementa `gate_revision_rounds.{gate}` em `workflow.state.json`.

**BR-5 — Anti-loop de 3 ciclos.** `revision:resolve --approve` no mesmo gate além do limite exige `--force-revision`. Telemetria registra cada uso de `--force-revision`.

**BR-6 — Severity governance.** `blocking` trava handoff via `workflow:execute`; `advisory` apenas registra. Apenas `revision:resolve --approve|--reject` move o estado. Handoff só prossegue quando `blocking_revisions.length == 0`.

**BR-7 — Handoff legado nunca quebrado.** Ausência de `dossier_uri` em handoff-contract.json = feature legada → fluxo SDLC pré-dossier preservado integralmente.

**BR-8 — Permission model (default aprovado).** Qualquer agente da cadeia pode abrir revision contra qualquer outro agente da cadeia. Regra de disciplina é informativa via telemetria, não bloqueante.

**BR-9 — Slug inference.** Comandos sem `--slug` resolvem feature ativa via `workflow.state.json#featureSlug`. Sem feature ativa, exigem `--slug` explícito ou exit-code != 0 com mensagem.

**BR-10 — Archive bloqueado por revisões pendentes.** `feature:close --verdict=PASS` recusa close se houver `Revision.status == 'pending_user_approval'`. Mensagem lista rev-ids; user resolve antes.

**BR-11 — Schema versioning obrigatório.** Migração futura entre v1.0 e v1.1 deve ser forward-compat: v1.0 lido por engine v1.1 sem erro.

**BR-12 — Dossier ativo limitado a 15KB.** Auto-compaction migra seções de gates encerrados (aprovados há mais de 1 gate atrás) para `dossier-history.md` com resumo de 1 linha + link no ativo.

**BR-13 — Bootstrap idempotente.** `dossier:init --from-existing` rodado duas vezes não duplica `## Agent Trail`. Dedupe via hash do conjunto de artefatos canônicos consumidos.

**BR-14 — `dossier:link-rule` valida path.** Recusa se `rule_path` não existe em `.aioson/rules/*.md` ou `.aioson/design-docs/*.md` no momento da chamada.

## 7. Edge cases

**EC-1** — `dossier:init feature-x` quando `prd-feature-x.md` não existe: prompt interativo perguntando `Why`/`What` mínimos. Marcar `created_by: dossier-init-prompt`.

**EC-2** — `dossier:init feature-x --from-existing` em feature sem nenhum artefato canônico: exit-code 1 + mensagem "nada para sintetizar — use init sem flag".

**EC-3** — `revision:open` com `target_agent` não-canônico (não pertence à lista de agentes AIOSON): recusa com exit-code 1 + mensagem.

**EC-4** — `revision:open` com `target_artifact` em path inexistente: warn (não erro), aceita registro (artefato pode ser planejado).

**EC-5** — `revision:resolve` em `rev-id` inexistente: exit-code 1 + mensagem clara.

**EC-6** — `revision:resolve --approve` em rev já `resolved`/`rejected`: no-op com warn.

**EC-7** — Lockfile `.dossier.lock` órfão (PID não existe ou timestamp > 60s): ignorar, sobrescrever, registrar warn em telemetria.

**EC-8** — Dois agentes tentam `dossier:add-finding` simultaneamente na mesma seção: lockfile resolve; segundo espera até 30s → se timeout, falha graciosamente com mensagem. Seções diferentes não bloqueiam.

**EC-9** — `dossier-history.md` corrompido (YAML/MD inválido): `dossier:show` lê só ativo, exit 0, warn explícito sobre history inválido.

**EC-10** — `dossier:add-finding` com `--content` > 2048 bytes: recusa com exit-code 1 + mensagem.

**EC-11** — `dossier:add-codemap --file` apontando para arquivo inexistente: warn (não erro hard) — pode ser arquivo planejado pelo agente.

**EC-12** — `dossier.md` ativo com size > 100KB (caso patológico): compaction não loopa; assert pós-compaction que size diminui ≥ 30% ou aborta com mensagem clara.

**EC-13** — `revisions.json` corrompido (JSON inválido): bloquear comandos de revision com exit-code != 0; mensagem aponta o arquivo. Nunca auto-recovery silencioso.

**EC-14** — `feature:close --verdict=PASS` com revisões pendentes: bloquear (BR-10). User pode forçar com `--ignore-pending-revisions` (flag futura, fora deste escopo) — neste MVP não há override.

**EC-15** — Feature legada (sem `features/{slug}/`) atravessando todo o SDLC: nenhum warning, fluxo idêntico ao pré-dossier.

**EC-16** — Telemetria via `runtime:emit` falha (SQLite locked): operação principal NÃO falha; emit é fire-and-forget com warn no stderr.

## 8. Out of scope for this feature

- Modo automático de invocação reversa (LLM detecta gap → abre revision sem aprovação humana). Decisão deferida ≥ 3 meses pós-uso em produção.
- UI no dashboard para visualizar dossier/revisions. Deferida pós-Fase 2.
- Migração retroativa de features `done/` legadas. Bootstrap incremental existe (Fase 3); migração em massa é decisão one-shot do user.
- Mirror do `revisions.json` em SQLite como fonte de verdade — SQLite permanece mirror somente.
- Override `--ignore-pending-revisions` em `feature:close` — não no MVP.
- Permission model com restrição downstream-only — adiado, pode ser regra futura via telemetria.
- Sub-agentes paralelos lendo dossier simultaneamente (caso fora do AIOSON workflow atual).

## 9. Acceptance Criteria com IDs (rastreáveis em `conformance-feature-dossier.yaml`)

### Fase 1 — MVP read-only

- **AC-F1-01:** `aioson dossier:init feature-x` cria `.aioson/context/features/feature-x/dossier.md` com frontmatter completo (BR-11).
- **AC-F1-02:** `aioson dossier:init feature-x` falha (exit ≠ 0) se arquivo já existe.
- **AC-F1-03:** Quando `prd-feature-x.md` existe, `dossier:init` extrai Why/What automaticamente.
- **AC-F1-04:** Quando `prd-feature-x.md` ausente, `dossier:init` entra em prompt interativo (EC-1).
- **AC-F1-05:** `aioson dossier:show feature-x` renderiza dossier sem erro mesmo com `code_map` vazio.
- **AC-F1-06:** `dossier:show` em slug inexistente → exit 1 + mensagem clara.
- **AC-F1-07:** Pelo menos 3 prompts (`@analyst`, `@architect`, `@dev`) atualizados para ler dossier antes de PRD/spec específicos; cai silenciosamente se ausente (BR-7).
- **AC-F1-08:** `feature:close --slug=feature-x --verdict=PASS` move `features/feature-x/` para `done/feature-x/dossier/` e atualiza `done/MANIFEST.md`.
- **AC-F1-09:** Schema `dossier.md v1.0` validado por golden fixture.
- **AC-F1-10:** Feature legada (sem `features/{slug}/`) completa fluxo end-to-end sem warnings (EC-15).

### Fase 2 — Write + Revisões sugeridas

- **AC-F2-01:** `dossier:add-finding` é idempotente por hash (BR-2).
- **AC-F2-02:** `dossier:add-finding --content` > 2KB recusa com exit ≠ 0 (EC-10).
- **AC-F2-03:** Lockfile `.dossier.lock` protege escrita concorrente; órfão > 60s é ignorado (BR-2, EC-7).
- **AC-F2-04:** `revision:open` cria entrada com `id` único sequencial; valida `severity` ∈ `{blocking, advisory}`, `target_agent` ∈ lista canônica (EC-3).
- **AC-F2-05:** `revision:open` atualiza seção `## Revision Requests` do dossier.
- **AC-F2-06:** `revision:list --status=pending` retorna apenas pendentes.
- **AC-F2-07:** `revision:resolve --approve` chama `agent:prompt {target}` com env `AIOSON_REVISION_CONTEXT={rev-id}`; incrementa `gate_revision_rounds` (BR-4).
- **AC-F2-08:** `revision:resolve --reject` é terminal (rev-id não pode ser re-aberta).
- **AC-F2-09:** `revision:resolve` em rev-id inexistente → exit 1 (EC-5).
- **AC-F2-10:** `workflow:execute`/`workflow:next` recusa handoff quando `blocking_revisions.length > 0` (BR-6); mensagem inclui rev-ids.
- **AC-F2-11:** Quarta `--approve` no mesmo gate exige `--force-revision` (BR-5).
- **AC-F2-12:** Handoff legado (sem `dossier_uri`) NÃO é quebrado (BR-7).
- **AC-F2-13:** `feature:archive` snapshota `revisions.json` final (rejeitadas + resolved) em `done/{slug}/dossier/`.
- **AC-F2-14:** `feature:close --verdict=PASS` recusa close com `pending_user_approval` ativos (BR-10).
- **AC-F2-15:** Templates por agente em `.aioson/docs/dossier/agent-templates.md` cobrem 8 agentes da cadeia MEDIUM.
- **AC-F2-16:** Eventos `revision_opened`, `revision_resolved`, `handoff_blocked_by_revision` emitidos via `runtime:emit` (BR-3, EC-16).
- **AC-F2-17:** Slug omitido infere de `workflow.state.json#featureSlug`; sem feature ativa → exige `--slug` (BR-9).
- **AC-F2-18:** `revisions.json` corrompido bloqueia comandos com mensagem clara (EC-13).

### Fase 3 — Code Map + Bootstrap + Auto-context

- **AC-F3-01:** `code_map.files[]` valida schema (path relativo, `lines = "N-M"` ou `"N"`, `role` ∈ enum, `coupling_risk` ∈ {low, medium, high}).
- **AC-F3-02:** `dossier:add-codemap` é idempotente por (path, lines).
- **AC-F3-03:** `dossier:add-codemap` para arquivo inexistente emite warn mas registra (EC-11).
- **AC-F3-04:** `dossier:link-rule` recusa se `rule_path` ausente (BR-14).
- **AC-F3-05:** Auto-compaction dispara quando `stat(dossier.md).size > 15000`; ativo fica < 10KB pós-compaction (BR-12).
- **AC-F3-06:** `dossier-history.md` é append-only e nunca compactado.
- **AC-F3-07:** `context:pack` inclui dossier ativo como source ranqueada com decay por `last_updated_at` (>30d cai abaixo de PRD).
- **AC-F3-08:** Schemas v1.0 e v1.1 do dossier ambos lidos sem erro pelo `dossier:show` (BR-11).
- **AC-F3-09:** `dossier:init --from-existing` em feature sem artefatos → exit 1 (EC-2).
- **AC-F3-10:** `dossier:init --from-existing` é idempotente (BR-13).
- **AC-F3-11:** Bootstrap em feature `done/` produz dossier com `status: closed` e Agent Trail sintético (`synthetic: true`).
- **AC-F3-12:** 8 prompts de agentes atualizados com instruções para `add-codemap` e `link-rule` no fluxo MEDIUM.
- **AC-F3-13:** Compaction patológica (`size > 100KB`) reduz ≥30% ou aborta com mensagem (EC-12).
- **AC-F3-14:** `context:pack` com 20 features ativas completa em < 500ms.

## 10. Risks identified

- **R-1 — Lockfile órfão.** Mitigação implementada via TTL 60s + PID check (BR-2, EC-7). _Tracker:_ `@architect` valida implementação concreta.
- **R-2 — Loop de revisões abusivo.** Mitigação parcial via `--force-revision` + telemetria. **Risco residual aceito** — telemetria expõe padrão para detecção humana. Não bloqueia.
- **R-3 — Drift dossier ↔ artefatos canônicos.** Mitigação: `dossier:show` sinaliza staleness via `last_updated_at` cruzado. _Pendente arquitetural:_ `@architect` define mecanismo concreto de comparação.
- **R-4 — Bootstrap sintético enviesado** quando metadados originais ausentes. Mitigação: `synthetic: true` em entradas sintéticas; agentes downstream podem priorizar findings não-sintéticos.
- **R-5 — Active retrieval ranking obsoleto.** Mitigação: decay por `last_updated_at` >30d (AC-F3-07).
- **R-6 — Dossier vira atrator de prosa longa.** Mitigação: cap 2KB por finding (EC-10) + templates rígidos por agente (AC-F2-15).
- **R-7 — Workflow state machine + revisão reversa em corner cases.** Risco identificado: gate aprovado historicamente mas re-rodar agente em ciclo de revisão. Decisão: gates não fazem rewind (BR-4); `gate_revision_rounds++`. _Pendente arquitetural:_ `@architect` revisa interação com gate-approve em workflow:execute.
- **R-8 — Backwards-compat sutil em handoff-contract.json.** 6 features históricas em `done/*/` têm contracts imutáveis. Mitigação: handlers tratam ausência como legado (BR-7) — testar com fixtures dos 6 contracts existentes.

## 11. Pendências para `@architect`

Mapeadas para Gate B (design):
- Mecanismo concreto de drift detection entre dossier e artefatos canônicos referenciados (R-3).
- Definição da interação entre `revision:resolve --approve` e o gate-approve em `workflow:execute` (R-7).
- Estrutura de chamada `agent:prompt {target} --revision-context={rev-id}` — env var ou flag, e como o agente alvo reconhece o contexto.
- Algoritmo de compaction concreto (qual seção é seção "encerrada" — `gate_revision_rounds == 0` para o gate? ou histórico do `workflow.state.json`?).
- Schema migration path v1.0 → v1.1 (Fase 1 entrega v1.0; Fase 3 introduz v1.1 com `code_map` obrigatório).
