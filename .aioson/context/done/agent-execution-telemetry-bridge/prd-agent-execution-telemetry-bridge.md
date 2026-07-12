---
slug: agent-execution-telemetry-bridge
classification: MEDIUM
status: in_progress
created_at: 2026-07-10
---

# PRD — Agent Execution Telemetry Bridge

## Vision
Tornar cada execução externa do dispatcher observável em tempo real e recuperável pelo runtime do AIOSON, para que Play, dashboards e clientes compatíveis mostrem o trabalho dos agentes sem depender do painel nativo do host.

## Problem
Desenvolvedores que executam o pipeline automático veem processos headless desaparecerem até o relatório final, sem saber qual agente, modelo ou etapa está em andamento. Em falhas, pausas ou crashes, o runtime também não oferece uma trilha operacional suficiente para diagnosticar e retomar a execução com confiança.

## Users
- Desenvolvedor operador: precisa acompanhar agentes externos, progresso, pausas, falhas e relatórios enquanto o pipeline roda.
- Cliente consumidor de runtime, como AIOSON Play ou dashboard: precisa consultar uma representação estável e segura das execuções sem conhecer detalhes de cada host.
- Agente coordenador, especialmente `@dev`: precisa aguardar verificadores, receber resultados vinculados à tentativa correta e iniciar ciclos de correção rastreáveis.

## MVP scope
### Must-have 🔴
- Criar o run de telemetria antes do spawn e vinculá-lo a feature, agente, modelo, host, PID e attempt.
- Publicar milestones e transições entre `running`, `waiting_report`, `correcting`, `passed`, `failed` e `paused`, com timestamps e motivo normalizado.
- Capturar stdout e stderr de forma incremental, redigida e limitada, sem expor credenciais nem permitir crescimento ilimitado do SQLite.
- Vincular deterministicamente relatório, run e attempt para impedir resultados órfãos ou atribuídos à execução errada.
- Recuperar runs interrompidos após crash, distinguindo processo ainda vivo, execução abandonada e retomada segura.
- Reutilizar o runtime SQLite e os contratos `runtime:*`/`live:*`, preservando compatibilidade com consumidores atuais.
- Expor dados suficientes para Play/dashboard consultar progresso em tempo quase real, sem incluir implementação de UI neste repositório.
- Manter o `@dev` aguardando relatórios obrigatórios e tornar cada ciclo de correção verificável pelo mesmo run ou por runs correlacionados.

### Should-have 🟡
- Resumo compacto de atividade por agente para consumidores que não precisam do stream completo.
- Política configurável de retenção e truncamento com defaults seguros.
- Eventos explícitos de retry, fallback de modelo/host e timeout dentro da mesma trilha operacional.

## Out of scope
- Fazer processos externos aparecerem no painel nativo de subagentes do Codex, Claude Code ou OpenCode.
- Implementar telas no AIOSON Play ou em outro dashboard externo.
- Substituir o manifesto `agent-execution-{slug}.json` ou o motor do dispatcher.
- Transmitir raciocínio interno, prompts secretos ou conteúdo bruto sem redação.
- Criar um segundo banco ou um protocolo de telemetria concorrente ao runtime existente.

## User flows
### Acompanhar execução externa
Operador inicia o pipeline → AIOSON cria o run antes do spawn → dispatcher registra PID e estado `running` → milestones e saída segura ficam disponíveis no runtime → consumidor mostra agente, modelo, etapa, duração e atividade recente → ao concluir, o run aponta para o relatório validado e assume estado terminal.

### Aguardar verificação e corrigir
`@dev` conclui uma implementação → dispatcher inicia `@qa`, `@tester` ou `@pentester` com run próprio → execução passa para `waiting_report` ao encerrar o processo → relatório vinculado determina `passed`, `failed` ou `correcting` → findings acionam nova tentativa do `@dev` com correlação preservada → ausência ou invalidade do relatório pausa o pipeline com motivo acionável.

### Recuperar após interrupção
CLI ou máquina encerra inesperadamente → na próxima retomada o AIOSON reconcilia runs não terminais com PID, lease e estado do dispatcher → processo vivo continua observável; processo ausente vira `paused` ou `failed` conforme motivo comprovável → operador recebe uma ação segura de resume, sem duplicar execução nem aceitar relatório antigo.

### Consumir saída com segurança
Processo escreve stdout/stderr → bridge redige padrões sensíveis antes da persistência → aplica limites por evento e por run → consumidor consulta eventos ordenados e recebe indicador de truncamento → falha de persistência não despeja conteúdo bruto e deixa diagnóstico normalizado.

## Success metrics
- Cobertura de runs: 100% dos spawns externos possuem run persistido antes da criação do processo.
- Integridade: 100% dos relatórios aceitos estão vinculados a feature, agente, run e attempt elegíveis.
- Atualização: eventos ficam disponíveis ao consumidor em até 2 segundos durante execução local normal.
- Recuperação: cenários automatizados de crash antes/depois do spawn e durante espera de relatório não criam processos ou runs duplicados.
- Segurança: testes não encontram segredos conhecidos em stdout/stderr persistidos e comprovam limites de armazenamento.
- Compatibilidade: comandos e leitores atuais de runtime/live continuam passando sem migração manual do usuário.

## Open questions
- A política exata de retenção, paginação e limites será definida pela arquitetura com defaults conservadores e compatíveis com o SQLite atual.
- O transporte de atualização para consumidores poderá começar por polling eficiente; push/WebSocket fica condicionado ao contrato já disponível no runtime e à decisão arquitetural.
