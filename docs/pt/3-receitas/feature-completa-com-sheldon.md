# Receita: Feature completa com Sheldon opcional

> **Para quem é:** quem quer acompanhar uma feature rastreada do PRD ao veredito QA.

## A rota canônica

```text
[@briefing → @briefing-refiner] → @product → [@sheldon] → @planner → @dev → @qa
```

As etapas entre colchetes são opcionais. MICRO, SMALL e MEDIUM percorrem a mesma rota; a classificação muda detalhe, orçamento e cobertura de risco.

## Passo 1 — Product cria o único PRD

```text
Você > @product

@product > PRD criado em .aioson/context/prd-checkout.md.
           Capacidades, exclusões e ACs estão concretos.
           product_scope: approved
           prd_ready: approved
```

O PRD é a autoridade de escopo. Não abra requirements/spec paralelos para repetir seu conteúdo.

## Passo 2 — Sheldon enriquece, se necessário

Use Sheldon quando o PRD tem decisões difíceis, edge cases frágeis ou pesquisa que pode mudar os ACs:

```text
Você > @sheldon

@sheldon > Encontrei risco de webhook duplicado.
           Atualizei o mesmo PRD com AC de idempotência e cenário de reprocessamento.
           PRD permanece aprovado para planejamento.
```

Se o PRD já está sólido, pule esta etapa.

## Passo 3 — Planner cria um plano vertical

```text
Você > @planner

@planner > Plano criado em
           .aioson/context/implementation-plan-checkout.md

           Fase 1: contrato e persistência
           Fase 2: endpoint e idempotência
           Fase 3: integração e smoke pelo caminho real
           Gate C: approved
```

O plano liga capacidades e ACs aos arquivos esperados, checks executáveis e evidência de produção. Analyst, Architect, PM, UX/UI ou Discovery Design Doc só entram se você pedir uma consultoria para uma dúvida nomeada.

## Passo 4 — DEV implementa e integra

```text
Você > @dev

@dev > Implementando as fases verticais.
       Checks do plano passaram.
       dev-state.md atualizado.
       Próximo: @qa.
```

Se `agent-execution-checkout.json` habilitar faixas de desenvolvimento, DEV pode despachar backend, frontend ou outra frente com host/modelo/prompt/`write_paths`. As faixas rodam sequencialmente no worktree compartilhado; DEV confere os diffs e faz a integração final.

Host ou modelo indisponível pausa. O cliente atual não substitui silenciosamente a faixa; fallback só existe quando declarado no manifesto.

## Passo 5 — QA dá o veredito final

```text
Você > @qa

@qa > Verifiquei ACs, testes focados e smoke pelo caminho real.
      qa-report-checkout.md: PASS
      Recomendo fechamento humano da feature.
```

QA aplica profundidade proporcional:

- MICRO: ACs alterados, testes focados e smoke;
- SMALL: todos os ACs, regressão focada e smoke;
- MEDIUM: negativos e integrações mais profundas nos riscos nomeados.

Em FAIL, QA devolve o menor pacote reproduzível ao DEV. O mesmo diagnóstico sem evidência nova não é repetido mais de duas vezes.

## Especialistas de revisão

Tester, Pentester e Validator começam desligados em todas as classificações. Só rodam quando:

1. o usuário pede, o plano exige ou QA encontra evidência concreta; e
2. a entrada correspondente está habilitada no manifesto de execução.

## Artefatos canônicos

```text
.aioson/context/
├── prd-checkout.md
├── implementation-plan-checkout.md
└── qa-report-checkout.md
```

Dossiês, pesquisas, design docs e pareceres podem enriquecer a feature sem se tornarem pré-requisitos.

## Autopilot

Com autopilot habilitado, o padrão após o planejamento é `@dev → @qa`. O fluxo pausa para decisões reais, finding bloqueante, orçamento excedido ou host/modelo indisponível sem fallback.

O autopilot nunca executa `feature:close`, commit, publish, deploy ou release sem autorização explícita.

## Veja também

- [Ficha do @product](../4-agentes/product.md)
- [Ficha do @sheldon](../4-agentes/sheldon.md)
- [Ficha do @planner](../4-agentes/planner.md)
- [Autopilot Handoff](../5-referencia/autopilot-handoff.md)
- [Execução de agentes e faixas DEV](../5-referencia/agent-execution.md)
