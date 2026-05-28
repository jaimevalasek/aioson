---
slug: harness-driven-aioson
created_at: 2026-04-10
updated_at: 2026-04-10
source_plans: ["plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt", "plans/Harness-Driven/Harness-Engineering-resumo.txt"]
---

# Briefing — Harness-Driven AIOSON

## Contexto
O AIOSON atingiu um limite crítico com o modelo tradicional de Spec-Driven Development (SDD). Embora as instruções (Specs) guiem o agente @dev, a falta de um ambiente de validação robusto ("Harness") causa falhas recorrentes em tarefas complexas. O objetivo é evoluir o framework para o método Harness-Driven, focando na criação de ambientes de execução seguros e sensores de feedback em tempo real, baseando-se no estado da arte de Abril de 2026.

## Problema
Agentes operando sem um harness caem em padrões de falha de alto custo:
1. **One-shot Hero:** Tentativa de implementar tudo de uma vez, estourando o contexto.
2. **Premature Victory:** O agente declara vitória antes de validar todos os critérios.
3. **Amnesia:** Perda de progresso entre sessões sem uma "passagem de bastão" clara.
4. **Subjective Judgment:** O agente avalia o próprio código sem sensores externos objetivos (linters, testes).
5. **Accumulated Slop:** Degradação gradual da qualidade arquitetural (5-20% por iteração).

## Solução proposta
Transição do foco de "Instruções" (Feed-Forward) para "Sensores" (Feedback) através do **Padrão Nautilus**:
- **@sheldon como Harness Engineer:** Responsável por desenhar o ambiente de validação antes do @dev codificar.
- **Contract-Driven Directory:** Uso de `.aioson/plans/harness-contract.json` (Consenso entre Implementador e Validador), `progress.json` (Memória) e `bootstrap.sh` (Contexto).
- **Separação de Processos (Nautilus Pattern):** Implementador (@dev), Validador (@validator/Critic) e um **@governor** (Políticas e Segurança).
- **Gateway Ativo:** Upgrade do `execution-gateway.js` para bloqueio de commits que violem Invariantes arquiteturais.

## Temas
### Estrutura de Contrato (Contractual Handshake)
Definição de esquemas JSON para contratos de sucesso que ambos os agentes (Implementador e Validador) devem assinar antes da execução.

### Sensores e Invariantes (Closed-Loop)
Integração de linters, type-checkers e hooks de pré-commit no gateway de execução para garantir resultados binários (0/1) de sucesso baseados na realidade do código, não na opinião do agente.

### Gestão de Entropia (Garbage Collection)
Implementação de ciclos de limpeza automática para detectar drift documental e padrões obsoletos introduzidos por execuções autônomas.

## Riscos
1. **Consumo Excessivo de Tokens:** O loop de auto-correção e múltiplas passagens de revisão podem elevar o custo por feature.
2. **Complexidade de Setup:** Projetos legados podem ter dificuldade em se adaptar ao ambiente de harness rigoroso.
3. **Over-Engineering:** O excesso de sensores pode travar a agilidade do desenvolvimento se as regras forem muito rígidas ou mal configuradas.

## Gaps identificados
1. **Interface do Validador:** Como o "Validator" será invocado? Será um novo agente `@validator` ou uma skill dinâmica?
2. **Implementação do @governor:** Quais políticas de segurança e limites de taxa serão impostos ao harness?
3. **Performance do Gateway:** O impacto do `execution-gateway.js` bloqueando streams de escrita em tempo real para detectar violações.

## Fontes
- `researchs/harness-engineering-2026/summary.md` (Abril 2026)
- `plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt`
- Referências ao Padrão Nautilus e Sistemas de Circuito Fechado (OpenAI/Anthropic).

## Questões abertas
1. Devemos criar um comando `aioson harness:init` para facilitar o bootstrap em projetos novos?
2. O `harness-contract.json` deve ser legível por humanos ou puramente estruturado para consumo de máquina?
3. Como lidar com "falsos positivos" de sensores (ex: linter falhando em código gerado propositalmente para teste)?
