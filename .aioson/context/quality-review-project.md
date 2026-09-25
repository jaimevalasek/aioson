# Revisão e otimização do AIOSON — 24/09/2026

Revisão anterior preservada: [08/09/2026 — ciclo SDD](quality-review-project-2026-09-08.md). Ela registra correções concluídas em 09/09; este relatório não reabre aquele trabalho.

## Parecer

A consolidação recente segue uma direção útil: menos agentes com responsabilidades sobrepostas, Dev capaz de resolver trabalho pequeno e contexto carregado conforme a tarefa. Porém, a aposentadoria deixou uma incompatibilidade real no scanner de segurança e verificações ainda presas ao catálogo antigo. O mecanismo de contexto também podia reinserir instruções arquivadas.

Foram aplicadas correções locais nessas fronteiras e removida a prescrição de leitura sequencial de documentos antigos do índice de memória. Não há evidência suficiente para declarar que todo o framework está otimizado nem para excluir recursos de clientes apenas porque não aparecem na telemetria deste repositório.

## Escopo e método

- Perfil: `framework`; revisão de código, prompts, contratos, testes, alcance e observações de uso de skills.
- Revisão de origem: `3b31b94bfe6c008f303af3f2800c5b0c9a266d7d`, versão 1.68.0. Histórico considerado: 14–24/09; inspeção aprofundada das mudanças de 24/09 em aposentadoria, contexto e memória. Publicação, Jev e orquestração receberam inspeção parcial e cobertura das suítes, não auditoria exaustiva.
- Ambiente: Windows x64, Node v24.19.0, Fallow 3.23.0, ferramentas locais do projeto.
- Árvore já alterada na entrada: `features/execution-roles-onboarding/visual-implementation.json`, `tmp-status.json`, `tmp-status-fe.json`. Esses arquivos foram preservados. Workflow ativo preservado.
- Duas passagens: descoberta/reprodução; correção/verificação. Não foram executados modelos pagos, publicação, commit ou chamadas a clientes.
- Skills: `prompt-sharpener` e sua referência de diagnóstico; revisão de contratos sem reescrita geral dos prompts.

## Achados corrigidos

### 1. Scanner de segurança rejeitava o sucessor de Analyst — confirmado, prioridade alta

- Arquivo: `src/commands/security-scan.js`, `VALID_STAGES` e normalização de `stage`.
- Observado: o CLI normaliza `analyst` para `product`, mas o scanner aceitava apenas `analyst`. Uma chamada que deveria retornar bloqueio 10 retornava entrada inválida 12.
- Reprodução: três testes existentes de `tests/commands/security-scan.test.js` falharam pela entrada pública do CLI.
- Correção: estágio canônico `product`, normalização compartilhada também na chamada direta e telemetria canônica; o nome antigo continua aceito como compatibilidade.
- Aceitação: os testes do comando passam, incluindo entrada direta e CLI com `product`, compatibilidade com `analyst` e códigos de saída.

### 2. Instruções arquivadas voltavam ao contexto normal — confirmado, prioridade alta

- Arquivo: `src/context-selector.js`, `evaluateCandidate`.
- Observado nesta revisão: `legacy-agents-entrypoint.md` e `legacy-claude-entrypoint.md`, marcados `load_tier: archive` e “NON-EXECUTABLE HISTORY”, entraram em `should_load` por semelhança semântica.
- Risco: carregar comandos, agentes e exigências documentais aposentadas em uma tarefa atual.
- Correção: arquivos arquivados exigem um sinal explícito de roteamento. A investigação de migrações continua alcançando esses documentos pelo gatilho declarado.
- Aceitação: cenário negativo novo, cenário positivo de arqueologia e corpus embarcado `context-evals-shipped` passam. A primeira tentativa de excluir toda pontuação semântica dos arquivos arquivados prejudicou a posição dos casos explícitos; a correção final mantém essa pontuação somente depois de comprovar o sinal explícito.
- Replay da mesma tarefa de auditoria: zero arquivos `archive` em `should_load`; volume integral sugerido passou de 125.712 para 102.033 caracteres. Isso mede seleção, não tokens efetivamente lidos, custo de API ou qualidade de um modelo. O volume dos trechos sugeridos não diminuiu nesse replay; não há alegação de economia total.

### 3. Recorte de documentos selecionava palavras e títulos falsos — confirmado, prioridade média

- Arquivo: `src/lib/section-focus.js`.
- Reprodução: uma seção `Observers` contendo `stable observers` foi selecionada para os termos `server` e `table`; uma cerca curta dentro de um bloco Markdown mais longo expunha títulos de exemplo como se fossem títulos do documento.
- Correção: busca no início de palavras, preservando prefixos úteis; fechamento de bloco exige o mesmo marcador, comprimento suficiente e ausência de conteúdo após a cerca.
- Aceitação: testes negativos para infixos e cercas, positivos para prefixos e integração do recorte no contexto.

### 4. Índice de memória prescrevia cerimônia antiga — confirmado, prioridade média

- Arquivo: `src/context-memory.js`, `buildMemoryIndexMarkdown`.
- Observado: todo índice gerado mandava ler sequências fixas com `discovery`, `spec-current`, `architecture`, `design-doc` e `readiness`, inclusive quando os documentos não existiam. Contradizia a seleção sob demanda do gateway.
- Correção: orientação para `context:brief`, leitura vinculada à tarefa e catálogo tratado como inventário. Documentos históricos existentes continuam acessíveis.
- Índice local regenerado: `.aioson/context/memory-index.md`.
- Aceitação: testes do gerador e catálogo passam, incluindo ausência de prescrição de artefato inexistente.

### 5. Verificações ainda exigiam agentes aposentados — confirmado, prioridade média

- Arquivos: `tests/dossier/schema.test.js`, `scripts/smoke-run-chain.js`.
- Observado: o teste de catálogo exigia `analyst/architect/pm/ux-ui`; o smoke esperava encaminhamento para Architect e tentava medir paridade de PM, que já não pertence à cadeia.
- Correção: catálogo atual com Planner, aceitação explícita de autores históricos, fixtures de paridade de Planner e expectativa do sucessor para uma entrada histórica de Architect.
- Aceitação: smoke, schema de dossier e busca de contexto passam em conjunto: 50 testes.

## Medições

| Verificação | Resultado | Evidência |
|---|---|---|
| `context:validate . --json` | pass | contrato válido |
| `quality:run . --profile=framework --json`: lint | pass | `../runtime/quality/checks/08aea3d2-8ae6-4f2e-9b1e-3e2a3faa613a/lint.json` |
| mesma execução: test-quality | pass | pasta de checks acima |
| mesma execução: quality-coverage | pass | 97,7% linhas nos módulos de qualidade; não no repositório inteiro |
| mesma execução: quality-static | fail | `../runtime/quality/audit.md` e `audit.json` |
| suíte completa inicial | fail | 5.368 testes: 5.356 pass, 8 fail, 4 skipped; `../runtime/review-full-tests.log` |
| scanner, seletor e corpus embarcado após correções | pass | 38 testes; `../runtime/review-focused-tests.log` |
| memória e recorte de seções | pass | 17 testes; `../runtime/review-memory-tests.log` |
| smoke, dossier e busca de contexto | pass | 50 testes; `../runtime/review-retirement-tests.log` |
| lint final | pass | 1.195 arquivos, zero achados novos; `../runtime/review-lint.log` |
| sintaxe final | pass | 658 arquivos; `../runtime/review-syntax.log` |
| suíte completa final | pass | 5.372 testes: 5.368 pass, zero fail, 4 skipped; 193,95 s; `../runtime/review-full-tests-final.log` |
| desempenho/qualidade comparada de modelos | not_run | não houve ensaio A/B de execuções de IA |

A oitava falha inicial foi `SQLITE_BUSY` no teste de busca de contexto. A repetição focada e a suíte completa final passaram; isso não estabelece que a causa da contenção foi corrigida.

## Inventário e recomendações

O template contém 29 kernels de agente. O inventário local de skills contém 50 entradas: 3 com uso observado, 15 com referências diretas, 31 com alcance contextual e 1 depreciada. Nenhuma foi classificada como órfã pelo auditor. Foram observadas apenas sete ocorrências de uso no banco local; isso não representa o parque de clientes. Evidência: `../runtime/skill-review.json`.

| Prioridade | Decisão recomendada | Evidência e próximo critério |
|---|---|---|
| P1 | Manter a consolidação dos oito agentes já aposentados e testar todas as entradas públicas ao aposentar um ID | scanner e smoke demonstraram que remover kernels e atualizar documentação não cobre todos os consumidores |
| P1 | Triar as 232 ocorrências novas da análise estática antes de alterar a baseline | 69 dead-code, 119 complexidade, 44 duplicação. São candidatos; não 232 bugs confirmados |
| P1 | Separar gradualmente o despacho CLI e a execução orquestrada por fronteiras já existentes | Fallow: `main` em `src/cli.js` com complexidade ciclomática 753; `runExecution` com 168. Exige testes dos contratos e mudanças em etapas, sem refatoração geral por contagem |
| P2 | Reduzir o carregamento inicial do router `interface-design` por referências acionadas pelo trabalho | 8.905 caracteres, acima do limite de router de 8.000 do auditor. Preservar contratos visuais e medir tarefas reais antes/depois |
| P2 | Tratar guias genéricos de stacks como conteúdo opcional e verificar atualização antes de uso | 31 entradas de alcance contextual; ausência de telemetria não prova desuso. Escolher os stacks usados pelos clientes antes de cortar suporte |
| P2 | Tornar a carga de memória do operador proporcional à tarefa | a listagem desta sessão tem 399 decisões; mesmo `--titles-only` produziu saída volumosa. Avaliar seleção/limite com recuperação explícita das decisões pertinentes |
| P2 | Validar uso comercial antes de retirar Web3, personas, genomes, marketing ou squads | não há amostra de clientes nesta revisão; cortes por preferência presumida podem quebrar integrações |
| P3 | Remover compatibilidade somente após janela de depreciação e prova de migração | os nomes antigos ainda aparecem em comandos, documentos e autoria histórica; alias barato evita perder acesso a dados existentes |

Exemplo de falso positivo confirmado: Fallow recomenda excluir `tutorials/aioson-web/script.js` e `style.css`, mas `tutorials/aioson-web/index.html` os referencia diretamente. Por isso não foi executada exclusão automática de “unused”.

Para modelos mais capazes, recomendo concentrar o AIOSON em contexto pertinente, ferramentas com contratos claros, recuperação de execução e evidência de entrega. Instruções de domínio e regras reais dos clientes continuam úteis. Agentes extras e cerimônias devem justificar seu custo por tarefas medidas. Essa orientação é compatível com a recomendação de simplicidade e complexidade guiada por resultados da [Anthropic](https://www.anthropic.com/engineering/building-effective-agents) e com sua orientação de [contexto sob demanda](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); não substitui avaliação no AIOSON.

## Limites e próximo passo

As correções acima estão no workspace, sem publicação. A análise estática permanece vermelha e merece uma rodada própria de triagem. Novas aposentadorias de recursos dependem do recorte de uso do operador/clientes, solicitado durante esta sessão. Não foi redefinida a baseline para ocultar achados nem declarado ganho de inteligência, latência ou custo sem medição.
