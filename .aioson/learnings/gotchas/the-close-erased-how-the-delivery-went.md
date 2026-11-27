---
title: O fechamento apagava como a entrega tinha ido
scope: feature:close, agent:done do @dev (Simple Plan), registros de resultado, avaliação da pessoa, dica no context:brief
src: "AIOSON supervised session: ideia do dono — guardar a melhor forma de fazer as coisas (ex.: telas em imagem dando resultado melhor que entregas passadas), dar a dica nas próximas features e, depois, ver o agregado no painel admin para melhorar o aioson para todos, 2026-11-27"
---

# O fechamento apagava como a entrega tinha ido

## O que acontecia

Nada comparava entregas: o `harness:retro` minera falhas de uma feature, o portfólio do operador mede o que a pessoa escolhe, e nenhum dos dois diz "com telas em imagem, o QA passou de primeira; sem, não". Pior: o sinal de "como foi" sumia no `feature:close`. O passo 6 poda o `aios.sqlite`, o arquivamento reduz `done/{slug}/` à documentação (todo `.json` de evidência sai), e os passos 2 e 2.5 reescrevem a linha do `features.md` e apagam o `workflow.state.json`.

Classificação: **uncovered surface**. Nenhuma medida existia para "prática → resultado".

## O que vale agora

- **Registro antes da poda.** Logo depois dos gates, antes de tudo o que reescreve ou arquiva, o fechamento grava `.aioson/outcomes/{slug}.json` (`src/lib/outcomes/`).
  - O conteúdo são práticas detectadas nos artefatos (`practices.js`, catálogo versionado) e resultados medidos (`measures.js`, o mesmo minerador do retro).
  - O esquema é fechado: só números, sim/não e categorias. O único texto livre é o comentário da pessoa, já limpo por `scrub.js`. O `ledger.writeRecord` recusa qualquer registro fora do esquema.
- **O Simple Plan não tem comando de fechamento.** O `agent:done` do `@dev` registra os planos com `status: done` tocados nos últimos 2 dias. Plano antigo nunca é registrado nem perguntado depois de um update.
- **`REPORT.md` só afirma com amostra.** É preciso ter 3 entregas com e 3 sem a prática, na mesma classificação. Evidência forte = 40 pontos de diferença no QA de primeira, ou 1 ponto na nota. O texto diz "associado a", nunca "causa".
- **Dica no `context:brief`, só para `@briefing`, `@refiner` e `@product`.** Sai uma linha, apenas quando a evidência é forte e a feature ativa ainda não usa a prática. O teto é `MAX_TIP_BYTES`.
- **Tela de avaliação.** É uma página local (127.0.0.1, token no caminho, CSP fechada) com nota de 1 a 5, "o que foi bom", "o que poderia ser melhor" e a prévia do texto limpo. Os botões são "Agora não", "Pausar por 1 semana", "Pausar por 1 mês" e "Não perguntar mais". Abre no máximo uma vez a cada 20 h.

## Armadilhas

- **O `feature:close` quase sempre roda pelo shell do agente, sem TTY.** Uma pergunta no terminal nunca apareceria. A tela é um processo destacado (`outcome:feedback --serve`) que abre o navegador e fecha sozinho, e o fechamento não espera por ele.
- **Nenhum teste pode abrir navegador.** `decideInvitation` recusa quando há `NODE_TEST_CONTEXT`, `CI`, máquina sem display, `AIOSON_FEEDBACK=off` ou projeto em pasta temporária com o home fora dela (a mesma regra do registro de projetos).
- **As imagens do briefing costumam viver fora de `plans/{slug}/`.** O registro `.aioson/briefings/config.md` aponta `source_plans` para outras pastas, ou o briefing nasce com outro slug e gera `prd-{slug}.md`. Seguindo só `plans/{slug}/`, a medição ao vivo deu 0 de 40 features com imagem; seguindo `source_plans` (sem sair do projeto) e as imagens citadas nos `.md`, deu 4.
- **Imagem colada no chat não fica no projeto.** Essa prática só é medida quando a tela é salva em `plans/` ou em `references/` do briefing.
- **Leitura ao vivo em projeto consumidor só com `buildRecord`, nunca com `recordOutcome`.** `buildRecord` não escreve; `recordOutcome` grava `.aioson/outcomes/`.
