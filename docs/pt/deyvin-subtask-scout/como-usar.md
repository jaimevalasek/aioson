# Como usar o Sub-task Scout

> Exemplos concretos. O `@deyvin` usa o scout automaticamente quando a rubrica linha 111 dispara. Esta página mostra o que acontece por baixo e como intervir quando necessário.

---

## 1. Fluxo happy-path — scout bem-sucedido

Cenário: o usuário pergunta ao `@deyvin` por que o `workflow:next` às vezes herda registros de conclusão de uma feature anterior.

`@deyvin` identifica que a resposta exige inspeção de vários arquivos e despacha um scout:

**Passo 1 — Preparar o scout**

```bash
aioson scout:prep \
  --question="Por que workflow:next herda completion records de features anteriores?" \
  --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js" \
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="Usuário perguntou sobre bug de herança de estado no workflow:next; precisa inspecionar lógica de loadOrCreateState e handoff-contract para identificar onde o featureSlug anterior não é limpo" \
  --feature-slug=current-feature
```

Saída (`--json`):

```json
{
  "ok": true,
  "id": "scout-current-feature-2026-05-14-a3b7c1",
  "prompt": "You are a read-only code survey sub-agent...\n[prompt completo]",
  "output_path": ".aioson/runtime/scouts/scout-current-feature-2026-05-14-a3b7c1.json",
  "cap_remaining": 2
}
```

**Passo 2 — Chamar o sub-agente**

`@deyvin` usa a capacidade de sub-agente do harness (Claude Code `Agent` tool ou Codex sub-agent) com o `prompt` retornado. O sub-agente roda em contexto isolado, usa apenas `Read` e `Grep`, e escreve o resultado em `output_path`.

**Passo 3 — Validar**

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-current-feature-2026-05-14-a3b7c1.json
```

Exit 0 = PASS. O arquivo é válido contra o output schema.

**Passo 4 — Commitar**

```bash
aioson scout:commit --input=.aioson/runtime/scouts/scout-current-feature-2026-05-14-a3b7c1.json
```

Scout persistido, cap decrementado (2→1), telemetria emitida.

**Passo 5 — @deyvin lê e responde**

`@deyvin` lê `findings`, `confidence`, e `recommendation` do JSON e dobra a resposta na conversa com o usuário. Contexto pai cresceu ~500 tokens em vez de ~10k+.

---

## 2. Recuperação de JSON inválido

O sub-agente retornou JSON malformado (campo obrigatório faltando):

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-abc.json
# exit 2
```

Saída:

```json
{
  "ok": false,
  "error": {
    "code": "schema_invalid",
    "details": [
      { "field": "findings[0].evidence", "reason": "required field missing" },
      { "field": "confidence", "reason": "must be one of: high, medium, low" }
    ]
  },
  "retry_remaining": 1
}
```

`@deyvin` re-prompta o sub-agente com as falhas de validação explícitas. Na segunda tentativa, se PASS → commit. Se FAIL novamente → `retry_exhausted`:

```json
{
  "ok": false,
  "error": { "code": "retry_exhausted" },
  "retry_remaining": 0
}
```

Scout persiste com `status: "error"`. `@deyvin` informa o usuário e oferece handoff manual para `/aioson:agent:architect` se necessário.

---

## 3. Cap exceeded

O agente despachará um 4º scout na mesma sessão, mas o default é 3:

```bash
aioson scout:prep --question="..." --scope-paths="..." --parent-agent=deyvin --parent-session-id=sess-abc123 --parent-session-excerpt="..."
# exit 2
```

Saída:

```json
{
  "ok": false,
  "error": {
    "code": "cap_exceeded",
    "message": "max_scouts_per_session=3 reached for parent_session_id=sess-abc123",
    "remediation": "Either fold scout findings into a single answer, or open a new session, or override .aioson/config/scout-engine.json"
  }
}
```

`@deyvin` superfície a mensagem e pergunta ao usuário como prosseguir: normalmente handoff para `/aioson:agent:architect` se os surveys continuarem se multiplicando.

Para aumentar o limite no projeto:

```json
// .aioson/config/scout-engine.json
{ "max_scouts_per_session": 5 }
```

---

## 4. Escopo muito grande

```bash
aioson scout:prep \
  --question="..." \
  --scope-paths="src/" \  # diretório com 30+ arquivos
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="..."
# exit 2
```

Saída:

```json
{
  "ok": false,
  "error": {
    "code": "scope_too_large",
    "message": "scope resolved to 34 files, max_files_in_scope=20",
    "remediation": "Narrow scope_paths to specific files, or increase max_files_in_scope in scout-engine.json"
  }
}
```

Solução: especificar arquivos concretos em vez de diretório, ou ajustar `max_files_in_scope` no config.

> **Nota:** diretórios em `scope_paths` expandem apenas 1 nível de profundidade (filhos diretos). `scope_globs` está adiado para V2.

---

## 5. Ver scouts despachados no projeto

```bash
aioson memory:summary .
```

Saída (trecho relevante):

```
Scouts dispatched: 4 (top topics: "workflow state", "handoff contract")
```

Para inspecionar diretamente:

```bash
ls .aioson/runtime/scouts/
# scout-feature-a-2026-05-14-a1b2c3.json
# scout-2026-05-13-x9y8z7.json
# .state.json
```

---

## 6. Usar o fallback CLI-less (sem `aioson` instalado)

Em ambientes sem o binário `aioson` (ex: Claude Code puro sem CLI configurado), `@deyvin` usa o template inline do seu prompt. A seção "Sub-task scout invocation — CLI-less fallback" no `deyvin.md` descreve como construir o prompt manualmente e injetar no sub-agente via Agent tool.

O fallback produz o mesmo relatório JSON, mas sem:
- Validação de caps
- Telemetria em SQLite
- Archival automático no `feature:close`

---

## 7. Verificar arquivamento após feature:close

Após `aioson feature:close --slug=my-feature --verdict=PASS`:

```bash
ls .aioson/context/features/my-feature/scouts/
# scout-my-feature-2026-05-14-a1b2c3.json

grep "Sub-task scouts" .aioson/context/features/my-feature/dossier.md
# ## Sub-task scouts
# - scout-my-feature-2026-05-14-a1b2c3: "Por que workflow:next herda..."
```

O runtime copy permanece em `.aioson/runtime/scouts/` e será podado pelo `doctor --fix` após 90 dias. Scouts com `feature_slug` definido **nunca** são podados — preservação de memória de cold-load.

---

## Continue lendo

- [Referência CLI](./comandos-cli.md) — todos os flags documentados
- [Diagramas](./diagramas.md) — fluxo visual completo
- [Troubleshooting](./troubleshooting.md) — problemas conhecidos
