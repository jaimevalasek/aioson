---
feature: workflow-hotfix-1-9-3
classification: SMALL
created_by: analyst
created_at: 2026-05-19
gate_a: pending
prd_source: prd-workflow-hotfix-1-9-3.md
sheldon_enrichment: sheldon-enrichment-workflow-hotfix-1-9-3.md
briefing_source: workflow-handoff-integrity-1-9-2
---

# Requirements — workflow-hotfix-1-9-3

## Feature summary

Hotfix v1.9.3 que **completa literalmente** a migração SDLC introduzida em `981a8fd` (2026-04-24): propagar contrato canônico (AC-SDLC-15: `@pm` owns `implementation-plan-{slug}.md` em MEDIUM) do workspace para template + atualizar testes + auditar arquivos candidatos do plan + restaurar parity entre `template/.aioson/agents/` e `.aioson/agents/` nos 4 arquivos divergentes onde aplicável.

## New entities and fields

**N/A** — feature é framework infrastructure (file propagation + version bump + tests). Não há entidades de domínio, tabelas, ou modelos de dados envolvidos.

## Changes to existing entities

**N/A** — mesma razão acima.

## Relationships

**N/A** — sem entidades.

## Migration additions

**N/A** — sem banco de dados. As "migrations" desta feature são **migrações de contrato em prompts/manifestos** (não DB migrations); cobertas em RF-01 a RF-03.

## Business rules

### BR-01 — Ownership canônico de `implementation-plan-{slug}.md`

Per `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` (commit `981a8fd`), AC-SDLC-15: **`@pm` é owner canônico** de `implementation-plan-{slug}.md` para features MEDIUM. Após este hotfix, esse contrato fica refletido em TODOS os componentes do framework, não apenas no workspace.

### BR-02 — Direção canônica do sync agent files

`npm run sync:agents` faz `rsync template/ ./` (template → workspace). `template/` é fonte canônica; `.aioson/agents/` em source é working copy derivada. Mudanças em contratos de agentes devem ser refletidas em ambos lados, com `template/` priorizado.

### BR-03 — Audit wiring (brain `sheldon-006`)

Antes de marcar feature `done` em `features.md`, o PR deve incluir checklist literal de cada arquivo listado em `plan-implementation-plan-ownership.md` (Implementation notes). Status por arquivo: `✓ aligned` (não precisou mudança) ou `✗ updated — diff: <descrição>`. Sem checklist = feature não pode ser fechada.

### BR-04 — Decisão de propagação para arquivos secundários

Para `orchestrator.md`, `briefing.md`, `discover.md` (divergências detectadas mas não diretamente cobertas pelo plan `981a8fd`):

1. `git log --oneline -- template/.aioson/agents/<file>` vs `.aioson/agents/<file>`.
2. Se workspace foi tocado por migração documentada (`.aioson/plans/**/plan-*.md`) e template não acompanhou → **propagar** workspace → template no mesmo PR.
3. Se template foi tocado mais recentemente OU sem plan correspondente → **NÃO propagar**, documentar como "drift intencional ou unrelated" no PR.
4. Se inconclusivo → abrir como follow-up em PRD estrutural, NÃO bloquear hotfix.

### BR-05 — Tolerância a flake conhecido em `npm test`

`tests/telemetry-foundation.test.js:38` (AC-ALL-101, perf gate <100ms) tem flake conhecido (observado 585ms em ambiente do dev). Critério durante o hotfix: rodar `npm test` em **3 runs consecutivos**; passa se ≥2/3. Falha em ≥2/3 = investigar (possível regressão). Resto da suite (~2505 testes) deve passar 100%.

## Required functional items (RFs)

### RF-01 — Propagar `pm.md` (workspace → template)

**Action:** sobrescrever `template/.aioson/agents/pm.md` com o conteúdo de `.aioson/agents/pm.md` em sua íntegra (não apenas a seção alterada em line 74).

**Tools:** `cp` ou `Copy-Item` (Windows PowerShell).

**Pre-condition:** `.aioson/agents/pm.md` está em commit-able state (branch limpo ou diff intencional).

**Post-condition:** `diff template/.aioson/agents/pm.md .aioson/agents/pm.md` retorna saída vazia.

### RF-02 — Atualizar tokens em `tests/agent-runtime-alignment.test.js:32-51`

**Action:** Editar o test `pm prompt and manifest align with the living PRD workflow stage` substituindo o array `promptChecks` por:

```js
const promptChecks = [
  '## Workflow position reality',
  'The default feature workflow does **not** route through `@pm`.',
  '## MEDIUM implementation plan (mandatory output for MEDIUM)',
  'For MEDIUM features, `@pm` MUST produce `implementation-plan-{slug}.md`',
  '## Non-MEDIUM handoff reality',
  'aioson gate:approve . --feature={slug} --gate=C'
];
```

**Pre-condition:** RF-01 entregue (template tem o novo contrato).

**Post-condition:** `npx node --test tests/agent-runtime-alignment.test.js` passa todos os 3 testes.

### RF-03 — Adicionar `implementation-plan-{slug}.md` em outputs de `pm.manifest.json`

**Action:** Editar `template/.aioson/agents/manifests/pm.manifest.json`, em `capabilities[0].outputs[]`, adicionar entrada:

```json
{
  "path_pattern": ".aioson/context/implementation-plan-{slug}.md",
  "produced_when": "classification == 'MEDIUM'"
}
```

(Sintaxe exata do JSON deve seguir o padrão dos outputs existentes — `@dev` deve inspecionar antes de editar.)

**Pre-condition:** RF-01 entregue.

**Post-condition:** Test alignment ainda passa (manifest assertions inalteradas para `prd.md` e `prd-{slug}.md`), E novo teste pode ser adicionado: `assert.equal(manifest.capabilities[0].outputs.some((o) => o.path_pattern === '.aioson/context/implementation-plan-{slug}.md'), true);` no mesmo bloco.

### RF-04 — Auditoria operacional dos arquivos candidatos do plan

**Action:** Para cada arquivo listado em `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` § Implementation notes:

1. Ler o arquivo
2. Grep por `implementation-plan` e `@pm`
3. Comparar claims contra BR-01 (AC-SDLC-15)
4. Registrar finding como linha do PR checklist com formato: `- [x] <arquivo>: ✓ aligned` OU `- [x] <arquivo>: ✗ updated — <diff resumido>`
5. Se divergente, editar o arquivo

**Files to audit (mínimo):**
- `.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`
- `src/handoff-contract.js`
- `src/commands/artifact-validate.js`
- `template/.aioson/skills/process/aioson-spec-driven/references/artifact-map.md` (se existir — espelho)

**Post-condition:** PR description contém seção `## Plan candidates checklist` com uma linha por arquivo, status preenchido.

### RF-05 — Decisão e propagação dos 3 arquivos secundários divergentes

**Action:** Para cada um (`orchestrator.md`, `briefing.md`, `discover.md`), executar protocolo de BR-04:

1. `git log --oneline -- template/.aioson/agents/<file>` e `git log --oneline -- .aioson/agents/<file>`
2. Aplicar regra BR-04 (propagar / não propagar / follow-up)
3. Documentar decisão no PR description sob `## Secondary files decisions`

**Post-condition:** PR description contém 3 entradas (uma por arquivo) com decisão e justificativa.

### RF-06 — Verificação de agent files localizados

**Action:**
1. `ls .aioson/locales/*/agents/pm.md 2>&1` ou equivalente — listar se existem versões localizadas.
2. Se sim: para cada locale, verificar se o conteúdo está alinhado com `template/.aioson/agents/pm.md` pós-RF-01. Se localized files são auto-gerados, sync. Se manualmente mantidos, sinalizar como follow-up.
3. Documentar no PR como `## Localized files status` (linha por locale, ou "no localized agent files found").

**Post-condition:** PR description contém status explícito sobre locales.

### RF-07 — PR description com `## Plan candidates checklist` (audit wiring meta-AC)

**Action:** Estruturar a descrição do PR com as seguintes seções obrigatórias:

```markdown
## Summary
<1-2 sentences>

## Plan candidates checklist
(from RF-04)
- [x] .aioson/skills/.../artifact-map.md: ✓ aligned
- [x] src/handoff-contract.js: ✗ updated — added BR-01 enforcement at line N
- [x] src/commands/artifact-validate.js: ✓ aligned
- ...

## Secondary files decisions
(from RF-05)
- orchestrator.md: PROPAGATED (workspace had update from feature-X without template sync; same migration pattern)
- briefing.md: PROPAGATED (same migration pattern as orchestrator)
- discover.md: NOT PROPAGATED (template was updated 2 commits after workspace; unrelated drift) → follow-up issue link

## Localized files status
(from RF-06)
- No localized agent files found
OR
- .aioson/locales/pt-BR/agents/pm.md: ✓ synced

## Test results
- npm test: 2505/2506 passed (telemetry flake AC-ALL-101: 2/3 ✓ runs; tolerated per BR-05)
- alignment test: 3/3 ✓
- manual smoke (aioson setup + chain to /pm in MEDIUM fixture): /pm produces implementation-plan-{slug}.md ✓
- rollback test (npm install @jaimevalasek/aioson@1.9.2 in fixture): deadlock restored ✓ (confirms hotfix is the cause of unblock)
```

**Post-condition:** PR description matches structure above; reviewer can audit completeness in <5 minutes.

### RF-08 — Bump version em `package.json`

**Action:** Editar `package.json` linha 3: `"version": "1.9.2"` → `"version": "1.9.3"`. **NÃO usar `npm version patch`** (cria commit automaticamente; queremos commit manual com mensagem custom).

**Post-condition:** `node -p "require('./package.json').version"` retorna `"1.9.3"`.

### RF-09 — Sync `aioson_version` em `project.context.md`

**Action:** Editar `.aioson/context/project.context.md` frontmatter: `aioson_version: "1.9.2"` → `aioson_version: "1.9.3"`.

**Post-condition:** Frontmatter reflete a nova versão.

### RF-10 — Validação `npm test` com BR-05 aplicada

**Action:**
1. Rodar `npm test` em **3 runs consecutivos**.
2. Coletar resultado de cada run.
3. Para `telemetry-foundation.test.js:38`: aceitar até 1 falha em 3 runs.
4. Para todos os outros tests: 100% pass em todos os 3 runs.

**Post-condition:** Resultado consolidado documentado no PR description (RF-07 § Test results).

### RF-11 — Release notes em `CHANGELOG.md`

**Action:** Adicionar entrada em `CHANGELOG.md` (criar se não existir) seguindo template do PRD:

```markdown
## [1.9.3] - 2026-05-19
### Fixed
- @pm agent prompt in template now correctly declares ownership of implementation-plan-{slug}.md
  for MEDIUM features (AC-SDLC-15), completing the SDLC migration started in v1.9.0 (981a8fd).
  Projects on 1.9.2 hit deadlock at Gate C when running MEDIUM features via standard chain.
- tests/agent-runtime-alignment.test.js updated to assert the new canonical tokens.
- pm.manifest.json outputs[] now declares implementation-plan-{slug}.md as a canonical produce.
- Workspace ↔ template parity restored for divergent agent files where applicable.

### Notes
- Rollback: `npm install @jaimevalasek/aioson@1.9.2` if needed.
- Affected: projects installed from 1.9.0/1/2 running MEDIUM features.
- Audit checklist available in PR description.
```

**Post-condition:** `CHANGELOG.md` contém entrada de v1.9.3.

### RF-12 — Rollback test em fixture

**Action:**
1. Em diretório temporário, executar `npm pack` no source pós-hotfix.
2. Em fixture greenfield: `aioson setup .` + executar cadeia até `/pm` em feature MEDIUM mock → confirmar que `/pm` produz `implementation-plan-{slug}.md`. (Confirma fix.)
3. No mesmo fixture: `npm install @jaimevalasek/aioson@1.9.2 --force` (ou pin via package.json) → confirmar que `/pm` recusa produzir (rollback funciona; bug é restaurado).
4. Documentar resultado em RF-07 § Test results.

**Post-condition:** Tanto fix quanto rollback funcionam em fixture; documentado no PR.

## Acceptance criteria

| ID | Description | Verifies RF |
|----|-------------|-------------|
| AC-01 | `diff template/.aioson/agents/pm.md .aioson/agents/pm.md` returns empty | RF-01 |
| AC-02 | `npx node --test tests/agent-runtime-alignment.test.js` → 3/3 pass | RF-02 |
| AC-03 | `pm.manifest.json` capabilities[0].outputs contains `implementation-plan-{slug}.md` entry | RF-03 |
| AC-04 | PR description has `## Plan candidates checklist` section with all files from plan listed and statused | RF-04, RF-07 |
| AC-05 | PR description has `## Secondary files decisions` section with 3 entries | RF-05, RF-07 |
| AC-06 | PR description has `## Localized files status` section (even if "no localized files") | RF-06, RF-07 |
| AC-07 | PR description has `## Test results` section | RF-07, RF-10, RF-12 |
| AC-08 | `package.json` version = `1.9.3` | RF-08 |
| AC-09 | `project.context.md` aioson_version = `1.9.3` | RF-09 |
| AC-10 | `npm test` 3 runs: ≥2/3 pass overall; AC-ALL-101 perf gate excluded per BR-05 | RF-10 |
| AC-11 | `CHANGELOG.md` contains v1.9.3 entry | RF-11 |
| AC-12 | Fixture rollback test: pre-1.9.3 reproduces deadlock, 1.9.3 fixes it | RF-12 |
| **AC-13 (META)** | **Feature NÃO PODE ser marcada `done` em `features.md` sem o PR description completo conforme AC-04, AC-05, AC-06, AC-07.** Brain `sheldon-006` enforcement. | All RFs |

## Edge cases

- **EC-01:** Algum arquivo do plan candidates já está alinhado com BR-01 (`✓ aligned`). Comportamento esperado: marcar como aligned no checklist (RF-04), não editar, prosseguir.
- **EC-02:** `git log` para um dos 3 arquivos secundários retorna histórico ambíguo (nem claramente "mesma migração" nem claramente "unrelated"). Comportamento esperado: aplicar passo 4 de BR-04 — documentar como follow-up, NÃO bloquear hotfix.
- **EC-03:** Não existem agent files localizados em `.aioson/locales/`. Comportamento esperado: RF-06 documenta "no localized agent files found"; checklist passa.
- **EC-04:** `tests/telemetry-foundation.test.js:38` falha em todos os 3 runs. Comportamento esperado: BR-05 trata como bloqueante; investigar; possível regressão genuína introduzida por outra alteração paralela (improvável dado o escopo cirúrgico, mas possível).
- **EC-05:** `pm.manifest.json` já tem entrada para `implementation-plan-{slug}.md` (RF-03 desnecessária). Comportamento esperado: documentar como `✓ aligned` no checklist e prosseguir sem editar.
- **EC-06:** Algum arquivo candidato do plan (`artifact-map.md`, `handoff-contract.js`, `artifact-validate.js`) não existe no repositório. Comportamento esperado: documentar no checklist como `⚠ file not found — verificar se foi renomeado ou se foi removido em versão posterior`; consultar com user antes de marcar como aligned. Não silenciar.
- **EC-07:** O `package.json` tem comportamento de bloqueio em `npm publish` que requer outras checagens (testes, build, etc.). Comportamento esperado: respeitar pipeline existente; PR deve passar nessas checagens antes do merge.
- **EC-08:** Workspace `.aioson/agents/pm.md` tem alterações não-commitadas no momento da execução de RF-01. Comportamento esperado: ABORTAR — não propagar working tree state como canon. Exigir commit/stash antes.
- **EC-09:** Após RF-11, CHANGELOG.md já existe e tem outras entradas. Comportamento esperado: adicionar a entrada de v1.9.3 no topo, preservar histórico.
- **EC-10:** `aioson-com` (e outros projetos consumidores) não rodam `aioson update` após publish. Comportamento esperado: fora do escopo deste hotfix. Documentar em CHANGELOG.md como passo manual de quem consume.

## Out of scope for this feature

(Reforça e expande o Out of scope do PRD)

- **F2/F3/F1/T5/T6** — todos cobertos em `prd-workflow-handoff-integrity.md` (MEDIUM, depends_on este hotfix).
- **Auditoria de outras migrações em `.aioson/plans/`** ou em `.aioson/context/done/` que possam ter o mesmo padrão de implementação parcial. Capturar como briefing meta separado.
- **Smoke test ponta-a-ponta em CI** antes de `npm publish`. Coberto em T6 do PRD estrutural.
- **CI guard para drift semântico em agent files** (extensão de `sync-agents-preflight.js`). Coberto em T5 do PRD estrutural.
- **Refactor de outros prompts** que ainda referenciem o contrato antigo (mesmo que indiretamente). Listar como follow-up no PR; não corrigir nesta versão.
- **Stale `dev-state.md` cleanup interativo** (F1). Coberto no PRD estrutural.
- **Modificação de `npm run sync:agents` direção** ou comportamento. Mantém comportamento atual (`template/ → workspace`).
- **Tradução dos prompts** para outros idiomas além dos `.aioson/locales/` já existentes. Localization é fora do escopo deste hotfix.
- **Documentação adicional além do CHANGELOG.md.** Briefing + PRD + sheldon-enrichment + este requirements + spec já são documentação suficiente.

## Sequenciamento recomendado para `@dev`

Implementar na ordem:

1. **RF-01** — propagar pm.md (verificar EC-08 antes).
2. **RF-03** — atualizar manifest pm.json (mais simples, mecânico).
3. **RF-02** — atualizar test alignment (depende de RF-01 + RF-03 estarem em template).
4. **RF-10 baseline** — rodar `npm test` 3x antes de tocar mais nada; confirma se flake AC-ALL-101 já existe no estado atual (sanity check para BR-05).
5. **RF-04** — auditoria operacional dos 4 (ou 5) arquivos candidatos do plan.
6. **RF-05** — decisão sobre os 3 arquivos secundários (cada decisão pode levar a propagar mais arquivos).
7. **RF-06** — verificar locales.
8. **RF-08** — bump version.
9. **RF-09** — sync version em project.context.md.
10. **RF-10 final** — rodar `npm test` 3x novamente, confirma que tudo passa pós-hotfix.
11. **RF-11** — escrever CHANGELOG.md.
12. **RF-07** — preencher PR description estruturado.
13. **RF-12** — rollback test em fixture (pode rodar em paralelo aos outros se houver máquina disponível).

## Notes for `@dev`

- **Lição-meta sheldon-006 é aplicada por AC-13.** Você não pode marcar a feature `done` sem completar o PR description com todas as seções. Isto é INTENCIONAL — torna o próprio hotfix imune ao bug que ele corrige.
- O **template** é canônico. Quando em dúvida sobre qual versão prevalece, prevalece `template/`. Edições em `.aioson/agents/` no source são working drafts.
- `npm run sync:agents` faz `template/ → ./` (template é fonte). Não rodar sem entender o impacto — pode sobrescrever working drafts de outras features paralelas.
- Para a auditoria do RF-04, lembrar que `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` é ground truth — não inventar critérios.

## Notes for `@qa`

- Smoke test manual obrigatório (fixture greenfield) — não bastam só testes unit.
- Rollback test também manual (confirma que 1.9.2 ainda reproduz o bug — sanity).
- Comparar `npm test` baseline (pre-hotfix) com final (post-hotfix) para confirmar zero regressões além do AC-ALL-101 flake conhecido.
- AC-13 é o "kill switch" de QA — recusar approval do PR se checklist no description está incompleto.
