---
title: "Uma onda de revisão verde ainda carregava 55 defeitos — a segunda leitura independente achou o que a primeira alegou ter resolvido"
scope: [review, process, cli, hooks, operator-memory, observations, store, cycle, static-gate, upgrade]
kind: gotcha
captured: 2026-10-20
src: "AIOSON supervised session: second-pass review of a 20-commit wave"
---

## O que se sentiu

A onda v1.74.0 (20 commits em um dia; suíte 6017/0, lint 0 novos, CI verde) tinha sido pedida como "revisão de bugs, lacunas e melhorias". O dono perguntou se "deu tudo certo". Cinco leituras independentes, uma por fatia (CLI, hooks, memória do operador, observações + Loja, ciclo), acharam 55 defeitos, 48 reproduzidos com script — vários contra as próprias alegações do CHANGELOG: "um módulo quebrado quebra só o próprio comando" (o `isQualityCommand` lazy carregava 6 módulos em 237 comandos e um `quality-bench` quebrado derrubava `hooks:emit`, `op:list`, `observe`); "negação nunca alarga" (6 negações comuns alargavam a decisão para todos os projetos); "`upstream` nunca identifica projeto" (a chave legada `remote:<upstream|origin>` levava decisões de um starter aos forks); "o token nunca viaja aberto" (installs, lists, grant e `workspace:init` ainda mandavam por `http://`); "a sessão recebe o checkpoint de volta" (vazio para toda sessão que atravessou o `aioson update`); "o bypass de trust nunca cobre hooks do usuário" (hooks em `config.toml`, no projeto e em plugins eram ignorados); o recall de 40 decisões guardava 1 das 30 exclusões do dono.

## Por que passava

- Suíte verde mede o que os testes pinam, e os testes da onda foram escritos por quem escreveu a correção, no formato que a correção previa: o ghost-run testado com o nome do agente sem `@` dos dois lados (o código real grava `@dev`), o recap testado só com eventos novos (os antigos não têm `session_id`), a negação testada com a negação colada no marcador.
- O gate estático perdeu a visão: `lazy(() => require(x), [names])` lê como "todos os exports usados" para o fallow e para o `audit:code`; 104 exports mortos de `src/commands/*` sumiram e a baseline regravada no mesmo dia os contou como resolvidos.
- Mudanças de forma (nomes curtos de review, `session_id` em eventos, conjuntos de identidade de projeto, `.sessions/@dev.json`) foram testadas no estado novo, nunca no upgrade de um projeto que já existia.
- Um teste de escopo escrevia no store real do operador havia 5 meses (4.422 identidades `test-scoping-*` em `~/.aioson/operators`) e outro gravava eventos no `.aioson/runtime` deste repositório: ninguém mede o que a suíte deixa fora da pasta temporária.

## O que impede agora

- 55 correções, cada uma com teste, em arquivos de posse exclusiva por fatia; a reclamação virou número antes do conserto (medianas de `hooks:emit`, contagens no store real, tabela de 47 citações de escopo em pt-BR/en/es, 300 sessões fechadas, 32 escritores concorrentes).
- `lazy` destrutura no `require` (o gate vê os exports de novo; `tests/cli-lazy-command-modules.test.js` pina que `--version` não carrega módulo de comando e `observation:list` não carrega `quality*`); a baseline foi regravada com a dívida visível, não "resolvida".
- Testes de upgrade: linhas sem `session_id`, draft e report com nome legado, sessão `.sessions/dev.json` legada, registro 1.73 sem `project_sets`, config antiga com `http://aioson.com`.
- Testes redirecionam HOME e o cwd para pastas temporárias; `tests/cycle-quality-test-inventory.test.js` impede o inventário de cobertura de apodrecer de novo.

## Regra de bolso

Uma onda que afirma "X nunca acontece" ganha um revisor que não escreveu X e que replica o cenário no estado *anterior* (projeto já instalado, store real, outro harness, repositório clonado). Alegação de CHANGELOG sem teste que a reproduza é achado, não prova. Quando a correção muda uma forma (nome, chave, id, formato), o teste obrigatório é o artefato antigo lido pelo código novo. E a prova do gate é olhar o que ele deixou de ver, não só o que ele acusou.
