---
title: "A regra certa ficava muda no momento da violação"
scope: [context-guard, rules-check, edit-time, source-code-language, planner, dev, hooks]
paths:
  - src/lib/edit-time-enforcement.js
  - src/context-guard.js
  - src/commands/rules-check.js
discovered_at: 2026-10-07
src: "AIOSON supervised session: sonda planner/dev do guard sobre a regra de nomes em inglês, nesta árvore e num consumidor de dogfood"
status: corrigido no framework
---

# A regra certa ficava muda no momento da violação

## O que se sentia

A regra "identificadores, arquivos e pastas em inglês" existia, tinha verificador determinístico (`enforcement: source-code-language`) e valia para planner e dev. Mesmo assim:

| Momento | O guard injetava |
|---|---|
| planner grava o plano citando `servicoCliente.js` | uma regra de formulário (pela palavra "cadastro"); a de nomes ficava muda |
| dev grava `src/modulos/clientes/servicoCliente.js` com `criarCliente()` | nada |

Quando a regra disparava, era por coincidência: o texto editado continha um alias dela ("nomes de arquivos").

## Por que passou

Uma heurística errada. A saliência do guard era só por vocabulário (`entities`/`aliases` no texto ou `guard: true`). O verificador que prova a violação vivia no `rules:check`, que só roda sob demanda ou no fim da etapa, nunca no instante da escrita.

## O que impede agora

- `src/lib/edit-time-enforcement.js`: todo verificador do registro que lê um arquivo por vez (`reads: 'file'`: nomes, diálogos nativos, tamanho de arquivo e de função) julga a escrita pendente em memória. Ele avalia antes e depois da edição, conta só a violação nova e respeita o baseline aceito, `agents:` e `paths:`.
- Markdown que DECIDE código (plano, spec, arquitetura, design doc, manifesto, sob `.aioson/`) é julgado pelo código que nomeia: caminhos citados que ainda não existem, identificadores pedidos e blocos de código. Relatórios, PRDs, dossiês, arquivados, docs e notas citam, e não são julgados.
- A injeção traz o achado exato ("HIGH non-English filename "servicoCliente"") com duas restrições da regra; o diretório conta uma vez.
- Reprodução em 120 commits reais (1.243 arquivos, dois repositórios): zero alarme das regras vinculantes; avisos consultivos de tamanho só no commit que cruza o limite. A primeira versão julgava todo markdown e acusava relatórios de QA por citar o código que reportavam: medir o histórico antes de ligar é o que separa um guard útil de um que todos desligam.
- Armadilha corrigida no caminho: `old_string` em LF não casava num arquivo CRLF, e a reprodução da edição desistia em silêncio no Windows; a comparação agora é feita em LF.

## Receita

Para tornar uma convenção saliente no momento certo, dê a ela um verificador `reads: 'file'` no registro do `rules:check`; o guard passa a usá-lo sozinho. Antes de ligar um julgamento novo no guard, reproduza o histórico de commits de um consumidor real e leia os achados um a um.
