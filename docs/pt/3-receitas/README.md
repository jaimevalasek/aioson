# Receitas — exemplos prontos para copiar

Cada receita é um guia end-to-end com diálogos simulados, exemplos rodáveis e solução de problemas. Escolha pelo seu cenário:

## Trilhas canônicas (recomendadas para começar)

Estas três trilhas mostram **como features chegam ao desenvolvimento** no AIOSON. Você quase sempre cai em uma delas.

| Trilha | Quando usar | Agentes-chave |
|---|---|---|
| **[Feature completa com @sheldon](./feature-completa-com-sheldon.md)** | Você tem PRD em mente e quer a trilha canônica (a mais usada) | SMALL: `@product → @sheldon → @dev → @qa` · MEDIUM: `@product → @orchestrator → @dev → @pentester → @qa` |
| [Da ideia ao PRD via @briefing](./da-ideia-ao-prd-via-briefing.md) | Sua ideia ainda é vaga, várias anotações soltas | @briefing → @product |
| [Plans externos para @product](./plans-externos-para-product.md) | Você já planejou em outro chat (ChatGPT, Claude.io Web) | @product (lê `/plans/`) |

## Receitas por cenário

| Receita | Cenário | Agentes principais |
|---|---|---|
| [Landing page](./landing-page.md) | Criar página de apresentação com copy e design | @product, @copywriter, @ux-ui, @dev, @qa |
| [App SaaS do zero](./app-saas-do-zero.md) | SaaS completo: auth, billing Stripe, admin | Workflow MEDIUM completo + @orchestrator |
| [Integração em codebase grande](./integracao-em-codebase-grande.md) | Instalar AIOSON em legado de 10k–100k linhas | @discover, @analyst |
| [Refatoração grande](./refatoracao-grande.md) | Reescrever módulo crítico sem quebrar nada | @sheldon, @tester, @dev, @qa |
| [Auditoria de segurança](./auditoria-seguranca.md) | Revisar vulnerabilidades antes de produção | @pentester |
| [Publicar no aioson.com](./publicar-no-aioson-com.md) | Distribuir squad, skill ou genome | system:package, system:publish |
| [Clonar design de site](./clonar-design-de-site.md) | Extrair visual de site ou combinar dois estilos | @site-forge, @design-hybrid-forge |
| [Continuidade entre sessões](./continuidade-entre-sessoes.md) | Retomar feature após sessão encerrada | @deyvin, dossier, dev-state |

Volte ao portal principal: [docs/pt/README.md](../README.md)
