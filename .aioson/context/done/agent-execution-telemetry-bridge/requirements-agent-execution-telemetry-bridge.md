---
slug: agent-execution-telemetry-bridge
classification: MEDIUM
gate_requirements: approved
status: approved
---
# Requisitos — Agent Execution Telemetry Bridge

## Requisitos funcionais
- **REQ-01 — Run pré-spawn:** todo dispatch externo cria persistentemente um run antes do spawn e, após o spawn, anexa PID sem trocar sua identidade.
- **REQ-02 — Correlação forte:** feature, agente, host, modelo, dispatcher `run_id`, attempt e report path formam uma correlação verificável; relatório divergente ou antigo é rejeitado.
- **REQ-03 — Estados:** a máquina aceita apenas `queued → running → waiting_report → passed|failed|paused`, com `correcting` como transição de ciclo e retry/fallback/timeout como eventos; estados terminais são monotônicos.
- **REQ-04 — Stream seguro:** stdout/stderr são capturados incrementalmente, redigidos antes da persistência, ordenados por sequência e limitados por chunk e run.
- **REQ-05 — Recuperação:** resume reconcilia lease, PID e attempt; processo comprovadamente vivo é reanexado, ausente é pausado/falhado, e nunca há spawn duplicado.
- **REQ-06 — Integração nativa:** o dispatcher chama uma API interna da bridge/runtime-store; não executa `runtime:emit`, `live:*` ou snippets de shell.
- **REQ-07 — Consumo:** leitores recebem snapshot compacto do run e eventos paginados por cursor, com indicadores de truncamento e atividade recente, preservando APIs atuais.
- **REQ-08 — Backpressure/retenção:** fila em memória e transações têm limites; excesso é contabilizado por evento agregado, sem bloquear indefinidamente o processo filho; retenção remove primeiro chunks antigos e preserva estados/relatório.
- **REQ-09 — Falha degradada:** indisponibilidade da telemetria não expõe saída bruta nem corrompe o state file; o dispatch registra diagnóstico normalizado e segue ou pausa conforme a integridade de correlação.
- **REQ-10 — Ciclo dev/verificadores:** runs de QA/tester/pentester apontam para o ciclo do dev; o dev só avança com todos os relatórios obrigatórios válidos da attempt atual.

## Regras e limites
- Defaults: chunk persistido ≤16 KiB; buffer pendente ≤1 MiB/run; payload textual persistido ≤2 MiB/run; flush ≤500 ms; consulta default 100/max 500 eventos; retenção default 7 dias para chunks e 30 dias para metadados terminais.
- Redação cobre tokens Bearer/API, cookies, chaves privadas, variáveis `*_TOKEN|*_SECRET|*_PASSWORD|*_KEY`, URLs com credenciais e padrões configurados; redação ocorre antes de log, erro ou SQLite.
- PID é evidência somente quando combinado com identidade/lease do attempt; reutilização de PID não comprova continuidade.
- SQLite continua sendo a fonte canônica; JSON do dispatcher permanece checkpoint/compatibilidade, não um segundo log de eventos.

## Critérios de aceitação
- **AC-01:** teste prova que o run existe antes de `spawn()` e recebe PID depois.
- **AC-02:** duas attempts concorrentes/antigas não conseguem anexar evento ou relatório uma à outra.
- **AC-03:** transições inválidas e atualização de terminal são rejeitadas idempotentemente.
- **AC-04:** stdout e stderr fragmentados aparecem ordenados em até 2 s, sem segredos conhecidos.
- **AC-05:** chunks/eventos excedentes são truncados/agregados dentro dos limites, sem deadlock nem memória ilimitada.
- **AC-06:** crash antes/depois do spawn e durante `waiting_report` é reconciliado sem duplicar processo/run.
- **AC-07:** retry, fallback, timeout, correcting e relatório terminal ficam ligados ao mesmo ciclo lógico.
- **AC-08:** relatório com feature/agente/run/attempt/digest incompatível pausa com motivo estável.
- **AC-09:** API de snapshot/eventos suporta cursor, limite, ordenação e `truncated`; leitores atuais continuam passando.
- **AC-10:** nenhuma chamada do dispatcher usa child process para comandos de telemetria.
- **AC-11:** falha SQLite é limitada e diagnosticável; conteúdo bruto não aparece em stderr nem state JSON.
- **AC-12:** plano de verificação impede o dev de aprovar ciclo sem todos os verificadores obrigatórios da attempt atual.

## Fora de escopo
UI no Play/dashboard, painel nativo dos hosts, raciocínio interno, protocolo WebSocket novo e substituição do dispatcher.
