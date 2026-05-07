# @copywriter — Escrever copy de conversão para páginas e campanhas

> **Para quem é:** quem precisa de copy que converta — landing pages, emails, páginas de vendas — sem escrever linha a linha.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - Quais tipos de copy o agente entrega e em que formato
> - Como ele usa contexto do projeto para personalizar o tom

---

## Para que serve

Copy genérico não converte. O `@copywriter` não é um formatador de texto — é um estrategista de conversão que lê o contexto do projeto, pesquisa a audiência real, e aplica frameworks de persuasão provados (Problem-Agitate-Solve, Story-brand, AIDA, etc.) para escrever copy que faz o leitor se sentir entendido, elimina objeções, e direciona para uma ação clara.

Ele escreve no idioma da audiência — se o projeto é PT-BR, o copy sai em PT-BR sem precisar pedir.

---

## Quando invocar

- Você precisa de copy para landing page, página de vendas, email ou campanha
- O `@ux-ui` detectou que o projeto `project_type=site` e o copy ainda está faltando
- Um executor de squad precisa de copy especializado num domínio

---

## Quando NÃO invocar

- Você precisa de documentação técnica — use `@dev` ou o próprio agente de domínio
- Você quer revisar copy existente com critério técnico — especifique "modo revisão"
- Você quer microcopy de UI (labels, tooltips) — o `@ux-ui` cobre isso dentro do design system

---

## Os 4 modos

| Modo | Quando usar |
|---|---|
| **Full page** | Escrever todas as seções de uma página do zero |
| **Section** | Apenas hero, benefits, FAQ, CTA, ou outra seção específica |
| **Review & rewrite** | Você tem copy existente e quer análise + reescrita |
| **Squad executor** | Atuando como executor dentro de um squad, segue o genome e manifesto |

---

## Diálogo típico

```
Você > @copywriter landing page do meu app de finanças pessoais para millennials

@copywriter > Lendo project.context.md... projeto "finwise", web_app, pt-BR.
              Pesquisando audiência: millennials brasileiros + finanças pessoais.
              Dores identificadas: renda variável, dívidas de cartão, falta de hábito de poupança.
              Framework escolhido: Problem-Agitate-Solve + prova social.

@copywriter > Escrevendo:
              Hero: "Você sabe que deveria guardar dinheiro. Mas o mês acaba antes do salário."
              Benefits: [3 blocos com benefício + detalhe + prova]
              CTA: "Comece grátis — sem cartão"
              ...

@copywriter > Copy completo salvo em:
              .aioson/context/copy-finwise-landing.md
```

---

## Saídas em disco

```
.aioson/context/copy-{slug}.md          ← copy completo
.aioson/context/copy-review-{slug}.md   ← revisão anotada (modo review)
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — idioma, tipo de projeto, nome
- `.aioson/context/prd.md` e `spec.md` — proposta de valor e escopo
- Cache de pesquisas em `researchs/{slug}/summary.md` — se existir, reutiliza

---

## Handoff típico

- **Vem de:** `@ux-ui` (copy gate automático para `project_type=site`) ou pedido direto
- **Vai para:** `@dev` para implementar o copy no frontend, ou `@ux-ui` para encaixar no design system

---

## Próximo passo

- Para montar um squad com executor de copywriter: [squad.md](./squad.md)
- Para design system + copy juntos: ficha `ux-ui.md` (em construção)
