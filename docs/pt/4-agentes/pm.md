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

### 1. Feature workflow MEDIUM — sub-agente do `@orchestrator` (v1.35.0)

No workflow MEDIUM padrão (maestro lane), `@pm` é disparado pelo `@orchestrator` como parte do fan-out de spec. O `@orchestrator` consolida e verifica o plano produzido pelo `@pm` antes de passar para `@dev`.

```
@orchestrator fan-out: @analyst + @architect + @pm + @ux-ui → consolida → @dev
```

O Gate C (plano de implementação aprovado) é verificado pelo `@orchestrator` antes do handoff.

### 2. Detour opt-in (qualquer tamanho)

Quando você quer criar o backlog e plano de implementação manualmente, sem passar pelo `@orchestrator`, pode invocar `@pm` diretamente após a fase de spec. Útil quando o `@sheldon` (SMALL) produziu o plano mas você quer expandir as user stories.

### 3. Fluxo legado (escape hatch full-merged)

Para quem prefere gerenciar cada sub-agente manualmente no MEDIUM:

```
@analyst → @architect → @discovery-design-doc → @pm → @orchestrator (lanes only) → @dev
```

---

## Coluna `Wave` na Execution Sequence (v1.27.0+)

A tabela **Execution Sequence** do `implementation-plan-{slug}.md` ganhou a coluna `Wave`. Fases marcadas na **mesma wave** são **disjuntas em arquivos** (não tocam nos mesmos arquivos) e, portanto, **paralelizáveis** — é exatamente essa marcação que a Lane B do [@forge-run](./forge-run.md) compila em blocos `parallel()`.

A marcação é **conservadora**: na dúvida, o `@pm` deixa sequencial. Só agrupa na mesma wave quando tem certeza de que não há sobreposição de arquivos.

O `aioson spec:analyze` verifica a consistência das waves: mesma wave com arquivos sobrepostos dispara o warning `wave_file_overlap`, que o [@scope-check](./scope-check.md) trata como drift pré-computado.

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
- **Vai para:** STOP — desenvolvedor faz `/compact` e ativa `/dev` quando continuar a mesma feature; usa `/clear` só para reset forte

**Projeto MEDIUM (modo completo):**
- **Vem de:** `@ux-ui`
- **Vai para:** `@orchestrator`

---

## Próximo passo

- [Ficha do @orchestrator](./orchestrator.md)
- [Ficha do @dev](./dev.md) — quem executa as histórias
- [Autopilot Handoff](../5-referencia/autopilot-handoff.md) — como `@pm` se encadeia automaticamente quando `auto_handoff: true`
