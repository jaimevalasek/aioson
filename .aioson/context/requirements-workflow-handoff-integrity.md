---
feature: workflow-handoff-integrity
slug: workflow-handoff-integrity
classification: MEDIUM
created_by: analyst
created_at: 2026-05-20
gate_a: ready-to-approve
sources:
  - prd-workflow-handoff-integrity.md (enriched 2026-05-20)
  - sheldon-enrichment-workflow-handoff-integrity.md
  - .aioson/plans/workflow-handoff-integrity/manifest.md + 5 phase files
  - .aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md
---

# Requirements — Workflow Handoff Integrity

## Feature summary

Endurecer auto-orquestração da cadeia AIOSON: state pointer reflete artefatos em disco, CLI guard previne handoff inválido, stale state é detectado de forma acionável, drift estrutural template ↔ workspace é detectado em CI, e cadeia ponta-a-ponta é validada antes de cada `npm publish`. Sem entidades de domínio — feature framework-internal puro.

## Scope reuse

Esta feature **não introduz entidades de domínio novas**. Não há mudanças em `discovery.md` (project-level). Todo trabalho atua sobre artefatos abstratos do framework: workflow state file, sheldon manifests, agent files, CI workflow files, fixture greenfield.

Por isso o output contract padrão do `@analyst` (entidades + fields + relationships + migrations + indexes) é N/A. Substituído por **functional requirements + acceptance criteria + edge cases + business rules** — mais coerente com feature framework-internal.

## Functional requirements

### RF-01 — Agent:done auto-emits workflow:next (F2)
**Source:** PRD F2 must-have + phase 1 plan.
**Outcome:** `aioson agent:done . --agent=<X>` em projeto com workflow ativo detecta artefato canônico em disco e chama `workflow:next --complete=<X>` internamente, sem depender de instrução literal no prompt do agente.

### RF-02 — CLI guard rejects advance with pending decisions (F3)
**Source:** PRD F3 must-have + phase 2 plan.
**Outcome:** `aioson workflow:next --complete=<upstream>` recusa avançar se `.aioson/plans/{slug}/manifest.md` frontmatter tem `status: pending-*-decisions`. Mensagem de erro recomenda o agente correto.

### RF-03 — Stale dev-state offers interactive cleanup (F1)
**Source:** PRD F1 must-have + phase 3 plan.
**Outcome:** Quando `preflight.js:72` detecta `dev-state.md` stale (feature done OU órfã OU > 30 dias), emite warning estruturado com comando direto (`aioson state:reset` OU `aioson state:save --feature=<nova>`), NÃO cleanup silencioso.

### RF-04 — Semantic sync preflight detects template drift (T5)
**Source:** PRD T5 must-have + phase 4 plan.
**Outcome:** `src/commands/sync-agents-preflight.js` estendido detecta divergência semântica (headers, code blocks com tokens testáveis, frontmatter) entre `template/.aioson/agents/<X>.md` e `.aioson/agents/<X>.md`. Comportamento: warning local, hard fail em pre-publish.

### RF-05 — CI smoke test gates `npm publish` (T6)
**Source:** PRD T6 must-have + phase 5 plan.
**Outcome:** GitHub Actions workflow em PRs com label `release` executa cadeia mock MEDIUM ponta-a-ponta em fixture greenfield gerada fresh + T5 em modo pre-publish. Falha de qualquer step bloqueia merge.

### RF-06 — Should-have: Atualizar prompts dos agents upstream para F3 (defesa em camadas)
**Source:** PRD Should-have.
**Outcome:** `.aioson/agents/analyst.md` (e similares) atualizados para verificar manifest antes de propor próximo agente. Não substitui RF-02 (CLI guard); reforça via prompt-level awareness.

### RF-07 — Should-have: Auditoria de outras migrações em `.aioson/plans/`
**Source:** PRD Should-have + Briefing G14.
**Outcome:** Relatório (NÃO código) identificando outras migrações com mesmo padrão de implementação parcial. Output candidato para briefing meta futuro.

### RF-08 — Should-have: Conferir `manifests/dev.manifest.json` required:false vs Gate C
**Source:** PRD Should-have F4 resíduo + Briefing G12.
**Outcome:** Documentar se `required: false` em manifest é inconsistência com Gate C exigindo arquivo, ou camadas separadas (manifest = leitura; gate = existência). Decisão documentada.

### RF-09 — Wiring audit document obrigatório pré-closure (cross-cutting)
**Source:** Sheldon C1 enrichment (brain sheldon-006 ★5) + PMD-07 manifest.
**Outcome:** `.aioson/context/wiring-audit-workflow-handoff-integrity.md` produzido antes de `@qa` Gate D. Para CADA phase: call sites grepados, testes cobrem caminho real, smoke test exercita ponta-a-ponta.

### RF-10 — Release strategy approved by @architect (cross-cutting)
**Source:** Sheldon C2 enrichment + PRD Q10.
**Outcome:** Decisão progressivo vs single MEDIUM release documentada formalmente por `@architect` antes de Gate C. Recomendação default: progressivo `F2 → F3 → F1 → T5 → T6` em v1.9.5+.

## Acceptance criteria

ACs binárias detalhadas vivem nos 5 phase files (`.aioson/plans/workflow-handoff-integrity/plan-*.md`). Mapping resumido:

| RF | Phase plan | ACs binárias |
|----|------------|--------------|
| RF-01 (F2) | `plan-f2-agent-done-auto-emit.md` | AC-F2-01..08 (8 ACs) |
| RF-02 (F3) | `plan-f3-cli-gate-pending-decisions.md` | AC-F3-01..07 (7 ACs) |
| RF-03 (F1) | `plan-f1-stale-devstate-interactive.md` | AC-F1-01..07 (7 ACs) |
| RF-04 (T5) | `plan-t5-semantic-sync-preflight.md` | AC-T5-01..07 (7 ACs) |
| RF-05 (T6) | `plan-t6-ci-smoke-pre-publish.md` | AC-T6-01..10 (10 ACs) |

**Cross-cutting ACs (não cobertas em phase plans):**

- **AC-INTEG-01 (RF-09):** documento `wiring-audit-workflow-handoff-integrity.md` existe antes de `@qa` Gate D approve. Para cada phase, lista call sites grepados + testes correspondentes + status smoke test.
- **AC-INTEG-02 (RF-10):** spec frontmatter recebe `release_strategy: progressive|single` declarado por `@architect` antes de Gate C approve. PR template para releases referencia a estratégia.
- **AC-INTEG-03 (RF-06):** após RF-06 should-have, `.aioson/agents/analyst.md` (e outros prompts atualizados) menciona regra de checar manifest pending. Verificável via grep nos agent files do template.
- **AC-INTEG-04 (RF-07):** relatório de auditoria produzido em `.aioson/context/migration-completeness-audit.md` (ou similar). Lista plans avaliados + status.
- **AC-INTEG-05 (RF-08):** decisão sobre `manifests/dev.manifest.json` documentada em spec-{slug}.md Key decisions. Ou inconsistência fix, ou separation-of-concerns doc.

**Total: 39 binary ACs + 5 cross-cutting = 44 ACs.** AC complexity confirmadamente > 10 (sheldon score=10 includes +1 for AC complexity).

## Edge cases

- **EC-01 (F2):** `agent:done` chamado em ambiente CI sem `workflow.state.json` ativo → backward-compat path, sem auto-emit, sem error. (Coberto AC-F2-02.)
- **EC-02 (F2):** Dois agentes (paralelos via concorrência futura) chamam `agent:done` simultaneamente para mesmo feature → idempotency previne double-event. (Coberto AC-F2-05.)
- **EC-03 (F2):** `workflow.state.json` corrompido (JSON parse fail) → log warning, fallback para backward-compat path, NÃO crash. **GAP:** AC explícito ausente — adicionar `AC-F2-09: graceful degradation on workflow.state corruption`.
- **EC-04 (F2):** Agente em map de canonical artifacts (`agent-artifact-map.js`) ausente ou typo → log warning + skip auto-emit, não crash. **GAP:** AC explícito ausente — adicionar `AC-F2-10: missing artifact map entry skips gracefully`.
- **EC-05 (F3):** Manifest existe mas frontmatter sem campo `status` → guard skip (não bloqueia). Coberto AC-F3-04.
- **EC-06 (F3):** Manifest com `status: pending-architect-decisions` E `--force` flag → loga warning, prossegue. Coberto AC-F3-03.
- **EC-07 (F1):** `dev-state.md` corrupto (YAML parse fail) → trata como stale, oferece reset. **GAP:** AC explícito ausente — adicionar `AC-F1-08: corrupt dev-state treated as stale`.
- **EC-08 (T5):** Template file removido mas workspace existe → categorização "file removed in template" como warning de severidade média (não fail bloqueante). **GAP:** AC explícito ausente — adicionar `AC-T5-08: missing template file detection`.
- **EC-09 (T6):** Cadeia mock leva > 10min (timeout) → fail com mensagem "smoke test timeout — provavelmente regressão de performance ou bug em chain". Coberto AC-T6-07.
- **EC-10 (T6):** `npm pack` falha (filesystem error, disk full) → workflow fail step 1, mensagem clara. Coberto AC-T6-08.
- **EC-11 (T6):** Mock fixture decision files com formato inválido → smoke chain fail em phase específica + mensagem indica fixture file inválido. Coberto AC-T6-08.
- **EC-12 (cross-cutting):** Branch divergente (workspace mais novo que template, ou inverso) entre F2/F3/T5 partial implementation → T5 hard fail captures. Coberto AC-T5-06.

**Total edge cases identificados: 12.** GAPs (ACs faltantes) listados: 4. Recomendação para `@dev`: adicionar AC-F2-09, AC-F2-10, AC-F1-08, AC-T5-08 nos plan files antes de implementar.

## Business rules

Regras invariantes do framework, derivadas de constraints PRD + sheldon enrichment + brain insights:

- **BR-01 — Idempotency em emissão de eventos:** `agent:done` (e `workflow:next` chamado internamente) emite no máximo 1 workflow event por `(agent, feature, artifact_hash)`. Re-execução é safe.
- **BR-02 — Ordem de emissão:** Telemetry SQLite (`agent_events` row) SEMPRE precede workflow event quando ambos são gerados. Consumers downstream confiam nessa ordem.
- **BR-03 — Backward-compat default:** Modificações em CLI commands existentes (`agent:done`, `preflight`, etc.) preservam stdout output e exit code em modo default. Novo comportamento é opt-in via flag ou gated por presence de state file.
- **BR-04 — Defesa em camadas:** CLI guards (RF-02 F3) **complementam**, não **substituem**, instruções nos prompts dos agentes (RF-06). Ambas camadas devem estar presentes em produção.
- **BR-05 — Wiring audit obrigatório (brain sheldon-006 ★5):** Nenhuma feature MEDIUM marca `done` em `features.md` sem documento `wiring-audit-{slug}.md` cobrindo cada mudança implementada. Não é opcional, não pode ser skipped.
- **BR-06 — Fresh fixture rule:** CI fixtures testando setup ponta-a-ponta (T6) NÃO são pinadas no repo. Geradas fresh a cada run via `npm pack + aioson setup`. Aplica-se a qualquer feature futura que teste setup completo.
- **BR-07 — Progressive release default para MEDIUM com phases independentes:** Features MEDIUM com phases independentemente implementáveis (como esta, 5 phases) shipam progressivamente. Ship único requer override explícito de `@architect` com justificativa (ex: phases mutuamente dependentes que não fazem sentido em isolado).
- **BR-08 — Sheldon manifest é authoritative para gate status:** Quando manifest existe (Path B), seu frontmatter `status: pending-*-decisions` é o sinal canônico para CLI guard. Prompts de agente NÃO devem duplicar essa checagem com lógica própria — apenas referenciar o manifest.

## Migration additions

**N/A — feature framework-internal sem mudanças de schema, sem domain entities.**

Note: pode introduzir schema mudança em `.aioson/runtime/workflow.state.json` (novo campo `last_workflow_event_at` para BR-01 idempotency). Não é "migration" no sentido tradicional (banco) — é evolução de file format. Backward-compat: campo missing é tratado como timestamp zero, primeiro `agent:done` autonum.

## Out of scope

(Espelhado do PRD para clareza de @architect:)

- Hotfix `pm.md` template + test alignment — completado em v1.9.3 (a90272d).
- Refactor do state machine de workflow — F2 adiciona auto-emissão, não redesenha.
- Sync inverso `source → template` como modo bidirecional — separate decision, possivelmente SMALL follow-up.
- Reset automático silencioso de `dev-state.md` — explicitamente NÃO (PRD Out of scope, F1 é warning acionável).
- Reescrita dos 20+ agent files com `workflow:next --complete` literal — centralizado em F2, redundante.
- Suporte a múltiplos workflow.state.json simultâneos em mesmo projeto — single state por projeto, mudança futura se necessário.

## Classification confirmation

Per `@analyst` formal scoring (PRD frontmatter já tem `classification: MEDIUM`):

- **User types:** 1 (developers AIOSON) → 0 pts
- **External integrations:** 0 internas (filesystem + SQLite locais) → 0 pts
- **Business rule complexity:** complex (8 BRs cross-cutting, 5 PMDs pre-made, 5 DDs deferred, defense-in-depth, idempotency, backward-compat) → 2 pts

**Score baseline: 2 → SMALL** por formula 0-6.

Por que classification é **MEDIUM** apesar de score 2:
- Sheldon enrichment-paths scoring (que conta phases) = 10
- 5 phases independentemente implementáveis com release strategy progressivo (RF-10)
- Brain sheldon-002 ★5 confirma MEDIUM = full chain quando phases > 1
- Cross-cutting wiring audit obrigatório (RF-09) é signature de MEDIUM

**Decisão analyst:** confirmar MEDIUM. A formula 0-6 do `@analyst` é otimizada para features com domain entities; para framework-internal features com multiple phases, o sheldon score é mais representativo. Documentar essa exceção na spec.

**Recommendation para framework evolution:** adicionar nova dimensão "delivery phases" ao analyst scoring formula (separate follow-up, não escopo desta feature).

## Open questions (analyst)

Adicionais às 10 da PRD (incluindo Sheldon Q10), surge nesta análise:

- **Q11 (analyst):** Os 4 GAPs de AC (AC-F2-09, AC-F2-10, AC-F1-08, AC-T5-08) listados em Edge cases — adicionar aos plan files antes de Gate B (@architect), ou deixar para @dev cobrir como parte de "anti-corruption" mindset? **Recomendação:** adicionar aos plan files ANTES de Gate B — sheldon não capturou + analyst capturou agora; melhor formalizar.
- **Q12 (analyst):** `analyst` scoring formula (0-6) não conta delivery phases — sub-representa features framework-internal multi-phase. Briefing meta para evolução do scoring? **Recomendação:** out-of-scope desta feature; capturar como follow-up MICRO.

## Risks (analyst additions)

PRD original tem 8 risks. Adicionais identificados nesta análise:

- **Risk-09 (analyst):** Inception risk durante implementação de F2. Se a cadeia de implementação (`/architect → /pm → /dev`) for executada via a cadeia AIOSON em si, e F2 estiver broken, qualquer agente que não tenha `workflow:next --complete` literal vai travar o ponteiro durante a própria implementação de F2. **Mitigação:** primeira phase implementada em modo "manual workflow:next" (developer chama explicitamente) ou via `/deyvin` direto evitando cadeia completa. Após F2 estável (v1.9.5), phases seguintes podem usar a cadeia.
- **Risk-10 (analyst):** GAP de AC cobertura — 4 edge cases (EC-03/04/07/08) sem AC explícito. Sem fix, @dev pode implementar sem cobertura testável dessas branches. **Mitigação:** Q11 acima.
- **Risk-11 (analyst):** Test fragility em AC-F2-02 (backward-compat byte-a-byte). Mudanças cosméticas em log format ou ordering podem quebrar baseline. **Mitigação:** definir baseline file versionado em `tests/baselines/agent-done-stdout.txt`; mudanças aprovadas via update explícito.

## Reference sources

- PRD: `.aioson/context/prd-workflow-handoff-integrity.md` (enriched 2026-05-20)
- Sheldon enrichment: `.aioson/context/sheldon-enrichment-workflow-handoff-integrity.md`
- Manifest: `.aioson/plans/workflow-handoff-integrity/manifest.md`
- 5 phase plans: `.aioson/plans/workflow-handoff-integrity/plan-{f2,f3,f1,t5,t6}-*.md`
- Briefing source: `.aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md`
- Brain insights: sheldon-006 ★5 (wiring audit), sheldon-002 ★5 (classification gates)
- Design doc: `.aioson/context/design-doc.md` (universal code organization rules — affects @dev, not analyst output)
- `discovery.md` + `spec.md` (project-level): not modified, no domain entities introduced

## Handoff

Gate A pronto para approve. Próximo agente: `@architect` (não `@dev` direto — MEDIUM com 5 DDs deferred).

Inputs para `@architect`:
- Esta requirements
- PRD enriched
- 5 phase plans + manifest com 5 DDs explícitos
- harness-contract.json stub (analyst NÃO populou criteria pesado — @architect decisions afetam quais ACs são realmente binárias após DD resolution)

Tarefa primary @architect:
1. Resolver DD-01..05 (manifest)
2. Populate spec-{slug}.md Key decisions com DD outcomes
3. Definir release strategy (RF-10 / Q10 PRD)
4. Gate B: pending → approved
5. Hand off para `/pm` (per PMD-06, AC-SDLC-15 — `@pm` owns implementation-plan)

DD a resolver:
- DD-01: backward-compat gating (workflow.state.json existence vs `--auto-advance` flag — primary qual?)
- DD-02: F3 regex `^pending-(.+)-decisions$` vs whitelist explícita?
- DD-03: T5 semantic diff granularity (token vs section vs hash)?
- DD-04: T6 smoke test em qual harness (Claude Code? Codex? ambos?)?
- DD-05: Release strategy progressive (recomendado) vs single MEDIUM?

`@architect` também deve revisar Q11 (analyst) — adicionar 4 ACs faltantes aos plan files antes de Gate B.
