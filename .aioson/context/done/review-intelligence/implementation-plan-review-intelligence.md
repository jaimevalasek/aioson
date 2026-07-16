---
slug: review-intelligence
classification: MEDIUM
gate_plan: approved
status: approved
phases: 4
created_at: 2026-07-15
updated_at: 2026-07-15T19:27:00-03:00
---

# Plano de Implementação — Review Intelligence

## Required Context Package

Pacote primário no cold start de `@dev`:

1. `.aioson/context/dev-state.md` — fase e próximo slice;
2. este plano — somente a fase atual;
3. `.aioson/context/spec-review-intelligence.md` — gates, decisões fechadas e checkpoint;
4. `.aioson/context/design-doc-review-intelligence.md` — módulos e contratos técnicos.

Loads por gatilho:

- Fase 1: requirements + schema/harness + `src/verification/path-policy.js`.
- Fase 2: outputs da Fase 1 + `src/cli.js`, dictionaries e testes CLI.
- Fase 3: skill-creator + structural contract + template agents + sync preflight/copy.
- Fase 4: diff completo + conformance + harness + docs/reports de teste.

Não reler pesquisa/PRD completos durante execução salvo contradição de escopo comprovada.

## Decisões pre-taken (FINAL)

- Três CLIs aditivas com as assinaturas e exit codes definidos em requirements; nenhum comando atual muda.
- Domínio isolado `src/review-intelligence/`; workflow/gates/telemetry/CHAIN_AGENTS permanecem intocados.
- Packets/reports content-addressed e imutáveis, sem ponteiro `latest`.
- Contenção lexical + realpath, hash de bytes crus e escrita atômica.
- Quatro perfis, oito agentes, duas passagens máximas, fallback manual quando a feature não existir.
- Sem score único, chain-of-thought, runner externo, pesquisa automática ou done-gate novo.
- Fases sequenciais; um único owner de escrita evita colisão em CLI/constants/agents.

## Fase 1 — Contratos, perfis e storage seguro

### Objetivo

Construir o núcleo puro antes de registrar qualquer comando.

### Primary files

- criar `src/review-intelligence/profiles.js`
- criar `src/review-intelligence/contracts.js`
- criar `src/review-intelligence/storage.js`
- criar fixtures/testes iniciais em `tests/review-intelligence.test.js`

### Trabalho

- Implementar REQ-RI-001, REQ-RI-002, REQ-RI-003, REQ-RI-004, REQ-RI-007, REQ-RI-008, REQ-RI-009, REQ-RI-011, REQ-RI-013 e REQ-RI-014 no nível de contrato.
- Cobrir AC-RI-002, AC-RI-003, AC-RI-006, AC-RI-011, AC-RI-012, AC-RI-013, AC-RI-014, AC-RI-015, AC-RI-016 e AC-RI-018.
- Testar feature slug/agente, bounds, forbidden keys/scores, realpath/junction, hash determinístico, temp+rename e cleanup.

### Done criteria

- validators aceitam packet/report canônicos e recusam incoerências sem side effects;
- symlink/junction externo não é lido;
- escrita repetida é no-op imutável e falha simulada não deixa parcial/temp;
- perfis/defaults/modos correspondem à matriz aprovada.

### Verificação

```bash
node --test --test-name-pattern="profile|schema|security|atomic|reasoning" tests/review-intelligence.test.js
node scripts/check-js.js
```

## Fase 2 — Engine, comandos e superfície CLI

### Objetivo

Entregar prepare/check/status completos e observáveis sem alterar o dispatcher legado.

### Primary files

- criar `src/review-intelligence/engine.js`
- criar `src/commands/review-intelligence.js`
- modificar `src/cli.js`
- modificar `src/i18n/messages/{en,pt-BR,es,fr}.js`
- ampliar `tests/review-intelligence.test.js` e `tests/i18n-cli.test.js`

### Trabalho

- Implementar REQ-RI-006, REQ-RI-010, REQ-RI-012 e REQ-RI-017.
- Completar AC-RI-004, AC-RI-005, AC-RI-007, AC-RI-008, AC-RI-009, AC-RI-010, AC-RI-017 e AC-RI-019.
- Registrar somente import, JSON set, help e três dispatches; propagar exitCode em modo texto apenas nesses branches.
- Provar empty/current/stale/malformed/blocker/decision/unverified e JSON sem ruído.

### Done criteria

- fluxo E2E `prepare → draft → check → status` passa em workspace temporário;
- invalid/stale não é promovido; action-required é promovido com exit 1;
- os quatro locales mostram assinaturas canônicas;
- testes de briefing/spec/verify existentes continuam verdes.

### Verificação

```bash
node --test tests/review-intelligence.test.js tests/i18n-cli.test.js
node --test tests/briefing-cli.test.js tests/briefing-refiner.test.js tests/verify-implementation.test.js tests/artifact-validate.test.js
node scripts/check-js.js
```

## Fase 3 — Skill, schema, hooks e distribuição

### Objetivo

Conectar a inteligência aos oito agentes por progressive disclosure e distribuir tudo pelo template.

### Primary files

- criar `template/.aioson/skills/process/review-intelligence/` (SKILL, metadata, quatro references)
- criar `template/.aioson/schemas/review-intelligence.schema.json`
- modificar `src/constants.js`, `template/AGENTS.md`, `AGENTS.md`
- modificar oito `template/.aioson/agents/*.md`
- sincronizar para `.aioson/`
- criar `tests/review-intelligence-skill.test.js`; ampliar agent contracts

### Trabalho

- Aplicar REQ-RI-001, REQ-RI-002, REQ-RI-003, REQ-RI-004, REQ-RI-005, REQ-RI-015 e REQ-RI-016 no comportamento dos agentes.
- Completar AC-RI-001, AC-RI-002, AC-RI-003, AC-RI-020, AC-RI-021, AC-RI-022 e AC-RI-023.
- Inicializar a skill com `skill-creator`, editar somente recursos essenciais, gerar metadata e validar.
- Inserir hooks após activation guards e antes dos gates/handoffs, sem reescrever prompts inteiros.
- Rodar sync preflight antes da cópia e verificar paridade byte-a-byte.

### Done criteria

- SKILL curto e quatro refs carregáveis isoladamente;
- hooks referenciam perfil certo, comando certo e fallback; error de check não é silenciado;
- schema/runtime permanecem alinhados;
- todos os novos arquivos estão em `MANAGED_FILES` e template/workspace iguais;
- observability/language/handoff existentes preservados.

### Verificação

```bash
node --test tests/review-intelligence-skill.test.js tests/agent-contracts.test.js
node bin/aioson.js skill:audit . --json
npm run sync:agents
node --test tests/review-intelligence-skill.test.js tests/agent-contracts.test.js
```

## Fase 4 — Documentação, hardening e regressão integral

### Objetivo

Provar compatibilidade e preparar evidência independente para pentest/QA/validator.

### Primary files

- modificar `docs/en/5-reference/cli-reference.md`
- modificar `docs/pt/5-referencia/comandos-cli.md`
- consolidar testes/fixtures e artefatos de spec/harness

### Trabalho

- Fechar REQ-RI-017 e REQ-RI-018.
- Completar AC-RI-019, AC-RI-020, AC-RI-021, AC-RI-022, AC-RI-023 e AC-RI-024.
- Revisar regressão dos comandos atuais, traversal/symlink/TOCTOU, bounds, atomicidade, schema parity e ausência de score/CoT.
- Rodar análise cross-artifact e corrigir todo `error`; warnings exigem resolução ou justificativa explícita.

### Done criteria

- docs descrevem estados/exit codes/fallback sem prometer gate automático;
- `spec:analyze --strict`, artifact chain, AC audit, harness e lint passam;
- suíte integral passa sem perda funcional;
- dossier/code map/dev-state/progress refletem os arquivos reais e Gate D continua pendente para QA.

### Verificação

```bash
node bin/aioson.js spec:analyze . --feature=review-intelligence --strict --json
node bin/aioson.js artifact:validate . --feature=review-intelligence --json
node bin/aioson.js ac:test-audit . --feature=review-intelligence --json
node bin/aioson.js harness:check . --slug=review-intelligence --json
npm run lint
npm test
```

## Dependências e write ownership

```text
Fase 1 → Fase 2 → Fase 3 → Fase 4
```

- Um único `@dev` possui os arquivos de produção/template durante as quatro fases.
- Pentester/QA/validator são read-mostly reviewers depois da implementação; correções retornam ao dev.
- Não executar lanes paralelas sobre `src/cli.js`, `src/constants.js`, agents ou sync.
- Arquivos de contexto/harness não contam como autorização para tocar outros itens já dirty no worktree.

## Rollback por fase

- Fase 1: remover somente o novo bounded context/testes; nenhum consumidor existe.
- Fase 2: remover os três branches/import/help e módulos novos; comandos antigos permanecem byte-equivalentes.
- Fase 3: remover managed entries/hooks/skill/schema e ressincronizar; instalações antigas já usam o fallback.
- Fase 4: reverter apenas docs/testes novos. Não resetar nem descartar mudanças preexistentes do usuário.

## Rastreabilidade completa

| REQ | Fase | ACs principais |
|---|---:|---|
| REQ-RI-001 | 1, 3 | AC-RI-001, AC-RI-002 |
| REQ-RI-002 | 1, 3 | AC-RI-002, AC-RI-015 |
| REQ-RI-003 | 1, 3 | AC-RI-003, AC-RI-008, AC-RI-014 |
| REQ-RI-004 | 1, 3 | AC-RI-001, AC-RI-003, AC-RI-023 |
| REQ-RI-005 | 3, 4 | AC-RI-002, AC-RI-022, AC-RI-023 |
| REQ-RI-006 | 2 | AC-RI-004, AC-RI-005 |
| REQ-RI-007 | 1, 2 | AC-RI-004, AC-RI-006 |
| REQ-RI-008 | 1, 2 | AC-RI-007, AC-RI-008, AC-RI-009 |
| REQ-RI-009 | 1, 2 | AC-RI-014, AC-RI-016 |
| REQ-RI-010 | 2 | AC-RI-007, AC-RI-009, AC-RI-010, AC-RI-011 |
| REQ-RI-011 | 1, 2 | AC-RI-014, AC-RI-015 |
| REQ-RI-012 | 2 | AC-RI-010, AC-RI-016, AC-RI-017 |
| REQ-RI-013 | 1, 2 | AC-RI-006, AC-RI-007, AC-RI-013, AC-RI-018 |
| REQ-RI-014 | 1 | AC-RI-011, AC-RI-012, AC-RI-018 |
| REQ-RI-015 | 3 | AC-RI-008, AC-RI-017, AC-RI-021 |
| REQ-RI-016 | 3 | AC-RI-001, AC-RI-020 |
| REQ-RI-017 | 2, 4 | AC-RI-009, AC-RI-019 |
| REQ-RI-018 | 3, 4 | AC-RI-020, AC-RI-021, AC-RI-024 |

Todos os critérios `AC-RI-001`, `AC-RI-002`, `AC-RI-003`, `AC-RI-004`, `AC-RI-005`, `AC-RI-006`, `AC-RI-007`, `AC-RI-008`, `AC-RI-009`, `AC-RI-010`, `AC-RI-011`, `AC-RI-012`, `AC-RI-013`, `AC-RI-014`, `AC-RI-015`, `AC-RI-016`, `AC-RI-017`, `AC-RI-018`, `AC-RI-019`, `AC-RI-020`, `AC-RI-021`, `AC-RI-022`, `AC-RI-023` e `AC-RI-024` estão vinculados ao harness e às fases acima.

> **Gate C:** approved — quatro fases sequenciais com verificação definida.

## Revalidação editorial — Fase 4

Revalidado em 2026-07-15 após os checkpoints de implementação das Fases 2 e 3. As alterações posteriores no spec foram somente metadados de checkpoint; escopo, decisões pre-taken, quatro fases, done criteria, rollback e rastreabilidade REQ→AC continuam válidos sem replanejamento.
