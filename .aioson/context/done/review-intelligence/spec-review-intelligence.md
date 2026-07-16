---
slug: review-intelligence
classification: MEDIUM
status: approved
spec_version: 2
version: 2
gate_requirements: approved
gate_design: approved
gate_plan: approved
gate_execution: approved
last_checkpoint: "Gate D approved by independent QA: 24/24 ACs covered, security audit clean, harness 10/10 and full regression green; feature:close remains a human gate"
---

# Spec — Review Intelligence

## Objetivo

Fazer os agentes AIOSON pressionarem suas propostas contra autoridade, evidência e cenários adversos antes de perguntar ou entregar, com automação CLI aditiva e prova explícita do que está self-reviewed, independentemente revisado, bloqueado ou não verificado.

## Autoridades

- Produto: `.aioson/context/prd-review-intelligence.md`.
- Requisitos e ACs: `.aioson/context/requirements-review-intelligence.md`.
- Arquitetura: `.aioson/context/design-doc-review-intelligence.md`.
- Readiness: `.aioson/context/readiness-review-intelligence.md`.
- Sequência: `.aioson/context/implementation-plan-review-intelligence.md`.
- Conformance: `.aioson/context/conformance-review-intelligence.yaml`.
- Harness: `.aioson/plans/review-intelligence/harness-contract.json`.
- Evidência de origem: `researchs/mattpocock-grill-me-with-docs-2026/summary.md`.

## Contrato funcional fechado

- `review:prepare` cria packet `review-packet/v1` content-addressed para um dos oito agentes/perfis.
- O agente executa até duas passagens e materializa somente conclusões auditáveis em `review-report/v1`.
- `review:check` valida binding, schema, paths, evidência e staleness; promove somente report atual/válido.
- `review:status` agrega reports atuais e cinco eixos de delivery sem nota única.
- Skill ausente/CLI ausente aciona fallback manual; ausência de review não muda gates no MVP.

## Decisões fechadas

1. O CLI resolve mecânica, não julgamento semântico, pesquisa ou aprovação.
2. Perfis: framing, specification, architecture e delivery-assurance; cada agente carrega somente sua referência.
3. Modo self/independent vem do profile registry e não pode ser autoelevado pelo report.
4. Duas passagens máximas; fatos inferíveis são resolvidos antes de perguntar, decisões de owner são roteadas com recomendação.
5. Packet ID incorpora artifact e authority hashes; qualquer fonte alterada exige reprepare.
6. Paths passam por validação lexical e realpath; symlink/junction externo e traversal falham antes da leitura.
7. Packets/reports finais são imutáveis, content-addressed e escritos atomicamente; não há `latest` mutável.
8. Invalid/stale retorna exit 2; action-required válido retorna exit 1 e é preservado; pass/empty retorna exit 0.
9. Delivery assurance mantém cinco eixos independentes; chain-of-thought e scores agregados são proibidos.
10. CLI, skill, schema e hooks são aditivos; workflow, gates, CHAIN_AGENTS, telemetry e comandos atuais permanecem inalterados.
11. O SG de wiring será acrescentado pelo dev depois que os arquivos existirem: o preflight atual executa SG no handoff pré-dev; cobertura binária permanece no contrato desde já.
12. O texto de artefatos, authorities, cache, reports e JSON de CLI é dado não confiável: directives embutidas não autorizam ações. Carriers ocultos são rejeitados no contrato; `review:status` usa ordem confiável de promoção, e leitura/escrita revalida contenção depois do open.

## Segurança e aplicabilidade

Não há superfície de ataque sensível nesta feature: ela não introduz autenticação, ownership de recursos, tenant, pagamento, upload, URL externa, segredo ou dado de usuário. Portanto `SEC-SBD-03` é N/A de forma explícita. A única persistência é local sob `.aioson/`; ela continua protegida por allowlist, contenção lexical + `realpath`, limites, revalidação de identidade após `open` e escrita imutável. Conteúdo de revisão é não confiável e não pode autorizar ferramenta, escopo ou arquivo.

## Rastreabilidade de requisitos

| Requisito | Critérios | Design / plano |
|---|---|---|
| REQ-RI-001 | AC-RI-001, AC-RI-002 | skill + Fases 1/3 |
| REQ-RI-002 | AC-RI-002, AC-RI-015 | contracts + Fases 1/3 |
| REQ-RI-003 | AC-RI-003, AC-RI-008, AC-RI-014 | profiles/contracts + Fases 1/3 |
| REQ-RI-004 | AC-RI-001, AC-RI-003, AC-RI-023 | profile refs/hooks + Fase 3 |
| REQ-RI-005 | AC-RI-002, AC-RI-022, AC-RI-023 | references/cache + Fases 3/4 |
| REQ-RI-006 | AC-RI-004, AC-RI-005 | engine prepare + Fase 2 |
| REQ-RI-007 | AC-RI-004, AC-RI-006 | contracts/storage + Fases 1/2 |
| REQ-RI-008 | AC-RI-007, AC-RI-008, AC-RI-009 | report schema/check + Fases 1/2 |
| REQ-RI-009 | AC-RI-014, AC-RI-016 | assurance contract + Fases 1/2 |
| REQ-RI-010 | AC-RI-007, AC-RI-009, AC-RI-010, AC-RI-011 | check/storage + Fase 2 |
| REQ-RI-011 | AC-RI-014, AC-RI-015 | semantic validator + Fases 1/2 |
| REQ-RI-012 | AC-RI-010, AC-RI-016, AC-RI-017 | status engine + Fase 2 |
| REQ-RI-013 | AC-RI-006, AC-RI-007, AC-RI-013, AC-RI-018 | atomic storage + Fases 1/2 |
| REQ-RI-014 | AC-RI-011, AC-RI-012, AC-RI-018 | realpath/bounds + Fase 1 |
| REQ-RI-015 | AC-RI-008, AC-RI-017, AC-RI-021 | hooks/fallback + Fase 3 |
| REQ-RI-016 | AC-RI-001, AC-RI-020 | managed distribution/sync + Fase 3 |
| REQ-RI-017 | AC-RI-009, AC-RI-019 | CLI/help/docs + Fases 2/4 |
| REQ-RI-018 | AC-RI-020, AC-RI-021, AC-RI-024 | regression gate + Fases 3/4 |

## Must-haves de execução

### Truths

- prepare/check/status obedecem estados, bindings e exit codes definidos;
- paths externos nunca são lidos e stale nunca é promovido;
- agentes aplicam evidência-first, ownership e limite sem expor raciocínio privado;
- assurance não mascara fail/unverified por agregação;
- comandos atuais continuam com os mesmos contratos.

### Artifacts

- módulos e command runner novos substantivos;
- skill + quatro refs + metadata e schema distribuídos;
- oito hooks template/workspace em paridade;
- testes focados, docs e artifacts de review válidos.

### Key links

- CLI dispatcher → command runner → engine → profiles/contracts/storage;
- agent hook → SKILL/ref → prepare/check;
- MANAGED_FILES/template → installer/update/workspace;
- requirements/conformance → tests/harness → QA/validator.

## Riscos e não objetivos

- Self-review reduz omissão, mas não substitui reviewer independente.
- Não executar jury/modelo externo, pesquisa obrigatória, cleanup/retention automático, telemetria nova ou done-gate nesta versão.
- Não reescrever prompts inteiros nem transformar JSON de review em segunda spec.

## Gates

- Gate A: approved — requisitos e 24 ACs binários consolidados; análise strict limpa.
- Gate B: approved — módulos, paths, schemas, fallback e rollback consolidados; readiness `ready`.
- Gate C: approved — quatro fases sequenciais, contexto mínimo e verificações definidos.
- Gate D: approved — QA independente confirmou os 24 ACs, a remediação de segurança, a suíte integral e o harness binário; `feature:close` continua sendo decisão humana.

## Checkpoint

Fase 4 aprovada no nível de desenvolvimento: documentação bilíngue, 24/24 ACs, spec strict, artifact integrity, ledger, harness 10/10, lint e suíte integral (`3.767 pass / 0 fail / 1 skip`) estão verdes. A revisão independente vinculada da fase também retornou `PASS` com testes focados e zero findings. `audit:code` registrou 0 HIGH; os MED são correspondências lexicais e os LOW são advisories de literais contratuais. O validator isolado confirmou os 10 critérios e o circuit breaker registrou `ready_for_done_gate=true`. A QA oficial aprovou o Gate D; `feature:close` não foi executado automaticamente.

## QA Sign-off

- **Date:** 2026-07-15
- **Verdict:** PASS
- **Gate D (execution):** approved
