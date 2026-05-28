---
briefing_source: cross-tool-project-knowledge
classification: SMALL
source: briefings/cross-tool-project-knowledge/briefings.md
generated_at: 2026-05-23
deadline_hard: 2026-06-18
---

# PRD — Gemini CLI Phase-out

## Vision

Remover Gemini como tool first-class do AIOSON de forma faseada e clara, antes que o cutoff do Google (2026-06-18) transforme falhas silenciosas dos free users em fricção atribuída ao framework. Três janelas: **v1.17 emite warning**, **v1.18 (pós-cutoff) executa hard removal**, **v1.20 sunset do frozen tier**. Enterprise users protegidos durante toda a transição.

## Problem

Google anunciou em 2026-05-20 (`developers.googleblog.com`) que o Gemini CLI free/personal tier (Google AI Pro/Ultra) será descontinuado em **2026-06-18** — janela de ~4 semanas a partir de hoje (2026-05-23). Enterprise (Code Assist Standard/Enterprise + Google Cloud) continua operando.

AIOSON declara suporte `compatible via AGENTS.md` em todas as features que tocam harness (instalação, permissions, operator-memory matriz V1, doctor). Concretamente, há **46 arquivos** com referência a Gemini em `src/` + `template/` (verificado via `grep -ril gemini src/ template/`). Após 2026-06-18:

1. **Free/personal users tentando usar Gemini via AIOSON verão falhas** — a CLI Gemini retornará 401/403 ou similar. Como o AIOSON listou Gemini como suportado, o usuário tenderá a atribuir a falha ao framework.
2. **`install-wizard` continuará oferecendo Gemini como opção viável** — onboarding desfigurado, primeira impressão ruim para newcomers.
3. **`doctor` reportará configuração Gemini como saudável** quando na prática é fonte garantida de falha futura para o segmento free.
4. **Replacement oficial Google é Antigravity CLI** (Go, closed-source, multi-agent background) — não é drop-in. Investigação separada (out-of-scope deste PRD).

## Users

- **AIOSON user com Gemini free/personal tier (Google AI Pro/Ultra)** — segmento que vai perder acesso. Precisa de warning antes do cutoff e fallback claro para Codex/OpenCode.
- **AIOSON user com Gemini enterprise (Code Assist Standard/Enterprise + Google Cloud)** — segmento que continua funcionando. Precisa que o AIOSON NÃO apague seu `.gemini/permissions.toml` pré-existente nem force migração.
- **AIOSON maintainers** — precisam reduzir surface de manutenção (46 arquivos referenciando Gemini → reduzido drasticamente em v1.18) sem quebrar enterprise.

## MVP scope

### Must-have 🔴

- **M1. v1.17 — deprecation warnings.**
  Três entry-points emitem warning quando Gemini é mencionado ou detectado:

  - **`install-wizard`** (`src/install-wizard.js`): ao listar Gemini como tool option, prefixo `[DEPRECATED] Gemini CLI — free tier ends 2026-06-18`. Não bloqueia seleção. Após seleção, mensagem em verbose: `"Gemini CLI free/personal tier will be discontinued on 2026-06-18. Consider Codex or OpenCode for new projects. Enterprise (Code Assist Standard/Enterprise) continues to work."`

  - **`doctor`** (`src/doctor.js`): novo check `harness:gemini_deprecation` — quando detecta `.gemini/permissions.toml` ou `.gemini/GEMINI.md` no projeto, emite `severity='warning'` com `key='harness_gemini_deprecation'`. Mensagem: `"Project uses Gemini CLI. Free tier discontinued 2026-06-18. Enterprise users unaffected. Run 'aioson permissions-generator --tool=codex' to migrate."`. **Não emite em projeto sem `.gemini/`** (zero false positives).

  - **`permissions-generator`** (`src/agents.js` ou módulo equivalente que materializa allow-lists): ao gerar `.gemini/permissions.toml`, **continua gerando** (não quebra enterprise), mas escreve uma linha de comentário no topo:
    ```toml
    # WARNING: Gemini CLI free tier ends 2026-06-18. This file remains
    # functional for enterprise users (Code Assist Standard/Enterprise).
    # See AIOSON CHANGELOG v1.17.x for migration guidance.
    ```

- **M2. v1.17 — operator-memory matriz V1 update.**
  A feature `operator-memory` (DONE v1.16.0) declara `gemini-cli` na matriz `compatible_via=[claude-code, codex, opencode, gemini-cli]`. Atualizar para `compatible_via=[claude-code, codex, opencode, gemini-cli (deprecated until 2026-06-18, removed in v1.18)]`. Edição é em string literal — não muda comportamento da feature, apenas semantics.

- **M3. v1.17 — CHANGELOG entry.**
  `CHANGELOG.md` ganha bloco `## [1.17.x] - 2026-05-XX`:
  ```markdown
  ## Gemini CLI Deprecation Warning

  Google announced (2026-05-20) that Gemini CLI free/personal tier ends 2026-06-18.

  - install-wizard now warns when Gemini is selected.
  - doctor reports `harness:gemini_deprecation` when .gemini/ is detected.
  - permissions-generator continues to emit .gemini/permissions.toml with a header warning.
  - Enterprise users (Code Assist Standard/Enterprise) are unaffected.
  - Hard removal scheduled for v1.18 (post 2026-06-18). .gemini/permissions.toml pre-existing in projects will be preserved.
  - Recommended migration: --tool=codex or --tool=opencode.
  ```

- **M4. v1.17 — release window guarantee.**
  v1.17 deve ser publicada na npm registry **antes de 2026-06-18** (ideal: 2026-06-10 para dar ≥1 semana de cushion). Esta é a janela tática crítica — atraso = free users veem falha sem warning prévio.

- **M5. v1.18 — hard removal mecânica.**
  Pós 2026-06-18 (ideal: 2026-06-19 ou 2026-06-20):

  - **Remover `template/.gemini/GEMINI.md`** do template ship.
  - **Remover Gemini de `install-wizard`** como opção. Quem escolhe `--tool=gemini` via CLI flag recebe erro `Gemini CLI is no longer supported as of v1.18 (free tier ended 2026-06-18). Use --tool=codex or --tool=opencode.` Não há fallback automático.
  - **Remover Gemini de `permissions-generator`** — NÃO emite mais `.gemini/permissions.toml` em novos `setup`/`install`.
  - **Preservar `.gemini/permissions.toml` pré-existente** no projeto. Sem touch, sem delete. Enterprise users mantêm o que tinham; setup re-run não toca o arquivo.
  - **`doctor` muda o check** de `harness:gemini_deprecation` (warning) para `harness:gemini_legacy_detected` (info-tier; `severity='info'` ou `ok=true` com mensagem informativa). Não polui doctor com warning quando o projeto está em estado válido enterprise.
  - **Remove Gemini de `aioson-models.json`** (template).
  - **Remove Gemini do `setup` interactive flow** (sem listar nem oferecer).

- **M6. v1.20 — sunset do frozen tier (estimado Q4-2026).**
  v1.20 (~6 meses pós v1.18) marca o sunset final:

  - **`doctor` para de reconhecer `.gemini/`** — sem novo check; sem mention.
  - **Stale code cleanup** em `src/agents.js`, `src/constants.js`, `src/i18n/messages/*.js`, agent manifests, e demais módulos: remove strings/keys/dispatches relacionados a Gemini que sobraram em v1.18.
  - **`.gemini/permissions.toml` pré-existente** em projetos continua INTOCADO (mesmo princípio de v1.18: AIOSON não apaga config do usuário).

  **Justificativa do 6-meses runway:** dá tempo para enterprise users que ainda usam o `.gemini/permissions.toml` migrarem ou aceitarem que o AIOSON não vai mais surfaceá-lo. Após v1.20, o `.gemini/` no projeto é estranho — o framework ignora; existing tooling do Google que lê o arquivo (Code Assist Standard/Enterprise) continua funcionando independentemente do AIOSON.

### Should-have 🟡

- **S1. Communication out-of-band.**
  CHANGELOG não é suficiente. Sugestões (não bloqueantes):
  - Blog/release notes destacado na release page do v1.17 (`tutorials/releases/1-17-0/` se padrão for mantido).
  - Banner opcional no `aioson info` quando `--locale=en` e Gemini detected.
  - Discord/community announcement coincidente com v1.17 publish.

- **S2. Migration helper (one-shot CLI).**
  `aioson harness:migrate --from=gemini --to=codex|opencode [--dry-run]`. Para projeto com `.gemini/permissions.toml` existente: gera `.codex/` ou `.opencode/` equivalente (mesma tier-map mecânica do permissions-generator), preserva `.gemini/` intocado, emite report. Não automaticamente apaga `.gemini/`. Tier-2 notify pré-mutação.

- **S3. Antigravity CLI research.**
  Plan separado pós-v1.18 — investigação de capability matrix, permission model, AGENTS.md compat. Output: recomendação para tratamento como tool first-class V1 (aceitar) ou descartar. Não bloqueia v1.17/v1.18.

## Out of scope

- **Antigravity CLI como tool first-class no v1.17 ou v1.18** — research separada (S3). Recomendar Antigravity no warning sem prova de capacidade é risco reputacional.

- **Auto-conversão `.gemini/permissions.toml` → `.codex/`** em v1.18 sem opt-in explícito do user — preserva enterprise sem invadir.

- **Detecção de tier (free vs enterprise) pelo AIOSON** — heurística fraca. Não tentamos discriminar; warning aplica-se a todos os usuários, e a mensagem deixa explícito que enterprise não é afetado.

- **Notification proativa pro user** (email, push, etc.) — fora do escopo do CLI.

- **Backport para v1.16.x** — só v1.17+ recebem o warning. Quem está em v1.15/v1.16 e não atualiza vê o cutoff sem aviso (mesma situação de qualquer upstream deprecation).

- **`learning:import-from-gemini`** — referenciado no `prd-cross-tool-project-knowledge.md` como out-of-scope. Free users não acumularam histórico relevante; enterprise users seguem usando Gemini de outras formas.

## User flows

### Free user em v1.17 com warning ativo

1. Dev roda `aioson setup .` em projeto novo. Wizard oferece tool selection.
2. Output destaca `[DEPRECATED] Gemini CLI` ao lado da opção. Dev seleciona Gemini mesmo assim (ainda funciona até 2026-06-18).
3. Pós-seleção, mensagem detalha: *"Gemini CLI free/personal tier will be discontinued on 2026-06-18. Consider Codex or OpenCode for new projects."*
4. `permissions-generator` materializa `.gemini/permissions.toml` com warning no header.
5. Dev faz commit. CHANGELOG documenta a janela.

### Enterprise user em v1.17/v1.18

1. Enterprise user tem projeto com `.gemini/permissions.toml` pré-existente (Code Assist Enterprise).
2. v1.17: `doctor` emite `harness:gemini_deprecation` warning. Mensagem diz explicitamente: *"Enterprise users unaffected"*. User ignora.
3. v1.18: `doctor` emite `harness:gemini_legacy_detected` info (sem warning). `setup` re-run não toca o `.gemini/`. CLI continua funcionando para enterprise.
4. v1.20: sunset; `doctor` para de mencionar. `.gemini/permissions.toml` ainda intacto, Code Assist Enterprise ainda funcional (independente do AIOSON).

### Migration via S2 helper (opcional)

1. Dev decide migrar de Gemini → Codex pré-cutoff.
2. Roda `aioson harness:migrate --from=gemini --to=codex --dry-run`. Output: lista de arquivos que serão criados (`.codex/`), nenhum delete.
3. Aprova: `aioson harness:migrate --from=gemini --to=codex`. Tier-2 notify, materializa `.codex/`, deixa `.gemini/` intocado.
4. Dev decide quando (ou se) apaga `.gemini/` — fora do escopo do helper.

### Pós-cutoff sem migração (free user que ignorou warnings)

1. 2026-06-19 — dev tenta usar Gemini CLI; recebe 401/403 do Google.
2. Roda `aioson doctor`. Output: `harness:gemini_legacy_detected (info)` — *"Gemini CLI free tier ended 2026-06-18. Migrate with 'aioson harness:migrate --from=gemini --to=codex' or remove .gemini/ manually."*
3. Dev migra ou remove. AIOSON não force-degraded; user decide.

## Success metrics

- **v1.17 ship gate:** v1.17 publicada na npm registry com tag `gemini-deprecation-v1.17.0` antes de **2026-06-10** (cushion ≥ 8 dias antes do cutoff).
- **Zero false positives em doctor:** `harness:gemini_deprecation` (v1.17) e `harness:gemini_legacy_detected` (v1.18) só emitem quando `.gemini/permissions.toml` OR `.gemini/GEMINI.md` existem no projeto. Em projeto greenfield sem `.gemini/`, zero output. Verificável via test fixture com 2 tmpdirs (com vs sem `.gemini/`).
- **Backward compat respeitada:** v1.18 publicada, `setup` re-run em projeto com `.gemini/permissions.toml` pré-existente: **zero modificações no arquivo** (`stat -c %Y` antes e depois match exato). Verificável via test fixture.
- **install-wizard menos Gemini-pushy:** v1.18 wizard interactive não oferece Gemini como opção; `--tool=gemini` flag retorna erro non-zero com mensagem específica. Verificável via test snapshot.
- **Surface reduction:** v1.18 reduz `grep -ril gemini src/ template/` de **46 arquivos** para **≤10 arquivos** (apenas references em CHANGELOG, docs históricas, comments de legacy preservation). v1.20 reduz para **≤5 arquivos**.
- **Inception parity:** v1.18 `aioson setup .` em greenfield tmpdir:
  - NÃO cria `.gemini/`
  - install-wizard interactive não lista Gemini
  - `permissions-generator --tool=gemini` retorna erro non-zero
  Verificável via test fixture `tests/gemini-removal-inception.test.js`.

## Open questions

**Para `@analyst`/`@architect` decidir:**

- **Q-GP-01 — Datas de release exatas.**
  - v1.17 hard deadline: ≤2026-06-10 (ship gate)
  - v1.18 hard floor: ≥2026-06-19
  - v1.20 estimado: Q4-2026 — decisão final fica com release manager.

- **Q-GP-02 — Texto exato dos warnings — i18n coverage.**
  AIOSON tem 4 locales (`en, pt-BR, es, fr`). Textos das warnings em M1 + M5 precisam tradução. Decisão V1: `@dev` produz os textos em 4 locales no implementation pass; senão revert para EN-only com `[en]` prefix.

- **Q-GP-03 — Snake-case do check `harness:gemini_deprecation`.**
  Convention check em outros checks doctor: `living-memory:rule_staleness`, `living-memory:learning_orphans`. Confirm pattern: `harness:gemini_deprecation` (v1.17), `harness:gemini_legacy_detected` (v1.18+). Decision-required mas baixa stakes.

- **Q-GP-04 — `aioson harness:migrate` S2 — Bundle em v1.17 ou v1.18?**
  Razão para v1.17: dá ao user tempo de migrar pré-cutoff. Razão contra: scope-creep no release tático. **Recomendação inline @product:** S2 em v1.18 ou v1.19 (não bloquear v1.17).

**Cross-PRD coordenação:**

- **Q-GP-05 — Acoplamento com `prd-cross-tool-project-knowledge.md`.**
  Aquele PRD propõe diretiva universal em `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` (M4 do outro). NÃO adicionar diretiva em `template/.gemini/GEMINI.md` (consistente com este phase-out timeline). Já declarado no outro PRD (Q-CTPK-08).

**Risco residual:**

- **Q-GP-06 — Comportamento de free users que upgrade após 2026-06-18 (v1.17→v1.18 jump).**
  Free user em v1.17 viu warning. Não migrou. Atualiza para v1.18 em 2026-06-19. `setup` re-run com `--tool=gemini` retorna erro. `doctor` reporta `gemini_legacy_detected`. Existing `.gemini/permissions.toml` intacto — mas Gemini CLI já não funciona. Output do doctor deve trazer instrução clara de migração (texto final).
