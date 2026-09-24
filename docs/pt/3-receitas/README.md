# Receitas — exemplos prontos para copiar

Cada receita é um guia end-to-end com diálogos simulados, exemplos rodáveis e solução de problemas. Escolha pelo seu cenário:

## Trilhas canônicas (recomendadas para começar)

Estas três trilhas mostram **como features chegam ao desenvolvimento** no AIOSON. Você quase sempre cai em uma delas.

A esteira completa é sempre a mesma — o que muda é por onde você entra nela:

```text
@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester
```

| Trilha | Quando usar | Onde você entra |
|---|---|---|
| [Da ideia ao PRD via @briefing](./da-ideia-ao-prd-via-briefing.md) | Sua ideia ainda é vaga, várias anotações soltas | Do começo: `@briefing → @refiner → @product` |
| **[Feature completa com revisão do @sheldon](./feature-completa-com-sheldon.md)** | Você tem uma direção de produto clara | Direto no PRD: `@product → @sheldon → @planner → @dev → @qa` |
| [Plans externos para @product](./plans-externos-para-product.md) | Você já planejou em outro chat (ChatGPT, Claude.io Web) | `@product` lendo `/plans/` |

> **E para uma mudança pequena?** Não puxe a esteira. Chame `@dev` — a rota curta (Simple Plan) confirma o escopo, registra um plano mínimo, implementa e verifica. Ver [Continuidade entre sessões](./continuidade-entre-sessoes.md).

## Receitas por cenário

| Receita | Cenário | Agentes principais |
|---|---|---|
| [Landing page](./landing-page.md) | Criar página de apresentação com copy e design | @refiner, @copywriter, @product, @dev, @qa |
| [App SaaS do zero](./app-saas-do-zero.md) | SaaS completo: auth, billing Stripe, admin | Esteira completa em profundidade MEDIUM |
| [Integração em codebase grande](./integracao-em-codebase-grande.md) | Instalar AIOSON em legado de 10k–100k linhas | @discover + esteira |
| [Refatoração grande](./refatoracao-grande.md) | Reescrever módulo crítico sem quebrar nada | @sheldon, @tester, @dev, @qa |
| [Auditoria de segurança](./auditoria-seguranca.md) | Revisar vulnerabilidades antes de produção | @pentester |
| [Publicar no aioson.com](./publicar-no-aioson-com.md) | Distribuir squad, skill ou genome | system:package, system:publish |
| [Clonar design de site](./clonar-design-de-site.md) | Extrair visual de site ou combinar dois estilos | @site-forge, @design-hybrid-forge |
| [Exploração visual e arena entre modelos](./arena-de-exploracao-visual.md) | Testar redesigns, prints e variantes antes do Briefing | @refiner, @briefing |
| [Continuidade entre sessões](./continuidade-entre-sessoes.md) | Retomar feature após sessão encerrada | @dev, dossier, dev-state |

Volte ao portal principal: [docs/pt/README.md](../README.md)
