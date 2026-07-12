---
slug: agent-execution-dispatcher
classification: MEDIUM
status: approved
interaction_language: pt-BR
---

# PRD — Agent Execution Dispatcher

## Vision
Transformar o plano de uma feature em um pipeline executável e portátil, no qual cada agente usa o host, o modelo e o modo escolhidos pelo usuário sem depender de interpretação textual durante a implementação.

## Problem
Desenvolvedores que usam o AIOSON em Claude Code, Codex ou OpenCode já conseguem planejar uma feature e calcular verificadores, mas ainda precisam iniciar agentes, interpretar aliases de modelos e coordenar relatórios manualmente. Isso torna o autopilot frágil: um modelo inválido ou sem capacidade interrompe o fluxo, e o `@dev` não possui um contrato determinístico para despachar, aguardar e consumir `@qa`, `@tester`, `@pentester` e `@validator`.

## Users
- Desenvolvedor operador do AIOSON: precisa configurar uma vez os modelos adequados e executar a feature com previsibilidade em seu harness atual.
- Agente `@dev`: precisa receber um manifesto validado, trabalhar em contexto limpo e coordenar os verificadores sem adivinhar host, modelo, fallback ou formato de retorno.

## MVP scope
### Must-have 🔴
- Gerar, após o PRD, um manifesto JSON machine-readable e editável com feature, host, modelo e modo por agente; o modelo atualmente configurado no host deve preencher o default inicial.
- Informar ao usuário onde ajustar o manifesto e permitir que ele edite o arquivo diretamente ou use o chat para preencher IDs de modelos válidos.
- Validar antes da execução o schema, o host suportado, os agentes exigidos e os modelos configurados; configuração inválida deve parar antes de iniciar código e indicar o campo corrigível.
- Abrir ou retomar o `@dev` em contexto limpo usando os artefatos canônicos e o modelo configurado, preservando checkpoints para recuperação após interrupção.
- Despachar `@qa`, `@tester`, `@pentester` e `@validator` como subagentes quando o plano de verificação exigir, usando host/modelo/modo individuais e relatórios estruturados persistidos em disco.
- Fazer o `@dev` aguardar os relatórios, aplicar correções, reexecutar as verificações afetadas e encerrar o ciclo ao obter aprovação ou atingir limites explícitos.
- Tratar indisponibilidade de capacidade conforme política explícita no manifesto: retry, espera, fallback autorizado ou pausa; nunca trocar silenciosamente de modelo.
- Manter `workflow-execute.json` como estado/progresso do pipeline e compatibilidade com `verification.json`, separando-os do novo manifesto de seleção de execução.

### Should-have 🟡
- Oferecer presets documentados por harness que preservem `configured-default` quando o host não expuser descoberta confiável de modelos.
- Exibir um resumo humano do pipeline resolvido antes de iniciar: ordem, agentes ativos, modelos, limites de correção e política de capacidade.
- Persistir motivo e histórico de cada retry, fallback autorizado, pausa e resultado de verificação para diagnóstico posterior.

## Out of scope
- Criar aliases universais como `terra`, `luna` ou `sol` sem mapeamento explícito para IDs aceitos pelo host.
- Descobrir ou prometer disponibilidade em tempo real quando o provedor/harness não oferece essa capacidade.
- Executar fallback entre fornecedores sem autorização registrada no manifesto.
- Substituir PRD, requisitos, arquitetura, plano, harness contract, `workflow-execute.json` ou `verification.json` por um único arquivo monolítico.
- Executar código remoto, publicar pacotes ou realizar outras ações irreversíveis como efeito do dispatcher.

## User flows
### Configurar o pipeline após o PRD
O `@product` finaliza e registra a feature → o AIOSON gera o manifesto com o host e modelo atuais como defaults → o usuário recebe o caminho e pode manter ou ajustar modelos/modos → o validador informa PASS ou lista campos inválidos sem iniciar a implementação.

### Executar implementação e verificações
O autopilot lê o manifesto validado → inicia ou retoma `@dev` em contexto limpo → `@dev` implementa as fases e consulta o plano de verificação → o dispatcher inicia os subagentes exigidos com suas configurações → os relatórios são persistidos e devolvidos ao `@dev` → PASS avança; falhas acionam correção e nova verificação dentro dos limites.

### Tratar falta de capacidade
O host rejeita o modelo por capacidade → o dispatcher registra a tentativa e consulta a política do manifesto → executa somente retry/espera/fallback previamente autorizado → sem alternativa autorizada ou com limite esgotado, pausa com diagnóstico acionável e checkpoint íntegro.

### Retomar após interrupção
O processo ou chat é interrompido → um novo contexto carrega o estado do workflow, o manifesto e o cold-start packet → retoma o agente e a fase pendentes sem repetir fases ou verificações já aprovadas → inconsistência entre estado e manifesto bloqueia a retomada com orientação de reconciliação.

## Success metrics
- Configuração inválida detectada antes da primeira alteração de código em 100% dos cenários cobertos pelo harness contract.
- Nenhuma troca silenciosa de host ou modelo em testes de capacidade, retry e fallback.
- Pipeline de referência `@dev → @qa/@tester/@pentester/@validator → @dev` concluído sem coordenação manual em Claude Code, Codex e OpenCode quando cada host oferece o mecanismo necessário.
- Retomada idempotente após interrupção sem duplicar fase concluída ou relatório aprovado nos testes de integração.
- Todos os relatórios exigidos persistidos e associados à feature, agente, modelo, tentativa e verdict.

## Open questions
- Nenhuma decisão de produto bloqueante. IDs concretos de modelos e políticas de capacidade são escolhas do operador em cada manifesto e devem ser validados pelo host.

## Specify depth
Classificação **MEDIUM**: a feature integra três harnesses, adiciona um contrato machine-readable e coordena estado, retomada, capacidade, retries e múltiplos agentes. Gates A, B e C são obrigatórios antes do `@dev`; o `@orchestrator` deve consolidar requisitos, arquitetura, plano e harness contract.

