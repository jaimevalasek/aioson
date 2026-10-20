---
title: "Antes de escrever um adaptador de harness, meça o que o binário instalado suporta"
scope: [hooks-install, codex, opencode, claude, harness]
paths:
  - src/commands/hooks-install.js
  - src/lib/opencode-plugin.mjs
discovered_at: 2026-10-20
src: "AIOSON supervised session: revisão de compatibilidade do checkpoint pós-compactação entre harnesses"
status: receita
---

# Antes de escrever um adaptador de harness, meça o que o binário instalado suporta

## Quando usar

Sempre que uma funcionalidade depender de hook, plugin ou evento de um harness (Claude Code, Codex, OpenCode, Antigravity). O conhecimento do framework sobre o harness envelhece em meses: o instalador afirmava que "o Codex não tem hooks" numa versão em que `hooks` já era recurso estável e ligado por padrão.

## Sondas que respondem sem adivinhar

- **Codex**: `codex features list` (linha `hooks … stable true`), `codex --help` (flags como `--dangerously-bypass-hook-trust` denunciam o modelo de confiança), `codex <sub> --help`. Formato oficial: `~/.codex/hooks.json` com os eventos sob `hooks` (mesmo formato do Claude Code: `matcher`, `hooks[]`, `type: command`, `timeout`, `statusMessage`, `commandWindows`), eventos `SessionStart` (matchers `startup|resume|clear|compact|fork`), `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`; não há `PostToolUseFailure`. Tools: `Bash`, `apply_patch` (aliases de matcher `Edit`/`Write`), `update_plan`, `mcp__*`. Um hook novo só roda depois de confiado em `/hooks` (hash da definição).
- **OpenCode**: a API de plugin está instalada localmente em `~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` (interface `Hooks`) e os nomes de evento em `@opencode-ai/sdk/dist/gen/types.gen.d.ts` (`session.compacted`, `session.idle`, `file.edited`). Plugins locais ficam em `~/.config/opencode/plugins/` (global) ou `.opencode/plugins/` (projeto), exportação nomeada `async (ctx) => hooks`.
- **Configs do operador**: leia só os nomes de chave (`[hooks]`, `notify`, `[features]`), nunca valores — `config.toml`/`auth.json` carregam credenciais.
- **Docs oficiais** só para confirmar formato; o binário instalado é a verdade sobre o que roda nesta máquina.

## O que fazer com o resultado

- Formato igual ao do Claude Code → reaproveite `hooks:emit`/`hooks:recap` com `--source=<tool>` e um `build<Tool>Hooks` novo; `mergeHookEvents`/`scrubHookFile` cuidam de instalar e remover sem tocar nos hooks do usuário.
- Só API de plugin → gere um arquivo a partir de um template real (`src/lib/opencode-plugin.mjs`, carregado de verdade pelos testes), com assinatura na primeira linha para instalar e desinstalar sem sobrescrever arquivo alheio.
- Diferenças de payload (nome de tool, código de saída dentro de `tool_response`) entram no `hooks:emit`, nunca em prosa de kernel.
- Modelo de confiança que exige um humano (o `/hooks` do Codex) → as sessões que o framework abre sem ninguém no terminal precisam da porta de automação do próprio harness (`--dangerously-bypass-hook-trust`, global: vale em `codex`, `codex exec` e `codex resume`). Uma flag que só existe em builds recentes nunca entra em `yolo_args`: um binário antigo recusa argumento desconhecido e a sessão nem abre. Sonde `<binário> --help` uma vez por processo e acrescente no spawn (`src/lib/hook-trust.js`), só quando os hooks instalados são os nossos, deixando intactos os builders de argv que os testes e o `host:signature` fixam.
