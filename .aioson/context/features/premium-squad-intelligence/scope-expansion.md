# Scope Expansion - Premium Squad Intelligence

## Inputs
- PRD/briefing source: recomendação arquitetural aprovada pelo usuário em 2026-07-23; sem briefing formal.
- Prior expansion artifacts: nenhum.
- User approval mode: recommended.
- Research cache: `researchs/squad-genome-premium-2026/summary.md`.
- Keyword phrases validated: `dynamic multi-agent team composition`, `freshness-aware research caching`, `claim-level evidence provenance`, `operational genome grounding`, `held-out agent evaluation`.

## Scope Buckets
| Bucket | Items | Why | Approval needed |
|---|---|---|---|
| Core | Pesquisa externa controlada quando o resultado depende de fatos atuais; Evidence Pack auditável; vínculo de genome realmente aplicado ao executor; execução sem falso sucesso; validação e avaliação executáveis | Sem estes itens, “premium” continua sendo apenas uma promessa em prompts e metadados | no |
| Recommended MVP | Composição orientada à tarefa com núcleo pequeno, especialistas temporários, owner/reviewer/direitos de decisão; descoberta multilíngue de papéis; frescor proporcional à volatilidade; teste comparativo com/sem genome | Aumenta profundidade sem diluir especialistas nem multiplicar agentes fixos | no — aprovado pelo usuário |
| Optional V1 | Adaptadores adicionais de busca; visualização detalhada de proveniência no dashboard; presets de política por domínio | Útil, mas não necessário para provar o contrato pelo CLI | yes |
| Delight | Resumo legível de contradições, frescor e contribuição do genome ao final da execução | Facilita operação, sem mudar a verdade do gate | yes |
| V2 / Later | Otimização autônoma de custo entre provedores; promoção automática de aprendizados; benchmarking contínuo compartilhado entre squads | Exige histórico, governança e risco operacional maiores | yes, future |
| Cut List | Fazer cada executor pesquisar isoladamente; exigir internet em tarefas privadas/closed-world; usar genome como depósito de fatos atuais; aumentar o roster sem necessidade; aprovar qualidade por uma nota agregada | Eleva custo, exposição e ruído sem garantir melhor resultado | no |

## Operational Surface Map
| Object | Parent / owner | Lifecycle states | Required actions | Management surface | Empty / error states | PRD destination |
|---|---|---|---|---|---|---|
| Squad package | Operador / `@squad` | draft, structurally-valid, evaluated, ready, failed, stale | criar, inspecionar, validar, avaliar, estender/reparar; arquivamento permanece no lifecycle existente | comandos e pacote `.aioson/squads/{slug}/` | domínio insuficiente, pacote inválido, avaliação ausente/falha | MVP, flows, ACs |
| Evidence Pack | Execução do squad / pesquisador designado | required, collecting, current, stale, contradicted, unavailable, not-applicable | pesquisar, reutilizar com revalidação, inspecionar, atualizar, citar | etapa de pesquisa + artefato de evidência ligado à execução | busca indisponível, fontes insuficientes, contradição, tarefa closed-world | MVP, flows, ACs |
| Genome binding | Squad ou executor / `@genome` | pending, resolved, compiled, conflicted, stale, removed | vincular, inspecionar, compilar, revalidar, substituir/remover | manifesto, prompts/checklists/contrato de saída e diagnóstico CLI | genome ausente, dependência/conflito, compilação stale ou sem efeito | MVP, flows, ACs |
| Evaluation run | Squad / avaliador independente | pending, running, pass, warn, fail, stale | executar, inspecionar evidências, reexecutar após correção | comando `squad:eval` e relatório versionado | executor sem fonte, jury indisponível, tarefa held-out falha, evidência stale | MVP, flows, metrics |
| Execution task/run | Orquestrador / executor responsável | pending, running, completed, failed, escalated, cancelled | executar, observar, repetir, escalar/cancelar | `squad:autorun`, runtime e logs | worker ausente, timeout, falha parcial, sem evidência de saída | MVP, flows, ACs |

## Core Capability Closure
- Complete: owner, lifecycle, superfícies CLI/pacote, estados de sucesso/falha e limites de pesquisa estão definidos.
- Missing / needs decision: nenhum trade-off de produto bloqueante.
- Explicitly deferred: UI nova, novos provedores específicos, aprendizado autônomo e publicação/fechamento automático.

## Recommended Product Shape
- Include in PRD: Evidence Plane obrigatório por risco/frescor; Squad Compiler orientado à tarefa; Genome Runtime operacional; gates executáveis e verdadeiros; avaliação held-out com proveniência; compatibilidade aditiva.
- Keep as optional: dashboard avançado, múltiplos adaptadores e presets de domínio.
- Explicitly defer: pesquisa redundante por todos os executores, fatos atuais embutidos em genomes, autopromoção sem avaliação e fechamento/publicação automáticos.

## Risks And Classification
- Scope risk: alto se “premium” virar uma coleção aberta de refinamentos; controlado por seis capacidades estáveis e deferrals explícitos.
- Delivery risk: mudanças atravessam prompts canônicos, schemas, CLIs, runtime e testes; precisam ser entregues em fatias verticais compatíveis.
- Classification impact: `MEDIUM`; a feature cria/fortalece contratos de evidência, compilação e avaliação em múltiplos limites existentes.

## Cheap / Native Implementation Ideas
- Reutilizar `researchs/`, o worker de pesquisa, manifestos e runtime existentes em vez de criar uma plataforma paralela.
- Evoluir `squad:validate`, `squad:score`, `genome:doctor` e `squad:autorun` em vez de duplicar comandos.
- Preservar `sourceDocs`, `investigation`, `genomes` e `genomeBindings` como entradas legadas, normalizando-as para o contrato premium.
- Manter facts atuais no Evidence Pack e métodos estáveis no genome para reduzir staleness e contexto morto.
