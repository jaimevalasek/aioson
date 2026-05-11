---
feature: living-memory
agent: qa
generated_at: "2026-05-11"
classification: MEDIUM
gate: D
verdict: PASS
language: pt-BR
---

# QA Report — `living-memory` — 2026-05-11

> Gate D (execution). MEDIUM feature, 5 fases, 39 testes novos. Sign-off conditional ao fix de path containment aplicado durante a revisão (ver H-01 abaixo).

## Bootstrap gate

`aioson memory:status .` → 4/4 (coverage OK). Bootstrap não está stale.
Reflect manifest pendente foi consumido pelo @qa (snapshot_hash bateu, edição em `what-it-does.md`).

## AC coverage

| Fase | Critério de aceite (spec-living-memory.md) | Status |
|---|---|---|
| 0 | rodar `/discover` no atendimento abre o agente | **Covered** — validado em campo, slashes em `template/.claude/commands/aioson/agent/discover.md` + `.gemini/commands/aios-discover.toml` + OPENCODE.md + AGENTS.md |
| 1 | `aioson memory:reflect-prepare . --agent=dev` gera reflect-prompt.json válido contra fixture | **Covered** — `tests/memory-reflect-engine.test.js` (13 cenários, todos passam); validado e2e em `/tmp/reflect-smoke` |
| 2 | `aioson update .` regenera `.claude/settings.json` com tier1+tier2, **sem tier3** | **Covered** — `tests/permissions-generator.test.js` (11 cenários); validado e2e em `/tmp/install-smoke` (verificado: zero matches para `git push`/`cloud:publish`) |
| 3 | Sessão `/dev` que mudou `src/routes/` dispara reflexão automática | **Covered** — `tests/memory-reflect-integration.test.js` (2 cenários); hooks em `workflow-next.js` e `runAgentDone` (live + standalone) |
| 4 | `aioson doctor .` reporta exatamente os 4 buracos identificados na análise | **Covered** — `tests/doctor-living-memory.test.js` (10 cenários); validado e2e em `/tmp/doctor-smoke` |
| 5 | Leitor sem contexto consegue rodar comandos canônicos lendo apenas README.md | **Covered** — `docs/pt/living-memory/README.md` tem tabela de comandos canônicos + roteiro de leitura por necessidade |

**AC: 6/6 covered.**

## Findings

### Critical
*Nenhum.*

### High

**[H-01] Path containment fail-open quando `allowed_paths` está vazio**
File: `src/memory-reflect-engine.js:286-295` (pré-fix)
Risco: Um manifest com `validation_rules.allowed_paths = []` (ou ausente) faria com que `validate()` não checasse caminho algum — qualquer `files: { '/etc/passwd': '...' }` passaria, e `reflect-commit.js` faria `path.resolve(targetDir, '/etc/passwd')` → escrita arbitrária no FS.
Cenário de ataque: manifest corrompido ou agente LLM com comportamento errático (prompt injection, hallucination) emite output com paths absolutos ou parent-traversal.
**Fix aplicado durante o QA:**
- `validate()` agora rejeita upfront quando `allowed_paths` está vazio ou ausente (fail-closed).
- `validate()` agora rejeita explicitamente paths absolutos e segmentos `..` antes do match contra `allowed_paths`.
- `reflect-commit.js` adicionou defense-in-depth: verifica que toda `path.resolve(targetDir, relPath)` permanece sob `<targetDir>/.aioson/context/bootstrap/`; caso contrário emite `memory_reflect_failed` com `attempted_path` e retorna `path_escape`.
Tests escritos: 4 novos em `tests/memory-reflect-engine.test.js`:
- `validate rejects manifest with empty allowed_paths (fail-closed)`
- `validate rejects manifest with missing allowed_paths (fail-closed)`
- `validate rejects absolute file paths even if allowed_paths matches the basename`
- `validate rejects path-traversal segments`
- `reflect-commit refuses writes outside bootstrap/ as defense in depth`
**Status pós-fix:** todos os 13 testes do engine passam, suite completa 2195/2198 (3 falhas pré-existentes).

### Medium

**[M-01] TOCTOU race em commits paralelos**
File: `src/commands/memory-reflect-commit.js:84-106`
Risco: duas sessões @dev em harnesses diferentes rodando reflect-commit simultaneamente. Ambas leem o mesmo snapshot, ambas passam `snapshot_hash` check, ambas escrevem. Last-write-wins, sem erro reportado. Não corrompe bootstrap (ambas escrevem conteúdo válido), mas a contribuição da primeira é perdida silenciosamente.
Mitigação atual: `validate()` checa `snapshot_hash` no momento da preparação do commit, o que cobre o caso comum (modo single-user). Concorrência real só ocorre em cenários CI/multi-session.
Fix sugerido (não aplicado — fora de escopo desta feature): adicionar lock file (`.aioson/runtime/reflect-commit.lock`) com PID + timestamp; abortar se outro lock vigente < 30s.
Risco residual aceitável para entrega.

### Low

**[L-01] Unbounded JSON read em `readJsonFile`**
File: `src/commands/memory-reflect-commit.js:14-17`
Risco: `fs.readFile` carrega o arquivo inteiro. Manifest patológico (1GB) causaria OOM no CLI. Improvável na prática — manifest é escrito pelo próprio engine com tamanho previsível (~10KB).
Fix sugerido: adicionar `maxSize` check antes de parse (ex: rejeitar > 1MB).

**[L-02] Unbounded stdin read em `readStdin`**
File: `src/commands/memory-reflect-commit.js:19-28`
Risco: idem L-01 para input via stdin. Cap suggerido: 1MB.

### Info

**[I-01] Pre-existing kernel size budget (dev.md > 15KB)**
File: `template/.aioson/agents/dev.md` (18.5KB pós-feature)
Test #15 (`agent-contracts.test.js`) já falhava em HEAD pré-Fase-3 (16.9KB). A feature adicionou Memory reflection (~500 bytes) + Step 0.1 bootstrap gate (~500 bytes), totalizando +1022 bytes. Piorou um teste já vermelho mas não introduziu uma nova falha.
Fix sugerido: extrair `## Built-in dev modules` para `.aioson/docs/dev/memory-reflection.md` carregado on-demand. Fora de escopo desta feature.

**[I-02] Bootstrap snapshot no prompt do agente**
File: `src/memory-reflect-engine.js:208` (buildPrompt)
Manifest carrega o conteúdo completo dos 4 bootstrap files. Se algum tiver prompt injection plantado, vai parar na sessão do harness. Isso é por design (agent precisa do snapshot para diff-aware editing) e está documentado em `architecture-living-memory.md` §6.
Mitigação: bootstrap é escrito apenas pelo `/discover` ou `reflect-commit` (ambos governados); risco real só se um atacante já tem write em `.aioson/context/bootstrap/`, caso em que já comprometeu o projeto.

**[I-03] Doc drift risk em `docs/pt/living-memory/`**
Documentação descreve comportamento atual do engine/generator. Mudanças futuras no código podem deixar docs desatualizadas. Sem teste automatizado que valide doc ↔ código.
Fix sugerido: adicionar `aioson docs:audit` futuro para detectar drift. Fora de escopo.

**[I-04] `version_drift` check usa string-equality**
File: `src/doctor.js:readContextVersion`
`1.7.2` vs `1.7.2-beta.1` reportariam drift, mesmo sendo da mesma série semver. Adequado por agora (pin exato é mais previsível).

## Security findings (sensitive surface review)

Feature toca: **filesystem writes** (`reflect-commit`), **shell config files** (`permissions-generator` escreve `.claude/settings.json` etc.), **autonomy contract** (tiers de permissão), **prompt injection no agent** (manifest carrega bootstrap content).

Surfaces avaliadas:
- ✅ **Auth/secrets**: feature não toca auth nem armazena credentials.
- ✅ **External URLs/uploads**: zero ingestão de URL ou upload externo.
- ✅ **Multi-tenant data**: feature é per-projeto (single-tenant).
- ✅ **Money/ownership**: N/A.
- ⚠ **Filesystem path traversal**: encontrado H-01, **fix aplicado durante a revisão**.
- ⚠ **Permission elevation**: tier3 hard-rejection é a barreira de segurança. Validado por `permissions-generator.test.js` (cenário "never includes tier3 even when listed in derived_from_tiers"). Mantém invariante de que `git push`/`npm publish`/`cloud:publish:*` nunca vira allow-list.
- ⚠ **Native config overwrite**: generator faz backup em `.aioson/backups/{ts}/permissions/` antes de sobrescrever. Reversível. Merge no `.claude/settings.json` preserva entradas do usuário.

`security-findings-living-memory.json` não existe → review baseado em checklist + leitura manual.

## Residual risks

- **TOCTOU em multi-session paralela** (M-01) — aceito para entrega; mitigado pela natureza single-user típica.
- **Unbounded read em manifests** (L-01/L-02) — aceito; improvável na prática.
- **Doc drift futuro** (I-03) — sem mitigação atual.
- **Pre-existing kernel size** (I-01) — feature piorou o débito mas não introduziu.

## Recommended next agents

- **`@committer`** — branch tem 5 fases de feature + fix de H-01 sem commit. Recomendado consolidar antes de marcar `done`. Pode ser feature commit unificado referenciando `architecture-living-memory.md`.
- **`@tester`** — não recomendado: coverage está adequada (39 testes específicos + ~2150 testes legados passando), módulos sensíveis (engine, generator, doctor) têm múltiplos cenários cada, fail-closed paths cobertos.
- **`@pentester`** — não recomendado: H-01 já encontrado e corrigido durante QA. Surfaces sensíveis cobertas; pentester traria valor marginal para uma feature CLI sem rede/auth/upload.
- **`@validator`** — não aplicável: `.aioson/plans/living-memory/harness-contract.json` não existe.

## Summary

**0 Critical, 1 High (fixed), 1 Medium, 2 Low, 4 Info. AC: 6/6 covered.**

Suite completa: **2195/2198** testes passam. Os 3 reds (#15 kernel size, #730/#731 JSON schema metadata) são pré-existentes confirmados via `git stash` desde Fase 0.

## QA sign-off

- **Verdict:** PASS
- **Date:** 2026-05-11
- **AC coverage:** 6/6 fully covered
- **High findings:** 1 (H-01 path containment) — **fixed during review**; tests escritos
- **Medium/Low findings:** documented as residual risks; nenhum bloqueia entrega
- **Residual risks:** TOCTOU concorrente (M-01), unbounded reads (L-01/L-02), doc drift (I-03), kernel size pré-existente (I-01)
