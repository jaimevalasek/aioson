# @sheldon — Análise técnica profunda e revisão de PRD

> **Para quem é:** quem quer uma segunda opinião técnica de peso antes de começar a implementar.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Quando o @sheldon é necessário e o que ele entrega.
> - Como ele se encaixa entre @product e @analyst.

## Para que serve

O `@product` escreveu o PRD. Parece completo. Mas há gaps que só aparecem quando alguém com mentalidade técnica lê criticamente: campos de negócio não especificados, fluxos de erro ausentes, premissas implícitas que vão virar bugs.

O `@sheldon` faz essa revisão crítica antes que o `@analyst`, o `@architect` e o `@dev` comecem. Ele pode ser ativado múltiplas vezes sobre o mesmo PRD — cada rodada enriquece mais. É o guardião da qualidade do PRD, não o implementador.

Recentemente (commit `5b1edd6`), foi dividido em módulos on-demand, incluindo detecção de MER (missing entity relationships) — ele agora identifica relacionamentos entre entidades que o PRD não declara explicitamente.

## Quando invocar

- PRD parece completo mas você suspeita de gaps.
- Feature é complexa — regras de negócio não-óbvias, múltiplos fluxos.
- Antes de passar para `@analyst` num projeto SMALL ou MEDIUM importante.
- Quer que alguém "tente quebrar" a spec antes do dev.
- Há briefing aprovado (`briefing_source`) e quer garantir que os gaps do briefing foram fechados.

## Quando NÃO invocar

- Feature simples MICRO — é overhead desnecessário (Artigo II da Constitution).
- PRD ainda não existe — `@product` primeiro.
- Implementação já foi feita — `@pentester` ou `@qa` são mais adequados agora.

## Diálogo típico

```
Você > @sheldon

@sheldon > Lendo .aioson/context/prd-checkout-stripe.md...
           Lendo briefing source: .aioson/briefings/marketplace-v1/briefings.md...

           Análise de qualidade do PRD:

           GAPS ENCONTRADOS:
           - AC-03 não especifica o que acontece se o pagamento falhar após 3 tentativas
             (fluxo de retry? bloqueio temporário? sem menção)
           - Entidade "OrderItem" referenciada mas não modelada no PRD
           - Regra de cancelamento ausente (o briefing sinalizava isso como gap aberto)

           RISCOS:
           - Webhook handler sem idempotência — pode duplicar confirmações
           - Email de confirmação: qual provider? Sem fallback documentado

           RECOMENDAÇÃO:
           - Enriquecer o PRD in-place (gaps são fecháveis sem replanejamento)
           - Abrir plano de execução para o webhook (risco técnico real)

           Posso enriquecer o PRD agora ou prefere revisar os gaps primeiro?
```

## Saídas em disco

| Arquivo | O que contém |
|---|---|
| `.aioson/context/prd-{slug}.md` | PRD enriquecido in-place (quando enriquecimento direto) |
| `.aioson/context/sheldon-enrichment.md` | Registro de enriquecimentos anteriores (para re-entrância) |

## Como ele lê seu projeto

1. `.aioson/context/project.context.md` — stack e classificação.
2. `.aioson/context/prd.md` ou `prd-{slug}.md` — o PRD alvo.
3. `.aioson/context/features.md` — status das features (não revisa PRDs de features já implementadas).
4. `.aioson/context/sheldon-enrichment.md` — histórico de enriquecimentos (re-entrada).
5. `.aioson/briefings/{slug}/briefings.md` — se `briefing_source` está no PRD.
6. `plans/*.md` e `prds/*.md` — fontes de pesquisa pré-produção do usuário.

## Handoff típico

- **Vem de:** `@product` (PRD gerado) — pode ser ativado N vezes antes de ir adiante.
- **Vai para:** `@analyst` → `@architect` → `@dev`.

## Detalhe: MER detection

O @sheldon agora detecta automaticamente **relacionamentos de entidade ausentes** no PRD. Se o PRD menciona `Order` e `Customer` mas não modela a relação entre eles, ele sinaliza — o `@analyst` vai precisar modelar, melhor detectar aqui.

## Próximo passo

- Entender o fluxo completo → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
- PRD ainda não existe → [@product](./product.md) *(ficha em construção)*
- Termos como "gap", "AC" e "PRD" → [Glossário](../1-entender/glossario.md)
