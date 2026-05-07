# Hooks & Session Guard

> Visibilidade automática no dashboard sem nenhuma chamada manual ao CLI durante a sessão.

Por padrão, o dashboard só vê o que o CLI registrou explicitamente. Com o sistema de hooks, cada vez que o agente escreve um arquivo, roda um comando ou termina a sessão, um evento é automaticamente gravado no SQLite — sem o agente precisar chamar `aioson` manualmente.

---

## Como funciona

```
Claude Code / Antigravity / Codex
  └─ agente escreve src/cart.ts  (PostToolUse: Write)
       └─ hook dispara → aioson hooks:emit
            └─ verifica se live session existe
            └─ se não: auto-inicia sessão (session:guard ou auto-start inline)
            └─ grava evento "artifact" no SQLite + events.ndjson
            └─ dashboard atualiza em tempo real

  └─ agente roda npm test  (PostToolUse: Bash)
       └─ hook dispara → aioson hooks:emit
            └─ grava evento "step_done" no SQLite

  └─ sessão termina  (Stop / SessionEnd)
       └─ hook dispara → aioson agent:done
            └─ fecha a run, registra completion
```

O `session:guard` é opcional — o `hooks:emit` já inicia a sessão automaticamente na primeira chamada se não houver uma ativa.

---

## Passo a passo: Claude Code

### 1. Instalar os hooks

```bash
# Instalar hooks para o agente dev (padrão)
aioson hooks:install . --agent=dev --tool=claude

# Para outro agente (ex: qa)
aioson hooks:install . --agent=qa --tool=claude

# Preview sem modificar nada
aioson hooks:install . --agent=dev --tool=claude --dry-run
```

Saída:

```
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Claude Code — /home/user/.claude/settings.json

Hooks installed. From now on:
  • Every file write/edit → logged as artifact event
  • Every bash command → logged as step_done event
  • Session end → logged as agent:done

To verify: aioson live:status . --agent=dev
To uninstall: aioson hooks:uninstall --tool=claude
```

### 2. O que é adicionado em `~/.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "aioson hooks:emit \"$PWD\" --agent=dev --source=claude 2>/dev/null || true"
        }]
      },
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "aioson hooks:emit \"$PWD\" --agent=dev --source=claude 2>/dev/null || true"
        }]
      },
      {
        "matcher": "Task|TodoWrite",
        "hooks": [{
          "type": "command",
          "command": "aioson hooks:emit \"$PWD\" --agent=dev --source=claude 2>/dev/null || true"
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "aioson agent:done \"$PWD\" --agent=dev --summary=\"Session ended via dev hook\" 2>/dev/null || true"
        }]
      }
    ]
  }
}
```

O `2>/dev/null || true` garante que o hook nunca bloqueia o agente mesmo que o AIOSON falhe.

### 3. Verificar que está funcionando

```bash
# Abrir Claude Code e fazer qualquer edição de arquivo
# Depois, checar o status:
aioson live:status . --agent=dev

# Ou ver eventos recentes:
aioson runtime:status . --json | jq '.recentEvents'
```

### 4. Remover os hooks

```bash
aioson hooks:uninstall . --agent=dev --tool=claude
```

---

## Passo a passo: Antigravity (Google)

Antigravity tem um sistema de hooks mais rico — inclui `SessionStart` e `SessionEnd`, o que elimina a necessidade do `session:guard`.

### 1. Instalar os hooks

```bash
aioson hooks:install . --agent=dev --tool=antigravity
```

Saída:

```
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Antigravity global — /home/user/.gemini/antigravity/hooks.json
  ✓ Antigravity workspace — .agents/hooks.json
```

### 2. O que é configurado

**Global** (`~/.gemini/antigravity/hooks.json`):

```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "aioson live:start \"$PWD\" --agent=dev --tool=antigravity --no-launch 2>/dev/null || true"
    }],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --agent=dev --source=antigravity 2>/dev/null || true" }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --agent=dev --source=antigravity 2>/dev/null || true" }]
      }
    ],
    "SessionEnd": [{ "type": "command", "command": "aioson agent:done \"$PWD\" --agent=dev --summary=\"Session ended via dev hook\" 2>/dev/null || true" }],
    "Stop": [{ "type": "command", "command": "aioson agent:done \"$PWD\" --agent=dev --summary=\"Session ended via dev hook\" 2>/dev/null || true" }]
  }
}
```

**Workspace** (`.agents/hooks.json` na pasta do projeto — sobrescreve global):

Mesma estrutura, mas scoped para o projeto. Útil quando o agente varia por projeto.

### 3. Diferença do Claude Code

| Feature | Claude Code | Antigravity |
|---|---|---|
| `SessionStart` hook | ✗ Não tem | ✓ Disponível |
| `SessionEnd` hook | ✗ Apenas `Stop` | ✓ Disponível |
| `SubagentStop` hook | ✗ Não tem | ✓ Disponível |
| Config location | `~/.claude/settings.json` | `~/.gemini/antigravity/` + `.agents/` |
| Workspace override | `~/.claude/projects/` | `.agents/hooks.json` |

Com Antigravity, a sessão é aberta no `SessionStart` (limpo) e fechada no `SessionEnd` (limpo). Com Claude Code, o `hooks:emit` auto-inicia a sessão na primeira tool call.

---

## Passo a passo: Codex (OpenAI)

Codex CLI **não tem sistema de hooks nativo**. A solução é um wrapper shell que envolve o comando `codex`.

### 1. Gerar o wrapper

```bash
aioson hooks:install . --agent=dev --tool=codex
```

Saída:

```
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Codex wrapper — /home/user/.codex/aioson-wrapper.sh
  ⚠ Codex has no native hooks. Add this to ~/.bashrc:
    alias codex='/home/user/.codex/aioson-wrapper.sh'
  Or rename: mv $(which codex) $(which codex)-bin
```

### 2. Ativar o wrapper

**Opção A — Alias (recomendado):**

```bash
echo "alias codex='~/.codex/aioson-wrapper.sh'" >> ~/.bashrc
source ~/.bashrc
```

**Opção B — Rename:**

```bash
mv $(which codex) $(which codex)-bin
cp ~/.codex/aioson-wrapper.sh $(which codex)-bin/../codex
chmod +x $(which codex)-bin/../codex
```

### 3. O que o wrapper faz

```bash
# Quando você roda: codex "implemente o cart"
# O wrapper executa:
aioson live:start "$PWD" --agent=dev --tool=codex --no-launch  # abre sessão
codex-bin "implemente o cart"                                   # roda Codex
aioson agent:done "$PWD" --agent=dev --summary="..."           # fecha sessão
```

**Limitação:** sem hooks nativos, não há eventos intermediários (só abertura e fechamento de sessão). Para eventos durante a sessão com Codex, use `devlog:watch` em paralelo.

---

## Instalar para todos os tools detectados

```bash
# Detecta automaticamente o que está instalado e configura tudo
aioson hooks:install . --agent=dev --tool=all
```

Saída se Claude Code e Antigravity estiverem instalados:

```
Detected tools: claude, antigravity
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Claude Code — /home/user/.claude/settings.json
  ✓ Antigravity global — /home/user/.gemini/antigravity/hooks.json
  ✓ Antigravity workspace — .agents/hooks.json
```

---

## session:guard — supervisor de sessão

O `session:guard` é um processo de fundo que garante que uma live session esteja sempre ativa. Útil quando você quer que a sessão apareça no dashboard **antes** da primeira tool call.

```bash
# Iniciar em background
aioson session:guard . --agent=dev --tool=claude &

# Com idle timeout customizado (padrão: 60 minutos)
aioson session:guard . --agent=dev --tool=claude --idle-minutes=30 &

# Verificação única (sem loop — útil para scripts)
aioson session:guard . --agent=dev --tool=claude --once
```

Saída durante operação:

```
[session:guard] Watching: /meu-projeto
[session:guard] Agent: @dev | Tool: claude | Idle timeout: 60m
[session:guard] Press Ctrl+C to stop.
[session:guard] Session started: guard-dev-1711234567 (run: dev-run-xxx)
... (silencioso até próximo evento)
[session:guard] Idle for 62m — closing session
[session:guard] Session closed: dev-run-xxx (Idle for 62 minutes)
```

Para parar: `Ctrl+C` ou `kill %1`.

### Quando usar session:guard

| Cenário | Recomendação |
|---|---|
| Usando Claude Code com hooks instalados | `session:guard` é opcional — `hooks:emit` auto-inicia |
| Quer que a sessão apareça no dashboard antes de começar | Use `session:guard --once` antes de abrir o Claude Code |
| Sessões longas com pausas > 60 min | Use `session:guard --idle-minutes=120` |
| Antigravity | Não precisa — `SessionStart` hook cuida disso |

---

## hooks:emit — o que cada tool registra

| Tool call | Tipo de evento | Exemplo de mensagem |
|---|---|---|
| `Write` (criar arquivo) | `artifact` | `Write: cart.ts` |
| `Edit` / `MultiEdit` | `artifact` | `Edit: src/cart.ts` |
| `Bash` (rodar comando) | `step_done` | `$ npm test -- --filter=cart` |
| `Task` (sub-agente) | `note` | `Task launched` |
| `TodoWrite` | `note` | `Task list updated` |
| `Read`, `Glob`, `Grep` | *(ignorado)* | Ferramentas somente-leitura não geram eventos |

### Emissão manual durante sessão

Mesmo com hooks instalados, você pode emitir eventos adicionais manualmente:

```bash
# Checkpoint de plano com progresso
aioson runtime:emit . --agent=dev \
  --type=plan_checkpoint \
  --plan-step=FASE-1 \
  --summary="Migration criada e testada" \
  --progress-pct=40

# Blocker
aioson runtime:emit . --agent=dev \
  --type=task_blocked \
  --summary="Aguardando schema de pagamentos"
```

---

## Fluxo completo recomendado

### Setup inicial (uma vez)

```bash
# Instalar hooks para a ferramenta que você usa
aioson hooks:install . --agent=dev --tool=claude   # ou --tool=antigravity ou --tool=all
```

### Início de cada sessão de trabalho

```bash
# Opcional — garante sessão visível antes da primeira tool call
aioson session:guard . --agent=dev --tool=claude --once

# Abrir Claude Code / Antigravity normalmente
claude  # ou agy (Antigravity)
```

### Durante a sessão

Nada precisa ser feito — os hooks capturam automaticamente:
- Cada arquivo criado/editado → evento `artifact`
- Cada comando bash → evento `step_done`
- Tarefas no TodoWrite → evento `note`

### Fim da sessão

```bash
# Verificar o que foi registrado
aioson live:status . --agent=dev

# Acompanhar no dashboard
# abrir o aioson-dashboard e navegar até o projeto
```

---

## Verificação e diagnóstico

```bash
# Ver se a sessão está ativa
aioson live:status . --agent=dev

# Ver últimos eventos registrados
aioson runtime:status . --json | jq '.recentEvents[:5]'

# Ver se os hooks estão configurados (inspecionar settings.json)
cat ~/.claude/settings.json | jq '.hooks'

# Testar manualmente o hooks:emit (simula uma tool call Write)
echo '{"tool_name":"Write","tool_input":{"file_path":"src/test.ts"},"session_id":"test-123"}' | \
  aioson hooks:emit . --agent=dev --source=claude

# Ver se o evento chegou
aioson runtime:status . --json | jq '.recentEvents[0]'
```

---

## Troubleshooting

### "Nenhum evento aparece no dashboard"

1. Verificar se os hooks estão configurados: `cat ~/.claude/settings.json | jq '.hooks'`
2. Verificar se `aioson` está no PATH: `which aioson`
3. Testar manualmente: `aioson hooks:emit . --agent=dev --source=claude` (sem stdin — deve retornar `{ok:true,skipped:true}`)

### "Session not found quando rodo hooks:emit"

O `hooks:emit` cria a sessão automaticamente na primeira chamada. Se isso não está acontecendo:

```bash
# Verificar se existe banco SQLite
ls .aioson/runtime/aios.sqlite

# Se não existe, inicializar
aioson runtime:init .
```

### "Hook está bloqueando o Claude Code"

O hook usa `2>/dev/null || true` — nunca deve bloquear. Se estiver bloqueando:

```bash
# Verificar se o hooks:emit está travando
time echo '{}' | aioson hooks:emit . --agent=dev --source=claude
# Deve completar em < 200ms
```

### "Quero hooks só para o projeto atual, não global"

Para Claude Code, a configuração é sempre global (`~/.claude/settings.json`). Para limitar a um projeto específico, adicione uma condição no hook command:

```bash
# Hook condicional: só emite se estiver na pasta do projeto
[ "$PWD" = "/caminho/do/projeto" ] && aioson hooks:emit "$PWD" --agent=dev --source=claude 2>/dev/null; true
```

Para Antigravity, use `.agents/hooks.json` na pasta do projeto em vez do global.

---

## Referência rápida

```bash
# Instalar hooks
aioson hooks:install . --agent=dev --tool=claude
aioson hooks:install . --agent=dev --tool=antigravity
aioson hooks:install . --agent=dev --tool=all

# Remover hooks
aioson hooks:uninstall . --agent=dev --tool=claude

# Supervisor de sessão
aioson session:guard . --agent=dev --tool=claude &
aioson session:guard . --agent=dev --tool=claude --once
aioson session:guard . --agent=dev --tool=claude --idle-minutes=30 &

# Emissão manual (chamada pelo hook — raramente precisa chamar direto)
echo '{"tool_name":"Write","tool_input":{"file_path":"src/foo.ts"}}' | \
  aioson hooks:emit . --agent=dev --source=claude
```
