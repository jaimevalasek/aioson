# Hooks & Session Guard

> A camada que aplica as regras do projeto antes de cada escrita e registra o que o agente fez, sem nenhuma chamada manual ao CLI durante a sessão.

Os hooks fazem duas coisas:

1. **Antes de cada escrita ou edição de arquivo**, o `context:guard` lê o que está prestes a ser gravado e injeta as restrições das regras do projeto que valem para aquele arquivo.
2. **Depois de cada escrita, comando bash e fim de sessão**, um evento é gravado no SQLite — é assim que o dashboard enxerga a sessão.

---

## Instalados por padrão

`aioson init`, `aioson install` e `aioson update` instalam os hooks automaticamente. Você não precisa rodar nada a mais.

```bash
npx @jaimevalasek/aioson init meu-projeto     # instala template + hooks
npx @jaimevalasek/aioson install              # instala template + hooks
npx @jaimevalasek/aioson update               # atualiza template + (re)instala hooks
```

Durante a instalação você vê:

```
Instalando hooks do AIOSON (context:guard + telemetria de runtime) — desative com --no-hooks:
Detected tools: claude
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Claude Code — /home/user/.claude/settings.json
```

**Para não instalar**, use `--no-hooks`:

```bash
npx @jaimevalasek/aioson init meu-projeto --no-hooks
npx @jaimevalasek/aioson install --no-hooks
npx @jaimevalasek/aioson update --no-hooks
```

Nesse caso a saída avisa: `Hooks ignorados (--no-hooks). Instale depois com: aioson hooks:install`.

Três detalhes que valem saber:

- **Falha em hook nunca derruba o comando.** Se a instalação dos hooks falhar, o `init`/`install`/`update` continua e imprime `Falha ao instalar hooks (nao bloqueia)`.
- **A ferramenta-alvo vem do `--tool`.** Se você passou `--tool=claude`, `--tool=codex` ou (para hooks) `antigravity`, os hooks vão para essa ferramenta. Sem `--tool` reconhecido, o instalador detecta o que existe na máquina e configura tudo que encontrar.
- **O `update` também reinstala.** É exatamente ao atualizar um projeto antigo que a camada de hooks costuma estar faltando.

Por que o padrão é instalar: as regras do projeto em `.aioson/rules/` só chegam de fato no momento da escrita quando o `context:guard` está ativo. Sem ele, uma regra depende do agente ter carregado o contexto certo antes.

---

## Como funciona

```
Claude Code / Antigravity / Codex
  └─ agente VAI escrever src/cart.ts  (PreToolUse: Write)
       └─ hook dispara → aioson context:guard
            └─ deriva uma query do próprio arquivo (nome + conteúdo)
            └─ roda o motor do context:brief
            └─ injeta as restrições das regras salientes
            └─ sempre sai com código 0 — nunca bloqueia a ferramenta

  └─ agente escreveu src/cart.ts  (PostToolUse: Write)
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

## context:guard — regras aplicadas na hora da escrita

O `context:guard` roda como hook `PreToolUse` no Claude Code, casando `Write|Edit|MultiEdit|NotebookEdit`. Ele recebe o evento pendente por stdin, deriva a query do próprio artefato — nunca de uma lista de palavras-chave escrita pelo modelo — e devolve um bloco de contexto adicional quando alguma regra do projeto é realmente pertinente.

Ele é **advisory por construção**: o comando termina com `2>/dev/null || true` e sempre sai com sucesso. Nenhuma escrita é bloqueada.

### Quando uma regra é injetada

Uma regra precisa passar por todos estes filtros:

1. **Sinal forte no brief** — a regra foi selecionada por `triggers`, `paths`, `entities`, `aliases` ou `task_types`, não por palpite semântico nem por carregamento sempre-ativo.
2. **Confiança mínima `medium`** — briefs de confiança baixa nunca injetam.
3. **Escopo de caminho** — se a regra declara `paths:` (ou `globs:`) no frontmatter, o arquivo editado precisa casar com algum dos padrões. Uma regra com escopo declarado nunca injeta por sobreposição fuzzy de palavra-chave num arquivo fora dele.
4. **Escopo de superfície** — se a regra declara `guard_surfaces:`, o tipo de artefato editado precisa estar na lista.
5. **Opt-in de salience** — a regra declara `entities`/`aliases`, ou marca `guard: true` no frontmatter. Regras de baseline genéricas ficam caladas.

### Quando a violação fala mais alto que o vocabulário

Uma regra com verificador determinístico (`enforcement:`) também é injetada quando o verificador **encontra uma violação nova** no que está sendo escrito, mesmo que o texto não use nenhuma palavra da regra. Valem só os verificadores que leem um arquivo por vez (`source-code-language`, `no-native-dialogs`, `file-size`, `function-size`).

- **Código**: o arquivo é avaliado antes e depois da edição. Só a violação que a edição introduz conta; o débito antigo de um arquivo legado não volta a cada edição, e o débito aceito no `.aioson/context/rules-baseline.json` continua aceito.
- **Markdown de produto que os agentes escrevem em `.aioson/`** (plano, spec, PRD): é avaliado pelo código que nomeia. Entram os caminhos citados, os identificadores pedidos (`criarCliente()`, `ClienteServico`) e os blocos de código. O planner que escreve `src/modulos/clientes/servicoCliente.js` no plano recebe a regra de nomes com o achado exato antes de existir qualquer arquivo.
- Respeita `agents:` e `paths:` da regra. Markdown fora de `.aioson/` (docs, notas em `plans/` e `research/`, README/CHANGELOG) e os próprios arquivos de governança (`.aioson/rules`, `docs`, `skills`) nunca são julgados: eles falam SOBRE o produto e citam contraexemplos de propósito.
- A injeção traz o achado (`HIGH non-English filename "servicoCliente"`) junto com as duas primeiras restrições da regra. Só achados `HIGH` disparam.

### `guard_surfaces:` — vincular a regra ao tipo de artefato

As quatro regras de interação do framework (`form-fields-masks-and-validation`, `status-change-confirmation`, `status-flow-drag-and-drop`, `management-home-widgets`) declaram `guard_surfaces: [ui]`. Hoje `ui` é o único tipo, e o guard o detecta assim:

| Arquivo | Conta como `ui`? |
|---|---|
| `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` | Sim, pela extensão |
| `.md`, `.mdx` | Sim — briefings, manifestos e PRDs carregam contrato de interação |
| `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts` | Só se o conteúdo tocar o DOM (`document.querySelector`, `classList.`, `innerHTML`, JSX, `useState(`, `createRoot(`) |
| Qualquer outro (JSON, YAML, fonte de CLI, script de build) | Não |

Um arquivo *sobre* formulários não é um formulário. Sem esse vínculo, uma regra universal de interação aparecia dentro de código de CLI, dado JSON e harness de teste só porque o texto mencionava "form" ou "status".

Detalhes das quatro regras em [Regras de interação e gate visual](./regras-de-interacao-e-gate-visual.md).

### Rodar o guard na mão

```bash
# Simular o evento de uma escrita
echo '{"tool_name":"Write","tool_input":{"file_path":"src/form.jsx","content":"<input name=\"cpf\">"}}' | \
  aioson context:guard . --tool=claude --agent=dev --json

# Ou a partir de um arquivo de evento
aioson context:guard . --event-file=evento.json --json
```

Sem regra pertinente, a resposta é um objeto vazio. Com regra, vem `hookSpecificOutput.additionalContext` com as restrições, atribuídas por arquivo de regra.

### Instalar os hooks sem o guard

```bash
aioson hooks:install . --agent=dev --tool=claude --no-guard
```

`--no-guard` também remove um guard instalado antes — reinstalar com a flag limpa o hook `PreToolUse` de verdade.

---

## Passo a passo: Claude Code

### 1. Instalar os hooks

Se você rodou `init`, `install` ou `update` sem `--no-hooks`, isso já aconteceu. Use `hooks:install` quando quiser trocar o agente-dono, reinstalar depois de um `--no-hooks`, ou configurar só uma ferramenta.

### Qual agente o guard representa

O guard julga cada escrita com as regras do agente que está agindo **naquele momento**. Sem `--agent` (o caso de `init`, `install` e `update`), o comando do guard é gravado com `--agent=auto`, e o agente é resolvido em tempo de execução, nesta ordem:

1. o próprio evento do harness (`agent`, `agent_name`, `context.agent`);
2. a variável `AIOSON_AGENT`, que é exata e deve ser usada por quem lança uma sessão para um agente específico;
3. o `context:brief` mais recente do projeto nas últimas duas horas, porque todo agente consulta o brief antes de agir.

Sem nenhum sinal, vale `dev`. Com duas sessões paralelas no mesmo projeto, o item 3 é aproximado; use `AIOSON_AGENT` quando precisar de exatidão. Um `--agent=<id>` explícito continua fixo. A telemetria (`hooks:emit`) e o fim de sessão (`agent:done`) mantêm o agente da instalação.

```bash
# Instalação padrão: o guard resolve o agente ativo (--agent=auto)
aioson hooks:install . --tool=claude

# Fixar um agente (o guard deixa de resolver em tempo de execução)
aioson hooks:install . --agent=qa --tool=claude

# Sem o context:guard (só telemetria)
aioson hooks:install . --agent=dev --tool=claude --no-guard

# Preview sem modificar nada
aioson hooks:install . --agent=dev --tool=claude --dry-run
```

Saída:

```
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Claude Code — /home/user/.claude/settings.json

Hooks installed. From now on:
  • Before each file write/edit → context:guard injects salient project-rule constraints
  • Every file write/edit → logged as artifact event
  • Every bash command → logged as step_done event
  • Session end → logged as agent:done

To verify: aioson live:status . --agent=dev
To uninstall: aioson hooks:uninstall --tool=claude
```

Reinstalar é seguro: o instalador remove as entradas antigas do AIOSON antes de gravar as novas, e nunca mexe em hooks que você mesmo escreveu.

### 2. O que é adicionado em `~/.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [{
          "type": "command",
          "command": "aioson context:guard \"$PWD\" --tool=claude --agent='auto' --json 2>/dev/null || true"
        }]
      }
    ],
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
# Já feito pelo init/install/update. Só rode se você usou --no-hooks
# ou quer trocar o agente-dono / a ferramenta:
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
# Instalados por padrão pelo init/install/update. Para não instalar:
aioson init meu-projeto --no-hooks
aioson install . --no-hooks
aioson update . --no-hooks

# Instalar / reinstalar na mão
aioson hooks:install . --agent=dev --tool=claude
aioson hooks:install . --agent=dev --tool=antigravity
aioson hooks:install . --agent=dev --tool=all
aioson hooks:install . --agent=dev --tool=claude --no-guard   # só telemetria

# Remover hooks
aioson hooks:uninstall . --agent=dev --tool=claude

# Rodar o guard na mão (o hook chama sozinho)
aioson context:guard . --tool=claude --agent=dev --json

# Supervisor de sessão
aioson session:guard . --agent=dev --tool=claude &
aioson session:guard . --agent=dev --tool=claude --once
aioson session:guard . --agent=dev --tool=claude --idle-minutes=30 &

# Emissão manual (chamada pelo hook — raramente precisa chamar direto)
echo '{"tool_name":"Write","tool_input":{"file_path":"src/foo.ts"}}' | \
  aioson hooks:emit . --agent=dev --source=claude
```
