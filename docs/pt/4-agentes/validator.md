# @validator — Gate final: a feature está realmente pronta?

> **Para quem é:** equipes que usam contratos binários de sucesso (harness-contract) e querem um veredicto imparcial antes de fechar uma feature.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - O que é um harness-contract e como `@validator` o verifica
> - Por que ele nunca lê o histórico de outros agentes

---

## Para que serve

O `@qa` valida comportamento. O `@validator` valida **se o contrato binário foi cumprido** — critérios objetivos do tipo "arquivo X existe", "teste Y passa", "API retorna Z". Ele é o gatekeeper final que decide se a feature pode ser marcada como concluída.

A distinção deliberada: ele opera em **sandbox de contexto**. Não lê histórico de chat de `@dev`, `@analyst`, ou `@architect`. Lê apenas o contrato (`harness-contract.json`), o estado atual (`progress.json`), e o output de ferramentas (linters, test runners). Isso garante imparcialidade — ele não "sabe" o que foi prometido no chat, só o que o contrato exige.

Seu output é sempre um JSON estruturado com `overall_score: 1` (todos passaram) ou `overall_score: 0` (algum critério falhou).

---

## Quando invocar

- Após `@qa`, quando a feature usa um `harness-contract.json`.
- Quando você quer um veredicto independente antes do `feature:close`.
- Em pipelines automatizados onde precisa de um resultado parseável.

---

## Quando NÃO invocar

- A feature não tem `harness-contract.json` → use apenas `@qa`.
- Você quer sugestões de melhoria → `@validator` não dá sugestões, só verifica.
- Você quer revisão de código ou arquitetura → use `@sheldon`.

---

## Diálogo típico

```
Você > @validator

@validator > Localizando harness-contract.json para feature checkout-stripe...
             Encontrado em .aioson/plans/checkout-stripe/harness-contract.json
             
             Critérios binários (5):
             C1: src/models/payment.js existe
             C2: db/migrations/add-payment-table.sql existe
             C3: npm test → 0 falhas
             C4: POST /checkout retorna 201 (smoke test)
             C5: dev-state.md status = "implemented"
             
             Verificando...
             C1: PASS — ls src/models/payment.js ✓
             C2: PASS — ls db/migrations/add-payment-table.sql ✓
             C3: PASS — npm test → 4 passed, 0 failed ✓
             C4: PASS — curl POST /checkout → 201 ✓
             C5: PASS — status: "implemented" ✓
             
             {
               "overall_score": 1,
               "ready_for_done_gate": true
             }
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/plans/{slug}/last-validator-output.json` | Veredicto JSON emitido pelo agente — consumido pelo `harness:apply-validation` |
| `.aioson/plans/{slug}/validator-runs/{ISO}.json` | Arquivamento dos veredictos consumidos (após apply) |
| `.aioson/plans/{slug}/progress.json` | Estado pós-aplicação: `last_error`, `ready_for_done_gate`, `circuit_state` |

---

## Como ele lê seu projeto

Apenas e exclusivamente:
- `.aioson/plans/{slug}/harness-contract.json` — o contrato
- `.aioson/plans/{slug}/progress.json` — estado atual dos steps
- Arquivos listados em `progress.json.completed_steps`
- Output de ferramentas locais (linter, test runner, compilador)

**Nunca lê:** histórico de outros agentes, PRDs, requirements, architecture, ou código de outras features.

---

## Handoff típico

- **Vem de:** `@qa` (recomenda `@validator` no relatório quando `harness-contract.json` existe).
- `aioson workflow:next` também roteia automaticamente para `@validator` (como detour) quando `progress.json.status === 'waiting_validation'`.
- **Vai para:** `aioson feature:close` — bloqueado se `ready_for_done_gate !== true` (libera com `--force` em emergência).

---

## Como rodar (modo CLI/headless)

```bash
# 1. Gera o prompt do validator em .aioson/plans/{slug}/validator-prompt.txt
aioson harness:validate . --slug={slug}

# 2. Você roda esse prompt no LLM (Claude Code, Codex, etc.) e salva
#    o JSON do output em .aioson/plans/{slug}/last-validator-output.json

# 3. Consome o JSON, atualiza progress.json, arquiva o output:
aioson harness:apply-validation . --slug={slug}
# ou simplesmente re-executar harness:validate (router auto-detecta o output)
```

Em CI: pular o passo manual emitindo o prompt para um runner de LLM externo, salvando o JSON no path padrão e chamando `apply-validation`.

---

## Próximo passo

- [Ficha do @qa](./qa.md) — antecede o validator
- [Glossário: Harness, Done Gate](../1-entender/glossario.md)
