---
title: A melhoria percebida durante a implementação nunca chegava ao dono
scope: @dev, fim da tarefa, hub de observações, destinos de uma ideia (feature, Simple Plan, rascunho)
src: "AIOSON supervised session: ideia do dono — o @dev poderia apontar, ao terminar, o que notou que deixaria a entrega mais completa (ex.: um modal de detalhes ao lado da listagem) e oferecer três destinos, 2026-11-24"
---

# A melhoria percebida durante a implementação nunca chegava ao dono

## O que acontecia

Quem constrói uma tela vê o que falta nela — a listagem sem como abrir uma linha, o formulário sem estado vazio — e isso não está em nenhum CAP. O hub de observações (`aioson observe`, tipo `idea`) já existia, mas o caminho inteiro estava aberto em três pontos:

- **Ninguém registrava.** Dos 85 itens do store deste repositório, 6 vieram do `@dev` e nenhum era `idea`; o kernel do `@dev` não tinha uma palavra sobre `observe` (a diretiva vivia só no kernel de gateway, sobre o que está *fora do escopo*).
- **Ninguém mostrava no fim.** `idea` é endereçada a product/briefing/refiner/sheldon, então o handoff `DEV → QA` nunca a listava, e o relatório de conclusão do `@dev` não tinha onde citá-la.
- **Nenhum comando transformava a resposta em artefato.** `observation:resolve --as=planned|promoted` exige um `--ref` já existente: o dono decidia "vira Simple Plan" e alguém ainda tinha de escrever o plano à mão.

Classificação: **uncovered surface** (fim de tarefa e roteamento) mais **misfire** (o hub existia e não estava ligado ao fim do DEV).

## O que vale agora

- `.aioson/docs/dev/improvement-radar.md` (julgamento do `@dev`): o que merece uma linha, como registrar (`observe --kind=idea`), nunca construir, e a pergunta ao dono. O kernel aponta para ele na invariante *Exact scope*.
- `workflow:next --complete=dev` imprime `[Improvements] N idea(s) noticed while @dev built {feature}` (ideias abertas presas à feature, qualquer autor, até 5) com as três rotas e a saída "não quero", mais `[Scope additions]` para linhas aprovadas que nenhum PRD cita. O relatório de conclusão carrega `Improvements noticed:`.
- `aioson observation:route . --id=OBS-… --to=feature|simple-plan|draft` (`src/lib/observation-routing.js`): escreve o destino e só então encerra o item contra ele.
  - `feature` → linha em `features/{slug}/scope-additions.md`, desfecho `promoted`. **Não é escopo**: o PRD manda; `pendingScopeAdditions` mede quais ids nenhum `prd-{slug}.md` cita.
  - `simple-plan` → `simple-plans/{slug}.md` com `status: pending`, `source_observation` (molde dos follow-ups do QA), desfecho `planned`.
  - `draft` → linha `planning` no `features.md` (o apelido `rascunho` já era `planning`) + `plans/{slug}/idea.md`, o pacote-fonte que o `@briefing` lê; desfecho `promoted`.
  - Cada rota deixa **uma linha no Agent Trail do dossiê** da feature de origem (reaproveita `runDossierAddFinding`: valida o slug, cria o dossiê a partir do PRD/briefing se faltar, ignora repetição por hash); best effort — falha ou dossiê impossível de criar nunca desfaz a rota, e ideia sem feature não escreve nada.
  - `question` e `process` não roteiam; reexecutar reaproveita o artefato (queda entre escrever e encerrar não duplica); slug derivado da primeira oração, sem conectores pt/en/es, e leva o id no sufixo quando colide.
- Consultivo em tudo: nada aqui cria escopo, aprova ou satisfaz gate. Em Autopilot as ideias ficam abertas (o `feature:close` as leva ao hub) e entram no resumo final.

## Armadilhas

- **O kernel do `@dev` estava a 2 bytes do teto (12 800).** A adição saiu de texto não fixado (o milestone `Vertical slice started`, frases redundantes do dossiê e do `/compact`); antes de cortar, grep em `tests/` e em `tests/fixtures/kernel-binding/hard-constraints.json`.
- **`agent:done --agent=dev` nunca avança o fluxo** (`getCanonicalArtifactsForAgent` devolve `[]` → `no_canonical_artifact`): o `@dev` conclui por `workflow:next --complete=dev`, que é onde o bloco imprime. Uma reimpressão em `agent:done` seria código morto; há teste que fixa o fato.
- `src/cli.js` tem fins de linha mistos: edição por trecho de várias linhas falha em silêncio de âncora — inserir após uma linha achada pelo conteúdo, preservando o EOL detectado.
- Neste ambiente, `\\` e `\n` em scripts passados por heredoc chegam colapsados (virou quebra de linha real dentro de string, e `\[` perdeu a barra no regex): para texto com barras, use a ferramenta de edição de arquivo, não um script que gera código.
- Teste isolado com `node --test` no Windows dá `ENOTEMPTY` na limpeza de pastas temporárias, em testes diferentes a cada rodada; com `--require ./tests/setup/windows-fs-retries.js` (o que o `npm test` usa) fica verde.
