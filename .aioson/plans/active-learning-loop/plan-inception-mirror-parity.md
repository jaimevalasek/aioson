---
phase: 6
slug: inception-mirror-parity
manifest: .aioson/plans/active-learning-loop/manifest.md
depends_on: [telemetry-foundation, memory-search-fts5, memory-archive-with-evolution-log, doctor-curation-checks, feature-close-distillation-hook]
status: done
completed_at: 2026-05-14
completed_by: dev
---

# Phase 6 — Inception Mirror & Parity

## Scope

Validar que active-learning-loop funciona **identicamente no próprio repo AIOSON E em qualquer projeto greenfield setupado via `aioson setup .`**. Sem esta phase, M6 do PRD é aspiracional — qualquer drift entre `src/` e `template/` quebra silenciosamente projetos cliente.

Inclui também o **success-metric fixture**: simulação de 5 features no próprio AIOSON, asserting que doctor retorna `curation_candidates: []` (PRD § Success metrics, "Inception self-test").

## New or modified entities

- **`tests/active-learning-loop-inception.test.js`** (NOVO):
  - Setup: tmpdir AIOSON workspace, popula `aios.sqlite` com 5 features fictícias + telemetria
  - Run: `aioson feature:close` × 5 + `aioson doctor --json`
  - Assert: `doctor.checks` não tem `living-memory:rule_staleness | learning_orphans | distillation_lag` com `ok=false`
- **`tests/inception-parity-active-learning-loop.test.js`** (NOVO):
  - Setup: tmpdir greenfield (não AIOSON repo)
  - Run: `aioson setup .` em tmpdir, depois `aioson --help` + `aioson doctor`
  - Assert: comandos `memory:search`, `memory:archive`, `memory:restore` listados; 3 doctor checks novos presentes; `template/.aioson/config/learning-loop.json` copiado
- **Extensão de `src/commands/sync-agents-preflight.js`**:
  - Verifica paridade de:
    - `template/src/commands/memory-{search,archive,restore}.js` vs `src/commands/`
    - `template/src/learning-loop-engine.js` vs `src/`
    - `template/.aioson/config/learning-loop.json` (existência + schema)
    - `template/.aioson/agents/*.md` mencionando novos comandos (se aplicável)
  - Pattern: extender `checkParity()` existente (Internal sweep §6)
- **Documentação i18n**:
  - `docs/pt/active-learning-loop/`, `docs/en/active-learning-loop/`, `docs/es/`, `docs/fr/` com READMEs explicando o loop (precedent: `docs/pt/living-memory/`)

## User flows covered

PRD § Success metrics — Inception self-test + Inception parity (verificáveis via fixtures).

## Acceptance criteria

- **AC-ALL-601** (binary): `tests/active-learning-loop-inception.test.js` simula 5 `feature:close` em tmpdir; `aioson doctor --json` retorna **zero** entries em `checks` com `ok=false` e `id` matching `living-memory:rule_staleness | learning_orphans | distillation_lag`.
- **AC-ALL-602** (binary): `tests/inception-parity-active-learning-loop.test.js` roda `aioson setup .` em greenfield tmpdir; verifica:
  - `node bin/aioson.js --help` lista `memory:search`, `memory:archive`, `memory:restore`
  - `node bin/aioson.js doctor --json` lista 3 novos checks em `checks[].id`
  - `.aioson/config/learning-loop.json` existe e parses como JSON válido
- **AC-ALL-603** (binary): `npm run sync:agents:preflight` detecta drift se qualquer arquivo de Phase 1-5 estiver presente em `src/` mas ausente em `template/src/` (ou vice-versa).
- **AC-ALL-604** (binary): Documentação em 4 idiomas (pt, en, es, fr) inclui README explicando o loop, exemplo de uso de `memory:search` e `memory:archive`, e link para o PRD.
- **AC-ALL-605** (binary): Wiring audit per brain `sheldon-006`:
  - `src/cli.js` registra os 3 novos comandos AND `template/src/cli.js` idem
  - `src/commands/feature-close.js` invoca learning-loop-engine
  - `src/doctor.js` chama os 3 novos check functions
  - `.aioson/agents/sheldon.md` (ou agent files relevantes) menciona os comandos novos se aplicável
  - Smoke test: `aioson workflow:next` em feature SMALL não quebra com active-learning-loop ativo

## Implementation sequence

1. **@dev** escreve fixture `tests/active-learning-loop-inception.test.js` usando o pattern de outros inception tests (precedent: tests existentes em `tests/`).
2. **@dev** escreve fixture `tests/inception-parity-active-learning-loop.test.js`.
3. **@dev** estende `src/commands/sync-agents-preflight.js` adicionando paridade para os novos arquivos (use `extractSection()` pattern, Internal sweep §6).
4. **@dev** escreve docs em 4 idiomas (pt-BR primary, traduções podem vir de @copywriter ou translation pipeline).
5. **@dev** wiring audit manual: lê os 6 files de wiring (cli.js × 2, feature-close × 2, doctor × 2) e confirma todos os pontos.
6. **@qa** roda os 2 fixture tests em CI (Linux + Windows + macOS matrix).
7. **@qa** smoke test em projeto cliente real (`aioson setup` em projeto greenfield + verifica os 3 comandos).

## External dependencies

Nenhuma.

## Notes para @dev

- Brain `sheldon-001` (workspace/template parity): este é o teste DESSA decisão. Falhar AC-603 = drift que `sheldon-001` adverte.
- Brain `sheldon-006` (design-complete ≠ execution-complete): este phase é o **execution-complete gate** para a feature inteira. Sem AC-605, feature não está done.
- Fixtures usam tmpdir + cleanup em afterEach. Não tocar `.aioson/runtime/aios.sqlite` real.
- Docs em 4 idiomas: pt-BR é canônico; outras línguas podem ser thinner mas devem cobrir os 3 comandos novos.
- Windows path quirks: usar `path.join` em todos os fixture asserts; CRLF/LF não importam para JSON.

## Notes para @qa

- Cross-platform: roda em Windows (CRLF + path separators), macOS (case-insensitive default), Linux (case-sensitive).
- Locale: roda fixtures com `LANG=en_US.UTF-8` E `LANG=pt_BR.UTF-8` — i18n não pode quebrar.
- Real-world smoke: setup em projeto AIOSON cliente existente (não greenfield) — `aioson update .` aplica novo template + preserva user customizations.
- Regressão: ALL fixture tests existentes continuam passing após esta phase. Nenhuma breakage em scout, dossier, ou other features.

## Reference sources

- `.aioson/brains/sheldon/architecture-decisions.brain.json` nodes 001 + 006
- Internal sweep §6 — sync-agents-preflight.js `checkParity()` pattern
- Existing pattern: `tests/feature-close-scouts-archival.test.js` (deyvin-subtask-scout)
- `docs/pt/living-memory/` as i18n docs precedent
