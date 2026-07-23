# Receita: App SaaS do zero

> **Cenário:** SaaS com autenticação, cobrança, área do cliente e administração.
> **Classificação típica:** MEDIUM pela quantidade de integrações, usuários e regras.

MEDIUM aumenta a profundidade. Não cria uma cadeia diferente:

```text
[@briefing → @briefing-refiner] → @product → [@sheldon] → @planner → @dev → @qa
```

## 1. Enquadre o produto

Se a ideia ainda está aberta, use Briefing e Briefing Refiner para confirmar problema, usuários, billing, tenancy e exclusões. Se essas decisões já existem, comece em Product.

## 2. Product fecha o PRD

O PRD único deve incluir, no mínimo:

- papéis e limites de autorização;
- ciclo da assinatura e estados de cobrança;
- comportamento de webhooks e idempotência;
- dados pessoais e retenção;
- fluxos principais de usuário e administração;
- exclusões da primeira entrega;
- ACs observáveis.

```text
Você > @product

@product > PRD criado: .aioson/context/prd-saas-mvp.md
           product_scope: approved
           prd_ready: approved
```

## 3. Sheldon é uma revisão opcional

Para billing, multi-tenancy ou integrações sensíveis, Sheldon pode revisar o mesmo PRD:

```text
Você > @sheldon

@sheldon > Acrescentei ACs para webhook duplicado, downgrade e falha de pagamento.
           O PRD continua sendo a única autoridade.
```

## 4. Planner cria fases verticais

Um bom plano MEDIUM entrega valor verificável em cada fase:

1. identidade, papéis e persistência mínima;
2. assinatura e webhook idempotente;
3. área do cliente com estado real da assinatura;
4. administração e trilha de auditoria;
5. integração, migração e smoke pelo caminho de produção.

Cada fase referencia os ACs, arquivos esperados, checks e riscos. Analyst, Architect, PM, UX/UI e Discovery Design Doc são consultorias opcionais para dúvidas nomeadas, não etapas automáticas.

## 5. DEV implementa e integra

DEV pode trabalhar sozinho ou usar faixas declaradas no manifesto:

```json
{
  "development_lanes": {
    "strategy": "split",
    "integration_owner": "dev",
    "lanes": {
      "backend": {
        "enabled": true,
        "host": "codex",
        "model": "gpt-5.6-sol",
        "prompt": ".aioson/context/execution-prompts/saas-mvp/backend.md",
        "write_paths": ["src/api/**", "tests/api/**"],
        "fallbacks": []
      },
      "frontend": {
        "enabled": true,
        "host": "opencode",
        "model": "provider/model-id",
        "prompt": ".aioson/context/execution-prompts/saas-mvp/frontend.md",
        "write_paths": ["src/ui/**", "tests/ui/**"],
        "fallbacks": []
      }
    }
  }
}
```

As faixas rodam sequencialmente no worktree compartilhado. DEV verifica `write_paths`, integra contratos compartilhados e executa a suíte completa. Uma combinação indisponível pausa; não há fallback implícito para o modelo do chat.

## 6. QA revisa proporcionalmente

Como a feature é MEDIUM, QA aprofunda negativos e integrações nos riscos nomeados:

- autorização entre papéis;
- reprocessamento de webhook;
- falha, cancelamento e downgrade;
- migração e boot;
- smoke do cadastro à assinatura pelo caminho real.

QA grava um único `qa-report-saas-mvp.md`. Em FAIL, retorna ao DEV com evidência reproduzível; em PASS, recomenda o fechamento humano.

## Segurança adicional é opt-in

Pentester não é inline por ser MEDIUM. Ative-o quando o usuário quiser auditoria adicional ou o plano/QA justificar a especialidade, e habilite sua entrada no manifesto. O mesmo vale para Tester e Validator.

## Artefatos finais

```text
.aioson/context/
├── prd-saas-mvp.md
├── implementation-plan-saas-mvp.md
└── qa-report-saas-mvp.md
```

Pesquisas, dossiê e pareceres permanecem auxiliares e não bloqueantes.

## Veja também

- [Decisões iniciais](../2-comecar/decisoes-iniciais.md)
- [Feature completa com Sheldon opcional](./feature-completa-com-sheldon.md)
- [Execução de agentes](../5-referencia/agent-execution.md)
- [Secure by Default](../5-referencia/secure-by-default.md)
