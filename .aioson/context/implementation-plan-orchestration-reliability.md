---
status: implemented-and-reviewed
authority: user-request-2026-09-13
scope: approved-engineering-remediation
---
# Melhoria da orquestração e monitor

Autoridade: pedido explícito de implementação e segunda revisão, após análise em `quality-review-orchestration-parallelism.md`. Manutenção do framework, sem vínculo com a feature antiga execution-roles-onboarding nem alteração da run ativa do consumidor.

O escopo supera Simple Plan: agrega contratos de execução, medição e histórico já especificados pelo dono. Estimativa inicial: 18–24 arquivos de comportamento e 10–14 de suporte, nos módulos de execução, CLI e painel. Nenhuma nova decisão de produto pendente; configuração persistente e APIs existentes são os pontos de extensão.

Contexto selecionado: project.context validado, contexto do dev, regras source-code-language-convention/disk-first-artifacts/output-brevity, relatório da análise, execução por unidade, leitura seletiva e proteção de caminhos existente. Skills: SDD (dev), secure-tdd no leitor HTTP/histórico e eventos não confiáveis, OpenAI Docs para formato de uso.

## Critérios e fases

1. Contrato de qualidade e contexto: padrão min(50% da janela conhecida, 80k tokens), configuração por modelo; limite heurístico de arquivos/ACs preservado, unidade grande recusada nas novas compilações. Não confundir tokens cumulativos com janela. QA reprovado aciona retrabalho limitado, e falha restante pausa dependentes. Checks da unidade são locais; checks CAP/fase ficam identificados como integração. Impedir escrita simultânea nos mesmos arquivos entre ondas e orientar Planner a usar dependências reais.
2. Uso e custo: capturar eventos estruturados de hosts que os oferecem; persistir tentativas, inclusive falha/retrabalho/fallback; medir duração e uso separado de contexto; tarifa exata datada, estimativa parcial explícita, sem preço inventado. Continuidade por contexto precisa preservar trabalho em disco e limitar tentativas.
3. Monitor: exibir métricas por onda/unidade/tentativa; ler features arquivadas com proteção de caminho; porta livre automática quando não especificada; porta explícita continua estrita. Painel segue por projeto; agregador global não foi solicitado.
4. Revisão posterior: testar regressões, revisar falhas e bordas, fazer smoke no CLI/HTTP real, registrar limitações sem aprovação fictícia do produto.

## Arquivos previstos

Comportamento: src/agent-execution/{execution-policy,execution-usage,execution-cost,execution-run,execution-plan,execution-observation,dispatcher}.js; adapters/{base,codex,opencode,antigravity,claude}.js; src/execution-dashboard/{server,history}.js; public/app.js; src/commands/execution-dashboard.js; src/lib/plan-scale.js se necessário. Suporte: testes focados de policy/uso/custo/run/compile/monitor, docs/execution-monitor.md, docs/execution-reliability.md, planner e kernel DEV de lanes no template e espelho ativo, catálogo de tarifas quando comprovável por fonte oficial.

Opções: incluir correções e observabilidade discutidas; preservar contratos antigos de runs compiladas; evitar dependências npm novas. Não incluir comparação de qualidade de modelos, cobrança real por assinatura, migração de histórico inexistente nem mudança/reinício dos processos ativos.

Verificação: node:test em arquivos da fronteira, check:syntax, lint direcionado, regras de idioma; smoke com CLI real e HTTP em porta livre, consulta read-only do consumidor. Testes de parsing usando eventos documentados; modelos pagos só se houver necessidade e autorização concreta.

## Entrega

Implementação e segunda revisão concluídas em 2026-09-13. Evidências e limitações:
`quality-review-orchestration-reliability.md`. As quatro fases acima foram atendidas.
O painel novo está em http://127.0.0.1:57510/?feature=biblioteca-criativa-e-camadas;
o motor e o painel anteriores do consumidor foram preservados. Nenhuma aprovação
de gate, QA independente, fechamento da feature ou publicação foi simulada.
