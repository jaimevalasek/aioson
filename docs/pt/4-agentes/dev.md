# @dev — Implemente a feature seguindo a spec

> **Para quem é:** quem quer que a IA implemente código depois que o planejamento está feito.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:**
> - Como `@dev` usa os artefatos dos agentes anteriores
> - O ciclo autônomo QA→Dev e como o `dev-resume` funciona

---

## Para que serve

Você passou pela autoridade única de spec (`@sheldon` no SMALL ou `@orchestrator` no MEDIUM) — a spec existe, as decisões técnicas estão em disco, o plano de implementação está faseado e o contrato de harness está aprovado. Agora é hora de escrever código — mas de forma que o próximo agente (`@qa`, `@validator`) consiga verificar o que foi feito sem perguntar "o que você implementou?".

`@dev` lê os artefatos, implementa fase por fase, e grava um `dev-state.md` com o resumo do que foi feito, quais arquivos foram tocados, e qual é o próximo passo. Isso é o que permite continuar de onde parou em outra sessão, sem depender do histórico de chat.

**Loop de fases:** `@dev` executa o plano faseado como um loop automático:
1. Implementa a fase atual.
2. Roda `aioson harness:check` (gate por fase).
3. Executa **verificação por fase** (sub-agente leve, ex.: `qa` num modelo barato) — o relatório substitui o "continue?".
4. Corrige os pontos encontrados dentro da mesma fase.
5. **Compacta o contexto** antes de avançar.
6. Passa para a próxima fase sem precisar de aprovação manual.

O **Runtime smoke completo** (build + migrations em DB real + boot + happy-path) roda **uma vez ao fim da feature** — não por fase. Verificação por fase é suprimida no MICRO para economizar tokens.

**Regra dura de contexto:** ele carrega no máximo 5 arquivos antes de escrever a primeira linha de código. Se precisar de mais, para e pergunta o que priorizar. Isso evita "contexto inchado" que leva a decisões confusas.

---

## Quando invocar

- Após `@sheldon` (SMALL — lane lean padrão) ou `@orchestrator` (MEDIUM — lane maestro).
- Após `@product` (MICRO — sem fase de spec).
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
| SMALL | `project.context.md` + pacote de spec do `@sheldon` (`requirements-{slug}.md` + `implementation-plan-{slug}.md`) |
| MEDIUM | `project.context.md` + pacote de spec do `@orchestrator` (`implementation-plan-{slug}.md` + `harness-contract.json`) |
| Retomada | Apenas o `context_package` do `dev-state.md` |

**Nunca carrega** arquivos de outros agentes (`.aioson/agents/`), specs de outras features, ou mais de 5 arquivos antes do primeiro código.

**Inputs de UI (modo feature):** quando o PRD tem `## Prototype reference`, o `@dev` reproduz as telas e interações do `prototype.html`; e quando `design_skill: interface-design` e existe um `identity.md` (`.aioson/briefings/{slug}/identity.md`, senão `.aioson/context/identity.md`), ele o lê como input visual ao lado da referência de protótipo — é a identidade extraída das suas imagens de referência, e o `@dev` não entrega visual genérico enquanto ela existir.

---

## Detalhes recentes

**Ciclo autônomo QA→Dev (cap 3):** quando o `@qa` encontra falhas pequenas (testes falhando, AC não atendido), ele pode enviar correções diretamente ao `@dev` sem você precisar reativar manualmente. O ciclo se repete no máximo 3 vezes (`agentic_policy.review_cycle`, configurável). Ao esgotar as tentativas, ele sobe para você decidir.

**dev-resume helper:** se o `dev-state.md` existe mas está inconsistente com o código (drift detection), o `@dev` detecta a divergência e te avisa antes de continuar.

---

## Modo de execução: autopilot

- `/dev --auto`: arma o autopilot a partir daqui mesmo sem flag/esquema prévio — a implementação e o ciclo de revisão pós-dev (`@qa` → `@tester`/`@pentester` quando o trigger dispara → `@validator`) rodam sozinhos até a recomendação de `feature:close`.
- `/dev --step`: desarma o autopilot **só para esta feature** — para no handoff `@dev → @qa` mesmo em projeto com `auto_handoff: true`. Uma escolha por feature sempre vence a flag do projeto.
- Sem token: segue o esquema/flag já ativo, se houver.

Veja [Autopilot Handoff](../5-referencia/autopilot-handoff.md) para a cadeia completa e as condições de parada.

---

## Opção `--help`

Uma ativação com `--help` (`/dev --help`) imprime um resumo rápido — o que faz, quando usar, opções, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

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

- **Vem de:** `@sheldon` (SMALL) · `@orchestrator` (MEDIUM) · `@product` (MICRO)
- **Vai para:** `@pentester` (MEDIUM, inline) → `@qa`; ou direto `@qa` (SMALL/MICRO)

---

## Próximo passo

- [Ficha do @qa](./qa.md) — valida o que `@dev` implementou
- [Ficha do @deyvin](./deyvin.md) — pair-programming em cima do trabalho do `@dev`
- [Glossário: dev-state, Dossier, Handoff](../1-entender/glossario.md)
