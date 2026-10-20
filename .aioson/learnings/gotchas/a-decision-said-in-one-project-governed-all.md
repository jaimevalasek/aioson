---
title: "Uma decisão dita num projeto governava todos"
scope: [operator-memory, op-capture, op-list, op-promote, memory-loading]
paths:
  - src/operator-memory/project-scope.js
  - src/operator-memory/decision.js
  - src/operator-memory/proposal.js
  - src/commands/op-capture.js
  - src/commands/op-list.js
discovered_at: 2026-10-19
src: "AIOSON supervised session: revisão de técnicas de memória de longo prazo para agentes — a memória do operador segue a pessoa em todo repositório"
status: corrigido no framework
---

# Uma decisão dita num projeto governava todos

## O que se sentia

A memória do operador mora em `~/.aioson/operators/` e é carregada no início de toda sessão, em qualquer repositório. Authorization, exclusion e correction eram promovidas na primeira detecção, sem registro de onde vieram. "Aqui não use Tailwind", dito num frontend, virava regra em todos os projetos; "commit autônomo só neste repo" valia para todos.

## Por que passou

Escopo era tratado como propriedade da pessoa, mas é um fato de onde a frase foi dita. Nenhum campo guardava o projeto, e repetir dentro de um mesmo projeto contava como reforço, como se fosse alcance.

## O que impede agora

- Toda decisão promovida carrega `scope: project` e o projeto onde foi detectada (remote git normalizado, sem credenciais nem `.git`; sem remote, a raiz resolvida; só um hash curto `p…` e um nome de exibição são guardados).
- Ela vira `scope: operator` quando o mesmo sinal aparece num segundo projeto distinto, ou quando a citação nomeia todos os projetos (pt-BR/en/es: "em todos os meus projetos", "in every project", "en todos mis proyectos"). "Sempre"/"always" sozinho não é escopo; "todo o projeto" é local. Repetição no mesmo projeto nunca conta como alcance.
- `op:list` (o recall do início de sessão) lista só o que vale no projeto atual; `--all` mostra todos. O `MEMORY.md` marca as linhas `— only in project <nome>` para quem lê sem CLI. `--scope=operator|project` em `op:capture`/`op:promote` para escolha explícita.
- Decisões anteriores, sem o campo, continuam valendo em todo lugar: o comportamento antigo não muda para o que já existe.
- Errar para o lado do projeto é seguro: uma preferência realmente global só vale onde foi dita até ser repetida em outro repositório; o contrário (regra local vazando) era o defeito.
- Por isso só frases inclusivas alargam. "Diferente dos outros projetos, aqui usamos tabs", "unlike other projects, this one…" e "each project has its own config" mencionam outros projetos para descrever uma regra local; os marcadores `outros projetos`/`other projects`/`cada projeto`/`each project` foram retirados.
- `--scope=project` sem projeto identificável é recusado em `op:capture` e `op:promote`, nunca rebaixado em silêncio para operator; em `op:promote` o escopo de projeto inclui o projeto atual, mesmo para proposta capturada antes de existir o campo.
