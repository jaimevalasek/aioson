# @product — Defina o que vai ser construído e por quê

> **Para quem é:** quem está começando uma feature ou um projeto e precisa transformar uma ideia em escopo concreto.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Quando e como invocar `@product`
> - O que ele produz e onde fica

---

## Para que serve

Quando você vai a um dev e diz "preciso de um app de agendamento", ele vai te perguntar: "para quem? com que restrições? o que é fora de escopo?". Se você não responde bem, ele implementa o que imaginou, não o que você precisava.

`@product` faz essas perguntas por você — antes de qualquer linha de código. Ele conduz uma conversa estruturada que transforma intenções vagas numa especificação que todos os agentes subsequentes vão usar como base.

Ele é o primeiro agente técnico num projeto novo (logo após `@setup`) e o ponto de entrada para cada nova feature em projetos existentes.

Se você tiver notas no `plans/` ou `prds/`, o `@product` as detecta automaticamente e pergunta se deve usá-las como material. Os arquivos originais nunca são modificados.

**Modo briefing-aware:** se existir `.aioson/briefings/` com algum briefing `status: approved` e `prd_generated: null`, o `@product` lista esses briefings antes da detecção de modo e oferece converter em PRD. Se aceito, o PRD nasce com `briefing_source: {slug}` no frontmatter — rastreio completo do briefing original. Veja [Da ideia ao PRD via @briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md).

---

## Quando invocar

- Início de projeto: você quer construir algo mas ainda não tem spec.
- Nova feature: projeto existe, você quer adicionar funcionalidade nova.
- Refinamento: a spec existe mas ficou desatualizada e precisa de revisão.
- Síntese de anotações: você tem notas em `plans/*.md` e quer transformar em PRD real.

---

## Quando NÃO invocar

- Você já tem a spec pronta e quer ir direto para implementação → invoke `@dev`.
- Você quer refinar UX, não produto → invoke `@ux-ui`.
- Você quer entender o estado do projeto antes de escolher → invoke `@neo`.

---

## Diálogo típico

```
Você > @product

@product > Li project.context.md. Projeto "minha-loja", SMALL, pt-BR.
           Encontrei plans/checkout-v2.md. Usar como material para o PRD? Os originais ficam intactos.
Você > Sim

@product > [lê plans/checkout-v2.md]
           Feature identificada: "Checkout com cartão de crédito via Stripe".
           
           Para afinar o escopo:
           1. O usuário pode salvar cartões para uso futuro?
           2. Precisa suportar múltiplos cartões no mesmo pedido?
           3. O que está fora de escopo agora?

Você > Não salvar cartões. Um cartão por pedido. Fora de escopo: parcelamento.

@product > PRD criado em .aioson/context/prd-checkout-stripe.md
           Spec inicial em .aioson/context/features/checkout-stripe/spec.md
           Próximo agente: @analyst (para mapear domínio).
```

---

## Saídas em disco

| Arquivo | Quando cria |
|---|---|
| `.aioson/context/prd.md` | Projeto novo |
| `.aioson/context/prd-{slug}.md` | Feature nova |
| `.aioson/context/features/{slug}/spec.md` | Sempre |
| `plans/source-manifest.md` | Quando consome material de `plans/` |

---

## Como ele lê seu projeto

Antes de qualquer pergunta, lê:
- `.aioson/context/project.context.md` — classificação, idioma, stack
- `.aioson/context/bootstrap/what-is.md` e `what-it-does.md` — se existirem
- `plans/*.md` e `prds/*.md` — detecta fontes de entrada
- `.aioson/rules/` — regras com `agents: product`

---

## Comandos CLI relacionados

```bash
# Ver estado atual do workflow (qual agente é o próximo)
aioson workflow:next .

# Verificar contexto válido antes de invocar
aioson context:validate .
```

---

## Handoff típico

- **Vem de:** `@setup` (projeto novo) ou você mesmo (nova feature)
- **Vai para:** `@analyst` (SMALL/MEDIUM) ou `@dev` (MICRO sem novas entidades)

---

## Próximo passo

- Trilha canônica de feature completa → [Feature completa com @sheldon](../3-receitas/feature-completa-com-sheldon.md)
- Ideia ainda vaga? → [Da ideia ao PRD via @briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md)
- Já planejou em outro chat? → [Plans externos para @product](../3-receitas/plans-externos-para-product.md)
- [Ficha do @analyst](./analyst.md) — próximo no fluxo SMALL/MEDIUM
- [Glossário: Dossier, Spec, PRD](../1-entender/glossario.md)
