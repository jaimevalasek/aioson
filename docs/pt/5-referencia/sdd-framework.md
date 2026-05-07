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

## Profundidade por classificação

A beleza do SDD é que ele se contrai para projetos pequenos:

| Fase | MICRO | SMALL | MEDIUM |
|---|---|---|---|
| Specify (PRD lite) | obrigatória | obrigatória | obrigatória |
| Research (@sheldon) | opcional | recomendada | obrigatória |
| Requirements (@analyst) | pulada | obrigatória | obrigatória |
| Design (@architect, @ux-ui) | pulada | seletiva | obrigatória |
| Tasks/Plan | opcional | recomendada | obrigatória |
| Execute (@dev) | direto | após gates | após gates |
| QA/Validation | opcional | obrigatória | audit-blocking |

Para MICRO: você vai de spec lite direto ao @dev. Nenhuma cerimônia.
Para MEDIUM: cada fase tem gate de aprovação antes do próximo agente.

## Gates de aprovação

Em SMALL e MEDIUM, antes do handoff entre fases, um gate é verificado. Exemplo: antes do `@dev` começar, deve existir:
- `spec-<slug>.md` com ACs verificáveis
- `architecture.md` com decisões técnicas documentadas
- (MEDIUM) `implementation-plan-<slug>.md` com fases de execução

O gate não bloqueia automaticamente em projetos SMALL — é consultivo. Em MEDIUM, Gate D (pré-ship) bloqueia em findings High/Critical de segurança.

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
- [SDD Automation Scripts](../sdd-automation-scripts.md)
- [Feature Dossier](./feature-dossier.md) — onde os artefatos de cada feature vivem
