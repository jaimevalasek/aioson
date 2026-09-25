# Plano de evolução do Squad — confiabilidade primeiro

Data: 24/09/2026. Estado: proposta técnica para execução incremental.
Fonte: [revisão do Squad](quality-review-squad.md), código inspecionado e sondas registradas nessa revisão.

Este documento organiza a evolução solicitada. Não declara Gate C aprovado, PRD aprovado ou mudança da feature ativa. O primeiro ciclo corrige defeitos observáveis; os ciclos seguintes definem a sequência recomendada de produto e precisam de escopo próprio ao entrar em implementação. Não há estimativas de prazo sem medição de execução.

## Resultado desejado

O cliente pede uma entrega, acompanha o que aconteceu, recebe um resultado verificável e consegue revisar ou retomar o trabalho preservando o que já foi concluído. Isso deve funcionar para conteúdo, processos e construção, com complexidade proporcional à tarefa.

## Ordem de entrega

| Ciclo | Resultado para o cliente | Condição para avançar |
|---|---|---|
| 1. Confiabilidade | O estado corresponde ao trabalho realizado; falhas permanecem recuperáveis | Todos os cenários críticos abaixo passam pela implementação real |
| 2. Execução coerente | Pedir, acompanhar e retomar usam a mesma identidade e os mesmos estados | CLI, autorun e pipeline concordam sobre uma execução |
| 3. Entregas por domínio | Conteúdo, processos e construção comprovam o resultado adequado | Um fluxo completo por domínio, incluindo correção e falha |
| 4. Inteligência e contexto proporcionais | O Squad usa menos preparação e escolhe melhor como trabalhar | Comparação controlada preserva qualidade e mede custo/tempo |
| 5. Revisão e reutilização | Feedback modifica a parte certa; exemplos aprovados melhoram próximas entregas | Revisão preserva partes aceitas e atualiza derivados afetados |
| 6. Simplificação do catálogo | O cliente encontra o que precisa e componentes redundantes podem ser aposentados | Dependentes identificados, substituição demonstrada e migração testada |

Trabalhar em sequência no núcleo compartilhado. Cada incremento inclui comportamento, testes e documentação que afete seu uso. Não iniciar uma reescrita geral do autorun ou uma nova infraestrutura de execução como pré-requisito.

## Ciclo 1 — execução confiável

### Invariantes obrigatórias

1. Uma atualização confirmada não desaparece por concorrência.
2. Nenhuma tarefa inicia antes da conclusão aceita de todas as dependências obrigatórias.
3. `completed` exige execução bem-sucedida e evidência aplicável aprovada. Preparação, lint ou critério crítico pendente não satisfazem essa condição.
4. Pausa por orçamento preserva trabalho retomável; não é conclusão ou dispensa de tarefa.
5. Evento só é confirmado após os consumidores requeridos concluírem. Tentativas e efeitos parciais sobrevivem a reinício.
6. Repetição usa identidade estável de operação. Efeito externo de resultado desconhecido exige reconciliação antes de repetir.
7. Um worker gerado e ainda não implementado nunca é apresentado como entrega.
8. Status textual, JSON, resumo persistido e código de saída expressam o mesmo resultado.

### 1.1 — preservar estado e retomar sem perder tarefas

**Falha de referência:** 12 atualizações concorrentes resultaram em apenas uma persistida.

**Modificar:** `src/squad/task-decomposer.js`, `tests/squad-task-decomposition.test.js`.
**Integrar e verificar:** `src/commands/squad-autorun.js`, `tests/squad-autorun.test.js`.
**Padrão inspecionado:** `src/dossier/lock.js`; referência de exclusão entre processos, não reutilização automática. Seu vencimento por tempo e tratamento de arquivo incompleto precisam ser considerados antes de extrair qualquer mecanismo compartilhado.

Implementação recomendada:

- Centralizar a mutação de plano em uma operação leitura–alteração–persistência com exclusão por sessão entre processos. Todas as gravações de um plano existente devem passar por ela; `savePlan` não pode continuar sobrescrevendo snapshots antigos por outro caminho.
- Manter `plan.json` como autoridade neste ciclo; escrever em temporário no mesmo diretório e substituir atomicamente. Acrescentar revisão para detectar gravações obsoletas.
- A posse deve ter identidade verificável; não remover lock de processo vivo apenas porque passou um TTL. Nunca manter lock durante chamada de modelo ou worker.
- Distinguir arquivo ausente, ilegível e corrompido. Corrupção não pode virar silenciosamente uma nova execução.
- Tratar tarefa `running` após queda como resultado a reconciliar; não pressupor que o efeito não aconteceu.

**Aceite:** preservar 12/12 atualizações no mesmo processo e em processos distintos; duas retomadas simultâneas não assumem a mesma tarefa; interrupção antes/depois da substituição deixa versão válida; tarefa já confirmada não repete. Executar autorun pelo CLI com workers locais reais em projeto temporário.

**Recuperação:** manter cópia válida antes de qualquer conversão de formato. Plano legado sem revisão deve abrir. Versão antiga do CLI não pode escrever concorrentemente na mesma sessão protegida apenas pelo novo protocolo; documentar e detectar proprietário/versão incompatível quando identificável.

### 1.2 — executar somente tarefas liberadas

**Modificar:** `src/commands/squad-autorun.js`, `src/squad/task-decomposer.js`, `tests/squad-autorun.test.js`, `tests/squad-task-decomposition.test.js`.

- Validar IDs únicos, dependências existentes e ausência de ciclos antes do primeiro efeito.
- Usar o estado atualizado das dependências para selecionar tarefas prontas; grupos paralelos são organização, não autorização para executar.
- Registrar bloqueio e sua causa. Falha em um ramo não impede outro ramo independente quando a política permitir.
- Reservar a tarefa de forma persistida antes de despachar. Retomada reavalia apenas tarefas elegíveis e preserva resultados aceitos.

**Aceite:** upstream falha e downstream não cria arquivo; ramo independente conclui; após correção, a retomada executa o restante uma vez. Ciclo ou referência inexistente falha antes de qualquer worker.

### 1.3 — fazer conclusão significar entrega verificada

**Modificar:** `src/squad/reflection.js`, `src/commands/squad-autorun.js`, `src/worker-runner.js`, `tests/squad-autorun.test.js`, `tests/squad-worker.test.js`.
**Reutilizar após verificar compatibilidade:** `src/squad/verify-gate.js`, `src/squad/eval-engine.js`, `src/squad/manifest-validator.js`.

- Resolver manifest e checklist nos caminhos canônicos, com fallback explícito para pacote legado. Se os dois existirem, prevalece o canônico; contrato canônico inválido deve gerar diagnóstico.
- Mapear explicitamente `DONE`, `NEEDS_ITERATION`, `ESCALATE`, veredito desconhecido e critério crítico não avaliado. Nenhum fallback pode aprovar.
- Separar execução, avaliação e aceitação. Heurísticas de tamanho ficam como lint; mérito semântico precisa de avaliação apropriada.
- Correção tem contador e limite explícitos por execução; ao esgotar, manter pendência visível. Não criar loop ilimitado nem novo custo implícito.
- Scaffold informa `not_implemented` e readiness impede seu despacho como worker pronto. Verificar evidência de saída conforme o contrato da tarefa.
- Votação por status não serve como consenso semântico. Enquanto não houver avaliação de conteúdo, rotular o que foi agregado e impedir seu uso como aprovação crítica.

**Aceite:** `NEEDS_ITERATION` não conclui; critério crítico desconhecido fica não verificado; checklist canônica é realmente usada; worker TODO não entrega; worker implementado com evidência aprovada conclui; veredito desconhecido não recebe sucesso. Uma tarefa determinística válida não deve ganhar exigência desnecessária de avaliador LLM.

### 1.4 — pausar e retomar com resultado honesto

**Modificar:** `src/commands/squad-autorun.js`, `src/commands/squad-status.js`, `tests/squad-autorun.test.js`, `tests/squad-status-command.test.js`.

- Introduzir estado explícito de pausa por orçamento e preservar tarefas restantes. `skipped` significa dispensa intencional com motivo.
- Agregar conclusão a partir das tarefas obrigatórias, com contadores de aceitas, falhas, bloqueadas e pendentes.
- Separar consumo medido e estimado; contar novas tentativas. Provider sem medição informa indisponibilidade, não consumo zero.
- Respeitar limites configurados por tarefa e sessão no que o adapter puder efetivamente controlar. Não prometer teto financeiro rígido a partir de caracteres/4.
- Documentar a correção semântica de `ok` e do código de saída para consumidores do CLI. Operação de consulta bem-sucedida e execução concluída são dimensões distintas.

**Aceite:** orçamento insuficiente executa zero tarefas e informa pausa; retomada com orçamento válido conclui só as restantes; saída textual e JSON concordam; resumo parcial nunca afirma entrega completa.

### 1.5 — recuperar eventos sem perder nem repetir efeitos confirmados

**Modificar:** `src/squad-daemon.js`, `tests/squad-daemon.test.js`.
**Inspecionar e adaptar onde o contrato exigir:** `src/squad/inter-squad.js`, `src/squad/inter-squad-events.js`, `src/runtime-store.js`, `tests/squad-inter-squad.test.js`.

- Fazer claim atômico do evento no SQLite existente, com posse, tentativa e recuperação após queda.
- Registrar entrega por consumidor requerido; um evento com dois workers não pode repetir o primeiro já confirmado porque o segundo falhou.
- Confirmar consumo somente após sucesso dos consumidores requeridos. Evento sem consumidor fica diagnosticável; não é descartado silenciosamente.
- Serializar polls sobrepostos e controlar concorrência de disparos agendados sobre o mesmo trabalho.
- Usar chave estável por efeito; transmitir idempotência quando o destino suportar. Resultado externo ambíguo fica aguardando reconciliação, sem retry cego.
- Classificar falha recuperável/definitiva, aplicar limite de tentativas e manter opção de retomada explícita com histórico.

**Aceite:** worker falho mantém evento recuperável; dois daemons não executam a mesma entrega em paralelo; queda depois do efeito e antes da confirmação é reconciliada; falha parcial em dois consumidores retoma apenas o restante. Usar SQLite e workers reais nos testes de integração; mocks ficam reservados a fronteiras externas.

**Migração e rollback:** alterações de esquema aditivas e versionadas no mecanismo existente; testar banco anterior e segunda aplicação sem mudança. Após adoção de novos estados, rollback de binário exige parar os consumidores e conferir compatibilidade; não restaurar backup antigo sobre efeitos externos já realizados. Sem promessa de entrega exatamente uma vez em integrações sem suporte.

### 1.6 — fechar a cobertura entre comandos e instruções

**Modificar:** `src/lib/squad-preflight.js`, `tests/squad-preflight.test.js`, `tests/squad-prompt-cli-reachability.test.js`.
**Conferir e alterar somente se necessário:** `template/.aioson/agents/squad.md`, `template/.aioson/tasks/squad-pipeline.md`.

- Declarar mapeamento de `review`, `profile`, `learning-review`, `task-decompose` e `pipeline` para operações suportadas.
- Testar operação → tarefa → módulos → comando com o registro real. Aliases precisam de destino explícito.
- Corrigir no template canônico e sincronizar espelhos pelo mecanismo existente quando houver edição de instruções.
- Distinguir pacote preparado de trabalho executado nas mensagens de Agent Teams e pipeline guiado.

**Aceite:** cada operação pública resolve sem inferência do modelo; instruções não anunciam execução concluída quando apenas arquivos de preparação foram produzidos.

### Verificação do ciclo 1

Transformar as sondas exploratórias em regressões permanentes próximas das APIs reais. O script em `.aioson/runtime/squad-review-probe.cjs` é evidência histórica; não deve virar dependência do CI.

Comando focado inicial, expandido apenas pelos arquivos realmente alterados:

```powershell
node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=4 tests/squad-task-decomposition.test.js tests/squad-autorun.test.js tests/squad-worker.test.js tests/squad-daemon.test.js tests/squad-inter-squad.test.js tests/squad-status-command.test.js tests/squad-preflight.test.js tests/squad-prompt-cli-reachability.test.js
```

Na integração: `npm run check:syntax`, `npm run lint` e `npm test`. Se houver edição em artefato com roteamento, incluir `aioson context:evals .`. Executar concorrência, recuperação e transporte de payload em Windows e Linux; o ambiente local desta análise só prova Windows.

O smoke deve usar `bin/aioson.js`, um pacote temporário válido, workers implementados e arquivos/efeitos verificáveis. Cobrir execução normal, dependência falha, correção, pausa, retomada e reinício de consumidor. Suíte verde sem esses caminhos não fecha o ciclo.

**Portão de saída:** zero defeitos conhecidos que produzam falso sucesso, perda de atualização ou consumo indevido nos cenários cobertos; nenhum cenário crítico omitido; compatibilidade de sessões e eventos legados demonstrada. A revisão anterior passou 563 testes e ainda encontrou esses defeitos: quantidade de testes não é o critério de aceite.

## Ciclo 2 — uma experiência de execução

Evoluir `src/commands/squad-autorun.js`, `src/commands/squad-status.js`, `src/commands/squad-plan.js`, `src/commands/squad-pipeline.js` e o registro de `src/cli.js` para compartilhar identidade, estado e referências de evidências. Preservar arquivos portáteis; evitar três autoridades sobre a mesma conclusão.

Proposta de superfície pública, ainda não implementada: `aioson squad run`, `status`, `resume` e, no ciclo 5, `revise`. Preservar comandos `squad:*` como entradas compatíveis para a mesma implementação. Primeiro verificar colisões e gramática existente; os nomes são proposta de UX.

O status informa objetivo, resultado atual, tarefa ativa, heartbeat, motivo de bloqueio, próxima ação e uso conhecido. Preparação assistida fica `prepared`; despacho real e confirmação do processo são necessários para `running`. O adapter executa ou explica o próximo passo guiado, sem declarar conclusão antecipada.

**Aceite:** uma execução iniciada por qualquer entrada pode ser consultada e retomada por outra; seus IDs, artefatos e resultados concordam. Falha de provider tem diagnóstico recuperável. Introduzir o contrato de forma aditiva e migrar leitores antes de remover representações antigas.

## Ciclo 3 — provar os três usos do produto

| Uso | Primeiro fluxo completo | Aceite |
|---|---|---|
| Conteúdo | Fontes + voz → peça representativa → revisão → lote derivado | Afirmações rastreáveis, formato utilizável, versão aceita preservada |
| Processos | Evento/lote → worker → exceção → reconciliação → recibo | Efeitos e falhas rastreados, retomada sem repetir efeitos confirmados |
| Construção | Pedido → inspeção → implementação → execução pelo ponto de entrada | Artefato utilizável e comportamento observado; arquivo existente sozinho não aprova |

Usar contratos de evidência por domínio. HTML de sessão passa a ser uma visualização gerada de dados e artefatos; não exigir que o modelo refaça apresentação inteira por rodada. Reusar o output existente antes de criar renderer adicional. Publicação externa continua separada da geração de entrega.

## Ciclo 4 — aproveitar melhor modelos capazes

- Começar com um executor; especializar quando houver trabalho independente, ferramenta distinta ou necessidade de revisão separada.
- Planejamento semântico produz estrutura validável e executável. IDs, dependências, ferramentas permitidas, evidências e limites são validados pelo runtime antes do despacho.
- Carregar instruções por fase. Rever `template/.aioson/docs/squad/creation-flow.md`, `template/.aioson/docs/squad/session-operations.md` e `template/.aioson/docs/squad/content-output.md` junto ao preflight.
- Tornar contagem mínima de papéis, DISC, backstory, frameworks obrigatórios e votação recursos opcionais onde não houver ganho demonstrado.
- Aproveitar workers para transformação determinística e modelos para decisões que precisam de interpretação. Não adicionar serviço de IA como dependência para corrigir confiabilidade.

**Avaliação:** corpus inicial de 18 tarefas, seis por domínio, incluindo entradas incompletas e revisão. Reservar exemplos de avaliação que não sejam usados para ajustar prompts. Comparar configuração atual, executor único e especialização adaptativa com mesmas entradas, ferramentas e critérios. Registrar provider, versão/modelo, tentativas e limitações; repetir casos de alta variabilidade.

**Métricas:** aceitação por domínio, retrabalho humano, tempo até entrega aceita, tokens/custo medidos quando disponíveis, contexto realmente carregado e falhas de recuperação. Os 29.240 tokens estimados pelo preflight são uma referência de tamanho, não fatura nem meta de qualidade. Fixar metas numéricas de redução após a primeira medição comparável; não compensar regressão crítica com média melhor.

## Ciclo 5 — feedback que melhora entregas

Introduzir revisão localizada, versões e dependências entre artefatos. Feedback altera somente o escopo pedido; derivados afetados ficam desatualizados até regeneração e verificação. Preservar versões aceitas e permitir comparação/retorno.

Guardar exemplos aprovados com origem, domínio, motivo e validade; recuperar poucos exemplos pertinentes. Levar falhas e escaladas a `src/squad/learning-extractor.js` sem promovê-las automaticamente a regra permanente. Memória de clientes deve respeitar a fronteira do projeto/cliente e permitir exclusão.

**Aceite:** encurtar abertura de uma peça preserva o restante aceito, atualiza os derivados pertinentes e não modifica outro cliente; preferência revogada deixa de ser aplicada.

## Ciclo 6 — retirar o que perdeu função

Inventariar cada comando, agente, skill e script por entrada pública, dependentes, função, substituto e evidência de uso. Classificar: manter, simplificar, tornar opcional, depreciar ou remover.

Ordem: eliminar duplicação de instruções → agrupar help → oferecer substituto → migrar referências/template → testar pacote antigo → remover implementação comprovadamente redundante. Ausência de telemetria local não prova desuso de clientes. Nenhum componente será removido apenas por tamanho ou idade.

**Aceite:** instalação nova e atualização de projeto existente têm caminhos documentados e executáveis; aliases acordados continuam funcionando; dados e entregas anteriores permanecem legíveis. Remover arquivos físicos somente com impacto e substituição demonstrados.

## Revisão do próprio plano e próximos passos

Revisão técnica em duas passagens, sem alegar revisão independente ou aprovação SDD:

- Integridade: acrescentados controle de todos os escritores, reserva de tarefa, compatibilidade entre versões, critério crítico desconhecido e estado separado de execução/avaliação.
- Operação: acrescentados consumidor múltiplo, queda após efeito, corrupção de plano, lock de processo vivo e rollback de banco com efeitos externos.

Pendências de implementação que exigem inspeção localizada: migração exata do esquema de entregas por consumidor; contrato dos leitores legados de status; reuso seguro do mecanismo de lock. São escolhas técnicas a resolver com código e testes no incremento correspondente, não motivos para começar uma reescrita.

**Primeira entrega recomendada:** 1.1 e 1.2, preservação de estado e despacho por dependências, em incrementos verificáveis. Em seguida concluir 1.3–1.6 antes de ampliar autonomia. Correções limitadas podem seguir Dev Simple Plan quando couberem no gate; capacidades novas entram no fluxo de feature com escopo próprio. Este plano não substitui essas aprovações nem altera o onboarding em andamento.

## Progresso de implementação — 25/09/2026

- Itens 1.1–1.4 implementados nos Simple Plans de estado/dependências, conclusão verificada e orçamento/retomada. Commit `dfff698f`.
- Item 1.5, trecho SquadDaemon: recibos por consumidor, recuperação/reconciliação e exclusão de cron. Commit `c4ff9816`. Suíte completa dessa base: 5411 testes passaram, quatro ignorados, zero falhas.
- Item 1.5, consulta de dependências: `peek` consulta eventos pendentes e não expirados sem confirmar nem limpar a fila; autorun filtra pelo squad de origem declarado. Quatro regressões reproduzidas antes da correção; 54 testes de autorun e security-scan passaram após a mudança. Incluem ausência de outra dependência, origem errada, padrões sobrepostos e preservação dos registros expirados/consumidos durante consulta.
- Próximo trecho: associar eventos consumidos por autorun/persistent a uma sessão durável, preservar seu contexto na retomada e confirmar somente após execução aceita. O `consume` usado no despacho ainda confirma antecipadamente; inbox/HTTP também permanece pendente. A correção da consulta não encerra o item 1.5.
- Item 1.6 e ciclos seguintes permanecem pendentes. Commits locais autorizados pelo operador; publicação não realizada.
