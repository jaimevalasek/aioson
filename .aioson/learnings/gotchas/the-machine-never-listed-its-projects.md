---
title: "A máquina nunca listou os próprios projetos"
scope: [operator-memory, project-registry, op-profile, setup-detect, context-digest]
paths:
  - src/lib/project-registry.js
  - src/lib/operator-portfolio.js
  - src/commands/op-profile.js
  - src/commands/setup-detect.js
  - src/lib/session-digest.js
  - template/.aioson/agents/setup.md
  - template/.aioson/docs/setup/onboarding-flow.md
discovered_at: 2026-11-17
src: "AIOSON supervised session: a memória deveria mostrar como o usuário trabalha entre projetos — 58 project.context.md numa máquina e nenhuma superfície comparava as escolhas"
status: corrigido no framework
---

# A máquina nunca listou os próprios projetos

## O que se sentia

Cada projeto novo começava do zero: o `@setup` perguntava tipo, framework, idioma e Autopilot como se fosse o primeiro projeto da pessoa, embora a máquina tivesse dezenas com as mesmas escolhas. Nada dizia que 62 de 66 projetos estavam abaixo da versão da CLI.

## Por que passou

**Superfície descoberta:** a memória do operador guardava decisões, nunca projetos. Não existia lista de onde o AIOSON estava instalado; o único dado entre projetos era o registro de design, que serve para EVITAR repetir visual.

## O que impede agora

- `~/.aioson/projects.json`, gravado pelo `context:digest` (no máximo 1x/hora por projeto): só raízes com `project.context.md`; nunca dentro de `.aioson/`, nunca pasta descartável no tmp do sistema (a não ser que o home também esteja lá — sandbox de teste). Pasta sumida sai na próxima gravação.
- `op:profile` sem modelo: contagem por campo, padrões só com maioria clara (3+ projetos com o campo, metade do total, 60% num valor), desatualizados, hábitos. `--scan=<pasta>` importa os existentes.
- Tamanho e design aparecem mas nunca são sugeridos: tamanho é medido do escopo de cada projeto e o sistema visual nunca é pergunta de setup.
- `setup:detect --json` traz `portfolio` com as `flags` do `setup:context`; o projeto sendo configurado não vota; o `@setup` oferece como recomendado onde o workspace não prova nada e nunca grava sem confirmação.
- `context:digest` mostra `memory.habits` (até 5 decisões valendo em 2+ projetos) só quando existe alguma.
- Medido ao vivo: 66 projetos importados; uma pasta vazia recebeu web_app 55/66, Node 44/66, pt-BR 66/66, Autopilot 34/35.

## Para diagnosticar

`aioson op:profile --json`: `projects` 0 com sessões abertas em projetos reais = digest não está registrando (memória desligada, `AIOSON_PROJECT_REGISTRY=false`, ou projeto sob o tmp). Padrão ausente = nenhuma maioria clara, por desenho.
