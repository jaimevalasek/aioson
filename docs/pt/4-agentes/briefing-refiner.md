# @briefing-refiner — Revisa e refina um briefing antes do PRD

> **Para quem é:** quem já tem um briefing gerado pelo `@briefing` e quer revisá-lo, anotar e refinar antes de comprometer um PRD.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que o `@briefing-refiner` faz e onde ele entra no fluxo.
> - Como funciona a superfície de revisão local em HTML e por que o feedback é estruturado (JSON), não o DOM.

## Para que serve

Entre o briefing gerado e o PRD há uma etapa que costuma ser pulada: **revisar o briefing com olhar crítico**. Ambiguidades, redundâncias, decisões faltando, riscos vagos e gaps de impacto de implementação passam direto para o `@product` e viram dívida no PRD.

O `@briefing-refiner` preenche essa etapa. Ele audita um briefing existente, gera uma **superfície de revisão local** (`review.html`) onde você edita cada seção, marca status e deixa notas, e depois aplica de volta ao briefing **apenas o feedback estruturado que você confirmar** — preservando o contrato do briefing (todas as seções obrigatórias).

É o complemento do [`@briefing`](./briefing.md): um gera, o outro refina.

## Quando invocar

- Você já tem um briefing em `.aioson/briefings/{slug}/briefings.md` e quer revisá-lo antes do PRD.
- O briefing está `draft`, ou `approved` mas ainda **sem PRD gerado** (`prd_generated: null`).
- Quer registrar comentários, pedir mudanças por seção ou marcar bloqueios antes de seguir para `@product`.

## Quando NÃO invocar

- Ainda não existe briefing — vá primeiro para [`@briefing`](./briefing.md).
- O briefing já gerou PRD (`prd_generated` preenchido) — refinar exigiria uma rota nova de PRD/enrichment, fora deste agente.
- A ideia mudou tanto que vale regerar do zero — volte ao `@briefing`.

## Dois modos de operação

### 1. Gerar revisão

Quando ainda não há feedback pendente. O agente audita o briefing e escreve a superfície de revisão:

```
Você > @briefing-refiner

@briefing-refiner > Briefing refinável encontrado: marketplace-v1 (draft).

                    Auditando seções... ambiguidades: 3, redundâncias: 1,
                    gaps de implementação: 2, riscos vagos: 1.

                    Gerei a revisão:
                    - .aioson/briefings/marketplace-v1/review.html
                    - .aioson/briefings/marketplace-v1/refinement-feedback.json
                    - .aioson/briefings/marketplace-v1/refinement-report.md

                    Abra o review.html, edite as seções, marque status/notas,
                    salve/exporte o refinement-feedback.json e me reative.
```

### 2. Aplicar feedback pendente

Quando existe um `refinement-feedback.json` com mudanças não aplicadas. O agente valida, resume o que vai mudar e **pede confirmação explícita** antes de tocar o briefing:

```
Você > @briefing-refiner

@briefing-refiner > Feedback pendente em marketplace-v1:
                    - 4 seções com mudança aceita
                    - 2 comentários não resolvidos
                    - 1 item bloqueante (modelo de comissão)

                    Aplico as 4 mudanças confirmadas? (o item bloqueante
                    impede o handoff para @product até ser resolvido)
Você > Sim.

@briefing-refiner > Aplicado. Como o briefing estava `approved` sem PRD,
                    voltei para `draft`. Relatório: refinement-report.md.
```

Se você recusar, o `briefings.md` fica intacto e as mudanças puladas são registradas no relatório.

## A superfície de revisão (review.html)

O diferencial deste agente. O `review.html` é **estático, local e self-contained**:

- sem servidor, sem scripts ou serviços externos;
- seções editáveis em texto puro, com layout denso de revisão;
- controles de status por seção: `unchanged`, `accepted`, `change_requested`, `remove_requested`, `blocked`;
- notas/comentários por seção e um resumo do que será feito, do que é incerto e do que bloqueia o PRD;
- filtros por ambiguidade, redundância, gap, risco, decisão pendente e sugestão de escopo;
- **exportar/baixar/copiar o JSON sempre disponível** (a File System Access API é só um plus opcional, após ação explícita).

> **Por que JSON e não o HTML editado?** O agente nunca trata o DOM/HTML editado como feedback canônico — só o `refinement-feedback.json` estruturado. Isso evita aplicar mudanças inferidas e mantém o processo auditável.

## Saídas em disco

| Arquivo | O que contém |
|---|---|
| `.aioson/briefings/{slug}/review.html` | Superfície de revisão local e editável |
| `.aioson/briefings/{slug}/refinement-feedback.json` | Feedback estruturado (a única fonte que o agente aplica) |
| `.aioson/briefings/{slug}/refinement-report.md` | Relatório do que foi aplicado, pulado ou bloqueado |
| `.aioson/briefings/{slug}/briefings.md` | Atualizado **apenas** após confirmação |
| `.aioson/briefings/config.md` | Índice/registro de briefings atualizado |

## Como ele lê seu projeto

1. `.aioson/config.md`
2. `.aioson/context/project.context.md`
3. `.aioson/briefings/config.md` — resolve o slug refinável (se ausente, roteia para `@briefing`).
4. `.aioson/briefings/{slug}/briefings.md` — lido antes de escrever qualquer artefato de revisão.

## Limites importantes (hard constraints)

- Nunca cria ou edita `prd*.md`.
- Nunca aprova um briefing automaticamente.
- Nunca roteia para `@product` enquanto houver itens bloqueantes.
- Nunca trata HTML/DOM editado como feedback canônico — só o JSON estruturado.
- Nunca descarta seções obrigatórias do briefing.
- Em V1, não há comando CLI dedicado de refinement — tudo passa pelo agente.

## Opção `--help`

Uma ativação com `--help` (`/briefing-refiner --help`) imprime um resumo rápido — o que faz, quando usar, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

## Handoff típico

- **Vem de:** [`@briefing`](./briefing.md) (briefing gerado) ou de você, retomando uma revisão.
- **Vai para:** depois de aplicar as mudanças e sem bloqueios → `aioson briefing:approve . --slug={slug}` → [`@product`](./product.md). Se sobrar bloqueio, você resolve no review e reativa o `@briefing-refiner`.

## Próximo passo

- Gerar o briefing antes de refinar → [@briefing](./briefing.md)
- Fluxo completo até o PRD → [Da ideia ao PRD via briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md)
- Termos como "gap" e "PRD" → [Glossário](../1-entender/glossario.md)
