---
feature: premium-squad-intelligence
classification: MEDIUM
feature_completeness: required
product_scope: approved
prd_ready: approved
sheldon_review: not_requested
prototype: null
prototype_status: none
prototype_feature: null
interaction_language: pt-BR
created_at: 2026-07-23
source_research: researchs/squad-genome-premium-2026/summary.md
scope_expansion: .aioson/context/features/premium-squad-intelligence/scope-expansion.md
---

# PRD — Premium Squad Intelligence

## Vision

Fazer o AIOSON criar e operar squads realmente especializadas: composição proporcional à tarefa, pesquisa atual e auditável quando o resultado depende do mundo externo, genomes que mudam de forma comprovável o trabalho dos executores e gates que só declaram qualidade ou conclusão quando existe evidência real.

## Problem and users

O AIOSON já possui um pacote de squad completo, pesquisa compartilhada, bindings de genomes, validação, score, autorun e um método documentado de avaliação. A promessa atual, porém, é mais forte que a execução:

- a pesquisa obrigatória pode ser satisfeita apenas por cache e o worker não descobre fontes novas;
- criação, validação e eval possuem defaults contraditórios ou dependem de execução mental;
- um binding de genome pode existir no manifesto sem alterar o comportamento do executor;
- uma tarefa sem worker pode ser marcada como concluída;
- presença de campos e arquivos recebe crédito sem provar profundidade, frescor ou resultado.

Usuários:

- Operador que cria um squad e precisa confiar que “premium” representa profundidade executável, não volume de prompts.
- Executor/orquestrador do squad que precisa receber o contexto atual, método e direitos de decisão corretos sem duplicar pesquisa.
- Revisor que precisa rastrear cada conclusão até fonte, executor, decisão e saída.
- Autor de genomes que precisa provar que o método foi compilado, aplicado e melhorou o critério declarado.

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-premium-evidence | Uma tarefa dependente de fatos externos ou atuais usa pesquisa viva controlada e entrega evidência citável, fresca e rastreável | Criação/execução de squad classificada como externa, especializada, regulada, recorrente ou sensível a atualidade | required | Cache sem revalidação e URLs fixas não sustentam a promessa de informação nova |
| CAP-premium-composition | O squad usa o menor conjunto competente de responsáveis, revisores e especialistas necessários à tarefa, inclusive em português | Design, criação, extensão ou planejamento de squad | required | Mais agentes podem diluir expertise; a composição deve seguir trabalho e direitos de decisão |
| CAP-premium-genome | Um genome vinculado altera de forma verificável o método, restrições, checklist ou contrato de saída dos executores corretos | Aplicação, criação, reparo ou execução com genome | required | Metadado sem efeito operacional não potencializa resultado |
| CAP-premium-runtime-truth | O runtime nunca chama de concluído o trabalho que não foi executado ou não possui evidência mínima de saída | Autorun, worker, retry, timeout ou ausência de executor executável | required | Falso sucesso invalida score, aprendizado e confiança do operador |
| CAP-premium-assurance | Validação e avaliação executáveis comprovam estrutura, fontes, frescor, aplicação de genomes e desempenho em tarefas não usadas na geração | Fechamento de squad persistente/regulado, CI, refresh ou preparação para uso | required | Self-review e presença de campos não provam desempenho |
| CAP-premium-compatibility | Squads e genomes legados continuam legíveis e atualizáveis, com migração aditiva e estados explícitos | Leitura, validação, reparo ou execução de pacote existente | required | A evolução não pode remover contratos e inteligência já entregues |

## Current System Fit

| CAP | Existing behavior / evidence | Fit decision | Required product delta |
|---|---|---|---|
| CAP-premium-evidence | `.aioson/docs/squad/research-loop.md` exige um scouting leve e `src/worker-runner.js` reutiliza cache de sete dias ou coleta somente `research.urls`; sem URLs/cache, falha sem descobrir fontes | extend | Preservar cache e sanitização, mas tornar a pesquisa viva uma etapa controlada por risco/frescor, com descoberta, revalidação e Evidence Pack |
| CAP-premium-composition | `.aioson/tasks/squad-create.md` gera executores profundos; `src/commands/squad-role-scan.js` extrai termos/ações com listas em inglês; `src/squad/task-decomposer.js` já decompõe objetivos, atribui executores e dependências; `src/squad/agent-teams-adapter.js` traduz o roster existente para execução em equipe | extend | Manter pacote, decomposição e fallbacks atuais, acrescentando composição orientada à tarefa, direitos de decisão, especialistas temporários e descoberta multilíngue |
| CAP-premium-genome | `.aioson/docs/squad/genome-bindings.md` define propagação operacional, mas `src/squads/genome-binding-service.js` atualiza blueprint, manifest e readiness; `src/genomes/bindings.js` normaliza o binding sem preservar `status` | extend | Compilar e comprovar o efeito do genome nos executores, preservar lifecycle/dependências/conflitos e impedir readiness premium para bindings pendentes ou sem efeito |
| CAP-premium-runtime-truth | `src/commands/squad-autorun.js` cria `{ ok: true, noScript: true }` quando não encontra worker e depois marca a tarefa como `completed` | replace | Ausência de execução deve produzir estado acionável não concluído; conclusão exige worker executado e evidência mínima persistida |
| CAP-premium-assurance | `.aioson/agents/squad.md` exige eval por padrão, enquanto `.aioson/docs/squad/eval-gate.md` e `.aioson/tasks/squad-eval.md` o tratam como opt-in; `src/cli.js` não registra `squad:eval`; `src/commands/squad-validate.js` faz checagens próprias sem executar `template/.aioson/schemas/squad-manifest.schema.json`; `src/commands/squad-score.js` pontua presença de objetos | replace | Alinhar um único gate real, estrito e executável, incluindo tarefas held-out, evidência por critério e dimensões que não se mascaram |
| CAP-premium-compatibility | `src/genomes/bindings.js` já aceita `genomes`, `genomeBindings` e bindings legados de executores; testes como `tests/integration/genome-binding-contract.test.js` protegem leitura entre formatos | extend | Preservar essas entradas e comandos, acrescentar normalização/versionamento premium, paridade template/workspace e mensagens explícitas de fallback/migração |

## MVP scope

### Must-have

- Classificar cada trabalho como `live-required`, `live-check`, `cache-eligible` ou `closed-world`, usando risco e volatilidade. A recomendação segura é aplicada automaticamente; somente um trade-off material para o usuário pode interromper o autopilot.
- Para `live-required` e `live-check`, executar descoberta/revalidação atual antes da síntese. Cache é semente, não prova automática de atualidade.
- Persistir um Evidence Pack ligado à execução com consulta, política de frescor, fontes, horários de publicação/coleta quando disponíveis, hash, claims suportadas, contradições, lacunas e citações.
- Exigir fontes primárias para afirmações normativas/técnicas quando disponíveis e ao menos uma fonte independente para claims materiais contestáveis; snippets de busca não contam como evidência final.
- Permitir `closed-world` somente quando a tarefa usa exclusivamente material privado/fornecido pelo usuário ou quando rede é explicitamente inadequada; registrar `not-applicable` sem penalizar qualidade e sem acessar a internet.
- Compor squads a partir do trabalho necessário: um núcleo persistente pequeno e especialistas específicos da tarefa quando agregarem competência. Cada decisão material possui owner; cada revisão possui reviewer independente ou exceção explícita; expertise relevante tem precedência sobre votação ingênua.
- Extrair sinais de papéis e domínio em, no mínimo, inglês e português, sem regressão da contenção de paths e da leitura de `sourceDocs`.
- Separar facts atuais de métodos estáveis: facts vivem no Evidence Pack; o genome fornece procedimentos, heurísticas, proibições, checklist, estilo e estrutura de saída.
- Preservar estados de binding como `pending`, `resolved`, `compiled`, `conflicted`, `stale` e `removed`, além de versão e identidade da compilação. Um binding premium só fica pronto quando o efeito operacional está materializado nos executores destinados.
- Propagar seções aplicáveis do genome para o comportamento real: procedimento na resposta, proibições nas restrições, checklist no gate e estilo/estrutura no contrato de saída. Conflitos, dependências ausentes e efeito nulo são visíveis e impedem readiness premium.
- Tratar worker ausente, timeout, saída inválida e evidência insuficiente como `failed` ou `escalated`, nunca `completed`. Retry e correção preservam a trilha anterior.
- Fazer `squad:validate --strict` executar o schema canônico e validar estrutura, profundidade, fontes/evidência, bindings compilados, paths contidos e coerência entre manifest, prompts, checklists e workflows.
- Disponibilizar um `squad:eval` real e reproduzível. O fechamento padrão de squad persistente ou regulado exige validação estrita e eval; Quick Scan efêmero pode adiar eval com motivo explícito.
- Avaliar fidelidade às fontes e desempenho em tarefas held-out. Para genomes, comparar a mesma tarefa com e sem o binding, expondo regressões, não regressões e melhoria nos critérios-alvo sem fabricar uma nota única.
- Manter uma trilha `fonte → claim → executor → decisão → saída → critério de avaliação`, com estados `pass`, `warn`, `fail`, `unverified` e `not-applicable` separados.
- Promover aprendizado para o playbook somente após uma correção generalizável passar por nova avaliação held-out; nunca aprender com falso sucesso ou apenas com autocorreção no mesmo exemplo.
- Preservar, de forma estritamente aditiva, a inteligência atual de expansão/completude, pacote canônico, `sourceDocs`, `investigation`, `genomes`, `genomeBindings`, aliases, contratos CLI e arquivos oficiais de agentes.

### Recommended MVP already approved

- Política de frescor proporcional à volatilidade, em vez de um TTL global fixo.
- Adaptador de pesquisa neutro quanto a provedor, com fallback explícito e sem alegar pesquisa viva quando indisponível.
- Composição dinâmica com especialistas temporários para tarefas específicas, sem transformar todo especialista em membro permanente.
- Proveniência de execução e comparação controlada com/sem genome.
- Relatórios legíveis pelo operador com bloqueio, owner e próxima ação concreta.

## Out of scope

- Obrigar internet em tarefas `closed-world`, privadas ou compostas apenas de material do usuário.
- Fazer todos os executores pesquisarem a mesma questão de forma independente.
- Embutir notícias, preços, leis ou outros fatos voláteis dentro de genomes.
- Fixar um provedor de busca ou modelo LLM como única implementação aceita.
- Criar um roster grande por padrão ou decidir por média/votação quando a expertise é desigual.
- Garantir que todo genome sempre melhore todo tipo de tarefa; o produto deve medir e informar o efeito.
- Criar UI nova ou redesenhar o dashboard nesta entrega.
- Publicar squads/genomes, executar `feature:close` ou promover aprendizados automaticamente sem os gates existentes.
- Remover campos legados, alterar silenciosamente manifestos do usuário ou aplicar genomes a `.aioson/agents/`.

## User flows

### Criar um squad premium

O operador descreve domínio, objetivo e saída → o sistema identifica o trabalho, pesquisa necessária e decisões → consulta cache como semente e faz checagem viva quando exigida → propõe o menor time competente com owners/reviewers → gera o pacote e bindings → valida schema/consistência → executa eval held-out → mostra `ready`, `warn` ou `fail` com evidências e ações. Não há confirmação para defaults recomendados; o fluxo pausa apenas para uma decisão material sem resposta segura.

Falhas visíveis: pesquisa indisponível ou insuficiente, fonte contraditória, especialista obrigatório ausente, binding pendente, pacote inválido ou eval reprovado. Nenhuma dessas situações é apresentada como squad premium pronta.

### Executar pesquisa atual

Uma tarefa depende de informação externa → a política determina o frescor → uma etapa responsável descobre e verifica fontes → cada claim material recebe suporte/citação ou fica `unverified` → os demais executores consomem o Evidence Pack comum → a saída mostra evidência e lacunas sem executar buscas redundantes.

Se a rede/provedor falhar, o sistema usa somente cache permitido pela política e declara a limitação; para fatos atuais não pode converter cache stale em confirmação.

### Aplicar um genome

O operador ou fluxo de criação seleciona um genome → dependências, versão e conflitos são resolvidos → o método é compilado nos executores corretos → prompts/checklists/contratos refletem o vínculo → o diagnóstico mostra o que mudou e a identidade da compilação → uma tarefa held-out compara execução com/sem genome.

Se o genome estiver ausente, pending, stale, conflitante ou não produzir efeito operacional, o binding permanece visível e o gate premium não aprova.

### Executar e avaliar

O autorun despacha uma tarefa para um executor realmente executável → registra início, evidências e saída → somente então pode concluir → falhas e retries preservam histórico → o eval mede fidelidade, frescor, citações, resultado e contribuição do genome por dimensão.

Se não houver worker/executor, a tarefa fica falha ou escalada com comando/ação corretiva; nunca entra em contagem de concluídas nem alimenta aprendizados.

### Atualizar um squad legado

O sistema lê o formato existente → normaliza em memória sem apagar campos → informa lacunas premium → o operador pode reparar/atualizar → testes e validação comprovam que comandos e comportamentos anteriores continuam válidos.

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-premium-01 | CAP-premium-evidence | Uma tarefa marcada `live-required` executa descoberta/revalidação atual e persiste Evidence Pack antes da síntese; cache sozinho não permite `pass` | teste focado com cache stale + execução CLI integrada |
| AC-premium-02 | CAP-premium-evidence | Claims materiais do resultado apontam para fontes coletadas, timestamps/hash e estado de suporte/contradição; fonte indisponível gera `unverified` visível | teste de proveniência + inspeção do artefato |
| AC-premium-03 | CAP-premium-evidence | Uma tarefa `closed-world` não acessa rede, registra `not-applicable` e continua sem penalidade | teste com adapter de rede sentinela |
| AC-premium-04 | CAP-premium-evidence | Política de frescor diferencia fato volátil de conhecimento estável e exige live check para o primeiro | matriz de testes determinísticos de risco/volatilidade |
| AC-premium-05 | CAP-premium-composition | O design registra tarefas, owners, reviewers, direitos de decisão e justificativa de cada executor; papéis sem contribuição são recusados ou removidos | fixture de design + validação strict |
| AC-premium-06 | CAP-premium-composition | Fontes equivalentes em pt-BR e inglês produzem sinais úteis de entidades/ações e candidatos de papel sem escapar do projeto | testes multilíngues e de traversal |
| AC-premium-07 | CAP-premium-composition | Uma tarefa especializada pode adicionar especialista temporário sem inflar o roster persistente, preservando owner de integração | execução de fixture com tarefa dinâmica |
| AC-premium-08 | CAP-premium-genome | Binding `pending` sobrevive a normalização/persistência e não é considerado compiled/ready | teste unitário + round-trip de manifest legado/novo |
| AC-premium-09 | CAP-premium-genome | Binding resolvido materializa as seções aplicáveis nos executores/checklists/contratos destinados e registra versão/identidade de compilação | teste de integração de aplicação + inspeção dos arquivos |
| AC-premium-10 | CAP-premium-genome | Dependência ausente, conflito ou compilação stale aparece com owner/ação e bloqueia readiness premium | fixtures de diagnóstico e validate strict |
| AC-premium-11 | CAP-premium-genome | Eval compara tarefa held-out com/sem genome, reporta dimensões separadas e não alega melhoria quando não houver evidência | execução A/B determinística com regressão e melhoria semeadas |
| AC-premium-12 | CAP-premium-runtime-truth | Ausência de worker/executor retorna estado não concluído, não incrementa completed e não gera aprendizado de sucesso | teste de autorun pelo caminho CLI/runtime |
| AC-premium-13 | CAP-premium-runtime-truth | Timeout, saída inválida e falha parcial preservam tentativas e evidências e terminam em failed/escalated | testes de retry/timeout/partial output |
| AC-premium-14 | CAP-premium-assurance | `squad:validate --strict` executa o schema canônico e falha em campos/paths/evidências/bindings incoerentes que hoje passam como warning ou presença | testes schema/CLI/JSON e fixtures inválidas |
| AC-premium-15 | CAP-premium-assurance | `squad:eval` existe no help e CLI, executa rubric source-grounded + tarefas held-out e persiste relatório reproduzível | teste CLI end-to-end + relatório validado |
| AC-premium-16 | CAP-premium-assurance | Squad persistente/regulada não fecha como pronta sem strict + eval; Quick Scan só adia com razão explícita | cenários de default, regulated e ephemeral |
| AC-premium-17 | CAP-premium-assurance | Falha crítica em qualquer dimensão permanece visível e não é mascarada por score total; score de genome exige efeito, não objeto vazio | testes de scoring/gate com falha semeada |
| AC-premium-18 | CAP-premium-assurance | Playbook só promove regra após nova tarefa held-out aprovar a correção e preserva a origem da mudança | teste de promoção aceita/recusada |
| AC-premium-19 | CAP-premium-compatibility | Fixtures com `sourceDocs`, `investigation`, `genomes`, `genomeBindings` e bindings por executor continuam legíveis e executáveis sem perda | regressão de compatibilidade e round-trip |
| AC-premium-20 | CAP-premium-compatibility | Novos campos/flags são aditivos, template e workspace permanecem em paridade, e nenhum genome modifica agentes oficiais | testes de CLI/help/i18n/paridade + guard de paths |

## Success metrics

- 100% das tarefas `live-required` aprovadas possuem Evidence Pack atual e claims materiais rastreáveis.
- Zero tarefa sem worker/executor executado contabilizada como `completed`.
- 100% dos bindings `compiled` demonstram efeito operacional e identidade de versão/compilação.
- 100% dos squads persistentes/regulados entregues como `ready` passaram por validação strict e eval atual.
- 100% das avaliações com genome mostram comparação por dimensão; zero alegação de melhoria sem evidência.
- 100% das falhas críticas permanecem visíveis mesmo quando outras dimensões passam.
- Fixtures legadas de squad/genome mantêm leitura e comportamento, e a suite existente não sofre regressão.
- Pesquisa e especialistas adicionais são proporcionais: uma etapa comum de evidência e o menor time capaz, sem duplicação automática por executor.

## Prototype contract

- status: none
- feature: premium-squad-intelligence
- prototype: none
- manifest: none
- excluded historical references: none
- implementation baseline: comportamento inspecionado no repositório e contratos CLI atuais.
- approved deviations: none.

## Research basis

A pesquisa recente registrada em `researchs/squad-genome-premium-2026/summary.md` reforça cinco decisões de produto: composição condicionada à tarefa, proteção contra diluição de especialistas, frescor proporcional ao risco, proveniência de claims/execução e avaliação held-out. Essas evidências orientam o contrato; não adicionam funcionalidades fora do resultado aprovado.

## Visual identity

Não há nova superfície visual obrigatória. Saídas CLI e relatórios devem seguir o estilo atual do AIOSON, priorizando estados claros, dimensão afetada, evidência, owner e próxima ação sem depender apenas de cor ou score agregado.

## Open questions

- Nenhuma questão bloqueante.
- Adaptadores de busca adicionais, dashboard de proveniência, presets de domínio, otimização de custo entre provedores e aprendizado autônomo permanecem adiados.
- O Planner deve selecionar a menor sequência vertical que preserve compatibilidade e torne cada gate verdadeiro antes de ampliar qualidade adaptativa.
