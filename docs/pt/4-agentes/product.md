# @product — Dono do PRD

> **Para quem é:** quem já decidiu construir uma feature e precisa transformar intenção em escopo aprovado e critérios verificáveis.

## Para que serve

`@product` é o dono do único PRD da feature: `.aioson/context/prd-{slug}.md`. Ele consolida briefing, feedback do Briefing Refiner, planos externos e decisões do usuário sem criar especificações paralelas.

O PRD registra:

- problema, usuários e resultado observável;
- capacidades e exclusões;
- critérios de aceitação concretos;
- riscos e decisões de produto;
- `product_scope: approved` e `prd_ready: approved` quando a feature está pronta para planejamento.

MICRO, SMALL e MEDIUM mudam o detalhe do PRD, não o próximo estágio canônico.

## Quando invocar

- Para iniciar uma feature com direção de produto já razoavelmente clara.
- Depois de `@briefing` e, opcionalmente, `@briefing-refiner`.
- Quando existem planos externos em `plans/` que precisam virar um PRD governado.
- Para revisar escopo, ACs ou exclusões antes do planejamento.

Se a tarefa já é um resultado técnico delimitado, reutiliza fronteiras existentes e cabe no orçamento de Simple Plan, `@dev` pode tratar diretamente sem abrir uma feature rastreada.

## Sheldon é opcional

Depois de aprovar o PRD, você pode:

```text
@product → @planner
```

ou pedir uma revisão crítica:

```text
@product → @sheldon → @planner
```

Sheldon enriquece o mesmo PRD. Não cria outro requirements/spec/plano.

## Autopilot

Com autopilot habilitado, Product entrega a próxima etapa determinística. Sheldon só entra quando foi escolhido; caso contrário, o próximo agente é Planner.

O autopilot nunca remove perguntas reais de produto e nunca executa `feature:close`, commit, publish, deploy ou release sem autorização.

## Saída principal

| Artefato | Dono | Consumidores |
|---|---|---|
| `.aioson/context/prd-{slug}.md` | `@product` | `@sheldon`, `@planner`, `@dev`, `@qa` |

Dossiês, pesquisas e pareceres de especialistas são contexto auxiliar. O PRD continua sendo a autoridade de escopo.

## Handoff típico

- **Vem de:** `@briefing-refiner`, `@briefing`, `@setup` ou pedido direto.
- **Vai para:** `@sheldon` quando enriquecimento foi escolhido; caso contrário, `@planner`.

## Veja também

- [Da ideia ao PRD via briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md)
- [Ficha do @sheldon](./sheldon.md)
- [Ficha do @planner](./planner.md)
- [Autopilot Handoff](../5-referencia/autopilot-handoff.md)
