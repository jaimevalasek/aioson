---
feature: cross-tool-project-knowledge
classification: SMALL
status: in_progress
gate: A
analyst_date: 2026-05-30
source_prd: prd-cross-tool-project-knowledge.md
briefing_source: cross-tool-project-knowledge
extends: active-learning-loop
---

# Requirements — Cross-tool Project Knowledge Memory

## 1. Feature summary

Estende `active-learning-loop` com **materialização disk-first** dos achados técnicos do projeto (gotchas + fix-recipes) em `.aioson/learnings/{gotchas,recipes}/{slug}.md` + `INDEX.md` regenerado, mais uma **diretiva universal de loading** em `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` para que qualquer harness (Claude Code, Codex, OpenCode) leia o conhecimento sem chamar `aioson memory:search`. Reusa o schema `project_learnings`, o pipeline `feature:close → runDistillation`, e `memory:archive` existentes. Inception-mirrored (src + template).

## 2. Re-grounding contra o código real (correções @analyst)

O PRD descreve o mecanismo de captura de forma imprecisa. Verificado contra HEAD (2026-05-30):

| Premissa do PRD | Realidade no código | Correção adotada |
|---|---|---|
| "agent emite via comando existente do `learning` CLI" | `aioson learning` só tem `list\|stats\|promote` (`src/commands/learning.js:116-130`) — **não há verbo `capture`** | Captura é via pipeline de **devlog**: agent escreve devlog com `## Learnings`; `devlog:process` chama `upsertProjectLearning` (`src/commands/devlog-process.js:72`) que faz o INSERT em `project_learnings` |
| "estender `memory-capture-directive.md`" | Esse arquivo é da **operator-memory** (emite `op:capture` p/ decisões do operador — 4 sinais auth/exclusion/correction/confirmation). Não toca `project_learnings`. | M1 cria um **novo irmão** `template/agents/_shared/learning-capture-directive.md` (o PRD já previa "ou irmão") |
| Q-CTPK-01: "recriar tabela com CHECK expandido" | `project_learnings.type` tem CHECK schema-level (`runtime-store.js:479`) **e** há FTS5 external-content acoplado por rowid (`project_learnings_fts` + triggers); recreate arriscado. Convenção do repo: "CHECKs em app code, não schema" + `ADD COLUMN` seguro (`learning-loop-migration.js:18-19`) | **Decisão do usuário (2026-05-30):** `ADD COLUMN kind TEXT`. Ver §3. |

## 3. Decisões @analyst (open questions resolvidas)

- **Q-CTPK-01 — schema:** `ALTER TABLE project_learnings ADD COLUMN kind TEXT` (idempotente, O(1), FTS5 intacto). Learnings de project-knowledge gravam `type='quality'` + `kind ∈ {'gotcha','resolution'}`. Allow-list de `kind` validada em **app code** (convenção do repo). Sem recreate, sem rebuild de FTS5.
- **Q-CTPK-02 — trigger da materialização:** **só em `feature:close`**. Hook em `runDistillation` (`learning-loop-engine.js:164`), **após** `runLearningAutoPromote` e **antes** de `releaseLockWithSummary` (≈linha 232) — já roda sob o distillation lock, idempotente.
- **Q-CTPK-03 — PII:** **trust-user V1**. Sem sanitization automática; o `learning-capture-directive.md` traz aviso forte (*"esta captura será committed; revise antes de aceitar"*). Sanitize-on-promote vira V2 se telemetria mostrar problema (consistente com active-learning-loop).

**Deferidas a V2 (eram "para @architect"; SMALL pula @architect — ficam como default V1 explícito):**
- Q-CTPK-04 (INDEX size cap/paginação): V1 sem paginação; threshold de sanidade = **alert se INDEX.md > 100 entries** (telemetria, não bloqueia). Trim/paginate = V2.
- Q-CTPK-05 (profile-aware loading): V1 lê INDEX inteiro; segmentação por plataforma = V2.
- Q-CTPK-06 (lock concorrência): a materialização roda **dentro** do distillation lock já existente (Q-CTPK-02), então writes do INDEX.md de `feature:close` paralelos já são serializados por feature. Não precisa flock adicional em V1.
- **Loading-order cross-layer** (briefing R1: `rules > operator-memory > project-learnings > brain > raw context`): a diretiva M4 é aditiva e lazy; V1 não impõe ordem dura. Nota não-bloqueante para validação pós-land.

## 4. Entidades — mudanças

### 4.1 Coluna nova em `project_learnings` (única mudança de schema)

| Campo | Tipo | Nullable | Constraints |
|-------|------|----------|-------------|
| `kind` | TEXT | sim (NULL p/ rows legadas) | App-level allow-list: `NULL \| 'gotcha' \| 'resolution'`. Discrimina learnings de project-knowledge dentro de `type='quality'`. |

Migration: `ALTER TABLE project_learnings ADD COLUMN kind TEXT;` com guard idempotente de existência de coluna (mesmo padrão de `PHASE3_COLUMNS` em `learning-loop-migration.js`). Rows existentes: `kind=NULL` (interpretado como "não-project-knowledge"). FTS5 e triggers **não** são tocados (rowids preservados).

### 4.2 Artefatos de disco (não-DB)

**Arquivo individual** `.aioson/learnings/{category}/{slug}.md` — `category ∈ {gotchas, recipes}` (gotcha→gotchas, resolution→recipes):
```markdown
---
learning_id: {project_learnings.learning_id}
type: gotcha | resolution        # = kind
category: gotchas | recipes
feature_slug: {originating-feature}
confidence: high | medium | low
created_at: {ISO}
updated_at: {ISO}
cited_files: [path1, path2]       # extraído do corpo "## Cited files" (best-effort; [] se ausente)
---

# {title}

{evidence body}

## Cited files
- {path1}
```

**Índice** `.aioson/learnings/INDEX.md` — 1 linha por learning, ≤200 chars, ordenação `category > updated_at DESC`:
```markdown
# Project Learnings

- [{title}]({category}/{slug}.md) — {1-line summary}. Files: {cited_files join ', '}
```

> `cited_files` em V1 é derivado (best-effort) da seção `## Cited files` do `evidence` body — **sem** coluna nova no DB (mantém a mudança de schema só em `kind`).

## 5. Relationships (com a infra existente)

- **`active-learning-loop`** — reusa `project_learnings` (+ FTS5), `runDistillation`/`runLearningAutoPromote`, `feature:close`, `memory:archive`. Sem nova tabela, sem novo namespace CLI.
- **devlog pipeline** — `upsertProjectLearning` (`devlog-process.js`) é o ponto de INSERT; M1 estende o parser + o mapeamento type/kind.
- **operator-memory** — ortogonal: `op:capture` (preferências do operador) ≠ project-knowledge (fatos técnicos). Diretivas separadas.
- **harness entry-points** — reusa `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` do `harness-driven-aioson`. **NÃO** `template/.gemini/GEMINI.md` (Q-CTPK-08 / coupling com gemini-phaseout).

## 6. Surfaces & migration order (Fase 1 — V1, ordenada)

1. **Schema:** `ADD COLUMN kind` (idempotente) em `runtime-store.js` base + migration guard. Atualizar o `CREATE TABLE` base p/ incluir `kind TEXT` em fresh installs.
2. **M1 — captura:** novo `template/agents/_shared/learning-capture-directive.md` (2 sinais: `gotcha`, `resolution`; formato naive-assumption/actual/why e symptom/root-cause/fix; aviso PII). Estender `extractLearnings` + `upsertProjectLearning` (`devlog-process.js`) p/ mapear `gotcha`/`resolution` → `type='quality'`, `kind=<sinal>`. Allow-list de `kind` em app code.
3. **M2 — materialização:** novo módulo `src/learning-materialize.js` (`materializeLearnings({db, targetDir})`) chamado por `runDistillation` após auto-promote; itera `WHERE kind IN ('gotcha','resolution') AND status='active'`; escreve/atualiza `{category}/{slug}.md` (idempotente: só reescreve se `row.updated_at` > frontmatter `updated_at`).
4. **M3 — INDEX:** mesma chamada regenera `.aioson/learnings/INDEX.md` (ordenação `category > updated_at DESC`; telemetria de alerta se >100 entries).
5. **M4 — diretiva universal:** bloco canônico idêntico em `CLAUDE.md` + `AGENTS.md` + `OPENCODE.md` (workspace + template). Texto: *"Read `.aioson/learnings/INDEX.md` if it exists. Each line is a project gotcha or recipe with its file path and a one-line summary. Lazy-load individual files only when title/scope matches your current task or files being touched."*
6. **M5 — import:** `aioson learning --sub=import-from-claude [--project-hash=<hash>] [--dry-run] [--select=...]` (novo dispatch em `learning.js` + módulo). Lê `~/.claude/projects/{hash}/memory/MEMORY.md` + linkados; classifica heurística (gotcha/resolution/operator-preference/unknown); tier-2 notify por unit; promove via path do `upsertProjectLearning`. Filtra operator-preferences (delega a operator-memory).
7. **M6 — inception parity:** toda mudança em `src/*` e `template/*` aterrissa em paralelo (`sync:agents`); test de paridade análogo a `tests/inception-parity-active-learning-loop.test.js`.
8. **Placeholders:** `aioson setup` greenfield cria `.aioson/learnings/gotchas/.gitkeep` + `.aioson/learnings/recipes/.gitkeep`.

## 7. Business rules

- **BR-CTPK-01** — Project-knowledge learnings gravam `type='quality'` + `kind ∈ {'gotcha','resolution'}`. `kind` validado por allow-list em app code (NULL permitido p/ rows não-project-knowledge).
- **BR-CTPK-02** — Materialização dispara **só em `feature:close`** (dentro do distillation lock), nunca on-capture.
- **BR-CTPK-03** — Materialização é idempotente: reescreve `{slug}.md` apenas se `row.updated_at` for mais recente que o frontmatter on-disk. INDEX.md é sempre regenerado quando M2 dispara.
- **BR-CTPK-04** — Categorias V1 fixas: `kind='gotcha'`→`gotchas/`, `kind='resolution'`→`recipes/`.
- **BR-CTPK-05** — Storage default **committed** (compartilhar com o time via git). PII = trust-user V1 com aviso no capture directive.
- **BR-CTPK-06** — Diretiva universal idêntica nos 3 entry-points; **nunca** em `template/.gemini/GEMINI.md` (Q-CTPK-08).
- **BR-CTPK-07** — `import-from-claude` é tier-2 notify por learning; nunca auto-promove sem confirmação; filtra operator-preferences.
- **BR-CTPK-08** — Sem novo namespace CLI: `import-from-claude` é `--sub` de `aioson learning`.
- **BR-CTPK-09** — Inception parity: src + template em paralelo; parity test obrigatório no QA.
- **BR-CTPK-10** — Zero regressão sobre `active-learning-loop` (os 5 metrics existentes seguem PASS).
- **BR-CTPK-11** — Cada linha do INDEX.md ≤200 chars; 0 broken links; ordenação `category > updated_at DESC`.

## 8. Edge cases

- **EC-CTPK-01** — `.aioson/learnings/` inexistente no 1º `feature:close`: M2 cria as pastas (`gotchas/`, `recipes/`) antes de escrever.
- **EC-CTPK-02** — Nenhuma learning `kind IN (gotcha,resolution)` ativa: M2 é no-op; INDEX.md vazio (ou cabeçalho só) — não quebra, não cria lixo.
- **EC-CTPK-03** — Migration roda em DB que já tem `kind`: guard de existência → no-op (idempotente).
- **EC-CTPK-04** — Devlog com `**GOTCHA**:`/`**RESOLUTION**:` mas DB pré-migration: a migration roda no boot do runtime-store (antes do INSERT), então `kind` já existe; se por algum motivo não, o INSERT cai no fallback `type='quality', kind=NULL` (não quebra; materialização ignora kind=NULL).
- **EC-CTPK-05** — `slug` colidente (2 learnings, mesmo título sanitizado, features diferentes): `upsertProjectLearning` já dedup por `(title, feature_slug)`; no disco, incluir `feature_slug` no slug se necessário p/ evitar overwrite cross-feature.
- **EC-CTPK-06** — INDEX.md > 100 entries: emite telemetria de alerta (tier-1), **não** pagina nem corta em V1.
- **EC-CTPK-07** — `import-from-claude`: `~/.claude/projects/{hash}/` inexistente ou MEMORY.md ausente → erro claro non-zero, zero rows inseridas.
- **EC-CTPK-08** — `import-from-claude` `--dry-run`: lista candidatos + classificação, **nenhuma** mutação.
- **EC-CTPK-09** — Learning materializada depois é archived (`memory:archive`): o `.md` on-disk fica órfão. V1: a próxima regeneração do INDEX o omite (status≠active); o arquivo individual pode ser limpo no mesmo M2 (deletar `{slug}.md` se a row saiu de active) — best-effort.
- **EC-CTPK-10** — evidence body > 5KB: aceito até 5KB (PRD out-of-scope cap); acima, @dev trunca ou linka p/ docs/ (V1 não força).

## 9. Out of scope (V1)

Cross-projeto/`~/.aioson/global/learnings/`; sync com aioson.com; `import-from-gemini`/`import-from-antigravity`; clustering/embedding semântico; auto-archive de stale por mudança de arquivo citado (S2 surface humano = V2); PII sanitization automática; promotion `learnings/→docs/` automática; per-file cap >5KB; profile-aware loading no INDEX; paginação do INDEX. S1 (auto-suggest de categorização), S2 (`learning_files_drift` doctor check), S3 (`learning:export --to=stdout`) = should-have, fora do MVP V1.

## 10. Riscos

- **R1** — FTS5 coupling: mitigado pela decisão `ADD COLUMN kind` (rowids/FTS5 intactos). Não recriar a tabela.
- **R2** — Inception loading-order: 5ª camada de memória sem ordem dura. Mitigação: diretiva lazy + nota de validação pós-land (Q-CTPK-05/loading-order deferido).
- **R3** — Ruído de captura: 2 sinais (não 4) reduz risco; aviso PII no directive.
- **R4** — Slug collision cross-feature (EC-CTPK-05) — incluir feature_slug no slug quando necessário.
- **R5** — Workflow state desalinhado: o motor está em trilha `cross-tool-project-knowledge` (@analyst); avançar via `--feature` explícito.
