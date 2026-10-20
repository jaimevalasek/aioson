---
title: "Antes de escrever um adaptador de harness, meça o que o binário instalado suporta"
scope: [hooks-install, codex, opencode, claude, harness]
paths:
  - src/commands/hooks-install.js
  - src/commands/hooks-emit.js
  - src/lib/hook-settings-files.js
  - src/lib/hook-trust.js
  - src/lib/opencode-plugin.mjs
discovered_at: 2026-10-20
src: "AIOSON supervised session: revisão de compatibilidade do checkpoint pós-compactação entre harnesses"
status: receita
---

# Antes de escrever um adaptador de harness, meça o que o binário instalado suporta

## Quando usar

Sempre que uma funcionalidade depender de hook, plugin ou evento de um harness (Claude Code, Codex, OpenCode, Antigravity). O conhecimento do framework sobre o harness envelhece em meses: o instalador afirmava que "o Codex não tem hooks" numa versão em que `hooks` já era recurso estável e ligado por padrão. E o formato que se supõe também engana: o primeiro adaptador do Codex lia "o código de saída dentro de `tool_response`", que o Codex nunca manda — o teste passava porque a fixture tinha sido inventada com a mesma suposição.

## Sondas que respondem sem adivinhar

- **Codex**: `codex features list` (linha `hooks … stable true`), `codex --help` (flags como `--dangerously-bypass-hook-trust` denunciam o modelo de confiança), `codex <sub> --help`. Formato oficial: `$CODEX_HOME/hooks.json` (padrão `~/.codex`) com os eventos sob `hooks` (mesmo formato do Claude Code: `matcher`, `hooks[]`, `type: command`, `timeout`, `async`, `statusMessage`, `commandWindows`), eventos `SessionStart` (matchers `startup|resume|clear|compact|fork`), `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`; não há `PostToolUseFailure`. Tools: `Bash` (também o `exec_command`), `apply_patch` (aliases de matcher `Edit`/`Write`), `update_plan`, `mcp__*`. Um hook novo só roda depois de confiado em `/hooks` (hash da definição; a chave inclui a posição no arquivo).
- **O formato do payload, não só os nomes**: o binário do Codex traz o JSON Schema de cada entrada e saída de hook (procure `post-tool-use.command.input` nas strings do executável), e o código diz o resto — em `codex-rs/core/src/tools/context.rs`, o `tool_response` de um comando é o texto que o modelo vê, sem código de saída, e `tool_input` é `{ command }` (o patch do `apply_patch` também vem em `tool_input.command`). Os limites também moram no código: `SessionEnd` é cortado em 3 s (`discovery.rs` limita e avisa a cada início), `async` vale em todo evento menos `SessionEnd`, `commandWindows` roda por `cmd.exe /C`, `Stop` exige JSON ou nada no stdout.
- **OpenCode**: a API de plugin está instalada localmente em `~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` (interface `Hooks`) e os nomes de evento em `@opencode-ai/sdk/dist/gen/types.gen.d.ts` (`session.compacted`, `session.idle`, `file.edited`). O executável (Bun) traz o JavaScript em texto: dali saem a lista de tools (`apply_patch` existe e é a edição dos modelos GPT), o `metadata.exit` do `bash`, que todo hook é aguardado (`yield* trigger(...)`) e que a pasta global é `$XDG_CONFIG_HOME/opencode` (padrão `~/.config/opencode`). Plugins locais ficam em `<global>/plugins/` ou `.opencode/plugins/` (projeto), exportação nomeada `async (ctx) => hooks`.
- **Configs do operador**: leia só os nomes de chave (`[hooks]`, `notify`, `[features]`), nunca valores — `config.toml`/`auth.json` carregam credenciais.
- **Docs oficiais** só para confirmar formato; o binário instalado é a verdade sobre o que roda nesta máquina.

## O que fazer com o resultado

- Formato igual ao do Claude Code → reaproveite `hooks:emit`/`hooks:recap` com `--source=<tool>` e um `build<Tool>Hooks` novo; `src/lib/hook-settings-files.js` instala e remove handler por handler, só o que começa com o comando que o AIOSON gera, sem tocar nos hooks do usuário nem num arquivo que não consegue ler.
- Só API de plugin → gere um arquivo a partir de um template real (`src/lib/opencode-plugin.mjs`, carregado de verdade pelos testes), com assinatura na primeira linha para instalar e desinstalar sem sobrescrever arquivo alheio. Se o harness aguarda cada hook, a telemetria vai para uma fila que ninguém aguarda.
- Diferenças de payload (nome de tool, onde está o patch, um veredito que só o texto da saída sabe dar) entram no `hooks:emit`, nunca em prosa de kernel — e a fixture do teste copia o formato real, nunca o suposto.
- Modelo de confiança que exige um humano (o `/hooks` do Codex) → as sessões que o framework abre sem ninguém no terminal precisam da porta de automação do próprio harness (`--dangerously-bypass-hook-trust`, global: vale em `codex`, `codex exec` e `codex resume`). Ela vale para a invocação inteira, não por hook: só entra quando o `hooks.json` tem os hooks do AIOSON e nenhum outro, e só numa sessão desassistida pela própria flag de bypass. Uma flag que só existe em builds recentes nunca entra em `yolo_args`: um binário antigo recusa argumento desconhecido e a sessão nem abre. Sonde `<binário> --help` uma vez por processo e acrescente no spawn (`src/lib/hook-trust.js`), deixando intactos os builders de argv que os testes e o `host:signature` fixam. Mudanças no texto dos handlers saem juntas numa versão: cada uma custa ao usuário uma nova revisão no `/hooks`.
