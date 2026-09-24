# @product — Dono do PRD

> **Para quem é:** quem já decidiu construir uma feature e precisa transformar intenção em escopo aprovado e critérios verificáveis.

## Para que serve

`@product` é o dono do único PRD da feature: `.aioson/context/prd-{slug}.md`. Ele consolida briefing, feedback do Refiner, planos externos e decisões do usuário sem criar especificações paralelas.

O PRD registra:

- problema, usuários e resultado observável;
- capacidades e exclusões;
- regras de domínio (antes trabalho do `@analyst`) e decisões de interação que o protótipo não resolveu (antes parecer do `@ux-ui`);
- encaixe de cada capacidade no comportamento e código atuais;
- critérios de aceitação concretos;
- riscos e decisões de produto;
- `product_scope: approved` e `prd_ready: approved` quando a feature está pronta para planejamento.

Também registra o vínculo do protótipo de forma exclusiva:

- `current`: somente quando PRD, pasta `.aioson/briefings/{slug}/` e `feature` do manifesto têm o mesmo slug;
- `none`: quando a feature não tem protótipo próprio; caminhos antigos aparecem apenas como referências históricas excluídas.

Um protótipo continua pertencendo à sua feature depois que ela é fechada. Product não pode encontrá-lo por busca global e vinculá-lo silenciosamente a uma nova feature.

E registra a segunda metade do contrato visual, resolvida de forma independente do protótipo: `identity` / `identity_status`, com três estados legítimos —

- `current`: registro extraído próprio da feature, em `.aioson/briefings/{slug}/identity.md`;
- `project`: registro de marca compartilhado do projeto, em `.aioson/context/identity.md`;
- `none`: nenhum registro extraído; o motor de design roda intent-first.

Se o manifesto do protótipo aprovado declara de qual registro ele foi construído, o PRD precisa carregar o mesmo caminho — descartá-lo obriga a implementação a decidir de novo o sistema visual e é motivo de falha em `prototype:check`. Uma identidade de exploração nunca é vinculável: é não-canônica por contrato.

MICRO, SMALL e MEDIUM mudam o detalhe do PRD, não o próximo estágio canônico.

## Quando invocar

- Para iniciar uma feature com direção de produto já razoavelmente clara.
- Depois de `@briefing` e, opcionalmente, `@refiner`.
- Quando existem planos externos em `plans/` que precisam virar um PRD governado.
- Para revisar escopo, ACs ou exclusões antes do planejamento.

Se a tarefa já é um resultado técnico delimitado, reutiliza fronteiras existentes e cabe no orçamento de Simple Plan, `@dev` pode tratar diretamente sem abrir uma feature rastreada.

## Sheldon é a revisão obrigatória antes do Planner

Depois de aprovar o PRD, a rota obrigatória é:

```text
@product → @sheldon → @planner
```

Sheldon reabre as fontes, desafia lacunas em até duas passagens e sela o mesmo PRD com uma revisão PASS vinculada ao hash atual. Não cria outro requirements/spec/plano.

## Autopilot

Com autopilot habilitado, Product aplica o encaixe recomendado quando evidência do repositório, compatibilidade ou correção tornam a escolha objetiva e entrega a próxima etapa determinística. Sheldon só entra quando foi escolhido; caso contrário, o próximo agente é Planner.

Isso não cria uma confirmação básica nova. O autopilot pausa apenas quando as alternativas mudam materialmente comportamento, escopo, custo, dados, segurança ou risco, e nunca executa `feature:close`, commit, publish, deploy ou release sem autorização.

A resolução de protótipo segue a mesma regra: vínculo próprio válido vira `current`; protótipo ausente, de outra feature ou de feature fechada vira `none` com exclusão explícita. Product informa essa decisão no chat e continua. Só pausa se o usuário quiser transformar o protótipo histórico em nova autoridade, o que exige um novo artefato na pasta da feature atual.

## Qualidade de especificação (anti-slop)

Numa feature com superfície visível, Product consulta a lente `spec-quality` do brain de qualidade visual (`aioson brain:query . --agent=product --tags=spec-quality`). São três nós, e só eles: o PRD nunca herda os nós de layout, porque composição não é decisão de produto.

O teste de substituibilidade vale para o texto, não para a tela: removidos os substantivos de domínio da visão e do Capability Map, o que continuar lendo como completo é genérico e precisa ser reescrito sobre o objeto, a decisão e a evidência reais do produto. Uma superfície visível sem protótipo próprio e sem registro de identidade é uma lacuna nomeada com rota — extrair identidade, rodar exploração ou assumir originação intent-first com anti-goals declarados —, nunca um padrão neutro em silêncio. E as expectativas de estado material, disponibilidade de asset, movimento reduzido, performance e acessibilidade viram linhas `AC-*`: restrição que só existe em parágrafo não chega ao QA.

Product registra a restrição, nunca a composição. Layout, tokens e componentes continuam com o protótipo e com o engine de design.

## Saída principal

| Artefato | Dono | Consumidores |
|---|---|---|
| `.aioson/context/prd-{slug}.md` | `@product` | `@sheldon`, `@planner`, `@dev`, `@qa` |

Dossiês, pesquisas e pareceres de especialistas são contexto auxiliar. O PRD continua sendo a autoridade de escopo.

## Handoff típico

- **Vem de:** `@refiner`, `@briefing`, `@setup` ou pedido direto.
- **Vai para:** `@sheldon` quando enriquecimento foi escolhido; caso contrário, `@planner`.

## Veja também

- [Da ideia ao PRD via briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md)
- [Ficha do @sheldon](./sheldon.md)
- [Ficha do @planner](./planner.md)
- [Autopilot Handoff](../5-referencia/autopilot-handoff.md)
