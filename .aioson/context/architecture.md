---
feature: secure-by-default
classification: MEDIUM
created_at: "2026-04-28T20:58:00-03:00"
gate_design: approved
active_phase: "Phase 4 — Pentester App Target Mode"
phase_gates:
  phase_1_design: approved
  phase_2_design: approved
  phase_3_design: approved
  phase_4_design: approved
sources:
  - .aioson/context/prd-secure-by-default.md
  - .aioson/context/requirements-secure-by-default.md
  - .aioson/context/spec-secure-by-default.md
  - .aioson/context/conformance-secure-by-default.yaml
  - .aioson/plans/secure-by-default/manifest.md
  - .aioson/plans/secure-by-default/plan-security-baseline-contract.md
  - .aioson/plans/secure-by-default/plan-cli-security-scan-audit.md
  - .aioson/plans/secure-by-default/plan-secure-tdd-skill.md
  - researchs/owasp-appsec-baseline-2026/summary.md
  - researchs/tool-first-agent-workflows-2026/summary.md
---

# Architecture — Secure by Default

## 1. Architecture Overview

Esta feature deve adicionar uma camada de segurança transversal sem criar um segundo motor de workflow. A arquitetura correta é governança + contratos verificáveis primeiro: constituição, rule versionada, matriz de controles, sinais de gate e artefatos que downstream agents conseguem consumir sem reler o PRD inteiro.

Phase 1 entrega o contrato. As fases posteriores (`security:scan`, `security:audit`, `secure-tdd`, `app_target` e runtime events) dependem desse contrato para não virarem checklists soltos.

## 2. Non-Negotiable Constraints

- Respeitar o manifesto Sheldon: cinco fases, com Phase 1 como primeiro corte implementável.
- Não redesenhar entidades do `@analyst`; usar `SecurityControl`, `SecurityBaselineRule`, `AttackSurfaceMap`, `SecurityFinding` e `SecurityRuntimeEvent` como contratos lógicos.
- Não implementar CLI scan/audit, secure-tdd ou pentester app_target em Phase 1.
- Não criar agente novo de segurança.
- Não usar `docs/pt/` nem root `plans/` como espaço operacional.
- Manter `.aioson/context/` Markdown-first; YAML/JSON só nas exceções já permitidas.
- Em inception mode, toda mudança distribuída deve considerar `.aioson/` e `template/.aioson/`.

## 3. Phase Architecture

### Phase 1 — Security Baseline Contract

Escopo ativo para `@dev`.

Arquitetura:
- Constituição recebe `Article VII — Zero Trust by Default`, apontando para `.aioson/rules/security-baseline.md`.
- Rule workspace vive em `.aioson/rules/security-baseline.md`.
- Rule distribuída vive em `template/.aioson/rules/security-baseline.md`.
- A rule declara controles `SEC-SBD-01` a `SEC-SBD-08`, política por classificação e evidência esperada.
- `spec-secure-by-default.md` mantém sinais compatíveis: `phase_gates.*` e campos flat `gate_requirements`, `gate_design`.

Decisão: Phase 1 não precisa de novo módulo em `src/`. É uma mudança de governança e template.

### Phase 2 — CLI Security Scan and Audit

Escopo ativo para `@dev` após este Gate B.

**Decisão de layout:** dois commands separados, sem dispatcher. O padrão atual do CLI (`scan-project.js`, `qa-scan.js`, `context-validate.js`) já é "um arquivo por comando", e dispatcher único só agrega indireção sem reduzir duplicação real — `scan` é puramente estático/local, `audit` lê artefatos por slug. Lógica compartilhada vive em `src/lib/security/` apenas quando ≥2 commands consumirem.

**Arquivos da Phase 2:**

```text
src/
  commands/
    security-scan.js              # comando aioson security:scan
    security-audit.js             # comando aioson security:audit
  lib/
    security/
      secrets-regex.js            # catálogo de regex + allowlist de dummies
      findings-writer.js          # writer canônico de security-findings-{slug}.json
      exit-codes.js               # mapeamento determinístico classificação→exit
      artifact-reader.js          # leitor de artefatos por slug para audit
.aioson/
  context/
    security-findings-{slug}.json # exceção machine-readable já permitida
```

Sem novas dependências de runtime. Tudo `node:fs`, `node:child_process` (para `npm audit`), `node:path` — alinhado ao padrão de `scan-project.js`.

**Registro no CLI:** `src/cli.js` recebe duas entradas no mesmo formato dos commands existentes. Sem alteração em `bin/aioson.js`.

#### `security:scan` — contrato

Sintaxe: `aioson security:scan <project-path> [--stage=<analyst|dev|qa|all>] [--format=<json|md>] [--strict]`

Default: `--stage=all`, `--format=json`, sem `--strict`.

Comportamento por stage:
- `analyst`: secrets regex + `.env*` em locais proibidos. Não roda `npm audit` (analyst ainda não tocou em deps).
- `dev`: tudo de `analyst` + `npm audit` quando `package-lock.json` existir + configs públicas óbvias (`.aws/`, `id_rsa*`, `*.pem` versionados).
- `qa`: idêntico a `dev` (espelho — QA confere, não duplica).
- `all`: superconjunto.

Saídas:
- stdout: resumo human-readable (1 linha por finding ou "no findings")
- arquivo: `.aioson/context/security-findings-{slug}.json` quando `--feature={slug}` é passado, OU `.aioson/context/security-findings-project.json` no modo project. Append-or-replace por `finding_id`, nunca duplica.

#### `security:audit` — contrato

Sintaxe: `aioson security:audit <project-path> --slug=<slug> [--format=<json|md>] [--strict]`

Default: `--format=json`, sem `--strict`.

Lê os artefatos do slug:
- `.aioson/context/prd-{slug}.md`
- `.aioson/context/requirements-{slug}.md`
- `.aioson/context/architecture.md`
- `.aioson/context/implementation-plan-{slug}.md`
- `.aioson/context/spec-{slug}.md`
- `.aioson/context/conformance-{slug}.yaml` (se presente)
- `AttackSurfaceMap` extraído de `requirements-{slug}.md` quando presente

Roda heurísticas declarativas (não-LLM) por controle `SEC-SBD-01..08`:
- presença/ausência da seção esperada
- evidência declarada vs N/A rationale
- consistência entre AttackSurfaceMap e controles obrigatórios pela classificação

Saídas idênticas a `scan`, mas o source dos findings é `security-audit`.

#### Exit codes determinísticos

Tabela única em `src/lib/security/exit-codes.js`:

| Code | Significado | Quando |
|---|---|---|
| 0 | pass | nenhum finding ou apenas advisory/low/medium em política não-bloqueante |
| 0 | pass-with-notes | findings medium/low presentes mas classificação é MICRO ou SMALL non-blocking |
| 10 | blocking-findings | High/Critical em MEDIUM, ou qualquer finding com `--strict` |
| 11 | inconclusive | `npm audit` falhou por rede, ou artefato ausente em audit (não falsifica pass) |
| 12 | bad-input | slug inexistente, project path inválido, flags conflitantes |
| 13 | contract-violation | tentativa de criar arquivo proibido, frontmatter quebrado em rule, etc. |

Política por classificação consumindo a tabela:
- MICRO: `--strict` desligado por default; só code 0/12/13 possível para o usuário comum.
- SMALL: scan rodando após `@dev` retorna 0 ou 11 (nunca bloqueia por default); audit é opt-in.
- MEDIUM: scan retorna 0/10/11/12/13; audit retorna 0/10/11/12/13. Code 10 bloqueia `aioson workflow:next --complete=qa`.

#### Schema de `security-findings-{slug}.json`

Contrato canônico (writer em `findings-writer.js`):

```json
{
  "schema_version": "1.0.0",
  "slug": "secure-by-default",
  "generated_at": "2026-04-28T22:00:00-03:00",
  "generator": "aioson security:scan@1.0.0",
  "review_contract": {
    "scope_mode": "feature",
    "evidence_policy": "high_critical_require_reproduction",
    "findings_artifact_path": ".aioson/context/security-findings-secure-by-default.json"
  },
  "summary": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "inconclusive": 0
  },
  "findings": [
    {
      "finding_id": "SCAN-secrets-001",
      "source": "security-scan",
      "control_id": "SEC-SBD-05",
      "severity": "critical",
      "status": "open",
      "scope": "src/config/keys.js:14",
      "affected_artifacts": ["src/config/keys.js"],
      "preconditions": ["File is staged or committed"],
      "reproduction_steps": ["grep -nE 'sk_live_[A-Za-z0-9]{24,}' src/config/keys.js"],
      "evidence": ["Match at src/config/keys.js:14 column 11"],
      "impact": "Production Stripe key exposed in workspace.",
      "suggested_fix": "Move to env var; rotate key; add to .gitignore.",
      "recommended_owner": "dev",
      "recommended_gate_status": "block",
      "safe_to_reproduce": true
    }
  ]
}
```

Notas de schema:
- `schema_version` permite evolução futura sem quebrar @qa.
- `review_contract` é o bloco que `@qa` lê por contrato (compatível com `qa.md` § Security findings integration).
- `findings[].status` aceita `open`, `needs_validation`, `fixed`, `accepted`, `false_positive` (consistente com `SecurityFinding` em requirements).
- `recommended_gate_status` ∈ {`block`, `review`, `note`} — mapeia direto para a decisão de Gate D em `@qa`.
- Findings de scan automatizado **sempre** têm `safe_to_reproduce: true`; pentester pode marcar `false` em Phase 4.

#### Catálogo de regex de secrets

Vive em `src/lib/security/secrets-regex.js` como objeto exportado, não YAML/JSON externo (sem novo formato a manter). Cada padrão tem:

```js
{ id, name, pattern, severity, control: 'SEC-SBD-05', allow_examples }
```

`allow_examples` é uma lista de substrings que, se presentes na linha, marcam como dummy (e.g. `EXAMPLE`, `dummy`, `xxxxxxxx`, valores em `.env.example`). Allowlist conservadora — falso negativo > falso positivo só quando o marcador é explícito.

Conjunto inicial mínimo: AWS access key, Stripe live, OpenAI/Anthropic API key, generic `password=`, `private_key`, RSA/SSH key headers, `.env*` value lines com ≥20 chars.

#### `npm audit` integration

`security-scan.js` invoca `npm audit --json --omit=dev` via `child_process.spawnSync` apenas quando:
- stage ∈ {`dev`, `qa`, `all`}
- `package-lock.json` ou `npm-shrinkwrap.json` existe na raiz

Falha de rede (`spawn` retorna não-zero com stderr contendo `network` / `ENOTFOUND` / `ETIMEDOUT`) → emite finding `INCONCLUSIVE` com `severity: inconclusive`, `recommended_gate_status: review`, e o exit code agrega para 11. Nunca mascara como pass, nunca bloqueia silenciosamente.

#### Fallback sem CLI (modo direct LLM)

Já documentado na rule (`security-baseline.md` § Direct LLM mode). Phase 2 não duplica: agentes em modo direct usam o checklist da rule e registram limitação no devlog. Os commands `security:*` simplesmente não rodam — não há shim/mock.

#### Comportamento append-or-replace dos findings

Writer mantém findings existentes do mesmo slug, identifica match por `finding_id` (composto: `{source}-{control_id}-{hash6(scope)}`), atualiza in-place, marca `status: fixed` os que sumiram. Nunca apaga histórico — `status: fixed` permanece para auditoria. Limite de 500 findings por arquivo; acima disso retorna code 13 (contract-violation) pedindo split por escopo.

#### Não-objetivos de Phase 2

- Sem alteração de história git (AC-SBD-2.7).
- Sem auto-fix.
- Sem `app_target` mode (Phase 4).
- Sem runtime events (Phase 5).
- Sem skill `secure-tdd` (Phase 3).
- Sem novo agente.
- Sem hooks automáticos `.claude/settings.json` — invocação fica explícita (CLI ou agent prompt).

### Phase 3 — Secure TDD Skill

Escopo ativo para `@dev` após este Gate B.

**Decisão de layout:** `secure-tdd` é uma process skill de escopo técnico, não um design skill nem doc avulsa. Ela deve seguir o mesmo contrato estrutural já usado por `aioson-spec-driven`: um `SKILL.md` curto como entrypoint e um diretório `references/` carregado sob demanda. Não criar árvore profunda nem biblioteca de prompts longa.

**Arquivos da Phase 3:**

```text
.aioson/
  skills/
    process/
      secure-tdd/
        SKILL.md
        references/
          node-express.md
          nextjs.md
          planned-stacks.md

template/
  .aioson/
    skills/
      process/
        secure-tdd/
          SKILL.md
          references/
            node-express.md
            nextjs.md
            planned-stacks.md
```

**Racional de estrutura:**
- `SKILL.md` define quando carregar, profundidade por classificação e o loop adversarial.
- `references/node-express.md` e `references/nextjs.md` cobrem os dois templates exigidos no v1.
- `references/planned-stacks.md` registra Laravel/Pest, Django, Rails e FastAPI como referências planejadas/minimais, sem bloquear v1 nem forçar quatro arquivos extras antes de uso real.
- Skill processual precisa existir no workspace e no template, porque projetos novos devem recebê-la via `aioson setup .`.

#### Contrato de carregamento

Ordem obrigatória para sessões de implementação:
1. `@dev` carrega `aioson-spec-driven` primeiro quando houver trabalho spec-driven.
2. `secure-tdd` é carregada **depois**, como skill complementar, nunca substituta.
3. Carregar só quando a classificação e a superfície justificarem:
   - **MEDIUM:** obrigatório quando `requirements-{slug}.md` ou `Attack Surface Map` indicarem auth, ownership, money, uploads, external URLs, secrets/credentials ou storage boundaries sensíveis.
   - **SMALL:** opcional/reduzido quando a feature tocar essas superfícies, sem tornar TDD adversarial bloqueante por padrão.
   - **MICRO:** nunca auto-carregar.
4. Após abrir `SKILL.md`, `@dev` deve carregar só a referência do stack alvo (`node-express.md` ou `nextjs.md`) e, se necessário, consultar `planned-stacks.md` para fallback/documentação de escopo.

**Integrações obrigatórias:**
- `template/.aioson/agents/dev.md` e `.aioson/agents/dev.md` devem ganhar uma regra explícita de carregamento de `secure-tdd` para MEDIUM com superfície sensível.
- `@deyvin` pode ler `secure-tdd` apenas em sessões de continuidade com slice pequeno e já validado; não usar isso para burlar workflow oficial em features novas.
- Não alterar `@qa` nem `@pentester` nesta fase; QA só validará que a skill existe, é carregável e não compete com `aioson-spec-driven`.

#### Contrato funcional da skill

`SKILL.md` deve ensinar um ciclo curto e executável:
1. Ler `requirements-{slug}.md`, `spec-{slug}.md`, `architecture.md` e a referência de stack relevante.
2. Identificar a superfície sensível aplicável.
3. Escrever primeiro os testes adversariais mínimos.
4. Só depois implementar o código de produção.
5. Reexecutar os testes e registrar no `spec-{slug}.md` quais ataques passaram a ser cobertos.

Os ataques mínimos cobertos pela skill devem mapear diretamente para os controles do baseline:
- `SEC-SBD-01`: input limits e validação server-side
- `SEC-SBD-02`: upload validation / signature / MIME distrust
- `SEC-SBD-03`: IDOR / ownership / auth bypass
- `SEC-SBD-04`: race condition / atomicidade / double-submit
- `SEC-SBD-06`: external URL sanitization
- `SEC-SBD-08`: auth enumeration / rate limiting

`SEC-SBD-05` (secrets) continua principalmente tool-first via `security:scan`; a skill pode citá-lo como regra de implementação, mas não precisa transformá-lo em suite longa de testes.

#### Templates por stack

**Node/Express (`references/node-express.md`):**
- Padrão preferido: `node:test` + `supertest` se o projeto já usa HTTP app; se for serviço/CLI Node sem Express, adaptar os testes para boundary functions com `node:test`.
- Casos mínimos: unauthorized access, cross-user resource access, invalid payload beyond server limit, unsafe external URL, concurrent mutation/race scenario when applicable.

**Next.js (`references/nextjs.md`):**
- Padrão preferido: Vitest + Testing Library + server action / route handler assertions.
- Casos mínimos: auth bypass em route handler, server-side validation independent of UI, forged payload, unsafe redirect/external URL, optimistic UI not trusted as source of truth.

**Planned stacks (`references/planned-stacks.md`):**
- Laravel/Pest, Django/Pytest, Rails/RSpec e FastAPI/Pytest entram como referências mínimas/planned, com:
  - padrão de runner esperado
  - lista de ataques a cobrir
  - nota explícita de que templates completos ficam para expansão futura

#### Não-objetivos da Phase 3

- Não criar comando CLI novo.
- Não invocar `@pentester`.
- Não emitir runtime events.
- Não auto-gerar código de produção.
- Não duplicar conteúdo de `security-baseline.md`; a skill referencia controles por ID.
- Não virar biblioteca genérica de segurança: foco em testes adversariais concretos antes do código.

### Phase 4 — Pentester App Target Mode

Escopo ativo para `@dev` apos este Gate B.

**Decisao de integracao:** Phase 4 nao cria um segundo schema de findings nem um segundo motor de execucao. O modo `app_target` reutiliza o envelope canonico de `.aioson/context/security-findings-{slug}.json` ja consolidado pela feature `pentester-agent` e pela Phase 2 desta feature. A separacao entre framework e app acontece por **target mode** e **surface types**, nao por arquivo novo.

**Arquivos da Phase 4:**

```text
.aioson/
  agents/
    pentester.md
    manifests/
      pentester.manifest.json

template/
  .aioson/
    agents/
      pentester.md
      manifests/
        pentester.manifest.json

src/
  commands/
    agents.js                    # thin wrapper / routing for invoke path, if needed
  cli.js                         # alias registration only if invoke path is added

.aioson/
  context/
    security-findings-{slug}.json
```

**Target-mode contract**

`@pentester` passa a operar com dois modos mutuamente exclusivos:

- `framework_target` — comportamento atual do `pentester-agent`; surfaces internas do AIOSON (`memory_context`, `tool_invocation`, `delegation_handoff`, `protocol_contract`, `secret_handling`, `runtime_permissions`).
- `app_target` — novo comportamento desta fase; surfaces do app gerado ou da feature em review.

Regra obrigatoria:
- `app_target` **nao** carrega surfaces de framework por default.
- Surfaces `framework_target` so entram quando a propria feature tocar runtime AIOSON, handoff, autonomia, installer/update, ou outro boundary interno do framework. Nesse caso, a surface extra deve ser marcada explicitamente como `cross_scope_reason`, nunca misturada silenciosamente.

**App-target surface catalog (v1)**

Cada threat surface de `app_target` deve usar `surface_type` explicito e rastreavel:

| Surface type | Maps to | Trigger |
|---|---|---|
| `app_target_ownership_idor` | A01 | ownership, per-user resources, tenant boundaries |
| `app_target_secrets_crypto` | A02 | secrets, credentials, password/token handling, crypto material |
| `app_target_injection_xss` | A03 | query building, rendered HTML, template output, unsanitized payloads |
| `app_target_insecure_design_race` | A04 | money, quotas, double-submit, enumeration, critical mutable state |
| `app_target_auth_rate_limit` | A07 | login, signup, reset, OTP, auth-adjacent endpoints |

Todas as surfaces nao aplicaveis devem continuar indo para `threat_surfaces[]` com `verification_status: not_applicable` e `skip_reason` obrigatorio.

**Invocation contract**

O PRD pede `aioson agent:invoke pentester --slug=<slug> --scope=<area> --mode=app_target`. Como o core hoje ja tem `agent:prompt` e `@pentester` como stage oficial do workflow, a implementacao deve ser o menor delta possivel:

1. Adicionar `agent:invoke` apenas como **thin alias** no CLI.
2. O alias deve delegar para o mesmo pipeline de prompt/runtime ja usado por `agent:prompt`.
3. Nao criar executor paralelo, daemon dedicado, nem command tree nova para pentest.

Contrato minimo do alias:

```bash
aioson agent:invoke pentester . --feature=<slug> --scope=<area> --mode=app_target
```

Semantica:
- `--feature=<slug>` e obrigatorio em `app_target`.
- `--scope=<area>` e obrigatorio para on-demand invocation; no stage oficial do workflow, o escopo pode vir do findings artifact ou do `AttackSurfaceMap`.
- `--mode=app_target` seleciona o surface catalog acima.
- `--mode=framework_target` preserva o comportamento legado do `pentester-agent`.

Se o alias aumentar demais o escopo, `@dev` deve implementar primeiro o suporte a `--mode` e `--scope` no prompt/manifest e deixar `agent:invoke` como wrapper fino sobre `agent:prompt` na mesma PR.

**Findings envelope contract**

Phase 4 preserva o envelope atual e adiciona apenas campos necessarios ao modo `app_target`:

```json
{
  "version": 1,
  "feature_slug": "secure-by-default",
  "generated_at": "2026-04-29T00:00:00Z",
  "review_contract": {
    "review_id": "pentester-secure-by-default-<timestamp>",
    "scope_mode": "phase_review | on_demand",
    "runtime_mode": "local_static | local_runtime | fixture_based",
    "target_mode": "framework_target | app_target",
    "target_scope": "refund-flow",
    "allowed_targets": [],
    "forbidden_targets": [],
    "attack_surfaces": [],
    "evidence_policy": "safe-proof-only",
    "findings_artifact_path": ".aioson/context/security-findings-secure-by-default.json"
  },
  "threat_surfaces": [],
  "findings": []
}
```

Decisoes:
- `target_mode` e `target_scope` vivem em `review_contract`, nao em arquivo separado.
- O finding individual continua compativel com o schema atual, mas `attack_path` passa a ser **obrigatorio** para findings `app_target` de severidade `high` ou `critical`.
- `affected_artifacts` continua apontando apenas para paths reais do workspace.
- `recommended_gate_status` continua `block|review|note`; nenhum remapeamento novo.

**Finding rules for app_target**

- `high` e `critical` em `app_target` exigem `attack_path`, `preconditions`, `reproduction_steps`, `evidence`, `impact`, `affected_artifacts`, `suggested_fix`, `safe_to_reproduce=true`.
- Se faltar qualquer um desses campos, o finding vira `needs_validation` e nao pode nascer como blocker silencioso.
- `recommended_owner` continua nunca sendo `pentester`.
- Auto-fix continua proibido.

**QA trigger contract**

`@qa` pode acionar `app_target` quando ocorrer pelo menos um:

- `AttackSurfaceMap.pentester_trigger = required`
- feature toca auth, money, ownership, uploads ou external URLs e o `security:audit` retornou `review`/`block`
- heuristica do `@qa` encontrou race, IDOR, enumeration, injection ou boundary inconsistente

`@qa` pode pular a invocacao quando:

- `security:audit` voltou limpo
- o `AttackSurfaceMap` marcou a surface como N/A para esta feature
- o risco e apenas advisory/MICRO sem surface sensivel real

Quando a invocacao for pulada, o rationale deve ficar em `spec-{slug}.md`.

**Nao-objetivos da Phase 4**

- nao criar `pentest:*` command family
- nao mover Gate D para `@pentester`
- nao criar artifacto markdown novo como fonte de verdade
- nao emitir runtime events de seguranca (Phase 5)
- nao reabrir `security:scan`, `security:audit` ou `secure-tdd`

### Phase 5 — QA Gates and Runtime Events

Design reservado para fase posterior.

Arquitetura esperada:
- `@qa` consome `security-findings-{slug}.json`, conformance YAML e runtime events.
- Eventos ficam no runtime existente, não em snippets paralelos.
- Fallback sem CLI registra limitação no relatório, não telemetria falsa.

## 4. Folder and Module Structure

Phase 1:

```text
.aioson/
  constitution.md
  rules/
    security-baseline.md          # novo
  context/
    architecture.md
    conformance-secure-by-default.yaml
    requirements-secure-by-default.md
    spec-secure-by-default.md

template/
  .aioson/
    constitution.md
    rules/
      security-baseline.md        # novo
```

Fases posteriores:

```text
src/
  commands/
    security-scan.js              # Phase 2
    security-audit.js             # Phase 2
  lib/
    security/                     # criar apenas quando houver lógica reutilizável

.aioson/
  skills/process/
    secure-tdd/
      SKILL.md                    # Phase 3
      references/
        node-express.md
        nextjs.md
        planned-stacks.md
  agents/
    pentester.md                  # Phase 4
    manifests/
      pentester.manifest.json     # Phase 4: target-mode contract
    qa.md                         # Phase 5
  context/
    security-findings-{slug}.json # Phase 4/5, exceção permitida
```

Governança aplicada: kebab-case para novos arquivos, sem pastas genéricas, sem criar pasta de um único arquivo exceto quando o diretório é contrato de skill.

## 5. Models and Relationships

Não há modelos de banco novos na Phase 1.

Contratos lógicos:
- `SecurityBaselineRule` contém muitos `SecurityControl`.
- `SecurityControl` é referenciado por requirements, arquitetura, skill, audit e QA.
- `AttackSurfaceMap` é produzido por `@analyst` em features futuras e aponta para controles relevantes.
- `SecurityFinding` é produzido por scan/audit/pentester em fases posteriores e referencia controles.
- `SecurityRuntimeEvent` mede adoção e bloqueios em fases posteriores.
- `review_contract.target_mode` decide se o finding nasceu de `framework_target` ou `app_target`.
- `review_contract.target_scope` delimita a area investigada em `app_target` sem criar segundo artifact.

## 6. Security Control Contract

Formato arquitetural mínimo para cada controle dentro de `security-baseline.md`:

```markdown
### SEC-SBD-01 — Server-side input limits

- Maps to: OWASP A03/A04
- Default severity: high
- Applies to: analyst, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking when applicable
- Required evidence: field limits, negative tests, audit pass or N/A rationale
```

Controles obrigatórios:
- `SEC-SBD-01`: Server-side input limits.
- `SEC-SBD-02`: Upload file signature validation.
- `SEC-SBD-03`: Ownership/IDOR authorization.
- `SEC-SBD-04`: Atomic critical state changes.
- `SEC-SBD-05`: Secrets outside code.
- `SEC-SBD-06`: External URL sanitization.
- `SEC-SBD-07`: Storage default-deny/RLS boundary.
- `SEC-SBD-08`: Auth enumeration/rate limiting.

Arquitetura de severidade:
- `critical`: ownership bypass, financial race, committed production secret.
- `high`: missing server-side validation, unsafe upload validation, missing rate limit on sensitive endpoint.
- `medium`: external URL sanitization, low-impact tracker or storage abuse surface.
- `advisory`: MICRO or non-applicable surfaces with explicit N/A rationale.

## 7. Integration Architecture

### Constitution integration

Atualizar `.aioson/constitution.md` e `template/.aioson/constitution.md`.

Regra:
- Append only. Não renumerar Article I-VI.
- `last_amended` deve ser atualizado.
- O artigo deve apontar para `.aioson/rules/security-baseline.md`, não duplicar a matriz inteira.

### Rule loading integration

`security-baseline.md` deve usar frontmatter:

```yaml
---
name: security-baseline
description: Secure by Default baseline controls for technical agents
priority: 10
version: 1.0.0
agents: [analyst, architect, dev, qa]
---
```

Racional: o loader atual já lê rules por frontmatter. Não é necessário alterar o loader na Phase 1.

### Template integration

Como este repositório é o core AIOSON, a rule precisa existir no workspace ativo e no template. Após implementação, `npm run sync:agents` não sincroniza rules; `@dev` deve verificar se há comando específico para templates/rules ou editar ambos os caminhos.

## 8. Cross-Cutting Concerns

### Validation

`@qa` deve validar a fase ativa por arquivo e contrato:
- `@pentester` distingue `framework_target` de `app_target`.
- `app_target` usa apenas o surface catalog explicito da fase, salvo `cross_scope_reason`.
- O findings artifact continua unico e valido.
- Findings `high`/`critical` de `app_target` carregam `attack_path` e `safe_to_reproduce=true`.
- `@qa` continua sendo o owner final do Gate D.

### Error handling

Se `--feature` ou `--scope` faltarem no caminho on-demand de `app_target`, a invocacao deve falhar cedo com erro de input, nunca cair silenciosamente para `framework_target`.

### Observability

Nao emitir novos runtime events nesta fase. Eventos `security_*` continuam deferidos para Phase 5.

### Backward compatibility

`framework_target` deve continuar funcionando sem alterar as surfaces do feature `pentester-agent`. `app_target` entra como extensao compatível, nunca como substituicao do comportamento anterior.

### Security

`app_target` continua local/controlado. Nenhum target externo, nenhuma API publica, nenhum destructive action fora de fixture.

## 9. Implementation Sequence for @dev

### Phase 1 (done — QA approved 2026-04-28)

1. Ler `requirements-secure-by-default.md`, `conformance-secure-by-default.yaml`, este `architecture.md` e `plan-security-baseline-contract.md`.
2. Atualizar `.aioson/constitution.md` appendando Article VII e `last_amended`.
3. Atualizar `template/.aioson/constitution.md` com o mesmo Article VII.
4. Criar `.aioson/rules/security-baseline.md`.
5. Criar `template/.aioson/rules/security-baseline.md`.
6. Garantir que os dois rule files tenham frontmatter idêntico.
7. Escrever controles `SEC-SBD-01` a `SEC-SBD-08` com metadata mínima.
8. Documentar política de classificação e fallback sem CLI.
9. Rodar validação textual simples com `rg` e testes existentes relevantes.
10. Não implementar comandos `security:*` nesta fase.

### Phase 2 (ativo após Gate B desta rev)

1. Ler `plan-cli-security-scan-audit.md` e a seção `## 3. Phase 2 — CLI Security Scan and Audit` deste `architecture.md`.
2. Criar `src/lib/security/exit-codes.js` com a tabela canônica (constantes nomeadas; sem números mágicos espalhados).
3. Criar `src/lib/security/secrets-regex.js` com o conjunto inicial mínimo + `allow_examples`.
4. Criar `src/lib/security/findings-writer.js` (read-merge-write atômico, `finding_id` determinístico, append-or-replace).
5. Criar `src/lib/security/artifact-reader.js` (lê os artefatos do slug; retorna shape estruturado; nunca executa código).
6. Criar `src/commands/security-scan.js` consumindo as três libs acima e invocando `npm audit` via `child_process.spawnSync` quando aplicável.
7. Criar `src/commands/security-audit.js` consumindo `artifact-reader` e `findings-writer`.
8. Registrar ambos os commands em `src/cli.js` no padrão dos commands existentes (sem alterar `bin/aioson.js`).
9. Escrever testes node:test cobrindo: exit code por classificação, allowlist de dummy secrets, npm-audit-network-failure → inconclusive, append-or-replace, slug inexistente → exit 12, finding count > 500 → exit 13.
10. Rodar `npm test` e fixar falhas antes de marcar done.
11. Atualizar `spec-secure-by-default.md` com decisões da Phase 2: schema_version do findings, exit codes e qualquer adaptação ao layout final.
12. Não implementar `app_target`, `secure-tdd`, runtime events, hooks `.claude/settings.json`, nem alterar `pentester.md` — escopo de Phases 3/4/5.

### Phase 3 (ativo após Gate B desta rev)

1. Ler `plan-secure-tdd-skill.md` e a seção `## 3. Phase 3 — Secure TDD Skill` deste `architecture.md`.
2. Criar `.aioson/skills/process/secure-tdd/SKILL.md` com:
   - gatilhos de carregamento por classificação
   - loop adversarial curto
   - regra explícita de "server-side is the authority"
   - mapeamento para `SEC-SBD-*` relevantes
3. Criar `references/node-express.md` com templates mínimos executáveis.
4. Criar `references/nextjs.md` com templates mínimos executáveis.
5. Criar `references/planned-stacks.md` registrando Laravel/Pest, Django, Rails e FastAPI como planned/minimal references.
6. Propagar a mesma árvore para `template/.aioson/skills/process/secure-tdd/`.
7. Atualizar `.aioson/agents/dev.md` e `template/.aioson/agents/dev.md` para carregar `secure-tdd` depois de `aioson-spec-driven` quando a feature for MEDIUM com superfície sensível.
8. Se houver ajuste em `@deyvin`, mantê-lo opcional e estritamente de continuidade; não transformar `@deyvin` em rota principal de features novas.
9. Validar com checagens textuais/contratuais:
   - arquivos existem nos dois caminhos
   - `SKILL.md` menciona ordem de carregamento e classificação
   - refs Node/Next.js existem
   - stacks planejados aparecem sem bloquear v1
10. Atualizar `spec-secure-by-default.md` com as decisões da Phase 3 e os gatilhos de carregamento definidos.

### Phase 4 (ativo apos Gate B desta rev)

1. Ler `plan-pentester-app-target.md`, `architecture.md` § Phase 4 e os contratos existentes de `@pentester`.
2. Atualizar `.aioson/agents/pentester.md` e `template/.aioson/agents/pentester.md` para suportar `target_mode=framework_target|app_target`.
3. Manter o schema de findings existente; adicionar `target_mode` e `target_scope` apenas no `review_contract`.
4. Introduzir o catalogo de surfaces `app_target_*` no prompt do `@pentester`, separado das surfaces de framework.
5. Tornar `attack_path` obrigatorio para findings `app_target` `high`/`critical`.
6. Atualizar `.aioson/agents/manifests/pentester.manifest.json` e template correspondente para declarar `framework_target` e `app_target` como activation modes aceitos.
7. Se necessario, adicionar `agent:invoke` como alias fino em `src/cli.js` / `src/commands/agents.js`, reutilizando `agent:prompt` e o runtime atual.
8. Nao criar novo executor, novo artifacto de findings, nem nova familia `pentest:*`.
9. Adicionar testes cobrindo:
   - separacao entre `framework_target` e `app_target`
   - `app_target` sem `--feature` ou `--scope` falha cedo
   - findings `high`/`critical` sem `attack_path` viram `needs_validation`
   - artifacto continua valido para `@qa` / `handoff-contract`
10. Atualizar `spec-secure-by-default.md` com as decisoes da Phase 4 e os triggers finais do `@qa`.

## 10. QA Verification Plan

### Phase 1 (executada — verdict PASS)

`@qa` verificou:
- `AC-SBD-001` a `AC-SBD-014` em `conformance-secure-by-default.yaml`.
- Article VII é append-only e não renumera artigos existentes.
- Rule frontmatter não inclui agentes fora de `analyst`, `architect`, `dev`, `qa`.
- Controles obrigatórios existem por ID.
- Nenhum arquivo não permitido foi criado em `.aioson/context/`.
- Phase 1 não introduziu alterações em `src/` sem necessidade.

### Phase 2 (a executar após @dev concluir)

`@qa` deve verificar contra `plan-cli-security-scan-audit.md`:
- AC-SBD-2.1: `aioson security:scan . --stage=analyst` retorna exit code 0 com stdout determinístico em projeto limpo.
- AC-SBD-2.2: `--stage=dev` detecta secret real (fixture com Stripe live key dummy fora da allowlist), `.env.local` em local proibido e `npm audit` advisory de pacote vulnerável simulado.
- AC-SBD-2.3: `aioson security:audit . --slug=<slug>` lê os 5 artefatos canônicos e produz JSON conformante ao schema.
- AC-SBD-2.4: Finding High/Critical em projeto MEDIUM retorna exit 10; em MICRO retorna exit 0 com nota (advisory).
- AC-SBD-2.5: Política por classificação respeita Phase 1 — MICRO nunca bloqueia, SMALL roda scan sem bloquear, MEDIUM bloqueia em High/Critical.
- AC-SBD-2.6: Em modo direct LLM (CLI ausente simulado), agente segue checklist da rule e devlog registra limitação — sem falsificar findings.
- AC-SBD-2.7: Comandos não rodam `git rebase`, `git filter-branch`, `git push`, nem alteram `.git/`. Verificar via auditoria do código + teste com working tree dirty antes/depois.
- Schema: `security-findings-{slug}.json` valida contra o contrato `review_contract` (scope_mode, evidence_policy, findings_artifact_path presentes).
- Determinismo: rodar mesmo input duas vezes produz JSON byte-identical exceto `generated_at` (estável modulo timestamp).
- Idempotência: `append-or-replace` não duplica findings entre execuções consecutivas.
- Fixtures: `tests/fixtures/security/` deve incluir cenário com dummy secret na allowlist (deve ser ignorado), secret real (deve ser detectado), feature sem superfície sensível (audit retorna 0).

### Phase 3 (a executar após @dev concluir)

`@qa` deve verificar contra `plan-secure-tdd-skill.md`:
- AC-SBD-3.1: `secure-tdd/SKILL.md` existe e descreve um ciclo TDD adversarial em passos claros.
- AC-SBD-3.2: `references/node-express.md` e `references/nextjs.md` existem e contêm templates mínimos concretos.
- AC-SBD-3.3: Laravel/Pest, Django, Rails e FastAPI aparecem como referências planejadas/minimais em `planned-stacks.md`, sem bloquear v1.
- AC-SBD-3.4: skill diz explicitamente que frontend nunca é autoridade de validação.
- AC-SBD-3.5: skill cobre IDOR, race condition, auth bypass, input limits, upload validation e external URL sanitization.
- AC-SBD-3.6: `@dev` prompt/template carrega `secure-tdd` como complemento a `aioson-spec-driven`, não substituição.
- Verificar que a skill não cria execução fora do workflow e não tenta invocar `@pentester` ou runtime por conta própria.

### Phase 4 (a executar apos @dev concluir)

`@qa` deve verificar contra `plan-pentester-app-target.md`:
- AC-SBD-4.1: `app_target` tem surfaces explicitas A01/A02/A03/A04/A07 via `surface_type` dedicados.
- AC-SBD-4.2: `app_target` nao mistura `memory_context`, `tool_invocation`, `delegation_handoff`, `protocol_contract`, `secret_handling` ou `runtime_permissions` sem `cross_scope_reason`.
- AC-SBD-4.3: findings incluem `severity`, `affected_artifacts`, `attack_path`, `preconditions`, `reproduction_steps`, `evidence`, `impact`, `suggested_fix` e `recommended_gate_status`.
- AC-SBD-4.4: `@pentester` nao aplica auto-fix nem altera ownership do finding.
- AC-SBD-4.5: `@qa` consegue pular a invocacao com rationale quando nao ha superficie sensivel.
- AC-SBD-4.6: `.aioson/context/security-findings-{slug}.json` continua sendo a unica fonte de verdade e permanece valida para `@qa` e `handoff-contract`.

## 11. Explicit Non-Goals and Deferred Items

- Skill `secure-tdd`: Phase 3.
- `@pentester app_target` e `attack_path` em findings: Phase 4.
- Runtime events `security_*` e Gate D blocking automation: Phase 5.
- Hooks automáticos `.claude/settings.json`: deferido para Phase 5 (default preferido é CLI workflow-portable, não hook por cliente).
- Web3/dapp security surfaces: v2.
- Honeypots/jump scares/deception: fora do MVP.
- Auto-fix de findings: fora do MVP.
- Substituição de `npm audit` por scanner próprio: fora do MVP — usar a ferramenta nativa.
- LLM dentro de `security:scan` ou `security:audit`: explicitamente proibido (decisão `tool-first` do PRD; preserva custo zero de tokens).

## 12. Handoff

### Phase 1 → @qa
`@qa` aprovou Phase 1 em 2026-04-28 (PASS, 0 Critical/High, 2 Low aceitos como residuais).

### Phase 2 → @dev
`@dev` pode implementar Phase 2 sem tomar decisões de produto adicionais. Decisões arquiteturais já fixadas neste documento:
- Layout: 2 commands + lib compartilhada em `src/lib/security/`.
- Schema canônico de findings (versão 1.0.0).
- Exit codes 0/10/11/12/13.
- Allowlist de dummies via marcadores explícitos.
- `npm audit` opcional, falha de rede vira inconclusive.
- Sem alteração de história git.

Se `@dev` encontrar caso que a tabela de exit codes não cobre, retornar 11 (inconclusive) e documentar no spec — **nunca** inventar exit code novo sem revisar este architecture.md.

### Phase 3 → @dev
`@dev` pode implementar Phase 3 sem reabrir produto ou requirements. Decisões arquiteturais já fixadas neste documento:
- `secure-tdd` é uma process skill em `.aioson/skills/process/secure-tdd/`, com espelho no template.
- Entry point curto em `SKILL.md`; exemplos de stack em `references/`.
- Node/Express e Next.js são os únicos templates completos exigidos no v1.
- Laravel/Pest, Django, Rails e FastAPI entram como planned/minimal references, não blockers.
- Ordem de carregamento: `aioson-spec-driven` primeiro, `secure-tdd` depois, só quando classificação/superfície justificarem.
- A skill complementa `security:scan`; não substitui scan, audit, pentester ou runtime.

### Phase 4 → @dev
`@dev` pode implementar Phase 4 sem reabrir produto ou requirements. Decisoes arquiteturais ja fixadas neste documento:
- `app_target` reutiliza o envelope atual de `security-findings-{slug}.json`; nao existe segundo schema.
- A separacao `framework_target` vs `app_target` e feita por `review_contract.target_mode` e por `surface_type`, nunca por arquivo novo.
- `app_target` usa cinco surfaces dedicadas: ownership/IDOR, secrets/crypto, injection/XSS, insecure design/race/enumeration, auth/rate limiting.
- Findings `app_target` `high`/`critical` exigem `attack_path` + evidencia segura completa; sem isso viram `needs_validation`.
- `agent:invoke` deve ser implementado, se necessario, como wrapper fino sobre `agent:prompt` e o runtime atual.
- `@qa` continua sendo o gate owner; `@pentester` detecta e persiste, mas nao fecha finding nem aplica auto-fix.

> **Gate B (Phase 1):** Architecture approved — @dev can proceed.
> **Gate B (Phase 2):** Architecture approved — @dev can proceed.
> **Gate B (Phase 3):** Architecture approved — @dev can proceed.
> **Gate B (Phase 4):** Architecture approved — @dev can proceed.

---

# Feature Architecture — Quality Governance Baseline and New Regression Gate

## 1. Architecture Overview

This SMALL feature adds one experimental CLI command, `quality:audit`, backed by an AIOSON-owned result contract. The implementation must keep provider-specific details behind a narrow adapter boundary, write workflow evidence as Markdown, and gate only confirmed new regressions in changed code.

## 2. Folder and Module Structure

```text
src/
  commands/
    quality-audit.js
  lib/
    quality/
      result-contract.js
      provider-adapter.js
      baseline-comparison.js
      report-writer.js
tests/
  quality-audit.test.js
  fixtures/
    quality/
```

Keep `src/commands/quality-audit.js` as orchestration only. Reusable normalization, comparison, and report generation logic belongs in `src/lib/quality/` because each part has independent tests and a distinct responsibility.

## 3. Models and Relationships

No database entities are introduced. Logical contracts are:
- `QualityAuditResult` contains provider metadata, changed-file scope, baseline reference, findings, summary, and advisory messages.
- `QualityFinding` is normalized from provider/governance/adapter sources and classified as `baseline`, `new`, or `unknown`.
- `QualityReportArtifact` is the Markdown evidence written to `.aioson/context/quality-report-{slug}.md`.

## 4. Integration Architecture

`quality:audit` reads project context, git/changed-file scope, optional baseline data, local/configured provider output, and applicable governance sources. It must not auto-install Fallow or write raw provider JSON into `.aioson/context/`; provider uncertainty is represented as `warn` with advisory details.

## 5. Cross-Cutting Concerns

Secrets and raw environment values must be redacted from JSON and Markdown output. Missing provider, malformed provider output, missing baseline, no changed files, or docs-only scope should fail open as `warn`; confirmed new regressions in changed code should return `fail`.

## 6. Implementation Sequence for @dev

1. Implement and test the normalized result contract.
2. Implement baseline-vs-new comparison fixtures.
3. Add `src/commands/quality-audit.js`, CLI registration, and JSON output.
4. Add Markdown report writing and governance-source listing.
5. Run focused `node:test` suites and `node bin/aioson.js quality:audit . --json`.

## 7. Explicit Non-Goals and Deferred Items

No additional `quality:*` commands, no provider auto-install, no broad `.fallowrc`/ignore generation, no automatic refactor/deletion/suppression, and no undocumented machine-readable `.aioson/context/*.json` artifact.

> **Gate B:** Architecture approved — @dev can proceed.

---

# Feature Architecture — Briefing Refiner

## 1. Architecture Overview

Implementar o `@briefing-refiner` como agente prompt-first com helpers pequenos para geração/aplicação de artefatos de revisão em `.aioson/briefings/{slug}/`. A feature não cria banco, servidor ou dashboard: usa arquivos locais, prompt canônico template-first e contratos de feedback estruturado.

Decisão de status: se um briefing `approved` for alterado pelo refinador e `prd_generated` ainda for `null`, ele volta para `draft` e `approved_at: null`. Isso reaproveita `aioson briefing:approve` como reaprovação explícita e evita um novo status incompatível com o CLI atual.

## 2. Folder and Module Structure

```text
template/.aioson/agents/
  briefing-refiner.md             # prompt canônico do novo agente
.aioson/agents/
  briefing-refiner.md             # cópia workspace após sync/paridade
src/
  lib/
    briefing-refiner/
      briefing-registry.js        # read/write seguro de .aioson/briefings/config.md
      briefing-sections.js        # parse/serialize das seções obrigatórias de briefings.md
      feedback-schema.js          # validate/build refinement-feedback.json
      review-html.js              # buildReviewHtml(data) sem servidor externo
      refinement-report.js        # buildRefinementReport(data)
      apply-feedback.js           # aplica feedback confirmado preservando contrato @briefing
  constants.js                    # MANAGED_FILES + AGENT_DEFINITIONS
  commands/
    agents.js                     # direct prompt reconhece novo agent via constants
    briefing.js                   # reutilizar parse/serialize ou migrar para lib compartilhada
tests/
  briefing-refiner.test.js        # ciclo review -> feedback -> apply
  agent-registry.test.js          # constants/getAgentDefinition/listing/paridade
```

Não criar `src/commands/briefing-refiner.js` na V1. A ativação é por agente, não por comando CLI. Um comando `aioson briefing:refine` fica fora do escopo.

## 3. Models and Relationships

Usar as entidades de `.aioson/context/requirements-briefing-refiner.md`: Briefing Refinement Session, Review Section, Refinement Feedback, Review Comment, Review Decision e Refinement Report. Todas são filesystem-backed; não há migração SQLite.

Relações principais: sessão pertence a um item de `.aioson/briefings/config.md`; feedback pertence ao hash de um `briefings.md`; relatório resume uma aplicação de feedback; `@product` só consome briefing depois de `status: approved`.

## 4. Integration Architecture

- `src/constants.js`: adicionar `.aioson/agents/briefing-refiner.md` em `MANAGED_FILES` e novo item `AGENT_DEFINITIONS` com `id: 'briefing-refiner'`, `command: '@briefing-refiner'`, `dependsOn: ['.aioson/context/project.context.md', '.aioson/briefings/config.md']`, `output: '.aioson/briefings/{slug}/review.html + refinement-feedback.json + refinement-report.md'`.
- `src/agents.js` e `src/commands/agents.js`: não precisam de arquitetura nova; consomem `AGENT_DEFINITIONS`. Testar que `getAgentDefinition('briefing-refiner')` resolve.
- `src/commands/briefing.js`: extrair parse/serialize de config para `src/lib/briefing-refiner/briefing-registry.js` ou módulo compartilhado equivalente; manter `briefing:approve` e `briefing:unapprove` funcionando.
- `AGENTS.md`, `CLAUDE.md`, `template/AGENTS.md`, `template/CLAUDE.md`: adicionar o agente na lista, exemplos de natural language e mapeamento de arquivo.
- `src/commands/test-agents.js` e `src/commands/dossier-audit.js`: incluir `briefing-refiner` apenas se o teste/auditoria for usado como inventário de agentes oficiais; se o escopo desses arquivos for deliberadamente parcial, documentar em teste.

## 5. Review HTML Contract

`review.html` deve ser gerado como HTML estático autocontido. Ele recebe um JSON inicial embutido com seções, hashes, comentários e decisões; usa `contenteditable="plaintext-only"` quando disponível; captura mudanças com `input`; trata `beforeinput` como melhoria opcional.

Persistência: tentar File System Access API somente com detecção de capacidade e ação explícita do usuário. Fallback obrigatório: download/copy/export de `refinement-feedback.json`. O agente reentrada aceita arquivo salvo no path esperado ou JSON colado/exportado, mas nunca usa o DOM editado como fonte canônica.

## 6. Cross-Cutting Concerns

- Validation: validar slug, existência do briefing, schema version, source hash, seções obrigatórias e status permitido antes de aplicar feedback.
- Error handling: feedback inválido, slug divergente, hash stale, briefing implementado e bloqueios abertos resultam em recusa segura com relatório, não aplicação parcial silenciosa.
- Security: sanitizar texto editável no HTML; tratar feedback JSON como entrada não confiável; nunca permitir path fora de `.aioson/briefings/{slug}/`.
- Observability: `@briefing-refiner` deve usar `pulse:update` antes de `agent:done` e registrar no dossier quando existir.
- Compatibility: manter formato atual de `.aioson/briefings/config.md`; novos campos de refinamento são opcionais e não quebram `briefing:approve`.

## 7. Implementation Sequence for @dev

1. Criar `template/.aioson/agents/briefing-refiner.md` seguindo `agent-structural-contract`; sincronizar/criar `.aioson/agents/briefing-refiner.md`.
2. Adicionar `briefing-refiner` a `src/constants.js` e às listas gerenciadas/documentais (`AGENTS.md`, `CLAUDE.md`, templates).
3. Extrair ou compartilhar leitura/escrita de `.aioson/briefings/config.md` sem quebrar `briefing:approve`/`unapprove`.
4. Implementar helpers em `src/lib/briefing-refiner/` para parse de seções, schema de feedback, HTML, relatório e aplicação.
5. Escrever testes focados para registry, geração de review, fallback/export state, stale hash, apply confirmado, approved->draft e no-PRD/no-auto-approval.
6. Rodar `node --test` focado e checar paridade template/workspace do novo agente.

## 8. Explicit Non-Goals and Deferred Items

- Sem `aioson briefing:refine` na V1.
- Sem servidor local, dashboard ou sincronização multiusuário.
- Sem mudança em `@product` além de continuar respeitando `status: approved` + `prd_generated: null`.
- Sem novo status `needs_reapproval`; usar `draft` para compatibilidade.
- Sem leitura de `.aioson/briefings/` por `@dev`.

## 9. Handoff

Next agent: `@discovery-design-doc`.
Why: SMALL workflow do AIOSON exige um design-doc/readiness feature-scoped antes do `@dev`; ele deve mapear paths exatos e confirmar reuse/split antes da implementação.

> **Gate B:** Architecture approved — @dev can proceed after `@discovery-design-doc` produces the feature readiness/design package.

---

# Feature Architecture — Loop Guardrails

## 1. Architecture Overview

Guards como módulos puros em `src/harness/` (padrão já estabelecido por `circuit-breaker.js`), ancorados em dois pontos do `self:loop`: preflight (antes do `for`) e hook pós-attempt (após `runVerification`, `src/commands/self-implement-loop.js:224`). O `harness-contract.json` evolui in-place; o circuit-breaker ganha o estado `HUMAN_GATE`. Nenhum subsistema, executor ou namespace novo. Entidades e schemas: consumir `requirements-loop-guardrails.md` §2–§4 como estão.

## 2. Module Structure

```text
src/harness/
  circuit-breaker.js        # existente — check() passa a negar com reason='human_gate_pending'
  contract-schema.js        # REQ-1: validação estrita + defaults proibidos + presets (REQ-19) + mapa tema→paths
  glob-match.js             # matcher mínimo determinístico, sem dependência (ver decisão D1)
  git-baseline.js           # REQ-2/3: baseline (HEAD, dirty_paths, hashes) + changed-set (porcelain − dirty), paths normalizados '/'
  scope-guard.js            # REQ-4/5/6: deny-vence-allow + REQ-10 max_changed_files/max_diff_lines
  budget-guard.js           # REQ-7/8: chars/4, acumulador em progress.json, política 80/100%
  attempt-artifacts.js      # REQ-9: writer de attempts/{n}/ (changed-files.json, checks/, diff.patch)
  human-gate.js             # REQ-12/13/15: detecção por tema, gates/{id}.json, retomada idempotente
  criteria-runner.js        # REQ-16/17: criteria[].verification via executeInSandbox + assinatura de falha
src/commands/
  self-implement-loop.js    # integração: preflight + hook pós-attempt; sem mudança de assinatura CLI
  harness.js                # existente — harness:init ganha campos novos no template; preflight valida schema
  harness-gate.js           # novo: harness:approve / harness:reject (REQ-14)
  harness-status.js         # novo: harness:status [--json] (REQ-18)
  feature-close.js          # REQ-13: intercepta gate de comando `publish`
  git-guard.js              # REQ-20 (should-have): merge de forbidden_files do contrato ativo
```

Registro em `src/cli.js` no padrão existente. Testes: `tests/harness-{contract-schema,scope-guard,budget-guard,human-gate,criteria-runner,glob-match}.test.js` + integração em `tests/self-loop-guardrails.test.js`, todos `node:test` com fixtures git temporárias.

## 3. Key Decisions

- **D1 — Globs sem dependência nova**: o repo tem 3 deps de runtime e Node ≥18 (sem `path.matchesGlob`). `glob-match.js` implementa o subset `**`, `*`, `?` (com `**/` e `/**`); o validador de schema **rejeita** sintaxe fora do subset (`{}[]!()` extglob) com erro explícito — nunca mismatch silencioso em fronteira de segurança. `picomatch` fica como upgrade path documentado (mesmo padrão chars/4→tokenx do PRD).
- **D2 — EC-2 resolvido (path sujo proibido)**: o baseline grava `git hash-object` apenas dos dirty paths que casam `forbidden_files` (conjunto pequeno e bounded). Re-hash por tentativa; hash mudou → `scope_violation`. Warning no preflight mantido. Fecha a decisão fina deixada pelo @analyst sem custo perceptível.
- **D3 — Fonte do orçamento**: enforcement lê acumulador em `progress.json` (`budget: { tokens_estimated, warned_80, run_started_at, run_id }`) — guard determinístico, sem query SQLite no hot path. `execution_events.token_count` continua sendo a telemetria por evento (EC-10: "run atual" = acumulador zerado a cada run novo, legados null irrelevantes).
- **D4 — HUMAN_GATE no circuit-breaker**: `progress.status='human_gate'` + `pending_gates[]`; `cb.check()` nega com `human_gate_pending`. `harness:approve` persiste decisão, remove o gate de `pending_gates` e restaura `status='in_progress'`; `reject` encerra com `loop.summary`. Entrar no gate encerra o processo (estado em disco); retomada = re-executar `self:loop` (EC-9 sem re-detecção: gates `pending` existentes são reapresentados antes de nova detecção).
- **D5 — Ordem do hook pós-attempt**: (1) artifacts (registrar sempre, mesmo em falha) → (2) scope guard + D2 re-hash → (3) diff limits → (4) human gates → (5) criteria checks → (6) budget/runtime. Registrar primeiro, julgar depois; violação de escopo precede gate (arquivo fora do escopo não merece aprovação humana, merece rollback).
- **D6 — Eventos**: via `insertExecutionEvent` (`src/runtime-store.js:823`) com os `event_type` novos de requirements §2.5, sempre em `try/catch` best-effort — telemetria nunca quebra o loop (espelha BR-NC-11 do neural-chain).
- **D7 — Assinatura de falha**: `sha1(criterion_id + exitCode + primeira linha não-vazia de stderr normalizada)` (strip de paths absolutos, números de linha e timestamps). Persistida em `progress.json.failure_signatures[]` por run; 2 ocorrências → para com `failure_signature_repeat`.

## 4. Models and Relationships

Sem banco novo, sem migration — ver requirements §2 (schemas JSON em `.aioson/plans/{slug}/`) e §4 (relacionamentos). Consumidos como estão.

## 5. Integration Architecture

- **Preflight do `self:loop`** (antes do loop): `contract-schema.validate()` → erro explícito (campo + motivo) encerra antes de qualquer execução; `git-baseline.capture()` grava `baseline.json` + inicia `run_id`/budget novo em `progress.json`.
- **`feature:close`**: quando o contrato ativo lista `publish` em `human_gate.required_for` e não há gate `publish` aprovado no run → cria `gates/{id}.json` pending e encerra com instrução de approve (REQ-13).
- **`git:guard`** (should-have): `runGitGuard` mescla `forbidden_files` do contrato da feature ativa (progress `in_progress`/`human_gate` mais recente) na política de `.aioson/git-guard.json` em tempo de verificação — camada 2 do enforcement.
- **Sandbox**: `criteria-runner` usa `executeInSandbox(cmd, { cwd, timeout })` (`src/sandbox.js:126`) — timeout/kill/redaction já resolvidos; timeout = check falho com assinatura própria (EC-7).

## 6. Cross-Cutting Concerns

- **Retrocompat (REQ-11)**: validador aceita contratos antigos (campos novos opcionais); ausência ativa só defaults proibidos. `harness:init` continua gerando contrato válido. `npm test` verde por fase.
- **Segurança**: defaults proibidos não-removíveis implementam SEC-SBD-05 na fronteira do loop; deny vence allow; `harness:approve` valida slug/gate-id e não tem efeito colateral em erro (EC-8).
- **Windows**: toda comparação de path após `replaceAll('\\','/')`; testes cobrem os dois separadores (EC-6).
- **Inception**: mudanças em `src/` não tocam `template/`; se prompts de agentes forem ajustados (ex.: @dev citando harness:status), editar `template/` primeiro + `npm run sync:agents`.

## 7. Implementation Sequence for @dev

**Fase 1** (fecha com `npm test` verde + testes próprios):
1. `glob-match.js` + testes (base de tudo).
2. `contract-schema.js` (validação, defaults, presets) + integração no preflight do `self:loop` e em `harness:init`.
3. `git-baseline.js` (captura + changed-set + hashes D2).
4. `scope-guard.js` + `attempt-artifacts.js` + wiring do hook pós-attempt (D5, passos 1–3).
5. `budget-guard.js` + `max_runtime_minutes` + eventos D6.
6. Testes de integração com violação proposital (success metric do PRD).

**Fase 2**:
7. `human-gate.js` + estado no circuit-breaker (D4) + `harness-gate.js` (approve/reject) + interceptação em `feature-close.js`.
8. `criteria-runner.js` + assinatura de falha (D7).
9. `harness-status.js` (+ `--json`; rodapé referenciando `spec:status`).
10. `git:guard` merge (should-have, pode ser corte se a fase apertar).

## 8. Explicit Non-Goals and Deferred Items

Herdados do PRD/requirements §8 (sem `.aioson/loops/`, sem `loop:*`, sem juiz IA, sem UI Play, sem USD real, sem `security_high_finding`). Adicionais desta arquitetura: sem watcher de filesystem (detecção só nas fronteiras de tentativa), sem worktree isolation (gap conhecido do projeto, fora desta feature), sem leitura SQLite no caminho de enforcement (D3).

> **Gate B:** Architecture approved — @dev can proceed.
