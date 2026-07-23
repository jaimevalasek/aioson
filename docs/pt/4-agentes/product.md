# @product — Dono do PRD

> **Para quem é:** quem já decidiu construir uma feature e precisa transformar intenção em escopo aprovado e critérios verificáveis.

## Para que serve

`@product` é o dono do único PRD da feature: `.aioson/context/prd-{slug}.md`. Ele consolida briefing, feedback do Briefing Refiner, planos externos e decisões do usuário sem criar especificações paralelas.

O PRD registra:

- problema, usuários e resultado observável;
- capacidades e exclusões;
- encaixe de cada capacidade no comportamento e código atuais;
- critérios de aceitação concretos;
- riscos e decisões de produto;
- `product_scope: approved` e `prd_ready: approved` quando a feature está pronta para planejamento.

Também registra o vínculo do protótipo de forma exclusiva:

- `current`: somente quando PRD, pasta `.aioson/briefings/{slug}/` e `feature` do manifesto têm o mesmo slug;
- `none`: quando a feature não tem protótipo próprio; caminhos antigos aparecem apenas como referências históricas excluídas.

Um protótipo continua pertencendo à sua feature depois que ela é fechada. Product não pode encontrá-lo por busca global e vinculá-lo silenciosamente a uma nova feature.

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

Com autopilot habilitado, Product aplica o encaixe recomendado quando evidência do repositório, compatibilidade ou correção tornam a escolha objetiva e entrega a próxima etapa determinística. Sheldon só entra quando foi escolhido; caso contrário, o próximo agente é Planner.

Isso não cria uma confirmação básica nova. O autopilot pausa apenas quando as alternativas mudam materialmente comportamento, escopo, custo, dados, segurança ou risco, e nunca executa `feature:close`, commit, publish, deploy ou release sem autorização.

A resolução de protótipo segue a mesma regra: vínculo próprio válido vira `current`; protótipo ausente, de outra feature ou de feature fechada vira `none` com exclusão explícita. Product informa essa decisão no chat e continua. Só pausa se o usuário quiser transformar o protótipo histórico em nova autoridade, o que exige um novo artefato na pasta da feature atual.

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
