---
slug: review-intelligence
classification: MEDIUM
status: approved
interaction_language: pt-BR
created_at: 2026-07-15
source_research: researchs/mattpocock-grill-me-with-docs-2026/summary.md
source_plan: .aioson/context/prompt-sharpener-adoption-plan.md
---

# PRD — Review Intelligence

## Vision
Fazer os agentes do AIOSON criarem soluções mais completas e confiáveis ao pressionarem suas próprias propostas contra evidências, cenários adversos e critérios específicos da fase antes de perguntar, escrever ou entregar.

## Problem
Os agentes já possuem pesquisa, perguntas orientadas e gates fortes, mas a autocrítica é desigual entre fases e parte das lacunas só aparece depois da implementação. Instruções genéricas como “pense melhor” não criam comportamento verificável, e o mesmo modelo pode confundir self-review com aprovação independente, transferindo ao usuário perguntas que o projeto ou a pesquisa já poderiam responder.

## Users
- Operador/desenvolvedor do AIOSON: precisa receber recomendações já amadurecidas, decidir apenas trade-offs que realmente lhe pertencem e enxergar o que foi ou não comprovado.
- Autor de agentes AIOSON: precisa reutilizar um contrato de review consistente sem duplicar blocos extensos ou quebrar ownership, handoffs e schemas existentes.
- Agente downstream: precisa consumir decisões, riscos e evidências sem reconstruir o raciocínio do agente anterior.

## MVP scope
### Must-have 🔴
- Criar a process skill `review-intelligence` como contrato compartilhado: fixar a autoridade do artefato, separar fato de decisão, inspecionar artefatos/código/cache antes de perguntar, pesquisar somente lacunas externas de alto impacto e limitar o challenge loop a duas passagens.
- Proibir chain-of-thought como saída ou requisito. O review materializa apenas conclusões auditáveis: finding, evidência, impacto, recomendação, alternativas relevantes, confiança, owner e risco residual.
- Fornecer perfis por fase: framing (`@briefing`, `@briefing-refiner`, `@product`), specification (`@sheldon`, `@analyst`), architecture (`@architect`) e delivery assurance (`@scope-check`, `@qa`). Cada perfil define perguntas de pressão, stop conditions e ownership sem invadir o próximo agente.
- Integrar os oito agentes por hooks pequenos no template canônico e sincronizar o workspace, preservando language boundary, output contracts, comandos, telemetria, routing e gates existentes.
- Distinguir explicitamente `self-reviewed` de review independente. O autor pode corrigir omissões inferíveis, mas não declara aprovação independente; decisões de produto vão ao owner e contradições bloqueantes impedem o handoff.
- Fazer `@qa` apresentar assurance em eixos separados — fidelidade à spec, cobertura de ACs, padrões/saúde do código, verdade em runtime e riscos residuais/unverified — sem nota agregada que permita um eixo mascarar outro.
- Adicionar CLIs estritamente aditivas: `review:prepare` resolve feature/agente/artefato, seleciona o perfil e fontes de autoridade, calcula hash e persiste um pacote versionado; `review:check` valida schema, contenção de paths, evidências, owners, estados e staleness do relatório; `review:status` agrega os eixos sem reranquear ou mascarar falhas.
- Persistir pacotes e relatórios machine-readable em `.aioson/context/features/{slug}/reviews/`, com schema versionado, escrita atômica, paths contidos no projeto e reprepare obrigatório quando o artefato revisado mudar.
- Fazer os agentes chamarem prepare/check automaticamente nos pontos definidos pelos seus perfis, inspecionarem exit code/JSON e caírem para o challenge loop manual quando a CLI estiver indisponível. O MVP não altera done-gates existentes nem bloqueia comandos legados por ausência de review.
- Preservar compatibilidade: nenhum comando, alias, flag, output, exit code ou gate existente muda de semântica; help e referências ganham somente novas entradas; instalações antigas sem a skill continuam no comportamento atual.
- Distribuir a nova skill em instalações e updates por arquivos gerenciados, com paridade `template/` ↔ workspace e documentação de ativação no contrato AIOSON.
- Adicionar testes unitários/CLI/JSON/help/i18n e cenários com gaps semeados que verifiquem hooks, referências, limites, roteamento, staleness, contenção de paths, ausência de score único/chain-of-thought, preservação estrutural e regressão integral dos comandos atuais.

### Should-have 🟡
- Reutilizar dossier, handoff e artefatos existentes para promover somente findings duráveis; os JSONs de review são evidência operacional, não uma segunda spec.
- Incluir um pequeno catálogo de cenários future-state/pre-mortem por fase: primeiro uso, estado vazio, falha/retry, ownership, integração indisponível, migração/rollback, operação e evolução futura.
- Documentar métricas futuras: gap detectado antes/depois do dev, findings aceitos, perguntas evitáveis ao usuário, decisões reabertas e custo de contexto.

## Out of scope
- Criar um novo agente, workflow motor ou gate numerado.
- Executar jury multi-modelo ou reviewer cross-vendor automaticamente.
- Criar banco/tabela, telemetria nova ou autoaprendizado nesta versão.
- Ligar review automaticamente aos done-gates de `workflow:next` antes de medir falsos positivos e compatibilidade em uso real.
- Tornar pesquisa web obrigatória em toda ativação ou usar snippets como evidência.
- Expor cadeia de pensamento, pedir “pense passo a passo” ou armazenar raciocínio privado.
- Gerar uma nota única de confiança ou permitir que self-review substitua QA, validator, testes ou runtime smoke.
- Reescrever integralmente os prompts dos agentes ou alterar ownership de PRD, classificação, gates, schemas e lifecycle commands.

## User flows
### Criar ou refinar uma solução
O agente executa `review:prepare` → recebe perfil, autoridade, evidências e hash → tenta responder fatos por contexto/código/cache → executa até duas passagens de challenge → escreve o relatório → `review:check` valida contrato/staleness → o agente corrige omissões inferíveis ou apresenta somente uma decisão de owner ainda aberta, com recomendação e consequências.

### Pesquisar uma lacuna relevante
O agente classifica a lacuna como externa e capaz de alterar escopo, risco ou alternativa → consulta cache recente → pesquisa fontes primárias apenas quando necessário → registra a evidência → revisa a recomendação e marca inferências como inferências.

### Bloquear um handoff inconsistente
O challenge encontra contradição entre intenção e artefato → o relatório identifica owner e impacto → `review:check` retorna blockers válidos → o agente não avança → corrige somente quando a resposta é inferível de autoridade superior ou roteia ao agente/usuário responsável com uma recomendação.

### Verificar a entrega
`@scope-check` compara intenção, plano e diff → `@qa` comprova ACs, qualidade e runtime → `review:status` agrega os reviews atuais e aponta stale/missing sem substituir as provas → o relatório mostra cada eixo como pass/fail/unverified/N/A, comandos/evidências e riscos residuais → o usuário decide o fechamento sabendo exatamente o que foi comprovado.

## Success metrics
- 100% dos oito agentes-alvo carregam somente o perfil relevante e preservam seus contratos estruturais.
- 100% dos cenários de teste com fato disponível localmente exigem inspeção em vez de pergunta ao usuário.
- 100% dos cenários com decisão de owner produzem recomendação, evidência disponível, consequência e rota explícita.
- 100% dos findings bloqueantes impedem handoff até resolução ou roteamento.
- 100% dos pacotes detectam mudança do artefato por hash e recusam relatório stale.
- 100% dos paths de artefato/evidência são contidos no projeto e entradas com traversal são rejeitadas antes da leitura.
- Zero instrução que solicite exposição de chain-of-thought e zero assurance agregado em uma nota única.
- Help e JSON das novas CLIs funcionam em en, pt-BR, es e fr; comandos existentes mantêm seus contratos.
- Suite focada, testes de contratos de agentes, paridade de template, lint e suite integral passam sem regressão.

## Specify depth
- Requirements: formalizar perfis por agente/fase, ownership de cada decisão, estados/finding obrigatórios, schema JSON versionado e contrato observável de cada comando novo.
- Design: definir o engine compartilhado, contenção e normalização de paths, hashing/staleness, escrita atômica, seleção de autoridade e hooks estreitos nos agentes sem duplicar lifecycle logic.
- Plan: entregar em fatias aditivas — engine/schema, CLIs e help/i18n; skill/perfis e distribuição; hooks dos agentes; cenários, paridade e regressão integral — mantendo fallback seguro após cada fatia.
- Verification: provar unidades do engine, contratos CLI/JSON/exit code, traversal e staleness, localização, estrutura dos agentes, paridade template/workspace e toda a suite preexistente.

## Open questions
- Nenhuma decisão de produto bloqueante. Jury multi-modelo, done-gate obrigatório, telemetria nova e autoaprendizado permanecem adiados até o MVP demonstrar redução de gaps tardios sem aumentar perguntas, falsos bloqueios ou custo excessivo.
