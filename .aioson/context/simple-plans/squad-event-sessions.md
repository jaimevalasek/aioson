---
slug: squad-event-sessions
status: done
owner: dev
created_at: 2026-09-25
---

# Eventos vinculados à sessão

## Scope
Confirmar eventos inter_squad_events somente após conclusão aceita do autorun, preservando identidade e contexto na retomada manual e persistent (continuação do item 1.5).

## Context selected
Projeto validado; context:brief dev/executing selecionou regras de idioma, artefatos, squad-driver e concisão, além de contexto do projeto. Workflow de onboarding não pertence a esta tarefa. Secure-tdd restrito a corrida/duplo despacho; equivalente Node/SQLite real.

## Implementation intelligence
Reusar SQLite e o lock de execução de plan-store. Registro aditivo no módulo de eventos liga (evento, squad) a uma sessão; snapshot preserva contexto além do TTL. Autorun grava contexto no plano e entrega ao worker. Conclusão dos consumidores precede ack transacional; interrupção após efeitos mantém reconciliação de tarefas existente. Persistent chama o mesmo autorun assíncrono e reutiliza a sessão pendente, sem subprocesso síncrono nem timeout global arbitrário.

## Expected files
- behavior: src/squad/inter-squad-events.js
- behavior: src/commands/squad-autorun.js
- behavior: src/commands/squad-daemon.js
- support: tests/squad-autorun.test.js
- support: tests/squad-event-sessions.test.js
- support: este plano, dev-state.md e bootstrap/current-state.md

## Useful options considered
- Include now: vínculo durável, exclusão entre sessões, snapshot, confirmação após sucesso, retomada persistent e cleanup de listeners.
- Defer: inbox/HTTP, reconciliação de efeitos externos, medição real de tokens, preflight; não misturar versões do CLI que ainda usam consume antecipado.
- Escalate: nenhuma decisão nova de produto necessária.

## Done criteria / Verification
Evento permanece não consumido após pausa/falha; worker recebe payload e IDs reais; TTL não apaga entrega vinculada; retomada preserva sessão/contexto e efeitos concluídos; duas sessões não assumem o mesmo evento; ack idempotente preserva outros squads; preparação sem execução e plano vazio não confirmam. Persistent usa plano pendente e fecha listeners ao terminar. Testes Node com SQLite/worker/processos reais, sintaxe, lint e git guard antes do commit.

## Session state
Implementação concluída. Sem garantia de exatamente uma vez para efeitos externos. Sessões antigas sem snapshot não podem recuperar eventos já consumidos pelo protocolo anterior.

## Entrega e operação
- Tabelas aditivas `inter_squad_event_sessions` e `inter_squad_event_claims` são criadas de forma idempotente no módulo de eventos. A transação SQLite vincula o lote integral à sessão e preserva um snapshot antes do primeiro worker.
- Planos novos congelam seu lote de eventos, inclusive vazio. Retomar um plano antigo ou concluído não captura eventos novos. O worker recebe `inter_squad_events` com IDs, origem e payload; o plano mantém a mesma referência para inspeção.
- O consumidor só entra em `consumed_by` quando todas as tarefas concluem. Pausa, falha, preparação Agent Teams e resultado não verificado mantêm pendência. Ack é idempotente e preserva confirmações de outros squads.
- TTL impede novas entregas expiradas, mas não apaga eventos vinculados em andamento. Snapshot permite retomar o conteúdo original mesmo depois do prazo. O histórico vinculado é retido; política de compactação fica para o ciclo de simplificação.
- Persistent usa identidade derivada do evento e retoma o plano pendente pelo mesmo autorun. Falhas não geram outro plano a cada poll. O lock de sessão recusa execução concorrente; tarefa interrompida após possível efeito exige reconciliação existente. Plano vinculado ausente retorna `event_plan_missing`, sem reconstrução automática.
- `aioson squad:autorun . --squad=<slug> --plan=<session>` continua sendo a retomada manual. `event_session_conflict` informa a sessão que já possui o evento. Para pausa por orçamento, ajustar o orçamento e retomar essa sessão.
- Persistent aguarda a execução ao receber SIGINT/SIGTERM, interrompe o sleep e remove seus listeners no encerramento. O timeout arbitrário global de cinco minutos foi retirado; os limites dos workers continuam aplicáveis.
- Não misturar versões antigas e novas consumindo a mesma fila. A função legada `consume` permanece compatível, com transação e proteção de eventos vinculados; os caminhos produtivos autorun/persistent usam o protocolo durável.

## Evidências
- Duas regressões reproduzidas antes da implementação: consumo após pausa e consumo após falha. Ambas passaram com SQLite e workers reais.
- 88 testes focados passaram, zero falhas: `event-session-final-tests.log` no runtime. Incluem dois processos concorrentes, interrupção depois do efeito e antes do recibo, interrupção depois do recibo e antes do ack, CLI real na retomada, origem, payload, TTL, JSON inválido, orçamento, plano ausente e encerramento persistent.
- Sintaxe: 661 arquivos; lint: 1199 arquivos, 530 apontamentos de baseline, zero novos.
- Após o ajuste final de TTL no consumidor legado, os dez testes de sessões foram reexecutados. Nenhum teste usa serviço pago.

## Próximo trecho
Inbox e HTTP de callSquad continuam pendentes no item 1.5. Este incremento conclui a parte de sessões autorun/persistent; não conclui o plano geral de otimização.
