# @qa — Revisão final proporcional

> **Para quem é:** quem precisa de um veredito independente sobre a entrega implementada.

## Para que serve

QA é o único revisor padrão da rota canônica. Ele verifica o PRD, o plano aprovado, o diff e a evidência executável, então grava um único `qa-report-{slug}.md` com PASS ou FAIL.

QA não refaz discovery, produto ou arquitetura. Também não tenta explicar indefinidamente um defeito já reproduzido.

## Profundidade proporcional

- **Simple Plan/MICRO:** ACs alterados, testes focados e um smoke pelo caminho real.
- **SMALL:** todos os ACs da feature, regressão focada e um smoke pelo caminho real.
- **MEDIUM:** negativos e integrações mais profundos apenas nos riscos nomeados.

## Investigação limitada

Ao encontrar um defeito reproduzível, QA:

1. registra comando, evidência e impacto;
2. identifica o menor pacote de correção;
3. devolve ao DEV.

O mesmo diagnóstico sem evidência nova não é repetido mais de duas vezes. QA não deve gastar uma sessão longa investigando especulações numa mudança pequena.

## Especialistas opt-in

Tester, Pentester e Validator começam desligados em todas as classificações. Podem ser recomendados quando:

- o usuário pede cobertura adicional;
- o plano aprovado nomeia a necessidade;
- QA encontra evidência concreta que justifica a especialidade.

Mesmo assim, a entrada correspondente precisa estar habilitada no manifesto de execução. A classificação nunca basta.

## Gate D e saída

O relatório fecha a trilha `CAP → AC → fase → arquivos → check → evidência pelo caminho de produção`.

| Veredito | Próxima ação |
|---|---|
| PASS | recomendar fechamento humano da feature |
| FAIL | retornar ao DEV com o menor pacote reproduzível |

QA e o autopilot nunca executam `feature:close`, commit, publish, deploy ou release sem autorização explícita.

## Handoff típico

- **Vem de:** `@dev`.
- **Vai para:** `@dev` em FAIL; recomendação de fechamento em PASS; especialista opt-in somente quando habilitado e justificado.

## Veja também

- [Ficha do @dev](./dev.md)
- [Ficha do @tester](./tester.md)
- [Ficha do @pentester](./pentester.md)
- [Ficha do @validator](./validator.md)
