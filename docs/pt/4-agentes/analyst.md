# @analyst — Descubra o domínio antes de implementar

> **Para quem é:** quem vai implementar uma feature e precisa saber exatamente o que existe no codebase e quais entidades estão envolvidas.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Qual o papel de `@analyst` no fluxo
> - Quais artefatos ele produz e como downstream os usa

---

## Para que serve

Implementar sem descobrir o domínio é como reformar um apartamento sem ver a planta: você pode quebrar uma parede que esconde encanamento.

`@analyst` lê a spec produzida por `@product` e mergulha no codebase para descobrir: quais entidades já existem, quais fluxos já estão implementados, quais regras de negócio estão implícitas no código. Ele produz um mapa de domínio que impede o `@dev` de duplicar entidades, criar conflitos de schema, ou ignorar regras que já existem.

Em projetos com `@discover` já rodado, o `@analyst` usa o cache semântico em vez de varrer o código todo — economizando muito contexto.

---

## Quando invocar

- Logo após `@product`, em fluxos SMALL e MEDIUM.
- Quando uma nova feature toca entidades existentes e você quer garantir que não há conflito.
- Quando alguém novo entra no projeto e precisa entender o domínio rapidamente.
- Quando a spec mudou e você quer sincronizar o mapeamento de domínio.

---

## Quando NÃO invocar

- Projeto MICRO sem novas entidades → o `@dev` lê o contexto direto.
- Você quer rever decisões técnicas (não de domínio) → invoke `@architect`.
- A feature não toca modelo de dados e não tem fluxos novos → pule direto para `@architect`.

---

## Diálogo típico

```
Você > @analyst

@analyst > Lendo prd-checkout-stripe.md e spec-checkout-stripe.md...
           Verificando se requirements-checkout-stripe.md já existe... não existe.
           
           Mapeando domínio...
           
           Entidades encontradas no codebase:
           - Customer { id, email, name, tier }      ← já existe em src/models/customer.js
           - Order { id, customer_id, total, status } ← já existe em src/models/order.js
           - Payment                                  ← NÃO existe — nova entidade necessária
           
           Fluxos mapeados:
           - Criação de pedido: Order ← Customer (many-to-one) ✓
           - Pagamento: Payment ← Order (one-to-one) — a implementar
           
           Regras de negócio detectadas no código:
           - Order.status aceita: ['pending','paid','cancelled'] — Payment deve respeitar isso
           
           Artefatos criados:
           - .aioson/context/requirements-checkout-stripe.md
           Próximo: @architect.
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/discovery.md` | Mapa de domínio geral do projeto (novo projeto) |
| `.aioson/context/requirements-{slug}.md` | Entidades, regras, edge cases da feature |
| `.aioson/context/architecture.md` | Contribuição de domínio (enriquecido junto com `@architect`) |

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — stack, classificação
- `.aioson/context/prd-{slug}.md` e `spec-{slug}.md` — escopo da feature
- `.aioson/context/bootstrap/` — cache semântico do `@discover` (se existir)
- `.aioson/rules/` — regras com `agents: analyst`
- Código-fonte diretamente (models, schemas, services) — quando não há cache

---

## Comandos CLI relacionados

```bash
# Verificar se requirements estão atualizados em relação ao PRD
aioson plan:stale . --feature=checkout-stripe

# Validar contexto antes de iniciar
aioson context:validate .
aioson workflow:status .
```

---

## Handoff típico

- **Vem de:** `@product`
- **Vai para:** `@architect`

---

## Próximo passo

- [Ficha do @architect](./architect.md)
- [O que é o cache do @discover](../1-entender/glossario.md#discover)
- [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
