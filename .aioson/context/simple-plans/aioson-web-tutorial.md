---
slug: aioson-web-tutorial
status: done
owner: dev
created_at: 2026-09-21
updated_at: 2026-09-21
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Tutorial aioson web

## Scope
Publicar um guia em português, para leigos, com exemplos de `web:discover` e `web:collect` e o lugar dos outros comandos `web:*`.

## Context selected
- Padrão visual: `tutorials/memories` (tokens e CSS) e o cartão do catálogo em `tutorials/index.html`.
- Comandos reais: `web:discover`, `web:collect`, `web:map`, `web:scrape`, `web:save`, `web:extract`.
- A pasta do catálogo é `tutorials/`, não `tutoriais/`.

## Implementation intelligence
- Reusar o CSS de leitura já usado por Squads. Script local só para tema, impressão e copiar comando.
- Exemplos com domínio `example`, marcados como fictícios.

## Done criteria
- O guia explica o que procurar, o que salvar e qual pasta abrir, sem prometer busca na internet inteira nem entendimento por embedding.
- O catálogo aponta para o guia.
- Âncoras internas existem e o JavaScript do guia não depende do script de memórias.

## Useful options considered
- Include now: exemplo completo, pasta resultante, tabela dos outros comandos, limites, glossário.
- Defer: simulação ao vivo contra um site real.
- Escalate: none.

## Out of scope
- Mudar o comportamento dos comandos.

## Expected files
- `tutorials/aioson-web/index.html` (support)
- `tutorials/aioson-web/style.css` (support)
- `tutorials/aioson-web/script.js` (support)
- `tutorials/index.html` (support)

## Verification
- Conferir âncoras e sintaxe do script.
- Abrir a página e checar desktop e largura estreita.

## Session state
Next step: done. Guia em `tutorials/aioson-web/index.html`, cartão no catálogo. Âncoras conferidas. Página aberta no Edge em 1440px e 390px; no celular os botões do topo empilham e o título cabe na tela.

## Notes
- A pasta do catálogo é `tutorials/`, não `tutoriais/`.
