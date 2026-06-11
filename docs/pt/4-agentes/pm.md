# @pm — Backlog, user stories e plano de implementação (MEDIUM)

> **Para quem é:** quem trabalha em features ou projetos MEDIUM e precisa transformar requisitos em histórias de usuário priorizadas e num plano de implementação aprovável.
> **Tempo de leitura:** 3 min.
> **O que você vai saber:**
> - Quando `@pm` é obrigatório e quando é dispensável
> - Os dois contextos onde ele aparece (feature workflow e projeto)
> - O que ele produz em no máximo 2 páginas

---

## Para que serve

Em projetos MEDIUM, a quantidade de requisitos pode crescer ao ponto de o `@dev` não saber o que implementar primeiro, ou implementar tudo ao mesmo tempo e não terminar nada. `@pm` existe para **priorizar, sequenciar e deixar os ACs testáveis** — sem reescrever o que `@product` já decidiu.

Sua regra interna de ouro: máximo 2 páginas. Se o output excede isso, ele está fazendo mais do que deveria. Corta.

---

## Dois contextos de ativação

### 1. Feature workflow MEDIUM (pré-dev — v1.22.0+)

No workflow de feature MEDIUM, `@pm` aparece logo antes do `@dev` — após `@discovery-design-doc` e antes do `@scope-check` pré-dev. Aqui sua responsabilidade é produzir o `implementation-plan-{slug}.md` (Gate C) que o `@dev` precisa para começar.

```
@analyst → @scope-check → @architect → @discovery-design-doc → @pm → STOP → /dev
```

O Gate C só é aprovado com o plano pronto. Se o `@pm` for pulado em features MEDIUM, o `gate:check --gate=C` vai bloquear o `@dev`.

### 2. Projeto MEDIUM (modo tradicional)

Para o projeto completo (configuração inicial), `@pm` entra após `@ux-ui` e antes de `@orchestrator` — priorizando e sequenciando as histórias do backlog.

---

## Quando invocar

- Features MEDIUM (obrigatório no workflow — produz Gate C).
- Projetos MEDIUM, após `@ux-ui` e antes de `@orchestrator`.
- Quando a feature é grande o suficiente para ter múltiplas histórias de usuário independentes.
- Quando você quer sequenciar entregas por prioridade (ex: MVP → iteração 2).

---

## Quando NÃO invocar

- Projetos MICRO → `@dev` lê o contexto direto.
- Features e projetos SMALL → desnecessário na maioria dos casos.
- Você quer refinar produto, não backlog → use `@product`.

---

## Diálogo típico

```
Você > @pm

@pm > Lendo prd-checkout-stripe.md, architecture.md e ui-spec.md...
      
      User stories priorizadas:
      
      P1 — Fluxo crítico (MVP)
      - US-01: Como cliente, posso inserir meus dados de cartão e finalizar compra
        AC: formulário valida em tempo real · POST /checkout retorna 200 com order_id
      - US-02: Como cliente, vejo confirmação após pagamento aprovado
        AC: redirect para /checkout/success com número do pedido
      
      P2 — Tratamento de erro
      - US-03: Como cliente, vejo mensagem clara se cartão recusar
        AC: resposta Stripe CARD_DECLINED → mensagem amigável em tela, sem reload
      
      Fora de escopo desta iteração: webhooks de estorno, emails de recibo.
      
      tasks.md criado em .aioson/context/tasks.md
      Próximo: @orchestrator.
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/tasks.md` | User stories priorizadas com ACs testáveis |

---

## Como ele lê seu projeto

- `.aioson/context/prd.md` ou `prd-{slug}.md` — **base do produto; nunca reescreve**
- `.aioson/context/discovery.md`, `architecture.md`, `ui-spec.md`
- `.aioson/rules/` — regras com `agents: pm`

---

## Comandos CLI relacionados

```bash
# Estado do workflow — confirmar posição do @pm
aioson workflow:status .
```

---

## Handoff típico

**Feature MEDIUM (pré-dev):**
- **Vem de:** `@discovery-design-doc`
- **Produz:** `implementation-plan-{slug}.md` (Gate C)
- **Vai para:** STOP — desenvolvedor faz `/clear` e ativa `/dev`

**Projeto MEDIUM (modo completo):**
- **Vem de:** `@ux-ui`
- **Vai para:** `@orchestrator`

---

## Próximo passo

- [Ficha do @orchestrator](./orchestrator.md)
- [Ficha do @dev](./dev.md) — quem executa as histórias
- [Autopilot Handoff](../5-referencia/autopilot-handoff.md) — como `@pm` se encadeia automaticamente quando `auto_handoff: true`
