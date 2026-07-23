# @validator — Verificação binária opt-in

> **Para quem é:** quem usa um harness-contract e quer um veredito isolado adicional.

## Para que serve

Validator verifica critérios binários do harness em contexto fresco. Ele complementa QA; não substitui o `qa-report-{slug}.md` como veredito canônico da entrega.

Validator começa desligado em todas as classificações. A simples presença de `harness-contract.json` não o ativa.

## Quando invocar

- O usuário pede explicitamente validação binária adicional.
- O plano aprovado exige esse gate.
- QA encontra uma razão concreta para uma verificação isolada.

A entrada `validator` precisa estar habilitada em `agent-execution-{slug}.json` e ter um gatilho aplicável.

## Sequência

```text
harness:check → harness:validate → execução isolada → consumo do veredito
```

O validator usa contrato, resultados determinísticos e diff necessário. Não herda o histórico de implementação.

## Handoff típico

- **Vem de:** usuário, plano ou recomendação justificada de QA.
- **Vai para:** DEV se falhar; QA/fechamento humano se passar.

## Veja também

- [Ficha do @qa](./qa.md)
- [Execução de agentes](../5-referencia/agent-execution.md)
