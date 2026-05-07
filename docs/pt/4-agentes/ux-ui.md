# @ux-ui — Especifique a interface antes de implementá-la

> **Para quem é:** quem trabalha em projetos MEDIUM com frontend e quer garantir que UI/UX foi pensada antes do código.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Quando `@ux-ui` entra no fluxo e o que ele entrega
> - Como ele usa o design skill do projeto

---

## Para que serve

Quando o dev implementa a UI sem especificação, ele toma decisões de design no meio do código: escolhe um espaçamento, inventa um tom de cor, estrutura o formulário do jeito que achou certo. O resultado é inconsistente, custa refatoração e não respeita o sistema visual do produto.

`@ux-ui` existe para separar "o que a interface faz" (responsabilidade dele) de "como o código implementa" (responsabilidade do `@dev`). Ele produz uma especificação de componentes, tokens e fluxos que o `@dev` segue como contrato.

Ele é guiado pelo design skill do projeto — se `clean-saas-ui` estiver configurado, ele usa apenas esse sistema. Se nenhum skill estiver definido, ele para e pergunta antes de avançar.

---

## Quando invocar

- Projetos MEDIUM com UI, após `@architect`.
- Quando você quer redesenhar uma tela existente de forma estruturada.
- Quando quer documentar o design system de um projeto que já tem UI mas sem spec.
- Quando a auditoria de UI/UX é necessária (modo `audit`).

---

## Quando NÃO invocar

- Projeto MICRO ou SMALL sem UI complexa → `@dev` pode usar o design skill direto.
- A feature é backend puro (API, script) → não há UI para especificar.
- Você quer clonar o design de um site existente → use `@site-forge`.

---

## Diálogo típico

```
Você > @ux-ui

@ux-ui > Lendo project.context.md... design_skill: "clean-saas-ui".
          Carregando .aioson/skills/design/clean-saas-ui/SKILL.md...
          
          Feature: checkout-stripe. Lendo prd-checkout-stripe.md e architecture.md...
          
          Telas necessárias:
          1. /checkout — formulário de pagamento
          2. /checkout/success — confirmação
          3. /checkout/error — falha de pagamento
          
          Especificando tela /checkout:
          - Input "Número do cartão": token input-default, validação em tempo real
          - Input "Validade" + "CVV": side-by-side, tokens spacing-sm
          - Button "Pagar R$ {total}": variant primary-lg, loading state
          - Error state: inline, cor error-500 do token de cores
          
          Artefatos criados:
          - .aioson/context/design-doc-checkout-stripe.md
          - .aioson/context/ui-spec.md (atualizado)
          Próximo: @pm (MEDIUM).
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/design-doc.md` ou `design-doc-{slug}.md` | Spec de UI/UX da feature |
| `.aioson/context/ui-spec.md` | Spec de componentes e tokens |
| `.aioson/context/discovery.md` | Contribuição de discovery de UX |

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — detecta `design_skill`
- `.aioson/skills/design/{design_skill}/SKILL.md` — **único** sistema visual carregado
- `.aioson/context/prd-{slug}.md`, `discovery.md`, `architecture.md`
- `.aioson/context/spec-{slug}.md` (feature mode)
- `.aioson/rules/` — regras com `agents: ux-ui`

---

## Comandos CLI relacionados

```bash
# Ver qual design skill está ativo
cat .aioson/context/project.context.md | grep design_skill

# Listar skills instalados
ls .aioson/skills/design/
```

---

## Handoff típico

- **Vem de:** `@architect`
- **Vai para:** `@pm` (MEDIUM)

---

## Próximo passo

- [Ficha do @pm](./pm.md) — próximo em MEDIUM
- [Decisões iniciais: qual design skill escolher](../2-comecar/decisoes-iniciais.md#escolhendo-o-design-system)
- [Glossário: Design Skill](../1-entender/glossario.md#design-skill)
