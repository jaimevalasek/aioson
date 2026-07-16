---
slug: review-intelligence
status: approved
created_at: 2026-07-15
owner: product
---

# Scope Expansion - Review Intelligence

## Inputs
- PRD/briefing source: conversa aprovada pelo usuário + `researchs/mattpocock-grill-me-with-docs-2026/summary.md`.
- Prior expansion artifacts: `.aioson/context/prompt-sharpener-adoption-plan.md`.
- User approval mode: recommended.

## Scope Buckets
| Bucket | Items | Why | Approval needed |
|---|---|---|---|
| Core | Skill compartilhada; perfis por fase; evidência antes de perguntas; challenge loop limitado; hooks em briefing, briefing-refiner, product, sheldon, analyst, architect, scope-check e qa | Muda comportamento sem duplicar prompt ou criar outro motor | no |
| Recommended MVP | CLI aditiva `review:prepare`, `review:check` e `review:status`; pacote/relatório JSON com hash; assurance summary no QA; eixos independentes; cenários e testes de contrato/paridade/regressão | Automatiza o trabalho mecânico e torna a promessa observável sem alterar comandos existentes | no — aprovado/corrigido na conversa |
| Optional V1 | Integração automática do resultado aos done-gates do workflow | Deve esperar dados reais para não introduzir bloqueios regressivos | yes |
| Delight | Telemetria de gaps encontrados cedo versus tarde | Boa para evolução, não necessária para o comportamento inicial | yes |
| V2 / Later | Jury multi-modelo, reviewer externo automático, aprendizado adaptativo por traces | Aumenta custo, risco e complexidade operacional | yes, future |
| Cut List | Novo agente, novo gate, web search obrigatória, chain-of-thought exposta, nota única de confiança, reescrita total dos prompts | Duplicaria contratos ou criaria confiança falsa | no |

## Operational Surface Map
| Object | Parent / owner | Lifecycle states | Required actions | Management surface | Empty / error states | PRD destination |
|---|---|---|---|---|---|---|
| Review profile | `review-intelligence` / agente ativo | available, loaded, skipped | select role lens, apply, stop/route | `SKILL.md` + `references/*.md` | skill absent → seguir contrato existente sem inventar; perfil incompatível → não carregar | MVP scope / User flows |
| Review packet | feature + agente + artefato | prepared, stale, checked | prepare evidence paths/lenses, hash artifact, validate report, aggregate status | `review:prepare|check|status` + `.aioson/context/features/{slug}/reviews/` | artefato alterado → stale/reprepare; CLI indisponível → fallback manual | MVP scope / User flows |
| Challenge finding | review report / agente autor | open, resolved, decision-required, deferred | identify, ground, recommend, resolve, route | JSON validado pelo CLI + artefato/dossier/handoff quando durável | sem evidência → unknown; decisão de owner → bloquear handoff | MVP scope / User flows |
| Assurance axis | QA report / `@qa` | pass, fail, unverified, not-applicable | evaluate, cite evidence, expose residual risk | `review:status` + `qa-report-{slug}.md` | evidência ausente → unverified, nunca pass | MVP scope / User flows |

## Core Capability Closure
- Complete: perfis, estados, owners, evidência, rota de decisão, limite de iteração, automação CLI aditiva e resumo de assurance estão definidos.
- Missing / needs decision: none.
- Explicitly deferred: gate automático obrigatório, jury multi-modelo, telemetria nova e autoaprendizado.

## Recommended Product Shape
- Include in PRD: skill central + referências de fase; CLI prepare/check/status com JSON versionado e hash; hooks estreitos; assurance separado por eixos; testes de contrato, cenários, JSON, help/i18n, paridade e regressão.
- Keep as optional: done-gate obrigatório e reviewer externo.
- Explicitly defer: qualquer motor novo, score agregado ou autoedição de prompts.

## Risks And Classification
- Scope risk: reescrever prompts demais e enfraquecer contratos existentes; mitigado por hooks pequenos e skill compartilhada.
- Delivery risk: self-review do mesmo modelo herdar o viés do autor ou uma CLI nova alterar rotas existentes; mitigado por distinguir `self-reviewed`, manter comandos aditivos e não conectar bloqueios aos done-gates no MVP.
- Classification impact: MEDIUM — o classificador retornou score 4 pela superfície transversal (múltiplos perfis de agente + CLI/workspace) e complexidade do contrato, mesmo sem integração externa ou dados sensíveis reais. Os sinais heurísticos de `authz`/protótipo vêm de termos de ownership/workspace do próprio PRD; não representam autenticação nem UI e, portanto, não exigem protótipo visual.

## Cheap / Native Implementation Ideas
- Reutilizar `context:select`, research cache, dossiers, handoffs, QA reports e gates A/B/D.
- Reutilizar padrões de `verify:implementation` e `spec:analyze` para contenção de paths, JSON, staleness e códigos de saída, sem alterar esses comandos.
- Distribuir a skill via `MANAGED_FILES` e manter paridade `template/` ↔ workspace.
- Testar comportamento durável por contratos textuais e cenários com gaps semeados, sem prender wording exato.
