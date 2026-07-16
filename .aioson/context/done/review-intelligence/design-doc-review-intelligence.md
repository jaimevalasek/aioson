---
slug: review-intelligence
classification: MEDIUM
gate_design: approved
status: approved
readiness: ready
created_at: 2026-07-15
updated_at: 2026-07-15T19:27:00-03:00
---

# Design Doc — Review Intelligence

## Decisão arquitetural

Criar um bounded context novo em `src/review-intelligence/` e um adapter fino em `src/commands/review-intelligence.js`. O domínio novo resolve somente trabalho mecânico e auditável — seleção de perfil/autoridade, hashing, validação, promoção e agregação. Julgamento semântico permanece nos agentes e aprovação independente permanece nos agentes downstream existentes.

Não alterar o motor de workflow, gates, handoff contract, `CHAIN_AGENTS`, verification ledger, briefing lifecycle ou schemas atuais. Os três comandos entram como branches aditivas em `src/cli.js`; ausência de seus artefatos continua não bloqueante.

## Componentes e dependências

```text
src/commands/review-intelligence.js
  └─ src/review-intelligence/engine.js
       ├─ profiles.js
       ├─ contracts.js
       └─ storage.js
            └─ src/verification/path-policy.js
                 (somente validateFeatureSlug, resolveProjectRoot, toPosixPath)
```

### `profiles.js`

- Exporta allowlist imutável dos oito agentes.
- Para cada agente define `profile`, `review_mode`, default artifacts ordenados, `reference_path`, authority candidates, lens IDs e stop conditions.
- Perfis: `framing`, `specification`, `architecture`, `delivery-assurance`.
- Nunca consulta workflow state nem muda ownership.

### `contracts.js`

- Constantes `review-packet/v1` e `review-report/v1`.
- Validação estrutural e semântica, limites de arrays/strings e enums próprios.
- Rejeição recursiva case-insensitive de chaves de raciocínio privado (`chain_of_thought`, `reasoning`, `thoughts`, `scratchpad`, `deliberation` e formas normalizadas).
- Rejeição de qualquer score agregado (`overall_score`, `score`, `rating`, `percentage`, `rank`) no report/status; `confidence` por finding permanece permitido.
- Gera o exemplo de report que `review:prepare` devolve; o schema JSON distribuído espelha essas regras.

### `storage.js`

- Valida paths lexicalmente e depois com `realpath`; NUL, absoluto externo, traversal e symlink/junction que resolva fora da raiz falham antes de leitura.
- Usa `lstat`/`stat` para confirmar arquivo regular e limites.
- Calcula SHA-256 dos bytes crus via stream, sem normalizar encoding/newline.
- Escreve conteúdo canônico com temporário exclusivo no mesmo diretório, `fsync`, close e rename; faz sync do diretório best-effort e limpa temporário em qualquer falha.
- Destinos são derivados somente de slug/agente validados + hashes, nunca de path livre.
- Lista no máximo 1.000 packets/reports e devolve erro bounded ao exceder.

### `engine.js`

- `prepareReview`: resolve/valida artifact, coleta fontes existentes do profile registry, calcula hashes, deriva packet ID determinístico, persiste packet imutável e devolve contrato/next command.
- `checkReview`: valida o candidato, encontra packet pelo ID, confirma binding, rehash de artifact/authorities, valida evidências/coerência e promove report válido para nome content-addressed.
- `reviewStatus`: lê somente storage canônico, revalida records e hashes, escolhe o report current mais recente por agente e agrega estados/eixos sem score.
- Não executa pesquisa, testes, shell, modelos, workflow ou gates.

### `src/commands/review-intelligence.js`

- Exporta `runReviewPrepare`, `runReviewCheck`, `runReviewStatus`.
- Normaliza argumentos, chama o engine e renderiza uma saída humana compacta ou retorna o mesmo objeto JSON.
- Expõe `exitCode` 0/1/2 conforme requirements. No modo texto, somente os três branches novos propagam esse código ao processo; o tratamento genérico dos comandos legados não muda.

## Contrato CLI

```text
aioson review:prepare [path] --agent=<agent> --feature=<slug> [--artifact=<path>] [--json]
aioson review:check   [path] --agent=<agent> --feature=<slug> --report=<path> [--json]
aioson review:status  [path] --feature=<slug> [--json]
```

Sem `--force`, `--allow-stale`, runner externo, web automática ou integração com gate no MVP. Aliases com hífen seguem a convenção interna do dispatcher (`review-prepare`, `review-check`, `review-status`) apenas como forma compatível de resolução; o help documenta os nomes canônicos com `:`.

## Profile registry e autoridades

Cada packet inclui o artefato revisado como autoridade primária e somente candidatos fixos existentes:

| Profile | Autoridades candidatas adicionais |
|---|---|
| framing | project context, briefing, PRD, scope expansion, dossier |
| specification | project context, PRD, requirements, spec, scope expansion, dossier |
| architecture | project context, PRD, requirements, spec, design-doc base/feature, structural rule, dossier |
| delivery-assurance | PRD, requirements, spec, design-doc, implementation plan, scope-check, QA/security/harness existentes, dossier |

O registry fornece paths, não conteúdo. O agente continua usando `context:brief`/cache conforme seu contrato. Ausência de uma autoridade opcional é registrada no packet como gap conhecido somente quando relevante; não causa leitura ampla de pastas.

## Packet

```json
{
  "schema_version": "review-packet/v1",
  "packet_id": "sha256:<hex>",
  "feature_slug": "review-intelligence",
  "agent": "architect",
  "profile": "architecture",
  "review_mode": "self_review",
  "artifact": { "path": "...", "sha256": "...", "bytes": 123 },
  "authorities": [
    { "kind": "requirements", "path": "...", "sha256": "...", "bytes": 456 }
  ],
  "reference_path": ".aioson/skills/process/review-intelligence/references/architecture.md",
  "challenge_lenses": ["boundary", "failure", "security", "evolution", "implementability"],
  "max_passes": 2,
  "prepared_at": "ISO-8601"
}
```

O ID usa schema + feature + agente + profile/mode + artifact path/hash + authority paths/hashes em ordem estável. Timestamp não participa do ID. Mesmo input gera o mesmo ID/path; qualquer fonte muda o ID e deixa records anteriores stale.

Packet path:

```text
.aioson/context/features/{slug}/reviews/packets/{agent}-{packet-hash}.json
```

## Report

```json
{
  "schema_version": "review-report/v1",
  "packet_id": "sha256:<hex>",
  "feature_slug": "review-intelligence",
  "agent": "architect",
  "profile": "architecture",
  "review_mode": "self_review",
  "artifact": { "path": "...", "sha256": "..." },
  "passes_completed": 2,
  "review_status": "pass",
  "summary": "Conclusão auditável",
  "findings": [],
  "completed_at": "ISO-8601"
}
```

Finding:

```json
{
  "id": "RI-FIND-001",
  "lens": "failure",
  "status": "open",
  "severity": "blocking",
  "description": "...",
  "evidence": [{ "type": "artifact", "path": "src/x.js", "detail": "..." }],
  "impact": "...",
  "recommendation": "...",
  "alternatives": ["..."],
  "confidence": "high",
  "owner": "dev",
  "residual_risk": "..."
}
```

Evidência aceita: artifact/code/test/research-cache/runtime/command/decision. Quando possui path, o path deve existir e ficar dentro do projeto; command requer status/evidence textual bounded. URL isolada não é evidência canônica: pesquisa externa aponta para o `researchs/{slug}/summary.md` cacheado.

Delivery assurance exige:

```text
assurance.specification_fidelity
assurance.acceptance_coverage
assurance.code_health
assurance.runtime_truth
assurance.residual_risk
```

Cada eixo é `{status, evidence[], residual_risk}` com status `pass|fail|unverified|not_applicable`. Não existe overall score.

Candidate report sugerido pelo prepare:

```text
.aioson/context/features/{slug}/reviews/drafts/{agent}-{packet-hash}.report.json
```

Canonical report promovido pelo check:

```text
.aioson/context/features/{slug}/reviews/reports/{agent}-{packet-hash}-{report-hash}.json
```

## Coerência, staleness e exit codes

- `prepare`: 0 em packet atual/idempotente; 2 para input/path/missing/bounds.
- `check`: 0 para `pass`; 1 para report válido `blocked|decision_required|unverified`; 2 para invalid/path/stale/binding. Reports válidos de ação são promovidos.
- `status`: 0 para `empty|clear`; 1 para `attention_required`; 2 para `invalid_or_stale`.
- `pass` não admite blocker/open/decision ou delivery axis fail/unverified sem `not_applicable` explícito.
- Mudança de artifact ou authority após prepare invalida o packet. Não há flag para ignorar stale.
- Invalid/stale candidate nunca entra em `reports/`; temporário ou draft não é tratado como final.

## Skill e progressive disclosure

Criar com o scaffold oficial da `skill-creator` no template canônico:

```text
template/.aioson/skills/process/review-intelligence/
├── SKILL.md
├── agents/openai.yaml
└── references/
    ├── framing.md
    ├── specification.md
    ├── architecture.md
    └── delivery-assurance.md
```

`SKILL.md` contém somente workflow central, automação, output/stop contract e roteamento para referências. Cada referência contém perguntas de pressão, evidência prioritária, future-state/pre-mortem, ownership e stop conditions da fase. Não criar README, changelog, assets ou scripts duplicando o engine.

Adicionar os seis arquivos e `.aioson/schemas/review-intelligence.schema.json` a `MANAGED_FILES`. Atualizar o managed block de `template/AGENTS.md` e `AGENTS.md` com ativação da skill. Validar via `quick_validate.py`, testes e `skill:audit`.

## Hooks mínimos nos agentes

Editar somente o template e sincronizar:

- `briefing`: depois de existir briefing/slug e antes do quality gate/handoff; framing.
- `briefing-refiner`: depois da auditoria e antes de `briefing:review`; framing.
- `product`: depois do PRD draft e antes de registrar/handoff; framing.
- `sheldon`: depois do enrichment/spec package e antes de readiness/handoff; specification.
- `analyst`: depois de requirements/spec e antes de Gate A/dev-state; specification.
- `architect`: depois de design/readiness e antes de Gate B; architecture.
- `scope-check`: depois da comparação/verdict draft e antes do handoff; delivery-assurance.
- `qa`: depois das provas/testes e antes de Gate D/closure; delivery-assurance.

Cada hook: carregar `SKILL.md` + somente sua referência; executar prepare; até duas passagens; escrever draft; executar check e inspecionar JSON/exit. Falta real de CLI/skill usa fallback manual. Erro de validação do CLI não é silenciado com `|| true`. Hooks entram depois dos activation guards e não alteram os observability/handoff blocks existentes.

## Integração CLI, help e docs

Modificar `src/cli.js` somente em quatro pontos: import, `JSON_SUPPORTED_COMMANDS`, três linhas de help e dispatch. Adicionar as três chaves de help a en/pt-BR/es/fr. Atualizar aditivamente:

- `docs/en/5-reference/cli-reference.md`;
- `docs/pt/5-referencia/comandos-cli.md`;
- `tests/i18n-cli.test.js`.

Não mudar mensagens, flags, aliases, snapshots ou codes de comandos existentes.

## Schema distribuído

`template/.aioson/schemas/review-intelligence.schema.json` usa Draft 2020-12 com `$defs.packet`, `$defs.report`, `$defs.finding`, `$defs.evidence` e `$defs.assurance_axis`, `additionalProperties: false` e bounds alinhados ao runtime. `oneOf` permite validar packet ou report. A cópia workspace deve ser byte-a-byte idêntica.

## Caminhos

### Criar

- `src/review-intelligence/{profiles,contracts,storage,engine}.js`
- `src/commands/review-intelligence.js`
- skill + quatro referências + `agents/openai.yaml` no template
- schema no template
- `tests/review-intelligence.test.js`
- `tests/review-intelligence-skill.test.js`

### Modificar

- `src/cli.js`, `src/constants.js`, quatro dictionaries i18n
- oito agentes no template, depois cópias workspace
- `template/AGENTS.md`, `AGENTS.md`
- testes de i18n/contratos quando necessário
- referências CLI en/pt-BR

### Reusar sem modificar

- `src/verification/path-policy.js`: slug/root/posix helpers
- parser/logger/translator do CLI
- installer/update baseado em `MANAGED_FILES`
- `context:brief`, research cache, dossier, gates e verification existentes

### Retirar

- Nada. Não há migration ou substituição de comando.

## Segurança, falhas e rollback

- Bounded reads impedem arquivo enorme/JSON bomb; validação acontece antes de promoção.
- Realpath é verificado imediatamente antes de cada read/hash; rename escreve somente em diretório fixo real dentro do projeto.
- Mensagens retornam path relativo/reason, nunca conteúdo de arquivo externo ou report inválido.
- Corrida produz arquivos content-addressed equivalentes ou separados; nenhum `latest` mutável.
- Erro de escrita conserva canônico anterior e limpa temp.
- Rollback remove apenas novos dispatches/módulos/managed files/hooks; nenhum estado legado precisa migrar. Artefatos `reviews/` podem permanecer ignorados por versões antigas.

## Ordem de dependência

1. profiles/contracts/storage puros e testes de segurança/schema;
2. engine + command runners + CLI/help/i18n e testes E2E;
3. skill/schema/managed distribution + hooks e paridade;
4. docs, cenários de gaps, lint, harness, AC audit e suíte integral.

As fases são sequenciais porque engine depende dos contratos/storage e hooks dependem do CLI/skill final. Nenhum trabalho paralelo deve editar `src/cli.js`, agents ou constants simultaneamente.

## Riscos residuais

- Self-review mantém viés do autor; mitigado por rotular modo e manter reviewers downstream.
- Autoridade fixa pode omitir uma fonte rara; `--artifact` e context selection continuam explícitos, sem `--sources` livre no MVP.
- Symlink pode mudar entre check e read; realpath + stat/hash imediatamente antes do uso reduz TOCTOU, e outputs nunca seguem path controlado pelo usuário.
- Muitos artifacts antigos podem acumular; limite de varredura falha de forma acionável. Cleanup/retention fica para versão futura.

> **Gate B:** Architecture approved — @dev can proceed after Gate C.

Consolidação: o spec canônico foi confrontado com este design; não adicionou dependência, path ou comportamento fora dos contratos acima.

## Revalidação editorial — Fase 4

Revalidado em 2026-07-15 após os checkpoints de implementação das Fases 2 e 3. As mudanças posteriores no spec limitaram-se a `last_checkpoint` e ao resumo de progresso; requisitos, Gates A/B/C, componentes, contratos, paths, segurança e ordem de dependência permanecem inalterados.
