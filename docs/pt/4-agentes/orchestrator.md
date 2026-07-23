# @orchestrator — Coordenação sob pedido explícito

> **Para quem é:** quem precisa coordenar uma sessão, múltiplos especialistas ou um problema de integração que não cabe num handoff simples.

## Papel atual

`@orchestrator` continua disponível, mas não faz parte da rota canônica por classificação. MEDIUM não o ativa automaticamente e não existe uma “lane maestro” obrigatória.

A rota rastreada permanece:

```text
[@briefing → @briefing-refiner] → @product → [@sheldon] → @planner → @dev → @qa
```

Use Orchestrator quando o próprio objetivo é coordenação: decompor uma investigação, sincronizar especialistas explicitamente solicitados ou acompanhar uma sessão com várias dependências.

## O que ele não faz

- Não substitui Product como dono do PRD.
- Não substitui Planner como dono do plano.
- Não cria um fan-out obrigatório de Analyst, Architect, PM ou UX/UI.
- Não transforma pareceres consultivos em gates ou artefatos obrigatórios.
- Não coordena as faixas de desenvolvimento: elas pertencem ao DEV.

## Quando invocar

- O usuário pede coordenação explícita.
- Há uma decisão multidisciplinar delimitada que exige mais de um especialista.
- Uma sessão longa precisa de checkpoints e handoffs coordenados.

Para uma feature normal, siga diretamente de Product/Sheldon para Planner.

## Handoff

Orchestrator devolve os resultados ao dono atual do artefato:

- decisão de produto → Product/PRD;
- decisão de planejamento → Planner/plano;
- decisão de integração → DEV;
- evidência de entrega → QA.

## Veja também

- [Ficha do @planner](./planner.md)
- [Ficha do @dev](./dev.md)
- [Autopilot Handoff](../5-referencia/autopilot-handoff.md)
