# @architect — Consultoria de arquitetura

> **Para quem é:** quem precisa resolver uma decisão técnica material antes ou durante o planejamento.

## Para que serve

`@architect` compara opções de estrutura, integração, dados, dependências e fronteiras técnicas com evidência do repositório. Ele recomenda uma decisão e explicita trade-offs.

Architect não é um estágio automático por classificação e não cria `architecture.md`, design doc ou readiness como pré-requisito universal.

## Quando invocar

- Existe uma decisão arquitetural realmente aberta.
- Uma integração, migração ou limite de módulo tem alternativas relevantes.
- Planner não consegue produzir fases seguras sem decidir uma fronteira.
- DEV encontra uma mudança de arquitetura fora do plano aprovado.

## Saída

A recomendação deve ser incorporada onde passa a ter autoridade:

- no PRD, se muda comportamento ou escopo;
- no plano, se muda sequência, arquivos ou checks;
- em uma ADR existente, quando o projeto já usa esse padrão.

Documentos consultivos não criam outro workflow.

## Handoff típico

- **Vem de:** pedido explícito de Product, Sheldon, Planner, DEV ou usuário.
- **Vai para:** o dono do PRD/plano ou DEV, conforme a decisão.

## Veja também

- [Ficha do @planner](./planner.md)
- [Ficha do @dev](./dev.md)
