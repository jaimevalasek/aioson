---
slug: motor-enxuto-sem-regressao
created_at: 2026-10-06
updated_at: 2026-10-06
source_plans: []
prototype: not_applicable
evaluation_mode: external_audit
---

# Motor enxuto sem regressão de qualidade

## Context

O dono pediu avaliar as melhorias recentes do AIOSON e a possibilidade de reduzir prompts, skills, agentes e cerimônia sem perder qualidade. Confirmou este identificador e a gravação. Depois questionou usar os próprios agentes para reformar o framework. Esta é uma auditoria externa registrada em formato de briefing: o processo atual é objeto de crítica, e a confirmação de gravação não aprova implementação nem inicia a sequência de agentes.

Base examinada: AIOSON 1.70.0, commit `404fd259`, mais as alterações locais de execução orquestrada/Jev presentes em 06/10/2026. Como a melhoria específica não foi delimitada, a análise cobriu tanto o índice/ciclo de features quanto trechos centrais da execução. A feature ativa `execution-roles-onboarding` não pertence a esta auditoria; seu workflow foi preservado.

Constatações:

| Superfície | Medição ou comportamento observado |
|---|---|
| Prompts de Briefing, Refiner, Product, Sheldon, Planner, Dev e QA | 96.750 caracteres somados; aproximadamente 24,2 mil tokens pela heurística de quatro caracteres, sem tokenizer nem medição de consumo |
| Prompts individuais | Briefing/Refiner: cerca de 12 mil caracteres; demais: cerca de 14,5 mil |
| Catálogo distribuído | 29 arquivos Markdown de agentes; 137 de documentação; 121 de skills/referências |
| Memória de operador | 478 entradas; o JSON de títulos e metadados reserializado tem 176.563 caracteres; não são todos pertinentes a esta tarefa |
| Compressor estrutural existente | `compress:agents --dry-run` pulou os sete prompts; nenhuma redução atingiu seu limiar arredondado de 2% |
| Testes focados | 177 passaram, zero falhas/skips; não foi a suíte completa nem uma comparação de qualidade entre prompts |

Tamanho instalado não equivale a contexto carregado. A soma dos sete prompts não é o custo de uma ativação. O motor já usa carregamento progressivo, e os documentos opcionais não devem ser somados como se todos fossem lidos.

## Problem

Ao planejar e entregar uma feature, o operador quer obter decisões corretas, um plano executável e uma entrega verificável com menos releitura, espera e manutenção de regras. Hoje, uma mesma obrigação aparece no kernel, nas regras, em documentos auxiliares e nos comandos de ativação. Várias etapas reabrem os mesmos documentos e decisões. A memória global também devolve um catálogo extenso antes de selecionar o que importa.

O problema principal não é a quantidade nominal de agentes. `analyst` e `ux-ui` já foram absorvidos por `product`; `architect` e `pm`, por `planner`. O commit `849bf351` aposentou oito agentes, manteve resolução dos nomes antigos e adicionou migração/testes. Reintroduzir quatro agentes de revisão opcionais agora recriaria sobreposição antes de demonstrar benefício.

A hipótese é que contexto mais seletivo e responsabilidades mais nítidas reduzam custo mantendo qualidade. A inteligência dos modelos, por si só, não prova que aprovações, rastreabilidade ou revisão independente possam ser removidas.

## Proposed solution

Recomenda-se a opção B de [solution-options.md](solution-options.md): preservar as responsabilidades centrais e simplificar o contexto e a operação em um piloto reversível. O fluxo atual é uma baseline experimental, não uma regra imune à crítica.

1. Corrigir primeiro as três lacunas reproduzidas abaixo, em mudanças separadas da redução dos prompts. Isso evita atribuir um defeito preexistente à simplificação.
2. Começar por Product e pelo contexto entregue na ativação. Manter no kernel missão, decisões exclusivas, entradas, saídas, limites e condições de parada. Carregar receitas, exemplos e detalhes visuais apenas quando necessários. Usar o contrato PRD existente como fonte dos esquemas, evitando transcrevê-los em vários lugares.
3. Reduzir releitura mecânica com os verificadores, hashes, mapas de fontes e evidências já existentes. Um resultado válido só pode ser reutilizado para os mesmos arquivos, conteúdo, regras, versões do verificador e condições relevantes. Mudança invalida o resultado. Revisão semântica independente e inspeção do caminho de produção continuam necessárias onde agregam evidência.
4. Medir o piloto antes de ampliar para Sheldon, Planner, Dev e QA. Considerar reduzir etapas somente em uma experiência posterior, separada da redução de texto.

Fronteiras propostas: Briefing esclarece problema e opções; Refiner confronta fontes/briefing e cuida do protótipo quando aplicável; Product decide escopo e comportamento; Sheldon desafia o PRD de forma independente; Planner organiza a entrega; Dev implementa; QA aceita com evidência. Briefing/Refiner são entrada para ideias/fontes que precisam de elaboração; tarefas técnicas já delimitadas continuam elegíveis ao Simple Plan. Os cinco primeiros agentes não substituem implementação e QA.

Para preservar as competências dos agentes aposentados, usar lentes acionadas por evidência dentro dos donos atuais: regras de negócio em Product/Sheldon; arquitetura em Planner; experiência em Refiner e verificação visual em QA; dependências e fatiamento em Planner. Um especialista adicional só se justifica por pergunta concreta, competência distinta e resultado verificável. Não acrescentar uma etapa só para conservar um nome.

## Themes

### Melhorias que devem ser preservadas

O índice passou a ter um único módulo escritor, agrupamento por situação, ordenação dos encerrados e destino para notas. A ordem relativa das linhas `in_progress` é preservada para não alterar a seleção da feature. É uma melhora coerente com reduzir interpretação pelo LLM.

A orquestração ganhou reparos direcionados, espera de revisão que libera capacidade, exclusão de escrita por arquivo e fallback conservador para julgamentos Jev incertos/indisponíveis. Os testes focados sustentam esses comportamentos; não medem a taxa de acerto do serviço real. Jev deve continuar opcional e subordinado às dependências e controles determinísticos.

### Lacunas reproduzidas na base atual

| ID | Achado e consequência | Local |
|---|---|---|
| F1 | Dois upserts concorrentes podem ler a mesma versão, retornar sucesso e perder uma feature na última gravação. Centralizar o escritor não serializa as transações. | `src/lib/feature-registry.js:456` |
| F2 | A classificação de linhas geradas descarta qualquer título `# ...`; um título de nota legado se perde na normalização, embora seu corpo seja preservado. | `src/lib/feature-registry.js:97` |
| F3 | A projeção de duração por lanes ignora `depends_on` explícito entre lanes. No caso reproduzido, estima 5 minutos onde a dependência `after_qa` exige 10 sob as mesmas durações. | `src/agent-execution/schedule-projection.js:44` |

F1 foi demonstrado com interleaving controlado e filesystem em memória, não com perda de dados do projeto. F2 e F3 foram reproduzidos diretamente nas funções reais. O limite ideal `file_ceiling` não é o defeito de F3; a divergência está nas estimativas de políticas executáveis. Reprodução e limites em [evidence.md](evidence.md).

### Onde compactar primeiro

- Memória: oferecer seleção por tarefa/projeto e saída realmente compacta. Os filtros atuais por agente/feature não substituem relevância; excluir todas as memórias globais também perderia restrições úteis. Nesta execução, o comando retorna 478 entradas e lê seus corpos antes de reduzir a saída a títulos.
- Contexto: distinguir regras obrigatórias de lembranças opcionais e eliminar sugestões sem relação causal com a tarefa. Neste caso, `context:brief` sugeriu guias de integração de apps no Play; eles eram opcionais, não carregamento obrigatório.
- Contratos comuns: separar invariantes compartilhadas das decisões exclusivas de cada etapa. Há repetição de vinculação de protótipo, arquivo exato de feedback e fechamento de sessão em vários kernels. Consolidar carregamento não significa apagar a responsabilidade de cada consumidor.
- Documentação: corrigir a afirmação de truncamento de `CLAUDE.md` a 4.000 caracteres em `template/.aioson/config.md:392`; ela diverge da documentação atual do fornecedor. Orçamentos próprios devem ser apresentados como escolhas do AIOSON.
- Motor: `execution-run.js` tem 3.514 linhas e concentra transições, filas, recuperação e despacho. Extrair gradualmente decisões puras de elegibilidade/estado para uso pelo scheduler e pelas projeções. Tamanho de arquivo sozinho não demonstra defeito; F3 fornece uma razão concreta para consolidar a semântica.

## Risks

- Apagar uma regra originada em incidente real sem preservar o comportamento em teste, verificador ou instrução curta.
- Transferir texto para arquivos que continuam sendo lidos sempre: melhora o tamanho do kernel, mas não reduz o contexto efetivo.
- Usar a mesma revisão ou o mesmo resumo como substituto de toda verificação independente.
- Confundir hash válido com fidelidade da promessa ou qualidade do produto; hashes apenas vinculam conteúdo.
- Tornar comandos antigos incompatíveis, perder arquivos customizados na atualização ou invalidar retomadas de features em andamento.
- Aceitar os próprios testes e gates do AIOSON como prova suficiente da qualidade do AIOSON. As três sondas adicionais encontraram lacunas apesar dos 177 testes verdes.

## Identified gaps

Faltam medições pareadas de sessões reais antes/depois da simplificação. `context:evals` prova roteamento; os testes de prompts verificam contratos textuais; `quality:evals` tem um corpus de 20 microtarefas isoladas. Nenhum desses resultados, sozinho, demonstra qualidade preservada no ciclo de uma feature.

Piloto proposto: selecionar 8–12 tarefas representativas, incluindo mudança pequena, regra ambígua, fonte contraditória, protótipo de outra feature, reaproveitamento de código, retomada após interrupção, serviço indisponível e recuperação concorrente. Comparar prompts atuais e candidatos com o mesmo modelo, configuração, entrada e estado inicial; repetir execuções e reservar casos fora do ajuste. Fixar hashes dos materiais e avaliar o resultado com critérios independentes. Os números são um ponto de partida operacional, não poder estatístico estabelecido.

Medir: promessas essenciais preservadas, correção/execução pelo caminho real, escopo indevidamente ampliado, falsas aprovações, retrabalho, intervenções do usuário, tokens efetivamente observados, custo e tempo. Registrar todas as tentativas e separar tokens de entrada, cache e saída. O custo vem da telemetria do host, não de caracteres/4.

Condições propostas para avançar: contratos críticos sem novas falhas nos casos avaliados; ausência de perdas de promessas essenciais e de regressões graves; comparação qualitativa independente de clareza e executabilidade; redução material do contexto observado. Meta exploratória: reduzir 20–30% da entrada na ativação do piloto, sem promessa antecipada de economia no ciclo completo. Se o piloto piorar qualidade, reverter o candidato. Não misturar troca de modelo, exclusão de agentes e mudança de scheduler no mesmo experimento.

## Sources

### Source Inventory

Briefing conversacional (`source_plans: []`). Nenhum pack de `plans/` foi selecionado ou inventariado para este slug; portanto não há fingerprints `SRC-*` de source pack a transcrever. As referências de código são evidência auditada, não material de usuário promovido a escopo.

- Conversa de 06/10/2026: pedido inicial; confirmação do identificador; questionamento sobre autoavaliação por agentes.
- `src/workflow-profile.js`; `src/constants.js`; `src/agents.js`; `src/migrations/agent-rename.js`; `tests/agent-retirement.test.js`.
- `template/.aioson/agents/{briefing,refiner,product,sheldon,planner,dev,qa}.md`; `src/agent-context-activation.js`; `src/commands/op-list.js`; `src/commands/compress-agents.js`.
- `src/lib/feature-registry.js`; `src/agent-execution/execution-run.js`; `src/agent-execution/execution-contract-repair.js`; `src/agent-execution/execution-jev.js`; `src/agent-execution/schedule-projection.js`.
- `src/lib/quality/evals.js`; `template/.aioson/quality/evals/core.json`; `scripts/testing/sdd-delivery-evals.js`; resultados em [evidence.md](evidence.md).
- Aprendizados locais sobre índice narrativo, falhas de reparo concorrente e provas de roteamento; pesquisas anteriores de qualidade de setembro foram consultadas como histórico, não como resultados atuais.
- Pesquisa primária atualizada: [síntese e capturas](../../../researchs/motor-enxuto-sem-regressao-2026-10-06/summary.md). Os estudos têm resultados distintos e não autorizam generalizar que mais ou menos texto sempre melhora desempenho.

### Source Promise Map

| Promise | Source / locator | Intent | State |
|---|---|---|---|
| PROM-motor-01 | conversational: pedido inicial, “analisar esta parte de feature” | Avaliar as melhorias recentes com evidência e explicitar o recorte adotado. | required |
| PROM-motor-02 | conversational: pedido inicial, “motor ... mais compacto” | Identificar cortes e simplificações de prompts, contexto e operação. | required |
| PROM-motor-03 | conversational: pedido inicial, nomes analyst/ux-ui/architect/pm | Verificar o papel atual e recomendar destino às competências desses agentes. | required |
| PROM-motor-04 | conversational: pedido inicial, “sem ter regressão de qualidade” | Preservar qualidade como condição de adoção e propor comparação verificável. | required |
| PROM-motor-05 | conversational: última pergunta sobre usar agentes para melhorar o próprio AIOSON | Separar organização documental de avaliação externa; o processo auditado pode ser questionado. | required |

## Open questions

1. [testable] Quanto contexto e custo a opção B economiza no ciclo real, e em quais tarefas? A soma de arquivos não resolve esta pergunta.
2. [testable] O candidato preserva qualidade funcional e qualidade do planejamento em tarefas não usadas para enxugá-lo? Exige avaliação pareada; não foi executada nesta sessão.
3. [decision-required] Antes de rodar modelos externos no piloto, qual orçamento de execução e quais combinações de modelo/host devem representar o uso real do operador? Recomendação: começar pela combinação principal já utilizada e incluir outra somente se necessária para compatibilidade.
4. [out-of-scope] Remover Sheldon, fundir todas as etapas, reescrever o scheduler, implementar os reparos ou publicar uma versão nesta análise. Essas ações exigem escopo de implementação próprio; a gravação deste rascunho não as autoriza.

## Additional files

- [Comparação de opções](solution-options.md).
- [Evidências e reproduções](evidence.md).

Registro em `draft`. A auditoria termina com recomendações revisáveis; não há handoff automático nem aprovação de qualidade da futura simplificação.
