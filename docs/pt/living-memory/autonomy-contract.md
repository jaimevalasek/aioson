# Autonomy Contract — 3 tiers de autonomia

> O Autonomy Contract responde uma pergunta operacional: **o agente pode rodar este comando sozinho, ou precisa parar e pedir?** A resposta vive em `.aioson/config/autonomy-protocol.json` (schema v1.1) e é materializada nas configurações nativas de cada harness (Claude Code, Codex e OpenCode).

## A ideia em uma linha

Cada comando do AIOSON e cada padrão de shell entra em **um e apenas um** tier. O tier dita o UX:

| Tier | Intenção | UX | Exemplos |
|---|---|---|---|
| `tier1_silent` | Leitura, telemetria interna | sem notificação | `git status`, `aioson preflight`, `aioson context:health`, `agent:done` |
| `tier2_notified` | Mudanças em memória do framework | auto + notify inline (ℹ) | `memory:reflect-prepare/commit`, `workflow:next`, `dossier:*`, `notify` |
| `tier3_blocking` | Operações irreversíveis ou externas | bloqueia, pede humano (⛔) | `git push`, `npm publish`, `cloud:publish:*`, `genome:publish` |

A invariante mais importante: **tier 3 nunca é materializado em allow list de tool**, mesmo se um tool listar `tier3_blocking` em `derived_from_tiers`. O generator filtra hard. Operação irreversível sempre exige humano.

## O arquivo canônico

`.aioson/config/autonomy-protocol.json`:

```json
{
  "version": "1.1",
  "global_mode": "guarded",
  "tiers": {
    "tier1_silent": {
      "description": "Read-only and internal telemetry. Auto-execute without notification.",
      "shell_patterns": ["git diff *", "git log *", "git status", "ls *", "cat *", ...],
      "aioson_commands": ["preflight", "context:health", "memory:status", "agent:done", "doctor", ...]
    },
    "tier2_notified": {
      "description": "Changes to framework memory. Auto-execute plus inline notify.",
      "shell_patterns": [],
      "aioson_commands": ["memory:reflect-prepare", "memory:reflect-commit", "workflow:next", "notify", ...],
      "write_paths": [
        ".aioson/context/bootstrap/**",
        ".aioson/context/features/**",
        ".aioson/runtime/**"
      ]
    },
    "tier3_blocking": {
      "description": "Irreversible or external operations. Block and require human action.",
      "shell_patterns": ["git push *", "rm -rf *", "npm publish *", "curl * | sh"],
      "aioson_commands": ["cloud:publish:*", "genome:publish", "skill:publish", "squad:publish"]
    }
  },
  "tools": {
    "claude":   { "mode": "trusted",  "derived_from_tiers": ["tier1_silent", "tier2_notified"], "requires_tty": false, "max_auto_retries": 3 },
    "codex":    { "mode": "trusted",  "derived_from_tiers": ["tier1_silent", "tier2_notified"], "requires_tty": false, "max_auto_retries": 3 },
    "opencode": { "mode": "guarded",  "derived_from_tiers": ["tier1_silent"],                    "requires_tty": true,  "max_auto_retries": 0 }
  },
  "agents": {
    "committer": { "max_mode": "guarded" }
  }
}
```

Cada tool opta nos tiers via `derived_from_tiers`. Claude e Codex podem rodar tier 1 e 2 sem perguntar. OpenCode só roda tier 1 (rest é guarded — pergunta antes).

## Como vira permissão nativa por harness

Toda vez que `aioson update` ou `aioson setup` roda, o `permissions-generator` lê o protocol e escreve os arquivos nativos:

| Harness | Arquivo gerado | Formato | Merge |
|---|---|---|---|
| Claude Code | `.claude/settings.json` | JSON (`permissions.allow[]`) | Merge com entradas existentes (preserva customizações) |
| Codex CLI | `.codex/permissions.json` | JSON nativo | Sobrescreve (com backup) |
| OpenCode | `.opencode/permissions.yaml` | YAML | Sobrescreve (com backup) |

A versão anterior é sempre salva em `.aioson/backups/{timestamp}/permissions/`.

### Claude Code — conversão de patterns

`.claude/settings.json` usa `Bash(<spec>)` para cada regra. O generator converte:

| Pattern original | Vira |
|---|---|
| `git diff *` | `Bash(git diff:*)` |
| `git status` (exato, sem `*`) | `Bash(git status)` |
| `aioson preflight` (comando) | `Bash(aioson preflight:*)` |
| `cloud:publish:*` (tier 3) | **não aparece** |

Resultado típico para um claude trusted:

```json
{
  "permissions": {
    "allow": [
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git status)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "...",
      "Bash(aioson preflight:*)",
      "Bash(aioson memory:reflect-prepare:*)",
      "Bash(aioson workflow:next:*)",
      "..."
    ]
  }
}
```

Note que padrões tier 3 (`git push`, `npm publish`) **não estão na lista**. Cada vez que o agente tenta rodar um deles, Claude pergunta. Esse é o ponto.

### OpenCode

Modo `guarded` por padrão. Só tier 1 é auto-aprovado. Tudo o resto pergunta. Adequado para harnesses com TTY interativo onde o usuário acompanha cada ação.

## Notify — o canal visual

Sempre que tier 2 dispara, o AIOSON pode chamar:

```bash
aioson notify . --level=info --topic=memory --message="Atualizando bootstrap após mudança em src/routes/"
```

Saída:

```
ℹ [memory] Atualizando bootstrap após mudança em src/routes/
```

Três níveis, três prefixos, dois exit codes:

| Level | Prefixo | Exit code | Uso típico |
|---|---|---|---|
| `info` | ℹ | 0 | tier 2 disparou, agente acompanha |
| `warn` | ⚠ | 0 | algo merece atenção (bootstrap stale, drift) |
| `block` | ⛔ | 2 | tier 3 acionado — script wrapper precisa pausar |

Internamente, `notify` chama `runtime:emit` (registra em `agent_events` como `notify_<level>`) e renderiza. A telemetria fica para o dashboard ou queries SQL.

Detalhes completos em [notificacoes-info](./notificacoes-info.md).

## Adicionar um comando a um tier

Se você criou um comando novo (`aioson foo:bar`) e quer que ele rode sozinho em Claude e Codex:

1. Edite `template/.aioson/config/autonomy-protocol.json`:

```json
"tier1_silent": {
  ...
  "aioson_commands": [
    "...",
    "foo:bar"   // se for read-only
  ]
}
```

ou:

```json
"tier2_notified": {
  ...
  "aioson_commands": [
    "...",
    "foo:bar"   // se muda algo em .aioson/
  ]
}
```

2. Rode em qualquer projeto consumidor:

```bash
aioson update .
```

O hook do installer chama `permissions-generator` e regenera os 4 arquivos nativos. O comando passa a aparecer no allow list de cada harness aplicável.

**Nunca adicione a `tier3_blocking` por conveniência.** Esse tier é a barreira de segurança. Se um comando precisa rodar sozinho, ele vai em tier 1 ou tier 2.

## Backward-compat com v1.0

Projetos com `autonomy-protocol.json` versão 1.0 (sem o bloco `tiers`, com `shell_whitelist` e `aioson_whitelist` por tool) continuam funcionando. O generator detecta a versão:

- v1.1 com `tiers` + `derived_from_tiers` → união dos tiers (tier 3 filtrado)
- v1.0 ou v1.1 sem `derived_from_tiers` → cai nos `*_whitelist` legados do tool

Não há migration forçada. `aioson update` regenera com o que estiver lá.

## Diagnóstico — drift detection

`aioson doctor` (Fase 4) checa se os 4 arquivos nativos estão em sync com o protocol:

```bash
$ aioson doctor .
...
[FAIL] Native harness permissions are in sync with autonomy-protocol.json (2 drifted, 0 missing)
  Hint: Run `aioson doctor . --fix` to regenerate: .claude/settings.json, .codex/permissions.json.
```

`doctor --fix` chama `permissions-generator` e regenera. Backup do anterior fica em `.aioson/backups/`.

## Ambiente vs config

O Autonomy Contract não substitui as decisões do **usuário** no harness. Se você roda `claude --no-permissions` ou desabilita o allow list manualmente, o AIOSON respeita — ele só **escreve** o arquivo. Quem aplica é o harness.

## Continue lendo

- [Reflexão In-Harness](./reflexao-in-harness.md) — tier 2 em ação
- [Notificações inline](./notificacoes-info.md) — detalhes de levels e exit codes
- [Troubleshooting](./troubleshooting.md) — drift de permissions, tier 3 disparou, etc.
