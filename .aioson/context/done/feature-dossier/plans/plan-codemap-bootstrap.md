---
phase: 3
slug: "codemap-bootstrap"
schema_version: "1.0"
---

# Phase 3 — Code Map + Bootstrap + Auto-context

## Scope

Tornar o dossier **adotável incrementalmente** (bootstrap de features já existentes) e **auto-mantível** (auto-migração para history, integração com active retrieval). Estruturar `code_map` como YAML embutido com schema concreto.

## New or modified entities

- **Modificado:** schema do `dossier.md` — `code_map` agora obrigatório no frontmatter ou em bloco YAML dedicado:
  ```yaml
  code_map:
    schema_version: "1.0"
    files:
      - path: "src/commands/dossier.js"
        lines: "1-180"
        role: "command-entry"
        coupling_risk: low
        added_by: dev
        added_at: 2026-04-28T00:00:00Z
    modules:
      - name: "dossier-store"
        path: "src/lib/dossier-store.js"
        purpose: "io layer for dossier.md"
    patterns:
      - id: "append-only-trail"
        why: "evita corromper findings históricos"
  ```
- **Novo CLI:** `aioson dossier:add-codemap {slug} --file=<path> --lines=<range> --role=<role> --coupling=<low|medium|high>` — append em `code_map.files` (idempotente por path+lines).
- **Novo CLI:** `aioson dossier:link-rule {slug} --rule=<path> --reason="..."` — registra rule/design-doc aplicável na seção `## Rules & Design-Docs aplicáveis`.
- **Novo CLI:** `aioson dossier:init {slug} --from-existing` — sintetiza dossier inicial a partir de:
  - `.aioson/context/prd-{slug}.md` (Why, What)
  - `.aioson/context/spec-{slug}.md` (decisões técnicas)
  - `.aioson/context/sheldon-enrichment-{slug}.md` (gaps)
  - `.aioson/context/handoff-protocol.json` (estado do gate)
  - `.aioson/context/done/{slug}/` (se feature já fechada — extrai histórico para Agent Trail)
- **Novo:** `.aioson/context/features/{slug}/dossier-history.md` — auto-criado quando `dossier.md` ativo passa de 15KB. Recebe seções de gates encerrados (`design`, `plan` aprovados há mais de 1 gate atrás).
- **Novo CLI interno:** `aioson dossier:compact {slug}` — força compactação manual (também roda automaticamente após `revision:resolve` se size > 15KB).
- **Modificado:** `src/lib/active-retrieval.js` (memory layer do commit 5cc7074) — quando feature está ativa (`status: active` em `dossier.md`), inclui dossier ativo como **fonte ranqueada** no `context-pack.md`. Snapshot é tirado no início da sessão; dossier permanece a fonte VIVA.
- **Modificado:** comando `aioson context:pack` (ou equivalente do active retrieval) consulta `.aioson/context/features/*/dossier.md` (`status: active`) e inclui no ranking.

## User flows covered

- **F10 — Bootstrap retroativo:** AIOSON tem 6 features em `done/`. User roda `aioson dossier:init sdlc-process-upgrade --from-existing` → dossier sintetizado a partir de PRD + spec + handoff + done/ existentes. Histórico vai para `## Agent Trail` com timestamps deduzidos.
- **F11 — Code map estruturado:** `@architect` decide arquitetura → roda `dossier:add-codemap feature-x --file=src/lib/auth.js --lines=1-200 --role=core-module --coupling=high`. `code_map.files` populado.
- **F12 — Rule linking:** `@analyst` identifica que `disk-first-artifacts.md` aplica → `dossier:link-rule feature-x --rule=.aioson/rules/disk-first-artifacts.md --reason="dossier deve ser file-first"`.
- **F13 — Auto-compaction:** dossier ativo cresce > 15KB → próximo `dossier:add-finding` triggera `compact`; seções de gates encerrados migram para `dossier-history.md`. Resumo de 1 linha por seção fica no ativo, com link para history.
- **F14 — Active retrieval ranking:** sessão inicia → `context:pack` consulta features ativas → dossier de `feature-x` aparece como source ranqueada (rank > PRD genérico, < bootstrap files).

## Acceptance criteria

- AC1: `dossier:init feature-x --from-existing` funciona em features sem `prd-{slug}.md` (usa `prd.md` global), com `spec-{slug}.md` apenas, e em features `done/`.
- AC2: `code_map.files` no `dossier.md` valida contra schema (path relativo, lines = `int-int`, role ∈ enum, coupling_risk ∈ {low, medium, high}).
- AC3: `dossier:add-codemap` é idempotente por (path, lines) — mesma entrada não duplica.
- AC4: `dossier:link-rule` falha se path do rule não existe em `.aioson/rules/` ou `.aioson/design-docs/`.
- AC5: Auto-compaction dispara automaticamente quando `stat(dossier.md).size > 15000` bytes; `dossier-history.md` recebe seções migradas; ativo fica < 10KB após compaction.
- AC6: `dossier-history.md` é append-only e nunca é compactado novamente.
- AC7: `context:pack` inclui dossier ativo como source ranqueada (testar com fixture: feature ativa + active retrieval rodando → dossier aparece no pack output).
- AC8: Schema versioning: `dossier.md` v1.0 e v1.1 (esta fase) são ambos lidos sem erro pelo `dossier:show` (forward compat futuro).
- AC9: `dossier:init --from-existing` em feature sem nenhum artefato canônico — exit 1 + mensagem clara ("nada para sintetizar — use init sem flag").
- AC10: Todos os agentes pilotos (8 agentes do fluxo MEDIUM) atualizados com instrução de usar `dossier:add-codemap` quando tocarem código real.

## Implementation sequence

1. Schema v1.1 do `dossier.md` em `.aioson/docs/dossier/schema.md` (atualização).
2. `src/lib/codemap-store.js` — CRUD do `code_map` embutido (parse YAML, validate, append, dedupe).
3. `src/commands/dossier.js` ganha sub-commands `add-codemap`, `link-rule`, `compact`, `init --from-existing`.
4. `src/lib/dossier-bootstrap.js` — sintetiza dossier a partir de artefatos existentes (lê prd, spec, sheldon-enrichment, handoff, done).
5. `src/lib/dossier-compact.js` — implementa regra dos 15KB + migração para history (preserva resumos no ativo).
6. Estender `src/lib/active-retrieval.js` (commit 5cc7074) para incluir dossiers ativos no ranking.
7. Atualizar prompts dos 8 agentes com instruções de uso do `add-codemap` e `link-rule`.
8. Tests: `dossier-bootstrap.test.js` (3 cenários — só PRD, só spec, feature done), `codemap-validate.test.js`, `compact.test.js`, `active-retrieval-dossier.test.js`.

## External dependencies

Reutiliza módulos da Fase 2 (dossier-store, revision-store) e do active retrieval layer (`5cc7074`).

## Notes for @dev

- **Schema YAML do code-map embutido:** deve ser parseável por `js-yaml` standard. Não usar tags custom.
- **Compaction algorithm:**
  1. Ler `dossier.md` → split em seções por `##` heading.
  2. Identificar seções pertencentes a gates aprovados há mais de 1 gate atrás (consultar `workflow.state.json`).
  3. Mover seções selecionadas para `dossier-history.md` com header `## [Migrated from active dossier on YYYY-MM-DD]`.
  4. Substituir no ativo por resumo de 1 linha + link `[ver history](dossier-history.md#anchor)`.
- **Bootstrap heuristics:**
  - Se `done/{slug}/MANIFEST.md` existe → feature `done`; status do dossier = `closed`.
  - Se `handoff-protocol.json` aponta `feature_slug` matching → status = `active`, gate atual extraído.
  - Agent Trail é sintético: para cada artefato existente, gerar entrada com `created_by` = autor canônico do artefato (PRD → product, spec → architect, etc.).
- **Idempotência do bootstrap:** rodar duas vezes não deve duplicar Agent Trail. Usar hash do conjunto de artefatos como dedupe key.
- **Active retrieval — não duplicar dados:** dossier vai como REFERÊNCIA no context-pack, não como cópia inline. Rank baseado em `last_updated_at` (mais recente = maior rank entre dossiers).

## Notes for @qa

- Verify AC1-AC10 automaticamente.
- Smoke retroativo: rodar `dossier:init sdlc-process-upgrade --from-existing` no próprio AIOSON repo. Confirmar dossier coerente.
- Edge: `dossier:add-codemap` com path apontando para arquivo inexistente — warn (não erro hard) e registra mesmo assim (pode ser arquivo planejado).
- Edge: `dossier-history.md` corrompido → `dossier:show` lê só ativo, exit 0, warn explícito sobre history inválido.
- Edge: feature ativa com dossier > 100KB (caso patológico) — compaction não deve loopar; assert que após uma compaction roda o tamanho diminui.
- Performance: `context:pack` com 20 features ativas — completa em < 500ms.

## Phase-specific reference sources

- `.aioson/plans/feature-dossier/plan-mvp-read-only.md` — base que esta fase estende
- `.aioson/plans/feature-dossier/plan-write-revisions.md` — esta fase assume Fase 2 entregue
- Commit `5cc7074` (feat(memory): active retrieval layer) — ponto de integração obrigatório
- Commit `e943782` (feat(feature-archive)) — modelo de bootstrap a partir de artefatos existentes
