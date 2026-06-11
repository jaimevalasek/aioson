# @forge-run — Compile e execute o workflow da Lane B (verificação executável)

> **Para quem é:** quem tem uma feature MEDIUM com contrato binário e plano por waves, e quer rodar todo o ciclo de execução verificável em um único workflow compilado.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que é a Lane B e por que ela é **opt-in** e **aditiva**
> - O protocolo: `forge:compile` → revisão com você → execução → relatório
> - Por que `@forge-run` nunca enfraquece uma verificação nem fecha a feature

---

## Para que serve

A lane padrão de verificação executável (`@scope-check` → `@dev` → `@qa` → `@validator`) continua **inalterada** e é o caminho recomendado. O `@forge-run` é uma **segunda lane (Lane B), opcional e aditiva**: ele compila os artefatos de uma feature MEDIUM num único **workflow versionável** e roda o ciclo inteiro de verificação determinística de ponta a ponta.

Em vez de avançar etapa a etapa manualmente, `@forge-run` gera `.aioson/plans/{slug}/forge-run.workflow.js` — um script de dynamic workflow do Claude Code — e o executa via runtime de workflows. A estrutura compilada reflete o roadmap de verificação executável:

- **`parallel()` por Wave** — fases na mesma wave são disjuntas em arquivos e rodam em paralelo (ver coluna `Wave` do [@pm](./pm.md)).
- **Loop determinístico sobre `harness:check`** — limitado pelo `error_streak_limit` do governor; fixes são sequenciais.
- **Revisão adversarial de 3 lentes** — para os critérios que não têm `verification` (e portanto não podem ser checados mecanicamente).
- **Validador em contexto fresco** — fecha pelo ciclo `apply-validation` (ver [@validator](./validator.md)).

**Regra dura:** uma feature por run. `@forge-run` nunca roda `feature:close` nem publica.

---

## Quando invocar

- Feature **MEDIUM** com `harness-contract.json` contendo `verification` por critério (autorado pelo [@sheldon](./sheldon.md)).
- Plano de implementação com a coluna `Wave` preenchida (produzido pelo [@pm](./pm.md)).
- `aioson spec:analyze` limpo (sem `errors`) — pré-condição do gate de execução.
- Quando você quer rodar todo o ciclo de verificação executável como um único workflow reproduzível e versionável.

---

## Quando NÃO invocar

- Features MICRO ou SMALL → use a lane padrão (`@dev` → `@qa` → `@validator`).
- Contrato sem critérios executáveis, ou plano sem Wave → os preflights duros recusam compilar.
- `spec:analyze` com `errors` ou `wave_file_overlap` → resolva antes; a Lane B não compila por cima de drift.
- Você quer apenas validar, não executar → use `@validator` diretamente.

---

## Inputs obrigatórios

A Lane B só compila quando todos os pré-requisitos estão presentes — caso contrário os preflights duros recusam:

- `.aioson/plans/{slug}/harness-contract.json` — contrato **válido**, com pelo menos um critério executável (`verification` presente).
- `implementation-plan-{slug}.md` — plano com a coluna `Wave` preenchida.
- `spec-analyze-{slug}.json` sem `errors` e sem `wave_file_overlap`.

---

## Diálogo típico

```
Você > @forge-run

@forge-run > Feature: checkout-stripe (MEDIUM)

             Preflight da Lane B:
             - harness-contract.json válido ✓
             - 5 critérios, 4 com verification (executáveis) ✓
             - implementation-plan com coluna Wave ✓
             - spec:analyze → ok, sem errors, sem wave_file_overlap ✓

             $ aioson forge:compile . --feature=checkout-stripe
             Compilado: .aioson/plans/checkout-stripe/forge-run.workflow.js

             Estrutura do workflow:
             - Wave 1 (parallel): backend + migrations
             - Wave 2: frontend
             - Loop harness:check (limite error_streak: 3, fixes sequenciais)
             - Revisão adversarial de 3 lentes para C5 (sem verification)
             - Validador fresh-context → apply-validation

             ⚠ Custo: este workflow roda múltiplas execuções de LLM.
             Revise o script antes de executar. Aprovar execução? (s/n)

Você > s

@forge-run > Executando via runtime de workflows...
             Wave 1 ✓  Wave 2 ✓
             harness:check → 4/4 critérios executáveis PASS
             Revisão adversarial C5 → PASS
             Validador fresh-context → overall_score: 1

             RESULTADO: PASS
             Recomendação: rode `aioson feature:close` manualmente.
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/plans/{slug}/forge-run.workflow.js` | Workflow compilado e versionável (dynamic workflow do Claude Code) |
| `.aioson/plans/{slug}/last-check-output.json` | Último resultado do `harness:check` consumido pelo loop |
| `.aioson/plans/{slug}/last-validator-output.json` | Veredicto do validador fresh-context |
| `.aioson/plans/{slug}/progress.json` | Estado pós-execução (`circuit_state`, `ready_for_done_gate`) |

O código gerado é determinístico por construção: metadados literais, sem `Date.now`/`Math.random`, texto sempre via `JSON.stringify`, e **nunca** invoca `feature:close`.

---

## Como ele lê seu projeto

- `.aioson/plans/{slug}/harness-contract.json` — contrato e critérios com `verification`
- `.aioson/context/implementation-plan-{slug}.md` — plano com coluna `Wave`
- `.aioson/plans/{slug}/spec-analyze-{slug}.json` — consistência cross-artefato (gate de execução)
- `.aioson/plans/{slug}/progress.json` — estado e `error_streak_limit` do governor

---

## Comandos CLI relacionados

```bash
# Compila os artefatos da feature no workflow da Lane B
aioson forge:compile . --feature={slug}

# (saída parseável)
aioson forge:compile . --feature={slug} --json
```

---

## Regras duras

- **Nunca** passa por cima de um preflight que falhou (contrato inválido, zero critério executável, plano sem Wave, `errors` ou `wave_file_overlap` do `spec:analyze`).
- **Nunca** enfraquece ou remove uma checagem de `verification` para fazer um critério passar.
- **Nunca** roda `feature:close` nem publica — isso é sempre decisão humana.
- Uma feature por run.

---

## Handoff típico

- **Vem de:** entrada opt-in pelo usuário (Lane B); pressupõe `@sheldon`, `@pm` e `@scope-check`/`spec:analyze` já concluídos.
- **PASS:** recomenda que o **humano** rode `aioson feature:close` manualmente.
- **FAIL:** volta ao `@dev` pela **lane normal** para corrigir e re-verificar.

---

## Próximo passo

- [Ficha do @pm](./pm.md) — produz a coluna `Wave` que vira `parallel()` no workflow
- [Ficha do @sheldon](./sheldon.md) — autora o campo `verification` por critério
- [Ficha do @validator](./validator.md) — o validador fresh-context que fecha o ciclo
