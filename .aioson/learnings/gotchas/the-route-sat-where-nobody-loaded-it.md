---
title: "A rota existia, mas estava onde o agente que precisava dela não carregava"
scope: template/.aioson/docs/briefing/logged-in-screens.md, template/.aioson/agents/briefing.md, template/.aioson/agents/refiner.md, src/lib/credential-source-scan.js, src/commands/hooks-emit.js, src/lib/refiner/clean-round.js, src/lib/refiner/feedback-schema.js
src: "AIOSON supervised session: what escaped @briefing and @refiner, measured over 56 briefings, 11 review rounds, 169 questions and about 30 thousand shell commands (2026-11-06)"
---

# A rota existia, mas estava onde o agente que precisava dela não carregava

## O que aconteceu

Um `@briefing` precisou ver uma tela logada. O kernel proibia abrir fonte de credencial e não dava outro caminho, então ele leu o `.env`, criou uma sessão de admin e salvou uma nota ensinando o truque. A correção da onda anterior pôs a rota certa em `briefing-craft.md`, e o incidente repetido não a teria lido: esse módulo só carrega para problema genérico, e o `@refiner` não tinha rota nenhuma.

## Por que todo gate ficou verde

- **Gatilho que não dispara:** a orientação existia num módulo que o estado real não seleciona. O teste de `context:select` até fixa que uma tarefa comum não carrega esse módulo.
- **Prosa contra hábito:** a proibição estava só no kernel, e nada lia o que o agente rodava.
- **Autoavaliação:** o agente registrou a própria infração como nota de processo, e nenhuma máquina teria avisado o dono.

## O que agora impede

- `docs/briefing/logged-in-screens.md` está na tabela de módulos dos dois kernels, ao lado da regra, com teste de alcance.
- O hook marca o comando que lê `.env`, e `agent:done` avisa e registra uma observação para o agente cujo kernel traz a regra.
- `briefing:apply-feedback --confirm-if-clean` decide pelo arquivo salvo se a rodada ainda precisa de confirmação.
- `briefing:review` recusa recomendação de escopo sem promessa citada.

## Armadilhas

- **Tirar uma confirmação expõe o que ela escondia.** A revisão independente reproduziu dois defeitos antigos da página: reabrir a aba achatava o texto em uma linha, e um rascunho da rodada anterior preenchia as decisões da nova. Ninguém sofria com eles porque alguém dizia "confirmo" no fim. Ao fazer o salvamento aplicar sozinho, viraram escrita que ninguém escolheu. Antes de remover uma salvaguarda, teste o caminho inteiro em navegador real, não só a regra nova.
- **A cópia não é o arquivo.** A régua comparava as duas cópias do texto dentro do JSON, e as duas podem mudar juntas. O que muda é medido contra o `briefings.md`.
- **A medida precisa ver o comando inteiro.** O evento guarda 200 caracteres, e no incidente o `.env` começava exatamente no caractere 200. A checagem roda no hook, sobre o comando completo, e grava só o sinalizador.
- **Expressão regular não lê shell.** `grep -E ".env|secret"` parecia leitura, e `cat .env 2>/dev/null`, `bash -c "cat .env"` e `$(grep X .env)` passavam despercebidos. Separar o comando como o shell separa resolveu os dois lados, conferido nas marcações reais.
- **Rodada "limpa" não é rodada salva pelo dono.** Das 6 rodadas sem nota, só 1 veio do navegador. Nas outras 5 o agente preencheu o arquivo depois de uma frase no chat. Por isso há duas regras: a máquina reconhece a página salva, e a frase do dono vale como confirmação.
- **Hipótese medida antes de virar proposta.** Estimar o tamanho do plano no refiner parecia a melhoria óbvia. A correlação com as fases deu 0,26 em 37 features, e a ideia morreu antes de virar código.
- **Conte a resposta em texto livre também.** "Sempre escolhe refinar" era 5 de 5 nas perguntas estruturadas. Com a mesma pergunta feita em texto, a conta é 5 de 6.
