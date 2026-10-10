---
title: "Entregue, nunca fechado — QA PASS com a linha em andamento por semanas, e nenhum portão olhava"
scope: [features-md, feature-close, feature-triage, hygiene-scan, doctor, neo]
paths:
  - src/lib/feature-lifecycle.js
  - src/commands/feature-triage.js
  - src/lib/feature-registry.js
  - src/commands/hygiene-scan.js
  - src/doctor.js
  - src/commands/update.js
  - template/.aioson/agents/neo.md
  - template/.aioson/docs/neo/feature-lifecycle.md
discovered_at: 2026-10-09
src: "AIOSON supervised session: onze projetos consumidores medidos em modo somente leitura"
status: corrigido no framework
---

# Entregue, nunca fechado

## O que o consumidor sentiu

A parte de gerenciamento de features ficava suja: features abandonadas, pausadas há meses e
"em andamento" que já estavam entregues, com os arquivos todos no contexto vivo. Medido em onze
projetos (somente leitura):

- 11 features com QA PASS ainda `in_progress`/`paused`, em 5 projetos — uma delas parada há 37 dias;
- 6 linhas com status `in-progress` ou `active`, que nenhum leitor reconhece (roteamento,
  sweep e hygiene comparam o token exato);
- 5 features `done` com arquivos ainda no contexto vivo num único projeto;
- features abertas sem nenhuma atividade de 28 a 66 dias, e uma pausada há 140;
- o @neo via tudo isso e só podia relatar: o kernel proibia qualquer limpeza.

## Por que todo portão ficou verde

- **Disparo que não acontecia:** fechar dependia de um agente lembrar de rodar `feature:close`
  depois do QA. Nada notava "QA PASS sem fechamento".
- **Superfície descoberta:** nenhum eixo de idade existia — `hygiene:scan` via arquivamento
  pendente, nunca uma feature parada.
- **Heurística errada:** os leitores casam `in_progress` literalmente; `in-progress` caía em
  "Other" e sumia do roteamento, do sweep e do `hygiene:scan`.
- **`spec-analyze-{slug}.json`** era lido como `spec-{analyze-slug}` e virava falso órfão.

## O que agora impede

- `src/lib/feature-lifecycle.js` mede cada linha pelo contexto, não pelo que o agente escreveu:
  `ready_to_close` (QA PASS e linha aberta; `changed_after_qa` quando spec/plano mudou depois do
  veredito), `stale_open`/`stale_paused` (21/60 dias sem atividade; a feature ativa nunca é
  parada), `status_alias`, `closed_not_archived`, pulse apontando para feature fechada. Cada
  achado diz quem decide: `auto` (mecânico) ou `owner`.
- `feature:triage` lê por padrão; `--apply` faz só o mecânico (grafias via `feature:tidy`,
  sweep, pulse); `--close/--pause/--abandon/--resume` aplicam a decisão do dono pelos comandos
  donos. Uma recusa (sem QA PASS atual, spec mudou, feature ativa sem `--include-active`) e nada
  muda; o close nunca é forçado.
- O dono único do `features.md` reescreve as grafias (`in-progress`/`active` → `in_progress`,
  `on-hold` → `paused`, `cancelado` → `abandoned`); grafias de entrega (`completed`) nunca viram
  `done`.
- Disparo automático: `hygiene:scan` (que o @neo roda em toda ativação) ganhou
  `features_ready_to_close`, `stale_features` e `feature_status_aliases`; `doctor` e `update`
  avisam com `context:feature_lifecycle`; o doctor passou a mostrar `[WARN]` para aviso.
- O @neo tem um segundo modo de manutenção guardado (`docs/neo/feature-lifecycle.md`): diagnóstico,
  uma pergunta, prévia `--dry-run`, execução só pelo `feature:triage`.

## Receita

Um estado que só muda quando alguém lembra precisa de um medidor que olha o resultado (o QA
passou?) e não o registro (a linha diz o quê?). E o medidor separa o que é mecânico do que é
decisão: o primeiro roda com uma aprovação, o segundo nome por nome.
