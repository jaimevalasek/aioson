# @analyst — Consultoria de domínio

> **Para quem é:** quem tem uma dúvida concreta sobre entidades, regras de negócio ou fluxos existentes.

## Para que serve

`@analyst` investiga o domínio e o codebase para responder uma pergunta delimitada: quais entidades já existem, quais regras estão implícitas e onde um novo comportamento se conecta.

Ele não é um estágio automático de MICRO, SMALL ou MEDIUM. Também não precisa produzir um `requirements-{slug}.md` separado para toda feature.

## Quando invocar

- O PRD depende de uma regra de negócio que o codebase ainda não esclareceu.
- Uma feature toca entidades existentes e há risco de duplicação ou conflito.
- Product, Sheldon ou Planner pede uma análise de domínio específica.
- Um novo colaborador precisa de um mapa consultivo do domínio.

## Como o resultado entra no fluxo

O parecer atualiza o artefato dono da decisão:

- escopo ou AC → PRD;
- sequência/impacto de implementação → plano;
- detalhe local de código → notas do DEV.

O parecer pode ser salvo como memória auxiliar, mas não cria um gate canônico.

## Handoff típico

- **Vem de:** pedido explícito de Product, Sheldon, Planner, DEV ou usuário.
- **Vai para:** o dono do artefato que fez a pergunta.

## Veja também

- [Ficha do @product](./product.md)
- [Ficha do @planner](./planner.md)
