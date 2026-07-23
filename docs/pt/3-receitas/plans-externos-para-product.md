# Receita: Plans externos para `@product` e `@sheldon`

> **Para quem é:** quem fez pesquisa ou planejamento em outro ambiente — ChatGPT, Claude.ai, Notion, Google Docs, papel — e quer que o AIOSON use esse material.
> **Tempo de execução:** 5 min de setup + tempo da sessão normal.
> **O que você vai ter no fim:** seus rascunhos sendo consumidos nativamente pelo `@product` e `@sheldon`, sem re-explicar nada.

---

## O problema

Você pesquisou uma feature no ChatGPT. Escreveu uma análise no Claude.ai. Tem um doc no Notion. Começou a sessão no AIOSON e agora vai re-explicar tudo de novo — ou copiar e colar em partes.

A pasta `plans/` resolve isso. É um canal direto entre "coisas que você escreveu antes" e os agentes que precisam saber.

---

## Como funciona

```
ChatGPT / Claude.ai / Notion / qualquer lugar
            ↓  copiar texto
       plans/{nome}.md     ← você escreve aqui
            ↓  lido automaticamente por
    @briefing / @product / @sheldon
            ↓  artefato real criado em
    .aioson/context/prd-{slug}.md
```

`plans/` é **gitignored por padrão**. Seu material de pesquisa nunca vai para o repositório — é somente seu, local.

---

## Passo a passo

### 1. Crie o arquivo em `plans/`

```bash
# Na raiz do projeto (mesmo nível de src/, .aioson/, etc.)
mkdir -p plans
```

Salve seu material lá. Pode ser qualquer formato de texto:

```
plans/
├── analise-stripe-billing.md      ← conversa que você exportou do ChatGPT
├── pesquisa-webhook-seguranca.md  ← pesquisa técnica sua
├── briefing-reuniao-2026-05-01.md ← anotações de reunião
└── benchmark-concorrentes.txt     ← texto simples também funciona
```

### 2. Escreva como quiser — sem formato obrigatório

Os agentes lêem texto livre. Sem template. Suas anotações podem estar:

- Desorganizadas (bullets soltos, títulos inconsistentes)
- Em inglês ou português — ambos funcionam
- Como exportação de conversa (Você: / ChatGPT:)
- Como cópia de um Google Doc

O `@briefing` e o `@product` sintetizam o que encontrarem.

### 3. Ative o agente

**Se a ideia ainda é vaga → use `@briefing` primeiro:**

```
Você > @briefing

@briefing > Encontrei 2 arquivos em plans/:
             - plans/analise-stripe-billing.md
             - plans/pesquisa-webhook-seguranca.md
             Quais devo usar?
Você > Todos.
```

**Se a ideia já está clara → vá direto para `@product`:**

```
Você > @product

@product > Encontrei fontes de pré-produção:
            - plans/analise-stripe-billing.md
            - plans/pesquisa-webhook-seguranca.md
            Posso usar como base para o PRD?
Você > Sim.

@product > [lê, sintetiza, faz perguntas apenas sobre o que falta]
            PRD criado: .aioson/context/prd-billing-assinatura.md
```

**`@sheldon` também lê `plans/` automaticamente:**

```
Você > @sheldon

@sheldon > Lendo prd.md...
            Cruzando com plans/:
            - plans/pesquisa-webhook-seguranca.md:
              risco identificado não está no PRD
            Recomendo enriquecer o AC de idempotência.
```

### 4. O registro automático

Toda vez que um agente consume um arquivo de `plans/`, ele registra em `plans/source-manifest.md`:

```markdown
| File | Consumed by | Date | Artifact produced |
|------|-------------|------|-------------------|
| plans/analise-stripe-billing.md | @product | 2026-05-07 | .aioson/context/prd-billing-assinatura.md |
| plans/pesquisa-webhook-seguranca.md | @sheldon | 2026-05-07 | .aioson/context/prd-billing-assinatura.md (enriquecido) |
```

Isso permite rastrear: "qual artefato foi gerado a partir de qual pesquisa?".

---

## Exemplos de tipos de material que funcionam bem

| Tipo de conteúdo | Onde colocar |
|---|---|
| Conversa exportada do ChatGPT sobre uma feature | `plans/conversa-{tema}.md` |
| Análise técnica de API externa (Stripe, Twilio…) | `plans/pesquisa-{api}.md` |
| Anotações de reunião de discovery | `plans/briefing-reuniao-{data}.md` |
| Benchmark de concorrentes | `plans/benchmark-{produto}.md` |
| Esboço de fluxo desenhado e transcrito | `plans/fluxo-{feature}.md` |
| Cópia de documentação relevante | `plans/ref-{topico}.md` |
| Lista de requisitos rascunhados | `plans/reqs-{feature}.md` |

---

## Regras do `plans/`

| Regra | Detalhe |
|---|---|
| **Gitignored** | Por padrão em `.gitignore`. Nunca vai para o repositório. |
| **Read-only para agentes** | Nenhum agente modifica ou deleta seus arquivos. |
| **Permanecem até entrega** | Você decide quando remover. Mesmo depois do PRD pronto. |
| **Qualquer formato de texto** | `.md`, `.txt`, `.log` — qualquer extensão funciona. |
| **Não são PRDs reais** | São matéria-prima. O PRD real fica em `.aioson/context/`. |

---

## Diferença entre `plans/` e `.aioson/plans/`

São duas coisas distintas:

| | `plans/` (raiz) | `.aioson/plans/` |
|---|---|---|
| **Quem escreve** | Você (pesquisa externa) | `@planner` |
| **Quando existe** | Antes do ciclo de agentes | Após aprovação do PRD |
| **O que contém** | Rascunhos, anotações, exportações | Plano vertical canônico da feature |
| **É gitignored?** | Sim (padrão) | Não (comprometido com o projeto) |
| **Lido por** | `@briefing`, `@product`, `@sheldon` | `@dev`, `@qa` |

Veja [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md) para a referência completa.

---

## Casos especiais

### Você tem muito material — como organizar?

Sem padrão obrigatório. Mas nomenclatura descritiva ajuda:

```
plans/
├── 01-contexto-mercado.md
├── 02-analise-tecnica.md
├── 03-requisitos-rascunhados.md
└── 04-riscos-identificados.md
```

Quando o `@briefing` perguntar "quais usar?", você diz "todos" ou lista os relevantes.

### O material está em inglês — tudo bem?

Sim. Os agentes lêem em qualquer língua. O output deles vai seguir `interaction_language` do `project.context.md` (geralmente a mesma língua que você usa).

### E se eu quiser compartilhar plans/ com o time?

Remova a entrada do `.gitignore`. Não há nada no AIOSON que impeça isso — gitignored é o default, não uma obrigação técnica.

---

## Próximos passos

- [Da ideia ao PRD via @briefing](./da-ideia-ao-prd-via-briefing.md) — fluxo completo quando a ideia é vaga
- [Feature completa com @sheldon](./feature-completa-com-sheldon.md) — depois que o PRD está pronto
- [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md) — entenda a diferença entre todos os tipos de plano
