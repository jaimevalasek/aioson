# Notificações inline — `aioson notify`

> `aioson notify` é o canal padrão para o framework e os agentes comunicarem **o que está acontecendo agora**, com um prefixo visual no terminal e um registro permanente em SQLite. É um wrapper sobre `runtime:emit` — não duplica nada, só dá uma UX consistente.

## Sintaxe

```bash
aioson notify [path] --level=info|warn|block --topic=<topic> --message=<text> [--agent=<name>] [--json]
```

| Flag | Obrigatório | Default | Comentário |
|---|---|---|---|
| `--level` | sim | — | `info` / `warn` / `block` (case-insensitive; valores inválidos caem em `info`) |
| `--topic` | recomendado | — | rótulo curto entre colchetes — ajuda na hora de filtrar no dashboard |
| `--message` | sim | — | a mensagem em si |
| `--agent` | não | `notify-<level>` | quem emitiu — registrado no campo `agent_name` em SQLite |
| `--json` | não | false | suprime a saída visual (útil em scripts) |

Sem mensagem o comando rejeita com `error: missing_message` e exit 1.

## Os três níveis

| Level | Prefixo | Exit code | Quando usar |
|---|---|---|---|
| `info` | `ℹ` | `0` | tier 2 disparou, transição de estado, milestone normal |
| `warn` | `⚠` | `0` | merece atenção mas não bloqueia — bootstrap stale, drift detectado, fallback acionado |
| `block` | `⛔` | `2` | tier 3 acionado, script wrapper deve pausar e esperar humano |

Exit code 2 é o sinal canônico para wrappers entenderem "preciso de humano agora". Use em scripts:

```bash
aioson notify . --level=block --topic=git --message="Push manual necessário: git push origin main"
if [ $? -eq 2 ]; then
  echo "→ Pausando, aguarde decisão humana"
  read -p "Pressione Enter quando o push estiver feito: "
fi
```

## Exemplos canônicos

### Reflexão de memória disparou

```bash
aioson notify . --level=info --topic=memory \
  --message="Atualizando bootstrap após mudanças em src/routes/"
```

Saída:

```
ℹ [memory] Atualizando bootstrap após mudanças em src/routes/
```

Tipicamente disparado pelo hook em `workflow:next` ou `runAgentDone` quando reflect-prepare devolve `verdict=relevant`.

### Bootstrap stale

```bash
aioson notify . --level=warn --topic=bootstrap \
  --message="Bootstrap stale há 35 dias — recomendo /discover"
```

Saída:

```
⚠ [bootstrap] Bootstrap stale há 35 dias — recomendo /discover
```

Disparado pelo Step 0 dos agentes (dev, qa, deyvin) quando `aioson memory:status` reporta cobertura < 4 ou stale > 30d.

### Tier 3 — push manual

```bash
aioson notify . --level=block --topic=git \
  --message="Push manual necessário: git push origin main"
```

Saída:

```
⛔ [git] Push manual necessário: git push origin main
```

Exit code 2.

## O que vai pra SQLite

Cada chamada de notify grava um evento em `.aioson/runtime/aios.sqlite` (tabela `agent_events`):

| Campo | Valor |
|---|---|
| `event_type` | `notify_info` / `notify_warn` / `notify_block` |
| `message` | o `--message` |
| `agent_name` | o `--agent` (ou `notify-<level>`) |
| `payload_json` | `{ "topic": "<t>", "level": "<l>" }` |
| `created_at` | ISO 8601 |

Para consultar histórico de notify:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT created_at, event_type, message
   FROM agent_events
   WHERE event_type LIKE 'notify_%'
   ORDER BY created_at DESC
   LIMIT 20;"
```

## Integração com dashboard

Se o AIOSON Dashboard (app separada) está rodando contra o mesmo `.aioson/runtime/aios.sqlite`:

- `/logs` mostra notify junto com o resto dos eventos (filtro por `event_type`)
- A linha do tempo de cada feature inclui notify de tier 2 e tier 3 da sessão

## Quando NÃO usar notify

- **Conteúdo persistente** (decisões, learnings, artefatos) — use devlog ou spec.
- **Saída de comando** (resultado de `aioson workflow:status`) — use stdout direto, sem prefix.
- **Erros de programação** (NaN, undefined, exception) — use `console.error` ou exit não-zero.
- **Mensagens longas** — notify é um one-liner. Para multi-line ou markdown, use devlog.

notify é sinal de **estado** — algo aconteceu, está acontecendo, ou vai precisar de humano.

## Customizar prefixos

Os prefixos estão hardcoded em `src/notify-renderer.js`:

```js
const LEVELS = {
  info:  { prefix: 'ℹ',  exitCode: 0 },
  warn:  { prefix: '⚠',  exitCode: 0 },
  block: { prefix: '⛔', exitCode: 2 }
};
```

Para mudar (ex: ambiente sem suporte a emoji), edite e regenere a build. Não há config dinâmica — a intenção é que os prefixos sejam reconhecíveis em telas de log compartilhadas.

## Continue lendo

- [Autonomy Contract](./autonomy-contract.md) — quais comandos tier 2 disparam notify automaticamente
- [Troubleshooting](./troubleshooting.md) — como reagir a cada nível
