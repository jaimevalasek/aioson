---
slug: agent-execution-model-resolution
classification: SMALL
status: approved
interaction_language: pt-BR
source_plan: plans/agent-execution-reasoning-effort.md
---

# PRD — Agent Execution Model Resolution

## Vision
Tornar a seleção de modelo dos subagentes tolerante a nomes humanos e pequenos desvios de ID, sem perder a previsibilidade, a segurança e a auditabilidade do Agent Execution.

## Problem
O operador do AIOSON precisa informar IDs de modelos e esforço de raciocínio por agente, mas hoje o dispatcher envia `model` literalmente e não consulta um catálogo verificável do host. Um nome com caixa, separadores, alias ou pequeno erro pode falhar ou não produzir a seleção esperada, enquanto modelo e esforço ainda não possuem contratos separados no manifesto.

## Users
- Desenvolvedor operador do AIOSON: precisa escolher modelos e esforços por agente sem memorizar perfeitamente cada slug do host.
- Dispatcher do Agent Execution: precisa transformar a intenção do operador em uma configuração canônica, inequívoca e auditável antes de iniciar o subagente.

## MVP scope
### Must-have 🔴
- Separar `reasoning_effort` de `model` por agente, com enum inicial `low|medium|high|xhigh|max|ultra`, herança quando ausente e merge aditivo que preserve manifestos e escolhas existentes.
- Resolver modelos por catálogo verificável do host, começando pelo catálogo local do Codex e cobrindo qualquer modelo nele presente, nesta ordem conservadora: slug exato; nome/forma normalizada inequívoca; alias/sufixo inequívoco; aproximação inequívoca. `gpt-5.6-terra` permanece igual; `GPT 5.6 Terra` ou pequeno erro só é corrigido com resultado único.
- Bloquear antes do spawn quando houver zero ou múltiplos candidatos confiáveis, mostrando a correção acionável; sem catálogo, preservar slugs literais e `configured-default` como resolução não verificada, mas nunca adivinhar uma entrada aproximada.
- Auditar `model_requested`, `model_resolved`, estratégia e origem/idade do catálogo em show, dispatch, estado, relatório e telemetria; resolver apenas em runtime, sem reescrever o manifesto ou alterar seu digest durante um run ativo.
- Aplicar modelo e esforço ao Codex em argv/configurações separados com `shell: false`, inclusive `configured-default` + esforço; validar níveis anunciados e falhar com `unsupported_reasoning_effort` sem downgrade. Fallback, troca de família/versão ou provedor continuam exclusivos da política autorizada.

### Should-have 🟡
- Exibir no `agent:execution:show` uma prévia compacta `solicitado → resolvido`, esforço efetivo e motivo da correção antes do dispatch.
- Oferecer comando explícito para persistir slugs canônicos no manifesto após validação, recusando a operação quando houver execução ativa ou correspondência ambígua.
- Permitir que adapters futuros declarem catálogo e níveis de esforço por capability sem acoplar o core ao formato privado de um único host.

## Out of scope
- Escolher automaticamente o modelo mais barato, rápido ou poderoso.
- Reduzir esforço, trocar família/versão, usar fallback ou mudar de provedor sem autorização explícita.
- Consultar preços ou depender de scraping/rede para descobrir modelos em tempo real.
- Alterar o modelo ou o esforço global do Codex.
- Reescrever silenciosamente o manifesto durante dispatch/resume.
- Aplicar `reasoning_effort` a Claude ou OpenCode antes de existir contrato equivalente verificado.

## User flows
### Configurar modelo e esforço
O operador edita `agent-execution-{feature}.json` → informa um modelo literal ou uma forma humana próxima e, opcionalmente, `reasoning_effort` → a validação consulta o catálogo confiável do host → o resumo mostra solicitado, resolvido, esforço e estratégia de correspondência.

### Resolver uma correspondência inequívoca
O operador informa `GPT 5.6 Terra` ou outro nome próximo → o resolver encontra exatamente um modelo compatível no catálogo → o dispatcher usa o slug canônico no argv → estado, relatório e telemetria preservam tanto o valor solicitado quanto o resolvido.

### Tratar ambiguidade ou ausência
O nome informado produz vários candidatos ou nenhum candidato confiável → a validação para antes do spawn → a CLI lista candidatos ou informa que o catálogo não permite correção aproximada → o operador ajusta o manifesto e executa novamente.

### Executar com esforço separado
O modelo é resolvido → o host confirma que o esforço solicitado é suportado → o adapter envia modelo e esforço em argumentos/configurações separados → incompatibilidade retorna erro próprio sem alterar o esforço.

## Success metrics
- 100% dos casos de slug exato preservam o mesmo slug canônico nos testes de catálogo.
- 100% dos casos normalizados/aproximados classificados como inequívocos resolvem para o único slug esperado antes do spawn.
- Zero seleção arbitrária em casos ambíguos e zero troca silenciosa de família, versão, esforço ou provedor.
- 100% dos manifestos legados sem `reasoning_effort` mantêm validação e comportamento anterior.
- 100% das execuções registram solicitado versus resolvido quando houver correção automática.

## Open questions
- Nenhuma decisão de produto bloqueante. Os detalhes de leitura, atualização e validade do catálogo pertencem à arquitetura, desde que respeitem o fallback legado e a evidência auditável definidos aqui.

## Reference sources (sheldon)
- `plans/agent-execution-reasoning-effort.md` — contrato inicial de `reasoning_effort`, adapter e compatibilidade.
- `researchs/codex-model-resolution-2026/summary.md` — validação do slug publicado, argv do Codex e catálogo local.
- https://developers.openai.com/api/docs/models/gpt-5.6-terra — identificador canônico publicado `gpt-5.6-terra`.
