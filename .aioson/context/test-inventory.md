---
generated: "2026-05-14T22:45:00.000Z"
framework: "Node.js"
test_runner: "node:test"
agent: "tester"
scope: "CLI commands & install pipeline (per user complaint)"
supersedes: "2026-04-28 feature-dossier inventory (stale)"
---

# Test Inventory — CLI/install regression scan

## Test suite baseline (npm test)

| Métrica | Valor |
|---|---|
| Total tests | 2419 |
| Passing | 2377 |
| **Failing** | **42** |
| Skipped / Todo / Cancelled | 0 |
| Duration | 77.6s |

Histórico (per `bootstrap/current-state.md:70`): regressão anterior era 2238/2275 com 37 falhas pré-existentes. **5 falhas novas** entraram desde então.

## Failures grouped by domain

| Domínio | # | Arquivos |
|---|---|---|
| Squad daemon/dashboard/webhook | 18 | squad-daemon, squad-dashboard, squad-api-endpoints, squad-webhook-production, squad-export, squad-score, tool-invocation-hardening |
| Live/Runtime sessions | 6 | live-command (4), live-json-output (1), runtime-command (1) |
| Context health | 6 | context-health (whole file) |
| sync-agents-preflight | 2 | sync-agents-preflight (Phase 6 active-learning-loop) **NEW** |
| JSON schema files | 2 | json-schema-files |
| Perf flakes (Windows IO) | 2 | qa-telemetry-foundation (QA-PERF-01 — documented flake), telemetry-foundation (AC-ALL-101) |
| Diversos | 6 | agent-contracts (kernel size), agent-teams-adapter, learning-auto-promote, devlog-process-fixture, designer-related |

## CLI install pipeline — focused inspection

### Tier 1 — Exists
- ✓ `src/commands/install.js` (149 lines)
- ✓ `src/installer.js` (413 lines)
- ✓ `src/install-profile.js`, `src/install-wizard.js`, `src/install-animation.js`
- ✓ Tests: `installer.test.js`, `installer-profile.test.js`, `install-orchestrator.test.js`, `install-profile.test.js`, `install-animation.test.js`, `init-install-guidance.test.js`, `install-wizard.test.js` (7 arquivos)

### Tier 2 — Substantive
- ✓ `install.js`: implementação real, wizard path bem documentado, fallback paths cobertos no código (TTY/non-TTY/--dry-run)
- ✓ `installer.js`: 413 LOC, lógica de cópia + skip + overwrite

### Tier 3 — Wired
- ✓ Registrado em `src/cli.js` KNOWN_COMMANDS
- ✓ i18n keys 4 idiomas (en/pt-BR/es/fr)
- ✓ Recente hardening em `cc7bd17 fix(install): wizard always opens in TTY; non-TTY never silently install-all`

### Tier 4 — Functional (smoke test)
- ⚠ **BUG-001 confirmado em produção**: `aioson install --dry-run` (no projeto atual) imprime `"Installation completed at: C:\dev\aioson, Files copied: 235, Files skipped: 175"`, sem qualquer marcador de dry-run. `git status` confirma 0 arquivos modificados — **dry-run funciona corretamente**, mas a saída engana o operador.
- ⚠ Causa raíz em `src/commands/install.js:121-128`: branch `else` do TTY check usa as mesmas keys i18n (`install.done_at`, `install.files_copied`, `install.files_skipped`) para o caso real E para o dry-run. Não existe `install.dry_run_*` em `src/i18n/messages/*.js`.
- ✓ **RESOLVIDO 2026-05-14 (@dev)**: branch dry-run isolada + 4 i18n keys × 4 locales + characterization test `tests/install-dry-run.test.js` (3/3 verde). Smoke real agora imprime `⚠  DRY RUN — no files were written.` + `Files that would be copied: 240`.

## Coverage gap evidence — why tests didn't catch BUG-001

Verifiquei com `grep -n "dry" tests/installer.test.js tests/install-orchestrator.test.js tests/install-wizard.test.js`:

- **Zero asserções** sobre output de `--dry-run` nos 3 arquivos de teste do install.
- Os testes verificam `result.ok`, `result.copied.length`, `result.skipped.length` (estado interno) — mas nunca capturam stdout para validar que o usuário recebe mensagem dry-run distinta.
- **Padrão**: testes Tier 2 (substantive) e Tier 3 (wired) passam; Tier 4 (functional — UX/comunicação) não é testado.

## Risk priorities — testing gaps por severidade

### High (afeta UX em produção e está sem cobertura)
- **BUG-001**: dry-run install sem marcador visual — usuário pode achar que rodou o real
- **squad subsystem (18 falhas)** — testes existem mas falham; cobertura aparente sem proteção real. Precisa verificar se squad é considerado "supported" ou experimental
- **live-command + runtime-command (6 falhas)** — observability path falhando; afeta dashboard
- **sync-agents-preflight (2 falhas NOVAS)** — checks que **bloqueiam** o `npm run sync:agents:preflight`. Se passar em CI mas falhar local, motor de hardening trava

### Medium
- **context-health (6 falhas — arquivo inteiro)** — comando `aioson context:health` provavelmente quebrado; usuários que rodam health checks recebem falsa segurança
- **json-schema-files (2 falhas)** — schemas de manifest podem estar drift do código real

### Low (mas registrar)
- **perf flakes Windows** (`QA-PERF-01`, `AC-ALL-101`) — já documentadas como Windows-IO-sensitive; reproduzem 1/3 das vezes
- **agent-contracts kernel size** — orçamento de bytes dos prompts; provavelmente saiu do budget após edits recentes
- **agent-teams-adapter, learning-auto-promote, etc** — 1 falha isolada cada

## Hypothesis sobre o pedido do user

User reportou: *"vários comandos com problemas principalmente o install"*.

Match com evidência:
- ✓ Install **funciona** em produção, mas **dry-run engana** (UX bug confirmado)
- ✓ Outros comandos que provavelmente o user encontrou problemas (especulação até confirmar): `aioson live:*`, `aioson context:health`, `aioson squad:*`, qualquer coisa rodada via `sync-agents:preflight`
- ✓ Padrão geral: tests verificam estado interno mas não validam UX/comunicação/integração end-to-end

## Sugestão de Strategy (Phase 3 — pendente confirmação do user)

**Strategy: Risk-first Gap Filling + Characterization Testing**

Foco em duas frentes paralelas:

1. **Closing 5 new failures** (rápido — provavelmente quebraram com último commit; pegar antes que congelem):
   - sync-agents-preflight (2)
   - context-health (6 — talvez todas decorrentes de uma única refactor)
   - telemetry-foundation AC-ALL-101 (1 — perf, talvez flake legítimo)

2. **BUG-001 install dry-run** (User-facing UX gap):
   - Adicionar test que captura stdout do `runInstall` em dry-run
   - Asserta que output contém marcador distinto (e.g. `[DRY RUN]` ou `Would copy …`)
   - Repor com i18n keys `install.dry_run_*` em 4 idiomas (escopo @dev, não @tester)
   - @tester só escreve o test que falha → @dev implementa o fix → @qa re-verify

3. **Tier 4 functional coverage missing** para CLI:
   - Smoke test cada `aioson <cmd> --help` e `aioson <cmd> --dry-run` → não-zero exit, output não-vazio, sem stack traces

## Files NOT loaded (avoidance — anti-context-bloat)

- Não li `src/installer.js` completo (413 LOC) — peguei só headlines via wc/grep
- Não li conteúdo dos 7 install*.test.js — só verifiquei ausência de "dry" via grep
- Não inspecionei tests/squad-* individualmente — agrupei por sintoma

## Squad subsystem deep-dive (per user pick)

Audit das 18 falhas em `squad-*.test.js`:

### Root cause primário (16/18 falhas)
**Windows-only `EBUSY: resource busy or locked, unlink ... aios.sqlite`** durante teardown dos testes.

- `squad-daemon` (4/4 falhas), `squad-dashboard` (4/4), `squad-score` (1/1) e maioria de `squad-api-endpoints`/`squad-webhook-production` falham **na limpeza do tmpDir**, não no corpo do teste.
- Padrão: testes usam `await fs.rm(tmpDir, { recursive: true })` sem chamar `db.close()` antes. `better-sqlite3` mantém handle aberto; Windows não permite `unlink` enquanto handle ativo (POSIX permitiria).
- Confirmado por grep: 19 ocorrências de `fs.rm(tmpDir, { recursive: true })` em squad-daemon + squad-dashboard sem `db.close()` precedente.

### Root cause secundário (1/18)
**`tar: Cannot connect to C: resolve failed`** em `squad-export.test.js` + `tool-invocation-hardening.test.js#SF-12`.

- GNU tar no Windows interpreta `C:\path` como `C:` host + `\path` path (sintaxe remote).
- Causa: commit `171dbf0 fix(tool-invocation): convert execSync template-literal sites to spawn-with-array-args` não normalizou para forward-slash ou `tar --force-local` antes de invocar.

### Smoke test do squad CLI no projeto real

- ✓ `aioson squad:status .` → "No squads found." (output correto, exit 0)
- ⚠ `aioson squad:doctor .` → "Error: Multiple squads found. Provide --squad=<slug>." (não é bug do código — é estado do repo; CLI funciona)

### Veredito squad

O **subsistema squad em produção funciona**. As 18 falhas em `npm test` no Windows são **bugs de infraestrutura de teste** (fixture teardown), não bugs do squad. Quem rodar a suite em Linux CI provavelmente vê 0 falhas dessas (pendente confirmação).

**Não é a causa do "vários comandos com problemas"** que o user reportou.

**Atualização 2026-05-14 (@dev fix bug-002)**: o veredito acima foi parcialmente revisado durante o fix. **17/18 falhas eram infra de teste** (handle SQLite descartado), conforme diagnosticado. **1/18 era bug real de produção** em `squad-score.js:284` (chamada de função async sem await, vazando handle e silenciando o erro via catch). Esse bug significava que `runSquadScore` **nunca persistia scores no runtime DB** desde que foi escrito — a feature de score histórico estava silenciosamente inoperante. Fix shipped junto com o helper de cleanup.

### Recomendação

**@dev fix (escopo Medium):**
1. Criar helper `tests/helpers/sqlite-cleanup.js` que envolve teardown: `closeAllOpenDbs(); await sleep(50); await fs.rm(...)`.
2. Refatorar squad-daemon/squad-dashboard/squad-score/squad-api-endpoints/squad-webhook-production para usar o helper.
3. `squad-export` + `tool-invocation-hardening#SF-12`: usar `tar --force-local` ou normalizar paths antes do spawn.

**@tester escopo (esta sessão):** marcar essas 16 falhas como **Windows-environment-known-flake** em `test-plan.md`. Não escrever testes novos — o sintoma já está documentado.

## Continuation

Squad: investigação concluída — não é a fonte real do problema do user.

**Atualização 2026-05-14 (@tester triagem das 20 remanescentes)**: a triagem cross-cluster foi concluída. Artifact JSON em `.aioson/context/test-triage.json`. Detalhes humanos em `test-plan.md > Cross-cluster sweep`. Resumo: 6 EBUSY (mesma raiz do bug-002, mecânico) + 6 live-cluster ENOENT (bug real high-sev) + 2 test-update + 2 fixture-stale + 3 singletons + 1 drift de prompt + 1 perf-flake. **15 dos 20 são entregáveis para @dev**, 2 são test refresh para @tester, 3 são decisões de @architect/product-owner.
