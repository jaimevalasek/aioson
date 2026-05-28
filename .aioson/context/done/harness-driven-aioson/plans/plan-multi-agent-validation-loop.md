---
phase: 3
slug: multi-agent-validation-loop
title: Multi-Agent Validation Loop
depends_on: contractual-handshake
status: pending
---

# Fase 3 — Multi-Agent Validation Loop

## Escopo desta fase
Implementar o loop Nautilus completo: Implementador (@dev) → Validador (@validator) → Feedback → Gateway done gate. Entrega:
1. Agente `@validator` com contexto isolado — nunca compartilha contexto com o @dev que avalia
2. Loop de auto-correção com circuit breaker (usa o gateway da Fase 1)
3. Done gate binário: todos os critérios do contrato aprovados = feature pode ser marcada como `done`
4. `bootstrap.sh` e `smoke-tests/` como componentes opcionais do Contract-Driven Directory

Ao final desta fase: o Padrão Nautilus está completo. Zero "One-shot Hero", zero "Premature Victory", zero "Amnesia".

## Entidades novas ou modificadas
- **`template/.aioson/agents/validator.md`** — novo agente; contexto isolado; lê apenas `harness-contract.json` e o output do @dev
- **`.aioson/agents/validator.md`** — sincronizado do template
- **`execution-gateway.js`** — adicionar done gate: verifica se todos os critérios `binary: true` passaram antes de permitir marcação de `done`
- **`template/.aioson/plans/{slug}/bootstrap.sh`** (por feature, opcional) — script para reconstruir contexto de sessão rapidamente
- **`template/.aioson/plans/{slug}/smoke-tests/`** (por feature, opcional) — testes rápidos por fase para verificação imediata pós-implementação
- **`src/commands/harness.js`** — adicionar subcomando `harness:validate` (invoca @validator via `aioson agent:prompt validator`)
- **`src/i18n/messages/en.js` e `pt-BR.js`** — adicionar strings do `harness:validate`

## Fluxos cobertos nesta fase

### Fluxo Nautilus completo
```
@dev implementa fase
    ↓
aioson harness:validate . --slug=feature --phase=N
    ↓
@validator (contexto isolado) lê harness-contract.json + output do @dev
    ↓
Retorna: [{id: "C1", passed: true}, {id: "C2", passed: false, reason: "..."}]
    ↓
score 0 → feedback específico enviado ao @dev via progress.json (last_error)
    ↓
@dev corrige → re-invoca harness:validate
    ↓
score 1 (todos binary: true passaram) → gateway abre done gate
    ↓
Feature marcada como done
```

### Fluxo de circuit breaker (herda Fase 1)
- `error_streak_limit` atingido → OPEN → HITL gate obrigatório
- @dev não pode tentar nova correção sem usuário confirmar retomada

### Fluxo bootstrap (opcional)
- `bootstrap.sh` recria contexto: instala deps, carrega env, valida pre-conditions
- @dev executa antes de iniciar sessão nova em projetos longos

## Acceptance criteria desta fase
| AC | Descrição |
|---|---|
| AC-HD-09 | Dado @dev concluindo fase, quando `aioson harness:validate` é invocado, @validator em contexto separado retorna score `0` ou `1` por critério do contrato |
| AC-HD-10 | Dado score `0`, quando feedback chega ao @dev via `progress.json.last_error`, @dev recebe o critério específico que falhou com razão suficiente para corrigir sem reiniciar |
| AC-HD-11 | Dado `progress.json.ready_for_done_gate == true` e `overall_score == 1`, quando `aioson feature:close` é executado, o comando lê `progress.json`, valida o gate e atualiza `features.md` para `done`; se `ready_for_done_gate ≠ true` (com contrato presente), aborta com mensagem clara apontando o critério pendente; sem contrato, comportamento atual mantido _(refined Round 2)_ |
| AC-HD-12 | Dado `error_streak_limit` atingido, quando circuit breaker abre, o loop para automaticamente e solicita intervenção humana antes de qualquer nova tentativa |
| AC-HD-13 | Dado feature MEDIUM com `harness-contract.json` presente, quando `@qa` finaliza relatório, deve recomendar `@validator` na seção "Recommended next agents" do `qa-report-{slug}.md`; instrução em `template/.aioson/agents/qa.md` e `.aioson/agents/qa.md` _(Round 2)_ |
| AC-HD-14 | Dado `progress.json.status == "waiting_validation"`, quando `aioson workflow:next` é executado em projeto MEDIUM com contrato, o comando direciona para `@validator` antes de qualquer outro agente; sem contrato ou em MICRO/SMALL, roteamento atual preservado _(Round 2)_ |
| AC-HD-15 | Dado output do `@validator` retornado por `aioson agent:prompt validator`, quando `aioson harness:validate` consome a resposta, traduz `results[].reason` da primeira falha para `progress.json.last_error` (formato `"<critério-id>: <reason>"`), agrega `error_streak` e atualiza `circuit_state` conforme governor thresholds _(Round 2)_ |

## Agente @validator — especificação

**Missão:** Validar o output do @dev contra os critérios do `harness-contract.json`. Nunca implementar. Nunca sugerir refatorações além do critério que falhou.

**Contexto que carrega (SOMENTE):**
1. `.aioson/plans/{slug}/harness-contract.json` — o contrato
2. Os arquivos entregues pelo @dev nesta fase (listados em `progress.json.completed_steps`)
3. Output de ferramentas: ESLint, tsc, testes unitários

**Contexto que NUNCA carrega:**
- Outros agentes, PRD, requirements, architecture
- Código de outras features
- Histórico de sessões anteriores do @dev

**Output format:**
```json
{
  "phase": 1,
  "validation_at": "ISO-8601",
  "results": [
    {"id": "C1", "passed": true, "reason": null},
    {"id": "C2", "passed": false, "reason": "ESLint: no-unused-vars em src/commands/harness.js:42"}
  ],
  "overall_score": 0,
  "ready_for_done_gate": false
}
```

## Tarefas residuais — Round 2 sheldon (2026-05-07)

> Surfaced após auditoria do `@validator` em 2026-05-07. A feature foi marcada `done` prematuramente em 2026-04-10 (apenas design completo); execução das 3 fases ficou pendente. Esta lista cobre os gaps que tornam o `@validator` órfão hoje.

### Tarefa T1 — Handoff `@qa → @validator` (cobre AC-HD-13)
- Editar `template/.aioson/agents/qa.md` E `.aioson/agents/qa.md` (workspace+template parity — brain `sheldon-001`)
- Adicionar seção "Specialized agent triggers" → recomendação automática de `@validator` quando `harness-contract.json` existe na feature ativa
- Mensagem template: *"Harness contract detected ({path}). Activate `/validator` to run binary verification before `feature:close`."*

### Tarefa T2 — Routing em `workflow:next` (cobre AC-HD-14)
- Editar `src/commands/workflow-next.js`
- Adicionar lookup: se `active_feature` tem `.aioson/plans/{slug}/progress.json` com `status: "waiting_validation"`, retornar `@validator` como next agent
- Sem progress.json ou sem status `waiting_validation` → roteamento atual mantido
- Update i18n: `src/i18n/messages/{en,pt-BR}.js` para mensagens de routing

### Tarefa T3 — Tradutor `results[] → last_error` (cobre AC-HD-15)
- Editar `src/commands/harness.js` em `runHarnessValidate`
- Substituir invocação atual de `aioson verify:gate` por `aioson agent:prompt validator . --slug={slug} --json` (ou padrão equivalente)
- Parsear output JSON do agente conforme schema do validator.md
- Tradução: primeira falha (`results.find(r => !r.passed)`) → `progress.json.last_error` no formato `"<id>: <reason>"`
- Agregar: `passed_count / total_count` em `progress.json.metrics`; incrementar `error_streak` se overall_score=0; reset se overall_score=1

### Tarefa T4 — Propagação de AC-HD-06 para `sheldon.md` (cobertura existente)
- Editar `template/.aioson/agents/sheldon.md` E `.aioson/agents/sheldon.md`
- Adicionar passo no fluxo de enrichment: *"Em features MEDIUM, após escrever sheldon-enrichment, gerar `harness-contract.json` em `.aioson/plans/{slug}/` populado com critérios derivados dos ACs do PRD"*
- Template do contrato deve respeitar schema documentado no PRD seção "Schemas de artefatos"
- Se `harness:init` ainda não rodou, chamar `aioson harness:init . --slug={slug}` antes de popular

### Tarefa T5 — Done gate em `feature:close` (cobre AC-HD-11 refinado)
- Editar `src/commands/feature-close.js` (ou equivalente)
- Antes de marcar feature como `done`: ler `.aioson/plans/{slug}/progress.json` se existir
- Se `ready_for_done_gate !== true`: abortar com mensagem listando critério pendente (`results.find(r => !r.passed).id`)
- Se `harness-contract.json` ausente: comportamento atual (sem bloqueio)

### Tarefa T6 — Atualizar docs PT/EN
- `docs/pt/4-agentes/qa.md` já promete handoff para `@validator` (linha 66) — verificar se T1 alinha doc com agente
- `docs/en/4-agents/README.md` — mencionar `@validator` como gate condicional (presença de contrato)

### Ordem sugerida de execução
T4 → T1 → T3 → T2 → T5 → T6. T4 garante que contratos passem a existir; T1 e T3 fecham o loop @qa→@validator→@dev; T2 dá ao gateway visibilidade do estado; T5 fecha o ciclo completo.

## Sequência de implementação sugerida
1. Criar `template/.aioson/agents/validator.md` com:
   - Missão, restrições de contexto, output format definido acima
   - Protocolo de invocação: lê contrato → executa ferramentas → compara resultados → retorna JSON
   - Protocolo de feedback: escreve resultado em `progress.json.last_error` em formato consumível pelo @dev
2. Adicionar subcomando `harness:validate` em `src/commands/harness.js`:
   - Invoca `aioson agent:prompt validator . --context=harness` (ou padrão equivalente)
   - Escreve resultado em `progress.json`
   - Atualiza `circuit_state` baseado em `error_streak`
3. Adicionar done gate no `execution-gateway.js`:
   - Quando @dev tenta marcar feature como `done`, verificar se `harness-contract.json` existe
   - Se existe: checar último resultado de validação em `progress.json` — `ready_for_done_gate: true` obrigatório
   - Se `ready_for_done_gate: false`: bloquear com mensagem clara
4. Criar convenção de `smoke-tests/`: arquivos em `.aioson/plans/{slug}/smoke-tests/` executados por `harness:validate` antes do @validator
5. Criar template de `bootstrap.sh` mínimo (comentado) para @dev preencher conforme necessidade
6. Sincronizar: `npm run sync:agents`
7. Testar loop completo end-to-end: harness:init → harness:validate (fail) → corrigir → harness:validate (pass) → done gate abre

## Dependências externas
- Fase 1 concluída (gateway + circuit breaker)
- Fase 2 concluída (harness:init + harness-contract.json + progress.json)
- `aioson agent:prompt` disponível para invocar @validator

## Notas para @dev
- **Isolamento de contexto é a regra mais importante desta fase.** O @validator não pode ter acesso ao histórico do @dev — contexto separado é não-negociável
- O feedback do @validator deve ser escrito em `progress.json.last_error` em formato que o @dev consiga agir diretamente — nunca mensagens genéricas como "código incorreto"
- `smoke-tests/` são opcionais — não bloquear a Fase 3 por ausência deles. @dev cria se o projeto tiver testes unitários configurados
- `bootstrap.sh` é opcional — criar template comentado, @dev decide se usa

## Notas para @qa
- Verificar isolamento: @validator não deve ter acesso a context files além dos especificados
- Testar feedback loop: falha em C2 → feedback → correção → re-validate → pass em C2
- Testar done gate: sem `ready_for_done_gate: true` em progress.json, `features.md` não deve ser atualizado
- Testar circuit breaker no loop: forçar 5 falhas consecutivas → verificar estado OPEN em progress.json

## Fontes de referência desta fase
> Consulte se precisar de mais detalhes durante a implementação.

- [pesquisa] Validator architecture & isolamento — `researchs/validator-architecture-2026/summary.md`
- [pesquisa] Circuit breaker patterns — `researchs/ai-agent-governor-safety/summary.md`
- [arquivo] Multi-Agent Validation Loop (Step 3) — `plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt` (seção 6)
- [arquivo] PBQ Framework separação de agentes — `plans/Harness-Driven/Harness-Engineering-resumo.txt` (seção 3)
