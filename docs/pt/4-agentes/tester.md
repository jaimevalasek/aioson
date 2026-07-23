# @tester — Engenharia de testes opt-in

> **Para quem é:** quem quer cobertura adicional para um app existente ou uma feature com lacunas relevantes.

## Diferença para QA

QA emite o veredito final da feature. Tester é um especialista opcional para inventário, estratégia, qualidade e ampliação de testes.

Tester começa desligado em MICRO, SMALL e MEDIUM. A classificação nunca o ativa.

## Quando invocar

- O usuário pede explicitamente mais cobertura.
- Um app legado não possui base de testes confiável.
- O plano aprovado nomeia uma lacuna de engenharia de testes.
- QA encontra evidência concreta de que o problema exige trabalho especializado além da revisão final.

## Execução

A entrada `tester` precisa estar habilitada em `agent-execution-{slug}.json` e ter um gatilho aplicável. Host/modelo indisponível pausa; não há substituição silenciosa pelo cliente atual.

## Handoff típico

- **Vem de:** usuário, plano ou finding concreto de QA.
- **Vai para:** DEV quando exige correção; QA quando fornece evidência adicional.

## Veja também

- [Ficha do @qa](./qa.md)
- [Execução de agentes](../5-referencia/agent-execution.md)
