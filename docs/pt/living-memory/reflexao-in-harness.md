# Reflexão In-Harness — pipeline técnica

> Por que "in-harness"? Porque a parte cara — interpretar diff e reescrever prosa — acontece **dentro da sessão do harness** (Claude Code, Codex e OpenCode), usando o LLM que você já está pagando. O CLI nunca abre conexão com um provider de IA. Ele decide quando disparar, monta o pacote pro agente, e valida o resultado.

## Componentes

```
src/memory-reflect-engine.js          ← engine puro: evaluate, buildPrompt, validate
src/commands/memory-reflect-prepare.js ← sub-comando que monta o manifest
src/commands/memory-reflect-commit.js  ← sub-comando que valida e persiste
template/.aioson/templates/reflect-prompts/
   ├── current-state.md                ← prompt-base para reflexão de current-state
   ├── how-it-works.md                 ← idem para how-it-works
   └── what-it-does.md                 ← idem para what-it-does
```

O engine é **puro**: sem chamada LLM, sem rede, sem mutação de estado fora dos parâmetros que recebe. Ele só lê `git diff`, lê `bootstrap/*.md` e devolve estruturas.

## A heurística — quando reflexão dispara

```js
const evaluation = await engine.evaluate(targetDir, { agent: 'dev', gitRange: 'HEAD~3..HEAD' });
// {
//   verdict: 'relevant' | 'skip',
//   reasons: ['routes/controllers touched (2 files)', 'features.md changed'],
//   signals: { routes: [...], models: [...], prd: [...], features: true, ... },
//   shortstat: { files: 7, insertions: 142, deletions: 28 },
//   bootstrapPresent: true,
//   changedFiles: ['src/routes/api/posts.js', '...'],
//   gitRange: 'HEAD~3..HEAD',
//   agent: 'dev'
// }
```

Critérios para `relevant` (basta um disparar):

| Família | Pattern (regex) | Origem |
|---|---|---|
| Routes / API handlers | `(routes\|controllers)/`, `pages/api/`, `app/api/` | Express, Next.js, Laravel, Rails |
| Models / Migrations | `models/`, `migrations/`, `prisma/schema.prisma`, `app/Models/` | ORM-agnostic |
| Contratos de domínio | `.aioson/context/prd-*.md`, `features.md`, `requirements-*.md` | AIOSON |
| Bootstrap mudado | `.aioson/context/bootstrap/current-state.md` | AIOSON |
| Volume alto | ≥ 10 arquivos **E** ≥ 200 linhas | Genérico |

Tudo o resto: `verdict=skip`. CSS, typos, refactor de testes, dependências dev — não mudam o resumo semântico.

## O manifest — o que o agente recebe

`memory:reflect-prepare` gera `.aioson/runtime/reflect-prompt.json`:

```json
{
  "version": 1,
  "session_id": "dev-2026-05-11T14:30:00.123Z",
  "trigger_agent": "dev",
  "git_range": "HEAD~3..HEAD",
  "heuristic_verdict": "relevant",
  "heuristic_reasons": [
    "routes/controllers touched (2 files)",
    "features.md changed"
  ],
  "targets": ["how-it-works.md", "current-state.md"],
  "current_bootstrap_snapshot": {
    "what-is.md": "<conteúdo atual>",
    "how-it-works.md": "<conteúdo atual>",
    "what-it-does.md": "<conteúdo atual>",
    "current-state.md": "<conteúdo atual>"
  },
  "snapshot_hash": "237721bf02a717e89...",
  "diff_summary": "7 files, +142/-28",
  "changed_files": ["src/routes/api/posts.js", "..."],
  "instructions": "Edit only: bootstrap/how-it-works.md, bootstrap/current-state.md. ...",
  "validation_rules": {
    "must_have_frontmatter": true,
    "must_update_generated_at": true,
    "must_diff_content": true,
    "allowed_paths": [
      ".aioson/context/bootstrap/how-it-works.md",
      ".aioson/context/bootstrap/current-state.md"
    ]
  },
  "generated_at": "2026-05-11T14:30:00.123Z"
}
```

Os campos críticos:

- `targets` — quais arquivos editar. Derivado das signals (rotas/models → `how-it-works.md + current-state.md`; PRD/features → `what-it-does.md + current-state.md`).
- `current_bootstrap_snapshot` — conteúdo on-disk no momento da preparação. O agente pode comparar com o diff para decidir o que adicionar/remover.
- `snapshot_hash` — SHA-256 dos 4 arquivos. Usado no commit pra detectar concorrência (alguém editou bootstrap entre prepare e commit → reject).
- `validation_rules.allowed_paths` — limite duro. Qualquer escrita fora dessa lista é rejeitada no commit.

## O agente reflete

O agente lê o manifest na próxima sessão (ou na mesma, se for o caso). Cada agent.md (dev, qa, deyvin) tem uma seção "Memory reflection" com a instrução:

> Se `.aioson/runtime/reflect-prompt.json` existir no início do seu turno, antes de qualquer outra ação: leia, edite os `targets` em `bootstrap/*.md` (preservando frontmatter, atualizando `generated_at`, sem escrever fora de `allowed_paths`), depois `aioson memory:reflect-commit . --agent=<você> --output=<path>` com `{ "files": { "<rel>": "<content>" } }`. Pule silenciosamente se não houver manifest.

O agente é livre para usar o LLM como achar melhor para fazer a reescrita. O CLI só dita o **contrato**: o que editar, onde escrever, como apresentar o resultado.

## O commit — validação determinística

`memory:reflect-commit` recebe o output do agente (via `--output=<json>` ou stdin):

```json
{
  "files": {
    ".aioson/context/bootstrap/how-it-works.md": "---\nname: how-it-works.md\ngenerated_at: 2026-05-11T14:35:00.000Z\n---\n# How it works\n\n...\n",
    ".aioson/context/bootstrap/current-state.md": "---\nname: current-state.md\ngenerated_at: 2026-05-11T14:35:00.000Z\n---\n# Current state\n\n## What the system already has\n\n- ...\n- Capability: paginação em /api/posts (cursor-based)\n"
  }
}
```

`engine.validate({ manifest, files, currentSnapshot })` aplica:

1. **Path containment** — todo path em `files` precisa estar em `manifest.validation_rules.allowed_paths`. Escrita fora: reject.
2. **Frontmatter** — todo arquivo precisa ter o bloco `---\n...\n---` no topo.
3. **`generated_at` atualizado** — extrai o campo no antigo e no novo; precisa estar diferente.
4. **Conteúdo mudou** — `content !== original`. Reflexão que devolve o mesmo arquivo é rejeitada.
5. **Snapshot hash bate** — recalcula SHA-256 dos 4 arquivos on-disk agora, compara com `manifest.snapshot_hash`. Diferente: alguém mexeu entre prepare e commit, abort.

Se tudo passa: escreve, apaga o manifest, emite `memory_reflect_committed` em runtime. Se falha: emite `memory_reflect_failed` com a lista de erros e o agente tem 1 retry.

> **`--dry-run` (pré-visualização não-destrutiva):** `aioson memory:reflect-commit . --agent=dev --output=<json> --dry-run` roda a validação + containment de path exatamente como o commit real, mas **não escreve nada e não consome o manifest** — retorna `{ ok: true, dryRun: true, would_write: [...] }`. Use pra conferir o output antes de aplicar. Atenção: o manifest é **single-use** — um commit real (sem `--dry-run`) o apaga; pra recomeçar, rode `memory:reflect-prepare` de novo.

## Exemplo end-to-end

```bash
# 1. Sessão de dev mudou rotas
$ git log --oneline -3
abc1234 feat(api): paginação cursor-based em /api/posts
def5678 test(api): cobertura para paginação
ghi9012 feat(features): registra paginação em features.md

# 2. Agente terminou — agent:done dispara prepare
$ aioson agent:done . --agent=dev --summary="paginação"
agent:done — @dev | task: ... | run: dev-...

# 3. Manifest aparece
$ ls .aioson/runtime/reflect-prompt.json
.aioson/runtime/reflect-prompt.json

$ cat .aioson/runtime/reflect-prompt.json | jq .heuristic_verdict
"relevant"

$ cat .aioson/runtime/reflect-prompt.json | jq .targets
["how-it-works.md", "what-it-does.md", "current-state.md"]

# 4. Próxima sessão de dev/qa/deyvin lê o manifest e edita os 3 arquivos.
#    O agente prepara o output JSON e commita:

$ cat > /tmp/reflect-output.json <<EOF
{
  "files": {
    ".aioson/context/bootstrap/how-it-works.md": "...",
    ".aioson/context/bootstrap/what-it-does.md": "...",
    ".aioson/context/bootstrap/current-state.md": "..."
  }
}
EOF

$ aioson memory:reflect-commit . --agent=dev --output=/tmp/reflect-output.json
✓ reflect committed: 3 file(s)
  - .aioson/context/bootstrap/how-it-works.md
  - .aioson/context/bootstrap/what-it-does.md
  - .aioson/context/bootstrap/current-state.md

# 5. Manifest foi consumido — não aparece mais
$ ls .aioson/runtime/reflect-prompt.json
ls: cannot access: No such file or directory
```

## O que pode dar errado e como o engine lida

| Cenário | Comportamento |
|---|---|
| Git não disponível no projeto | Engine retorna `verdict=skip`, prepare loga `skipped` e não escreve manifest |
| `bootstrap/` não existe | Prepare retorna `missing_bootstrap`, sugere `/aioson:agent:discover` |
| Diff range inválido (`HEAD~3` não existe — projeto novo) | Fallback para `git diff HEAD` (working tree). Se ainda assim vazio: skip |
| Agente edita arquivo fora de `allowed_paths` | Commit rejeita, emite `memory_reflect_failed` com erro `outside allowed_paths` |
| Agente esquece de atualizar `generated_at` | Reject com `generated_at not updated` |
| Outra sessão editou bootstrap entre prepare e commit | Reject com `snapshot_hash mismatch` — concorrência detectada |
| Agente devolve conteúdo idêntico | Reject com `content unchanged` |
| Frontmatter quebrado | Reject com `missing YAML frontmatter` |

Em todos os casos de reject, o manifest **permanece** em disco — o agente pode tentar de novo.

## Forçar reflexão fora do hook

Se você quer rodar manualmente (ex: depois de um rebase grande):

```bash
# Roda a heurística + escreve manifest mesmo se verdict=skip
aioson memory:reflect-prepare . --agent=dev --force --git-range=HEAD~5..HEAD
```

`--force` ignora `verdict=skip` (mas ainda respeita `missing_bootstrap`).

## Telemetria

Cada estágio da pipeline emite um evento em `.aioson/runtime/aios.sqlite`:

- `memory_reflect_prepared` — manifest escrito
- `memory_reflect_skipped` — heurística disse skip
- `memory_reflect_committed` — agente terminou com sucesso
- `memory_reflect_failed` — validação rejeitou

Você pode consultá-los via dashboard ou diretamente:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT created_at, event_type, message FROM agent_events
   WHERE event_type LIKE 'memory_reflect_%' ORDER BY created_at DESC LIMIT 10;"
```

## Continue lendo

- [Autonomy Contract](./autonomy-contract.md) — como reflexão se encaixa no tier 2 (auto + notify)
- [Troubleshooting](./troubleshooting.md) — receitas para reflexões que falharam
- [Diagramas](./diagramas.md) — fluxo visual do hook em `workflow:next`
