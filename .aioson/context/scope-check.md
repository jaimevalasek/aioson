---
feature: loop-guardrails
mode: post-fix
status: approved
checked_at: 2026-06-10
next_agent: committer
optional: true
---

# Scope Check — Loop Guardrails (post-fix)

## Verdict

As correções C-01..C-03 do ciclo QA preservam o contrato de produto — em dois dos três casos elas **restauram** intenção do PRD que a entrega original violava, e no terceiro alinham a camada de commit ao texto literal do REQ-20. Nenhum must-have foi enfraquecido: os defaults proibidos não-removíveis (REQ-4) continuam integrais dentro do loop, o deny-vence-allow (REQ-5) está intacto, e a precedência de presets (REQ-19, "valor explícito vence preset") já era implementada por `resolveContract` e agora efetivamente chega ao circuit-breaker. Veredito: **approved** — o fix não mudou a intenção do produto.

## Intent / Plan / Delivery

| Claim | Source | Matched by | Verdict | Notes |
|-------|--------|------------|---------|-------|
| Happy path `self:loop . --agent=dev --task=... --max-iterations=3` roda COM guards ativos | PRD "Como funciona" (l.61) + métrica "Contenção de escopo 100%" (l.74) | C-01: auto-descoberta via `src/harness/active-contract.js` em `self-implement-loop.js`; teste QA-H-01 verde | ✅ restaura intent | Entrega original só ativava guards com `--spec`/`--contract` — era drift silencioso vs PRD |
| Guard nunca silenciosamente desligado | REQ-1 (rationale) | C-01: log explícito "guardrails inactive — no harness contract loaded" quando não há contrato | ✅ aligned | Visibilidade aditiva, sem mudança de comportamento para quem não usa harness |
| Presets `safe`/`builder`/`autopilot` são presets do governor (iterações, orçamento, gates); explícito vence preset | PRD should-have (l.43) + REQ-19 | C-02: `resolved.governor` injetado no breaker e `maxIterations` derivado dele; teste QA-C-02 (safe + erros pré-semeados → BLOCKED sem chamar agente) | ✅ restaura intent | Antes, `error_streak_limit` de preset nunca era aplicado e `max_steps` de preset era ignorado |
| Pre-commit checa `forbidden_files` **do contrato ativo** | PRD should-have (l.46) + REQ-20 | C-03: `applyActiveContractPolicy` aplica só globs DECLARADOS; teste QA-C-03 (lockfile humano commitável) | ✅ aligned | Texto do REQ-20 fala dos globs do contrato; defaults são contrato do LOOP (REQ-4, "após cada tentativa do self:loop") |
| Defaults proibidos não-removíveis dentro do loop | REQ-4 | `resolveContract` segue mesclando `DEFAULT_FORBIDDEN_GLOBS` no scope guard do loop; suíte de scope-guard verde | ✅ intacto | C-03 não tocou a camada do loop |
| Segredos protegidos na camada de commit | PRD must-have 1 (espírito) | Policy baseline própria do `git:guard` cobre `.env*`/`*.pem`/`*.key`/`secrets/**` independente de contrato | ✅ sem regressão | Era a condição do QA para aceitar "declared-only" no layer-2 |
| Correção é estreita (sem retrabalho de escopo) | Plano corrections-2026-06-09.md | Diff do fix: 1 helper novo + 2 comandos ajustados + 2 testes novos; nenhuma mudança em schema, gates, orçamento, criteria | ✅ aligned | Suíte completa 3105 testes / 3102 pass (2 CRLF pré-existentes, verdes em CI) / 1 skipped |

## Divergences

- Nenhuma divergência de contrato. Decisão de design registrada (não é drift): com C-02, `governor.max_steps` do contrato/preset agora **prevalece sobre a flag `--max-iterations`** (flag vira fallback quando o contrato não define teto). REQ-19 não especifica precedência CLI vs contrato, mas a premissa do PRD é "loop controlado por contrato verificável" — contrato-vence preserva a intenção e é logado explicitamente ("Max iterations set by contract: N"). Documentado no spec ("Decisões do ciclo de correções QA").

## Corrections Applied

- Nenhuma. (Artefatos de planejamento já consistentes; trilha dev-state/features.md atualizada pelo @qa.)

## Revision Requests

- Nenhuma.

## Implementation Preview or Delivery Diff

| File or area | Expected or actual change | Reason | User-visible result | Confidence |
|--------------|---------------------------|--------|---------------------|------------|
| `src/harness/active-contract.js` (novo) | `findActiveContract` extraído do git-guard para helper compartilhado | C-01 (evitar duplicação da heurística) | — | alta |
| `src/commands/self-implement-loop.js` | Auto-descoberta de contrato sem flags + log "guardrails inactive" + governor efetivo no breaker/teto | C-01 + C-02 | Guards ativos no happy path do PRD; presets funcionam como anunciado | alta |
| `src/commands/git-guard.js` | Layer-2 aplica só `forbidden_files` declarados | C-03 | Humano volta a poder commitar lockfile com hook instalado | alta |
| `tests/self-loop-guardrails.test.js`, `tests/*` | QA-H-01 verde + QA-C-02/QA-C-03 novos | Critérios binários das correções | — | alta |

## User Confirmation

Continuar significa aceitar a feature `loop-guardrails` como entregue e fechada: as três correções do QA restauraram/alinharam o comportamento ao PRD sem alterar o contrato de produto, o Gate D foi aprovado e os residuais Low (O-01..O-04, incl. i18n dos comandos novos) ficam como follow-ups documentados no QA Sign-off do spec. Todo o trabalho está apenas no working tree — nada foi commitado ainda.

## Next Step

Next agent: @committer
Why: feature fechada (QA PASS + post-fix approved) com working tree extenso não-commitado — falta materializar a entrega em commit(s). Decisão final de roteamento é do motor (`workflow:next --complete=scope-check`).
Optional handoff: none
