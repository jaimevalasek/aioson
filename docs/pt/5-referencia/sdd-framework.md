# Spec-Driven Development (SDD)

> **Para quem é:** quem quer entender por que o AIOSON funciona do jeito que funciona — ou quer customizar o processo.
> **Tempo de leitura:** 8 min
> **O que você vai sair sabendo:**
> - Os 3 artefatos que governam o SDD
> - Como a profundidade de processo muda por classificação
> - O que é "The 80% Rule" e por que ela existe

## Para que serve

Sem processo explícito, cada sessão de IA inventa o seu próprio fluxo. O `@dev` começa a implementar antes de ter spec. O `@qa` testa antes de entender os ACs. O `@architect` decide stack sem ter visto os requisitos. O resultado é código que responde à pergunta errada, ou responde certo mas de um jeito que ninguém mais vai conseguir manter.

O SDD (Spec-Driven Development) é a metodologia que o AIOSON adota para garantir que cada agente trabalha na ordem certa, com o artefato certo, antes de prosseguir. Não é burocracia — é a estrutura mínima que evita retrabalho.

Assim como a classificação MICRO/SMALL/MEDIUM (ver [Decisões iniciais](../2-comecar/decisoes-iniciais.md)), o SDD escala: projetos menores recebem menos cerimônia.

## Os 3 artefatos que governam o SDD

### 1. Constitution (`constitution.md`)

Localização: `.aioson/constitution.md`

Os 7 artigos que nenhum agente pode quebrar. São princípios imutáveis — qualquer agente pode citar um artigo para justificar uma recusa ou uma decisão.

| Artigo | Princípio |
|---|---|
| I | Spec First — features começam como especificação |
| II | Right-Sized Process — MICRO ≠ MEDIUM |
| III | Observable Work — decisões viram artefatos |
| IV | Testable Behavior — ACs verificáveis independentemente |
| V | Clean Handoffs — artefatos auto-suficientes |
| VI | Simplicity Over Ceremony — sem camadas desnecessárias |
| VII | Zero Trust by Default — segurança é baseline, não feature |

Ver detalhes em [Por que ele existe](../1-entender/por-que-existe.md#os-6-princípios-da-constitution).

### 2. Project Pulse (`project-pulse.md`)

Localização: `.aioson/context/project-pulse.md`

Estado vivo do projeto. Lido no início de cada sessão, atualizado ao fim. Responde: "o que está acontecendo neste projeto agora?" — sem precisar reler histórico.

Contém: feature em andamento, agente atual, último checkpoint, bloqueios conhecidos, próxima ação.

### 3. Skill `aioson-spec-driven`

Localização: `.aioson/skills/process/aioson-spec-driven/SKILL.md`

O playbook do processo. Define exatamente quais fases existem, quais artefatos cada fase produz, e quais gates precisam ser aprovados antes do handoff. Agentes carregam partes dele sob demanda (não o arquivo inteiro — apenas a referência relevante à fase atual).

```
Fases do SDD:
Specify → Research → Requirements → Design → Tasks → Execute → State
```

## As 3 lanes padrão (v1.35.0)

O SDD não escala pelo número de agentes — escala pelas **lanes**: cada classificação tem uma lane com uma autoridade única de spec.

| Lane | Classificação | Cadeia padrão |
|---|---|---|
| **MICRO** | 0–1 pts | `@product → @dev → @qa` |
| **SMALL — lean (padrão)** | 2–3 pts | `@product → @sheldon → @dev → @qa` |
| **MEDIUM — maestro** | 4–6 pts | `@product → @orchestrator → @dev → @pentester → @qa` |

**Autoridade única de spec:**
- **SMALL:** `@sheldon` (vertical / solo) — produz requirements + decisões técnicas + design-doc + readiness + implementation-plan + harness-contract em uma passada.
- **MEDIUM:** `@orchestrator` (horizontal / fan-out) — dispara `@analyst` + `@architect` + `@pm` (+ `@ux-ui` quando UI-heavy) como sub-agentes, consolida e verifica os artefatos, e entrega o pacote de spec com Gates A/B/C aprovados.

> `@analyst`, `@architect`, `@pm`, `@discovery-design-doc`, `@scope-check` e `@ux-ui` **não são hops padrão** — são detours opt-in ou sub-agentes do fan-out do `@orchestrator`. Nenhum foi removido; apenas deixaram de ser obrigatórios no caminho padrão.

## Profundidade por classificação

| Fase | MICRO | SMALL (lean) | MEDIUM (maestro) |
|---|---|---|---|
| Specify (PRD) | obrigatória | obrigatória | obrigatória |
| Spec authority | — | `@sheldon` (solo) | `@orchestrator` (fan-out) |
| Requirements | pulada | dentro do `@sheldon` | sub-agente `@analyst` via `@orchestrator` |
| Design técnico | pulado | dentro do `@sheldon` | sub-agente `@architect` via `@orchestrator` |
| UI/UX | pulada | detour opt-in | sub-agente `@ux-ui` via `@orchestrator` (UI-heavy) |
| Plan/Tasks | opcional | dentro do `@sheldon` | sub-agente `@pm` via `@orchestrator` |
| Execute (`@dev`) | direto | após Gates A/B/C | após Gates A/B/C |
| Pentester | opt-in | opt-in | **inline** (entre `@dev` e `@qa`) |
| QA/Validation | opcional | obrigatória | audit-blocking |

Para MICRO: spec lite direto ao `@dev`. Nenhuma cerimônia.
Para MEDIUM: cada dimensão de spec é coberta por um sub-agente especializado coordenado pelo `@orchestrator`.

## Gates de aprovação

Em SMALL e MEDIUM, gates determinísticos controlam o avanço entre fases. Os 4 gates principais:

| Gate | O que verifica | Quem produz / verifica |
|---|---|---|
| **Runtime smoke** | Build + migrations (em DB real) + boot + Core happy-path no stack real. Uma feature com backend/DB não fecha sem passar. `tsc` + testes unitários é o piso, não o "done". | `@qa` (Gate D) |
| **Contract-integrity** | Bloqueia quando o harness-contract está ausente, sem critérios `RG-*`, ou com verificações duplicadas. Roda deterministicamente no gate de conclusão do `@dev`/`@qa`. | `aioson harness:check` |
| **Scope-drift** | `spec:analyze` roda no gate done do `@dev`/`@qa`; bloqueia em drift real (readiness bloqueado, contrato inválido). `@scope-check` também disponível como detour explícito. | `aioson spec:analyze` / `@scope-check` |
| **Single-spec-authority handoff** | Quando `@sheldon` (SMALL) ou `@orchestrator` (MEDIUM) passa para `@dev`, os Gates A/B/C + plano de implementação aprovado + integridade de contrato são verificados. | `@sheldon` / `@orchestrator` |

Gates A/B/C = spec completa verificável (A: requisitos, B: decisões técnicas, C: plano faseado + harness-contract).
Gate D = pré-ship: Runtime smoke + nenhum finding HIGH/CRITICAL de segurança.

## Sub-agentes de verificação (configuráveis, token-aware)

`.aioson/config/verification.json` (auto-gerado, editável manualmente) declara quais verificadores (`qa` / `tester` / `pentester` / `validator`) rodam, **quando** (`per-phase` / `end-of-feature` / `sensitive-surface`), e em **qual modelo** — indexado por host harness.

| Modo de dispatch | Descrição |
|---|---|
| **`native`** | Sub-agente in-harness num modelo do mesmo host (Claude Code → tier Claude como sonnet/opus; codex/opencode → seu modelo configurado). |
| **`external`** | Dispara uma CLI de fornecedor diferente como auditor read-only (segunda opinião cross-vendor). Use para rodar GPT ou outro modelo como auditor externo — você não pode rodar um modelo GPT como sub-agente *nativo* do Claude Code. |

Budget de tokens: verificações por fase são leves (um sub-agente barato), o smoke completo roda uma vez ao fim da feature, e verificação por fase é suprimida no MICRO.

```bash
# Resolver o plano de verificação para um slug/trigger/host
aioson verification:plan . --slug=checkout-stripe --trigger=per-phase
```

## The 80% Rule e SDD Automation Scripts

"The 80% Rule" é o princípio de que 80% do processo SDD pode ser automatizado — preflight checks, classificação, detecção de test runner, aprovação de gates — deixando os 20% críticos (decisões de produto, revisão humana) para você.

Scripts implementados (commit `e0722ef`, `1cdfa6a`):
- `sdd-preflight` — verifica se o projeto está pronto para iniciar uma fase
- `sdd-classify` — detecta classificação com base nos critérios do `config.md`
- `sdd-gate-check` — verifica se os artefatos necessários para o gate estão presentes
- `detect-test-runner` — detecta o runner de testes automaticamente

```bash
# Verificar se o projeto está pronto para @dev
aioson gate:check . --gate=C

# Aprovar um gate manualmente
aioson gate:approve . --gate=C --reason="spec revisada e validada"

# Detectar test runner do projeto
aioson detect:test-runner .
```

## Quando o SDD não se aplica

- Exploração rápida sem intenção de manter. Use prompt direto.
- Scripts de automação MICRO sem usuário externo. O `@dev` pode receber a spec no chat.
- Quando você não vai usar o projeto de novo. Sem continuidade, sem artefatos — não tem perda.

## Próximo passo

- [Constitution completa](../1-entender/por-que-existe.md)
- [Classificação MICRO/SMALL/MEDIUM](../2-comecar/decisoes-iniciais.md)
- [SDD Automation Scripts](./sdd-automation-scripts.md)
- [Feature Dossier](./feature-dossier.md) — onde os artefatos de cada feature vivem
