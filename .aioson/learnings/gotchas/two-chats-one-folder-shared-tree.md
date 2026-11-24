---
title: "Dois chats na mesma pasta se atrapalhavam sem dizer onde"
scope: [parallel-sessions, workflow-gates, workflow-next, dev-resume, simple-plan, worktree]
paths:
  - src/lib/implementation-fingerprint.js
  - src/workflow-gates.js
  - src/lib/quality/checks.js
  - src/lib/workflow-binding.js
  - src/lib/dev-resume.js
  - src/commands/dev-resume.js
discovered_at: 2026-11-24
src: "AIOSON supervised session: um chat implementando uma feature e outro corrigindo outra parte do mesmo projeto, e 'conflitando — não o código, mas a árvore'"
status: corrigido no framework (visibilidade); isolamento total é do dono (worktree)
---

# Dois chats na mesma pasta se atrapalhavam sem dizer onde

## O que o consumidor sentiu

Uma feature num chat e correções em outra parte do sistema em outro chat, na mesma pasta: "está conflitando, e não o código em si". Nenhum erro dizia onde.

## O que a medição achou (projeto descartável, dois chats comuns, e leitura do consumidor real)

- **A árvore é uma só.** O gate técnico tira a impressão digital da árvore inteira (`git diff HEAD` + não rastreados). Outro processo editou um arquivo sem relação durante o `npm test` e o gate bloqueou com `implementation_changed_during_checks`, sem dizer qual arquivo (nem se foi o próprio check, o outro chat ou um commit que moveu o `HEAD`). A prova em cache também perdia o acerto a cada edição do vizinho.
- **A ligação do workflow é uma só por projeto.** O `pulse:update --feature=beta` do chat B tirava a ligação do chat A, e o `workflow:next --expect-feature=alpha` do A abortava; a mensagem mandava rodar `pulse:update` de volta, o que tira a ligação do B. O Simple Plan nunca tocou a ligação (o desenho já protegia esse caso).
- **O `dev-state.md` do projeto é a cópia de quem escreveu por último.** O estado de cada fio já era por feature (`features/<slug>/dev-state.md`), mas um chat que não nomeia a feature retomava o último que gravou, e `dev:resume-data` ignora Simple Plans por só olhar o `features.md`.

## Por que todo gate ficou verde

- **Superfície descoberta:** nada media "há mais de um fio de `@dev` aberto nesta pasta"; a retomada confiava num ponteiro por projeto.
- **Heurística errada:** o bloqueio por impressão digital enxergava *que* a árvore mexeu, nunca *o que* mexeu, e não distinguia o próprio check de um segundo chat.
- **Mensagem sem causa:** o mismatch nomeava o comando que move a ligação, não quem a moveu.

## O que agora impede em todo projeto

- `source_change` no resultado do gate (e `source.change` na evidência do `quality:run`): os arquivos que mudaram durante a execução e `head_changed`, de um `git --no-optional-locks status` tirado antes e comparado só quando as impressões digitais diferem. O bloqueio continua (o resultado não se prende a um só snapshot); a razão `implementation_changed_during_checks` é a mesma.
- O mismatch de binding diz quem escreveu o pulse por último e as duas saídas (sessão própria, worktree).
- `dev:resume-data` devolve `ambiguous: true` + `open_threads` quando o chat não nomeia a feature e há mais de um fio nos últimos 7 dias. Fio = `features/<slug>/dev-state.md` em andamento; não conta Simple Plan `done`/`abandoned`/`paused` (o lane deixa o dev-state `in_progress` ao terminar: medido no consumidor, 5 dev-states abertos eram 2 fios vivos), nem feature fechada no `features.md`.
- Doc roteado `.aioson/docs/dev/parallel-sessions.md` (evals + espelho): o que dois chats compartilham, regras de árvore compartilhada (stage explícito, nunca `git stash`/`checkout -- .`) e as duas isolações.

## Armadilhas

- O `workflow-gates` roda o check com `execSync`: um teste que edita o arquivo por `setTimeout` no mesmo processo nunca dispara durante a execução; o "outro chat" do teste é o próprio check escrevendo o arquivo, ou um processo filho.
- Worktree resolve tudo (árvore, índice, `HEAD`, `.aioson/`, pulse, binding — medido), mas o que o git não rastreia (`node_modules`, `.env`) não acompanha, e o caminho precisa ser curto no Windows. Isso é custo do dono, não automatizado (decisão: não existe `session:fork`).
- Não há alerta no `doctor` para "dois fios abertos": no consumidor real dois fios vivos eram trabalho legítimo, e um aviso permanente seria ruído.
- `git status` comum toma `index.lock` para renovar o índice, que é o lock que o outro chat disputa: use `--no-optional-locks` em toda leitura que roda durante o trabalho alheio.

Relacionado: [[two-registries-one-lie]], [[a-decision-said-in-one-project-governed-all]]
