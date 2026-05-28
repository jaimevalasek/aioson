---
feature: gemini-phaseout
classification: SMALL
status: in_progress
gate: A
analyst_date: 2026-05-28
deadline_hard: 2026-06-18
ship_gate_phase1: 2026-06-10
source_prd: prd-gemini-phaseout.md
briefing_source: cross-tool-project-knowledge
---

# Requirements — Gemini CLI Phase-out

## 1. Feature summary

Descontinuação faseada do suporte first-class ao Gemini CLI no AIOSON, antes que o cutoff do tier free/personal do Google (2026-06-18) transforme falhas silenciosas dos free users em fricção atribuída ao framework. Enterprise users (Code Assist Standard/Enterprise) protegidos durante toda a transição.

## 2. Re-anchoring de versões (correção @analyst — bloqueador resolvido)

O PRD ancorou as fases em v1.17/v1.18/v1.20. **Essas versões já foram consumidas** — `package.json` está em **1.20.0** (entregues por outras features: agent-orchestration-v2 = 1.18.0, depois bumps 1.19.0 e 1.20.0). As **datas** continuam sendo a restrição vinculante; as versões seguem a sequência do próximo minor.

| Fase | Âncora original (obsoleta) | **Âncora corrigida** | Date gate (vinculante) | Status de implementação |
|------|----------------------------|----------------------|------------------------|--------------------------|
| **1 — warnings** | v1.17 | **v1.21.0** | publicar **≤ 2026-06-10** | **Implementar AGORA** |
| **2 — hard removal** | v1.18 | **v1.22.0** (primeiro minor ≥ 2026-06-19) | publicar **≥ 2026-06-19** | Futuro — date-gated, NÃO antecipar |
| **3 — sunset** | v1.20 | **TBD (~1.3x.0)** | ~Q4-2026 (release manager decide) | Futuro |

Regra de versão: warning é mudança de comportamento aditiva → minor bump (1.21.0). Alternativa patch (1.20.1) é aceitável mas não recomendada.

## 3. Escopo desta sessão de @dev

`@dev` implementa **somente a Fase 1 (v1.21.0 — warnings)**. Fases 2 e 3 ficam documentadas aqui mas são date-gated:
- Fase 2 **não pode** shippar antes de 2026-06-19 (hard removal antecipado quebra users prematuramente — BR-GP-05).
- A feature permanece `in_progress` em `features.md` atravessando múltiplos releases. **Não fechar** após Fase 1.

## 4. Superfície afetada — Fase 1 (v1.21.0)

Não há entidades de banco. As "entidades" desta feature são superfícies de código + o catálogo de mensagens. Localizações verificadas contra o código atual (2026-05-28):

| ID | Superfície | Arquivo:linha | Mudança Fase 1 |
|----|------------|---------------|----------------|
| M1a | install-wizard — tool list | `src/install-wizard.js:9` (array `TOOLS`, entry `gemini`) + `:165` (`TOOL_NAMES`) | Prefixar `label` com `[DEPRECATED] Gemini CLI — free tier ends 2026-06-18`. Não bloqueia seleção. Mensagem verbose pós-seleção (ver §6 catálogo). |
| M1b | doctor — novo check | `src/doctor.js` | Novo check `id: 'harness:gemini_deprecation'`, i18n `key: 'doctor.gemini_deprecation'`, `severity: 'warning'`. Emite **somente** se `.gemini/permissions.toml` OU `.gemini/GEMINI.md` existir no projeto. |
| M1c | permissions-generator | `src/permissions-generator.js:266` (`gemini: '.gemini/permissions.toml'`), `:361` (`else if (name === 'gemini')`) | Continua gerando `.gemini/permissions.toml` (enterprise). Prepend comentário de header de warning (3 linhas, ver §6). |
| M2 | operator-memory matriz V1 | `src/lib/tool-capabilities.js` (entry `gemini`, declaração `compatible_via`) | Atualizar string `gemini-cli` para `gemini-cli (deprecated until 2026-06-18, removed in v1.22)`. Só semantics; não muda comportamento. |
| M3 | CHANGELOG | `CHANGELOG.md` | Novo bloco `## [1.21.0] - 2026-06-XX` (ver §6 conteúdo). **Não** retro-preencher 1.19/1.20 ausentes (housekeeping separado). |
| M1-i18n | catálogo de strings | `src/i18n/messages/{en,pt-BR,es,fr}.js` | Adicionar as novas keys (`doctor.gemini_deprecation`, mensagens do wizard) nos **4 locales** (Q-GP-02 resolvido). |

### Naming do doctor check (Q-GP-03 — resolvido contra o código real)
O código usa padrão de dois campos: `id` colon-namespaced (ex.: `living-memory:rule_staleness`) + i18n `key` dot-namespaced (ex.: `doctor.required_file`, `doctor.living_memory.rule_staleness`).
- Fase 1: `id: 'harness:gemini_deprecation'` + `key: 'doctor.gemini_deprecation'`
- Fase 2: `id: 'harness:gemini_legacy_detected'` + `key: 'doctor.gemini_legacy_detected'` (severity `info`)

## 5. Superfície afetada — Fases futuras (documentação, NÃO implementar agora)

### Fase 2 — v1.22.0 (hard removal, ≥ 2026-06-19)
- Remover `template/.gemini/GEMINI.md` do ship.
- Remover Gemini de `src/install-wizard.js` (array `TOOLS`); `--tool=gemini` retorna erro non-zero com texto específico. Sem fallback automático.
- `src/permissions-generator.js` **não** emite mais `.gemini/permissions.toml` em novos setups. **Preserva** pré-existente intocado (BR-GP-01).
- doctor: muda de `harness:gemini_deprecation` (warning) → `harness:gemini_legacy_detected` (info).
- Remover Gemini de `template/aioson-models.json`.
- Remover Gemini do setup interactive flow.
- Meta: reduzir `grep -ril gemini src/ template/` de 46 → **≤10**.

### Fase 3 — sunset (~Q4-2026)
- doctor para de reconhecer `.gemini/` (sem check, sem mention).
- Stale cleanup: `src/constants.js`, `src/i18n/messages/*.js`, `template/.aioson/agents/manifests/*.json`, `src/agents.js` e demais dos 46 arquivos.
- `.gemini/permissions.toml` pré-existente continua INTOCADO (BR-GP-01).
- Meta: 46 → **≤5** (apenas CHANGELOG/docs históricas/comments de legacy preservation).

## 6. Catálogo de mensagens — Fase 1 (texto canônico EN; @dev traduz pt-BR/es/fr)

**Wizard — label (M1a):** `[DEPRECATED] Gemini CLI — free tier ends 2026-06-18`

**Wizard — pós-seleção verbose (M1a):**
> Gemini CLI free/personal tier will be discontinued on 2026-06-18. Consider Codex or OpenCode for new projects. Enterprise (Code Assist Standard/Enterprise) continues to work.

**doctor — `doctor.gemini_deprecation` (M1b):**
> Project uses Gemini CLI. Free tier discontinued 2026-06-18. Enterprise users unaffected. Run 'aioson permissions-generator --tool=codex' to migrate.

**permissions-generator — header em `.gemini/permissions.toml` (M1c):**
```toml
# WARNING: Gemini CLI free tier ends 2026-06-18. This file remains
# functional for enterprise users (Code Assist Standard/Enterprise).
# See AIOSON CHANGELOG v1.21.x for migration guidance.
```

**CHANGELOG `## [1.21.0]` (M3):**
```markdown
## Gemini CLI Deprecation Warning

Google announced (2026-05-20) that Gemini CLI free/personal tier ends 2026-06-18.

- install-wizard now warns when Gemini is selected.
- doctor reports `harness:gemini_deprecation` when .gemini/ is detected.
- permissions-generator continues to emit .gemini/permissions.toml with a header warning.
- Enterprise users (Code Assist Standard/Enterprise) are unaffected.
- Hard removal scheduled for v1.22 (post 2026-06-18). Pre-existing .gemini/permissions.toml will be preserved.
- Recommended migration: --tool=codex or --tool=opencode.
```

## 7. Business rules

- **BR-GP-01** — Nunca apagar nem modificar `.gemini/permissions.toml` pré-existente (proteção enterprise). Vale em TODAS as fases. Verificável: mtime byte-identical antes/depois de `setup` re-run.
- **BR-GP-02** — Não detectar tier (free vs enterprise). Warning aplica-se a todos; a mensagem declara explicitamente que enterprise não é afetado.
- **BR-GP-03** — Checks gemini do doctor emitem **somente** quando `.gemini/permissions.toml` OU `.gemini/GEMINI.md` existem no projeto. Zero false positives em greenfield.
- **BR-GP-04** — Fase 1 é warning-only: não bloqueia seleção, não remove nada, não quebra enterprise.
- **BR-GP-05** — Fase 2 (hard removal) NÃO pode shippar antes de 2026-06-19 (date floor).
- **BR-GP-06** — Fase 1 deve shippar antes de 2026-06-10 (ship gate, cushion ≥ 8 dias antes do cutoff 2026-06-18).
- **BR-GP-07** — Não recomendar Antigravity CLI em nenhum texto de warning sem research separada (S3).
- **BR-GP-08** — Não adicionar a diretiva universal do `prd-cross-tool-project-knowledge.md` em `template/.gemini/GEMINI.md` (coupling Q-CTPK-08 / Q-GP-05).
- **BR-GP-09** — Textos de warning produzidos nos 4 locales (en, pt-BR, es, fr) — Q-GP-02 resolvido.

## 8. Edge cases

- **EC-GP-01** — Greenfield sem `.gemini/` → doctor emite zero output. Test fixture: 2 tmpdirs (com vs sem `.gemini/`).
- **EC-GP-02** — Enterprise com `.gemini/permissions.toml`: Fase 1 warning diz "enterprise unaffected"; Fase 2 `setup` re-run deixa o arquivo byte-identical (mtime match exato).
- **EC-GP-03** — Free user pula v1.21→v1.22 após 2026-06-19 sem migrar: `--tool=gemini` erro non-zero; doctor `harness:gemini_legacy_detected` (info) com instrução de migração no texto.
- **EC-GP-04** — `.gemini/GEMINI.md` presente mas sem `permissions.toml` (ou vice-versa) → check dispara em QUALQUER um dos dois (condição OR).
- **EC-GP-05** — User em v1.15/v1.16 que nunca atualiza vê o cutoff sem aviso (aceito — sem backport, out of scope).
- **EC-GP-06** — CHANGELOG já está sem entries 1.19/1.20; a entry da Fase 1 vai sob `## [1.21.0]` novo. Não retro-preencher (housekeeping separado, ver Riscos).

## 9. Migration order — implementação Fase 1 (ordenada)

1. Adicionar keys i18n nos 4 locales (`src/i18n/messages/{en,pt-BR,es,fr}.js`) — base de todas as mensagens.
2. install-wizard: prefixo no `label` + mensagem pós-seleção (`src/install-wizard.js`).
3. doctor: novo check com guard de detecção `.gemini/` (`src/doctor.js`).
4. permissions-generator: header comment ao emitir `.gemini/permissions.toml` (`src/permissions-generator.js`).
5. operator-memory matriz: update da string gemini-cli (`src/lib/tool-capabilities.js`).
6. CHANGELOG: bloco `## [1.21.0]`.
7. Testes: fixture doctor zero-false-positive (2 tmpdirs), snapshot do wizard, presença do header no permissions.toml.
8. Version bump `1.20.0` → `1.21.0`; publicar ≤ 2026-06-10 (`npm publish` manual).

## 10. Relationships (cross-feature)

- **operator-memory (DONE v1.16.0)** — M2 edita a matriz V1 em `src/lib/tool-capabilities.js`. Edição só de string; não muda comportamento da feature.
- **prd-cross-tool-project-knowledge.md** — coupling em BR-GP-08: a diretiva universal daquele PRD não entra em `template/.gemini/GEMINI.md`.

## 11. Riscos

- **R1 — Janela apertada:** 13 dias até o ship gate (2026-06-10). Viável para warning-only, mas sem folga para scope-creep. Manter Fase 1 enxuta.
- **R2 — CHANGELOG drift:** faltam entries 1.19.0/1.20.0 (CHANGELOG pula de Unreleased → 1.18.0 enquanto package.json=1.20.0). Pode confundir automação version-anchored. Housekeeping separado — não expandir escopo desta feature, mas sinalizar ao release manager.
- **R3 — Workflow state desalinhado:** o state machine (`workflow:next`) está carregado para `cross-tool-project-knowledge`, não para `gemini-phaseout`. Gate/pulse desta sessão usam `--feature=gemini-phaseout` explícito; as duas features avançam em trilhas separadas.
- **R4 — Fechamento prematuro:** após Fase 1, `features.md` deve permanecer `in_progress` (Fases 2/3 date-gated). Risco de `feature:sweep`/close acidental.

## 12. Out of scope

- Antigravity CLI como tool first-class em v1.21/v1.22 (research S3 separada).
- Auto-conversão `.gemini/permissions.toml` → `.codex/` sem opt-in.
- Detecção de tier (free vs enterprise).
- Notificação proativa (email/push).
- Backport para v1.16.x.
- `learning:import-from-gemini`.
- **S2 — `aioson harness:migrate --from=gemini`** (Q-GP-04): **deferido para fora da Fase 1.** Revisitar em Fase 2 (v1.22). Não bloquear o release tático de warning.

## 13. Open questions — status

| Q | Decisão @analyst |
|---|------------------|
| Q-GP-01 (datas/versões) | **Resolvido:** Fase 1 = v1.21.0 (≤2026-06-10); Fase 2 = v1.22.0 (≥2026-06-19); Fase 3 = TBD ~Q4-2026 (release manager). |
| Q-GP-02 (i18n) | **Resolvido:** 4 locales na Fase 1 (infra `src/i18n/messages/*.js` existe). |
| Q-GP-03 (naming do check) | **Resolvido contra código:** `id: harness:gemini_deprecation` + `key: doctor.gemini_deprecation` (padrão de dois campos confirmado em doctor.js). |
| Q-GP-04 (S2 migrate timing) | **Resolvido:** deferido para Fase 2+. Fora da Fase 1. |
| Q-GP-05 (coupling cross-tool) | **Resolvido:** BR-GP-08 (nada em template/.gemini/GEMINI.md). |
| Q-GP-06 (jump v1.21→v1.22) | **Resolvido:** EC-GP-03 — doctor info + texto de migração claro. |
