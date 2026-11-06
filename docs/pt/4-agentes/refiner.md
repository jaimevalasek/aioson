# @refiner — Revisa e refina um briefing antes do PRD

> **Para quem é:** quem quer revisar um briefing existente ou explorar uma direção visual antes de criar o Briefing.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:**
> - O que o `@refiner` faz e onde ele entra no fluxo.
> - Como funciona o loop de refinamento em rodadas (auditoria → revisão no navegador → aplicação).
> - Como a superfície `review.html` salva de verdade (autosave local + 3 rotas de retorno do JSON).

## Para que serve

Entre o briefing gerado e o PRD há uma etapa que costuma ser pulada: **revisar o briefing com olhar crítico**. Ambiguidades, redundâncias, decisões faltando, riscos vagos e gaps de impacto de implementação passam direto para o `@product` e viram dívida no PRD.

O `@refiner` preenche essa etapa em um **loop de rodadas**: ele audita o briefing e registra **achados estruturados** (findings com categoria, severidade e se bloqueiam o PRD); o CLI renderiza a superfície de revisão determinística (`aioson briefing:review`); você decide cada achado e edita cada seção no navegador; o feedback estruturado volta e é aplicado (`aioson briefing:apply-feedback`) — e o ciclo se repete até nada bloquear o PRD.

É o complemento do [`@briefing`](./briefing.md): um gera, o outro refina.

## Quando invocar

- Você já tem um briefing em `.aioson/briefings/{slug}/briefings.md` e quer revisá-lo antes do PRD.
- O briefing está `draft`, ou `approved` mas ainda **sem PRD gerado** (`prd_generated: null`).
- Quer registrar comentários, decidir achados, pedir mudanças por seção ou marcar bloqueios antes de seguir para `@product`.
- Quer **ver a solução** antes do PRD (modo prototype) e, opcionalmente, definir a identidade visual a partir das suas imagens de referência.
- Ainda não tem Briefing, mas quer testar redesign, prints de referência, uma variante única ou uma arena entre modelos.

## Quando NÃO invocar

- Ainda não existe briefing e o pedido é somente enquadramento não visual — vá para [`@briefing`](./briefing.md).
- O briefing já gerou PRD (`prd_generated` preenchido) — refinar exigiria uma rota nova de PRD/enrichment, fora deste agente.
- A ideia mudou tanto que vale regerar do zero — volte ao `@briefing`.

## Quando ainda não existe Briefing: exploração visual

O Refiner oferece criar o Briefing primeiro, iniciar uma exploração ou continuar uma existente. Na exploração, ele confirma o alvo, escolhe `single`, `sequential` ou `arena`, avalia se os prints cobrem o necessário e pergunta se deve complementar as imagens com uma varredura `targeted` ou `full` do front-end atual.

As variantes ficam em `.aioson/explorations/{slug}/`, cada uma com dono/modelo, protótipo e relatório próprios. A comparação pode ser cega, aceita comentários por região e preserva os “prompts matadores” de todas as tentativas. Uma direção selecionada só entra no fluxo canônico quando `exploration:promote` cria `plans/{briefing-slug}/visual-exploration.md`; então `@briefing` cria o Briefing e o Refiner consolida o protótipo da feature.

Veja a receita [Exploração visual e arena entre modelos](../3-receitas/arena-de-exploracao-visual.md).

## O loop de refinamento canônico

```
auditoria (agente) → review.html (CLI) → você decide no navegador
       ↑                                            ↓
regenera a revisão  ←  aplica feedback confirmado (CLI)
(enquanto houver bloqueios ou mudanças de texto)
```

Cada rodada tem número (`round`) e arquiva o feedback consumido (`refinement-feedback.applied-round{N}.json`), então "existe `refinement-feedback.json`" = "há feedback pendente" — um sinal determinístico.

### 1. Gerar revisão

O agente audita o briefing e escreve os achados em `refinement-findings.json`; o CLI valida e renderiza:

```
Você > @refiner

@refiner > Briefing refinável encontrado: marketplace-v1 (draft).

                    Auditando... 10 achados (3 ambiguidades, 2 gaps,
                    1 bloqueante: modelo de comissão indefinido).

                    aioson briefing:review . --slug=marketplace-v1  ✓ (rodada 1)

                    Abra .aioson/briefings/marketplace-v1/review.html
                    NUM NAVEGADOR DE VERDADE (duplo clique) — previews de
                    editor são sandboxed e bloqueiam salvar/baixar.
```

### 2. Aplicar feedback pendente

O CLI valida (schema, slug, hash da fonte). Se você salvou a página sem nota e com as opções recomendadas, salvar já foi a confirmação, e a rodada é aplicada sem outra pergunta, a não ser que o texto vá além das suas decisões. Nas demais rodadas há um **dry-run** com o resumo, e o agente pede confirmação explícita antes de tocar o briefing:

```
@refiner > Feedback pendente em marketplace-v1 (rodada 1):
                    - 4 seções com mudança, 1 bloqueada
                    - achados: 6 aceitos, 2 rejeitados, 1 adiado, 1 pendente (bloqueante)

                    Aplico as mudanças confirmadas? O achado bloqueante
                    pendente mantém o bloqueio do PRD.
Você > Sim.

@refiner > aioson briefing:apply-feedback --confirm  ✓
                    Aplicado; briefing voltou de approved para draft.
                    Bloqueio restante → regenerando a revisão (rodada 2)...
```

Se você recusar, o `briefings.md` fica intacto e as mudanças puladas são registradas no relatório. Quando não sobra bloqueio: `aioson briefing:approve . --slug={slug}` → `@product`.

Antes de incorporar as notas, o `@refiner` lê a rodada por `aioson briefing:feedback . --slug={slug}`: a visão enxuta com todos os achados, comentários, decisões e itens bloqueantes, mais o texto só das seções que uma nota ou mudança de status tocou. O JSON exportado carrega o briefing inteiro duas vezes (texto original e atual de cada seção); a visão enxuta fica em torno de 5% do arquivo, e o agente edita só as seções nomeadas.

## A superfície de revisão (review.html)

Renderizada pelo CLI (`aioson briefing:review`) — estática, local, self-contained e no seu idioma:

- seções editáveis em texto puro + status por seção (`unchanged`, `accepted`, `change_requested`, `remove_requested`, `blocked`) e notas;
- **achados da auditoria por seção**, cada um com decisão própria (`pending`/`accepted`/`rejected`/`deferred`) e nota — com filtros funcionais por categoria;
- painel com o que mudou, o que bloqueia o PRD e quantos achados seguem pendentes;
- **autosave local**: cada edição é salva no navegador (localStorage) e restaurada ao reabrir — fechar a aba não perde nada;
- **3 rotas para devolver o JSON**: *Salvar no arquivo* (File System Access, com fallback automático para download quando o contexto é sandboxed), *Baixar JSON* (e mover por cima do `refinement-feedback.json`), ou *Copiar JSON e colar no chat* — a rota de menor atrito.

> **Por que JSON e não o HTML editado?** O agente nunca trata o DOM/HTML editado como feedback canônico — só o `refinement-feedback.json` estruturado (schema v1.1, validado por hash da fonte). Isso evita aplicar mudanças inferidas e mantém o processo auditável.

> **Importante:** abra o `review.html` num navegador de verdade (duplo clique). Previews embutidos de editor rodam em sandbox e bloqueiam o file picker e downloads.

## Modo prototype e identidade visual (opcional)

Para briefings com superfície rica (workspaces, boards, CRM/Kanban, dashboards, CRUD de uso repetido), o agente recomenda — sem bloquear — gerar um protótipo clicável antes do PRD. É nesse momento (ou já na revisão, via achado não-bloqueante) que a **identidade visual** entra:

- você solta imagens de referência em `references/identity/` (marca: cor, tipografia, clima) e `references/structure/` (um board, uma tabela, uma tela);
- a skill `reference-identity-extract` lê as imagens **uma única vez** e escreve `identity.md` (tokens + notas de estrutura por componente);
- o motor `interface-design` **aplica** o `identity.md` em tudo que vier depois (protótipo e build) — sem imagens, ele roda intent-first.

O protótipo é mock-only e nunca vira feedback canônico.

## Saídas em disco

| Arquivo | O que contém |
|---|---|
| `.aioson/briefings/{slug}/refinement-findings.json` | Achados da auditoria do agente (entrada do CLI) |
| `.aioson/briefings/{slug}/review.html` | Superfície de revisão renderizada pelo CLI |
| `.aioson/briefings/{slug}/refinement-feedback.json` | Feedback estruturado v1.1 (a única fonte que é aplicada) |
| `.aioson/briefings/{slug}/refinement-report.md` | Relatório da rodada: aplicado, pulado, bloqueado, achados |
| `.aioson/briefings/{slug}/refinement-*.{applied,declined}-round{N}.json` | Arquivo morto por rodada (feedback aplicado ou recusado, e findings consumidos) |
| `.aioson/briefings/{slug}/briefings.md` | Atualizado **apenas** após confirmação |
| `.aioson/briefings/config.md` | Índice/registro de briefings atualizado |
| `.aioson/explorations/{slug}/` | Intake, referências, variantes, comparação e relatórios de uma exploração não canônica |
| `plans/{briefing-slug}/visual-exploration.md` | Fonte promovida e fingerprintada para o `@briefing` |

## Como ele lê seu projeto

1. `.aioson/config.md`
2. `.aioson/context/project.context.md`
3. `.aioson/briefings/config.md` — resolve o slug refinável; sem ele, decide entre Briefing e exploração visual.
4. `.aioson/briefings/{slug}/briefings.md` — lido antes de escrever qualquer artefato de revisão.

## Limites importantes (hard constraints)

- Nunca cria ou edita `prd*.md`.
- Nunca aprova um briefing automaticamente.
- Nunca roteia para `@product` enquanto houver itens bloqueantes (inclusive achado bloqueante pendente).
- Nunca trata HTML/DOM editado como feedback canônico — só o JSON estruturado.
- Nunca escreve `review.html` à mão nem aplica feedback manualmente enquanto os comandos CLI existirem — o done-gate (`verify:artifact --kind=review`) rejeita superfícies feitas à mão.
- Nunca descarta seções obrigatórias do briefing.

## Opção `--help`

Uma ativação com `--help` (`/refiner --help`) imprime um resumo rápido — o que faz, quando usar, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

## Handoff típico

- **Vem de:** [`@briefing`](./briefing.md) (briefing gerado) ou de você, retomando uma revisão.
- **Vai para:** depois de aplicar as mudanças e sem bloqueios → `aioson briefing:approve . --slug={slug}` → [`@product`](./product.md); para superfícies ricas, o modo prototype antes. Se sobrar bloqueio, a próxima rodada do loop resolve — nunca edição manual.

## Próximo passo

- Gerar o briefing antes de refinar → [@briefing](./briefing.md)
- Fluxo completo até o PRD → [Da ideia ao PRD via briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md)
- Termos como "gap" e "PRD" → [Glossário](../1-entender/glossario.md)
