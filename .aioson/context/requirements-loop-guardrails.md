---
feature: loop-guardrails
classification: SMALL
created_at: 2026-06-09
source_prd: .aioson/context/prd-loop-guardrails.md
enrichment: .aioson/context/sheldon-enrichment-loop-guardrails.md
gate_a: approved
---

# Requirements — Loop Guardrails

## 1. Resumo da feature

Evoluir `self:loop` + `harness-contract.json` para um loop controlado por contrato verificável: fronteira de arquivos (scope guard), orçamento aplicado (tokens/tempo), gates humanos persistidos e `criteria[]` avaliados deterministicamente — sem subsistema novo. Entrega em 2 fases (ver `## Delivery plan` do PRD).

## 2. Entidades novas e campos

Esta feature é CLI/filesystem — as "entidades" são schemas de JSON em disco e eventos no runtime store (SQLite), não tabelas novas.

### 2.1 `harness-contract.json` — campos novos (extensão in-place)

| Campo | Tipo | Obrigatório | Default / Constraints |
|-------|------|-------------|----------------------|
| `allowed_files` | string[] (globs) | não | ausente = sem allowlist (qualquer caminho, exceto proibidos). Array vazio = tratado como ausente + evento de warning (allowlist vazia bloquearia tudo) |
| `forbidden_files` | string[] (globs) | não | sempre mesclado com defaults embutidos: `.env*`, `*.pem`, `*.key`, `secrets/**`, `.git/**`, `node_modules/**`, lockfiles. Defaults não são removíveis via contrato |
| `governor.max_runtime_minutes` | number \| null | não | null = sem limite de tempo. Inteiro > 0 |
| `governor.max_changed_files` | number \| null | não (should-have) | null = sem limite |
| `governor.max_diff_lines` | number \| null | não (should-have) | null = sem limite |
| `human_gate` | object \| ausente | não | ausente = nenhum gate (retrocompat) |
| `human_gate.required_for` | string[] | sim (se `human_gate` presente) | enum: `payment_logic_change`, `auth_permission_change`, `database_destructive_change`, `publish` |
| `human_gate.themes` | array \| ausente | não | override do mapa tema→caminho |
| `human_gate.themes[].name` | string | sim | um dos temas do enum acima |
| `human_gate.themes[].paths` | string[] (globs) | sim | substitui (não mescla) os paths default do tema |
| `criteria[].verification` | string \| ausente | não | comando shell executado via `executeInSandbox`. Ausente = critério não avaliado automaticamente (comportamento atual) |
| `contract_mode` | string | já existe | passa a aceitar presets `safe`/`builder`/`autopilot` além de `BALANCED` (default inalterado). Preset preenche valores do governor não definidos explicitamente; valor explícito no contrato vence o preset |

Mapa default tema→caminho (embutido no código, override via `human_gate.themes[].paths`):

| Tema | Globs default | Detecção |
|------|---------------|----------|
| `payment_logic_change` | `**/billing/**`, `**/payment/**` | diff por caminho |
| `auth_permission_change` | `**/auth/**` | diff por caminho |
| `database_destructive_change` | `**/migrations/**` | diff por caminho |
| `publish` | — | gate de comando: intercepta `feature:close`/publicação, não diff |

### 2.2 Baseline git — `.aioson/plans/{slug}/baseline.json` (gravado no preflight)

| Campo | Tipo | Nullable | Constraints |
|-------|------|----------|-------------|
| `captured_at` | string ISO-8601 | não | momento do preflight |
| `head` | string | não | SHA do HEAD no início do loop |
| `dirty_paths` | string[] | não | saída de `git status --porcelain` no início (paths normalizados `/`); pode ser `[]` |

### 2.3 Artefatos por tentativa — `.aioson/plans/{slug}/attempts/{n}/`

| Arquivo | Conteúdo | Constraints |
|---------|----------|-------------|
| `changed-files.json` | `{ attempt, detected_at, files: [{path, status}] }` | `status` ∈ `added`/`modified`/`deleted`/`renamed` (derivado do porcelain); paths normalizados `/`; exclui `dirty_paths` do baseline |
| `checks/{criterion-id}.log` | stdout+stderr do comando `verification` | um log por critério com `verification`; inclui exit code e duração |
| `diff.patch` | `git diff` da tentativa | should-have; insumo de rollback |

### 2.4 Gate humano — `.aioson/plans/{slug}/gates/{id}.json`

| Campo | Tipo | Nullable | Constraints |
|-------|------|----------|-------------|
| `id` | string | não | único por slug; ex. `{theme}-{n}` |
| `theme` | enum | não | um dos 4 temas |
| `status` | enum | não | `pending`, `approved`, `rejected` |
| `attempt` | number | não | tentativa que disparou o gate |
| `triggered_by` | string[] | não | arquivos do diff que casaram com o tema (vazio para `publish`) |
| `diff_summary` | string | não | resumo curto do diff para decisão humana |
| `requested_at` | string ISO-8601 | não | |
| `decided_at` | string ISO-8601 | sim | null enquanto `pending` |
| `decided_by` | string | sim | identificação do operador (git user/`--by`) |
| `reason` | string | sim | obrigatório em `rejected`, opcional em `approved` |

### 2.5 Eventos novos no runtime store (tabela `execution_events` existente — sem migration)

Tipos de evento novos (coluna `type` já é texto livre): `scope_violation`, `budget_warning`, `budget_exceeded`, `runtime_exceeded`, `human_gate_requested`, `human_gate_decision`, `criteria_check_failed`, `failure_signature_repeat`, `contract_invalid`, `diff_limit_exceeded`. A coluna `token_count` (já existe, `src/runtime-store.js:741`, nullable) passa a ser populada com a estimativa chars/4 por evento de tentativa.

## 3. Mudanças em entidades existentes

- **`progress.json`** (`.aioson/plans/{slug}/`): o estado do loop ganha o valor `HUMAN_GATE` ao lado dos estados atuais do circuito; campo apontando o gate pendente (`pending_gate: {id}`). Estado persistido permite retomada idempotente.
- **`harness-contract.json`**: campos novos da §2.1; nenhum campo existente muda de tipo ou semântica. `governor.cost_ceiling_tokens` (já existe, hoje nunca aplicado) passa a ser enforced.
- **`.aioson/git-guard.json`** (should-have): política do guard passa a mesclar `forbidden_files` do contrato ativo em tempo de verificação — o arquivo em si não muda de schema.
- **`execution_events`**: sem mudança de schema; só novos valores de `type` e produção de `token_count`.

## 4. Relacionamentos

- `harness-contract.json` 1—1 `progress.json` (par já existente por slug).
- `harness-contract.json` 1—N `attempts/{n}/` (uma pasta por tentativa do loop).
- `attempts/{n}/changed-files.json` deriva de `baseline.json` (diff = porcelain atual − dirty_paths do baseline).
- `gates/{id}.json` N—1 `progress.json` (gate pendente referenciado por `pending_gate`).
- `criteria[].verification` 1—1 `attempts/{n}/checks/{id}.log`.
- Eventos no runtime store referenciam slug + attempt (padrão de eventos já existente).

## 5. Migrations

Nenhuma. `execution_events.token_count` já existe; tipos de evento são valores novos numa coluna texto; todo o resto é arquivo JSON em `.aioson/plans/{slug}/` criado on-demand.

## 6. Regras de negócio

**Fase 1 — guards no hook pós-attempt** (`src/commands/self-implement-loop.js`, após o verify, ~linha 224):

- **REQ-loop-guardrails-1** (schema): o preflight do `self:loop` valida o `harness-contract.json` e falha com erro explícito (nome do campo + motivo) para campo desconhecido ou tipo malformado. Pré-requisito dos demais guards — um typo em `allowed_files` não pode desligar o guard silenciosamente.
- **REQ-loop-guardrails-2** (baseline): o preflight captura `baseline.json` (HEAD + `git status --porcelain`). Working tree sujo no início do loop não gera falsa violação.
- **REQ-loop-guardrails-3** (detecção): após cada tentativa, o conjunto de arquivos alterados é `git status --porcelain` atual menos `dirty_paths` do baseline — nunca `git diff --name-only` puro (não vê untracked). Paths normalizados para `/` antes do matching de globs (Windows).
- **REQ-loop-guardrails-4** (defaults proibidos): os globs default de `forbidden_files` são sempre aplicados, mesmo com campo ausente ou contrato antigo, e não podem ser desativados pelo contrato.
- **REQ-loop-guardrails-5** (precedência): arquivo que casa com `forbidden_files` é violação mesmo que também case com `allowed_files` — deny vence allow.
- **REQ-loop-guardrails-6** (violação): violação de escopo pausa o circuito, registra evento `scope_violation` com a lista de arquivos e injeta instrução de reparo/rollback no feedback da próxima iteração. Reincidência abre o circuito e escala para humano.
- **REQ-loop-guardrails-7** (orçamento): tokens estimados por chars/4 sobre o output do agente, gravados em `execution_events.token_count`, agregados por slug. 80% do `cost_ceiling_tokens` → evento `budget_warning` (uma vez por run); 100% → pausa pós-tentativa com resumo (feito/faltante). `cost_ceiling_tokens: null` = sem enforcement (retrocompat).
- **REQ-loop-guardrails-8** (tempo): `max_runtime_minutes` verificado nas fronteiras de tentativa; excedido → pausa com evento `runtime_exceeded`. Timeout de comandos individuais continua sendo do sandbox.
- **REQ-loop-guardrails-9** (artefatos): toda tentativa grava `attempts/{n}/changed-files.json` e os logs dos checks; `diff.patch` quando should-have entregue.
- **REQ-loop-guardrails-10** (limites de diff, should-have): `max_changed_files`/`max_diff_lines` avaliados sobre o mesmo conjunto do scope guard; excedido → evento `diff_limit_exceeded` + pausa.
- **REQ-loop-guardrails-11** (retrocompat): contrato sem campos novos é válido; aplica só defaults proibidos, sem gates, sem orçamento. Nenhum comando existente muda de forma incompatível; `npm test` permanece verde.

**Fase 2 — gates, critérios e visibilidade:**

- **REQ-loop-guardrails-12** (detecção de tema): diff da tentativa casando com os globs do tema (defaults §2.1 ou override) e tema listado em `human_gate.required_for` → loop entra em `HUMAN_GATE`: grava `gates/{id}.json` (`pending`), persiste estado em `progress.json` e o processo encerra. Múltiplos temas na mesma tentativa → um gate por tema; todos devem ser aprovados para retomar.
- **REQ-loop-guardrails-13** (gate de comando): tema `publish` intercepta `feature:close`/publicação; nunca é detectado por diff.
- **REQ-loop-guardrails-14** (decisão): `harness:approve`/`harness:reject` exigem slug + gate id, gravam `decided_at`/`decided_by`/`reason` (obrigatório no reject) e emitem `human_gate_decision`. Decidir gate já decidido = no-op idempotente com aviso.
- **REQ-loop-guardrails-15** (retomada): re-executar `self:loop` com gate `approved` retoma idempotentemente do ponto persistido. Gate `rejected` encerra o run com `loop.summary`; novo `self:loop` inicia run novo (gate rejeitado fica como auditoria, não bloqueia runs futuros — sem replanejamento automático no MVP).
- **REQ-loop-guardrails-16** (criteria): critério com `verification` executa o comando via `executeInSandbox` (`src/sandbox.js`) por tentativa — não criar runner novo. stdout/stderr/exit/duração vão para `checks/{id}.log`. Critério sem `verification` mantém comportamento atual.
- **REQ-loop-guardrails-17** (assinatura de falha): cada check falho gera assinatura determinística (normalização do erro); mesma assinatura ocorrendo 2x no run (não precisa ser consecutiva — diferente do `error_streak`) → para e escala para humano com evento `failure_signature_repeat`.
- **REQ-loop-guardrails-18** (status): `harness:status . --slug=X` agrega circuito, iteração N/M, checks passados/falhos, última falha, gate pendente e próxima ação; `--json` para máquina. Escopo distinto de `spec:status` (planos+learnings); um referencia o outro no rodapé.
- **REQ-loop-guardrails-19** (presets): `contract_mode` `safe`/`builder`/`autopilot` são presets de valores do governor; valor explícito no contrato sempre vence o preset; `BALANCED` continua default.
- **REQ-loop-guardrails-20** (git:guard, should-have): pre-commit mescla `forbidden_files` do contrato ativo na política do guard (hoje `git-guard.js` lê apenas `.aioson/git-guard.json`).

## 7. Edge cases

- **EC-loop-guardrails-1**: arquivo novo não-rastreado em path proibido — detectado (porcelain `??`); é o caso que `git diff --name-only` deixaria passar.
- **EC-loop-guardrails-2**: working tree sujo no preflight — paths pré-existentes em `dirty_paths` não contam como alteração do loop; mas se a tentativa modificar de novo um path sujo proibido, ainda viola (conteúdo mudou após baseline — detectável por mtime/hash; decisão fina com @architect, mínimo aceitável: path sujo proibido gera warning no preflight).
- **EC-loop-guardrails-3**: rename (porcelain `R`) — ambos os paths (origem e destino) entram no conjunto alterado.
- **EC-loop-guardrails-4**: deleção de arquivo proibido — é violação (status `deleted` conta).
- **EC-loop-guardrails-5**: `allowed_files: []` — tratado como ausente + warning (allowlist vazia bloquearia qualquer escrita e inutilizaria o loop).
- **EC-loop-guardrails-6**: globs com `\` no contrato escrito no Windows — normalização de separadores antes do match; teste cobre os dois separadores.
- **EC-loop-guardrails-7**: comando `verification` que trava — timeout + kill de process tree já resolvidos pelo `executeInSandbox`; timeout conta como check falho com assinatura própria.
- **EC-loop-guardrails-8**: `harness:approve` sem loop pausado ou com gate id inexistente — erro explícito, sem efeito colateral.
- **EC-loop-guardrails-9**: processo morto (Ctrl+C/queda) durante `HUMAN_GATE` — estado já está em disco; re-executar `self:loop` reapresenta o gate pendente em vez de re-detectar/duplicar.
- **EC-loop-guardrails-10**: eventos legados com `token_count` null — agregação trata null como 0; orçamento só considera eventos do run atual do slug.
- **EC-loop-guardrails-11**: 80% e 100% cruzados na mesma tentativa — emite `budget_warning` e `budget_exceeded` na ordem, pausa uma vez.
- **EC-loop-guardrails-12**: contrato antigo (só `feature`/`contract_mode`/`governor`/`criteria`) — passa na validação de schema; campos novos ausentes ativam apenas defaults proibidos.
- **EC-loop-guardrails-13**: mesma assinatura de falha separada por tentativas com sucesso parcial no meio — ainda conta (2 ocorrências no run, não consecutivas).

## 8. Fora de escopo desta feature

Herdado do PRD (não repetir lá): `.aioson/loops/`/`loop.contract.json`, namespace `loop:*`, juiz por IA, UI do Play, triggers agendados/PR automation/worktrees/publicação automática, custo USD real, tema `security_high_finding` (depende de @pentester).

## 9. Classificação (feature)

Score oficial: tipos de usuário `1` (dev CLI; leigo via Play é futuro) → 0 pts; integrações externas novas `0` (git, sandbox e SQLite são módulos locais já existentes) → 0 pts; regras de negócio `complexas` (state machine de gate, guards em camadas, assinatura de falha) → 2 pts. **Total 2 → SMALL** — confirma o frontmatter do PRD; o `MEDIUM` no dossier é herança da classificação do projeto, não da feature. Conformance YAML não requerido (apenas MEDIUM).

## 10. Gate A

- [x] Objetivos claros e sem ambiguidade (PRD Vision/Problem + §1)
- [x] Comportamentos esperados descritos (REQ-1..20 + user flows do PRD)
- [x] Constraints explícitas (retrocompat REQ-11, defaults não-removíveis REQ-4)
- [x] Out of scope listado (§8)
- [x] Ambiguidades documentadas (EC-2 — decisão fina de path sujo proibido fica para @architect)
- [x] REQ-{slug}-{N} para todas as regras; AC = success metrics do PRD + REQs verificáveis por teste determinístico

**Gate A: approved.**
