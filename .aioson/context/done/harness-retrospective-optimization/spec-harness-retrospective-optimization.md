---
gate_execution: approved
feature: harness-retrospective-optimization
status: in_progress
started: 2026-06-10
classification: SMALL
phase_gates:
  requirements: approved
  design: approved
  plan: pending
  execution: pending
gate_requirements: approved
gate_design: approved
gate_plan: approved
---

# Spec — Harness Retrospective Optimization (RHO-lite)

## What was built

**Tema 1 — `aioson harness:retro` (deterministic miner + dossier):**
- `src/lib/retro/retro-sources.js` — one best-effort reader per source (QA reports active+`done/`, corrections active+`done/{slug}/plans/`, dossier Agent Trail for FAIL→PASS cycles+verdicts, `execution_events` readonly filtered by `payload.slug` (D7), `attempts/`, `progress.json.failure_signatures`, `aioson-logs/` devlogs). Exports `collectSources`, `resolvePassDate` (D2), `resolveFeatureExists`, `enumerateClosedFeatures` (D6).
- `src/lib/retro/retro-aggregate.js` — deterministic grouping key (`{slug}[::phase]::{finding_id|sig|titlehash}`, slug always included), REQ-2 promotion (≥2 occ OR ≥1 high/critical OR ≥2 FAIL→PASS cycles; unknown severity never triggers criterion b), severity→date→path ordering, per-candidate cost by counts (D3 corrections_bytes, tokens only when `token_count` non-null).
- `src/lib/retro/retro-render.js` — Markdown dossier, frontmatter §3.1 + 4 fixed sections always present, byte-stable except `generated_at` (AC-4).
- `src/commands/harness-retro.js` — flags `--feature`/`--last`/`--json`, slug sanitization REQ-8 (fail-closed exit 12 before any FS touch), window enumeration + ranking, writes `.aioson/context/retro/{slug}.md` or `window-last-{N}.md`.
- Wired in `src/cli.js` (KNOWN_COMMANDS + JSON_SUPPORTED_COMMANDS + dispatch + help) — exit code via `result.exitCode` propagated by cli.js:1649 in `--json` and by `process.exitCode` in text mode (D4, closes exit-code-collapsed class).
- i18n `cli.harnessRetro.*` + `cli.help_harness_retro` in en/pt-BR/es/fr (under the `cli:` object — the `cli.` prefix gotcha).
- Prompts/rules parity: `sheldon.md` "Retro dossier analysis" mode (AC-11), `aioson-context-boundary.md` lists `retro/{slug}.md` (AC-16), `project-map.md` registers `retro/`. All template-first + mirrored to workspace.

**Tema 2 — preview helper (should-have):**
- `src/harness/preview-artifact.js` — `previewArtifact(content, {maxBytes=8192, artifactPath, label, persist})` (§3.3): persist-first, UTF-8-safe cut, best-effort write, `persist:false` read-mode.
- `src/commands/harness-preview.js` — read-only `aioson harness:preview <file>` wrapper, wired in cli.js + i18n `cli.harnessPreview.*`.
- Adoption at `self-implement-loop.js` criteria-fail feedback (AC-13): preview + pointer to the already-persisted `attempts/{n}/checks/{id}.log` instead of a full dump.
- `qa.md`/`tester.md` instruct redirecting test logs to a file and consuming via `harness:preview` (AC-14, template+workspace parity).

Tests: `tests/harness-retro.test.js` (18) + `tests/preview-artifact.test.js` (9). Full suite green: 3131/3132 pass, 1 skipped, 0 fail.

## Entities added

- **Dossiê retrospectivo** `.aioson/context/retro/{slug}.md` (ou `window-last-{N}.md`) — frontmatter com `features_mined`, contagens por fonte, `candidates`/`observations`; seções fixas: Propostas candidatas, Observações, Trilha minerada, Próximo passo. Ver requirements §3.1.
- **Registro de finding normalizado** (estrutura interna do miner, não persistida) — source_type, feature_slug, finding_id, severity (normalizada, `unknown` nunca promove), title, file_ref, date, status, source_path, signature. Ver requirements §3.2.
- **`previewArtifact`** `src/harness/preview-artifact.js` (Tema 2) — `(content, {maxBytes=8192, artifactPath, label}) → {preview, truncated, fullPath, totalBytes}`; persist-first, best-effort, corte UTF-8 seguro. Ver requirements §3.3.

## Key decisions

- [2026-06-10] Agrupamento do dossiê por chave determinística exata (assinatura sha1, severidade High/Critical, ciclos FAIL→PASS), nunca por classe semântica — classificação semântica é do @sheldon, mantendo a CLI 100% determinística (resolve OQ-1 do PRD).
- [2026-06-10] Custo de retrabalho por contagens, com tokens apenas quando disponíveis — `execution_events.token_count` está NULL em 100% das 987 linhas atuais; estimar tokens hoje seria invenção (resolve OQ-4 de custo do PRD).
- [2026-06-10] Threshold de preview default 8KB confirmado com medição local: test log completo = 247.526 bytes (30x o threshold); artefatos manuais avg 5–17KB (resolve OQ de calibração do PRD).
- [2026-06-10] Miner deve ler locais ativos E arquivados (`done/{slug}/`, `done/{slug}/plans/`) — feature:close move artefatos e a janela `--last=N` é composta majoritariamente de features arquivadas.
- [2026-06-10] Três classes de erro recorrentes do inventário OQ-3 viram requisitos diretos: exit-code preservado em `--json` (REQ não colapsar p/ 1), sanitização fail-closed de slug, verificação de wiring do comando no dispatch/help.
- [2026-06-10 · @dev] O Agent Trail do dossiê é fonte de **verdicts/ciclos FAIL→PASS (D5), não de findings**. Extrair findings do resumo @qa do trail duplicaria o que já vem do corrections plan / QA report (fonte autoritativa) e gerava assimetria de regex (C-02 promovido, C-03 não, por ordem no texto). Decisão: trail só emite ciclos+verdict; findings vêm de qa_report + corrections + progress signatures + attempts. Resultado do piloto fica idêntico ao exemplo-líder do AC-1 (C-01 candidato; C-02/C-03/O-01..O-04 observações).
- [2026-06-10 · @dev] Exit code D4 implementado pelo padrão JSON_SUPPORTED_COMMANDS: comando devolve `{ exitCode }` em ambos os modos; cli.js:1649 propaga em `--json` e o comando seta `process.exitCode` no modo texto (convenção git-guard; testes resetam). Teste binário confirma exit 12 preservado em `--json`.
- [2026-06-10 · @dev] `previewArtifact` ganhou opção `persist` (extensão compatível ao contrato §3.3): `persist:false` permite `harness:preview` referenciar um arquivo já persistido sem reescrevê-lo (modo leitura real).
- [2026-06-10 · @pentester→@dev] Hardening de segurança (security-findings-harness-retrospective-optimization.json, ambos low/info, não-bloqueantes; veredicto QA final é do @qa):
  - **SF-01 (memory_context / LLM01.2):** `retro-render.js` ganhou `neutralizeText()` — remove controles/newline/bidi/zero-width do texto livre minerado e o aplica ao `title` da observação (único texto livre renderizado verbatim no dossiê). Título forjado não injeta mais estrutura Markdown (header/fence/bloco de instrução) no contexto do @sheldon. Determinístico e byte-estável (identidade sobre texto limpo). Testes de regressão adicionados.
  - **SF-02 (tool_invocation):** resolução de dossier em `retro-sources.js` usa `fs.lstatSync()` (não segue symlink), consistente com os readers Dirent. Contenção do `harness:preview` mantida irrestrita **por design** (preview de logs de teste fora do cwd; sem cruzar fronteira de confiança) — decisão documentada inline.
  - **SF-03 (secret_handling, owner=qa):** permanece `open` para decisão do @qa; `execution_events.payload_json` já é excluído do render (controle positivo).

## Edge cases handled

[From requirements §9 — 12 casos: DB ausente/lockado, QA report livre, idiomas/casing mistos, QA multi-phase, finding-ID entre features, slug inexistente/traversal, retro/ on-demand, sobrescrita idempotente, trail corrompido, previewArtifact defensivo, window sem data de PASS, corte do Tema 2 sem afetar Tema 1]

## Dependencies

- Reads: QA reports (ativos + `done/`), corrections plans (`.aioson/plans/{slug}/` + `done/{slug}/plans/`), dossiers (`features/{slug}/dossier.md`), `aios.sqlite` execution_events (readonly), `attempts/{n}/` (estrutura de `src/harness/attempt-artifacts.js`), `progress.json` failure_signatures, `aioson-logs/` devlogs.
- Writes: `.aioson/context/retro/` (única escrita do harness:retro); `src/harness/preview-artifact.js` + adoção em `self-implement-loop.js` (Tema 2); template+workspace: `sheldon.md`, `qa.md`, `tester.md`, `aioson-context-boundary.md`; i18n 4 locales (prefixo `cli.`).

## Notes

- Baseline de testes desta sessão: 3104/3105 pass, 1 skipped, 0 fail (132s). AC-15 exige manter verde.
- `attempts/` e devlogs estão vazios HOJE — fixtures de teste precisam criar essas fontes sinteticamente; o piloto real (loop-guardrails) cobre QA report via dossier trail + corrections plan (não existe `qa-report-loop-guardrails.md`; o verdict vive no Agent Trail do dossiê e no spec QA Sign-off).
- Gotcha i18n conhecido: chaves CLI precisam do prefixo `cli.` ou `t()` loga a chave crua em todos os locales.
- Paridade inception: agentes/regras nascem em `template/`, sync via `npm run sync:agents`.

## QA sign-off
- Date: 2026-06-10
- **Verdict:** PASS
- AC coverage: 16/16 fully covered (AC-1..AC-16 verified — tests + real-CLI runs)
- Findings: 0 Critical, 0 High, 0 Medium, 2 Low (cost attribution per-feature vs per-candidate; combined `--feature+--last` output filename does not encode the anchor slug) — both documented as residual risks, non-blocking
- Suite: 3134/3135 pass, 1 skipped (pre-existing), 0 fail
- Residual risks:
  - Per-candidate cost fields (`corrections_bytes`, `execution_events`, `tokens`) report feature-level totals attributed to each candidate — when a feature yields multiple candidates the numbers repeat. Documented as a counts-based proxy (REQ-4); @sheldon should read them as feature-level signal, not per-candidate.
  - Combined `--feature=X --last=N` writes `window-last-{N}.md` (anchor slug not encoded) — two different anchors with the same N overwrite the same dossier. Idempotency is per (mode, N), as designed.
  - Security surface is narrow and fail-closed: slug → path-traversal is sanitized before any FS touch (REQ-8, AC-8); `aios.sqlite` opened readonly; `harness:preview` is operator-local read-only with no trust boundary crossed.

## Security re-verification (@pentester → @dev → @qa, 2026-06-10)
- Source: `security-findings-harness-retrospective-optimization.json` (framework_target, local_static). 8 surfaces mapped; 0 high, 0 medium, 1 low, 2 info — all non-blocking.
- **SF-01 (memory_context / LLM01.2) — FIXED & confirmed:** mined free-text (observation `title`) now passes through `neutralizeText()` in `retro-render.js`, stripping control/newline/bidi/zero-width so a forged title cannot inject Markdown structure into the `@sheldon` dossier context. Byte-stable on clean text; regression tests added.
- **SF-02 (tool_invocation) — FIXED & confirmed:** dossier resolution uses `fs.lstatSync()` (symlinks ignored, consistent with the Dirent readers). `harness:preview` unrestricted operator-local read accepted as documented design (no trust boundary crossed).
- **SF-03 (secret_handling, info) — ACCEPTED RISK:** `execution_events.payload_json` (highest-risk source) is already excluded from render; residual is inherent duplication of existing artifact data. Mitigation: ensure `.aioson/context/retro/` is covered by the project secret-scanning posture. No code change required.
- Gate D unaffected: no Critical/High; full suite 3136 pass / 1 skip / 0 fail.

## QA Sign-off

- **Date:** 2026-06-10
- **Verdict:** PASS
- **Residual:** SF-03 secret_handling (info) aceito;
- **Gate D (execution):** approved
