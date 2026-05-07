---
feature_slug: agent-chain-continuity
created_by: analyst
created_at: 2026-05-07
classification: MEDIUM
schema_version: "1.0"
source_prd: .aioson/context/prd-agent-chain-continuity.md
---

# Requirements — Agent Chain Continuity

## 1. Feature summary

Revival operacional do Feature Dossier: cada feature SMALL/MEDIUM nasce com dossier auto-inicializado, todos os 8 agentes da cadeia (`@product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa`) escrevem nele com contratos explícitos, `@sheldon` registra pesquisas em `researchs/` via `research_index` estruturado, `@dev` retoma em chat novo com auto-relato e detecta drift contra Code Map e plano `@sheldon`, e `feature:close` garante que dossier exista antes de marcar `done`.

## 2. New entities and fields

### 2.1 Dossier schema v1.2 — adições ao v1.1

#### Frontmatter (sem mudanças além do `schema_version`)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `schema_version` | string | sim | passa de `"1.1"` para `"1.2"` |

(Demais campos do v1.1 inalterados: `feature_slug`, `created_by`, `created_at`, `status`, `classification`, `last_updated_by`, `last_updated_at`, `bootstrap_hash`.)

#### Nova seção: `## Research Index`

Inserida entre `## Rules & Design-Docs aplicáveis` e `## Agent Trail`.

Contém YAML embutido com schema:

```yaml
researchs:
- slug: tool-first-agent-workflows-2026     # kebab-case do diretório em researchs/ (obrigatório)
  verdict: confirmed                         # confirmed | has-alternatives | outdated | deprecated (obrigatório)
  agent_who_added: sheldon                   # id de agente canônico (obrigatório)
  why_relevant: "decisão sobre tool-first vs prompt-first" # string livre (obrigatório, max 200 chars)
  added_at: 2026-05-07T14:32:00Z             # ISO 8601 (obrigatório)
  summary_path: researchs/tool-first-agent-workflows-2026/summary.md  # path relativo ao root (obrigatório)
```

**Roles permitidos para `verdict`:** `confirmed | has-alternatives | outdated | deprecated` (alinhado com convenção AGENTS.md `researchs/`).

**Idempotência:** `dossier:add-research` deduplica por `slug` único; `verdict` atualiza para o último valor; `agent_who_added` e `added_at` mantêm o primeiro.

#### Convenção de drift no `## Agent Trail` (sem schema novo)

Linhas iniciadas por `DRIFT:` em uma entry de Agent Trail são tratadas como registros de divergência. Formato sugerido (não validado por parser, freeform):

```
DRIFT: <descrição da divergência> | expected: <plano/Code Map> | actual: <observado> | decision: <follow-plan|adjust-plan|revision-opened|other> | ref: <link opcional>
```

Parser NÃO valida o formato — `dossier:show` apresenta as linhas verbatim. Convenção é guideline para `@dev`, não constraint forte.

### 2.2 handoff-protocol.json schema v2 — `artifact_uris` estruturado

#### Estado atual (v1)

```json
"artifact_uris": []
```

Sempre vazio. Sem schema definido para itens.

#### Estado novo (v2)

```json
"artifact_uris": [
  {
    "path": ".aioson/context/prd-agent-chain-continuity.md",
    "kind": "prd",
    "agent": "product",
    "added_at": "2026-05-07T19:30:00Z"
  },
  {
    "path": ".aioson/context/requirements-agent-chain-continuity.md",
    "kind": "requirements",
    "agent": "analyst",
    "added_at": "2026-05-07T20:15:00Z"
  }
]
```

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `path` | string | sim | path relativo ao root do projeto |
| `kind` | string | sim | enum (ver abaixo) |
| `agent` | string | sim | id de agente canônico |
| `added_at` | string | sim | ISO 8601 |

**Enum `kind`:** `prd | requirements | spec | plan | dossier | code | test | manifest | conformance | research | other`

**Backwards compat:** se `artifact_uris` é array de strings (legado v1), `dossier:show` e `@dev` tratam como `[{path, kind: "other", agent: "unknown", added_at: null}]`. Nenhum erro.

### 2.3 Comportamentos novos (não são entidades de dados — são contratos de execução)

#### 2.3.1 Auto-init hook

| Aspecto | Valor |
|---|---|
| Trigger | Primeira ativação de qualquer agente da cadeia para um `slug` cuja `classification` é `SMALL` ou `MEDIUM` |
| Pré-condição | `.aioson/context/features/{slug}/dossier.md` não existe |
| Ação | Roda `aioson dossier:init . --slug={slug}` silenciosamente (sem `--from-existing`; cria dossier vazio com Why/What pendentes) |
| Pós-condição | Próximo escritor (geralmente `@product`) preenche `Why`/`What` |
| MICRO | Não dispara — agentes seguem fluxo legacy ("if present, read it") |
| Output ao usuário | Nenhum — silencioso |

#### 2.3.2 feature:close dossier guarantee

| Aspecto | Valor |
|---|---|
| Trigger | `aioson feature:close --verdict=PASS` (ou close pelo `@qa`) |
| Pré-condição | Feature está pronta para fechar |
| Ação | Se `.aioson/context/features/{slug}/dossier.md` não existe, roda `aioson dossier:init . --slug={slug} --from-existing` antes do close |
| Fallback | Se `--from-existing` falha com `EBOOTSTRAPEMPTY` (sem artefatos), cria dossier mínimo com `Why: "(no source artifacts found)"`, prossegue com close, registra warning em runtime telemetry |
| Pós-condição | Dossier existe e é archived junto da feature em `.aioson/context/done/{slug}/dossier/` |

#### 2.3.3 Drift detection (@dev)

| Aspecto | Valor |
|---|---|
| Escopo | Paths declarados em `## Code Map` do dossier + passos do plano em `.aioson/plans/{slug}/manifest.md` |
| Trigger | `@dev` durante implementação detecta que (i) um path declarado no Code Map está em estado divergente do esperado pelo plano, OU (ii) um passo do plano `@sheldon` foi pulado/já-executado sem registro |
| Ação | Reporta ao usuário com 3 opções: seguir plano, ajustar plano, abrir `revision:open` |
| Registro | `@dev` adiciona entry em `Agent Trail` com convenção `DRIFT:` independente da decisão tomada |
| Granularidade | Arquivos NÃO declarados no Code Map e descobertas que não contradizem o plano são "discovery normal", não drift |

#### 2.3.4 @dev auto-relato em chat novo

| Aspecto | Valor |
|---|---|
| Trigger | `@dev` ativa em chat novo e detecta `feature_slug` ativo via `last-handoff.json` ou `dev-state.md` |
| Pré-condição | Feature está `in_progress` em `features.md` |
| Ação | Antes de QUALQUER pergunta ao usuário, emite output estruturado com 4 elementos obrigatórios: feature ativa + classificação, fase atual, lista de artefatos consumidos do `handoff-protocol.json.artifact_uris` + dossier, próximo passo derivado do plano `@sheldon` ou `dev-state.md` |
| Fallback | Se faltar dossier (feature legada): emite output baseado só em `dev-state.md` + `last-handoff.json` e nota explicitamente "dossier ausente — informações limitadas" |

#### 2.3.5 Paridade template ↔ workspace

| Aspecto | Valor |
|---|---|
| Escopo | 8 agentes da cadeia: `@product`, `@sheldon`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`, `@dev`, `@qa` |
| Conteúdo paritário | Seção `## Feature dossier` com contrato apropriado por agente, idêntica em `template/.aioson/agents/{agent}.md` e `.aioson/agents/{agent}.md` |
| Verificação | `aioson dossier:audit . --check=template-parity` retorna exit 0 quando paridade OK; exit non-zero com diff explícito quando divergir |
| `sync:agents` | Pre-hook compara checksums dos 8 agentes; se workspace tem mais conteúdo, aborta com mensagem "workspace tem alterações não propagadas para template; copie workspace→template antes de sync" |

## 3. Changes to existing entities

### 3.1 Dossier schema v1.1 → v1.2

- Bump `schema_version` no parser (`src/dossier/schema.js#SCHEMA_VERSION`).
- Parser v1.2 lê v1.0 e v1.1 sem erro (forward-compat já estabelecida no schema).
- `dossier:show` v1.2 renderiza `## Research Index` como bloco YAML formatado.

### 3.2 handoff-protocol.json schema v1 → v2

- `src/handoff-contract.js` valida `artifact_uris` como array de objetos com schema do § 2.2.
- Workflow `agent:done` (e equivalentes) populam `artifact_uris` ao concluir cada stage.
- Backwards compat: parser aceita array de strings legado e converte na leitura.

### 3.3 Agent prompts dos 8 agentes da cadeia

Cada um ganha (ou substitui) seção `## Feature dossier` com contrato específico:

| Agente | Seção(ões) que escreve | Contrato resumido |
|---|---|---|
| `@product` | `What` (uma vez) + `Agent Trail` (entrada de criação do PRD) | "MVP: …; Key constraints: …" |
| `@sheldon` | `Agent Trail` (entrada de enrichment) + `Research Index` (cada research consultado/criado) | "Sizing: N; Decision: in-place\|phased-plan; Plan: link; Research: links; Code findings: list" |
| `@analyst` | `Agent Trail` (entrada de requirements) + `Rules & Design-Docs aplicáveis` (rules linkados) + `Research Index` (qualquer research consultado) | "Requirements mapeados; Edge cases: N; Pendências para @architect: items" |
| `@architect` | `Agent Trail` (entrada de architecture) + `Code Map` (files+modules+patterns) + `Rules & Design-Docs aplicáveis` (design-docs) + `Research Index` (qualquer research consultado) | "Arquitetura definida; Decisões: …; Code Map: N entries" |
| `@ux-ui` | `Agent Trail` (entrada após UI spec) + (opcional) `Code Map` se mockups referenciam componentes específicos | "UI spec concluída; Telas: N; Design skill: …" |
| `@pm` | `Agent Trail` (entrada após task breakdown) | "Plano refinado; Stories: N; Lanes: N" |
| `@orchestrator` | `Agent Trail` (entrada após orquestração) | "Orquestração iniciada; Lanes: N; Gate C: status" |
| `@dev` | `Agent Trail` (por slice, com convenção `DRIFT:` quando aplicável) + `Code Map` (por arquivo criado/modificado) | "Slice concluído: …; Próximo: …" |
| `@qa` | `Agent Trail` (entrada após QA + verdict) | "QA concluído; Verdict: PASS\|FAIL; Cobertura: N%; Issues: list" |

**Override do legacy template:** `agent-templates.md` atualmente diz que `@sheldon` escreve em `Why`. Esta feature **substitui** esse contrato: `@sheldon` escreve apenas em `Agent Trail` e `Research Index`. `@product` continua dono de `Why`/`What`.

### 3.4 `agent-templates.md` (`.aioson/docs/dossier/`)

Adicionar templates para `@ux-ui`, `@pm`, `@orchestrator`. Reescrever entry de `@sheldon` para refletir o novo contrato. Demais entradas mantidas.

## 4. Relationships

- `prd-{slug}.md` → `dossier.md`: `Why`/`What` extraídos do PRD por `@product` durante criação.
- `requirements-{slug}.md` → `dossier.md`: `@analyst` registra entrada em `Agent Trail` referenciando paths em `Code Map`.
- `spec-{slug}.md` → `dossier.md`: linkado em `Agent Trail` quando produzido.
- `.aioson/plans/{slug}/manifest.md` → `dossier.md`: link em entry `@sheldon` no `Agent Trail`; consulta-base para drift detection do `@dev`.
- `researchs/{slug-pesquisa}/summary.md` → `dossier.md` `Research Index`: relação 1:N (uma pesquisa pode ser referenciada por N features; uma feature pode ter N pesquisas no Research Index).
- `dossier.md` ↔ `handoff-protocol.json`: dossier path obrigatoriamente listado em `artifact_uris` do handoff que sai do `@product`.
- `feature:close` → `dossier.md`: garante existência antes de marcar `done` e archivar.
- `aioson runtime SQLite` ← eventos: `dossier_auto_initialized`, `feature_close_dossier_synthesized`, `dev_drift_detected`, `dev_auto_resume`, `sync_agents_parity_violation`.

## 5. Migration additions (ordered)

Sem migrações de banco — feature é cross-cutting em prompts + comandos + arquivos. Ordem de implementação para `@architect`/`@dev`:

1. **Schema v1.2 do dossier** (`src/dossier/schema.js` + `.aioson/docs/dossier/schema.md`) — base para todas as outras peças.
2. **`dossier:add-research` command** — escrita controlada do `Research Index` (idempotência por `slug`).
3. **handoff-protocol v2** (`src/handoff-contract.js` + JSON schema) — backwards compat com v1.
4. **Auto-init hook no workflow** — local exato (workflow:next vs prompt) é decisão do `@architect`.
5. **`feature:close` dossier guarantee** (`src/commands/feature-close.js`).
6. **Agent prompts paridade** — workspace + template para os 8 agentes; substituição do template legacy de `@sheldon`.
7. **`agent-templates.md`** atualizado (templates novos + reescrita do `@sheldon`).
8. **`@dev` auto-relato** — instrução obrigatória no prompt + verificação via runtime telemetry.
9. **`@dev` drift detection** — instrução obrigatória + convenção `DRIFT:` no Agent Trail.
10. **`dossier:audit` command** — verificação de paridade template/workspace + auditoria de cobertura (todas features `in_progress` SMALL/MEDIUM têm dossier?).
11. **`sync:agents` pre-hook** — abort quando workspace tem alterações não propagadas.
12. **Runtime telemetry events** — registrar em `aios.sqlite` os 5 eventos novos.
13. **Tests** — regression test bundle `tests/agent-chain-continuity.regression.test.js` cobrindo todos os ACs.

## 6. Business rules

- **BR-ACC-01.** Auto-init é **silencioso**. Nenhum agente menciona "estou criando dossier" no output ao usuário.
- **BR-ACC-02.** Auto-init dispara **apenas em SMALL/MEDIUM**. MICRO permanece opt-in via `dossier:init` manual.
- **BR-ACC-03.** Cada agente da cadeia escreve no dossier **exatamente uma entrada por execução** (ou mais se houver multiplas slices, no caso de `@dev`). Idempotência impede duplicação por re-execução.
- **BR-ACC-04.** `@sheldon` é o **único agente** autorizado a escrever em `Research Index`. Demais agentes podem ler para contexto. (Exceção: `@analyst`/`@architect` que consultam pesquisas durante seu trabalho também podem adicionar entradas.)
- **BR-ACC-05.** `@product` é o **único agente** autorizado a escrever em `Why`/`What`. Demais agentes leem.
- **BR-ACC-06.** `@architect` é o **principal escritor** de `Code Map`; `@analyst` e `@dev` adicionam entradas conforme tocam código (`@analyst` raramente, `@dev` por slice).
- **BR-ACC-07.** `feature:close` deve **sempre** garantir dossier existente antes de archivar. Sem exceção mesmo para features que falharam (`--verdict=FAIL`).
- **BR-ACC-08.** `npm run sync:agents` **aborta** quando o pre-hook de paridade detecta workspace com conteúdo extra; usuário tem que copiar workspace→template antes de seguir.
- **BR-ACC-09.** `@dev` em chat novo nunca pergunta ao usuário "qual feature estou trabalhando?" se `last-handoff.json` ou `dev-state.md` indicam feature ativa. Auto-relato é **obrigatório** primeiro.
- **BR-ACC-10.** Drift logado em `Agent Trail` com convenção `DRIFT:` é freeform mas obrigatoriamente inclui os 4 elementos: descrição, expected, actual, decision.
- **BR-ACC-11.** `Research Index` deduplica por `slug`. Tentativa de adicionar `slug` duplicado atualiza apenas `verdict` (last-write-wins) e mantém `agent_who_added` + `added_at` originais.
- **BR-ACC-12.** Schema do dossier é forward-compatível: parser v1.2 lê dossiers v1.0 e v1.1; campos extras em frontmatter são ignorados (não causa erro).

## 7. Edge cases

- **EC-ACC-01.** Feature `in_progress` em `features.md` mas sem PRD (`prd-{slug}.md`) — auto-init cria dossier com Why/What vazios; primeira escrita do `@product` preenche.
- **EC-ACC-02.** Feature MICRO que cresce para SMALL durante a execução (re-classificação) — auto-init dispara retroativamente na próxima ativação de agente da cadeia.
- **EC-ACC-03.** `@product` ativado em feature pré-existente sem dossier (criada antes desta feature shippar) — auto-init silencioso na ativação.
- **EC-ACC-04.** `@dev` ativado em chat novo com feature `in_progress` mas sem dossier (legacy) — auto-relato baseado só em `dev-state.md` + `last-handoff.json` com nota explícita "dossier ausente".
- **EC-ACC-05.** `feature:close --verdict=FAIL` em feature sem dossier — auto-roda `dossier:init --from-existing`; se EBOOTSTRAPEMPTY, cria mínimo; archiva normalmente em `done/{slug}/dossier/` mesmo com FAIL.
- **EC-ACC-06.** `@dev` detecta drift mas o path está fora do Code Map E não está no plano — não é drift, é discovery normal; não reporta nem registra.
- **EC-ACC-07.** Plano `@sheldon` em `.aioson/plans/{slug}/` foi modificado entre handoffs (ex: `corrections-{date}.md`) — `@dev` lê o plano atual + corrections; drift é avaliado contra o estado mais recente.
- **EC-ACC-08.** `handoff-protocol.json` legado com `artifact_uris` array de strings — parser converte na leitura sem erro nem warning.
- **EC-ACC-09.** Múltiplas pesquisas com mesmo `slug` em `researchs/` adicionadas por agentes diferentes — `Research Index` mantém uma entrada com `agent_who_added` original; `verdict` reflete último update.
- **EC-ACC-10.** `dossier:audit` rodado em projeto que não usa o framework AIOSON (sem `.aioson/context/features.md`) — exit 0 com "no features registered, nothing to audit".
- **EC-ACC-11.** `npm run sync:agents` com paridade igual nos 8 agentes mas template tem mudança não-dossier → roda normalmente; pre-hook só aborta quando workspace tem conteúdo de dossier ausente em template.
- **EC-ACC-12.** Two agentes escrevendo no dossier em paralelo (workflow paralelo via `@orchestrator`) — operações `dossier:add-finding` e `dossier:add-codemap` são atômicas a nível de filesystem (escrita single-pass do markdown). Conflitos detectados por `last_updated_at` mismatch e resolvidos com retry single-write.

## 8. Acceptance criteria

Cada AC verificável independentemente. Bundle de regressão em `tests/agent-chain-continuity.regression.test.js`.

| ID | Descrição | Verificação |
|---|---|---|
| AC-ACC-01 | Auto-init dispara em primeira ativação de agente da cadeia para feature SMALL/MEDIUM sem dossier | Test: criar feature SMALL com PRD, ativar `@product`, verificar `.aioson/context/features/{slug}/dossier.md` existe com schema_version="1.2" |
| AC-ACC-02 | Auto-init NÃO dispara para feature MICRO | Test: criar feature MICRO, ativar agente, verificar dossier NÃO existe |
| AC-ACC-03 | `@sheldon` escreve `Agent Trail` (não `Why`) com sizing+decision+plan_link+research_links+code_findings | Test: sessão simulada `@sheldon`, parsing do dossier confirma entry em `Agent Trail` com 5 elementos |
| AC-ACC-04 | `Research Index` aceita entrada estruturada via `dossier:add-research` e dedupe por slug | Test unitário do command + parser |
| AC-ACC-05 | `handoff-protocol.json.artifact_uris` populado como array de objetos a cada `agent:done` | Test: rodar workflow:next em feature de teste, validar JSON schema dos itens |
| AC-ACC-06 | Backwards compat: handoff-protocol.json com array de strings é lido sem erro | Test: fixtures com formato legado |
| AC-ACC-07 | `feature:close --verdict=PASS` em feature sem dossier auto-roda `dossier:init --from-existing` antes do close | Test: feature sem dossier, rodar feature:close, verificar dossier criado e archived |
| AC-ACC-08 | `feature:close` com EBOOTSTRAPEMPTY cria dossier mínimo, prossegue, registra warning | Test: feature sem artefatos, rodar feature:close, verificar warning emitido |
| AC-ACC-09 | `@dev` em chat novo com feature in_progress emite auto-relato com 4 elementos antes de qualquer prompt do usuário | Test via runtime telemetry: comparar runs `@dev` em features in_progress com summary contendo `feature_slug` + `phase` + `artifacts_consumed_count > 0` |
| AC-ACC-10 | `@dev` detecta drift em path do Code Map e reporta com 3 opções | Test: feature simulada com Code Map, modificar arquivo manualmente, ativar `@dev`, verificar drift report |
| AC-ACC-11 | `@dev` detecta passo do plano já executado/pulado e reporta como drift | Test: feature com plano `@sheldon`, marcar passo como done sem registro, ativar `@dev`, verificar drift report |
| AC-ACC-12 | Drift NÃO é reportado para arquivos fora do Code Map e fora do plano | Test: feature simulada, criar arquivo unrelated no projeto, ativar `@dev`, verificar nenhum drift |
| AC-ACC-13 | Paridade template/workspace para 8 agentes da cadeia | Test: `aioson dossier:audit . --check=template-parity` exit 0; verificar contagens de "## Feature dossier" idênticas |
| AC-ACC-14 | `sync:agents` pre-hook aborta quando workspace tem conteúdo extra | Test: criar drift artificial em `.aioson/agents/product.md`, rodar `npm run sync:agents`, verificar abort com mensagem |
| AC-ACC-15 | `dossier:audit` reporta features `in_progress` SMALL/MEDIUM sem dossier | Test: feature SMALL in_progress sem dossier, rodar audit, verificar relato |
| AC-ACC-16 | Schema v1.2 lê dossiers v1.0 e v1.1 sem erro | Test: fixtures em v1.0 e v1.1, parser v1.2, exit 0 + dados parsed corretamente |
| AC-ACC-17 | 5 runtime events emitidos em `aios.sqlite`: dossier_auto_initialized, feature_close_dossier_synthesized, dev_drift_detected, dev_auto_resume, sync_agents_parity_violation | Test: trigger cada evento, query SQLite, validar registro |

## 9. Out of scope

- **Auto-detecção de gaps por LLM** — invocação reversa permanece manual via `revision:open` (já implementado pela `feature-dossier`).
- **Migração retroativa em massa** de features `done` (cypher-agent, design-governance, pentester-agent, sdlc-process-upgrade, secure-by-default, etc.). Permanecem sem dossier; usuário pode rodar `dossier:init --from-existing` manualmente quando quiser.
- **UI dashboard** para dossier — externo a este projeto.
- **Cross-project handoff** — pausado em `chat-sessions/2026-05-07-sheldon-analysis-falhas-handoff.md`. Próxima feature, depois desta.
- **Brains expansion** para outros agentes (`brains/` continua só com `site-forge`).
- **Schema v2** do `handoff-protocol.json` com `sha256` — deferido. Atual v2 sem hash.
- **`workflow:status` stale state fix** — observado durante este preflight (CLI ainda lista `secure-by-default`). Bug correlato mas distinto. Pode virar feature MICRO separada.

## 10. Classification rationale

| Critério | Pontos | Justificativa |
|---|---|---|
| User types | 0 | Apenas desenvolvedor (1 tipo) |
| External integrations | 0 | Filesystem + SQLite local apenas |
| Business rule complexity | 2 | Auto-init hooks, paridade audit, drift detection scope, contratos por agente, schema bump cross-component |

**Score total: 2 → SMALL** pelo rubric oficial.

**Ajuste para MEDIUM**: pelo escopo cross-cutting (8 prompts de agente + 4 comandos CLI novos/alterados + 1 hook workflow + 1 hook close + paridade template + 17 ACs), `@product` classificou como MEDIUM e `@analyst` concorda — o número de superfícies tocadas justifica `@architect` com decisões formais antes de `@dev` começar.

**Recomendação**: manter MEDIUM. Próximo agente: `@architect`.

## 11. Risks identified

- **R-01.** Auto-init silencioso pode confundir devs novos no projeto: aparecem arquivos sem fonte clara. **Mitigação**: dossier tem `created_by: dossier-init` no frontmatter; `dossier:show` exibe origem.
- **R-02.** Template/workspace paridade audit pode quebrar fluxos existentes (feature-dossier-development, etc.) que dependem de drift temporário entre os dois. **Mitigação**: auditoria roda em `npm run sync:agents` (pré-sync) e em CI opcional, não bloqueia desenvolvimento local.
- **R-03.** `@dev` auto-relato pode ser percebido como "verboso" por usuários acostumados a ativar agente e dar instrução imediata. **Mitigação**: auto-relato é conciso (4 elementos) e termina com "Posso seguir?" — usuário responde em 1 token.
- **R-04.** Drift detection pode gerar false positives quando `@architect` deixou Code Map incompleto. **Mitigação**: granularidade focada em Code Map + plano resolve. Code Map vazio = nenhum drift detectado (graceful degradation).
- **R-05.** `feature:close` auto-init `--from-existing` pode falhar silenciosamente se `--from-existing` tem bug; perde-se a oportunidade de prevenir close sem dossier. **Mitigação**: AC-ACC-08 testa o fallback EBOOTSTRAPEMPTY; runtime event registrado.
- **R-06.** Cross-project handoff (próxima feature) precisará reabrir vários destes ACs em escopo multi-repo. **Mitigação**: requirements explicitam "single-repo apenas"; multi-repo extensions virão como feature separada.

## 12. Pendências para `@architect`

1. **Decisão de local físico do auto-init hook** — opções: (i) dentro de `aioson workflow:next` (mais limpo, single-source), (ii) chamada `aioson dossier:init` injetada no prompt do `@product` (mais simples, mais frágil), (iii) ambos como defesa em profundidade. Recomendação `@analyst`: (i) prefere-se workflow:next, com fallback (ii) para casos onde `@product` ativa fora de `workflow:next`.
2. **Implementação da paridade audit** — dossier:audit precisa comparar conteúdo? só headers? checksum? Nível mínimo: contagem de "## Feature dossier" + checksum do conteúdo da seção.
3. **Estratégia de runtime events** — usar `aioson runtime-log` existente, ou novo namespace de eventos `dossier:*`?
4. **Backwards compat do handoff-protocol** — manter parser dual (string | object) por quanto tempo? Recomendação: indefinidamente; custo é mínimo.
5. **dossier:add-research command interface** — flags: `--slug`, `--research-slug`, `--verdict`, `--why-relevant`. Decisão: passar `--summary-path` explicitamente ou inferir de `researchs/{research-slug}/summary.md`?
6. **Gate semantics no @dev auto-relato** — auto-relato é gate (bloqueia se incompleto)? ou só obrigação observable via telemetry? Recomendação: telemetry-only no MVP; gate é v2.

## 13. Hand-off

Próximo agente: `@architect`. Inputs canônicos:
- Este `requirements-agent-chain-continuity.md`
- `prd-agent-chain-continuity.md`
- `chat-sessions/2026-05-07-product-diagnostico-continuidade-cadeia.md` (contexto histórico, opcional)
- `.aioson/docs/dossier/schema.md` (v1.1 atual)
- `.aioson/docs/dossier/agent-templates.md` (templates atuais a evoluir)
- `src/dossier/`, `src/handoff-contract.js`, `src/commands/feature-close.js`, `src/commands/workflow-next.js`, `package.json#sync:agents`

`@architect` produzirá: `architecture-agent-chain-continuity.md` resolvendo as 6 pendências do § 12 e mapeando arquivos exatos a tocar.
