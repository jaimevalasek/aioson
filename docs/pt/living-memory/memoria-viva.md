# O que é Memória Viva

## O problema

Quando você abre uma nova sessão de IA num projeto que já tem código, há duas opções ruins:

1. **Esperar** o agente ler o repositório do zero — caro em tokens, lento, e o agente ainda perde nuances que só humanos sabem.
2. **Colar contexto manual** num prompt gigante — frágil, fica obsoleto na primeira mudança, e ninguém atualiza.

Ambas viraram aceitas porque parecem inevitáveis. Não são. O que falta é **um resumo semântico do projeto que se mantém vivo entre sessões** — atualizado pelos próprios agentes, do jeito certo, na hora certa, sem você precisar pedir.

Isso é Memória Viva.

## As 4 camadas

O AIOSON guarda quatro tipos de memória, com papéis diferentes:

| Camada | O que guarda | Onde mora | Atualização |
|---|---|---|---|
| **Bootstrap** (semântica) | Identidade, arquitetura, features, estado atual — em prosa curta | `.aioson/context/bootstrap/*.md` | Reflexão automática + `/discover` manual |
| **Devlog** (episódica) | O que aconteceu em cada sessão de cada agente | `aioson-logs/devlog-*.md` + SQLite | Cada agente escreve no final |
| **Brain** (procedural) | Padrões reutilizáveis que ganharam qualidade alta | `.aioson/brains/*.brain.json` | Promoção semi-automática de devlogs |
| **Runtime** (telemetria) | Eventos minuto-a-minuto: handoffs, gates, reflexões, notifies | `.aioson/runtime/aios.sqlite` | CLI grava em todo comando relevante |

Memória Viva foca em duas dessas: **bootstrap** (porque é o resumo que os agentes leem) e **runtime** (porque é onde os hooks e o doctor olham).

## Anatomia de `bootstrap/`

Quatro arquivos, sempre os mesmos quatro nomes:

```
.aioson/context/bootstrap/
├── what-is.md        ← identidade do sistema, usuários, proposta de valor
├── how-it-works.md   ← arquitetura, módulos, fluxo de dados, integrações
├── what-it-does.md   ← features ativas, regras de negócio, workflows do usuário
└── current-state.md  ← capabilities já entregues (append-only — diário do que ficou pronto)
```

Cada um tem YAML frontmatter no topo (`generated_at` é o campo que mais importa — bate o relógio toda vez que o arquivo é atualizado).

Quando um agente abre, ele lê esses 4 arquivos primeiro. Eles cabem na janela de contexto facilmente. O agente sai sabendo o suficiente para começar a trabalhar.

## Ciclo de vida de uma sessão

```
1. Você abre Claude Code / Codex / Gemini / OpenCode e ativa um agente:
   /dev "vamos adicionar paginação em /api/posts"

2. O agente lê:
   - .aioson/config.md
   - .aioson/context/project.context.md
   - .aioson/context/dev-state.md  (foco atual, pacote de contexto)
   - .aioson/context/bootstrap/how-it-works.md + current-state.md

3. O agente trabalha — escreve código, roda testes, commita.

4. Ao final, ele chama:
   aioson agent:done . --agent=dev --summary="..."

5. O CLI dispara o engine de reflexão:
   - Roda heurística determinística em git diff HEAD~3..HEAD
   - Detecta que src/routes/api/posts.js mudou → verdict=relevant
   - Escreve .aioson/runtime/reflect-prompt.json com o manifesto

6. Na próxima sessão (mesmo agente ou outro):
   - O agente vê reflect-prompt.json existir
   - Lê o manifesto: targets=[how-it-works.md, current-state.md], snapshot, diff
   - Edita os 2 arquivos: adiciona a capability nova, atualiza generated_at
   - Roda aioson memory:reflect-commit . --agent=dev --output=<json>

7. O CLI valida:
   - Frontmatter preservado? generated_at bumped? Snapshot hash bate?
   - Se OK: escreve bootstrap/, apaga reflect-prompt.json, emite memory_reflect_committed
   - Se FAIL: rejeita, agente tem 1 retry

8. A próxima sessão começa lendo um bootstrap que já reflete a paginação.
```

A chave: nenhuma chamada LLM do CLI. A reflexão acontece **dentro da sessão paga do harness**. O CLI só decide quando dispara, monta o manifesto, e valida o resultado.

## Quando a reflexão dispara

A heurística é determinística e está no `src/memory-reflect-engine.js`. Verdict `relevant` se qualquer um dos critérios bate:

| Sinal | Detecção |
|---|---|
| Rotas/handlers tocados | `routes/`, `controllers/`, `pages/api/`, `app/api/` no diff |
| Models/migrations tocados | `models/`, `migrations/`, `prisma/schema.prisma`, `app/Models/` |
| Contratos de domínio tocados | `prd-*.md`, `features.md`, `requirements-*.md` |
| Adição em `current-state.md` | Diff contém adição |
| Volume alto | ≥ 10 arquivos E ≥ 200 linhas alteradas |

Caso contrário: `verdict=skip` — a sessão foi sobre CSS, typo, refactor de testes etc. e não muda nada no resumo semântico.

A heurística é conservadora pelo lado dos *falsos positivos* (custa pouco — só atrasa 5s na geração do manifest), mas o doctor (Fase 4) é o backstop: se bootstrap ficar > 30 dias sem update, ele emite warning na próxima sessão sugerindo `/discover` manual.

## Como verificar o estado da memória

```bash
aioson memory:status .
# Bootstrap: 4/4
# Memory index: present
# Context pack: present
# Project pulse: present
# Devlogs: 12 (manifest present)
# Brains: 8 indexed
# Runtime: completed:34, running:0
# Active learnings: 17
```

ou um resumo compacto para abrir uma sessão fria:

```bash
aioson memory:summary . --last=5
# # AIOSON Memory Summary
# ## Bootstrap
# - Coverage: 4/4
# - Identity: AIOSON — AI operating framework...
# - Current state: ...
# ## Project Pulse
# ...
# ## Recent Runtime
# ...
```

## Onde isso encaixa no AIOSON maior

Memória Viva **estende** primitivas que já existiam:

- `workflow:next` e `workflow:execute` continuam sendo o motor único — Memória Viva adiciona um hook depois de `--complete`.
- `runtime:emit` continua sendo o canal de telemetria — `notify` é wrapper visual em cima dele.
- Os manifests em `.aioson/agents/manifests/*.manifest.json` continuam o contrato canônico — adicionamos a capability `reflect_memory`.
- `autonomy-protocol.json` continua a fonte única de verdade — adicionamos o bloco `tiers` (schema v1.1) sem quebrar v1.0.

Não há motor novo. Não há arquivo de memória novo. Não há chamada LLM nova no CLI. É a mesma máquina, com o resumo se mantendo vivo.

## Continue lendo

- [Reflexão In-Harness](./reflexao-in-harness.md) — a pipeline técnica com exemplos
- [Autonomy Contract](./autonomy-contract.md) — os 3 tiers e como cada harness aplica
- [Diagramas](./diagramas.md) — fluxo visual de uma sessão completa
