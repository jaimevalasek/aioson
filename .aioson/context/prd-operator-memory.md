---
feature: operator-memory
slug: operator-memory
classification: MEDIUM
status: draft
created_by: product
created_at: 2026-05-20
source_plans: ["plans/operator-memory.md"]
---

# PRD — Operator Memory

## Vision

Uma camada de memória **por-operador** (não por-projeto, não por-harness) que persiste decisões padrão do dev entre sessões, harnesses e projetos — multi-dev safe via hash de email do git.

## Problem

Developers usando AIOSON em múltiplas sessões / múltiplos harnesses (Claude Code, Codex, Gemini) e — crítico — em equipes onde vários devs operam o mesmo `.aioson/` precisam re-ditar decisões padrão (autonomia de commit/push, idioma, estilo de feedback, autorizações de tooling) toda sessão. Fricção recorrente; o esqueleto `.aioson/context/user-profile.md` existe há tempo mas nunca foi efetivamente plugado nos prompts dos agents. O auto-memory do Claude Code resolve parcialmente, mas é proprietário do harness — Codex e Gemini ficam fora.

## Users

- **Single-dev developer**: opera AIOSON em múltiplos harnesses; quer suas preferências disponíveis em qualquer cliente sem re-ditar a cada sessão.
- **Multi-dev team**: equipe onde Alice prefere autonomia de commit e Bob revisa tudo; ambos compartilham `.aioson/` committed mas precisam de memória isolada por email.
- **CI bot / shared-account**: roda como `actions-bot@github.com` ou conta compartilhada; precisa de escape hatch (`AIOSON_OPERATOR_ID`) para não contaminar memória de devs reais.

## MVP scope

### Must-have 🔴

- **Captura automática de 4 signal types** (decidido em PRD discovery): Authorization (`pode X sempre`), Exclusion (`X eu faço manual`), Correction (`não, X não` / `stop doing X`), Confirmation 2x+ (aceitação repetida sem pushback). LLM-driven via diretiva no preflight dos agents — sem regex no código.
- **Promotion threshold = 2x**: cada padrão fica em `proposals/{slug}.md` na primeira detecção; promove para `decisions/{slug}.md` na segunda (ou confirmação explícita). Evita one-shots virando memória global.
- **1-liner audit silencioso na promoção**: `✔ Memory: '<text>'. aioson op:forget <slug> p/ desfazer.` Zero fricção, undo fácil. Sem prompt Y/n bloqueante.
- **Email-hash keying multi-dev**: `sha256(git config user.email)[0..16]` como chave de diretório. Email em plain text nunca toca o disco. Storage em `~/.aioson/operators/{hash}/` (não `~/.claude/`) para consistência multi-harness.
- **Escape hatch `AIOSON_OPERATOR_ID`**: env var override para CI bots / contas compartilhadas / pair-programming.
- **MEMORY.md index + lazy decisions**: `~/.aioson/operators/{hash}/MEMORY.md` carrega sempre (1 linha por decisão, ≤150 char); arquivos individuais em `decisions/*.md` carregam só quando description match com task atual.
- **Universal loading directive**: diretiva única em `CLAUDE.md` / `AGENTS.md` (Mandatory first action) — todos os harnesses leem o MEMORY.md no preflight, lazy-load decisions/.
- **CLI surface (6 comandos)**:
  ```
  aioson op:capture   --signal=<type> --quote=<verbatim> --proposal=<paraphrase>
  aioson op:promote   <slug>                          # manual promote (skip threshold)
  aioson op:forget    <slug>                          # undo, soft-delete to history/
  aioson op:list      [--proposals|--active]
  aioson op:show      <slug>
  aioson op:identity  [show|set <id>]                 # debug + escape hatch
  ```
- **Conflict policy: project rules win**: quando operator-memory conflita com `.aioson/rules/` ou `CLAUDE.md`, project rule aplica + warning visível `⚠ Operator memory '<slug>' conflicts with project rule '<rule>'. Project rule applies.` Operator-memory não é silenciosamente sobrescrita.

### Should-have 🟡

- **TTL 90 dias sem reforço → prompt soft**: decisão sem reuso (campo `last_reinforced`) por 90 dias gera prompt suave "ainda vale?" na próxima sessão relevante. Usuário pode renovar, modificar, apagar. Balança freshness vs fricção. **Justificativa Should-have:** v1 pode shippar com decay desligado por flag e ligar via setting depois — não bloqueia adoption.
- **Migration de `user-profile.md`**: importar campos relevantes (`autonomy_preference`, `communication_style`) do `.aioson/context/user-profile.md` existente como decisions iniciais. Marcar `user-profile.md` como deprecated (não remover ainda — outros agents podem ler). Remoção v2.
- **Soft-delete to history**: `op:forget` move para `history/{ISO}-{slug}.md` em vez de delete hard — auditável + reversível por `op:restore` (v2).

## Out of scope

- **Cross-machine sync**: v1 = machine-local apenas. Sync via git em `~/.aioson/operators/.sync/` deferred para v2 (privacy risk de commitar memória pessoal).
- **GUI / TUI dashboard**: CLI-only em v1.
- **Auto-detection de profile** via heurística comportamental: v1 lê `profile` de `project.context.md` (decision-presentation skill já cobre).
- **`op:restore` para itens em history/**: v2 (delete + history é v1; restore é v2).
- **Project-level operator overrides**: ex. "este repo permite commit autônomo mesmo se operator-memory diz contrário". Deferred — depende de resposta para Open Question #1 abaixo.

## User flows

### Capture (auto-promote silencioso)

```
1. User: "pode commitar autonomamente sempre"
2. LLM detecta authorization signal → aioson op:capture --signal=authorization \
   --quote="pode commitar autonomamente sempre" \
   --proposal="commit autônomo após approval de slice"
3. CLI grava em proposals/commit-autonomy.md (1ª detecção)
4. Próxima sessão: user volta a autorizar commit autônomo
5. LLM detecta 2ª ocorrência → promote
6. CLI grava em decisions/commit-autonomy.md + atualiza MEMORY.md
7. CLI imprime: ✔ Memory: 'commit autônomo após approval de slice'. aioson op:forget commit-autonomy p/ desfazer.
```

### Loading (lazy via universal directive)

```
1. Qualquer agent inicia sessão
2. CLAUDE.md/AGENTS.md preflight: read ~/.aioson/operators/$(sha256 git-email)/MEMORY.md
3. MEMORY.md tem 8 linhas (decisões ativas) — agent absorve no contexto
4. Agent vê task atual menciona "commit" → lazy-load decisions/commit-autonomy.md
5. Agent aplica decisão sem perguntar
```

### Conflict (project rules win)

```
1. .aioson/rules/no-autonomous-commit.md existe (regra do projeto, sem commit auto)
2. Operator-memory decisions/commit-autonomy.md diz "commit autônomo OK"
3. Agent detecta conflito no preflight
4. Agent emite: ⚠ Operator memory 'commit-autonomy' conflicts with project rule 'no-autonomous-commit'. Project rule applies.
5. Agent procede sem commit autônomo
6. Operator-memory NÃO é sobrescrita silenciosamente — fica intacta para outros projetos
```

### Identity escape hatch (CI bot)

```
1. CI rodando como actions-bot@github.com
2. Env: AIOSON_OPERATOR_ID=ci-bot-shared
3. Agent: aioson op:identity show → "ci-bot-shared (override via AIOSON_OPERATOR_ID)"
4. Memória do bot fica em ~/.aioson/operators/ci-bot-shared/ (sem hash — id literal)
5. Não contamina memórias de devs reais que rodam local
```

## Success metrics

- **Fricção reduzida:** >70% das decisões padrão capturadas em proposals/ promovem para decisions/ dentro de 3 sessões (medido via telemetry `op:promote` events em 30 dias após release).
- **Cross-harness validation:** mesma decisão capturada em Claude Code está disponível em Codex/Gemini sessão seguinte (smoke test multi-harness em qa-report).
- **Zero contamination multi-dev:** Alice e Bob compartilham `.aioson/` no mesmo repo; `op:list` de cada um retorna sets disjuntos (smoke test em qa-report com 2 emails diferentes).
- **Conflict signal visível:** 100% dos conflitos com project rules emitem warning (não falham silenciosamente). Tested via fixture com `.aioson/rules/` + operator decision conflitante.
- **Promotion precision:** <5% das proposals/ promovidas indevidamente (medido via `op:forget` rate < 5% das promoções em 30 dias).

## Open questions

Decisões deferidas para `@architect` (Gate B):

1. **Project-level operator overrides** — se um projeto específico precisar override (ex. este repo permite commit autônomo, outro não), como modelar? `.aioson/operators/.overrides/{hash}.md`? Conflito com "project rules win"? **Impacto:** define se a Out-of-scope item "Project-level operator overrides" entra em v1.1 ou v2.
2. **Privacy do hash de email** — sha256 truncado em 16 chars (10^19 espaço — colisão improvável mesmo em equipes grandes). Suficiente? Ou usar hash completo para defesa em profundidade contra reverse-lookup? **Impacto:** path layout final + storage size.
3. **TTL prompt UX** — quando o prompt soft "ainda vale?" deve aparecer? Toda sessão que carrega a decisão? Só na primeira sessão pós-90d? Toolbar/banner ou prompt bloqueante? **Impacto:** decay UX (Should-have).
4. **Signal detection over-fires em corretivas contextuais** — "neste PR específico prefiro brevidade" pode virar global mesmo com threshold 2x se usuário falar similar 2x em PRs diferentes. Adicionar scope tag passive (this-PR/this-project/always) detectada pelo signal? **Impacto:** signal taxonomy v1 vs v2.
5. **Migration timing** — `user-profile.md` deprecated quando? v1.0 (com warning), v1.1 (read-only), v2 (removido)? **Impacto:** breaking change timeline.
6. **Conflict resolution para múltiplas operator decisions contraditórias** — Alice tem 2 decisões: "commit autônomo OK" (geral) e "commit autônomo NÃO em prod" (específica). Qual ganha? Specificity ranking? Last-write-wins? **Impacto:** decision merge logic.
7. **Storage path em Windows** — `~/.aioson/` em Windows resolve para `C:\Users\<user>\.aioson\`? Conflito com USERPROFILE? Permissions cross-platform? **Impacto:** install/setup logic.

Decisões deferidas para `@analyst` (Gate A):

8. **Schema exato de `decisions/{slug}.md` frontmatter** — campos `created_at`, `last_reinforced`, `signal_origin`, `scope`, `confidence`? Versionado para migration v1→v2? **Impacto:** requirements + parsing logic.
9. **MEMORY.md format quando crescer >50 linhas** — agent context budget. Pagination? Tier-based prioritization (recent + high-use first)? Truncation aggressive? **Impacto:** non-functional requirement.

## Delivery plan
<!-- @pm: owner of this section -->

### Phase 1 — Launch (v1.12.0)
1. **Storage + identity foundation** — ships before anything else because every other phase depends on `~/.aioson/operators/{identity}/` tree + `_index.sqlite` + identity resolution being operational. Six CLI command stubs ship in this phase so users can discover `op:*` exists.

### Phase 2 — Capture engine (v1.13.0)
1. **Capture + promotion engine** — once storage exists, the LLM-driven capture pipeline goes in. Decisions promote at 2x detections. Versioned prompt template ships at `template/agents/_shared/memory-capture-directive.md` (dormant — Phase 3 wires it into agents).

### Phase 3 — Cross-cutting integration (v1.14.0)
1. **Universal loading directive** — injects `## Memory loading` + `## Memory capture` into `template/CLAUDE.md` + `template/AGENTS.md`. **Ships behind `AIOSON_OPERATOR_MEMORY=true` flag default OFF** until Phase 4 ships green. Reason: inception risk — directive modifies prompt files this framework itself uses.

### Phase 4 — Safety net (v1.15.0)
1. **Conflict policy + warning surface** — binary V1: project rules always win, operator-memory emits stderr warning + telemetry. Flag flips default ON in this phase after CI smoke confirms both flag-states green.

### Phase 5 — Lifecycle + closure (v1.16.0)
1. **TTL decay + migration + closure** — per-category half-life (identity 365d / autonomy 180d / tooling 90d / default 90d), 10k hard cap, explicit `op:migrate` from `user-profile.md`, history/ cleanup at 365d, Gate D, feature:archive.

Full per-phase scope, ACs, files, and execution sequence: `.aioson/plans/operator-memory/manifest.md` + `plan-{phase}.md` × 5. Detailed sequencing + checkpoints: `.aioson/context/implementation-plan-operator-memory.md`.

## Acceptance criteria
<!-- @pm: owner of this section. Launch-tier ACs only; per-phase ACs (74 total) live in plan files. -->

| AC | Description |
|---|---|
| AC-operator-memory-01 | `aioson op:identity show` resolves identity in ≤50ms cold on machine with empty `~/.aioson/operators/` (Phase 1). |
| AC-operator-memory-02 | `aioson op:capture` writes to `proposals/{slug}.md` on first detection; second detection of same slug promotes to `decisions/{slug}.md` atomically (Phase 2). |
| AC-operator-memory-03 | Promotion emits 1-liner audit `✔ Memory: '<text>'. aioson op:forget <slug> p/ desfazer.` (silent on capture-only) (Phase 2 — PMD-08). |
| AC-operator-memory-04 | With `AIOSON_OPERATOR_MEMORY=true`, agent preflight reads `~/.aioson/operators/{identity}/MEMORY.md` and lazy-loads matching decisions (Phase 3). |
| AC-operator-memory-05 | With `AIOSON_OPERATOR_MEMORY` unset/false, agent preflight is byte-identical to pre-Phase-3 baseline (Phase 3 — backward compat). |
| AC-operator-memory-06 | Universal directive ≤300 tokens per agent file; cross-cutting ≤6k tokens framework-wide (Phase 3 — NFR-02). |
| AC-operator-memory-07 | Operator decision conflicting with project rule emits stderr warning `⚠ Operator memory '<slug>' conflicts with project rule '<rule>'. Project rule applies.` Operator decision unchanged on conflict (Phase 4 — PMD-09). |
| AC-operator-memory-08 | Decision past category half-life surfaces stderr `⏱ Memory '<slug>' is Nd stale ...` with `op:reinforce` and `op:forget` action hints, debounced 30d per slug (Phase 5 — PMD-03). |
| AC-operator-memory-09 | `aioson op:migrate` consumes `.aioson/context/user-profile.md`, creates identity-category decisions, marks file `deprecated_by: operator-memory`. Idempotent (Phase 5). |
| AC-operator-memory-10 | 10k hard cap per identity enforced at promote-time; oldest non-identity `last_reinforced` pruned to `history/` first (Phase 5 — PMD-04). |
| AC-operator-memory-11 | Multi-dev isolation: two different `AIOSON_OPERATOR_ID` values on same host return disjoint `op:list` outputs (Phase 1 + smoke `[OM-ALL]`). |
| AC-operator-memory-12 | `scripts/smoke-run-chain.js` `[OM-ALL]` section green covering F5.1 decay + F5.2 migrate + F5.3 hard cap. CI gate via `release-smoke.yml` (Phase 5 — closure). |

Per-phase detailed ACs (74 total: AC-P1-01..10, AC-P2-01..12, AC-P3-01..12, AC-P4-01..10, AC-P5-01..14, AC-NFR-01..04 × 4 sub-acs, AC-AN-01..02) live in `.aioson/plans/operator-memory/plan-{phase}.md` and `.aioson/context/requirements-operator-memory.md`.

## Recommended chain

`/sheldon` (enrichment + brain query por similar memory systems / KV stores) → `/analyst` (requirements + ACs + 9 open questions for Gate A) → `/architect` (decisões 1-7 acima, signal detection imperative vs declarative architecture, conflict resolution data model) → `/pm` (implementation-plan-{slug}.md MEDIUM) → `/dev` (6 CLI commands + agent preflight directive + migration logic) → `/qa` (test coverage incluindo multi-dev e multi-harness smoke).

## Linked work

- `plans/operator-memory.md` — pre-production research seed (consumed by this PRD)
- `.aioson/context/user-profile.md` — esqueleto existente, marked for deprecation em v1.1
- `feedback_commit_publish_autonomy.md` (Claude Code auto-memory) — stopgap atual; migra para operator-memory em primeira detecção
- Rule 7 em `decision-presentation/SKILL.md` (v1.9.4) — não substitui esta feature mas reduz fricção complementar
