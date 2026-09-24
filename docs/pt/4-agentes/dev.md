# @dev — Implementação e integração

> **Para quem é:** quem possui um resultado técnico delimitado ou um plano de feature aprovado e quer escrever código verificável.

## Duas entradas válidas

### Simple Plan

Um resultado já especificado, sem decisão aberta de produto/arquitetura/segurança, pode ir diretamente ao DEV quando cabe no orçamento: até 5 arquivos de comportamento, 8 paths totais e 2 módulos existentes.

Abaixo disso existe a correção direta: até 2 arquivos de comportamento, nenhuma decisão aberta e verificação conhecida — DEV corrige sem criar arquivo de plano.

### Retomada e continuidade

DEV absorveu o antigo `@deyvin`/`@pair`. Uma ativação simples de `@dev` carrega o contexto enxuto de continuidade; para retomar um Simple Plan, DEV lê o `dev-state` com `--context=simple-plan`, e a recuperação de sessão segue `.aioson/docs/dev/continuity-recovery.md`. Sessões live/diretas seguem `.aioson/docs/dev/runtime-handoffs.md`; entrega de sites, `.aioson/docs/dev/site-delivery.md`.

### Sub-task scout

Quando um diagnóstico ambíguo exige varrer mais de 5 arquivos ou rastrear um fluxo de runtime, DEV dispara um scout somente leitura com `aioson scout:prep --parent-agent=dev` (no máximo 3 scouts por sessão e 20 arquivos por escopo). Veja [Sub-task scout do @dev](../deyvin-subtask-scout/README.md).

### Feature rastreada

Para MICRO, SMALL e MEDIUM, DEV recebe:

- o único `prd-{slug}.md`;
- o único `implementation-plan-{slug}.md`;
- evidência selecionada do repositório;
- rules, docs, skills e dossiê apenas quando relevantes.

## Como trabalha

DEV implementa as fases verticais e os controles de engenharia acionados por evidência, mantém o escopo aprovado, executa os checks do plano e integra a feature. Não há QA entre cada fase; QA é a revisão final independente.

Se o trabalho ultrapassar o orçamento aprovado, DEV mostra o antes/depois da estimativa e a causa antes de ampliar o escopo.

## Autoridade visual e anti-slop

O bloco de qualidade visual/anti-slop não vive mais no kernel do agente: é um doc roteado, `.aioson/docs/dev/visual-implementation.md`, carregado apenas quando a fase toca interface, protótipo ou estado visual — trabalho não visual nunca paga esse custo de contexto.

Quando carregado, DEV resolve a autoridade visual nesta ordem, parando no primeiro acerto: o vínculo `identity`/`identity_status` do PRD → o protótipo aprovado (`prototype_status: current`) e sua `## Visual direction` → a `design_skill` selecionada do projeto → a linguagem de componentes já existente no repositório. Uma decisão visual genuinamente não resolvida é pergunta de produto para `@product` — DEV não encaminha para um especialista de UI (o antigo `@ux-ui` foi aposentado; a direção visual vive no `@refiner`/protótipo e as decisões de interação no `@product`).

Com um protótipo aprovado em vigor, a skill de design roda em **modo conformidade**: transfere a direção aprovada em vez de decidi-la de novo, mapeando cada região para um componente real da biblioteca do projeto.

## Build de stack compilado é recurso limitado

Em stacks compilados, "rodar o build" não é um comando barato: um `cargo` padrão sobe um `rustc` por core lógico, e build scripts `*-sys` ainda somam `cl.exe`/`link.exe`/MSBuild por cima. Disparar isso por slice, em shells de background ou em worktrees paralelos, esgota a memória da máquina do operador.

As convenções de stack (`.aioson/docs/dev/stack-conventions.md`, carregadas pelo `@dev` em tarefas de implementação) tratam build como recurso **serializado e limitado**:

- valide slices com `cargo check` (ou `cargo clippy`); `cargo build` só quando um binário executável é realmente necessário;
- rode testes com escopo (`cargo test -p <crate> <filtro>`); a suíte completa roda uma vez, no gate de entrega, não a cada slice;
- **uma invocação de cargo por vez** — nunca inicie um segundo build/teste com um em andamento, nem em shells de background paralelos, nem em worktrees paralelos (o lock de `target` não protege entre worktrees);
- antes do primeiro build pesado, garanta que o `.cargo/config.toml` limita o paralelismo com `[build] jobs` (cerca de metade dos cores lógicos) e define `CMAKE_BUILD_PARALLEL_LEVEL` no mesmo valor; se o arquivo não existir, o agente o cria e avisa você;
- build scripts baseados em `cc` compartilham o jobserver do cargo e ficam dentro do limite; os dirigidos por cmake só obedecem a `CMAKE_BUILD_PARALLEL_LEVEL`.

O princípio vale para qualquer stack compilado: escolha o comando mais barato que prova a slice, e um build de cada vez.

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
