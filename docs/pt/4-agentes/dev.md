# @dev — Implementação e integração

> **Para quem é:** quem possui um resultado técnico delimitado ou um plano de feature aprovado e quer escrever código verificável.

## Duas entradas válidas

### Simple Plan

Um resultado já especificado, sem decisão aberta de produto/arquitetura/segurança, pode ir diretamente ao DEV quando cabe no orçamento: até 5 arquivos de comportamento, 8 paths totais e 2 módulos existentes.

### Feature rastreada

Para MICRO, SMALL e MEDIUM, DEV recebe:

- o único `prd-{slug}.md`;
- o único `implementation-plan-{slug}.md`;
- evidência selecionada do repositório;
- rules, docs, skills e dossiê apenas quando relevantes.

## Como trabalha

DEV implementa as fases verticais e os controles de engenharia acionados por evidência, mantém o escopo aprovado, executa os checks do plano e integra a feature. Não há QA entre cada fase; QA é a revisão final independente.

Se o trabalho ultrapassar o orçamento aprovado, DEV mostra o antes/depois da estimativa e a causa antes de ampliar o escopo.

## Faixas de desenvolvimento

O manifesto `agent-execution-{slug}.json` pode habilitar faixas como backend, frontend ou outra frente com `host`, `model`, `prompt` e `write_paths`.

DEV:

1. gera o prompt curto a partir do PRD e plano aprovados;
2. despacha somente as faixas habilitadas;
3. executa-as sequencialmente no worktree compartilhado;
4. confere o diff contra `write_paths`;
5. integra fronteiras compartilhadas;
6. roda a verificação completa.

As faixas são workers de runtime, não agentes canônicos ou estágios do workflow.

CLI/modelo indisponível pausa a execução. O cliente atual nunca substitui silenciosamente o modelo solicitado. Fallback só roda quando o manifesto o declara.

## Saídas

- código e testes da feature;
- `.aioson/context/dev-state.md` para retomada;
- evidência dos checks do plano;
- relatórios de faixas, quando usadas.

## Autopilot

O handoff padrão é `@dev → @qa`. Tester, Pentester e Validator não entram automaticamente por classificação; precisam estar habilitados e ter um gatilho explícito.

DEV também valida o vínculo do protótipo antes de usá-lo. Se o PRD declarar `none` porque o protótipo encontrado pertence a uma feature fechada, DEV informa o caminho excluído no chat e vasculha o código, os testes e a entrada real da aplicação. Ele pode corrigir um desvio de implementação já definido pelo PRD/plano; não restaura silenciosamente o protótipo antigo nem muda a intenção de produto.

## Handoff típico

- **Vem de:** `@planner` ou entrada direta em Simple Plan.
- **Vai para:** `@qa`.

## Veja também

- [Ficha do @planner](./planner.md)
- [Ficha do @qa](./qa.md)
- [Execução de agentes e faixas DEV](../5-referencia/agent-execution.md)
