---
slug: agent-execution-dispatcher
status: approved
gate: B
---

# Design Doc — Agent Execution Dispatcher

## Decision

Adicionar uma camada de execução entre o plano determinístico e os harnesses. Ela resolve um manifesto por feature, valida capabilities e dirige uma máquina de estados persistida. O core não conhece APIs privadas dos clientes: adapters declaram e implementam somente mecanismos comprovadamente disponíveis.

## Contract split

| Artifact | Authority |
|---|---|
| `agent-execution-{slug}.json` | como executar: host, modelo, modo, capacidade, report e limites |
| `verification.json` | se/quando QA, tester, pentester e validator são requeridos |
| `workflow-execute.json` | estado/checkpoint e agentic policy do pipeline |
| `dev-state.md` | pacote frio da fase de implementação |
| `reports/{slug}/{run_id}/` | resultados imutáveis por tentativa |

Precedência: CLI explícito permitido pelo manifesto → entrada do agente no manifesto → default do host no manifesto. `verification.json` nunca escolhe o executor quando um manifesto v1 válido existe; seu dispatch legado é fallback somente quando o manifesto está ausente.

## Manifest schema v1

Campos raiz: `version`, `feature`, `host`, `generated_at`, `agents`, `capacity_policy`, `cycle_limits`, `reporting`. Cada agente contém `enabled`, `host`, `mode` (`fresh-session|subagent|external|current-session`), `model`, `fallbacks[]` e `report`. `dev` defaulta `fresh-session`; verificadores defaultam `subagent`; `fallbacks` é opt-in. O arquivo guarda IDs e políticas, nunca tokens/comandos livres.

## Modules and paths

### Create

- `src/agent-execution/manifest.js`: defaults, load, additive merge, digest e resolução.
- `src/agent-execution/schema.js`: validação versionada e erros com JSON path.
- `src/agent-execution/capabilities.js`: capability matrix por host.
- `src/agent-execution/dispatcher.js`: state machine, lock/lease, spawn/await/cancel/reconcile.
- `src/agent-execution/reports.js`: schema e persistência atômica de reports/attempts.
- `src/agent-execution/adapters/{claude,codex,opencode}.js`: argv + capability probes, sem shell.
- `src/commands/agent-execution.js`: `init|validate|show|dispatch|resume`.
- `template/.aioson/schemas/agent-execution.schema.json` e documentação correspondente.

### Modify

- `src/commands/workflow-execute.js`: materializar/resolver manifesto, gravar path+digest e parar antes de código quando inválido.
- `src/commands/verification-plan.js`: juntar seleção de verificação com resolução de execução e report path.
- `src/verification-policy.js`: manter compatibilidade, expondo a origem (`manifest|legacy`).
- `src/cli.js`: registrar comandos/opções/exit codes.
- `src/commands/feature-create.js` ou ponto canônico de conclusão do Product: gerar manifesto após PRD sem sobrescrever edição existente.
- `template/.aioson/agents/{product,dev,qa,tester,pentester,validator}.md` e docs de autopilot/phase-loop: consumir comandos, não simular dispatch em prose.
- `template/.aioson/config/verification.json`: permanece compatível; documentação esclarece autoridade.
- `src/commands/setup.js`/update path: instalar schema/docs via merge aditivo.

## State machine

`created → validated → dev_running → verification_planned → verifier_running → awaiting_reports → correcting → approved|paused|failed|cancelled`.

Cada transição grava primeiro um evento/attempt atômico e depois atualiza o checkpoint. `run_id` e `attempt_id` tornam spawn, await e resume idempotentes. Um digest incompatível do manifesto pausa antes de retomar. PASS exige todos os reports requeridos, válidos e do digest corrente.

## Host adapters

- `claude`: usa native subagent/fresh session somente quando o mecanismo do harness for invocável; external CLI é explícito.
- `codex`: usa mecanismo de subagente do cliente quando exposto; caso contrário retorna capability ausente e fornece handoff/resume, sem inventar chamada.
- `opencode`: mesma interface e mesma política.

Adapters recebem estrutura `{prompt_path, model, cwd, report_path, timeout}` e retornam status normalizado. O processo usa executable + argv, `shell:false`, allowlist de host e cwd do projeto.

## Capacity and fallback

Classificação normalizada separa `capacity`, `invalid_model`, `auth`, `timeout`, `crash`, `unsupported_capability`. Só `capacity` consulta `capacity_policy`. Retry usa máximo/backoff; wait tem teto; fallback percorre IDs/hosts explicitamente autorizados; pausa é terminal retomável. Toda tentativa registra requested/resolved.

## Reports

JSON canônico obrigatório e Markdown opcional: schema version, feature/run/attempt, agent, host/model requested/resolved, timestamps, verdict `PASS|FAIL|BLOCKED`, findings, affected scopes e evidence. Escrita temporária + rename; report malformado equivale a BLOCKED.

## Security and risks

- Sem secrets no manifesto; variáveis do host continuam fora dele.
- Sem command strings, eval ou shell interpolation.
- Paths normalizados devem permanecer no projeto/report root.
- Logs redigem tokens/env; cancelamento mata apenas o process tree pertencente ao attempt.
- Risco principal: clientes não expõem dispatch programático uniforme. Mitigação: capability handshake e pausa honesta.
- Risco de dupla autoridade: mitigado pela tabela e pela resolução com `source` explícita.
- Risco de loops caros: limites persistidos e human gate.

## Migration order

1. Schema/resolver/report store sem integração.
2. Adapters e contract tests simulados.
3. CLI validate/show/init.
4. Integração read-only com verification plan.
5. Dispatcher/state/resume.
6. Integração workflow/product/prompts e legado.
7. Cross-host smoke e documentação.

> **Gate B:** Architecture approved — @dev can proceed.

