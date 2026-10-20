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
- **A ferramenta-alvo vem do `--tool`.** Se você passou `--tool=claude`, `--tool=codex`, `--tool=opencode` ou (para hooks) `antigravity`, os hooks vão para essa ferramenta. Sem `--tool` reconhecido, o instalador detecta o que existe na máquina e configura tudo que encontrar.
- **O `update` também reinstala.** É exatamente ao atualizar um projeto antigo que a camada de hooks costuma estar faltando.

Por que o padrão é instalar: as regras do projeto em `.aioson/rules/` só chegam de fato no momento da escrita quando o `context:guard` está ativo. Sem ele, uma regra depende do agente ter carregado o contexto certo antes.

---

## Como funciona

```
Claude Code / Antigravity / Codex (hooks nativos) / OpenCode (plugin)
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

  └─ turno termina  (Stop no Claude Code e no Antigravity)
       └─ hook dispara → aioson hooks:emit --then=agent:done
            └─ grava a última fala e roda o agent:done no mesmo processo
            └─ fora de um projeto AIOSON não cria nada (nem .aioson/, nem aioson-logs/)

  └─ sessão termina  (SessionEnd no Codex e no Antigravity)
       └─ hook dispara → aioson hooks:emit --event=SessionEnd
            └─ grava o fim e fecha a sessão de hooks (a do live:start fica com o live:*)

  └─ conversa vai ser compactada  (PreCompact: Claude Code e Codex; no OpenCode, o plugin)
       └─ hook dispara → aioson hooks:emit
            └─ grava o marcador "compaction" na sessão

  └─ conversa recomeça compactada  (SessionStart com source "compact")
       └─ hook dispara → aioson hooks:recap
            └─ remonta o checkpoint a partir dos eventos gravados antes
            └─ injeta: agente, feature e próximo passo registrados, arquivos
               alterados, comandos que continuam falhando, último resultado de
               teste, plano (TodoWrite), notas de continuidade, última fala do agente
            └─ em qualquer outro início de sessão responde {} (nada injetado)
```

O `session:guard` é opcional — o `hooks:emit` já inicia a sessão automaticamente na primeira chamada se não houver uma ativa.

### Compactação: o checkpoint volta sozinho

A compactação troca a conversa por um resumo que o próprio modelo escreve, e são justamente os detalhes para continuar (arquivos tocados, teste que ainda falha, onde o plano parou) que um resumo perde. Pedir ao agente que anote isso antes é uma instrução em prosa, que perde para a vontade de seguir trabalhando. Os hooks já gravam esses fatos enquanto acontecem; por isso o checkpoint é remontado dos eventos, nunca do modelo. O texto injetado tem no máximo 2.000 caracteres, só linhas inteiras, e vem rotulado como dado gravado (verifique antes de confiar). Um comando que falhou e depois passou não aparece como falhando. Para ver o que seria injetado: `echo '{"source":"compact","session_id":"<id>"}' | aioson hooks:recap .`.

O checkpoint fala por **uma sessão do harness**. A sessão de hooks por agente é compartilhada por toda janela, todo lane worker e todo dia de trabalho no projeto; por isso o `hooks:emit` grava o `session_id` do harness em cada evento e o `hooks:recap` lê só a sessão do `SessionStart` (no OpenCode, `--session=<id>`; sob demanda sem nenhum dos dois, a sessão que gravou por último). Dentro dela, o que diz onde a sessão está — o agente, o plano, o que ainda falha, o último resultado de teste — é lido sobre a sessão inteira, então sobrevive à segunda compactação; o que o resumo perdeu — arquivos alterados, a última fala — vem do trecho desde a compactação anterior até o checkpoint (a telemetria que o Codex grava em segundo plano pode chegar depois do marcador do trecho a que pertence). Um evento sem `session_id` (gravado antes da 1.74, numa sessão que atravessou o `aioson update`, ou por um harness que não manda o id) ainda conta na run em que a sessão grava, a partir da compactação anterior. O próximo passo do `dev-state.md` é do @dev: só ele (ou um agente não registrado, com o rótulo `(@dev)`) o recebe; os outros recebem o estágio do workflow (`workflow.state.json`) e o artefato que o contrato de handoff espera deles. Tudo que volta foi gravado de ferramentas, nomes de arquivo e do próprio modelo, e entra no nível de sistema do harness: caracteres ocultos e comentários HTML saem, marcação em forma de tag é neutralizada, senhas fora do formato chave=valor (`mysql -pSegredo`, `sshpass -p`, `PGPASSWORD=`) viram `[REDACTED]`, e um item que se lê como instrução para uma IA é retido — só contado.

No Codex o caminho é o mesmo: `PreCompact` grava o marcador e o `SessionStart` com matcher `compact` injeta o envelope. No OpenCode o plugin faz as duas pontas: antes da compactação o checkpoint entra no prompt do resumo, e no primeiro turno depois dela entra no system prompt (`hooks:recap --when=always --session=<id> --json`, que para `--source=opencode` responde `{"additionalContext": …}` sem envelope). Sem hook instalado, os kernels `AGENTS.md`/`OPENCODE.md` mandam o agente rodar `aioson hooks:recap . --when=always` logo depois do `/compact` — a mesma remontagem, em texto; com hook, a repetição é inofensiva (o mesmo texto, no máximo 2.000 caracteres). O `hooks:recap` lê só a sessão em que os hooks escrevem (a do `live:start` ou a que o `hooks:emit` abre sozinho); a run própria de um agente oficial não é lida.

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

### Oferecido → cumprido: medir se a regra funcionou

Cada injeção fica registrada no runtime do projeto (`guard_injected`, só quando `.aioson/runtime/aios.sqlite` já existe), com as violações medidas que carregava. O `aioson context:usage .` refaz as verificações nos arquivos **como estão agora** e separa, por regra, a violação corrigida da que entrou e ficou:

```
Guard at write time: 12 injections — measured violations fixed 9, still present 2, file gone 1.
- .aioson/rules/source-code-language-convention.md: injected 7 · violations fixed 5 / still present 2
```

"Still present" em uma regra é o sinal de que a prosa dela está perdendo para o modelo e de que ela pede uma verificação mais dura no fim da etapa (`rules:check`). Em plano, a reverificação pergunta se o documento AINDA cita o nome errado, mesmo depois de o arquivo ter sido criado com ele.

### O Jev como juiz das injeções por vocabulário

Com o Jev ativo no `aioson-models.json`, uma regra que o guard escolheu **só por vocabulário** (nenhum verificador mediu violação) passa por mais uma pergunta: "esta regra governa a mudança que está sendo escrita neste arquivo? Compartilhar uma palavra não basta". Abaixo de `min_noul`, a regra sai da injeção. É o caso de "cadastro" puxando a regra de formulário para uma referência de CLI.

- Uma violação medida nunca vai ao juiz.
- O veredito de cada par (regra, arquivo) vale para a sessão por 10 minutos, então a mesma regra não é julgada a cada edição do mesmo arquivo.
- Prazo de 3 s, sem nova tentativa. Jev desligado, fora do ar ou com resposta incompleta mantém a injeção: o guard nunca fica mais quieto porque o juiz falhou.
- `--no-jev` desliga o julgamento.

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

Sem nenhum sinal, vale `dev`. Com duas sessões paralelas no mesmo projeto, o item 3 é aproximado; use `AIOSON_AGENT` quando precisar de exatidão. Um `--agent=<id>` explícito continua fixo. A telemetria (`hooks:emit`) e o fim de sessão (`agent:done`) mantêm o agente da instalação; o agente ativado na sessão — `/aioson:agent:qa`, `@qa`, ou a Skill `aioson:agent:qa` que o próprio modelo chama num handoff — fica registrado nessa sessão, com ou sem `live:start`, e é ele que o checkpoint pós-compactação nomeia. Reinstalar sem `--agent` (`init`, `install`, `update`) mantém o agente e o agente do guard já instalados.

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
  • /aioson:agent:<name> typed in a session → logged as agent_activated
  • End of each turn → logged as agent:done (claude)
  • After a compaction → the session checkpoint comes back from the recorded events

To verify: aioson live:status . --agent=dev
To uninstall: aioson hooks:uninstall --tool=claude
```

A linha do `agent:done` só aparece para as ferramentas cujos hooks o rodam (Claude Code e Antigravity, no fim de cada turno); o `SessionEnd` do Codex só fecha a sessão de hooks, e o OpenCode não tem hook de fim de sessão.

Reinstalar é seguro: o instalador remove as entradas antigas do AIOSON antes de gravar as novas, e nunca mexe em hooks que você mesmo escreveu. Um `settings.json` que é um link (dotfiles) é gravado no arquivo para onde o link aponta, com as mesmas permissões — o link continua.

### 2. O que é adicionado em `~/.claude/settings.json`

(`$CLAUDE_CONFIG_DIR/settings.json` quando a variável está definida.) O instalador grava num arquivo ao lado e o renomeia por cima, e não toca num arquivo que não consegue ler naquele momento (preso por um editor ou antivírus): avisa e deixa intacto.

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
        "matcher": "Task|TodoWrite|Skill",
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
          "command": "aioson hooks:emit \"$PWD\" --then=agent:done --agent='dev' --source='claude' 2>/dev/null || true"
        }]
      }
    ],
    "PreCompact": [
      {
        "hooks": [{
          "type": "command",
          "command": "aioson hooks:emit \"$PWD\" --agent=dev --source=claude 2>/dev/null || true"
        }]
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [{
          "type": "command",
          "command": "aioson hooks:recap \"$PWD\" --agent='dev' --source='claude' --json 2>/dev/null || true"
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

Antigravity tem um sistema de hooks mais rico — inclui `SessionEnd`, o que elimina a necessidade do `session:guard`. Os hooks globais valem para toda sessão da máquina, por isso toda linha passa pelo `hooks:emit`, que sobe até a raiz do projeto e não cria nada fora de um projeto AIOSON (as linhas antigas `agent:done "$PWD"` e `live:start "$PWD"` criavam `.aioson/` em qualquer pasta onde uma sessão parasse).

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
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --agent='dev' --source='antigravity' 2>/dev/null || true" }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --agent='dev' --source='antigravity' 2>/dev/null || true" }]
      },
      {
        "matcher": "Task|TodoWrite",
        "hooks": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --agent='dev' --source='antigravity' 2>/dev/null || true" }]
      }
    ],
    "Stop": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --then=agent:done --agent='dev' --source='antigravity' 2>/dev/null || true" }],
    "SessionEnd": [{ "type": "command", "command": "aioson hooks:emit \"$PWD\" --agent='dev' --source='antigravity' --event=SessionEnd 2>/dev/null || true" }]
  }
}
```

**Workspace** (`.agents/hooks.json` na pasta do projeto — sobrescreve global):

Mesma estrutura, mas scoped para o projeto. Útil quando o agente varia por projeto. Reinstalar e desinstalar trabalham handler por handler, como no Claude Code e no Codex: um hook seu que só chama o aioson (`npx aioson …`) fica, e um handler do AIOSON ao lado de um seu no mesmo grupo sai sem levar o seu.

### 3. Diferença do Claude Code

| Feature | Claude Code | Antigravity |
|---|---|---|
| `SessionStart` hook | ✗ Não tem | ✓ Disponível |
| `SessionEnd` hook | ✗ Apenas `Stop` | ✓ Disponível |
| `SubagentStop` hook | ✗ Não tem | ✓ Disponível |
| Config location | `~/.claude/settings.json` | `~/.gemini/antigravity/` + `.agents/` |
| Workspace override | `~/.claude/projects/` | `.agents/hooks.json` |

Com Antigravity, como no Claude Code, o `hooks:emit` abre a sessão de hooks no primeiro evento; o `SessionEnd` a fecha (limpo), e o `Stop` grava a última fala e roda o `agent:done` no fim de cada turno.

---

## Passo a passo: Codex (OpenAI)

O Codex CLI tem hooks nativos no mesmo formato do Claude Code (`hooks.json` com os eventos sob `hooks`, grupos por `matcher`, handlers `command`), com os mesmos campos no stdin e o mesmo envelope `hookSpecificOutput` na resposta. O `aioson hooks:install --tool=codex` escreve em `~/.codex/hooks.json`, preservando os hooks que já estavam lá.

### 1. Instalar

```bash
aioson hooks:install . --agent=dev --tool=codex
```

Saída:

```
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Codex — /home/user/.codex/hooks.json
  ⚠ Codex runs a new or changed hook only after you trust it: open Codex and run /hooks once — one review covers every AIOSON hook this version changed (automation may pass --dangerously-bypass-hook-trust).
```

O arquivo é `$CODEX_HOME/hooks.json` quando `CODEX_HOME` está definido — o mesmo lugar onde o Codex procura.

### 2. Confiar nos hooks (uma vez)

O Codex só executa um hook novo ou alterado depois que você o revisa: a confiança é gravada pelo hash da definição. Abra o Codex, rode `/hooks`, confira as entradas `aioson …` e confirme. Ao reinstalar com outro agente o hash muda e a revisão volta a ser pedida; uma reinstalação idêntica (o `update` de todo dia) não toca no arquivo e a confiança continua valendo. Uma versão do AIOSON que muda os hooks muda todos de uma vez: uma revisão no `/hooks` cobre a mudança inteira. Automação que já valida o arquivo pode usar `codex --dangerously-bypass-hook-trust`.

As sessões que o próprio AIOSON abre sem ninguém no terminal não têm como passar pelo `/hooks`, e o AIOSON responde pelos hooks que ele mesmo instalou: um lane worker (`execution:run`) e uma sessão `live:start` sem aprovações recebem `--dangerously-bypass-hook-trust` automaticamente, quando tudo isto vale:

- a sessão é desassistida pela própria flag de bypass do host — a do registro ou uma passada por você em `--tool-args` (`--dangerously-bypass-approvals-and-sandbox`, `--yolo`). Com `--permission-mode=default`, ou com `--tool-args "-a on-request"`/um sandbox seu, há alguém no terminal, e a revisão continua pelo `/hooks`;
- o Codex não carregaria nenhum outro hook: só os do AIOSON no `hooks.json`. A flag vale para a invocação inteira, não por hook — tudo que o Codex achar roda sem revisão —, então conta como hook seu (`foreign_hooks`, com o arquivo em `source`): outro handler no `hooks.json`; uma tabela `hooks` no `config.toml` da mesma camada (`[features] hooks = true` é só o liga-desliga, não conta); uma camada de projeto (`.codex/hooks.json`, `.codex/hooks` ou `hooks` no `.codex/config.toml`, da pasta da sessão até a raiz do repositório); um plugin com hooks (`hooks/hooks.json` ou a chave `hooks` no `plugin.json`, em `plugins/` do Codex);
- o `codex --help` instalado lista a flag (um Codex antigo não a conhece e recusaria o argumento). Uma resposta positiva vale para o processo inteiro; uma sondagem que falhou ou estourou o tempo é refeita no próximo lançamento.

A flag nunca é acrescentada por cima de uma passada em `--tool-args`. O `live:start --json` diz o que foi decidido em `launch.hook_trust`: `added`, `attended`, `hooks_not_installed`, `foreign_hooks`, `flag_unknown`, `caller_flag` ou `no_hook_trust`. Um lane worker nunca herda a sessão `live:start` de quem o abriu: ele nasce com `AIOSON_LIVE_SESSION=none`, que nenhuma sessão aberta adota (nem a única aberta do projeto, que é a de quem o abriu), e os hooks dele gravam a sessão dele.

### 3. O que é configurado

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "apply_patch|Bash|update_plan",
      "hooks": [{ "type": "command", "timeout": 30, "async": true,
                  "command": "aioson hooks:emit \"$PWD\" --agent='dev' --source='codex' 2>/dev/null || true",
                  "commandWindows": "aioson hooks:emit . --agent=dev --source=codex 2>nul & exit /b 0" }]
    }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "timeout": 30, "async": true, "command": "aioson hooks:emit …", "commandWindows": "…" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "timeout": 30, "async": true, "command": "aioson hooks:emit …", "commandWindows": "…" }] }],
    "PreCompact":       [{ "hooks": [{ "type": "command", "timeout": 30, "command": "aioson hooks:emit …", "commandWindows": "…" }] }],
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{ "type": "command", "timeout": 30, "statusMessage": "AIOSON: restoring the session checkpoint",
                  "command": "aioson hooks:recap \"$PWD\" --agent='dev' --source='codex' --json 2>/dev/null || true",
                  "commandWindows": "aioson hooks:recap . --agent=dev --source=codex --json 2>nul & exit /b 0" }]
    }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "timeout": 3,
                  "command": "aioson hooks:emit \"$PWD\" --agent='dev' --source='codex' --event=SessionEnd 2>/dev/null || true",
                  "commandWindows": "aioson hooks:emit . --agent=dev --source=codex --event=SessionEnd 2>nul & exit /b 0" }] }]
  }
}
```

`commandWindows` é o handler que o Codex executa no Windows (por `cmd.exe /C`), onde `"$PWD"` e `|| true` não existem: o `2>nul & exit /b 0` garante que um `aioson` fora do PATH ou uma falha nunca vire "hook failed" a cada chamada de ferramenta, e o `hooks:emit` resolve a raiz do projeto a partir do diretório atual — fora de um projeto AIOSON não cria nada. A telemetria roda `async` (o Codex segue enquanto ela grava); o marcador de compactação e o checkpoint continuam síncronos, para o marcador cair antes do resumo e o checkpoint antes da próxima requisição ao modelo. O `SessionEnd` tem no máximo 3 s no Codex: ele só grava o fim e fecha a sessão de hooks, sem os done-gates do `agent:done`.

### 4. Diferenças em relação ao Claude Code

| | Claude Code | Codex |
|---|---|---|
| Edição de arquivo | `Write`/`Edit`/`MultiEdit` com `file_path` | tool `apply_patch` com o patch em `tool_input.command`; o `hooks:emit` lê os cabeçalhos `*** Add File:`/`*** Update File:` (um `*** Move to:` registra o caminho novo) e registra cada arquivo; um `*** Delete File:` não conta como alteração |
| Comando que falha | `PostToolUseFailure` com `error` | chega como `PostToolUse`; o `tool_response` é o texto da saída, sem código de saída. Uma linha `Process exited with code N` (ou `Exit code: N`) decide para qualquer comando; sem ela, só um runner de teste (`npm test`, `pytest`, `jest`, `vitest`, `go test`, `cargo test`, `node --test`, `rspec`…) tem veredito, tirado do próprio resumo (`1 failed`, `1 error`, `FAIL`, `not ok` — um `not ok … # TODO`/`# SKIP` do TAP não conta). Outro comando (`git log` citando "3 failing tests", um `grep`) ou uma saída vazia fica sem veredito |
| Plano | `TodoWrite` | `update_plan` (mesmo resumo "Tarefas: N de M feitas") |
| Fim de turno / de sessão | `Stop` → `hooks:emit --then=agent:done` | `Stop` só grava a última mensagem; `SessionEnd` → `hooks:emit --event=SessionEnd`. Nenhum hook do Codex roda o `agent:done`: o kernel do agente o chama no fim do trabalho |
| Guard de regras (`PreToolUse`) | sim | não — a entrada do `apply_patch` é um patch, não um arquivo |
| Checkpoint pós-`/compact` | `PreCompact` + `SessionStart(compact)` | idem, mesmo envelope |

O wrapper shell das versões anteriores (`~/.codex/aioson-wrapper.sh`) vira um repasse na instalação: um alias que ainda aponte para ele continua abrindo o Codex, com um aviso de que está obsoleto. Tire o alias do seu `.bashrc` e apague o arquivo.

---

## Passo a passo: OpenCode

O OpenCode não tem hooks de shell: ele carrega plugins JavaScript de `~/.config/opencode/plugins/` (`$XDG_CONFIG_HOME/opencode/plugins/` quando a variável está definida) ao iniciar e chama os hooks que cada plugin devolve. O `aioson hooks:install --tool=opencode` escreve o plugin `aioson.js` nessa pasta e nunca sobrescreve (nem remove) um arquivo que não seja dele — nem um que não consegue ler naquele momento.

### 1. Instalar e reiniciar

```bash
aioson hooks:install . --agent=dev --tool=opencode
```

Saída:

```
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ OpenCode plugin — /home/user/.config/opencode/plugins/aioson.js
  ⚠ OpenCode loads plugins at startup: restart it to pick the plugin up.
```

### 2. O que o plugin faz

| Hook do OpenCode | O que o AIOSON grava |
|---|---|
| `tool.execute.after` (`write`, `edit`, `apply_patch`, `patch`, `bash`, `todowrite`, `task`) | `hooks:emit` no mesmo formato do `PostToolUse` do Claude Code; o `apply_patch` (a edição que o OpenCode dá aos modelos GPT) registra os arquivos do patch; um `bash` com `exit` diferente de 0 vira comando falhando |
| `chat.message` | o prompt — `/dev` ou `@dev` registra o agente ativado |
| `experimental.text.complete` | a resposta do agente, como alegação dele |
| `experimental.session.compacting` | marcador `compaction` e o checkpoint do `hooks:recap` (desta sessão do OpenCode) anexado ao prompt do resumo |
| `session.compacted` → `experimental.chat.system.transform` | o mesmo checkpoint injetado no system prompt do primeiro turno depois da compactação, uma vez |

O plugin só age em pastas que têm um projeto AIOSON (`.aioson/config.md` ou equivalente); em outros projetos não dispara processo nenhum. O OpenCode espera cada hook terminar, então a telemetria vai para uma fila e nunca é aguardada — um `aioson` por vez, no máximo 16 na fila —, e uma compactação espera a fila esvaziar antes de gravar o marcador, por no máximo 15 s. Cada chamada tem limite de 15 s e nunca lança erro para dentro do OpenCode, nem quando o `aioson` sai sem ler a entrada (fora do PATH, quebrado, encerrado no limite). Cada campo do payload tem tamanho máximo (prompt, resposta e descrição de sub-tarefa até 8.000 caracteres, com marca de corte; do `apply_patch` só vão as linhas `*** ` com os arquivos). No Windows o comando passa pelo `cmd.exe` com cada argumento escapado, então uma pasta como `R&D` continua sendo um argumento só. Se o `aioson` não estiver no PATH do OpenCode, defina `AIOSON_BIN` (por exemplo `node /caminho/sem/espacos/bin/aioson.js`).

### 3. Remover

```bash
aioson hooks:uninstall . --tool=opencode
```

---

## Instalar para todos os tools detectados

```bash
# Detecta automaticamente o que está instalado e configura tudo
aioson hooks:install . --agent=dev --tool=all
```

Saída com os quatro instalados:

```
Detected tools: claude, antigravity, codex, opencode
Hooks Install — agent: @dev
──────────────────────────────────────────────────
  ✓ Claude Code — /home/user/.claude/settings.json
  ✓ Antigravity global — /home/user/.gemini/antigravity/hooks.json
  ✓ Antigravity workspace — .agents/hooks.json
  ✓ Codex — /home/user/.codex/hooks.json
  ⚠ Codex runs a new or changed hook only after you trust it: open Codex and run /hooks once — one review covers every AIOSON hook this version changed (automation may pass --dangerously-bypass-hook-trust).
  ✓ OpenCode plugin — /home/user/.config/opencode/plugins/aioson.js
  ⚠ OpenCode loads plugins at startup: restart it to pick the plugin up.
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
| Antigravity | Não precisa — o `hooks:emit` abre a sessão no primeiro evento e o `SessionEnd` a fecha |

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
