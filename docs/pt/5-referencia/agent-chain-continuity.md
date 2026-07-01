# Agent-Chain Continuity

> **Para quem é:** quem trabalha em features longas, com múltiplos agentes, ou retomadas frequentes.
> **Tempo de leitura:** 8 min
> **O que você vai sair sabendo:**
> - Como o AIOSON garante que nenhum contexto se perde entre sessões
> - Os 5 componentes do sistema e como eles se compõem

## Para que serve

Uma feature MEDIUM dura dias. Nesse tempo você troca de cliente AI, a sessão compacta, o `@dev` passa para o `@qa`, o `@qa` devolve para o `@dev`, e você dorme no meio. Toda vez que um agente novo entra, precisa responder: "onde estávamos? o que foi feito? o que mudou desde que a spec foi escrita?"

Sem um sistema de continuidade, a resposta é "reler o histórico de chat" — o que não escala e some na compactação. Com agent-chain continuity, a resposta é "ler os artefatos". O histórico é descartável; os artefatos são a memória.

Este sistema foi construído em 8 fases ao longo de Mar–Mai/2026 (commits `agent-chain-continuity`). Os 5 componentes são independentes mas se reforçam.

## Os 5 componentes

### 1. Handoff Protocol v2 (`handoff-protocol.json`)

Arquivo em `.aioson/context/handoff-protocol.json`. Criado/atualizado em todo handoff entre agentes. Schema v2 inclui `artifact_uris` — lista de caminhos para todos os artefatos relevantes da feature, para o próximo agente não precisar adivinhar onde está cada coisa.

```json
{
  "from": "@dev",
  "to": "@qa",
  "feature_slug": "checkout-stripe",
  "timestamp": "2026-05-06T14:23:00Z",
  "artifact_uris": [
    ".aioson/context/features/checkout-stripe/spec.md",
    ".aioson/context/dev-state.md",
    ".aioson/context/dossier/checkout-stripe/dossier.json"
  ],
  "summary": "Stripe handler implementado. Webhook pendente. 3 testes falhando."
}
```

### 2. Dev-State (`dev-state.md`)

Arquivo em `.aioson/context/dev-state.md`. O `@dev` atualiza ao fim de cada sessão com: o que foi feito, o que está pendente, arquivos tocados, decisões tomadas, próxima ação sugerida. É o "onde parei" que permite retomada sem reler o histórico.

### 3. Dev-Resume Helper

Quando o `@dev` é invocado e detecta que há uma feature em andamento (via `dev-state.md` e dossier), ele entra automaticamente em modo de retomada: lê os artefatos, detecta drift (spec mudou depois do código?) e apresenta o estado antes de pedir qualquer instrução nova.

### 4. Drift Detection (Phase 5)

Se a spec foi atualizada depois que o código foi escrito, ou se o `handoff-protocol.json` não corresponde ao `dev-state.md`, o sistema detecta o drift e alerta o agente antes de prosseguir. Evita o bug clássico de "implementei com base numa spec que já mudou".

```
@dev > Detectei drift: spec.md atualizada em 2026-05-05, mas dev-state.md
       registra implementação baseada em spec de 2026-05-03.
       Recomendo revisar seções 2 e 3 da spec antes de continuar.
```

### 5. Sync-Agents Preflight (Phase 4)

Antes de iniciar uma nova sessão de agente, o sistema verifica se os agentes instalados no workspace estão em paridade com a versão do template. Garante que `@dev` e `@qa` estão rodando o mesmo conjunto de regras — não versões diferentes de antes de um update.

```bash
aioson sync:agents .   # sincroniza agentes do template para o workspace
```

## Como o sistema se compõe

```
feature inicia (via workflow:next ou manualmente)
        │
        ▼
dossier:init criado → dossier.json
        │
        ▼
@product → prd.md
        │
        ▼
autoridade de spec:
  SMALL → @sheldon (pacote de spec completo em uma passada)
  MEDIUM → @orchestrator (fan-out: @analyst + @architect + @pm + @ux-ui → consolida)
        │
        ▼  Gates A/B/C aprovados
@dev implementa por fases → dev-state.md (atualizado a cada fase)
        │    ↕ verificação por fase (sub-agente leve, auto-continue)
        │                       handoff-protocol.json (escrito no handoff)
        │
        ▼
[sessão nova / agente novo]
        │
        ├─ drift detection (spec mudou desde o dev-state?)
        ├─ dev-resume (modo automático de retomada)
        └─ next agent lê artifact_uris do handoff-protocol
        │
        ▼
@pentester (MEDIUM, inline) → findings → @dev corrige → @pentester re-varre
        │
        ▼
@qa → runtime smoke gate + ACs → devolve para @dev se houver falhas (ciclo autônomo, cap 3)
        │
        ▼
@validator → verifica contra harness-contract em contexto isolado → gate final → feature:close
        │
        ▼
dossier arquivado em .aioson/context/done/
```

## Gatilhos automáticos

| Evento | O que acontece automaticamente |
|---|---|
| `aioson feature:close` | Dossier auto-init se não existir; handoff-protocol atualizado; feature movida para `done/` |
| `aioson workflow:next` | Verifica paridade de agentes; lê dossier; emite próximo agente |
| `@dev` entra sem instrução | Modo dev-resume: lê dev-state.md e dossier antes de qualquer ação |

## Saídas em disco

```
.aioson/context/
├── handoff-protocol.json      ← último handoff entre agentes
├── last-handoff.json          ← alias usado por @validator
├── dev-state.md               ← estado atual do @dev
└── dossier/<slug>/
    └── dossier.json           ← estado da feature (inclui artifact_uris)
```

## Quando NÃO precisa disso

- Features MICRO de sessão única. O `@dev` resolve e você commita. Sem continuidade necessária.
- Quando você usa o `runner-system` com fases automáticas — o runner gerencia tudo isso internamente.

## Próximo passo

- [Feature Dossier](./feature-dossier.md) — comandos detalhados do dossier
- [Live Sessions](./live-sessions.md) — como registrar milestones de continuidade no dashboard
- [Ficha do @deyvin](../4-agentes/deyvin.md) — o agente de retomada que consome esses artefatos
