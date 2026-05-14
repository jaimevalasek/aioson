---
generated: "2026-05-14T22:55:00.000Z"
agent: "tester"
scope: "Squad subsystem audit + cross-cluster regression triage"
strategy: "Characterization Testing — capture current Windows behavior; defer fixes to @dev"
supersedes: "2026-04-28 feature-dossier test plan (stale)"
---

# Test Plan — Squad audit findings + cross-cluster hypothesis

## Strategy escolhida

**Characterization Testing** sobre a suite atual + **Risk-first mapping** dos clusters restantes.

Razão: as 18 falhas em `squad-*.test.js` revelaram que o sintoma "tests don't catch bugs" tem duas faces independentes:

1. **Falhas reais em produção** que não foram exercitadas no test bed (BUG-001 install dry-run = exemplo canônico).
2. **Falhas espúrias de teste em Windows** mascarando o sinal real (todo o cluster squad).

Esses 2 problemas se sobrepõem no dashboard de `npm test` — o operador vê 42 falhas e não consegue distinguir qual é qual.

## Bug findings (encontrados durante o audit, não fixar nesta sessão)

### [bug-found-001] install --dry-run engana o usuário — **FIXED 2026-05-14 (@dev)**

- **Arquivo**: `src/commands/install.js:117-138` (branch dry-run isolada do non-TTY)
- **Sintoma**: output idêntico ao install real ("Installation completed at: ...", "Files copied: 235")
- **Verificado**: `git status` limpo após `aioson install --dry-run` — efeito é zero, mas o user não tem como saber
- **Owner**: @dev (precisa criar `install.dry_run_*` i18n keys × 4 locales + branch no install.js) — **CONCLUÍDO**
- **Test gap**: zero asserções de stdout em dry-run nos 7 install-test files — **CONCLUÍDO** (`tests/install-dry-run.test.js` com AC-DRY-01/02/03)
- **Fix delivery**:
  - 4 i18n keys novas × 4 locales (en/pt-BR/es/fr): `dry_run_header`, `dry_run_done_at`, `dry_run_files_copied`, `dry_run_files_skipped`
  - Branch `else if (dryRun)` em `install.js` usa as keys novas com marker visível `⚠  DRY RUN`
  - Locales não-en incluem a frase inglesa entre parênteses (`would be copied`/`would be skipped`) para grepabilidade cross-locale em logs de ops
  - Smoke real: `node bin/aioson.js install . --dry-run --no-interactive` mostra `⚠  DRY RUN — no files were written.` + `Files that would be copied: 240` (antes: `Files copied: 240` sem qualquer marker)
- **Regression**: 85/85 verde no cluster install (8 arquivos), 2382/2422 verde no full suite (delta zero falhas novas vs baseline 2377/2419)

### [bug-found-002] squad teardown EBUSY no Windows — **FIXED 2026-05-14 (@dev)**

- **Arquivos**: `tests/squad-{daemon,dashboard,score,api-endpoints,webhook-production}.test.js` (18 testes recuperados, vs 16 estimados pelo @tester)
- **Sintoma**: `EBUSY: resource busy or locked, unlink ... aios.sqlite`
- **Root cause (refinado durante o fix)**: dois sintomas distintos sob o mesmo cluster:
  1. **Tests-side**: chamadas `await openRuntimeDb(tmpDir)` com handle **descartado** (não capturado em variável) — o handle nativo SQLite ficava aberto até o GC do V8 reaparar, mas o `fs.rm` do `finally` rodava antes
  2. **Production-side (bônus encontrado)**: `src/commands/squad-score.js:284` chamava `openRuntimeDb(projectDir)` **sem `await`** dentro de função async — o destructure pegava undefined, o catch silenciosamente engolia o erro, mas a Promise ainda resolvia e vazava handle. Bug real de produção, não só infra de teste.
- **Fix delivery**:
  - Novo helper `tests/helpers/sqlite-cleanup.js` (~30 LOC úteis) com 2 exports: `closeHandles(...items)` swallow-errors, `cleanupTmpDir(tmpDir, { handles: [...] })` que fecha handles + roda `fs.rm` com `{ force: true, maxRetries: 5, retryDelay: 100 }` (cobre janela ~50-100ms de release do lock NTFS pós-close)
  - 5 test files refatorados: cada teste que abre `openRuntimeDb` agora declara `let handle = null;` no topo do `try` + captura o retorno + usa `cleanupTmpDir(tmpDir, { handles: [handle] })` no `finally`
  - **Production fix surgical**: 1 linha em `squad-score.js` — adicionado `await` antes do `openRuntimeDb`, comentário explicando o vazamento
- **Owner**: @dev — **CONCLUÍDO**
- **Severidade**: medium — bloqueia dev-loop no Windows mas CI Linux passa — **MITIGADO**
- **Regression**: 100/100 verde no cluster squad (5 arquivos, vs 82/100 baseline). Full suite: 2399/2422 (vs 2382/2422 antes do fix; vs 2377/2419 baseline original). Delta net: +17 passing. As 23 falhas restantes são clusters separados (context-health, live-*, json-schema, sync-agents-preflight, etc) fora do escopo bug-002.

### [bug-found-003] squad-export tar Windows path

- **Arquivos**: `tests/squad-export.test.js`, `tests/tool-invocation-hardening.test.js#SF-12`
- **Sintoma**: `tar: Cannot connect to C: resolve failed`
- **Root cause**: GNU tar interpreta `C:\foo` como `C:` host + `\foo` path
- **Owner**: @dev (passar `--force-local` ou normalizar paths antes do spawn)
- **Severidade**: low — feature de export é tier-3

## Test writing plan (Phase 4 — pendente decisão do user)

Não vou escrever testes até user escolher direção. As opções viáveis em ordem de ROI:

### Opção A — BUG-001 characterization (RECOMENDADO)
Escreve `tests/install-dry-run.test.js` com 3 cases:
1. `it('AC-DRY-01: dry-run prefixes user output with [DRY RUN]', ...)` — falha hoje
2. `it('AC-DRY-02: dry-run does not call fs.writeFile or fs.copyFile', ...)` — passa hoje (state-correct)
3. `it('AC-DRY-03: dry-run summary distinguishes "would copy" from "copied"', ...)` — falha hoje

Custo: ~80 LOC. Benefício: cria a especificação executável que força @dev a corrigir BUG-001.

### Opção B — Re-investigar context-health (6 falhas, mesmo cluster suspeito de EBUSY?)
Roda `node --test tests/context-health.test.js` em isolamento. Se for outro EBUSY/Windows → marca como bug-found-004 (mesma classe do squad). Se for bug real → escreve characterization.

### Opção C — Cross-cluster sweep para EBUSY pattern
Categoriza as 42 falhas em 3 buckets via diagnóstico automatizado:
- `windows-teardown-ebusy` (sqlite locked)
- `windows-tar-path`
- `real-assertion-failure` (bug ou regressão real)

Output: pequena tabela JSON gravada em `.aioson/context/test-triage.json` que CI pode usar pra decidir o que skipar no Windows.

### Opção D — Tier-4 smoke suite (escopo maior, definido em test-inventory.md)
`tests/cli-smoke.test.js`: `aioson <verb> --help` × 80 + `aioson <verb> --dry-run` em verbs aplicáveis. ~160 cases.

## Hard constraints respeitados nesta sessão

- ✓ Nenhuma modificação em código de produção
- ✓ Anti-loop guard: 2 artefatos escritos antes de Phase 4 (test-inventory.md + test-plan.md)
- ✓ Bugs documentados, não fixados silenciosamente
- ✓ Bugs roteados para @dev/@qa conforme protocolo

## Próximo passo

User precisa escolher entre A/B/C/D acima OU dar diretriz alternativa. @tester aguarda confirmação antes de Phase 4.
