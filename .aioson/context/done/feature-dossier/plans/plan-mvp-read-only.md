---
phase: 1
slug: "mvp-read-only"
schema_version: "1.0"
---

# Phase 1 — MVP read-only

## Scope

Provar o **read path** ponta-a-ponta. Cada agente lê o dossier no início da sua execução. Nenhuma escrita ainda — apenas inicialização e leitura. Sem mudanças em `handoff-contract` ou `workflow.state.json` nesta fase.

## New or modified entities

- **Novo:** `.aioson/context/features/{slug}/dossier.md` — schema completo com seções: frontmatter, Why, What, Code Map (YAML embutido), Rules & Design-Docs aplicáveis, Agent Trail (vazio nesta fase, só estrutura), Revision Requests (vazio).
- **Novo CLI:** `aioson dossier:init {slug}` — cria o diretório `features/{slug}/` e o `dossier.md` inicial a partir do `prd-{slug}.md` (se existir) ou de prompt interativo. Falha se já existe.
- **Novo CLI:** `aioson dossier:show {slug}` — renderiza o dossier (markdown + YAML pretty-print do code-map).
- **Modificado:** `feature:archive` — move `.aioson/context/features/{slug}/` → `.aioson/context/done/{slug}/dossier/` durante PASS. Backwards-compatible: features sem `features/{slug}/` seguem o fluxo antigo.
- **Modificado:** prompts dos agentes em `.aioson/agents/*.md` — adiciona seção "Feature dossier" na ordem de leitura inicial: tentar `.aioson/context/features/{slug}/dossier.md` antes de PRD/spec específicos. Se ausente, seguir fluxo atual.

## User flows covered

- **F1 — Init:** user roda `/product` (gera PRD-{slug}); imediatamente roda `aioson dossier:init {slug}`; arquivo criado com Why/What extraídos do PRD; agente seguinte lê dossier ao iniciar.
- **F2 — Read em cadeia:** `@analyst → @architect → @dev` cada um lê o dossier no início. Sem write ainda.
- **F3 — Archive:** `feature:close` com PASS move `features/{slug}/dossier.md` para `done/{slug}/dossier/dossier.md`.

## Acceptance criteria

- AC1: `aioson dossier:init feature-x` cria `.aioson/context/features/feature-x/dossier.md` com frontmatter válido (`feature_slug`, `created_by`, `created_at`, `status: active`, `schema_version: 1.0`).
- AC2: `aioson dossier:init feature-x` falha com exit-code != 0 e mensagem clara se o arquivo já existe.
- AC3: `aioson dossier:init feature-x` extrai Why/What automaticamente quando `.aioson/context/prd-feature-x.md` existe.
- AC4: `aioson dossier:show feature-x` renderiza o dossier sem erro mesmo com `code-map` vazio.
- AC5: Pelo menos 3 prompts de agentes (`@analyst`, `@architect`, `@dev`) atualizados para tentar ler o dossier antes do PRD-{slug}, caindo silenciosamente para o fluxo atual quando ausente.
- AC6: `aioson feature:close --slug=feature-x --verdict=PASS` move `features/feature-x/` para `done/feature-x/dossier/` e atualiza `done/MANIFEST.md`.
- AC7: Dossier `schema_version: 1.0` validado por golden fixture.
- AC8: Agente que tenta ler dossier inexistente emite warning silencioso (não erro) e segue fluxo legado.

## Implementation sequence

1. Definir schema completo do `dossier.md` em `.aioson/docs/dossier/schema.md` (referência canônica).
2. Implementar `src/lib/dossier-store.js` (init, read, show — sem write public ainda).
3. Implementar comando `src/commands/dossier.js` (`init`, `show`).
4. Estender `feature:archive` em `src/commands/feature.js` para mover `features/{slug}/`.
5. Atualizar prompts dos 3 agentes-piloto (`@analyst`, `@architect`, `@dev`) com seção "Feature dossier".
6. Golden fixture em `tests/fixtures/dossier/feature-x.dossier.md`.
7. Tests: `tests/dossier-init.test.js`, `tests/dossier-show.test.js`, `tests/feature-archive-dossier.test.js`.

## External dependencies

Nenhuma. Apenas `fs`, `path`, e parser YAML já presente no projeto (`js-yaml` ou equivalente já em uso).

## Notes for @dev

- **Disk-first:** dossier é arquivo `.md` com frontmatter YAML. NÃO mirror em SQLite nesta fase.
- **Atomicidade da escrita:** `dossier:init` usa `fs.writeFileSync` com flag `wx` (falha se existe). Não usar `--force`.
- **Idempotência da leitura:** `dossier:show` é puro read.
- **Compatibilidade:** features atuais (sem `features/{slug}/`) NÃO são quebradas. Bootstrap retroativo é Fase 3.
- **YAML do code-map:** estrutura prevista mas não populada nesta fase:
  ```yaml
  code_map:
    files: []  # [{ path, lines, role, coupling_risk }]
    modules: []
    patterns: []
  ```
- **Frontmatter mínimo do dossier.md:**
  ```yaml
  feature_slug: feature-x
  schema_version: "1.0"
  created_by: dossier-init
  created_at: 2026-04-27T00:00:00Z
  status: active
  classification: MEDIUM
  last_updated_by: dossier-init
  last_updated_at: 2026-04-27T00:00:00Z
  ```
- Preservar comentários/seções vazias no template — Fase 2 vai populá-las.

## Notes for @qa

- Verify AC1-AC8 com testes automatizados.
- Smoke test: rodar fluxo `setup → product → dossier:init → analyst → architect → dev → qa → feature:close`. Confirmar que dossier sobrevive até `done/{slug}/dossier/`.
- Edge: agente rodando em diretório sem `.aioson/context/features/` (greenfield) — não deve crashar.
- Edge: `dossier:show` em slug inexistente — exit-code 1 + mensagem clara.

## Phase-specific reference sources

- `.aioson/plans/feature-dossier/manifest.md` — manifesto e decisões fechadas
- Schema canônico (a ser criado): `.aioson/docs/dossier/schema.md`
