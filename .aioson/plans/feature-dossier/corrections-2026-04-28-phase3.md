---
phase: 3
created: 2026-04-28
status: resolved
---

# Corrections Plan — Phase 3 — 2026-04-28

## Context

QA rodou em 2026-04-28 e encontrou 0 Critical, 0 High, 1 Medium, 2 Low.
Gate D: PASS condicional — Medium e Low podem ficar como residual risk.

## Mandatory corrections

_(nenhuma — sem Critical/High)_

## Optional corrections

### O-01 — Auto-compaction após `revision:resolve` ✅ RESOLVIDO 2026-04-28

**Prioridade:** Medium
**Fix aplicado:** `src/dossier/revision-store.js` — importado `shouldCompact`/`compact` de `./dossier-compact`; chamado após `updateDossierSection` nos dois branches (`reject` e `approve`).
**Testes adicionados:** 3 novos testes em `tests/dossier/revision-store.test.js` (describe `resolve auto-compact (O-01)`): auto-compact após reject, auto-compact após approve, sem compact quando dossier pequeno.
**AC afetado:** AC5 — agora fully covered.

### O-02 — Warning para path de arquivo inexistente em `dossier:add-codemap` ✅ RESOLVIDO 2026-04-28

**Prioridade:** Low
**Fix aplicado:** `src/dossier/codemap-store.js` — `fs.access()` antes de escrever; retorna `warn: 'file_not_found'` quando arquivo ausente (nunca lança erro). `src/commands/dossier.js` — loga "Warning: file not found on disk — registered as planned file." quando `result.warn` presente.
**Testes adicionados:** 2 novos casos em `tests/dossier/codemap-store.test.js`: warn=file_not_found para path inexistente, warn=null para arquivo existente.

### O-03 — Warning explícito ao detectar `dossier-history.md` corrompido em `dossier:show` ✅ RESOLVIDO 2026-04-28

**Prioridade:** Low
**Fix aplicado:** `src/dossier/store.js:show()` — tenta `fs.readFile(hp)` depois de ler o ativo; ENOENT é ignorado; qualquer outro erro retorna `warn: 'history_corrupted'`. `src/commands/dossier.js:runDossierShow()` — loga warning quando presente; JSON output inclui campo `warn`.
**Testes adicionados:** 3 novos casos em `tests/dossier/store.test.js`: warn=null quando history ausente, warn=history_corrupted quando ilegível, warn=null quando history válido.
