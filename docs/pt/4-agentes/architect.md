# @architect — Decida a estrutura técnica antes de escrever código

> **Para quem é:** quem vai implementar e quer garantir que as decisões de stack, pastas e integração estejam tomadas antes de o `@dev` começar.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Que decisões `@architect` toma (e o que ele deixa para `@dev`)
> - Como ele se conecta com `@analyst` e `@dev`

---

## Para que serve

Um dev experiente não começa a codar antes de perguntar: "onde esse arquivo vai morar? quais libs vamos usar? como isso se integra com o que já existe?". Essas perguntas respondidas na ponta de um rascunho custam pouco. Respondidas depois de 300 linhas implementadas, custam refatoração.

`@architect` transforma o mapa de domínio do `@analyst` em **decisões técnicas concretas**: estrutura de pastas, escolha de bibliotecas, estratégia de integração, padrões de código a seguir. Ele não escreve código — ele define as regras que o `@dev` vai seguir.

Ele também contribui no `dossier` da feature, registrando os arquivos-chave no code map para que qualquer agente subsequente saiba onde olhar.

---

## Quando invocar

- **No MEDIUM:** `@orchestrator` o dispara automaticamente como sub-agente no fan-out de spec — você não precisa invocar manualmente.
- **Detour explícito:** quando a feature envolve decisões de integração com APIs externas ou novos módulos e você quer decisões técnicas separadas da análise de domínio.
- Quando você quer garantir consistência com o padrão de pastas do projeto antes de implementar.

> **SMALL:** na lane lean padrão (`@product → @sheldon → @dev → @qa`), `@architect` não é um hop padrão — o `@sheldon` cobre as decisões técnicas sozinho. Invoque `@architect` explicitamente apenas como detour se precisar de estrutura técnica mais detalhada.

> **Modo merged:** quando `@architect` é invocado sem `@discovery-design-doc` no fluxo, ele entra em **modo merged** — além das decisões técnicas padrão, produz também o design-doc e o readiness, absorvendo o papel que seria do `@discovery-design-doc`.

---

## Quando NÃO invocar

- Feature MICRO sem decisões novas → `@dev` infere do contexto existente.
- Projeto SMALL em lane padrão → `@sheldon` já cobre as decisões técnicas; `@architect` só se necessário como detour.
- Você só quer adicionar um campo a uma entidade existente → `@dev` lida sozinho.
- Você quer revisar a arquitetura geral do projeto (não de uma feature) → use `@sheldon`.

---

## Diálogo típico

```
Você > @architect

@architect > Lendo requirements-checkout-stripe.md e architecture.md...
             
             Decisões para a feature checkout-stripe:
             
             Estrutura:
             - src/models/payment.js        ← nova entidade Payment
             - src/services/payment-service.js  ← lógica de negócio isolada
             - src/routes/checkout.js        ← rota POST /checkout
             
             Biblioteca de integração Stripe:
             - stripe (npm) — padrão do ecossistema, sem alternativas
             
             Padrão de validação:
             - validação manual em payment-service.js (Article VI — sem lib extra para 2 campos)
             
             Integração com Order:
             - Order.status muda para 'paid' após confirmação Stripe (webhook)
             
             Registrando code map no dossier...
             architecture.md atualizado.
             Próximo: @dev.
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/architecture.md` | Decisões técnicas: pastas, libs, padrões |
| `.aioson/context/implementation-plan-{slug}.md` | Plano de implementação (quando cria) |
| `.aioson/context/features/{slug}/dossier.md` | Code map atualizado (via `dossier:add-codemap`) |

---

## Como ele lê seu projeto

- `.aioson/context/requirements-{slug}.md` — entidades e regras do `@analyst`
- `.aioson/context/architecture.md` — estado atual da arquitetura
- `.aioson/context/bootstrap/how-it-works.md` e `current-state.md` — quando existem
- `.aioson/design-docs/*.md` — regras de estrutura de código e naming
- `.aioson/rules/` — regras com `agents: architect`

---

## Comandos CLI relacionados

```bash
# Checar dossier da feature
aioson dossier:show . --slug=checkout-stripe

# Adicionar arquivo ao code map do dossier
aioson dossier:add-codemap . --slug=checkout-stripe \
  --file=src/services/payment-service.js \
  --role=service --coupling=medium --added-by=architect
```

---

## Handoff típico

- **Vem de:** `@orchestrator` (como sub-agente no MEDIUM) ou `@analyst` (quando usado como detour)
- **Vai para:** `@ux-ui` (detour MEDIUM com UI pesada) ou resultado consolida para `@orchestrator` quando em sub-agente

---

## Próximo passo

- [Ficha do @dev](./dev.md) — quem executa as decisões
- [Ficha do @ux-ui](./ux-ui.md) — próximo em MEDIUM
- [Glossário: Dossier, Design Docs, Constitution](../1-entender/glossario.md)
