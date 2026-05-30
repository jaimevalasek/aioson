---
briefing_source: cross-tool-project-knowledge
classification: SMALL
source: briefings/cross-tool-project-knowledge/briefings.md
generated_at: 2026-05-23
---

# PRD — Cross-tool Project Knowledge Memory

## Vision

Estender `active-learning-loop` com materialização disk-first dos achados técnicos do projeto (`.aioson/learnings/`), tornando o conhecimento legível por qualquer harness — Claude Code, Codex, OpenCode, e futuros — sem que o harness precise chamar `aioson memory:search` no preflight. O resultado é que uma gotcha capturada numa sessão Claude Code fica imediatamente disponível para a próxima sessão Codex do mesmo projeto, propagando knowledge sem retreinamento e sem cópia manual.

## Problem

Achados técnicos não-óbvios sobre o stack (gotchas, fix-recipes) emergem com custo alto durante sessões de dev — ex.: *"OpenClaw 2026.5.19 envia `X-Frame-Options` + CSP `frame-ancestors 'none'` hardcoded; patch in-process via `PostInstallPatch::OpenclawAllowIframe`"* ou *"Tauri no Windows não usa job objects, child processes viram órfãos; Paperclip postgres deixa shared memory block FATAL `pre-existing shared memory`"*.

Hoje esses achados:

1. Ficam capturados no auto-memory do Claude Code (`~/.claude/projects/{slug}/memory/`) — **invisíveis a Codex/OpenCode** no mesmo projeto.
2. Quando o AIOSON captura via `active-learning-loop`, vivem em SQLite (`project_learnings` + FTS5) — acessíveis via `aioson memory:search`, mas o harness teria que chamar a CLI a cada preflight para ler. Codex/OpenCode hoje não fazem essa chamada.
3. A `operator-memory` (DONE v1.16.0) cobre preferências do operador, não fatos técnicos sobre stack — esse é o gap deste PRD.

O usuário confirmou a dor explicitamente na sessão de descoberta (`@dev` em `aioson-play`, 2026-05-21): *"realmente está funcionando este aprendizado para quando é claude code, codex e opencode?"*.

## Users

- **Developer alternando harnesses**: usa Claude Code para arquitetura, Codex para refactor, OpenCode para sessões longas. Não quer repetir descoberta de gotchas a cada harness.
- **Time multi-dev compartilhando knowledge via git**: time-leader quer que onboarding em projeto novo herde gotchas descobertos por toda a equipe sem oral knowledge transfer.
- **AIOSON agents downstream** (`@dev`, `@sheldon`, `@analyst`): se beneficiam ao consultar `INDEX.md` curado durante preflight em vez de queries FTS5 em todas as features fechadas.

## MVP scope

### Must-have 🔴

- **M1. Capture directive estendido com sinais de project-knowledge.**
  Estender `template/agents/_shared/memory-capture-directive.md` (ou irmão `learning-capture-directive.md`) com 2 novos sinais a watch:
  - **`gotcha`**: comportamento que contradiz expectativa naive (ex.: *"filtrar por nome quebra; sempre filtrar por conteúdo"*; *"OpenClaw envia CSP hardcoded"*). Capture: naive-assumption, actual-behavior, why.
  - **`resolution`**: incident-resolution + fix-recipe consolidados — sintoma, root-cause, fix (sequência de comandos quando relevante).

  Quando detectado, o agent emite via comando existente do `learning` CLI (sem novo namespace).

- **M2. Materialização disk-first via hook em `feature:close`.**
  Estender o `runDistillation` (em `src/learning-loop-engine.js`) para, após o `runLearningAutoPromote` rodar, materializar TODAS as learnings ativas com `type ∈ {gotcha, recipe}` para arquivos `.aioson/learnings/{category}/{slug}.md`. Idempotente: se o arquivo já existe, atualiza apenas se `updated_at` da row é mais recente. Materialização é committed (default — ver Open question Q-CTPK-01 sobre opt-out per-projeto).

  Categorias V1 fixas (resolutas no briefing):
  - `gotchas/` — para learnings com `type='gotcha'`
  - `recipes/` — para learnings com `type='resolution'`

  Arquivo individual `.aioson/learnings/{category}/{slug}.md` formato:
  ```markdown
  ---
  learning_id: lng-{slug}-{ts}
  type: gotcha | resolution
  category: gotchas | recipes
  feature_slug: {originating-feature}
  confidence: high | medium | low
  created_at: {ISO-date}
  updated_at: {ISO-date}
  cited_files: [path1, path2]
  ---

  # {Title}

  {Evidence body — naive-assumption + actual-behavior + why, OU symptom + root-cause + fix}

  ## Cited files
  - {path1}
  - {path2}
  ```

- **M3. `INDEX.md` regenerator.**
  `.aioson/learnings/INDEX.md` é sempre regenerado quando M2 dispara. Uma linha por learning, ≤200 chars, formato:
  ```markdown
  # Project Learnings

  - [OpenClaw CSP iframe](gotchas/openclaw-csp-iframe.md) — OpenClaw 2026.5.19 envia `X-Frame-Options` + CSP `frame-ancestors 'none'` hardcoded. Patch in-process. Files: src-tauri/src/external_app_manager.rs
  - [Paperclip postgres orphan](recipes/paperclip-postgres-orphan-windows.md) — Tauri/Windows sem job objects → child processes órfãos. Cleanup via `Stop-Process`. Files: src-tauri/src/external_apps/paperclip.rs
  ```

  Ordenação: `category > updated_at DESC`. Não há paginação V1 (sanity threshold: alert se INDEX.md > 100 entries — flag para @architect decidir trim/paginate em V2).

- **M4. Diretiva universal de loading cross-harness.**
  Adicionar bloco padrão em:
  - `CLAUDE.md` (workspace + template/.aioson/agents/CLAUDE.md se aplicável)
  - `AGENTS.md` (já existe para Codex; template ships)
  - `OPENCODE.md` (já existe; template ships)

  Texto da diretiva (canonical, idêntico nos 3):
  ```markdown
  ## Project knowledge

  Read `.aioson/learnings/INDEX.md` if it exists. Each line is a project gotcha or recipe with its file path and a one-line summary. Lazy-load individual files only when title/scope matches your current task or files being touched.
  ```

  A diretiva é stateless (file-based) — qualquer harness conforme à convenção `AGENTS.md`/`OPENCODE.md`/`CLAUDE.md` ganha o benefício de graça.

- **M5. `learning:import-from-claude` one-shot.**
  Novo sub-comando: `aioson learning [path] --sub=import-from-claude [--project-hash=<hash>] [--dry-run]`. Lê `~/.claude/projects/{hash}/memory/MEMORY.md` + arquivos linkados, propõe seleção pro user (tier-2 notify per learning), promove os escolhidos via mesmo path do `runLearningAutoPromote`. Filtra entries que parecem ser operator-preferences (delegando para `operator-memory`).

  Fixtures de validação (mandatórias no QA):
  - `~/.claude/projects/C--dev-aioson-play/memory/openclaw_iframe_csp_patch.md`
  - `~/.claude/projects/C--dev-aioson-play/memory/external_apps_orphan_processes_windows.md`

  Estes 2 arquivos viram learnings tipo `gotcha` e `resolution` respectivamente.

- **M6. Inception mirror — template parity.**
  Toda mudança em `src/learning-loop-engine.js`, `src/learning-loop-doctor.js`, `template/agents/_shared/*directive*.md`, `template/CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` deve aterrissar **simultaneamente** no template e workspace (`sync:agents`). Test de paridade igual ao precedent de `active-learning-loop` Phase 6.

### Should-have 🟡

- **S1. Categorização auto-suggest no LLM-driven capture.**
  Capture directive ganha guidance específica: quando emitir `gotcha`, sugerir slug + 1-line summary; quando emitir `resolution`, capturar a sequência de comandos se houver. Reduz fricção pro dev review.

- **S2. `doctor` check para project-learnings stale.**
  Novo check `living-memory:learning_files_drift` — alert quando algum `.aioson/learnings/{category}/{slug}.md` tem `cited_files` que mudaram via git desde `updated_at`. Sinaliza candidatos para revisão manual (não auto-archive). Tier-1 silent telemetry; warning quando ≥3 drifted.

- **S3. `learning:export --to=stdout` para inspeção rápida.**
  Comando read-only que imprime `INDEX.md` + body de N learnings escolhidos por filtro. Útil para `aioson learning --sub=export | clip` em sessões fora-do-projeto.

## Out of scope

- **Cross-projeto / `~/.aioson/global/learnings/`** — escopo isolado por projeto. Aprendizado de projeto A não vaza para B. Feature futura separada, com tratamento de privacidade próprio. (Mesma decisão de `active-learning-loop` V1.)

- **Sync com `aioson.com`** — V2. `learning:export --to=aioson-com` reservado mas não implementado.

- **`learning:import-from-gemini`** — não há histórico relevante a importar (free users que vão sumir em 2026-06-18 provavelmente não acumularam knowledge significativo; enterprise users seguem usando Gemini de outras formas). Out-of-scope V1 (referenciado em `prd-gemini-phaseout.md`).

- **`learning:import-from-antigravity`** — Antigravity CLI (replacement do Gemini) ainda não é tool first-class AIOSON. Decisão deferida.

- **LLM-driven clustering / semantic embedding** — heurísticas determinísticas apenas. Compatível com `active-learning-loop` V1 (mesmo princípio).

- **Auto-archive de learnings stale baseado em mudança de arquivo citado** — S2 acima propõe surface humano-aprovado. Auto-archive sem human-in-the-loop fica para V2 (consistente com `active-learning-loop` archive-tier-2).

- **PII sanitization automática em capture** — V1 confia no operator (capture é semi-automática, dev revisa antes do feature:close). Sanitization mandatória vira Open Question pro @architect (Q-CTPK-03).

- **Promotion `learnings/ → docs/` automática** — não tentamos resolver o conflito gravitacional com `.aioson/docs/integrations/*.md` automaticamente. Convenção informal: `learnings/` é capture rápido (post-incident); `docs/` é curated long-form. Promotion manual via cópia + archive do learning original.

- **Per-file size cap > 5KB por learning** — V1 aceita até 5KB de evidence body. Learnings mais longos viram link para `docs/` ou são divididos.

- **Profile selection mecânica no INDEX.md** — V1 não tem profile-aware loading (todos os harnesses leem o mesmo INDEX). V2 pode segmentar (ex.: harness=codex omitir gotchas Windows-only se cwd não é Windows).

## Delivery plan

### Phase 1 — Landed foundation

1. Schema + capture directive — landed em Slice 1.
2. Materialização + `INDEX.md` — landed em Slice 2.

### Phase 2 — Cross-harness loading

1. Diretiva universal `## Project knowledge` em `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md` e templates correspondentes, sem tocar `.gemini/GEMINI.md`.

### Phase 3 — Import and inception parity

1. `aioson learning --sub=import-from-claude` com `--dry-run` e seleção explícita.
2. Paridade de setup/template com placeholders `.aioson/learnings/gotchas/.gitkeep` e `.aioson/learnings/recipes/.gitkeep`.

## User flows

### Captura durante uma sessão de dev

1. Dev abre sessão `@dev` em projeto AIOSON. Durante o trabalho, descobre que `Stop-Process` em Paperclip postgres não basta — precisa também limpar shared memory block.
2. Agent detecta o sinal (capture directive `resolution`): pergunta inline tier-1: *"Captured a project-knowledge learning: 'paperclip-postgres-orphan-windows'. Save? [Y/n]"*.
3. Dev confirma. CLI insere row em `project_learnings` com `type='resolution'`, `feature_slug={current-feature}`, `evidence={full markdown body}`, `confidence='medium'`.
4. **Nada é materializado ainda** — feature ainda está aberta.

### Fechamento de feature com materialização

1. Dev roda `aioson feature:close --slug={feature-slug} --verdict=PASS`.
2. `runDistillation` executa o pipeline já existente (`runLearningAutoPromote`, `evolution_log` entries, tier-2 notify).
3. **Novo (M2):** após o pipeline, itera sobre `project_learnings WHERE type IN ('gotcha', 'resolution') AND status='active'`. Para cada, escreve/atualiza `.aioson/learnings/{category}/{slug}.md`.
4. **Novo (M3):** regenera `.aioson/learnings/INDEX.md` com a lista atualizada.
5. Tier-2 notify aparece: *"learning-loop: 3 promotions; 2 project-knowledge learnings materialized to disk (1 gotcha, 1 recipe). INDEX.md atualizado."*

### Cross-harness handoff

1. Dev fecha sessão Claude Code, abre Codex no mesmo projeto.
2. Codex inicia: lê `AGENTS.md` por convenção, encontra a diretiva (M4), lê `.aioson/learnings/INDEX.md`.
3. Codex vê *"OpenClaw CSP iframe — patch in-process. Files: src-tauri/src/external_app_manager.rs"*. Task atual do dev toca esse arquivo.
4. Codex lazy-loads `gotchas/openclaw-csp-iframe.md`. Recebe o full body com naive-assumption + actual-behavior + why.
5. Codex aplica o patch sem precisar redescobrir o problema.

### Import inicial do auto-memory Claude Code

1. Dev em projeto novo (já adotou AIOSON; tem histórico do Claude Code).
2. Roda `aioson learning --sub=import-from-claude --dry-run`. CLI varre `~/.claude/projects/{hash}/memory/MEMORY.md`, lista candidatos com classificação heurística (gotcha vs resolution vs operator-preference vs unknown).
3. Output mostra 5 candidatos. Dev revisa, escolhe os 3 técnicos relevantes (ignora 2 operator-preferences).
4. Roda `aioson learning --sub=import-from-claude --select=1,3,5`. CLI promove os 3 (tier-2 notify por unit), materializa disk no próximo `feature:close` (ou via novo flag `--materialize-now` se justificado).

## Success metrics

- **Cross-harness propagation efetiva:** após 5 features com materialização ativa no próprio AIOSON (inception-mode), abrir uma sessão Codex em outro projeto AIOSON que importou learnings do Claude Code resulta em ≥1 lazy-load do `.aioson/learnings/{category}/{slug}.md` durante preflight (medido via instrumentação do Codex/AGENTS.md compliance test em greenfield tmpdir).

- **INDEX.md health:** `.aioson/learnings/INDEX.md` em projeto com 5+ features fechadas e ≥3 learnings materializados:
  - Cada linha ≤ 200 chars
  - Ordenação `category > updated_at DESC` correta
  - 0 broken links para arquivos `.aioson/learnings/{category}/{slug}.md`

- **Importação non-lossy:** `learning:import-from-claude` em fixture (`~/.claude/projects/C--dev-aioson-play/memory/`) com os 2 arquivos seed recupera ambos como learnings ativos (1 gotcha, 1 resolution) com `evidence` preservado byte-a-byte (modulo frontmatter delta).

- **Inception parity:** `aioson setup` em projeto greenfield expõe:
  - Diretiva universal em `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` (template parity)
  - 2 placeholders `.aioson/learnings/gotchas/.gitkeep` + `.aioson/learnings/recipes/.gitkeep`
  - CLI verb `learning --sub=import-from-claude` disponível
  Verificável por test fixture análogo ao `tests/inception-parity-active-learning-loop.test.js`.

- **Zero regressão sobre `active-learning-loop`:** após shipping, os 5 metrics existentes do `active-learning-loop` (distillation coverage 100%, memory:search retrieval ≥8/10, prompt-budget ≥10% reduction OR memory:search precision ≥0.8) seguem PASS.

## Acceptance criteria

| AC | Description |
|---|---|
| AC-CTPK-01 | Dado um devlog com `[gotcha]` ou `[resolution]`, o pipeline grava `type='quality'` + `kind` correto e mantém compatibilidade com learnings legadas. Verificável por teste `node:test`. |
| AC-CTPK-02 | Dado `feature:close` com learnings ativas, arquivos em `.aioson/learnings/{gotchas,recipes}/` e `INDEX.md` são gerados de forma idempotente. Verificável por teste e inspeção de paths. |
| AC-CTPK-03 | Dado um workspace/template AIOSON, `CLAUDE.md`, `AGENTS.md` e `OPENCODE.md` contêm a diretiva `## Project knowledge` idêntica; `.gemini/GEMINI.md` não recebe a diretiva. Verificável por comparação textual. |
| AC-CTPK-04 | Dado `aioson learning --sub=import-from-claude --dry-run`, candidatos do Claude memory são listados sem mutar SQLite ou disco. Verificável por fixture. |
| AC-CTPK-05 | Dado `aioson learning --sub=import-from-claude --select=...`, gotchas/resolutions técnicos são promovidos pelo path existente e operator-preferences são filtradas. Verificável por fixture. |
| AC-CTPK-06 | Dado `aioson setup` em projeto novo, placeholders de learnings e diretivas cross-harness aparecem em paridade com o template. Verificável por teste inception. |

## Open questions

**Para `@analyst` decidir no requirements/spec pass:**

- **Q-CTPK-01 — Schema migration para 2 novos types em `project_learnings`.**
  `type` atual constraint é `CHECK (type IN ('preference', 'process', 'domain', 'quality'))`. M1 propõe adicionar `'gotcha'` e `'resolution'`. SQLite não suporta ALTER TABLE CHECK constraint — requer recreate (CREATE NEW + INSERT FROM OLD + DROP OLD + RENAME). Alternativa: reusar `type='domain'` + nova coluna `kind TEXT` para discriminar. Trade-off de complexidade de migration vs clareza semântica. **Recomendação inline @product:** schema migration (CHECK update) — fica mais limpo, e o `active-learning-loop` migration runner já tem patrón idempotente.

- **Q-CTPK-02 — Trigger exato da materialização: `feature:close` only OR também on-capture?**
  M2 propõe materialização **só em `feature:close`**, evitando ruído (capture é semi-automática, dev pode mudar de ideia, INDEX.md ficar oscilando). Alternativa: materializar imediatamente após capture confirmation, com auto-rollback no `feature:close` se learning for archived. **Recomendação inline @product:** só em `feature:close` (V1 mais simples; uso real decide se precisa imediatismo em V2).

- **Q-CTPK-03 — Sanitization de PII.**
  Briefing R3 levanta: emails, paths sensíveis, IPs em evidence body. Storage default committed (decisão D4) amplifica. Opções:
  - (a) Trust user (V1) — dev revisa antes do feature:close.
  - (b) Sanitize-on-promote — regex pre-promote em `runLearningAutoPromote` (emails, IPs, paths com user-home).
  - (c) Prompt explícito em audit 1-liner — *"esta captura contém info sensível? [y/N]"*.

  **Recomendação inline @product:** (a) trust user V1, com mention forte em capture directive (*"esta captura será committed; revise antes de aceitar"*). (b)/(c) viram V2 se telemetria mostrar problema real.

**Para `@architect` (ou `@sheldon` no enrichment) decidir:**

- **Q-CTPK-04 — `INDEX.md` size cap e paginação.**
  V1 sanity threshold ~100 entries. Acima disso: trim (mais recentes 100), paginate (`INDEX.md` + `INDEX-001.md`...), ou prune via archive baseado em frequency? Decision-required.

- **Q-CTPK-05 — Profile-aware loading no INDEX.md.**
  V1 lê o INDEX inteiro. Para projetos Windows-only, ler gotchas Linux-only é waste. V2 pode segmentar via frontmatter tag (`platform: windows|linux|macos|all`) + filtragem no harness directive. Decisão V1: ignorar (out-of-scope acima); V2: necessário se INDEX cresce.

- **Q-CTPK-06 — Lock concorrência em materialização batch.**
  `feature:close` ativos em paralelo (squad multi-feature) — duas writes do `INDEX.md` colidem. Reusar pattern do `runDistillation` (BEGIN IMMEDIATE + INSERT WHERE NOT EXISTS pra lock entry no `evolution_log`), ou file-level flock? Decision-required.

**Pesquisa recomendada (`@sheldon` ou `@orache` no enrichment):**

- **Q-CTPK-07 — Padrões cross-session/cross-tool em harnesses concorrentes.**
  Como Cursor 3, Aider 2026, Windsurf, Hermes (sucessor do Claude Code), Codex memory, Cody context gerenciam project knowledge cross-session? Existe convergência? Research-able < 4h. Output: validar `INDEX.md` lazy-load pattern vs alternativas. Cached research relevante: `researchs/agent-memory-backends-2026/summary.md` (backend stack) — não cobre o eixo cross-tool.

**Cross-PRD coordenação:**

- **Q-CTPK-08 — Acoplamento com `prd-gemini-phaseout.md`.**
  Existe um `template/.gemini/GEMINI.md` que poderia receber a diretiva universal (M4) por consistência. Mas com Gemini phase-out v1.18, isso vira código morto rapidamente. Decisão V1: **não** adicionar diretiva em `template/.gemini/GEMINI.md` (consistente com o phase-out timeline).
