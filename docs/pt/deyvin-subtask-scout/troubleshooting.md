# Troubleshooting — Sub-task Scout

---

## Cap exceeded (`cap_exceeded`)

**Sintoma:** `aioson scout:prep` retorna exit 2 com `error.code = "cap_exceeded"`.

**Por que acontece:** o `parent_session_id` já despacharam `max_scouts_per_session` scouts nesta sessão (default: 3).

**Soluções:**

1. **Consolidar scouts** — combine perguntas relacionadas num único scout com escopo mais amplo.
2. **Nova sessão** — inicie uma nova sessão (novo `parent_session_id`); caps são por sessão, não por projeto.
3. **Aumentar o limite** no projeto:

```json
// .aioson/config/scout-engine.json
{ "max_scouts_per_session": 5 }
```

Se a taxa de `cap_exceeded` passar de 5% em uso real, os defaults estão apertados — ajuste.

---

## Escopo muito grande (`scope_too_large`)

**Sintoma:** `aioson scout:prep` retorna `error.code = "scope_too_large"`.

**Por que acontece:** `scope_paths` resolveu para mais de `max_files_in_scope` arquivos (default: 20).

**Soluções:**

1. **Especificar arquivos concretos** em vez de diretórios:
   ```bash
   # em vez de:
   --scope-paths="src/"
   # use:
   --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js"
   ```

2. **Aumentar o limite** no projeto:
   ```json
   { "max_files_in_scope": 30 }
   ```

> Diretórios em `scope_paths` expandem apenas 1 nível de profundidade (filhos diretos). `scope_globs` está adiado para V2.

---

## JSON malformado do sub-agente (`schema_invalid`)

**Sintoma:** `aioson scout:validate` retorna exit 2 com `error.code = "schema_invalid"`.

**Por que acontece:** o sub-agente não produziu JSON válido contra o `OUTPUT_SCHEMA`. Pode ser:
- Campo obrigatório faltando (`parent_session_excerpt`, `confidence`, `recommendation`)
- `confidence` com valor inválido (deve ser `high`, `medium`, ou `low`)
- `evidence` ou `explanation` excedendo os limites de caracteres (200 e 300 respectivamente)
- Chaves extras (schema tem `additionalProperties: false`)

**Solução:** re-prompta o sub-agente com o erro exato:

```
Sua saída anterior falhou na validação:
- findings[0].evidence: campo obrigatório ausente
- confidence: deve ser um de: high, medium, low

Reexecute e produza JSON válido conforme o schema.
```

Você tem 1 retry (`max_retries_on_malformed_json=1`). Se o segundo também falhar, o scout fica com `status: "error"` e `@deyvin` precisa lidar manualmente (handoff ou resposta direta).

---

## Retry exhausted (`retry_exhausted`)

**Sintoma:** `aioson scout:validate` retorna `error.code = "retry_exhausted"`.

**Por que acontece:** o sub-agente falhou na validação duas vezes seguidas (prep + 1 retry).

**O que fazer:**

1. O scout foi persistido com `status: "error"` em `.aioson/runtime/scouts/{id}.json`.
2. `@deyvin` informa o usuário e oferece handoff para `/aioson:agent:architect` ou resposta direta com o que já sabe.
3. Para aumentar os retries: `{ "max_retries_on_malformed_json": 2 }` no config (raramente necessário — se acontece frequentemente, o prompt template precisa de ajuste).

---

## Harness sem suporte a sub-agentes (`harness_unsupported`)

**Sintoma:** OpenCode não suportam o Agent tool / sub-agent nativamente.

**O que acontece:** `scout:prep` retorna normalmente, mas o harness emite `harness_unsupported` ao tentar despachar o sub-agente.

**Solução:** use o fallback CLI-less embutido no `deyvin.md`. A seção "Sub-task scout invocation — CLI-less fallback" descreve como construir o prompt manualmente e usar o Agent tool diretamente no Claude Code, ou como adaptar para o harness disponível.

O fallback produz o mesmo relatório JSON, mas sem caps, telemetria ou archivamento automático.

---

## Lock preso no state file

**Sintoma:** `aioson scout:prep` (ou `scout:commit`) trava por mais de 30s.

**Por que acontece:** `.aioson/runtime/scouts/.state.json.lock` existe com PID de um processo morto.

**Solução:**

```bash
# Verificar se o PID ainda está vivo
cat .aioson/runtime/scouts/.state.json.lock
# { "pid": 12345, "lockedAt": "2026-05-14T10:00:00.000Z" }

# Se o processo não existe mais, remover manualmente:
rm .aioson/runtime/scouts/.state.json.lock
```

O lock é declarado stale automaticamente após 30s — na próxima operação CLI, será sobrescrito sem intervenção.

---

## `parent_session_excerpt` bloqueado

**Sintoma:** `aioson scout:prep` retorna `error.code = "input_invalid"` com `field: "parent_session_excerpt"`.

**Por que acontece:** o campo é obrigatório (não pode ser omitido ou menor que 50 chars).

**Por que existe:** agentes futuros lendo o scout arquivado em cold-load precisam reconstruir o contexto sem histórico de conversa. O `parent_session_excerpt` é o único campo que explica o WHY.

**Solução:** passe um excerpt informativo da sessão pai (50-1000 chars):

```bash
--parent-session-excerpt="Usuário reportou bug onde workflow:next herda featureSlug anterior em novos handoffs; investigando loadOrCreateState em workflow-next.js"
```

---

## Scouts órfãos acumulando em `.aioson/runtime/scouts/`

**Sintoma:** `aioson doctor .` reporta advisory `scouts_directory_pruning` com scouts antigos sem `feature_slug`.

**O que são:** scouts despachados sem `--feature-slug` ou de features já fechadas cujo `feature_slug` não corresponde a nenhuma feature em `features.md`.

**Solução:**

```bash
# Ver quais seriam podados
aioson doctor . --json | grep scouts_directory_pruning

# Podar (apaga scouts órfãos > 90d; NUNCA poda scouts com feature_slug)
aioson doctor . --fix
```

Para preservar um scout órfão manualmente antes da poda (ex: para auditoria futura), copie-o para fora do diretório de runtime ou associe-o a uma feature:

```bash
cp .aioson/runtime/scouts/{id}.json .aioson/context/features/{slug}/scouts/
```

---

## `aioson update` sobrescreve `scout-engine.json`

**Sintoma:** customizações em `.aioson/config/scout-engine.json` são perdidas após `aioson update`.

**Status:** comportamento atual do installer (M-01 follow-up — veja também o mesmo issue em `learning-loop.json`). A correção (merge inteligente) está em planejamento como feature MICRO.

**Workaround:** faça backup antes de rodar `aioson update`:

```bash
cp .aioson/config/scout-engine.json /tmp/scout-engine-backup.json
aioson update
# restaurar customizações manualmente
```

---

## `scope_globs` não implementado

**Sintoma:** `error.code = "globs_not_implemented_v1"` ao usar `--scope-globs`.

**Por que:** Node 18-21 não tem `fs.glob` nativo; adicionar dependência de glob quebraria a política zero-deps do V1.

**Workaround:** use `scope_paths` com arquivos explícitos ou diretórios (1 nível de expansão). Globs serão suportados em V2.
