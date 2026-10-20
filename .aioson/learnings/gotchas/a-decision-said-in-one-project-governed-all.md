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

- Toda decisão promovida carrega `scope: project` e as identidades do projeto onde foi detectada. Um checkout responde por um CONJUNTO: a raiz resolvida, o remote próprio (`origin`, senão o único remote; nunca `upstream`, que é o pai comum de forks e starters) e o git dir comum (o mesmo para os worktrees), os dois últimos com o caminho do projeto dentro do repositório (dois projetos de um monorepo continuam dois). Só hashes curtos `p…` e um nome de exibição são guardados; credenciais, query string e fragmento nunca entram.
- A decisão vale onde qualquer chave gravada bate. Uma re-detecção que bate soma as chaves novas sem contar alcance: o primeiro `git remote add`, um `upstream` novo ou um worktree não transformam um projeto em dois. Alcance conta conjuntos disjuntos (`project_sets`); `projects` segue como a união plana, para leitores antigos.
- A busca pelo `.git` para no diretório home: um home versionado como dotfiles não é o repositório de todo projeto debaixo dele. `www.`, `ssh.github.com:443`, valor entre aspas ou com comentário no `.git/config` e as formas do Azure DevOps (`dev.azure.com`, `ssh.dev.azure.com/v3`, `*.visualstudio.com`) dão a mesma identidade. Alias de host do `~/.ssh/config` e `insteadOf` ainda contam como outro projeto.
- Decisões gravadas antes do conjunto (uma chave por projeto, `upstream` primeiro) seguem batendo: o checkout calcula também a chave antiga, e a próxima re-detecção migra o arquivo. Nada é reescrito em lote, e ler nunca reescreve.
- Ela vira `scope: operator` quando o mesmo sinal aparece num segundo projeto distinto, ou quando as palavras do usuário nomeiam todos os projetos (pt-BR/en/es: "em todos os meus projetos", "in every project", "en todos mis proyectos"). Só a citação decide: a paráfrase do agente generaliza ("in any repo") e nunca alarga. "Sempre"/"always" sozinho não é escopo; "todo o projeto" é local. Repetição no mesmo projeto nunca conta como alcance.
- O marcador não alarga quando uma negação o governa ("não vale para todos os projetos", "not in all my projects", "nem todos"), quando é sujeito de um possessivo distributivo ("every project has its own…", "todo projeto tem sua…") ou quando a mesma frase aponta um projeto ("aqui", "here", "this one", "neste", "só este"). Ação negada continua sendo escopo: "nunca use yarn em qualquer projeto" alarga.
- Citação de várias linhas fica numa linha só: uma linha `---` dentro dela fechava o frontmatter e a decisão voltava sem escopo, valendo em todo lugar.
- `op:list` (o recall do início de sessão) lista só o que vale no projeto atual; `--all` mostra todos. O `MEMORY.md` marca as linhas `— only in project <nome>` para quem lê sem CLI. `--scope=operator|project` em `op:capture`/`op:promote` para escolha explícita.
- Decisões anteriores, sem o campo, continuam valendo em todo lugar: o comportamento antigo não muda para o que já existe.
- Errar para o lado do projeto é seguro: uma preferência realmente global só vale onde foi dita até ser repetida em outro repositório; o contrário (regra local vazando) era o defeito.
- Por isso só frases inclusivas alargam. "Diferente dos outros projetos, aqui usamos tabs", "unlike other projects, this one…" e "each project has its own config" mencionam outros projetos para descrever uma regra local; os marcadores `outros projetos`/`other projects`/`cada projeto`/`each project` foram retirados.
- `--scope=project` sem projeto identificável (nem raiz AIOSON nem checkout git) é recusado em `op:capture` e `op:promote`, nunca rebaixado em silêncio para operator nem preso à pasta em que o shell está; em `op:promote` o escopo de projeto inclui o projeto atual, mesmo para proposta capturada antes de existir o campo.
- "Agora vale em todos os projetos" só aparece na passagem real de projeto para operator, e as linhas que `op:capture`/`op:promote` imprimem seguem o `interaction_language` do projeto (chaves `cli.operator_memory.*`).
- Os comandos `op:*` resolvem o projeto pelo argumento `[path]` (a raiz AIOSON que o contém) e leem a identidade no git config desse projeto; o diretório atual só vale sem argumento. Chamado de uma pasta pai, `op:capture todo-api …` prendia a decisão à pasta pai e `op:list todo-api` listava as decisões dela.
