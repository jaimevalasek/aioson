---
slug: squad-inbox-delivery
status: done
owner: dev
created_at: 2026-09-25
---

# Inbox e HTTP com identidade de entrega

## Scope
Preservar chamadas entre squads e impedir repetição automática de efeito desconhecido na troca HTTP/inbox, continuando o item 1.5.

## Context selected
Projeto validado e context:brief dev/executing carregado. Regras de idioma, disco, squad-driver e concisão aplicadas; workflow onboarding preservado. Secure-tdd restrito a corrida, duplo despacho e validação do envelope recebido, com Node/SQLite/HTTP reais.

## Implementation intelligence
Reusar squad_delivery_batches/squad_deliveries, claim/finish/recover e CLI deliveries/reconcile. Persistir envelope no SQLite junto do lote para recuperação sem depender da conexão HTTP. Uma identidade fornecida como callId (ou UUID gerado) atravessa HTTP e inbox; reutilização com conteúdo diferente é conflito. Inbox publica arquivo completo atomicamente e só remove após recibo concluído. Falha de resultado desconhecido permanece aguardando reconciliação. HMAC existente continua antes do aceite HTTP.

## Expected paths
- behavior: src/squad/inter-squad.js
- behavior: src/squad-daemon.js
- behavior: src/squad/event-delivery.js
- support: tests/squad-inter-squad.test.js
- support: este plano, dev-state.md, bootstrap/current-state.md

## Useful options considered
- Include now: identidade estável, snapshot do envelope, recibo por worker, deduplicação HTTP/inbox, poll contínuo, entradas inválidas diagnosticáveis, retomada/reconciliação existente.
- Defer: limpeza de histórico, transporte remoto, mudança de autenticação, novas políticas de retry e preflight do item 1.6.
- Escalate: nenhuma decisão nova de produto; não prometer exatamente uma vez em serviço externo e não misturar daemons de versões antigas e novas na mesma fila.

## Done criteria / Verification
Timeout após aceitação não produz segundo efeito; respostas pendentes não são sucesso; falha/queda mantém recibo recuperável; duas conexões/processos não duplicam; mesmo ID com payload diferente é recusado; inbox criada após start é processada; identidade de conversa/depth preservada; envelope inválido não executa nem sai do diretório; HMAC e webhook comum mantêm regressões. Testes focados Node de inter-squad/daemon/webhook/API, sintaxe, lint e guard de commit.

## Implementação e operação
- `callSquad` usa `POST /call/<worker>` e aceita `callId`. Uma tentativa de transporte que vira inbox mantém o mesmo ID, conteúdo, origem, destino, conversa e profundidade. Para repetir uma chamada de aplicação após falha, o chamador deve guardar e reutilizar `callId`; omiti-lo inicia uma nova operação com UUID novo.
- O envelope completo é salvo em `squad_call_requests`, ligado ao lote e aos recibos já existentes. Não há dependência da conexão HTTP para recuperar uma entrega aceita. Reutilizar identidade com conteúdo/worker/conversa diferentes retorna `call_identity_conflict`; a comparação é conservadora sobre a serialização JSON, inclusive ordem das propriedades.
- Publicação na inbox usa arquivo temporário completo e hard link sem sobrescrita no mesmo diretório. Isso foi exercitado em NTFS/Windows; o volume precisa suportar hard links. Falha de publicação é explícita, sem afirmar enfileiramento.
- Inbox é consultada também nos polls após o startup. Só apaga o arquivo com recibo `completed`. Falhas com possível efeito permanecem na fila e no ledger aguardando reconciliação. JSON inválido, destino inválido e colisão de identidade vão para `failed/`, com diagnóstico no log do daemon.
- Chamadas HTTP aceitas ficam disponíveis para retry/reconciliação mesmo sem arquivo na inbox. O retry automático continua restrito à declaração existente de idempotência do worker; tentativas/backoff ficam sob controle do ledger.
- Respostas `pending`/`running` usam HTTP 202 e `ok:false`; `completed` usa 200 e devolve recibo sem repetir. `offline_queued` permanece compatível, com `status:queued` e `reason:daemon_offline` ou `http_outcome_unknown`. Enfileirar não é concluir.
- Envelope valida slugs/ID, objeto de payload, conversa, destino e profundidade. Metadados reservados não podem ser fornecidos no payload do chamador. `/call` exige POST e metadados de identidade; clientes antigos que chamavam essa rota diretamente devem enviá-los. HMAC permanece antes do aceite e não é desativado pelo protocolo.
- `stop` aguarda processamento de inbox e requisições HTTP, incluindo conexão encerrada enquanto o worker ainda está rodando. Não há promessa de exatamente uma vez em serviço externo; queda depois do efeito e antes do recibo gera `reconciliation_required`.

### Retomada pelo CLI existente

```text
aioson squad:daemon . --squad=<destino> --sub=deliveries --json
aioson squad:daemon . --squad=<destino> --sub=reconcile --delivery=<delivery_key> --resolution=completed --evidence="Recibo conferido no destino"
aioson squad:daemon . --squad=<destino> --sub=reconcile --delivery=<delivery_key> --resolution=retry --evidence="Conferi que nao houve efeito e corrigi a causa"
```

O próximo poll processa a reconciliação sem pedir para mover arquivos. Não usar retry antes de conferir efeitos de resultado desconhecido. Não misturar versões antigas/novas na mesma fila: deduplicação exige os dois caminhos usando este protocolo.

## Evidências
- Red: duas chamadas HTTP com a mesma identidade produziram dois efeitos antes da correção. Green: recibo reutilizado e um único efeito.
- 73 testes finais de inter-squad/daemon/webhook/API passaram, incluindo timeout HTTP real de dez segundos, perda da resposta, dois processos emissores e dois receptores, morte do receptor após efeito, instalação posterior de worker, HMAC e reconciliação. Log: `.aioson/runtime/inbox-final-tests.log`.
- Recibo concluído continua acessível mesmo após corrupção posterior do worker.json; configuração inválida de um consumidor novo deixa chamada pendente diagnosticável sem impedir os demais consumidores.
- Verificações adicionais finais de HMAC e colisão de identidade online/offline passaram após os ajustes finais.
- Sintaxe: 661 arquivos. Lint: 1199 arquivos, 530 apontamentos de baseline e zero novos.
- Suíte completa: 5443 testes, 5439 passaram, quatro ignorados, zero falhas (315 segundos). Log: `.aioson/runtime/inbox-full-tests.log`. Ajustes finais feitos durante essa execução têm verificação focada posterior.
- Sem serviços pagos, publicação ou mudanças nos arquivos preexistentes do operador.

## Continuação
Este trecho completa os transportes previstos no item 1.5 (handoffs/cron, eventos autorun/persistent e inbox/HTTP). Próximo: item 1.6, consistência entre preflight, comandos disponíveis e instruções. Simplificação de catálogo e otimizações de inteligência permanecem nos ciclos posteriores.
