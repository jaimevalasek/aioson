---
title: O que se notava ao lado do trabalho não tinha para onde ir
scope: memória de trabalho do projeto, observações fora do escopo, kernels de gateway, superfícies do dono
src: "AIOSON supervised session: ideia do dono (analogia da obra — reboco, cerâmica trincada, degrau a mais, cimento perto da betoneira), 2026-10-20"
---

# O que se notava ao lado do trabalho não tinha para onde ir

## O que acontecia

Enquanto um agente implementava uma feature, tudo que ele notava **fora** do escopo atual — um defeito num módulo de outra feature (a cerâmica trincada), uma ideia de produto (o degrau a mais, o corrimão de madeira), uma melhoria de processo (o cimento entregue mais perto da betoneira), um risco, uma escolha que a fase 4 ia precisar — só existia na conversa. Dois destinos: ou o agente "consertava de passagem" fora do escopo aprovado (o kernel do @dev manda "exact scope", mas não dizia para onde levar o achado), ou a próxima compactação apagava. O dono nunca via o leque.

Todo carregador existente era mais estreito que o problema: `op:capture` guarda decisões permanentes do operador; `decide`/`decision:add` são escolhas que se gravam ou bloqueiam; `mappings/{slug}/continuity.md` é temporário, preso à feature e some no close; `delivery-followups` só existem para defeito mínimo verificado no QA, com ritual JSON; learnings são escritos depois do fato; o dossiê é prosa que ninguém lê como pendência. Classificação: **superfície descoberta** — não havia carregador nem leitor.

## O que vale agora

- `aioson observe . --kind=<defect|idea|process|risk|question> --summary="<uma linha>"` grava em `.aioson/context/observations.json` (escritor único: o CLI). Feature e agente ativos por padrão; id determinístico por `(kind, resumo normalizado sem acento)` → repetição incrementa `seen`, item resolvido reabre com histórico; segredos redigidos na escrita (`telemetry-redaction`). Arquivo corrompido: leitores reportam, escritores recusam, nunca sobrescrevem.
- Superfícies (todas medidas, nenhuma depende de o agente lembrar): `workflow:status` (`Open observations: N (...)`, `openObservations` no `--json`, que o @neo imprime no dashboard), `context:brief` (o leque de cada agente, com o próximo passo), handoff do `workflow:next` (`[Observations] N open for @<next>`), `feature:close` (itens abertos da feature vão para o hub do projeto com `origin_feature`, **nunca apagados**; `--preflight` lista), `hygiene:scan` (`stale_observations` ≥ 30 dias), recap pós-compactação (itens tocados nas últimas 24 h, lidos do disco — não dependem de evento da sessão de hooks).
- Audiência por tipo: defect/risk → dev, qa, tester, planner (+pentester, sheldon para risk); idea → product, briefing, refiner, sheldon; question → cadeia da feature; process → só o dono. **Ideia é visível ao público dela em qualquer feature** (o @product sem feature ativa precisa ver o degrau a mais); defect/risk/question são presos à feature onde foram vistos ou aos caminhos tocados (medido no smoke: a primeira versão escondeu a ideia do @product).
- `observation:resolve --as=<fixed|planned|promoted|answered|dismissed>`: `planned`/`promoted` exigem `--ref` existente (caminho no projeto ou slug conhecido em `features.md`/briefings/done/prd) — desfecho gravado contra o nada é como um item se perde "tratado"; `dismissed`/`answered` exigem `--why`.
- Diretiva de captura no kernel de gateway (`## Memory capture`, byte-idêntica entre CLAUDE.md e AGENTS.md por teste). Orçamento < 4000 após `buildBlock`: couberam 167 chars cortando frases não pinadas e já cobertas por doc roteado (`Other specialists need evidence.`, `Between handoffs give only the next agent and why.`, a frase do continuity.md — os 7 kernels de feature e `handoff-persistence.md` continuam carregando-a). Receita: grep das frases candidatas em `tests/` antes de cortar; as cópias-raiz do repositório são `buildBlock(template)` e precisam ser reescritas junto.
- Doc roteado `.aioson/docs/observations.md` (`load_tier: trigger`, triggers en/pt-BR/es) em `MANAGED_FILES`, espelhado no workspace, provado por `observations.evals.json` (4 positivos + 2 negativos) no corpus shipped.

## Armadilhas

- O `context:guard` dispara regras de UI (`status-change-confirmation`, `management-home-widgets`) em edições de kernel/markdown — ruído, não violação.
- Bash deste repositório recusa qualquer `>` no comando (até dentro de `<kind>`): medições e smokes vão para script em arquivo + `node script.js`.
- O guard de tamanho (`code-size-limits`) cobra 60 linhas lógicas por função: anexar uma seção ao `runContextBrief` exige extrair `attachObservations`/`printObservations`.
