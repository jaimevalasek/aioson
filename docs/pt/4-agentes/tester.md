# @tester — Engenharia de testes opt-in

> **Para quem é:** quem quer cobertura adicional para um app existente ou uma feature com lacunas relevantes.

## Diferença para QA

QA emite o veredito final da feature. Tester é um especialista opcional para estratégia e implementação de cobertura, edge cases, invariantes e regressões. Ele também pode corrigir um defeito inequívoco e pequeno; não cria novas features nem decide comportamento de produto.

Tester começa desligado em MICRO, SMALL e MEDIUM. A classificação nunca o ativa.

## Quando invocar

- O usuário pede explicitamente mais cobertura.
- Um app legado não possui base de testes confiável.
- O plano aprovado nomeia uma lacuna de engenharia de testes.
- QA encontra evidência concreta de que o problema exige trabalho especializado além da revisão final.

## Execução

Uma chamada direta do usuário já habilita aquela execução do Tester. Para QA/Autopilot invocá-lo automaticamente, a entrada `tester` precisa estar habilitada em `agent-execution-{slug}.json` e ter um gatilho aplicável. A chamada direta não liga execuções futuras. Host/modelo indisponível pausa; não há substituição silenciosa pelo cliente atual.

O conhecimento do modelo serve para gerar hipóteses de teste. Só entram casos sustentados pelo PRD, controles do Planner, código ou risco real.

Antes de editar código de produção, Tester registra reprodução, AC/controle afetado e `allowed_fix_paths` no `test-report-{slug}.md`. Uma execução direta com Tester desabilitado usa `--manual` apenas naquele `review-cycle:advance`; o manifesto permanece intacto. O CLI valida o orçamento de paths, captura o baseline Git e impede o retorno ao QA se o diff sair do escopo. A correção precisa:

- manter API pública, dados, arquitetura e comportamento aprovado;
- caber em até 3 arquivos de comportamento / 5 paths totais;
- não adicionar migração nem dependência;
- passar por `review-cycle:advance --source=tester --to=tester`;
- ter testes direcionados e voltar ao QA como `needs_validation`.

Defeito ambíguo ou transversal vai uma única vez ao DEV. Tester nunca aprova Gate D.

## Handoff típico

- **Vem de:** usuário, plano ou finding concreto de QA.
- **Vai para:** DEV quando a correção excede o limite; QA quando entrega cobertura ou uma correção limitada para validação independente.

## Veja também

- [Ficha do @qa](./qa.md)
- [Execução de agentes](../5-referencia/agent-execution.md)
