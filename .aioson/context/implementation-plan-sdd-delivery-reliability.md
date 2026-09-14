---
feature: sdd-delivery-reliability
status: approved
implementation_status: completed
completed_at: 2026-09-09
source_review: .aioson/context/quality-review-project.md
authorization: user-approved-analysis-and-implementation
execution: single
prototype: null
prototype_status: none
prototype_feature: null
---

# Implementation Plan — SDD delivery reliability

## Objective

Tornar planos verificáveis e permitir concluir entregas com pendências pequenas rastreadas, preservando gates relevantes e contratos legados. Escopo aprovado pelo usuário nesta sessão: recomendações F1–F6 e complemento de fechamento do diagnóstico. Esta manutenção não reutiliza nem encerra `execution-roles-onboarding`.

## Repository evidence

- Entrada real: `node bin/aioson.js`; comandos em `src/commands/` registrados em `src/cli.js`.
- Verificação: `node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=4 <tests>`.
- Reuso: `src/preflight-engine.js`, `src/lib/feature-completeness-format.js`, `src/lib/gate-checkpoint.js`, `src/workflow-gates.js`, `src/commands/feature-archive.js` e parsers/estado de planos existentes.
- UI/protótipo: nenhum; ferramentas CLI e instruções distribuídas.

## Engineering Controls

| Concern | Evidence / trigger | Planned control | Verification | Recovery |
|---|---|---|---|---|
| compatibility | Planos legados e consumidores aceitam PASS/FAIL e arquivos existentes | Nova validação por versão, política de fechamento opt-in, preservação das APIs | Fixtures legadas e suíte existente | Desabilitar política; planos legados continuam legíveis |
| state integrity | Close atualiza índice, pulse, workflow e archive | Persistir followups antes de fechar; registro idempotente; isolamento por slug | Falhas de escrita e repetição após archive | Retomar fechamento parcial sem duplicar planos |
| authorization | Aceitação com pendências não é PASS de todos os ACs | Decisão QA estruturada, impacto limitado e hashes; sem bypass de riscos materiais | Casos negativos e evidência stale | Política desativada ou decisão invalidada bloqueia |
| paths | Escrita a partir de JSON e hashes de arquivos citados | Caminhos confinados ao projeto e verificação de symlinks | Traversal e link externo | Não persistir nem fechar na falha |

## Phase 1 — Planos mostram fases e detectam mudanças na origem

- Corrigir parsing LF/CRLF, headings canônicos/legados e ignorar fences/notas.
- Vincular plano ao conteúdo do PRD com comando explícito; frescor desconhecido quando falta baseline.
- Arquivos: `src/lib/plan-document.js`, `src/commands/implementation-plan.js`, `tests/plan-document.test.js`, `tests/implementation-plan.test.js`.
- Done when: formato canônico conta corretamente e PRD alterado invalida binding sem confundir outra feature.

## Phase 2 — Plano fecha AC, fase e comando de verificação

- Adicionar contrato v2 com parser compartilhado; legado recebe diagnóstico sem invalidação retroativa.
- Usar ACs canônicos do PRD em spec:analyze; validar fase, referências, cobertura e comandos conhecidos sem executar instruções de documentos.
- Arquivos: `src/lib/plan-contract.js`, `src/lib/feature-completeness.js`, `src/commands/spec-analyze.js`, `tests/plan-contract.test.js`, `tests/spec-analyze.test.js`.
- Done when: mutações reproduzidas no diagnóstico são rejeitadas em planos v2, e casos válidos/legados continuam funcionando.

## Phase 3 — Gate C permite a tarefa de runtime que Dev executará

- No planejamento, validar obrigação explícita e verificável de criar RG-build/migrate/boot/smoke; após implementação, continuar exigindo contrato real.
- Corrigir craft, regra de spec legado e referências de harness; manter paridade das cópias locais.
- Arquivos: `src/harness/contract-integrity-gate.js`, `src/commands/gate-check.js`, `tests/harness-contract-integrity.test.js`, `template/.aioson/agents/planner.md`, `template/.aioson/docs/briefing/briefing-craft.md`, `template/.aioson/rules/spec-level-ownership.md`, `template/.aioson/skills/process/aioson-spec-driven/SKILL.md`, `template/.aioson/skills/process/aioson-spec-driven/references/planner.md` e suas cópias locais.
- Done when: C aceita obrigação válida; Dev/QA/close bloqueiam contrato runtime ausente ou inválido.

## Phase 4 — Conclusão com pendências deixa correção rastreável

- Política persistida e explícita; diagnóstico/status/listagem via CLI; resultado `accepted_with_followups` separado de PASS.
- Decisão QA ligada à evidência e entrega, pendências reproduzíveis de baixo impacto, planos persistidos antes do fechamento.
- Compartilhar elegibilidade entre completude, gate, handoff, workflow e close; autoclose somente quando autorizado pela política; archive não publica.
- Arquivos: `src/lib/delivery-followups.js`, `src/commands/feature-closure.js`, `src/commands/feature-close.js`, `src/commands/gate-approve.js`, `src/commands/workflow-next.js`, `src/handoff-contract.js`, `src/lib/ac-test-audit.js`, `src/cli.js`, `src/parser.js`, `src/commands/workflow-status.js`, `tests/delivery-followups.test.js`, `tests/feature-closure.test.js`, `tests/feature-close.test.js`, `tests/gate-check.test.js`, `tests/workflow-next.test.js`.
- Documentar uso e limitação em `docs/sdd-delivery-reliability.md`, nos kernels QA/Dev, gateway workflow-runtime e skill/reference QA, com cópias locais sincronizadas.
- Done when: baixo impacto elegível conclui com planos acessíveis; risco material/unknown/stale bloqueia; falha de escrita é recuperável; feature alheia permanece intacta.

## Phase 5 — Avaliações documentais e validação final

- Criar corpus pequeno com cenários de preservação de promessas, critérios omitidos, decisão não aprovada e contrato legado; oráculos independentes para defeitos mecânicos e roteiro explícito para avaliação de modelo, sem auto-score.
- Arquivos: `tests/fixtures/sdd-delivery/`, `tests/sdd-delivery-evals.test.js`, documentação de uso; reforços pontuais de exemplos/contraexemplos nas lentes Product/Sheldon e módulos existentes, sem ampliar etapas.
- Executar verificações focadas, corpus `context-evals-shipped`, sintaxe/lint e suíte completa quando alterações integradas estiverem estáveis.
- Done when: regressões novas passam e falhas restantes são discriminadas de alterações anteriores; registrar evidência e limites no relatório final.

## Progress

- Fases 1–4 implementadas: parser compartilhado; prioridade do plano canônico; binding SHA-256 via `plan:bind`; fases registradas com checkpoints preservados; contrato v2 de AC/fase/comando; obrigação de harness no planejamento; fechamento autorizado com pendências persistidas atomicamente antes do archive.
- Fase 5 concluída e validada: oito casos mecânicos SDD, duas avaliações de roteamento, protocolo de revisão semântica independente e coletor de hashes para artefatos reais.
- Consumidores adicionais necessários: `src/preflight-engine.js` preserva a distinção do resultado; `src/lib/delivery-lifecycle.js` integra fechamento/status; `src/handoff-contract.js` compartilha os bloqueios de segurança sem perder avisos. `plan:bind` e `feature:closure` possuem aliases e saída JSON pelo CLI.
- A documentação nova distribuída fica em `template/.aioson/docs/delivery-followups.md`; kernels QA/Dev/Planner e gateways foram mantidos dentro dos limites de tamanho existentes. Não houve aumento de limites de testes.
- Testes adicionados/ampliados também em `tests/feature-closure.test.js`, `tests/gate-check.test.js`, `tests/plan-document.test.js`, `tests/delivery-followups.test.js`, `tests/autopilot-post-dev.test.js`, `tests/gateway-kernels.test.js`; coletor em `scripts/testing/sdd-delivery-evals.js`.
- Verificações reproduziram e corrigiram problemas de registro CLI, paridade/limite de kernels, visibilidade de docs e preservação de avisos do Pentester. Evidência: `.aioson/runtime/quality/sdd-cycle-2026-09-08/`.
- As listas de arquivos delimitam responsabilidade por fase; ajustes descobertos em consumidores do mesmo contrato serão registrados aqui.
- Commit, publicação e fechamento em massa de features antigas não fazem parte desta entrega.

- Validação final: suíte completa com 5.042 passes, zero falhas e um skip; mais 29 testes focados passaram após o reforço de integridade binária. Sintaxe e lint aprovados. Política local ativada por autorização do usuário. Relatório: [implementation-verification-sdd-delivery-reliability.md](implementation-verification-sdd-delivery-reliability.md).
