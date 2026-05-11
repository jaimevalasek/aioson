# Diagramas — Memória Viva em ASCII

> Fluxos canônicos da feature. ASCII porque renderiza em qualquer terminal, qualquer Markdown viewer, e qualquer diff. Mermaid fica para quando o leitor precisa de cor.

---

## 1. Ciclo completo de uma sessão com reflexão

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Usuário                                                                     │
│  ───────                                                                     │
│  /dev "adicionar paginação em /api/posts"                                    │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Agente @dev (Claude Code / Codex / Gemini / OpenCode)                       │
│  ──────────                                                                  │
│  1. Lê .aioson/config.md                                                     │
│  2. Lê .aioson/context/project.context.md                                    │
│  3. Lê .aioson/context/dev-state.md (foco + pacote de contexto)              │
│  4. Lê bootstrap/how-it-works.md + bootstrap/current-state.md                │
│  5. Implementa, testa, commita                                               │
│  6. Chama: aioson agent:done . --agent=dev --summary="paginação"             │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/commands/runtime.js#runAgentDone                                        │
│  ────────────────────────────────────                                        │
│  • Registra agent_done no SQLite                                             │
│  • [hook] best-effort: runMemoryReflectPrepare({...})                        │
│      try { ... } catch { /* ignore — never blocks */ }                       │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  src/memory-reflect-engine.js#evaluate                                       │
│  ──────────────────────────────────────                                      │
│  git diff --name-only HEAD~3..HEAD →                                         │
│     ['src/routes/api/posts.js', 'features.md', 'tests/posts.test.js']        │
│  Classify:                                                                   │
│     ✓ routes/controllers touched (1)                                         │
│     ✓ features.md changed                                                    │
│  verdict = 'relevant'                                                        │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  buildPrompt → escreve .aioson/runtime/reflect-prompt.json                   │
│  ──────────────────────────────────────────────────────────                  │
│  {                                                                           │
│    "session_id": "...",                                                      │
│    "targets": ["how-it-works.md", "what-it-does.md", "current-state.md"],    │
│    "current_bootstrap_snapshot": { ... },                                    │
│    "snapshot_hash": "237721bf...",                                           │
│    "validation_rules": { allowed_paths: [...] }                              │
│  }                                                                           │
│  + emit memory_reflect_prepared                                              │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼ próxima sessão
┌──────────────────────────────────────────────────────────────────────────────┐
│  Agente entra (mesmo agente ou outro)                                        │
│  ─────────────────────────────────────                                       │
│  Step 0: detecta .aioson/runtime/reflect-prompt.json                         │
│  Seção "Memory reflection" do agent.md instrui:                              │
│    1. Lê o manifest                                                          │
│    2. Edita os 3 targets em bootstrap/* preservando frontmatter,             │
│       atualizando generated_at                                               │
│    3. Monta { "files": { "<rel>": "<content>", ... } }                       │
│    4. Roda: aioson memory:reflect-commit . --agent=<você> --output=<json>    │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  memory:reflect-commit → engine.validate                                     │
│  ───────────────────────────────────────                                     │
│  ✓ frontmatter present                                                       │
│  ✓ generated_at bumped                                                       │
│  ✓ content differs from snapshot                                             │
│  ✓ all paths in allowed_paths                                                │
│  ✓ snapshot_hash matches (no concurrent edit)                                │
│  → Write bootstrap/*.md                                                      │
│  → Delete reflect-prompt.json                                                │
│  → Emit memory_reflect_committed                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hook em `workflow:next --complete`

```
aioson workflow:next . --complete=dev
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ finalizeCurrentStage(dev)                                           │
│  • valida handoff contract                                          │
│  • roda gates técnicos                                              │
│  • grava last-handoff.json + handoff-protocol.json                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ [hook Living Memory] best-effort                                    │
│   try {                                                             │
│     await runMemoryReflectPrepare({ agent: 'dev', json: true });    │
│   } catch { /* never block workflow */ }                            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ activateStage(next agent)                                           │
│  • monta activation.prompt                                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ [hook Living Memory] se reflect-prompt.json existe:                 │
│   activation.prompt =                                               │
│     "ℹ [memory] reflect-prompt.json pending — before any other       │
│      action, read .aioson/runtime/reflect-prompt.json and run        │
│      `aioson memory:reflect-commit . --agent=<next> --output=<>`     │
│      per your Memory Reflection section.\n\n"                       │
│     + activation.prompt                                             │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
                logger.log(activation.prompt)
```

---

## 3. Geração de permissões nativas (Autonomy Contract)

```
.aioson/config/autonomy-protocol.json                  (canonical)
                  │
                  │ aioson update . / aioson setup .
                  ▼
        src/permissions-generator.js
                  │
                  │ resolveToolSets(protocol, tool)
                  │   • lê derived_from_tiers
                  │   • UNION de shell_patterns + aioson_commands
                  │   • HARD-REJECT tier3_blocking
                  │
        ┌─────────┼─────────┬─────────────┐
        ▼         ▼         ▼             ▼
   ┌────────┐ ┌──────┐ ┌────────┐  ┌──────────┐
   │ Claude │ │ Codex│ │ Gemini │  │ OpenCode │
   │ JSON   │ │ JSON │ │ TOML   │  │ YAML     │
   │ (merge │ │ (over│ │ (over- │  │ (over-   │
   │ user)  │ │ -wr) │ │ write) │  │ write)   │
   └────┬───┘ └──┬───┘ └───┬────┘  └────┬─────┘
        │       │         │            │
        │       │         │            │  backup do anterior
        │       │         │            ├──────────────────────┐
        ▼       ▼         ▼            ▼                      ▼
   .claude/    .codex/   .gemini/   .opencode/      .aioson/backups/
   settings    permis-   permis-    permis-          {timestamp}/
   .json       sions     sions      sions            permissions/
               .json     .toml      .yaml             └── <tool>/
                                                          └── <file>

Invariante:
─────────────
"Mesmo se um tool listar 'tier3_blocking' em derived_from_tiers,
 nenhum pattern de tier 3 aparece no output."

Tier 3 SEMPRE exige humano:
  • git push *
  • git reset --hard *
  • rm -rf *
  • npm publish *
  • curl * | sh
  • cloud:publish:*
  • genome:publish, skill:publish, squad:publish
```

---

## 4. Ciclo de `doctor --fix`

```
$ aioson doctor . --fix
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ runDoctor(targetDir)                                             │
│  └─ checks[]                                                     │
│      ├─ file:* (required files)              [severity: error]   │
│      ├─ design-governance:* (design docs)    [severity: error]   │
│      ├─ gateway:* (CLAUDE/AGENTS/etc.)       [severity: error]   │
│      ├─ context:* (project.context.md)       [severity: error]   │
│      ├─ node:version                         [severity: error]   │
│      ├─ living-memory:bootstrap_coverage     [severity: warning] │
│      ├─ living-memory:features_dir           [severity: warning] │
│      ├─ living-memory:claude_commands        [severity: warning] │
│      ├─ living-memory:version_drift          [severity: warning] │
│      └─ living-memory:permissions_in_sync    [severity: warning] │
│                                                                  │
│  report.ok = errorCount === 0                                    │
│  (warnings count em failedCount mas não bloqueiam ok)            │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ applyDoctorFixes(targetDir, report)                              │
│  ├─ required_files:        restore from template                 │
│  ├─ gateway_contracts:     restore from template                 │
│  ├─ design_governance:     restore from template                 │
│  ├─ locale_sync:           apply locale to agent prompts         │
│  ├─ claude_commands:       restore .claude/commands/aioson/*     │
│  ├─ features_dir:          mkdir .aioson/context/features/       │
│  ├─ permissions_in_sync:   generatePermissions(targetDir)        │
│  ├─ bootstrap_coverage:    [advisory] sugere /discover           │
│  └─ version_drift:         [advisory] sugere npm i / edit ctx    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
                Re-run runDoctor(targetDir)
                         │
                         ▼
              Print updated report + summary
```

---

## 5. Anatomia do manifest (`reflect-prompt.json`)

```
┌────────────────────────────────────────────────────────────────────────┐
│ reflect-prompt.json                                                    │
│ ───────────────────                                                    │
│                                                                        │
│  version: 1                                                            │
│  session_id: "dev-2026-05-11T14:30:00.123Z"                            │
│  trigger_agent: "dev"                                                  │
│  git_range: "HEAD~3..HEAD"                                             │
│                                                                        │
│  heuristic_verdict: "relevant"      ┐                                  │
│  heuristic_reasons: [               │ ← saída do engine.evaluate       │
│    "routes/controllers ...",        │                                  │
│    "features.md changed"            │                                  │
│  ]                                  ┘                                  │
│                                                                        │
│  targets: [                         ┐ ← decidido por                   │
│    "how-it-works.md",               │   chooseTargetsFromSignals       │
│    "current-state.md"               │                                  │
│  ]                                  ┘                                  │
│                                                                        │
│  current_bootstrap_snapshot: {      ┐ ← foto agora dos                 │
│    "what-is.md": "...",             │   4 bootstrap/*.md               │
│    "how-it-works.md": "...",        │                                  │
│    "what-it-does.md": "...",        │                                  │
│    "current-state.md": "..."        │                                  │
│  }                                  ┘                                  │
│                                                                        │
│  snapshot_hash: "237721bf..."       ← SHA-256(snapshot)                │
│                                       usado para detectar              │
│                                       concorrência no commit           │
│                                                                        │
│  diff_summary: "7 files, +142/-28"                                     │
│  changed_files: [...]                                                  │
│  instructions: "Edit only: ..."                                        │
│                                                                        │
│  validation_rules: {                                                   │
│    must_have_frontmatter: true,                                        │
│    must_update_generated_at: true,                                     │
│    must_diff_content: true,                                            │
│    allowed_paths: [                ┐ ← barreira dura no                │
│      ".aioson/context/bootstrap/   │   commit: escrita fora            │
│        how-it-works.md",           │   é rejeitada                     │
│      ".aioson/context/bootstrap/   │                                   │
│        current-state.md"           │                                   │
│    ]                               ┘                                   │
│  }                                                                     │
│                                                                        │
│  generated_at: "2026-05-11T14:30:00.123Z"                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Severity model do doctor

```
                    ┌─────────────────────────────────────┐
                    │  runDoctor() returns                │
                    └─────────────┬───────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        ┌──────────┐        ┌──────────┐       ┌─────────────┐
        │ checks[] │        │ failed   │       │ ok          │
        │          │        │ Count    │       │ (boolean)   │
        │ todos os │        │          │       │             │
        │ checks   │        │ errors + │       │ errorCount  │
        │          │        │ warnings │       │  === 0      │
        └──────────┘        └──────────┘       └─────────────┘
                                                      ▲
                                                      │ warnings NÃO afetam
                                                      │ → backward-compat com
                                                      │   testes que esperavam
                                                      │   ok=true pós-install
                                                      │
        ┌─────────────────────────────────────────────┴─────────────┐
        │ Existing checks → severity = 'error' (implicit)           │
        │   file:*, design-governance:*, gateway:*, context:*, node │
        │                                                           │
        │ Living Memory checks → severity = 'warning'               │
        │   living-memory:bootstrap_coverage                        │
        │   living-memory:features_dir                              │
        │   living-memory:claude_commands                           │
        │   living-memory:version_drift                             │
        │   living-memory:permissions_in_sync                       │
        └───────────────────────────────────────────────────────────┘
```

---

## 7. Telemetria — eventos emitidos

```
                    .aioson/runtime/aios.sqlite
                              │
                              │ agent_events.event_type
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                                                              │
   │  memory_reflect_prepared     ← manifest escrito              │
   │  memory_reflect_skipped      ← heurística disse skip         │
   │  memory_reflect_committed    ← agente terminou com sucesso   │
   │  memory_reflect_failed       ← validação rejeitou            │
   │                                                              │
   │  notify_info                 ← aioson notify --level=info    │
   │  notify_warn                 ← aioson notify --level=warn    │
   │  notify_block                ← aioson notify --level=block   │
   │                                                              │
   └──────────────────────────────────────────────────────────────┘
                              │
                              │ consumido por
                              ▼
              ┌─────────────────────────────────┐
              │  AIOSON Dashboard (app sep.)    │
              │   /logs                         │
              │   linha do tempo por feature    │
              │                                 │
              │  sqlite3 queries diretas        │
              │  aioson runtime:logs (futuro)   │
              └─────────────────────────────────┘
```

---

## Continue lendo

- [Memória Viva](./memoria-viva.md) — o conceito
- [Reflexão In-Harness](./reflexao-in-harness.md) — pipeline detalhada
- [Autonomy Contract](./autonomy-contract.md) — tiers e harnesses
- [Troubleshooting](./troubleshooting.md) — quando algo não bate
