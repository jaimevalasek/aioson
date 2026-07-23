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

## Uma rota, três profundidades

O SDD escala a profundidade, não o número de documentos nem a cadeia:

```text
[@briefing → @briefing-refiner] → @product → [@sheldon] → @planner → @dev → @qa
```

- Briefing e Briefing Refiner são enquadramento opcional antes do PRD.
- Product é dono do único PRD.
- Sheldon pode enriquecer esse mesmo PRD; não cria uma segunda especificação.
- Planner é dono do único plano de implementação.
- DEV implementa e integra.
- QA emite o único veredito final.

`@analyst`, `@architect`, `@pm`, `@discovery-design-doc`, `@scope-check`, `@ux-ui` e `@orchestrator` continuam disponíveis como consultores explícitos. Seus pareceres podem enriquecer PRD ou plano, mas não são gates canônicos.

## Profundidade por classificação

| Fase | MICRO | SMALL | MEDIUM |
|---|---|---|---|
| Specify (PRD) | obrigatória | obrigatória | obrigatória |
| Enriquecimento Sheldon | opcional | opcional | opcional |
| Plano do Planner | curto | vertical completo | vertical completo, com riscos e integrações nomeados |
| Execute (`@dev`) | orçamento reduzido | orçamento padrão | orçamento ampliado; faixas DEV se declaradas |
| QA | ACs alterados + smoke | todos os ACs + regressão focada + smoke | negativos/integrações profundos nos riscos nomeados |
| Tester/Pentester/Validator | opt-in | opt-in | opt-in |

## Gates de aprovação

Gates determinísticos controlam o avanço sem exigir documentos duplicados:

| Gate | O que verifica | Quem produz / verifica |
|---|---|---|
| **Runtime smoke** | Build + migrations (em DB real) + boot + Core happy-path no stack real. Uma feature com backend/DB não fecha sem passar. `tsc` + testes unitários é o piso, não o "done". | `@qa` (Gate D) |
| **Plan-integrity** | O único plano referencia capacidades/ACs do PRD, fases verticais, arquivos esperados e checks executáveis. | `@planner` |
| **Scope-drift** | `spec:analyze` pode detectar drift real; `@scope-check` continua disponível como revisão explícita. | CLI / `@scope-check` |
| **Product-to-plan handoff** | PRD tem ACs concretos, `product_scope: approved` e `prd_ready: approved` antes de planejamento significativo. | `@product` / `@sheldon` |

Gate C = plano de implementação aprovado antes de implementação significativa.
Gate D = relatório QA PASS com evidência executável e pelo caminho de produção.

## Sub-agentes de verificação (configuráveis, token-aware)

O manifesto `agent-execution-{slug}.json` declara quais verificadores (`qa` / `tester` / `pentester` / `validator`) e faixas DEV estão habilitados, em qual host/modelo e sob qual gatilho.

| Modo de dispatch | Descrição |
|---|---|
| **`native`** | Sub-agente in-harness num modelo do mesmo host (Claude Code → tier Claude como sonnet/opus; codex/opencode → seu modelo configurado). |
| **`external`** | Dispara uma CLI de fornecedor diferente como auditor read-only (segunda opinião cross-vendor). Use para rodar GPT ou outro modelo como auditor externo — você não pode rodar um modelo GPT como sub-agente *nativo* do Claude Code. |

QA é o único revisor padrão e roda ao fim do DEV. Tester, Pentester e Validator ficam desligados por padrão em todas as classificações. Ausência de host/modelo pausa a execução; fallback só existe quando o manifesto o declara.

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
