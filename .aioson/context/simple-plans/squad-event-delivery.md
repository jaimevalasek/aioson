---
slug: squad-event-delivery
status: done
owner: dev
created_at: 2026-09-25
classification: MICRO
risk: medium
source: direct-user-request
---

# Squad — entrega e recuperação de handoffs

## Scope
Corrigir confirmação e recuperação dos handoffs consumidos pelo SquadDaemon, com exclusão entre processos e prova por consumidor; impedir sobreposição de jobs agendados. Primeiro trecho do item 1.5.

## Context selected
Projeto validado, context:brief dev/executing e regras obrigatórias carregadas. secure-tdd aplicado a corrida/duplicação com SQLite e workers reais (não há referência específica Node nesta skill). Autorização de continuidade do operador. Workflow de onboarding preservado.

## Implementation intelligence
Reusar SQLite/better-sqlite3, schema aditivo de openRuntimeDb, worker-runner e comando squad:daemon. Ledger específico guarda consumidores congelados, posse por token/PID/host, tentativas e recibos. Nenhum lock mantido durante worker. A ausência de suporte remoto a idempotência exige reconciliação, não retry automático de efeito desconhecido.

## Expected files
- behavior: src/runtime-store.js
- behavior: src/squad/event-delivery.js (novo)
- behavior: src/squad-daemon.js
- behavior: src/commands/squad-daemon.js
- behavior: src/worker-runner.js (respeitar noRetry neste caminho)
- support: tests/squad-daemon.test.js
- support: este plano e dev-state.md

## Done criteria
Sucesso de todos os consumidores requeridos confirma o handoff; nenhum consumidor não confirma. Polls/daemons concorrentes não executam mesma entrega. Sucesso parcial é preservado. Dono morto gera reconciliação de efeito desconhecido. Chave estável chega ao worker. Falha só repete automaticamente com declaração explícita de idempotência, limite e backoff. CLI lista entregas e permite reconciliação com evidência, sem aceitar troca de squad ou sobrescrita de dono vivo. Stop aguarda trabalho ativo antes de fechar DB. Schema anterior abre e segunda abertura preserva dados.

## Useful options considered
- Include now: handoffs e exclusão de cron, ledger, consulta e reconciliação no CLI existente, regressões de processo/DB reais.
- Defer: transporte inter_squad_events consumido por autorun/persistent e inbox/HTTP de callSquad são fronteiras distintas; precisam do próximo trecho do item 1.5, não são cobertos por este ledger.
- Escalate: nenhuma nova política de produto; retry de efeito incerto exige escolha explícita com evidência no próprio comando.

## Verification
node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=4 tests/squad-daemon.test.js tests/squad-inter-squad.test.js tests/squad-webhook-production.test.js tests/squad-api-endpoints.test.js tests/squad-worker.test.js
Red/green para ack indevido; concorrência com duas conexões, worker real com efeitos em arquivo, processo filho interrompido, CLI real, compatibilidade de schema, sintaxe e lint.

## Session state
Implementação e verificação concluídas. Não misturar versões antigas/novas de daemon na mesma fila; novas tabelas preservam o schema de status do handoff. Não restaurar banco antigo sobre efeitos externos existentes.

## Implementação e operação
- Schema aditivo versão 1: squad_delivery_batches e squad_deliveries, com consumidores congelados, histórico, recibo e posse. O marcador squad_delivery_schema registra versão sem modificar tabelas antigas. Primeira e segunda abertura de banco anterior preservaram registros.
- Handoff só recebe consumed após todos os consumidores requeridos possuírem recibo completed. Sem consumidor fica diagnosticável em no_consumers; instalação posterior de consumidor permite prosseguir. Durante tratamento, o status legado failed o retira da fila pending de leitores antigos; o ledger é a fonte detalhada de progresso.
- Claim por transação SQLite e token/PID/host impede execução concorrente. Transações terminam antes do worker. Sem tomada por TTL de processo vivo. Dono local encerrado deixa reconciliation_required; dono em outro host exige tratamento naquele host.
- Payload recebe _delivery.idempotency_key estável, source_key e attempt. Isso permite ao worker encaminhar a chave ao serviço externo, mas não prova que o destino a respeita.
- Por padrão, falha após despacho permanece aguardando reconciliação; falha pré-dispatch/definitiva fica failed. Retry automático exige worker.json com delivery.idempotent=true e usa delivery.max_attempts (padrão 3, máximo 5), com backoff. O runner respeita noRetry para não multiplicar tentativas fora do controle do ledger.
- Retry manual com evidência reabre a entrega sem apagar histórico e autoriza pelo menos mais uma tentativa. A declaração de evidência é do operador; não é uma comprovação automática do serviço externo.
- Jobs cron têm identidade por minuto e exclusão por worker; um job em andamento ou com efeito desconhecido impede sobreposição. Não foi criado scheduler distribuído nem garantia de recuperação de todos os horários perdidos.
- stop aguarda poll e jobs ativos antes de fechar SQLite. Webhooks, autenticação e rotas existentes permanecem no caminho anterior; testes de regressão desses caminhos passaram.

### Comandos operacionais

```text
aioson squad:daemon . --squad=<slug> --sub=deliveries --json
aioson squad:daemon . --squad=<slug> --sub=reconcile --delivery=<key> --resolution=retry --evidence="Verifiquei que o efeito não ocorreu e corrigi a causa"
aioson squad:daemon . --squad=<slug> --sub=reconcile --delivery=<key> --resolution=completed --evidence="Recibo confirmado no destino"
```

Também existe resolution=failed para registrar encerramento sem sucesso. Evidência vazia, squad diferente, dono vivo e entrega já concluída são recusados. Não executar retry antes de conferir efeitos de resultado desconhecido.

## Verificação
- Red: duas regressões reproduziram consumo indevido após falha e sem consumidor. Green: ambas passaram após a correção.
- 86 testes focados passaram: `.aioson/runtime/squad-delivery-final-tests.log`. Incluem SQLite real, workers reais, duas conexões, dois processos concorrentes, queda após efeito/antes de ack, reconciliação pelo CLI real, idempotência da migração, retry/backoff limitado, sucesso parcial e stop durante execução.
- Sintaxe: 661 arquivos. Lint: 1198 arquivos, 530 apontamentos de baseline, zero novos. git diff --check sem erros.
- Suíte completa: 5415 testes, 5411 passaram, quatro ignorados, zero falhas; duração de 255 segundos. Log: `.aioson/runtime/squad-delivery-full-tests.log`. A verificação focada de 86 testes também cobre os ajustes finais feitos durante a execução da suíte completa.
- Ambiente Windows. Sem chamadas pagas, alteração de consumidores externos, publicação ou promessa de execução exatamente uma vez.

## Continuação do item 1.5
Os transportes inter_squad_events (autorun e --persistent), inbox e chamada HTTP de callSquad ainda têm confirmação/retentativa próprias. Este incremento cobre handoffs do SquadDaemon e cron; não declara todo o item 1.5 concluído. Próximo trecho deve eliminar confirmação antecipada desses eventos e preservar a identidade da execução iniciada por evento durante falha/pausa.
