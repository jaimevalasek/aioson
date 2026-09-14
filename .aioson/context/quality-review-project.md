# Revisão de qualidade — ciclo de documentação e planejamento do AIOSON

> Atualização de 09/09/2026: recomendações implementadas e verificadas. O texto abaixo preserva o diagnóstico original. Veja [implementação e evidências finais](implementation-verification-sdd-delivery-reliability.md).

**Data:** 08/09/2026, America/Sao_Paulo. **Perfil:** framework. **Versão:** 1.65.0. **Node:** v24.19.0.
**Revisão Git:** `f92e6e126fa0c8f150fc27025fdb09d617e7c6c2`, com alterações locais anteriores à auditoria, inclusive a nova área de qualidade. As conclusões descrevem esse working tree, não exclusivamente o commit publicado.

O fluxo tem uma boa base de Spec-Driven Development: preservação de fontes, aprovação explícita, revisão independente, critérios observáveis, adequação ao sistema existente e entrega vertical. A prioridade é alinhar instruções e validações. Há contratos contraditórios e casos em que um plano mecanicamente aceito ainda deixa decisões ou critérios sem implementação definida.

Foram encontrados cinco grupos de problemas confirmados e uma lacuna de medição. Não foram alterados agentes, regras, validadores, gates ou estado da feature ativa. Esta entrega contém análise, pesquisa e sondas isoladas; as melhorias abaixo ainda são propostas.

## Escopo e método

- Leitura dos cinco kernels canônicos, módulos de qualidade do Product/Sheldon, craft do Briefing, skill SDD e referência Planner, revisão de especificação, regras e contratos de completude.
- Inspeção de source lineage, PRD lint, completude, revisão por hash, Gate C, integridade do harness, análise de specs e comando de planos.
- Duas passagens: coerência dos contratos; reprodução dos casos encontrados e avaliação do risco das recomendações.
- 23 arquivos de testes executados: **287 testes passaram, zero falhas e zero skips**. Incluem roteamento do contexto distribuído, fonte, Refiner, PRD, plano, revisão, handoff, gates e harness.
- Sondas em projeto temporário com `feature_completeness: required`, PRD com fit e dois ACs, plano e revisão Sheldon selada pelo helper de testes. O helper fornece o selo estrutural da fixture; não representa uma revisão real de produto por modelo.
- Os cinco kernels locais têm os mesmos hashes dos respectivos templates.

Evidências persistidas em [researchs/aioson-sdd-cycle-2026-09-08](../../researchs/aioson-sdd-cycle-2026-09-08/summary.md). O contexto do projeto foi validado pelo CLI. O `quality:run --profile=framework --dry-run --json` descobriu lint, testes de qualidade, cobertura e análise estática; foi substituído, para este escopo, pela seleção explícita de testes de contratos. A suíte total, cobertura global, Fallow e benchmarks não foram executados.

## Avaliação por etapa

| Etapa | Inteligência já existente que deve ser preservada | Melhoria mais útil |
|---|---|---|
| Briefing | Evidência antes de perguntas; fontes heterogêneas; SRC/PROM com fingerprint; fatos separados de hipóteses; JTBD e opções; questões classificadas | Corrigir módulos antigos que ainda pulam o Refiner; testar a preservação de promessas e incertezas em exemplos completos |
| Refiner | Revisão independente; escolhas estruturadas; aplicação via CLI; proteção contra feedback stale; protótipo com dono; recomendação não vira aprovação | Exercitar todo o percurso de uma decisão aceita, rejeitada e pendente até Product/Planner; preservar limites de rodada e autorização |
| Product | PRD único; CAP/AC; Source Coverage; Current System Fit; exclusões; alternativas fundamentadas; delta de valor | Usar exemplos de entrada/estado/resultado nas ACs ambíguas, dentro da estrutura atual; medir fidelidade às decisões recebidas |
| Sheldon | Duas passagens; contestação do uso futuro; regras e branches; expansão com critério; revisão ligada a hashes | Manter a revisão independente e testar se identifica contraexemplos que passam no lint; não confundir selo estrutural com mérito da solução |
| Planner | Repositório inspecionado; reutilização explícita; deltas por arquivo; fases verticais; controles proporcionais; ADR/interface quando necessários | Fechar AC → fase → verificação; alinhar o parser ao formato emitido; vincular plano à revisão consumida; resolver o impasse do harness |

Product e Sheldon já possuem lentes de jornada completa, passagem entre atores, combinação de capacidades, simplificação e hipóteses de valor. Não há fundamento para substituir essas lentes por mais checklists. O próximo ganho está em torná-las verificáveis em casos reais.

Como amostra histórica, o plano arquivado de `briefing-review-decision-room` registra deltas exatos, compatibilidade do feedback e verificação pelo navegador. Essa leitura mostra o detalhamento disponível; não mede a qualidade média do fluxo, e os caminhos antigos da amostra não foram tratados como defeitos atuais.

## F1 — Gate C cobra um artefato que o Planner manda criar depois

**Prioridade alta · confirmed · responsável sugerido: Dev, contrato Planner/Gate C.**

O [Planner](../../template/.aioson/agents/planner.md:25) proíbe produzir harness e [instrui](../../template/.aioson/agents/planner.md:152) incluir uma tarefa para o Dev criá-lo. Entretanto, [Gate C](../../src/commands/gate-check.js:131) já chama o validador que exige o arquivo existente quando há sinal de runtime.

**Reprodução:** `plannedHarnessAuthoredByDevLater` em `probes.json`: a presença do manifesto de protótipo faz o validador retornar `missing_runtime_contract`. Uma tarefa futura no plano não satisfaz essa verificação. A sonda isola o validador de harness; não simula aprovação de um protótipo completo.

**Impacto:** a sequência prescrita não consegue chegar ao Dev sem um desvio de responsabilidade ou uma criação antecipada não permitida ao Planner. A skill SDD ainda descreve harness como opcional, sem esclarecer esta exigência específica.

**Recomendação:** Gate C valida a obrigação explícita de produzir os critérios runtime e sua cobertura no plano; Dev materializa o contrato, e as transições pós-implementação continuam exigindo RG-* e execução real. Um contrato já presente deve continuar sendo validado. Alternativa: permitir ao Planner gerar somente o esqueleto técnico, mas isso exige alterar sua responsabilidade e deve ser uma decisão explícita de contrato.

**Aceite:** feature visual nova passa C com a obrigação válida; Dev/QA continuam bloqueados sem o contrato/evidência necessários; uma feature não visual não ganha esse requisito; alterações de outra feature não contaminam o sinal. Testes-alvo: `harness-contract-integrity`, `feature-completeness-integration`, `workflow-engine-hardening`.

## F2 — Validação do plano não fecha a rastreabilidade de ACs e fases

**Prioridade alta · confirmed · responsável sugerido: Dev, completude/spec:analyze.**

Em [validateDeliveryPlan](../../src/lib/feature-completeness.js:382), fase e verificação são conferidas como células preenchidas. Não se verifica aqui se a fase existe ou se seus ACs correspondem aos critérios do PRD. O rastreamento de ACs em [spec:analyze](../../src/commands/spec-analyze.js:231) ainda depende da existência de `requirements-{slug}.md`, documento que o fluxo atual não produz.

**Reproduções:**

- Plano sem seções de fase, citando fase `999`: Gate C `PASS`.
- Plano troca `AC-demo-02` por `AC-ghost-99` e o comando automatizado por `banana`: Gate C `PASS`; `spec:analyze` retorna zero findings.
- O plano normal da mesma fixture passa antes das mutações, com dois ACs no PRD e fit válido.

**Impacto:** uma CAP coberta pode esconder um caminho de erro omitido ou referência a critério inexistente. Um campo preenchido não demonstra que a etapa seja executável.

**Recomendação:** usar ACs do PRD como autoridade canônica; conservar a leitura de requirements somente para contratos legados. Construir uma representação compartilhada das fases para conferir IDs existentes, cobertura de cada AC obrigatório e consistência com Delivery/Delta. Resolver scripts/comandos conhecidos pelo manifest do projeto; comandos específicos ainda não resolvíveis recebem diagnóstico proporcional, sem execução automática durante planejamento.

**Aceite:** detectar AC omitido/desconhecido, fase inexistente/duplicada e verificação-placeholder; aceitar fases válidas em pt-BR/en, um CAP com vários ACs, critérios transversais explicitamente relacionados e planos legados compatíveis. Não impor uma relação artificial de um AC com apenas um arquivo. Testes-alvo: `feature-completeness`, `feature-completeness-integration`, `spec-analyze`.

## F3 — O plano não acompanha de modo confiável a versão do PRD

**Prioridade média · confirmed · responsável sugerido: Dev, comando de planos e baseline do gate.**

O [comando stale](../../src/commands/implementation-plan.js:245) devolve `stale: false` quando não há `created`, campo que o exemplo canônico do Planner não exige. Com `created`, consulta uma lista fixa que contém `prd.md`, mas não o PRD da feature nem `source_prd`. O [registro](../../src/commands/implementation-plan.js:294) também lista fontes globais. O hash desse helper deriva de mtimes, não dos bytes do conteúdo.

**Reprodução:** PRD da feature posterior à data declarada do plano, com contexto global mais antigo: `featurePrdNewerThanPlan.stale === false`.

Há uma segunda fronteira: mudar o PRD mantendo `sheldon_review: approved` bloqueia C por revisão stale, corretamente. Depois de selar a revisão nova, o mesmo plano antigo volta a passar C. O selo atesta o PRD corrente; não demonstra qual revisão originou o plano.

**Recomendação:** consultar `source_prd` e a resolução canônica de artefatos; ausência de baseline deve ser `unknown`, não atestado de frescor. Registrar hash/review ID consumido pelo plano ou checkpoint e oferecer análise do delta quando mudar. Alterações irrelevantes devem poder ser reconciliadas explicitamente; não forçar replanejamento completo por qualquer edição de texto.

**Aceite:** detectar mudança real no PRD correto; ignorar PRD de outra feature; tratar falta de metadados sem falso frescor; preservar recuperação de execução iniciada, arquivos `create` já produzidos e `retire`. Para artefatos antigos, começar com diagnóstico e migração explícita em vez de invalidar todas as features abertas.

## F4 — O leitor de planos não interpreta o formato canônico

**Prioridade média · confirmed · responsável sugerido: Dev, implementation-plan.**

[countPhases](../../src/commands/implementation-plan.js:124) reconhece somente `### Fase N`. O Planner produz `## Phase N — resultado`. O [parser de frontmatter](../../src/commands/implementation-plan.js:109) reconhece LF, mas não CRLF.

**Reprodução:** um plano canônico com uma fase é mostrado como zero fases. A mesma fixture em CRLF retorna `meta: {}`, perdendo `status: approved`.

**Impacto:** exibição e registro de progresso incorretos, especialmente no Windows. Os testes atuais usam justamente o formato antigo que o parser reconhece.

**Recomendação:** reutilizar parsers existentes de Markdown/frontmatter e normalizar finais de linha. Verificar também a precedência entre o arquivo canônico e `.aioson/plans/{slug}/manifest.md`; essa precedência foi identificada no código, mas não foi classificada como falha reproduzida nesta auditoria.

**Aceite:** contar fases nos formatos canônico e legado, sem contar títulos em exemplos de código ou notas; interpretar LF/CRLF e registrar progresso preservando a API pública. Teste-alvo: `implementation-plan.test.js`.

## F5 — Módulos e regras legados contradizem o fluxo distribuído

**Prioridade média · confirmed documental; efeito sobre execução do modelo não medido · responsável sugerido: Dev, templates e roteamento.**

- [briefing-craft](../../template/.aioson/docs/briefing/briefing-craft.md:42), módulo vivo carregado para briefings fracos, reafirma `briefing → product`; o kernel exige `briefing → refiner → aprovação → product`.
- [spec-level-ownership](../../template/.aioson/rules/spec-level-ownership.md:29) obriga criar spec da feature no início do Dev; a skill SDD e os agentes atuais proíbem a cadeia paralela. A regra continua no template distribuído, não apenas em arquivo histórico.
- A opcionalidade genérica do harness precisa esclarecer a obrigação de runtime e sua etapa, conforme F1.

**Impacto:** a escolha de instrução pode depender do módulo recuperado. Como regras têm precedência sobre o PRD, a contradição pode reintroduzir documentos e etapas retirados.

**Recomendação:** manter proteção para leitura/manutenção de specs legadas, retirando a obrigação de criá-las no fluxo atual. Corrigir o handoff do craft. Acrescentar testes cruzados entre kernel, regra, referência e gerador, não só testes que procuram uma frase isolada.

**Aceite:** módulos selecionáveis não contradizem o contrato canônico; histórico continua legível; nenhuma nova criação obrigatória de spec; Refiner preservado. Executar `agent-contracts`, `briefing-agent-kernels`, `sdlc-process-upgrade-regression` e `context-evals-shipped`.

## F6 — A inteligência documental ainda não foi medida nesta avaliação

**Prioridade média · unmeasured · responsável sugerido: Quality/Tester para avaliação; Dev para correções.**

Os 287 testes medem comportamento de código, contratos de prompts e recuperação de contexto. O [corpus novo de qualidade](../../template/.aioson/quality/evals/core.json:4) se declara um conjunto de 20 microtarefas de reparo, não uma avaliação da cadeia documental. Não se pode converter esses resultados em nota de criatividade, qualidade do plano ou garantia de implementação completa.

**Recomendação:** adicionar um corpus pequeno de jornadas de documentação, com entradas e decisões congeladas, resultados avaliados independentemente e exemplos que o prompt não tenha recebido como resposta esperada. Comparar antes/depois com configuração de modelo e ferramentas fixada. Não usar autoavaliação do agente como veredito.

Casos iniciais: pacote SQL/misto com promessa ambígua; produto sem UI; extensão brownfield com regra existente; protótipo de outra feature; feedback aceito/rejeitado/pendente; alteração de fonte após aprovação; mudança de PRD após plano; indisponibilidade de integração; duas alternativas plausíveis com exclusão explícita; cenário que exige preservar comportamento antigo.

Medidas úteis: promessas aprovadas perdidas; decisões pendentes promovidas indevidamente; ACs omitidos; arquivos inventados; contradições entre etapas; perguntas repetidas apesar de evidência; reuso verificado; benefício específico das melhorias propostas; custo e número de rodadas, quando instrumentados. Não premiar quantidade de CAPs ou tamanho da documentação.

## Evolução da inteligência sem ampliar a burocracia

1. **Briefing/Refiner:** nos riscos decisivos, registrar dentro das seções existentes a hipótese, a evidência disponível e o menor teste que pode refutá-la. O craft já recomenda isso; o ganho é provar o comportamento em avaliações.
2. **Product/Sheldon:** fortalecer apenas ACs ambíguos com precondição, ação, resultado e contraexemplo relevante. Exemplo: envio duplicado preserva um único resultado e informa o estado existente. Não introduzir cenários de concorrência quando a superfície não os implica.
3. **Planner:** cada controle material deve apontar para uma fase e prova específica. Antecipar uma incerteza técnica decisiva na primeira fatia que a exercita, mantendo resultado observável e o caminho de produção.
4. **Mudanças de escopo:** apresentar o impacto nos CAP/AC/fases existentes e manter IDs estáveis. O plano só é reconciliado com a nova autoridade após registrar o delta necessário.
5. **Expansão:** manter scouts e lentes criativas, distinguindo melhoria necessária, oportunidade opcional e exclusão. A avaliação deve penalizar tanto a omissão de valor importante quanto o crescimento sem autorização.

Essas propostas se apoiam em requisitos claros e rastreáveis ([NASA](https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/)), análise cruzada de artefatos ([Spec Kit](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/analyze.md)) e explicitação de deltas ([OpenSpec](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/overview.md)). São princípios aplicáveis ao contrato enxuto do AIOSON, não uma recomendação de copiar as respectivas cadeias documentais.

## Sequência de implementação proposta

| Ordem | Entrega revisável | Proteção contra regressão |
|---|---|---|
| 1 | Regressões reproduzíveis para F1–F5, preservando fixtures válidas e legadas | Cada teste deve falhar pelo defeito esperado antes da correção |
| 2 | Parser de planos e correções pontuais de craft/spec ownership | API pública, localização, paridade template/local, corpus de roteamento |
| 3 | Contrato de runtime por estágio e rastreabilidade AC/fase | Mesma regra em Gate C, preflight, handoff e conclusão; sem enfraquecer Dev/QA |
| 4 | Baseline de origem do plano e reconciliação de mudanças | Migração de planos antigos; stale explícito; preservação de recuperação e execução iniciada |
| 5 | Piloto comportamental dos cinco agentes | Avaliação independente antes/depois; ampliar prompts somente com evidência de ganho |

As mudanças de validação precisam começar em contratos novos/explicitamente versionados ou modo de diagnóstico para legados. Um gate mais estrito aplicado retroativamente pode gerar bloqueios sem benefício. Preservar nomes de comandos, schemas públicos, Simple Plan, approval do Briefing, duas passagens, revisão Sheldon, evidência real e inteligência de expansão.

## Verificações e limites

| Medição | Resultado | Evidência |
|---|---|---|
| `aioson context:validate . --json` | pass | Contrato de contexto válido, versão 1.65.0 |
| 16 arquivos de testes do ciclo | pass: 185/185 | [tests.log](../../researchs/aioson-sdd-cycle-2026-09-08/files/tests.log) |
| 7 arquivos de testes complementares | pass: 102/102 | [additional-tests.log](../../researchs/aioson-sdd-cycle-2026-09-08/files/additional-tests.log) |
| Mutações de plano/PRD e parser | fail na detecção dos defeitos descritos; baseline válido passa | [probes.json](../../researchs/aioson-sdd-cycle-2026-09-08/files/probes.json) |
| PRD modificado com selo antigo | pass: Gate C bloqueia | `changedPrdBeforeReseal` nas sondas |
| Harness exigido antes do Dev | impasse confirmado | `plannedHarnessAuthoredByDevLater` nas sondas |
| Paridade dos cinco kernels | pass | SHA-256 template/local iguais |
| Suíte total, análise estática e cobertura global | not_run | Escopo limitado a documentação e gates |
| Comparação comportamental por modelo, custo e criatividade | not_run | Nenhum executor de modelo foi acionado |

Não é possível prometer ausência absoluta de regressões. A evidência permite propor correções delimitadas e uma validação que preserve os contratos atuais. Próximo responsável recomendado: **@dev**, começando pelas reproduções de F1/F2 e pela correção isolada do parser, antes de ampliar instruções dos agentes.

## Complemento — fechamento com pendências pequenas, sem features esquecidas

**Solicitação posterior do usuário:** uma feature implementada e funcionando não deve continuar indefinidamente em andamento por pendências mínimas do Gate D; deve poder ser encerrada/arquivada e deixar a correção para um Simple Plan. Esta seção propõe essa política; não fecha features existentes nem altera gates.

### O que existe hoje

`feature:close` aceita somente `PASS` e `FAIL`. Há `--residual`, `--preflight` e `--force`; este último pode ignorar bloqueios de completude/harness e gravar `done/{slug}/force-bypass-findings.json`. Esse caminho não distingue automaticamente baixo impacto nem cria um Simple Plan. Portanto, tornar `--force` automático seria mais amplo que a preferência expressa.

`feature:archive` espera status `done`; o fechamento atual mantém `qa_failed` no caso de FAIL. O kernel QA encerra a automação mesmo em PASS para aguardar fechamento humano. Assim, há dois motivos distintos para acúmulo: reprovação/pendência real e entrega aprovada aguardando fechamento. O relato de frequência do usuário não foi quantificado nesta auditoria.

### Política proposta

Separar resultado de QA de estado administrativo: a feature pode estar **concluída e arquivada com pendências registradas**, enquanto o relatório preserva o que passou, o que falhou e o que foi aceito para depois. Usar um resultado explícito como `accepted_with_followups` (nome proposto, ainda não suportado), mantendo `done` no índice para compatibilidade, acompanhado de metadados de fechamento e links para as correções. Nenhum AC que falhou deve ser reescrito como PASS.

| Pendência | Tratamento proposto |
|---|---|
| Metadado, referência ou evidência já existente mal ligada | Reparar mecanicamente e revalidar; não criar dívida que já pode ser resolvida |
| Melhoria opcional sem impacto na promessa aprovada | Registrar recomendação; não reprovar a entrega |
| Defeito pequeno, reproduzido, isolado, com fluxo principal comprovado e sem impacto material | Aceitar com pendência, criar Simple Plan vinculado, concluir e arquivar conforme política autorizada |
| AC secundário não atendido, com impacto baixo comprovado | Preservar o FAIL e registrar deferimento explicitamente elegível pela política; aceitar com ressalvas, nunca simular cobertura completa |
| Fluxo principal quebrado, perda/corrupção de dados, autorização incorreta, exposição de segredo, migração destrutiva ou regressão material | Manter bloqueio explícito e correção prioritária |
| Aplicação não executada, teste indisponível ou impacto desconhecido | `unverified`/bloqueio explicado; ausência de evidência não demonstra baixo impacto |

“Pequena” é uma classificação de impacto, não de número de linhas nem apenas a etiqueta `low` produzida pelo agente. Uma mudança de uma linha pode comprometer dados. A elegibilidade precisa citar a reprodução, os CAP/AC afetados, a evidência do caminho principal e a razão pela qual a correção pode esperar. Se a prioridade do critério não está definida ou houver mudança material da promessa, a política não deve rebaixá-la silenciosamente.

### Fluxo automático e recuperação

1. QA executa sua verificação proporcional e classifica as pendências. A automação tenta corrigir somente problemas mecânicos ou usa o retorno limitado ao Dev já existente; não abre um ciclo infinito de polimento.
2. Se restarem exclusivamente pendências elegíveis, o CLI prepara um registro de fechamento ligado ao hash da entrega/evidência e à versão da política aplicada.
3. **Antes de arquivar**, persistir um Simple Plan executável por correção coerente: ID do achado, feature de origem, reprodução, esperado/observado, impacto, caminhos conhecidos, critério de aceite e comando de verificação. Agrupar achados relacionados e respeitar o orçamento do Simple Plan; não esconder um trabalho grande em vários planos artificiais.
4. Persistir `accepted_with_followups`, concluir o índice e arquivar, reconciliando pulse/workflow sem apagar o trabalho ativo de outra feature. Se a criação do plano falhar, não finalizar o fechamento. Se o arquivamento falhar após o registro, permitir retomada idempotente, sem duplicar planos ou perder o estado concluído.
5. Informar de forma visível: “Feature concluída com 2 pendências; correção em Simple Plan X”. A fila de Simple Plans precisa mostrar os itens ainda abertos e sua origem, inclusive quando a feature está arquivada. Criar o plano agora; sua execução pode ficar para depois ou ser dispensada com justificativa.
6. Para falhas não elegíveis, sair de `in_progress` genérico e apresentar o estado bloqueado/QA reprovado com motivo e próximo responsável. Para PASS aguardando fechamento, expor explicitamente “aguardando encerramento”. Nenhum resultado deve desaparecer em um estado genérico de trabalho em andamento.

O fechamento automático deve ser uma política explícita e versionada, que possa ser autorizada uma vez e respeitada nas próximas execuções. A preferência expressa orienta sua criação; não autoriza uma varredura que feche todo o estoque atual. Publicação, deploy e commit permanecem ações independentes. O `--force` existente continua sendo a saída excepcional, sem se tornar o mecanismo dessa política.

### Verificação para implementar sem regressão

- Pendência baixa elegível fecha com resultado honesto, arquiva e deixa plano rastreável; pendência crítica, principal ou não verificada bloqueia.
- Achado opcional não bloqueia; critério obrigatório não é silenciosamente removido; evidência stale exige nova avaliação.
- Falha de escrita do Simple Plan não conclui; repetir após falha parcial não duplica planos nem perde evidência.
- Planos continuam acessíveis depois do archive; fechamento não limpa o pulse de outra feature; várias pendências relacionadas produzem uma correção coerente.
- PASS/FAIL, `--residual`, `--force`, `--no-archive`, arquivos legados e o bloqueio de publicação conservam seus contratos.
- Exercitar a mesma elegibilidade em `gate:check`, `gate:approve`, `workflow:next --complete=qa` e `feature:close`; adicionar o resultado somente em um comando recriaria a divergência de estados.

Testes existentes selecionados para esta inspeção: `node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=2 tests/feature-close.test.js tests/commands/feature-archive-dossier.test.js`. **55 testes passaram, zero falhas e zero skips**, registrados em [closure-tests.log](../../researchs/aioson-sdd-cycle-2026-09-08/files/closure-tests.log). Eles verificam o comportamento atual; a política proposta ainda precisa de implementação e testes próprios.
