# Live Sessions — Sessões Rastreadas

> **Para quem é:** quem quer ver o progresso das sessões no dashboard do AIOSON, ou quer telemetria de milestones.
> **Tempo de leitura:** 6 min
> **O que você vai sair sabendo:**
> - A diferença entre sessão direta e sessão rastreada
> - Como abrir, monitorar, transferir e fechar uma live session

## Para que serve

Quando você digita `@dev` no Claude Code e o agente começa a trabalhar, isso é uma sessão direta: o trabalho acontece, artefatos são criados, mas o dashboard não sabe o que está acontecendo em tempo real.

Uma live session é um *envelope rastreado*: ela registra quem está trabalhando, quando começou, quais milestones passou e quando fechou — tudo em SQLite local (`.aioson/runtime/aios.sqlite`) que o dashboard lê.

Você usa live sessions quando quer:
- Acompanhar progresso no dashboard em tempo real
- Registrar milestones de execução como eventos
- Fazer handoff formal entre agentes numa mesma sessão rastreada
- Ter histórico auditável de sessões por agente

## Quando usar

- Projetos MEDIUM com múltiplos agentes em sequência — cada handoff fica registrado.
- Times que acompanham progresso via dashboard.
- Sessões longas (horas) onde você quer checkpoints.
- Antes de começar um `@dev` de feature crítica — você abre a session, o agente trabalha dentro dela, você fecha ao fim.

## Quando NÃO usar

- Projetos MICRO de sessão única. Overhead de setup não compensa.
- Quando você usa `aioson workflow:next` — ele já cria a telemetria automaticamente.
- Exploração rápida sem intenção de registrar.

## Comandos

```bash
# Abrir uma sessão rastreada
aioson live:start . --agent=dev --tool=claude

# Com tmux (lança o cliente AI numa pane separada automaticamente)
aioson live:start . --agent=dev --tool=claude --tmux

# Sem lançar o cliente AI (apenas cria o envelope de sessão)
aioson live:start . --agent=deyvin --tool=claude --no-launch

# Retomar uma sessão existente
aioson live:start . --agent=dev --tool=claude --resume

# Ver status da sessão ativa (atualiza a cada 2s)
aioson live:status . --agent=dev --watch=2

# Ver status uma única vez
aioson live:status . --agent=dev

# Emitir milestone dentro da sessão
aioson runtime:emit . --agent=dev --type=checkpoint --summary="Stripe handler concluído"

# Emitir milestone de plano (quando existe um plano em andamento)
aioson runtime:emit . --agent=dev --type=plan_checkpoint --plan-step=2

# Transferir sessão para outro agente (mantém o envelope rastreado)
aioson live:handoff . --agent=dev --to=qa --reason="Implementação concluída, 4 testes passando"

# Fechar sessão
aioson live:close . --agent=qa --summary="QA passou 12/12 ACs. Feature pronta."

# Listar sessões ativas
aioson live:list .
```

## Exemplo prático

```
# Você abre o terminal e inicia a sessão
$ aioson live:start . --agent=dev --tool=claude --no-launch
> Live session aberta: session-key=dev-1715103120-a3b4
> Registrado em: .aioson/runtime/aios.sqlite
> Abra seu cliente AI e comece com @dev.

# Dentro do Claude Code
Você > @dev
@dev > Lendo project-pulse e dossier checkout-stripe...
       Implementando: stripe-handler, webhook route, checkout form.

# Você acompanha no terminal (outra janela)
$ aioson live:status . --agent=dev --watch=2
> Session: dev-1715103120-a3b4 | Status: active | Duração: 00:23:14
> Último evento: "webhook route implementada" (há 2 min)

# Agente emite milestone
$ aioson runtime:emit . --agent=dev --type=checkpoint --summary="Stripe handler OK"

# Handoff para @qa
$ aioson live:handoff . --agent=dev --to=qa --reason="Implementação concluída"
> Session transferida para @qa. Histórico preservado.

# Dentro do Claude Code
Você > @qa
@qa > Retomando sessão rastreada. Lendo handoff-protocol...
      Testando: 4 ACs identificados.

# Fechar ao fim
$ aioson live:close . --agent=qa --summary="12/12 ACs passando. Feature pronta."
> Session fechada. Duração total: 01:45:30. Registrado no dashboard.
```

## O tmux launcher

Com `--tmux`, o AIOSON lança o cliente AI numa pane separada do tmux e exibe uma status bar compacta com: agente atual, duração, último evento. Util para trabalho longo sem precisar alternar entre terminais.

Requer `tmux` instalado (`apt install tmux` ou `brew install tmux`).

```bash
aioson live:start . --agent=dev --tool=claude --tmux
# Abre: pane esquerda (status bar) + pane direita (claude)
```

## Saídas em disco

```
.aioson/runtime/
├── aios.sqlite                    ← banco principal (dashboard lê daqui)
└── live/<session-key>/
    ├── state.json                 ← estado da sessão
    ├── events.ndjson              ← stream de eventos (até 10 por sessão)
    └── summary.md                 ← resumo ao fechar
```

## Diferença: live session vs workflow:next

| | `live:start` | `workflow:next` |
|---|---|---|
| Quem controla routing | Você | O CLI |
| Registra telemetria | Sim | Sim |
| Lança cliente AI | Opcional | Sim |
| Flexibilidade | Total | Workflow-driven |

Use `workflow:next` para seguir o fluxo automático do SDD. Use `live:start` quando quer controle manual sobre qual agente está ativo.

## Próximo passo

- [Agent-chain continuity](./agent-chain-continuity.md) — como milestones e handoffs se conectam com dossier
- [Runtime observability](../runtime-observability.md) — visualizar telemetria no dashboard
- [Hooks & Session Guard](../hooks-session-guard.md) — visibilidade automática sem live session
