---
feature: loop-guardrails
classification: SMALL
created_at: 2026-06-09
source: plans/plano-relatorio-aioson-loop-engine.md
research:
  - researchs/scope-guard-coding-agents-2026/summary.md
  - researchs/auto-handoff-pipeline-2026/summary.md
  - researchs/multi-agent-token-budget-2026/summary.md
---

# PRD — Loop Guardrails (evolução do harness/self:loop)

## Vision

Transformar o loop autônomo existente (`self:loop` + `harness-contract.json`) em um loop controlado por contrato verificável — com fronteira de arquivos, orçamento aplicado, gates humanos e critérios avaliados — sem criar nenhum subsistema novo.

## Problem

Hoje o `self:loop` itera com cap e o circuit-breaker bloqueia por excesso de passos/erros, mas nada impede o agente de alterar arquivos fora do escopo da feature, o `cost_ceiling_tokens` existe no schema e nunca é aplicado, os `criteria[]` do contrato nunca são avaliados automaticamente, e não há aprovação humana persistida no meio do loop. Quem roda o loop hoje (dev usando Claude Code/Codex) confia no agente; quem rodará amanhã (usuário leigo no AIOSON Play) não pode nem saber que essa confiança é necessária.

## Users

- **Dev indie (Jaime / usuários do CLI)**: rodar `self:loop` numa feature e confiar que o loop só toca os arquivos do escopo, para no orçamento e pausa para aprovação em mudança sensível — sem vigiar o terminal.
- **Usuário leigo (AIOSON Play, futuro)**: consumir esses guardrails via UI sem ver a complexidade. Esta feature entrega a fundação CLI; a UI fica no repo do Play.
- **Agentes downstream (@qa, @validator)**: receber por tentativa artefatos auditáveis (arquivos alterados, logs de checks, motivo de parada) em vez de reconstruir o que aconteceu.

## MVP scope

### Must-have 🔴

- **Scope guard** — novos campos `allowed_files[]` / `forbidden_files[]` (globs) no `harness-contract.json`. Após cada tentativa do `self:loop`, validar `git diff --name-only` contra os globs; violação → pausa o circuito, registra evento com os arquivos violados e injeta instrução de reparo/rollback. Defaults seguros de `forbidden_files` mesmo quando o campo está ausente (`.env*`, `*.pem`, `*.key`, `secrets/**`, `.git/**`, `node_modules/**`, lockfiles). É a lacuna crítica: nada no código faz isso hoje. _(sheldon: a detecção do conjunto de arquivos alterados usa `git status --porcelain` comparado ao baseline capturado no preflight — `git diff --name-only` puro não lista arquivos novos não-rastreados, o que deixaria passar a criação de um arquivo proibido. O preflight registra o estado git inicial; working tree sujo no início do loop não gera falsa violação. O matching de globs normaliza separadores de caminho (Windows).)_
- **Human gates temáticos** — campo `human_gate.required_for[]` no contrato (temas: `payment_logic_change`, `auth_permission_change`, `database_destructive_change`, `publish`). Detecção por caminho/padrão de arquivo alterado pausa o loop em estado `HUMAN_GATE`; `aioson harness:approve . --slug=X --gate=Y` / `harness:reject` persistem a decisão (quem, quando, motivo) e retomam ou encerram. Rejeição encerra a tentativa com resumo — não gera replanejamento automático no MVP. _(sheldon: o mapeamento tema→caminho tem defaults embutidos com override opcional via `human_gate.themes[].paths` no contrato — `payment_logic_change`→`**/billing/**`,`**/payment/**`; `auth_permission_change`→`**/auth/**`; `database_destructive_change`→`**/migrations/**`. O tema `publish` não é detectável por diff de arquivo: atua como gate de comando interceptando `feature:close`/publicação. Semântica de retomada: ao entrar em `HUMAN_GATE` o processo `self:loop` encerra com estado persistido em disco; `harness:approve` grava a decisão e re-executar `self:loop` retoma idempotentemente do mesmo ponto.)_
- **Enforcement de orçamento** — aplicar o `cost_ceiling_tokens` já existente (best-effort, estimativa honesta — pesquisa mostra que estimativa imprecisa documentada > nenhum controle) + novo `max_runtime_minutes`. Política: 80% → warning em evento; 100% → pausa com resumo (espelha squad:autorun, que já faz budget gating). _(sheldon: fonte da estimativa resolvida — heurística chars/4 sobre o output do agente (erro típico 5–15%, aceitável para guard de parada), gravada na coluna `execution_events.token_count` que já existe em `src/runtime-store.js`; sem dependência nova, `tokenx` como upgrade path. Ver researchs/llm-token-estimation-2026.)_
- **Avaliação determinística de `criteria[]`** — cada critério pode declarar `verification` (comando). O loop executa os comandos por tentativa, salva stdout/stderr em log por attempt e gera assinatura de falha; mesma assinatura 2x → para e escala para humano (hoje o `error_streak` só conta erros consecutivos, não detecta "mesmo erro"). _(sheldon: os comandos de verificação executam via `executeInSandbox` de `src/sandbox.js` — timeout, kill de process tree e captura de stdout/stderr já resolvidos; não criar runner novo.)_
- **Artefatos por tentativa** — `.aioson/plans/{slug}/attempts/{n}/` com `changed-files.json` + logs dos checks (insumo do scope guard e do @qa).
- **Retrocompatibilidade** — contratos existentes sem os novos campos continuam válidos: scope guard aplica só os defaults proibidos, sem gates e sem orçamento. Nenhum comando existente muda de forma incompatível.
- **Validação de schema do contrato no preflight** _(sheldon)_ — hoje não existe validador (`src/commands/harness.js` define o template, mas campos desconhecidos são silenciosamente ignorados); um typo em `allowed_files` desligaria o guard sem aviso. O preflight valida o contrato e falha com erro explícito para campo desconhecido ou malformado — pré-requisito de segurança dos demais guards.

### Should-have 🟡

- **`aioson harness:status . --slug=X`** — visão humana agregada: estado do circuito, iteração N/M, checks passados/falhos, última falha, gate pendente, próxima ação. (JSON via `--json`.)
- **Presets de `contract_mode`** — `safe`/`builder`/`autopilot` como presets dos valores do governor (iterações, orçamento, gates), em vez de sistema novo. `BALANCED` permanece o default.
- **`diff.patch` por tentativa** — backup/rollback simples por attempt.
- **`max_changed_files` / `max_diff_lines`** _(sheldon)_ — guards determinísticos triviais sobre o mesmo diff que o scope guard já calcula; detectam "refactor descontrolado" cedo e barato (origem: plano fonte §18.1).
- **Reforço via `git:guard`** — padrão em camadas: hook pre-commit também checa `forbidden_files` do contrato ativo. _(sheldon: hoje o git:guard lê apenas `.aioson/git-guard.json` e não conhece contrato — a implementação faz merge das `forbidden_files` do contrato ativo na política do guard.)_

## Out of scope

- Diretório `.aioson/loops/` ou arquivo `loop.contract.json` — o `harness-contract.json` evolui in-place; uma fonte de verdade por feature.
- Namespace `loop:*` novo — comandos vivem em `harness:*` / `self:loop`.
- Juiz por IA para critérios subjetivos (rubricas) — fase futura.
- UI do AIOSON Play — repo separado; esta feature entrega a fundação CLI.
- Triggers agendados, PR automation, worktrees múltiplas, publicação automática.
- Custo real por provedor (USD) — só tokens estimados/tempo no MVP.
- Tema de gate `security_high_finding` — exige integração com @pentester; adiado para evolução futura. _(sheldon)_

## User flows

### Loop com scope guard (caminho feliz)
Dev roda `aioson self:loop . --agent=dev --task=... --max-iterations=3` → preflight valida contrato (scope/orçamento presentes ou defaults) → @dev implementa → scope guard compara diff com globs (ok) → checks dos `criteria[]` rodam e passam → `recordSuccess()` → `ready_for_done_gate=true` → `feature:close` (fluxo já existente).

### Violação de escopo
Tentativa altera `src/modules/auth/middleware.js` fora dos `allowed_files` → loop pausa, evento `scope_violation` com a lista de arquivos → feedback da próxima iteração instrui reverter e refazer dentro do escopo → se reincidir, circuito abre e escala para humano.

### Gate humano
Diff toca `prisma/migrations/**` (tema `database_destructive_change`) → loop entra em `HUMAN_GATE`, grava `gates/{id}.json` com o diff resumido → usuário roda `aioson harness:approve . --slug=billing --gate=migration-1` → decisão persistida em evento → loop retoma da tentativa atual. `harness:reject` → loop encerra com `loop.summary` e verdict pendente.

### Parada por orçamento
Tokens estimados atingem 80% do `cost_ceiling_tokens` → warning em evento → 100% → pausa com resumo do que foi feito e do que falta → usuário decide ampliar orçamento (editar contrato) e retomar, ou encerrar.

## Success metrics

- **Contenção de escopo**: em teste de violação proposital, 100% das alterações fora de `allowed_files`/em `forbidden_files` são detectadas e pausam o loop antes de `feature:close`.
- **Parada garantida**: loop nunca excede `max_iterations`, `cost_ceiling_tokens` (estimado) ou `max_runtime_minutes` — verificado por testes determinísticos dos guards.
- **Gate round-trip**: `harness:approve`/`reject` retomam/encerram o loop corretamente com decisão auditável em 100% dos casos de teste.
- **Retrocompat**: suíte existente (`npm test`) verde; contratos antigos rodam sem alteração.

## Delivery plan _(sheldon)_

1. **Fase 1 — Guards no hook pós-attempt** (entregável e verificável sozinha): validação de schema do contrato + baseline git no preflight; scope guard (`git status --porcelain` vs globs, defaults seguros); enforcement de orçamento (`cost_ceiling_tokens` via heurística chars/4 + `max_runtime_minutes`, política 80/100%); artefatos por tentativa (`attempts/{n}/` com `changed-files.json` e `diff.patch`); `max_changed_files`/`max_diff_lines`. Tudo se ancora no mesmo ponto: após cada tentativa do `self:loop` (`src/commands/self-implement-loop.js`, hook natural após o verify, ~linha 224).
2. **Fase 2 — Gates, critérios e visibilidade**: avaliação determinística de `criteria[]` com `verification` por critério via `executeInSandbox`, assinatura de falha e escalação em 2x; estado `HUMAN_GATE` + `harness:approve`/`harness:reject` com persistência e retomada idempotente; `harness:status` (+ `--json`); presets de `contract_mode`; reforço no `git:guard`.

Cada fase fecha com `npm test` verde e os testes determinísticos dos guards da própria fase; a Fase 1 já entrega valor (loop pausa por violação/orçamento) mesmo antes da Fase 2.

## Open questions

- Ponto exato de estimativa de tokens sem acesso ao provider (chars de output? dados do runtime-store?) — decidir com @architect; o MVP aceita estimativa documentadamente imprecisa. **Resolvida _(sheldon)_:** heurística chars/4 sobre output do agente, persistida na coluna `execution_events.token_count` já existente; sem dependência nova.
- Detecção de tema do human gate: só por caminho de arquivo (determinístico) ou também por padrão no diff (ex.: `DROP TABLE`)? Recomendação inicial: caminho no MVP, conteúdo como evolução. **Resolvida _(sheldon)_:** caminho no MVP confirmado, com mapa de defaults + override no contrato (ver Must-have); inspeção de conteúdo do diff fica como evolução.
- `harness:status` deve absorver/aliasar o que `spec:status` já mostra? Evitar dois status concorrentes. **Resolvida _(sheldon)_:** escopos distintos — `spec:status` (src/commands/spec-status.js) mostra progresso de planos + learnings; `harness:status` mostra estado de contrato/circuito/gates. Mantêm-se separados, um referenciando o outro no rodapé.

## Reference sources _(sheldon)_

- `plans/plano-relatorio-aioson-loop-engine.md` — fonte original (re-minerada: baseline git §19.4, limites de diff §18.1, temas de gate §19.3).
- `researchs/scope-guard-coding-agents-2026/summary.md` — fronteiras declaradas deny-by-default, enforcement em camadas.
- `researchs/llm-token-estimation-2026/summary.md` — heurística chars/4 (erro 5–15%), `tokenx` como upgrade path.
- `researchs/multi-agent-token-budget-2026/summary.md` — budget gating multi-agente.
- `researchs/auto-handoff-pipeline-2026/summary.md` — handoff/pipeline automatizado.
- Verificação de código (2026-06-09): `self-implement-loop.js` (hook pós-verify), `runtime-store.js:741` (`token_count`), `sandbox.js` (`executeInSandbox`), `harness.js` (sem validador de schema), `git-guard.js` (config própria).
