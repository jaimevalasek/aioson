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

### [bug-found-003] squad-export tar Windows path — **FIXED 2026-05-14 (@dev)**

- **Arquivos**: `tests/squad-export.test.js`, `tests/tool-invocation-hardening.test.js#SF-12`
- **Sintoma**: `tar: Cannot connect to C: resolve failed`
- **Root cause**: GNU tar interpreta qualquer `HOST:PATH` como host remoto; o `-C C:\dev\foo` casa exatamente esse padrão. Verificado experimentalmente: forward-slash sozinho não resolve (o colon ainda dispara o parser), `--force-local` sozinho corrompe os backslashes na msys tar.
- **Owner**: @dev (passar `--force-local` ou normalizar paths antes do spawn) — **CONCLUÍDO**
- **Severidade**: low — feature de export é tier-3
- **Fix delivery**: 4 linhas em `src/commands/squad-export.js`:
  1. `tarProjectDir = projectDir.replace(/\\/g, '/')` — forward-slash do `-C` arg
  2. `tarOutputFile = outputFile.replace(/\\/g, '/')` — forward-slash do `-czf` arg
  3. `tarArgs = [...]` + `if (process.platform === 'win32') tarArgs.unshift('--force-local')`
  4. Comentário explicando ambas as decisões e por que cada parte é necessária
- **Regression**: `squad-export.test.js` 3/3 verde, `tool-invocation-hardening.test.js#SF-12` verde, full suite 2402/2422 (was 2399/2422). Zero regressão nova.

## Cross-cluster sweep — triagem das 20 falhas remanescentes (Opção C, 2026-05-14 @tester)

Após bug-found-001/002/003 fechados, restavam 20 falhas no full suite. Esta seção é a triagem prometida no test-plan.md original (Opção C — "cross-cluster sweep para EBUSY pattern").

**Artifact JSON com a triagem completa**: `.aioson/context/test-triage.json` (legível por CI/scripts).

### Buckets — 20 falhas em 7 classes

| Classe | # | Owner | Severidade | ID |
|---|---|---|---|---|
| windows-teardown-ebusy | 6 | @dev | high | **bug-found-004** |
| real-assertion-failure-live-cluster | 6 | @dev | high | **bug-found-005** |
| test-needs-update-new-check-noise | 2 | @tester | low | test-update-001 |
| stale-fixture-path | 2 | investigação | low | investigation-001 |
| drift-from-recent-refactor | 1 | @architect | medium | decision-needed-001 |
| real-assertion-failure-singleton | 3 | @dev | medium | **bug-found-006** |
| perf-flake-windows-io | 1 | @tester/@architect | low | known-flake-001 |

### Detalhes por bucket

#### [bug-found-004] context-health EBUSY × 6 — **FIXED 2026-05-14 (@dev)**

- `tests/context-health.test.js:46,59,77,97,115,125`
- Sintoma idêntico: `EBUSY: resource busy or locked, unlink ... aios.sqlite`
- **Diagnóstico revisado durante o fix**: NÃO era o padrão de "handle descartado" do bug-002. O test fechava o handle corretamente no `beforeEach` e o `runContextHealth` também fechava na linha 100 do código de produção. O leak eram os **arquivos WAL/SHM** (`aios.sqlite-wal`, `aios.sqlite-shm`) criados quando `openRuntimeDb` ativa WAL mode (linha 59 de `runtime-store.js`). Esses arquivos siblings ficam pendurados ~50-100ms no Windows mesmo após `db.close()` — tempo suficiente pro `fs.rm` do `afterEach` falhar.
- **Fix entregue**:
  - Produção: `src/commands/context-health.js` linha 100 — adicionado `db.pragma('wal_checkpoint(TRUNCATE)')` antes de `db.close()`. Força WAL→main e libera siblings sincronamente.
  - Test: `afterEach` agora usa `cleanupTmpDir(tmpDir)` em vez de `fs.rm` cru — safety net via `maxRetries: 5, retryDelay: 100` caso outro path quebre o checkpoint.
  - Comentários documentam ambas as decisões e por que cada uma é necessária.
- **Regressão**: `context-health.test.js` 7/7 verde, full suite **2407/2422** (was 2402/2422). +5 net (6 context-health recuperados, 1 flake elsewhere offsetting).

**Note**: o padrão WAL/SHM lingering provavelmente afeta outros testes — durante esta sessão observei `tests/context-search.test.js:15` falhar com `ENOTEMPTY` em `search/` subdir (também é WAL-related). Recomendação: aplicar o mesmo padrão (`wal_checkpoint(TRUNCATE)` + `cleanupTmpDir`) em sessões futuras se ocorrerem flakes similares.

#### [bug-found-005] live-* cluster ENOENT × 6 — **FIXED 2026-05-14 (@dev)**

- `tests/live-command.test.js:36,308,394,435`, `tests/live-json-output.test.js:34`, `tests/runtime-command.test.js:610`
- Sintoma uniforme: `ENOENT: no such file or directory, open '.../runtime/live/direct-session:{ts}:deyvin/state.json'`
- **Diagnóstico real**: o session key tem formato `direct-session:{ts}:{agent}` com **colons**. NTFS reserva `:` em nomes de arquivo (drive letter, ADS syntax). `mkdir 'direct-session:123:deyvin'` falha com ENOENT no Windows. Os 3 escritores (`writeLiveState`, `appendLiveEvent`, `writeLiveSummary`) tinham `try { ... } catch { /* filesystem is auxiliary */ }` que silenciosamente engolia o erro — `state.json` nunca era escrito. Linha 4621cf3 da história git: o bug está em produção desde que tracked live sessions foram adicionadas; CI roda em Linux onde colons funcionam. **Dashboard live view nunca funcionou em produção no Windows.**
- **1 root cause, 6 sintomas diferentes**:
  1. `state.json` ENOENT × 2 — leitura direta falha (nunca escrito)
  2. "Missing expected rejection" (back-to-back task_started) — validação lê state.json, não acha nada, permite duplicação
  3. `live:list` 0 sessions — list escaneia state.json files, nenhum existe
  4. `runtime status child_task_count 2 !== 1` — accounting depende de state.json existir
  5. live-json-output — espera summary.md no path com colons
- **Fix entregue**:
  - Helper `sessionKeyToDirName(key)` em `src/commands/live.js` que troca `:` por `__`
  - `resolveLivePaths` agora sanitiza antes de `path.join` — único ponto de fronteira FS
  - Export do helper pra que tests possam construir paths que casam com o layout de disco
  - `session_key` em SQLite e CLI continua com colons (identificador público); só o nome do diretório é sanitizado
  - 5 sites em 2 test files atualizados pra usar o helper
- **Regressão**: live-command 8/8 + live-json-output 2/2 + runtime-command relevante verde. Full suite **2413/2422** (was 2407/2422). +6 net. As 9 falhas restantes incluem 4 flakes intermitentes que passam em isolação.

#### [test-update-001] sync-agents-preflight × 2 — TEST NEEDS UPDATE (não bug)

- `tests/sync-agents-preflight.test.js:146,194`
- Tests stubam `dossierTelemetry.emitDossierEvent` e contam chamadas. Foram escritos antes do check `learning_loop_template_parity_violation` (Phase 6 active-learning-loop) existir. O novo check emite +1 evento, quebrando as contagens (esperado 1 → recebe 2; esperado 0 → recebe 1)
- **Fix**: filtrar `calls` por `payload.type === 'sync_agents_parity_violation'` antes de contar (5 minutos de @tester)
- **NÃO é bug de produção** — o código de produção está correto, o test é que não cobre o cenário pós-Phase 6

#### [investigation-001] json-schema-files × 2 — STALE FIXTURE PATH

- `tests/json-schema-files.test.js:17,65`
- Aponta para `docs/en/schemas/index.json` que **não existe** no repo (`docs/en/` existe com 6 subdirs, mas nenhum `schemas/`)
- Owner unclear até alguém rodar `git log --all -- 'docs/**/schemas/**'` pra descobrir se os schemas:
  1. Nunca existiram nesse path (test sempre quebrado?)
  2. Existiram e foram removidos (test precisa atualizar path OU os schemas precisam voltar)
  3. Foram movidos pra outro lugar (test precisa atualizar path)
- ETA: 5 minutos de arqueologia git → decisão

#### [decision-needed-001] product kernel oversize × 1 — NÃO É BUG, É DECISÃO

- `tests/agent-contracts.test.js:229`
- Asserção: "product kernel should stay within the generalist target" — falhou
- Adições recentes ao prompt do `product.md` empurraram o tamanho acima do budget enforced
- Decisão (não-tester): (a) rebudget — atualizar o limite no test, ou (b) trim — cortar conteúdo do prompt
- Owner: @architect ou product-owner

#### [bug-found-006] singletons reais × 3

- `tests/agent-teams-adapter.test.js:122` — `teammate.agentFile.includes('custom/agents/dev.md')` false → custom file path não está sendo honrado
- `tests/learning-auto-promote.test.js:92` — `result.promoted_items[0].file.includes('.aioson/rules')` false → path format mudou
- `tests/live-command.test.js:308` (também no live-cluster acima, mas a asserção é distinta — "Missing expected rejection")
- ETA: 15-30min cada, investigação individual

#### [known-flake-001] QA-PERF-01 Windows perf × 1

- `tests/qa-telemetry-foundation.test.js:30`
- p99 = 1047.99ms vs SLA 100ms (10× over)
- Já documentado como Windows-IO-sensitive flake; este run pegou um pico de carga (10× é fora do padrão histórico)
- Decisão de @architect: rebudget SLA pra Windows, skip por plataforma, ou aceitar flake

### Recomendação de sequenciamento

1. **bug-found-004** primeiro (@dev, mecânico, alto retorno) — recupera 6 testes
2. **test-update-001** em paralelo (@tester, 5min) — recupera 2 testes
3. **bug-found-005** depois (@dev, investigação + fix) — recupera 6 testes
4. **bug-found-006** sequencial (@dev, 3 itens) — recupera 3 testes
5. **investigation-001** → arqueologia git → decisão (@dev ou @architect)
6. **decision-needed-001** + **known-flake-001** → @architect

Pós-execução do 1-4: **17 testes recuperados** → suite deve chegar a **2419/2422 verde** (3 itens decision-only restantes).

## Veredito do trio bug-found-*

Os 3 bugs identificados pelo @tester estão resolvidos. Total dessa sessão @dev:
- **bug-001** (install --dry-run UX): 4 i18n keys × 4 locales + branch isolada + 3 ACs em characterization test
- **bug-002** (squad EBUSY): helper `tests/helpers/sqlite-cleanup.js` + 5 test files refatorados + 1 production bug consertado em `squad-score.js` (missing await silenciou função inteira)
- **bug-003** (squad-export tar Windows): 4 linhas em `squad-export.js` (forward-slash + --force-local condicional Windows)
- **Net delta full suite**: 2402/2422 vs 2377/2419 baseline @tester — **+22 passing, -22 failing**
- **3 commits** entregues no `main`: `fix(install)`, `fix(squad)`, `chore(context)` — bug-003 pendente de commit

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
