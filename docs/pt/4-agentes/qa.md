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
3. encaminha ao especialista dono quando a correção é inequivocamente pequena e ele está habilitado; caso contrário, devolve ao DEV uma única vez.

O mesmo diagnóstico sem evidência nova não é repetido mais de duas vezes. QA não deve gastar uma sessão longa investigando especulações numa mudança pequena.

## Lente de interação em superfície visual

Quando a entrega tem superfície visual ou operacional rica, o QA consulta o brain de qualidade visual (`brain:query --agent=qa --tags=interaction,forms --min-quality=4`) e trata seus nós e as regras de `.aioson/rules/` que casam como **critério de entrega** — não como recomendação de estilo.

Cada contrato de interação que o PRD, o plano ou um AC prometeu precisa de **uma linha concreta de evidência CAP/AC provada na superfície real**:

| Contrato prometido | O que a verificação prova |
|---|---|
| Máscara e validação de campo | cada campo estruturado é exercitado com entrada válida e malformada; campo que aceita o que a máscara rejeita é FAIL |
| Confirmação de mudança de status | todo controle destrutivo ou de mudança de status tem caminho de teste pelo confirmar **e** pelo cancelar |
| Drag-and-drop em fluxo recorrente | arrasta um card real e confirma que o novo status/ordem persiste depois de um reload; movimento que só muda o DOM é FAIL |
| Widgets da home de gestão | altera o dado por trás e confirma que cada widget reflete a mudança; widget congelado no valor de seed é FAIL |

A consulta **nunca adiciona escopo**: um contrato que nada prometeu continua sendo recomendação, não achado. Isso fecha a cadeia `origem (@briefing) → spec (@product) → protótipo (@refiner) → implementação (@dev) → verificação (@qa)`.

Detalhes das quatro regras: [Regras de interação e gate visual](../5-referencia/regras-de-interacao-e-gate-visual.md).

## Scope drift e acessibilidade

QA absorveu o antigo `@scope-check`: confere se o entregue bate com o prometido (`.aioson/docs/qa/scope-drift.md`), além do gate de scope drift que o `workflow:next` roda sempre. Em superfícies com UI, QA também faz a auditoria de acessibilidade (`.aioson/docs/qa/accessibility-audit.md`), antes submodo do `@ux-ui`.

## Especialistas opt-in

Tester, Pentester e Validator começam desligados em todas as classificações. Podem ser recomendados quando:

- o usuário pede cobertura adicional;
- o plano aprovado nomeia a necessidade;
- QA encontra evidência concreta que justifica a especialidade.

Mesmo assim, a entrada correspondente precisa estar habilitada no manifesto de execução. A classificação nunca basta.

Tester e Pentester podem corrigir localmente somente um defeito determinístico, dentro de paths persistidos e orçamento finito. Depois disso, QA inspeciona o diff e repete a evidência relevante; apenas QA pode aceitar a correção e aprovar Gate D.

## Gate D e saída

O relatório fecha a trilha `CAP → encaixe atual → AC → delta de implementação → fase → arquivos → check → evidência pelo caminho de produção`.

| Veredito | Próxima ação |
|---|---|
| PASS | recomendar fechamento humano da feature |
| FAIL | especialista habilitado corrige dentro do limite, ou DEV recebe o menor pacote reproduzível |

QA e o autopilot nunca executam `feature:close`, commit, publish, deploy ou release sem autorização explícita.

QA reprova vínculo de protótipo cruzado ou contraditório. Quando `prototype_status: none`, verifica a entrega contra PRD, plano, código e caminho real de produção — nunca contra uma referência histórica excluída.

## Handoff típico

- **Vem de:** `@dev`.
- **Vai para:** `@dev` em FAIL; recomendação de fechamento em PASS; especialista opt-in somente quando habilitado e justificado.

## Veja também

- [Ficha do @dev](./dev.md)
- [Ficha do @tester](./tester.md)
- [Ficha do @pentester](./pentester.md)
- [Ficha do @validator](./validator.md)
