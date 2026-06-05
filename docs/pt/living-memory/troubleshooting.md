# Troubleshooting — receitas para problemas comuns

> Cada receita é direta: **sintoma** → **diagnóstico** → **fix**. Comece sempre por `aioson doctor .` — ele detecta a maioria dos problemas e o `--fix` resolve uma boa parte sozinho.

---

## 1. `bootstrap` está 0/4 (ou < 4) — agente "parece burro"

**Sintoma:** o agente abre, não conhece os módulos do projeto, faz perguntas que estão respondidas no código. Ou `aioson doctor .` reporta:

```
[FAIL] Bootstrap coverage: 0/4
  Hint: Run /discover to seed .aioson/context/bootstrap/{what-is,how-it-works,what-it-does,current-state}.md
```

**Diagnóstico:** `.aioson/context/bootstrap/` está vazio ou faltando arquivos. O agente está caindo no fallback de varrer o repo, e isso consome contexto + perde nuances.

**Fix:** rode `/aioson:agent:discover` no harness ativo. Esse é o único caminho — bootstrap é **semântico**, precisa do LLM analisando o projeto. `doctor --fix` **não** popula bootstrap (a hint deixa isso explícito).

```bash
# Em qualquer harness:
/aioson:agent:discover

# O agente vai:
# - Ler o código real
# - Resumir em what-is.md, how-it-works.md, what-it-does.md, current-state.md
# - Commitar com generated_at do dia
```

Depois confirme:

```bash
aioson memory:status .
# Bootstrap: 4/4   ← ok
```

---

## 2. `bootstrap` está stale (> 30 dias)

**Sintoma:** o agente acha que features que já existem ainda são backlog, ou flag-a refactors recentes como "scope creep".

**Diagnóstico:** alguém parou de usar AIOSON por um tempo e voltou. Bootstrap não foi atualizado porque ninguém rodou sessão que disparasse reflexão. `doctor` aponta:

```
[FAIL] Bootstrap coverage: 4/4
  Hint: Run /discover to refresh the bootstrap files (or `aioson memory:reflect-prepare . --agent=dev` for manual reflection).
```

(Repare: cobertura 4/4 mas advisório por estar antigo — a hint detecta via `generated_at`.)

**Fix:** rode `/aioson:agent:discover` novamente — ele sobrescreve com a foto atual. Alternativa para refresh parcial: faça uma sessão de `/aioson:agent:dev` que mexa em rotas ou models — a reflexão automática vai atualizar `how-it-works.md` e `current-state.md`.

---

## 3. `reflect-commit` rejeitou — "validation failed"

**Sintoma:**

```
✗ reflect-commit validation failed:
  - .aioson/context/bootstrap/current-state.md: generated_at not updated
  - .aioson/context/bootstrap/how-it-works.md: missing YAML frontmatter
```

**Diagnóstico:** o agente reescreveu os arquivos sem respeitar o contrato. Possíveis causas:

| Mensagem | Causa típica |
|---|---|
| `missing YAML frontmatter` | O agente removeu o bloco `---\n...\n---` no topo |
| `generated_at not updated` | Frontmatter está lá, mas o campo `generated_at` não mudou |
| `content unchanged` | O agente devolveu o arquivo idêntico (não houve edição real) |
| `outside allowed_paths` | O agente tentou escrever em path fora de `validation_rules.allowed_paths` |
| `snapshot_hash mismatch` | Alguém editou `bootstrap/` entre `prepare` e `commit` (concorrência) |

**Fix:** o manifest **continua em disco** (`.aioson/runtime/reflect-prompt.json`) depois do reject. O agente tem 1 retry — peça pra ele ler a mensagem de erro e refazer:

```
"Olha o erro: 'generated_at not updated'. Atualize o campo no frontmatter para a hora atual em ISO 8601 e rode reflect-commit de novo."
```

Para `snapshot_hash mismatch`: abort. Apague o manifest velho e rode `reflect-prepare` de novo — o snapshot atual é diferente do que foi capturado.

```bash
rm .aioson/runtime/reflect-prompt.json
aioson memory:reflect-prepare . --agent=dev
```

---

## 4. Push manual bloqueado — comando tier 3

**Sintoma:** o agente em Claude Code tenta `git push origin main` e recebe prompt de permissão. Em scripts wrappers, `aioson notify --level=block` sai com exit 2.

**Diagnóstico:** isso é o desenho funcionando. `git push *` está em `tier3_blocking` — operação irreversível, sempre exige humano.

**Fix:** rode o push você mesmo. Ou, se quiser que esse projeto específico permita push automatizado (CI, fluxo trusted):

1. **Não mova `git push` para tier 1 ou tier 2.** A barreira é proposital.
2. Use uma chave de máquina diferente para CI e rode o push lá, fora do harness.
3. Como último recurso (e contra a recomendação), edite `template/.aioson/config/autonomy-protocol.json` e remova `git push *` de tier3. Documente o motivo em `.aioson/rules/` para que futuros agentes não removam essa decisão.

---

## 5. `permissions_in_sync` reporta drift

**Sintoma:**

```
[FAIL] Native harness permissions are in sync with autonomy-protocol.json (2 drifted, 0 missing)
  Hint: Run `aioson doctor . --fix` to regenerate: .claude/settings.json, .codex/permissions.json.
```

**Diagnóstico:** alguém editou `autonomy-protocol.json` mais recentemente que os arquivos gerados. O harness ainda está rodando com permissões antigas.

**Fix:**

```bash
aioson doctor . --fix
```

O fix chama `permissions-generator` automaticamente. Os arquivos anteriores ficam em `.aioson/backups/{timestamp}/permissions/` se você quiser rollback.

---

## 6. `version_drift` — versão do CLI difere da context

**Sintoma:**

```
[FAIL] CLI version matches project.context.md (context: 1.7.2, CLI: 1.8.0)
  Hint: project.context.md aioson_version (1.7.2) differs from CLI (1.8.0). Update one or both manually.
```

**Diagnóstico:** ou o CLI foi atualizado e o `project.context.md` ficou para trás, ou alguém checou o projeto com CLI mais antigo do que o que foi usado pra criar.

**Fix:** decida qual é o cenário:

- **Você quer estar na versão atual:** edite `.aioson/context/project.context.md` e atualize o campo `aioson_version` para bater com `aioson --version`.
- **Você precisa rodar com o CLI antigo (compat):** `npm i -g @jaimevalasek/aioson@1.7.2`.

`doctor --fix` **não** auto-corrige — a decisão é semântica.

---

## 7. `claude_commands_present` — slashes faltando

**Sintoma:**

```
[FAIL] Claude slash commands present (1 missing of 4)
  Hint: Missing: .claude/commands/aioson/agent/discover.md. Run `aioson doctor . --fix` to restore them from the template.
```

**Diagnóstico:** `.claude/commands/aioson/agent/<nome>.md` não existe. Os 4 obrigatórios são `setup.md`, `dev.md`, `qa.md`, `discover.md`. Sem o slash, o usuário não consegue invocar `/aioson:agent:discover`, `/aioson:agent:dev`, etc. em Claude Code.

**Fix:**

```bash
aioson doctor . --fix
```

O fix copia do template. Se persistir, rode install manualmente:

```bash
aioson update --all .
```

---

## 8. `features_dir` ausente

**Sintoma:**

```
[FAIL] Features directory present (.aioson/context/features/)
  Hint: Create .aioson/context/features/ to host per-feature dossiers (doctor --fix will create it).
```

**Diagnóstico:** o diretório `.aioson/context/features/` (usado pelos feature dossiers, parte do contrato de tier 2) não existe.

**Fix:**

```bash
aioson doctor . --fix
```

Cria o diretório vazio. Dossiês são populados pelos agentes (`@product`, `@dev` via `dossier:add-codemap`, etc.).

---

## 9. Reflexão nunca dispara — agente "esqueceu" do bootstrap

**Sintoma:** sessões inteiras passam, o código muda, mas `bootstrap/*.md` continua igual e `generated_at` não atualiza.

**Diagnóstico:** algo na pipeline está silencioso. Investigar em ordem:

1. **Heurística pegou skip?** Rode com `--force`:

   ```bash
   aioson memory:reflect-prepare . --agent=dev --force --git-range=HEAD~5..HEAD
   ```

   Se gerou manifest, a heurística estava certa em pular (mudança não era relevante semântica).

2. **Hook em `workflow:next` está falhando silenciosamente?** Procure no SQLite:

   ```bash
   sqlite3 .aioson/runtime/aios.sqlite \
     "SELECT created_at, event_type, message FROM agent_events
      WHERE event_type LIKE 'memory_reflect_%' ORDER BY created_at DESC LIMIT 5;"
   ```

   Ausência de eventos = hook não rodou. Verifique se você está chamando `workflow:next --complete=<agente>` ou `agent:done`.

3. **Agente não está lendo `reflect-prompt.json`?** A seção "Memory reflection" em `dev.md`/`qa.md`/`deyvin.md` instrui ele. Se o agente que você está usando é custom (`.aioson/my-agents/`), adicione a seção lá também.

4. **Bootstrap não existe?** Reflexão pula silenciosamente quando `bootstrap/` não está presente — rode `/aioson:agent:discover` primeiro.

---

## 10. Comando custom não está sendo auto-aprovado

**Sintoma:** Claude Code pergunta permissão toda vez que `aioson meu:comando:novo` roda, mesmo que ele seja "read-only".

**Diagnóstico:** o comando não está no `aioson_commands` de nenhum tier no protocol.

**Fix:** edite `template/.aioson/config/autonomy-protocol.json`, adicione em `tier1_silent.aioson_commands` (se read-only) ou `tier2_notified.aioson_commands` (se mexe em `.aioson/`), depois:

```bash
aioson update .
```

O hook do installer regenera as 4 permissões nativas. Próxima invocação do comando passa direto.

---

## 11. Hook do install não regenerou permissions

**Sintoma:** rodou `aioson update .` mas `.claude/settings.json` ainda tem permissões antigas.

**Diagnóstico:** o hook é best-effort — se `generatePermissions` lançar uma exception, ele captura e retorna o erro em `result.permissions.error` sem abortar o install.

**Fix:**

1. Rode o doctor:

   ```bash
   aioson doctor . --fix
   ```

   Se `permissions_in_sync` falha, o fix força regen.

2. Veja o erro detalhado:

   ```bash
   node -e "(async () => {
     const g = require('@jaimevalasek/aioson/src/permissions-generator');
     console.log(JSON.stringify(await g.generatePermissions('.'), null, 2));
   })();"
   ```

   Erros típicos: protocol JSON inválido, write permission no `.claude/`.

---

## Comandos de emergência

| Você quer... | Comando |
|---|---|
| Ver tudo de uma vez | `aioson doctor .` |
| Resolver o que dá pra resolver | `aioson doctor . --fix` |
| Regenerar só as permissões | `node -e "require('aioson/src/permissions-generator').generatePermissions('.')"` |
| Forçar reflexão manual | `aioson memory:reflect-prepare . --agent=dev --force` |
| Apagar manifest pendente | `rm .aioson/runtime/reflect-prompt.json` |
| Reset full: reinstalar template | `aioson update --all .` (backup automático em `.aioson/backups/`) |
| Reseed bootstrap | `/aioson:agent:discover` no harness ativo |

---

## Quando nada funciona

1. Rode `aioson doctor . --json > /tmp/doctor.json` e inspecione.
2. Confira `.aioson/runtime/aios.sqlite` — eventos `memory_reflect_failed`, `notify_block`.
3. Olhe `.aioson/backups/` para entender o que mudou entre installs.
4. Reporte no GitHub do AIOSON com o conteúdo de `doctor --json`.
