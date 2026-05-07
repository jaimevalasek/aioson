# @briefing — Estrutura ideias brutas antes de virar feature

> **Para quem é:** quem tem anotações, planos soltos ou ideias não formalizadas e quer transformá-los em algo acionável.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que é um briefing e por que ele existe antes do PRD.
> - Como o @briefing usa seus planos como matéria-prima.

## Para que serve

Existe um espaço em branco entre "tive uma ideia" e "vou criar uma feature no AIOSON". Esse espaço é onde muitos projetos erram: a ideia vai direto para `@product` sem estruturação, chegando como requisito vago, com gaps e riscos não identificados.

O `@briefing` preenche esse espaço. Ele lê seus rascunhos em `plans/`, pesquisa o que for necessário, identifica gaps, mapeia riscos, e entrega um documento estruturado — o briefing — que o `@product` (e depois o `@sheldon`) podem usar como ponto de partida qualificado.

Anteriormente chamado de `@cypher`, foi renomeado e enriquecido com frameworks de discovery em Abr/2026 (commit `0d40a4b`).

## Quando invocar

- Você tem arquivos em `plans/` com ideias, pesquisas ou esboços não formalizados.
- A ideia ainda não está clara o suficiente para virar feature diretamente.
- Você quer validar premissas de mercado ou técnicas antes de comprometer um PRD.
- Equipe debateu uma ideia em reunião e as anotações estão soltas.

## Quando NÃO invocar

- A feature já tem spec definida — vá direto para `@product` ou `@analyst`.
- A ideia é simples e óbvia (MICRO) — não precisa de briefing.
- Você quer apenas verificar o estado do projeto — use `@neo`.

## Diálogo típico

```
Você > @briefing

@briefing > Encontrei 3 arquivos em plans/:
             - plans/ideia-marketplace.md
             - plans/pesquisa-concorrentes.md
             - plans/fluxo-pagamentos.md

             Quais devo usar como fonte? (todos ou lista específica)
Você > Todos.

@briefing > Lendo... Pesquisando validação de premissas técnicas...

             Briefing gerado: .aioson/briefings/marketplace-v1/briefings.md

             Resumo:
             - Problema: vendedores sem canal de venda digital
             - Hipóteses validadas: 2/4 (2 precisam de POC técnica)
             - Gaps identificados: modelo de comissão não especificado,
               regras de cancelamento ausentes
             - Riscos: integração com correios pode ter latência alta
             - Próximo passo recomendado: @product com este briefing como input

             O briefing está pronto para aprovação. Deseja ajustar algo?
```

## Saídas em disco

| Arquivo | O que contém |
|---|---|
| `.aioson/briefings/{slug}/briefings.md` | Briefing estruturado: problema, hipóteses, gaps, riscos, recomendações |
| `.aioson/briefings/config.md` | Índice de todos os briefings com status (draft/approved/implemented) |

## Como ele lê seu projeto

1. `.aioson/briefings/config.md` — verifica briefings existentes (evita sobrescrever).
2. `plans/*.md` — matéria-prima principal (seus rascunhos).
3. `.aioson/context/project.context.md` — contexto do projeto.
4. `.aioson/context/prd*.md` e `prds/*.md` — evita duplicar trabalho já comprometido.
5. Web search quando há premissas que precisam de validação externa.

## Handoff típico

- **Vem de:** você, com anotações em `plans/` ou uma ideia conversacional.
- **Vai para:** `@product` (que usa o briefing como contexto enriquecido no PRD).

## Modo conversacional

Se não existir nada em `plans/`, o `@briefing` entra em modo conversacional — ele te entrevista e constrói o briefing a partir das respostas. Útil quando a ideia ainda está só na sua cabeça.

```
Você > @briefing

@briefing > Não encontrei arquivos em plans/. Quer planejar a ideia comigo
            conversacionalmente? Vou fazer perguntas e montar o briefing.
Você > Sim.
@briefing > Qual o problema que você quer resolver?
```

## Próximo passo

- Entender o fluxo completo → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
- Após o briefing aprovado → [@product](./product.md) *(ficha em construção)*
- Termos como "gap" e "PRD" → [Glossário](../1-entender/glossario.md)
