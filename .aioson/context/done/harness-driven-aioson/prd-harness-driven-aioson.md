---
briefing_source: harness-driven-aioson
---

# PRD — Harness-Driven AIOSON (Evolução SDD)

## Visão
Evoluir o framework AIOSON do modelo puramente Spec-Driven (SDD) para o modelo **Harness-Driven (HD)**, utilizando o Padrão Nautilus (Implementador vs. Validador) para garantir a construção robusta de sistemas complexos sem alucinações ou perda de contexto.

## Problema
Em projetos de grande escala, o modelo SDD isolado (apenas instruções) permite falhas críticas de execução:
- **One-shot Hero:** Agentes tentam fazer muito de uma vez e se perdem.
- **Amnésia de Sessão:** Perda de progresso entre turnos de chat.
- **Vitória Prematura:** O agente acha que terminou porque a tarefa "parece" pronta, mas não validou contra sensores objetivos (testes/linters).
- **Alucinação Arquitetural:** Introdução de padrões que violam a integridade do sistema ("Accumulated Slop").

## Usuarios
- **Desenvolvedor (CLI User):** Precisa que o AIOSON entregue features complexas com 100% de confiabilidade e validação automática.
- **Agentes AIOSON (@dev, @sheldon):** Precisam de um ambiente (Harness) que forneça feedback binário (0/1) sobre o sucesso de suas ações.

## Escopo do MVP
### Obrigatorio 🔴
- **Sistema de Sensores (Feedback Loop):** Integração mandatória de linters, testes e type-checkers como gatekeepers da execução.
- **Contrato de Harness (Consensus):** Criação de um artefato JSON (`harness-contract.json`) que define o que é "sucesso" antes da implementação começar.
- **Memória de Progresso:** Implementação de `progress.json` para persistir o estado e evitar a "amnésia" entre sessões.
- **Preservação SDD:** Garantir que o novo fluxo some ao SDD atual, mantendo as Specs como o "mapa" e o Harness como o "guarda-corpo".

### Desejavel 🟡
- **Gateway Ativo:** Bloqueio de commits/escritas que violem Invariantes em tempo real.
- **Comando `aioson harness:init`:** Automação do setup do ambiente de validação.

## Fora do escopo
- Substituição completa do motor de prompts atual.
- Mudança na linguagem base do framework (permanece Node.js).

## Fluxos de usuario
### Fluxo Nautilus (Execução Robusta)
1. **Planejamento:** `@sheldon` gera a Spec (SDD) e o `harness-contract.json` (Harness).
2. **Consenso:** O usuário (ou um agente @governor) valida se o contrato de teste cobre a Spec.
3. **Implementação:** `@dev` escreve o código guiado pelos sensores do Harness.
4. **Validação:** Um processo separado (Validador) executa os sensores. Se falhar, o loop volta para o passo 3 com o erro técnico (feedback real).
5. **Finalização:** O gate só abre quando todos os sensores retornarem "1" (Sucesso).

## Metricas de sucesso
- Redução de 90% em casos de "One-shot Hero" que quebram o build.
- Persistência de 100% do estado de progresso entre sessões de feature.

## Perguntas em aberto (Para pesquisa do @sheldon)
- **Interface do Validador:** Qual a forma mais eficaz e segura de invocar o validador? (Skill dinâmica vs. Processo isolado).
- **Políticas do @governor:** Quais as melhores práticas para impor limites de segurança e custos (tokens) no loop de auto-correção?
- **Rigidez do Gateway:** Como implementar o bloqueio de escrita sem prejudicar a performance do CLI?
- **Formato do Contrato:** Como tornar o JSON do contrato amigável para revisão humana sem perder a precisão para a máquina?

## Specify depth
- Classification: MEDIUM
- Specify depth applied: standard
- Ambiguidades que DEVEM ser resolvidas antes do @analyst prosseguir:
  - Definição da arquitetura do Validador (Processo vs Skill).
  - Estrutura exata do `harness-contract.json`.
- Ambiguidades que PODEM ser resolvidas durante a discovery:
  - Regras específicas de linter para diferentes frameworks.

## Regra de ativação por classificação _(sheldon)_

O harness é **additive** — não substitui o SDD. Ativação automática por classificação do projeto:

| Classificação | Harness | O que muda |
|---|---|---|
| MICRO | Não | SDD puro — zero alteração |
| SMALL | Parcial | Apenas `progress.json` (memória de sessão) |
| MEDIUM | Completo | `harness-contract.json` + `progress.json` + gateway ativo + validador |

**Regra de detecção:** `aioson workflow:next` verifica `classification` em `project.context.md`. Se MEDIUM e a feature não tem `harness-contract.json`, `@sheldon` gera o contrato antes de passar para `@dev`. Projetos MICRO e SMALL não são afetados.

## Papel expandido do @sheldon _(sheldon)_

Em projetos MEDIUM, `@sheldon` passa a ser o **Harness Engineer**:

1. Gera a spec SDD (enrichment) — papel atual, mantido
2. Gera o `harness-contract.json` — papel novo: define critérios de sucesso binários antes da implementação começar
3. O contrato deve ser aprovado pelo usuário como parte do Gate A antes do `@analyst` prosseguir

O `harness-contract.json` não substitui o `sheldon-enrichment-*.md` — os dois coexistem. O enrichment log descreve o que enriquecer; o contrato define o que "feito" significa.

## Acceptance Criteria _(sheldon)_

### Fase 1 — Gateway Ativo
| AC | Descrição |
|---|---|
| AC-HD-01 | Dado projeto MEDIUM com `harness-contract.json` presente, quando @dev executa escrita, `execution-gateway.js` valida invariantes declaradas antes de permitir |
| AC-HD-02 | Dado loop de auto-correção ativo, quando `max_steps` é atingido, o gateway interrompe a execução e registra estado em `progress.json` |
| AC-HD-03 | Dado projeto MICRO ou SMALL sem `harness-contract.json`, quando @dev executa qualquer operação, o gateway funciona exatamente como hoje — zero alteração de comportamento |
| AC-HD-04 | Dado `error_streak_limit` configurado no contrato, quando N erros consecutivos ocorrem, gateway emite log de aviso, abre o circuit breaker e notifica o usuário sem crash |

### Fase 2 — Contractual Handshake
| AC | Descrição |
|---|---|
| AC-HD-05 | Dado `aioson harness:init . --slug=feature-name`, quando executado em projeto MEDIUM, cria `.aioson/plans/{slug}/harness-contract.json` e `progress.json` com template válido e preenchível |
| AC-HD-06 | Dado @sheldon ativado para feature MEDIUM, quando gera enrichment, produz `harness-contract.json` preenchido com critérios do PRD no formato `{id, description, assertion, binary}` |
| AC-HD-07 | Dado `progress.json` com `session_count > 1`, quando @dev inicia nova sessão, lê estado anterior e retoma de onde parou sem re-analisar o codebase inteiro |
| AC-HD-08 | Dado `harness-validate` skill ativa no final de uma fase, quando @dev finaliza fase, a skill valida schema e lint do output antes de marcar como done |

### Fase 3 — Multi-Agent Validation Loop
| AC | Descrição |
|---|---|
| AC-HD-09 | Dado @dev concluindo implementação de fase, quando @validator é invocado em contexto separado, retorna score `0` ou `1` por critério declarado no contrato |
| AC-HD-10 | Dado score `0` retornado pelo @validator, quando feedback é enviado ao @dev, @dev recebe o critério específico que falhou com contexto suficiente para corrigir sem reiniciar do zero |
| AC-HD-11 | Dado `progress.json.ready_for_done_gate == true` e `overall_score == 1`, quando `aioson feature:close` é executado, o comando lê `progress.json`, valida o gate e atualiza `features.md` para `done`; se `ready_for_done_gate ≠ true` (com contrato presente), o comando aborta com mensagem clara apontando o critério pendente; sem `harness-contract.json`, comportamento atual mantido _(refined sheldon Round 2)_ |
| AC-HD-12 | Dado `error_streak_limit` atingido no loop de validação, quando circuit breaker abre, o loop para automaticamente e solicita intervenção humana antes de qualquer nova tentativa |
| AC-HD-13 | Dado feature MEDIUM com `harness-contract.json` presente, quando `@qa` finaliza relatório, deve recomendar `@validator` na seção "Recommended next agents" do `qa-report-{slug}.md`; instrução refletida em `template/.aioson/agents/qa.md` e `.aioson/agents/qa.md` (workspace + template parity, sheldon-001) _(sheldon Round 2)_ |
| AC-HD-14 | Dado `progress.json.status == "waiting_validation"`, quando `aioson workflow:next` é executado em projeto MEDIUM com contrato presente, o comando direciona para `@validator` antes de qualquer outro agente; sem contrato ou em projeto MICRO/SMALL, roteamento atual preservado _(sheldon Round 2)_ |
| AC-HD-15 | Dado output do `@validator` retornado por `aioson agent:prompt validator`, quando `aioson harness:validate` consome a resposta, traduz `results[].reason` da primeira falha para `progress.json.last_error` (formato: `"<critério-id>: <reason>"`), agrega contagens em `error_streak` e atualiza `circuit_state` conforme thresholds do governor; sem essa tradução, AC-HD-10 fica inverificável _(sheldon Round 2)_ |

## Schemas de artefatos _(sheldon)_

### `progress.json` — campos obrigatórios
```json
{
  "feature": "slug da feature",
  "phase": 1,
  "status": "in_progress | waiting_validation | done | circuit_open",
  "completed_steps": ["passo já concluído"],
  "last_error": null,
  "session_count": 1,
  "last_updated": "2026-04-10T00:00:00Z",
  "circuit_state": "CLOSED | OPEN | HALF_OPEN"
}
```

### `harness-contract.json` — estrutura por critério (COINE 2026)
```json
{
  "feature": "slug da feature",
  "contract_mode": "ECONOMICAL | BALANCED | URGENT",
  "governor": {
    "max_steps": 50,
    "cost_ceiling_usd": 2.00,
    "error_streak_limit": 5
  },
  "criteria": [
    {
      "id": "C1",
      "description": "texto legível para revisão humana em PR",
      "assertion": "expressão verificável pela máquina (ex: all tests pass, lint clean)",
      "binary": true
    }
  ]
}
```

`contract_mode` derivado da classificação: SMALL → `ECONOMICAL`; MEDIUM (padrão) → `BALANCED`; MEDIUM crítico → `URGENT`.

## Fluxo de Falha _(sheldon)_

### Loop de auto-correção (Fase 3)
```
@dev implementa
    ↓
@validator avalia → score 0 em algum critério
    ↓
Feedback específico enviado ao @dev (critério que falhou + contexto)
    ↓
@dev corrige usando progress.json (sem reiniciar do zero)
    ↓
@validator re-avalia → loop
    ↓
[Circuit Breaker] se error_streak_limit atingido → estado OPEN
    → Registra estado em progress.json
    → Notifica usuário: "Loop interrompido após N falhas consecutivas — aguardando intervenção"
    → HITL gate obrigatório antes de retomar
```

### Estados do Circuit Breaker
| Estado | Condição de entrada | Comportamento |
|---|---|---|
| `CLOSED` | Normal | Deixa passar, conta erros consecutivos |
| `OPEN` | `error_streak_limit` OR `max_steps` OR `cost_ceiling_usd` | Bloqueia loop, persiste estado, notifica |
| `HALF_OPEN` | Após HITL confirmar retomada | Permite 1 tentativa; sucesso → CLOSED, falha → OPEN |

## Integração com SDD existente _(sheldon)_

### O que não muda
- `aioson workflow:next` — interface e contratos externos inalterados
- `.aioson/plans/*.md` — planos markdown coexistem com `harness-contract.json` na mesma pasta
- `spec-*.md` — estado de implementação existente inalterado
- `execution-gateway.js` — upgrade backward-compatible: sem `harness-contract.json` = comportamento atual exato

### Ponto de integração
- `execution-gateway.js` detecta presença de `harness-contract.json` em `.aioson/plans/{slug}/`
- Se presente → carrega `governor` policies e ativa circuit breaker
- Se ausente → comportamento atual mantido (zero impacto em MICRO/SMALL)

### Fluxo SDD + HD para projetos MEDIUM
```
@product  → PRD
@sheldon  → enrichment + harness-contract.json   ← novo (Fase 2)
@analyst  → requirements
@architect → architecture
@dev      → implementa guiado pelo gateway ativo  ← enhanced (Fase 1)
@validator → valida contra contrato              ← novo (Fase 3)
@qa       → review final
```

## Fontes de referencia (sheldon)
> Documentos e links analisados durante o enriquecimento. Consulte se precisar de mais detalhes.

- [arquivo] Roadmap e arquitetura HD — `plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt`
- [arquivo] Executive summary HD — `plans/Harness-Driven/Harness-Engineering-resumo.txt`
- [briefing] Contexto pré-produção — `.aioson/briefings/harness-driven-aioson/briefings.md`
- [pesquisa] Validator architecture patterns 2026 — `researchs/validator-architecture-2026/summary.md`
- [pesquisa] Governor safety policies & circuit breaker 2026 — `researchs/ai-agent-governor-safety/summary.md`
- [pesquisa] Harness contract schema COINE 2026 — `researchs/harness-contract-schema-2026/summary.md`
- [pesquisa] Real-time gateway & PreToolUse hooks 2026 — `researchs/realtime-code-analysis-gateway-2026/summary.md`

## Identidade visual
- Skill: pending-selection (CLI Only)
- Nota: Esta feature é estritamente funcional (CLI/Backend). Não requer spec UI neste momento.
