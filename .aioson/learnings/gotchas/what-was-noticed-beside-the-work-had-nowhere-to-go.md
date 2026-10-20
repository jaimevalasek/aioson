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

- `aioson observe . --kind=<defect|idea|process|risk|question> --summary="<uma linha>"` grava em `.aioson/context/observations.json` (escritor único: o CLI). Feature e agente ativos por padrão; id determinístico por `(kind, resumo normalizado sem acento)` → repetição incrementa `seen`; um item resolvido visto de novo reabre (com histórico) só quando o desfecho dizia que a coisa tinha ido embora — `fixed`, ou `planned`/`promoted` cujo caminho sumiu ou cuja feature fechou; `dismissed`/`answered` continuam resolvidos em qualquer feature (a resposta vale, o observador lê o desfecho) e `--reopen` reabre com evidência nova (o `--detail` novo é anexado ao antigo e fica no histórico); segredos redigidos na escrita (`telemetry-redaction`). Arquivo corrompido: leitores reportam, escritores recusam, nunca sobrescrevem.
- Superfícies (todas medidas, nenhuma depende de o agente lembrar): `workflow:status` (`Open observations: N (...)`, `openObservations` no `--json`, que o @neo imprime no dashboard), `context:brief` (o leque de cada agente, com o próximo passo), handoff do `workflow:next` (`[Observations] N open for @<next>`), `feature:close` (itens abertos da feature vão para o hub do projeto com `origin_feature`, **nunca apagados**; `--preflight` lista), `hygiene:scan` (`stale_observations` ≥ 30 dias), recap pós-compactação (itens tocados nas últimas 24 h, lidos do disco — não dependem de evento da sessão de hooks).
- Audiência por tipo: defect → dev, qa, tester, quality, planner; risk → o mesmo + pentester e sheldon; idea → product, briefing, refiner, sheldon; question → refiner, product, sheldon, planner, dev, qa, tester; process → só o dono. **Ideia é visível ao público dela em qualquer feature** (o @product sem feature ativa precisa ver o degrau a mais); defect/risk/question são presos à feature onde foram vistos ou aos caminhos tocados **enquanto essa feature está viva no `features.md`** (planning/in_progress/paused/qa_failed/qa_blocked) — um slug sem linha viva (erro de digitação, `project`, `completed`/`shipped`, pasta só em `done/`) conta como do projeto (medido no smoke: a primeira versão escondeu a ideia do @product).
- `observation:resolve --as=<fixed|planned|promoted|answered|dismissed>`: `planned`/`promoted` exigem `--ref` existente (caminho no projeto ou slug conhecido em `features.md`/briefings/done/prd) — desfecho gravado contra o nada é como um item se perde "tratado"; `dismissed`/`answered` exigem `--why`.
- Diretiva de captura no kernel de gateway (`## Memory capture`, byte-idêntica entre CLAUDE.md e AGENTS.md por teste). Orçamento < 4000 após `buildBlock`: couberam 167 chars cortando frases não pinadas e já cobertas por doc roteado (`Other specialists need evidence.`, `Between handoffs give only the next agent and why.`, a frase do continuity.md — os 7 kernels de feature e `handoff-persistence.md` continuam carregando-a). Receita: grep das frases candidatas em `tests/` antes de cortar; as cópias-raiz do repositório são `buildBlock(template)` e precisam ser reescritas junto.
- Doc roteado `.aioson/docs/observations.md` (`load_tier: trigger`, triggers en/pt-BR/es) em `MANAGED_FILES`, espelhado no workspace, provado por `observations.evals.json` (4 positivos + 2 negativos) no corpus shipped.

## Revisão do mesmo dia (ce1e8620)

- **Escritor único não é escrita única.** O CLI era o único escritor, mas cada processo fazia leitura-modificação-escrita sem lock: 4 workers de lane ao mesmo tempo guardaram 4 de 16 itens, e um resolve correndo com um observe deixou JSON inválido (todo escritor passou a recusar). Agora todo escritor roda sob `withRegistryLock(dir, fn, { name: '.observations.lock' })` e grava por `writeAtomically`; o mesmo lock deixou de lançar `EPERM` sob contenção no Windows (o flake antigo do `.features.lock`).
- **Alcance do ciclo 80/20 medido por agente**, não por tipo: @briefing/@refiner começam no `context:select` (que não tinha leque), @tester/@pentester/@quality chamam o brief sem `--feature` (o brief agora usa a feature ativa), @quality não estava em público nenhum. Ao criar uma superfície, rode o comando de início de sessão de **cada** agente do ciclo e veja o que ele recebe.

## Revisão da 1.74.0

- **Vínculo vale enquanto a feature vive.** O leque escondia de todo agente um item preso a um slug que nenhuma linha viva do registro tem (`--feature=chekout`, `--feature=project`, linha `completed`, feature só em `done/`) — e nenhum close o carregava. Agora conta como do projeto no leque e em `observation:list --feature=project`, e `observe` com `--feature` explícito que não está vivo grava e avisa uma vez (`observe.feature_not_live`).
- **Desfecho que não pode mais ser julgado.** `planned`/`promoted` contra um caminho ficava resolvido para sempre, mesmo com o plano executado e o arquivo apagado; agora reabre quando o caminho some. `--reopen --detail=…` jogava fora a evidência nova quando já havia um detail.
- **Lock que não expira trava o hub.** Um marcador cujo PID vivia de novo (PID reaproveitado no Windows, processo do WSL) ou uma pasta de lock com um arquivo a mais (`Thumbs.db`) faziam todo observe esperar 10 s e falhar para sempre. Agora um marcador com mais de 30 s é velho seja qual for o PID, arquivos soltos não seguram a limpeza, e a mensagem de timeout diz o caminho e o que fazer; a troca atômica espera até ~2 s um leitor que segura o arquivo aberto (antes ~0,4 s).
- `--paths` relativos dados de uma subpasta agora são lidos a partir dela (antes `src/app.js` dado em `web/` virava `src/app.js` na raiz).

## Armadilhas

- O `context:guard` dispara regras de UI (`status-change-confirmation`, `management-home-widgets`) em edições de kernel/markdown — ruído, não violação.
- Bash deste repositório recusa qualquer `>` no comando (até dentro de `<kind>`): medições e smokes vão para script em arquivo + `node script.js`.
- O guard de tamanho (`code-size-limits`) cobra 60 linhas lógicas por função: anexar uma seção ao `runContextBrief` exige extrair `attachObservations`/`printObservations`. E 500 por arquivo: `src/lib/observations.js` está perto do teto (482 na 1.74.x) — lógica nova do hub vai para um módulo próprio.
