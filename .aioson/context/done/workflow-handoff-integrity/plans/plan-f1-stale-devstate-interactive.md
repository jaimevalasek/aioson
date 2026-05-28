---
phase: 3
slug: f1-stale-devstate-interactive
parent_manifest: .aioson/plans/workflow-handoff-integrity/manifest.md
severity: medium
estimated_sessions: 1
suggested_release: v1.9.7
depends_on: [phase 1 — F2 stable]
---

# Phase 3 — F1: Stale `dev-state.md` cleanup interativo

## Scope

Estender `preflight.js:72` (`detectStaleDevState`) para, quando detecta `dev-state.md` apontando para feature `done` ou inexistente, oferecer comando acionável ao usuário em vez de apenas warning passivo.

**Não é cleanup automático silencioso.** Decisão explícita do PRD (Out of scope): UX é warning acionável, usuário controla o cleanup.

## New or modified entities

Nenhuma entidade de domínio. Mudanças em código:

- `src/preflight.js` — função `detectStaleDevState` (modificação)
- `src/commands/state-save.js` (provável) — adicionar subcomando `state:reset` se ainda não existir
- Modo interativo: usar `aioson` CLI prompt helper existente OU emit instruction estruturada se non-interactive context

## User flows covered

- **PRD Flow 3** — Stale dev-state detectado oferece ação ao usuário

## Acceptance criteria

- **AC-F1-01:** `aioson preflight . --agent=dev` (ou qualquer agente que dispara preflight) com `dev-state.md` apontando para feature `done` em `features.md` emite mensagem estruturada: `"⚠ dev-state.md está stale: aponta para '<slug>' já concluída em <date>. Sugiro: aioson state:reset (limpa) OU aioson state:save --feature=<nova>. Continuar mesmo assim? [y/N]"`.
- **AC-F1-02 (interactive vs non-interactive):** em TTY interativo, prompt aceita `y/N`. Em non-interactive (CI, pipe), emite warning estruturado em stderr + exit code 0 (não bloqueia preflight, é warning).
- **AC-F1-03 (state:reset command):** `aioson state:reset .` zera `.aioson/context/dev-state.md` (ou move para `.aioson/runtime/devstate-history/{ISO-date}.md` para auditoria). Idempotente: se já zerado, no-op.
- **AC-F1-04 (state:save --feature):** `aioson state:save . --feature=<slug>` reescreve `dev-state.md` apontando para nova feature. Se feature não está em `features.md`, exit code != 0 com sugestão de registrar primeiro.
- **AC-F1-05 (orphan detection):** stale é definido como: (a) feature em `dev-state.md` marcada `done` em `features.md`, OU (b) feature em `dev-state.md` ausente de `features.md` (cross-project leak), OU (c) `last_updated` em `dev-state.md` > 30 dias.
- **AC-F1-06 (test coverage):** test em `tests/preflight-stale-devstate.test.js` cobrindo as 3 condições de AC-F1-05 + caminho TTY + non-TTY.
- **AC-F1-07 (wiring audit per PMD-07):** `detectStaleDevState` chamada de todos os agent preflight call sites; grep confirma.
- **AC-F1-08 (corrupt dev-state treated as stale):** `dev-state.md` com YAML frontmatter parse fail OU body malformado → trata como stale (oferece reset/save command), log warning estruturado, NÃO crash. Test: fixture com `dev-state.md` contendo `---\nfeature: [invalid yaml\n---` → preflight detecta stale (corrupt branch), oferece comando, exit 0. (Adicionado por @architect Gate B per Q11 analyst.)

## Implementation sequence

1. Estender `detectStaleDevState` com 3 conditions de AC-F1-05.
2. Adicionar TTY check (`process.stdout.isTTY`) → branch interativo vs structured warning.
3. Criar/estender `state:reset` command em `src/commands/state-save.js` (ou `state-reset.js` se separar).
4. Validar `state:save --feature=<slug>` flag handling.
5. Tests em 4-6 cenários cobrindo AC-F1-06.
6. Wiring audit: grep call sites de `detectStaleDevState` em todos os agent preflight paths.

## External dependencies

- Phase 1 (F2) estável — porque F1 é cleanup de estado pós-feature, e F2 garante que a transição feature `in_progress` → `done` é confiável (pointer avança corretamente).

## Notes for @dev

- Não introduzir auto-cleanup silencioso. Decisão consciente do user (PRD Out of scope explicit).
- Em non-interactive (CI), emit warning + exit 0. Não bloqueia builds.
- O3 do PRD original (que foi resolvido em PMD-04) confirma: warning local, hard fail só em pre-publish (T6). F1 sozinho NÃO bloqueia preflight.

## Notes for @qa

- Test cross-project leak: setup fixture onde `dev-state.md` referencia feature de outro projeto. Verifica detect + warning correto.
- Test TTL: `last_updated` em `dev-state.md` setado para 31 dias atrás → detect.

## Phase-specific reference sources

- Briefing Theme 4 (F1 reclassified)
- PRD F1 must-have
- `src/preflight.js:72` (código atual)
- `src/commands/state-save.js:138` (per-project path confirmado)
