# @dev — Implemente a feature seguindo a spec

> **Para quem é:** quem quer que a IA implemente código depois que o planejamento está feito.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:**
> - Como `@dev` usa os artefatos dos agentes anteriores
> - O ciclo autônomo QA→Dev e como o `dev-resume` funciona

---

## Para que serve

Você passou por `@product`, `@analyst`, `@architect` e, nos fluxos SMALL/MEDIUM atuais, por `@scope-check` antes de abrir implementação. A spec existe, as decisões técnicas estão em disco. Agora é hora de escrever código — mas de forma que o próximo agente (`@qa`, `@validator`) consiga verificar o que foi feito sem perguntar "o que você implementou?".

`@dev` lê os artefatos, implementa, e grava um `dev-state.md` com o resumo do que foi feito, quais arquivos foram tocados, e qual é o próximo passo. Isso é o que permite continuar de onde parou em outra sessão, sem depender do histórico de chat.

**Regra dura de contexto:** ele carrega no máximo 5 arquivos antes de escrever a primeira linha de código. Se precisar de mais, para e pergunta o que priorizar. Isso evita "contexto inchado" que leva a decisões confusas.

---

## Quando invocar

- Após `@scope-check` (SMALL/MEDIUM) ou `@product` (MICRO).
- Para retomar uma feature interrompida — `@dev` lê `dev-state.md` e sabe onde parou.
- Para correções apontadas pelo `@qa` (ciclo autônomo, até 2 iterações).

---

## Quando NÃO invocar

- A spec ainda não existe → volte para `@product`.
- Você quer revisar o código já escrito → use `@qa` ou `@sheldon`.
- Você quer pair-programming em cima de trabalho em andamento → use `@deyvin`.

---

## Diálogo típico (cold start)

```
Você > @dev

@dev > Verificando dev-state.md... não encontrado. Cold start.
       Lendo project.context.md... Node.js, SMALL, checkout-stripe.
       Lendo spec-checkout-stripe.md e implementation-plan-checkout-stripe.md...
       
       Scope-check aprovado. Implementando:
       
       1. db/migrations/add-payment-table.sql       ← Payment schema
       2. src/models/payment.js                     ← model com validação básica
       3. src/services/payment-service.js           ← lógica: criar cobrança Stripe
       4. src/routes/checkout.js                    ← POST /checkout
       
       [implementa...]
       
       Smoke test: node -e "require('./src/routes/checkout')" → OK
       
       dev-state.md atualizado:
         status: implemented
         files_touched: [db/migrations/..., src/models/..., src/services/..., src/routes/...]
         next_step: @qa
       
       Próximo: @qa.
```

## Diálogo típico (retomada via dev-resume)

```
Você > @dev

@dev > dev-state.md encontrado.
       Carregando context_package: spec-checkout-stripe.md, src/routes/checkout.js
       next_step: "adicionar webhook de confirmação Stripe"
       Retomando... [continua sem perguntas]
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/dev-state.md` | Status, arquivos tocados, próximo passo |
| Código implementado | onde `@architect` determinou |

---

## Como ele lê seu projeto

Depende do modo:

| Modo | O que carrega (máx. 5 arquivos) |
|---|---|
| MICRO | `project.context.md` + `prd-{slug}.md` |
| SMALL/MEDIUM | `project.context.md` + `spec-{slug}.md` + `implementation-plan-{slug}.md` |
| Retomada | Apenas o `context_package` do `dev-state.md` |

**Nunca carrega** arquivos de outros agentes (`.aioson/agents/`), specs de outras features, ou mais de 5 arquivos antes do primeiro código.

---

## Detalhes recentes

**Ciclo autônomo QA→Dev (cap 2, Mai 2026):** quando o `@qa` encontra falhas pequenas (testes falhando, AC não atendido), ele pode enviar correções diretamente ao `@dev` sem você precisar reativar manualmente. O ciclo se repete no máximo 2 vezes. Na terceira falha, ele sobe para você decidir.

**dev-resume helper:** se o `dev-state.md` existe mas está inconsistente com o código (drift detection), o `@dev` detecta a divergência e te avisa antes de continuar.

---

## Comandos CLI relacionados

```bash
# Ver estado atual do dev
cat .aioson/context/dev-state.md

# Verificar preflight antes de implementar
aioson preflight . --agent=dev --feature=checkout-stripe
aioson context:validate .

# Pedir resumo de memória das últimas sessões
aioson memory:summary . --last=5
```

---

## Handoff típico

- **Vem de:** `@scope-check` (SMALL/MEDIUM) ou `@product` (MICRO)
- **Vai para:** `@qa`

---

## Próximo passo

- [Ficha do @qa](./qa.md) — valida o que `@dev` implementou
- [Ficha do @deyvin](./deyvin.md) — pair-programming em cima do trabalho do `@dev`
- [Glossário: dev-state, Dossier, Handoff](../1-entender/glossario.md)
