# @sheldon — Autoridade única de spec (SMALL) e endurecedor de PRD

> **Para quem é:** quem trabalha em projetos SMALL (o caso mais comum) e quer a fase de spec completa numa única passada; ou quem quer análise técnica profunda e endurecimento de PRD em qualquer tamanho de projeto.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:**
> - Por que `@sheldon` é a autoridade única de spec no SMALL (v1.35.0)
> - O que ele produz numa passada e quais gates ele aprova
> - Como usá-lo no MEDIUM para endurecer o PRD antes do fan-out

---

## Para que serve

### SMALL — autoridade única de spec (papel principal)

Em projetos SMALL, toda a fase de especificação — requisitos, decisões técnicas, design doc, readiness, plano de implementação e contrato de harness — pode (e deve) ser produzida por **um único agente em uma única passada**. Isso elimina hops, evita drift entre artefatos e entrega ao `@dev` um pacote coeso e já verificado.

`@sheldon` é essa autoridade. Ele executa verticalmente: lê o PRD, varre o codebase, detecta gaps, pesquisa fontes externas quando necessário, e produz o pacote de spec completo com Gates A/B/C aprovados antes de passar o bastão.

**Lane SMALL (padrão em v1.35.0):**

```
@product → @sheldon → @dev → @qa
```

### Qualquer lane — endurecimento de PRD

Em qualquer tamanho de projeto, `@sheldon` pode ser ativado após `@product` para fazer **gap analysis, pesquisa web, sizing técnico e endurecimento do PRD** — antes do fan-out de `@orchestrator` no MEDIUM ou antes de qualquer outra etapa.

---

## O que `@sheldon` produz numa passada (SMALL)

| Artefato | Descrição |
|---|---|
| PRD enriquecido (in-place) | Gaps detectados e preenchidos diretamente no `prd-{slug}.md` |
| `sheldon-enrichment-{slug}.md` | Registro das rodadas de enriquecimento |
| `requirements-{slug}.md` | Entidades, regras de negócio, edge cases, MER (missing entity relationships) |
| `architecture.md` (atualizado) | Decisões técnicas: estrutura, libs, integração |
| `implementation-plan-{slug}.md` | Plano faseado com fases numeradas |
| `harness-contract.json` | Contrato de sucesso com critérios RG-* para `@validator` |
| Gates A/B/C aprovados | Pré-condições verificadas antes do `@dev` iniciar |

---

## Quando invocar

- Projetos **SMALL** (classificação 2–3), após `@product` — é o passo padrão da lane.
- PRD tem gaps ou decisões difíceis e você quer análise técnica antes de implementar.
- Você quer enriquecer um PRD com pesquisa de fontes externas (Stripe docs, RFCs, posts técnicos).
- Como pré-etapa opcional antes de `@orchestrator` no MEDIUM (endurece o PRD antes do fan-out).
- Você quer **revisão crítica do PRD**: campos de negócio não especificados, fluxos de erro ausentes, premissas implícitas que podem virar bugs.

---

## Quando NÃO invocar

- Projeto MICRO sem decisões técnicas novas → `@dev` lê o PRD diretamente.
- PRD ainda não existe → `@product` primeiro.
- Spec já está completa e Gates A/B/C aprovados → vá direto para `@dev`.
- Implementação já foi feita → `@pentester` ou `@qa` são mais adequados agora.

---

## Diálogo típico (SMALL)

```
Você > @sheldon

@sheldon > Lendo prd-checkout-stripe.md...
           Varrendo codebase: models, services, routes...
           
           Gaps detectados no PRD:
           1. Sem tratamento de downgrade de plano (só upgrade)
           2. Sem política de proration na troca de plano
           3. Webhook Stripe sem política de retry/idempotency
           4. Nenhum AC para falha de cobrança após 3 tentativas (dunning)
           5. Entidade "OrderItem" referenciada mas não modelada no PRD
           
           Fontes externas? [URL / arquivo local / "não"]

Você > docs.stripe.com/billing/subscriptions/upgrade-downgrade

@sheldon > [pesquisa, lê, cita]
           
           Enriquecendo PRD in-place (gaps 1 e 2 são decisões de produto)...
           prd-checkout-stripe.md atualizado.
           
           Produzindo requirements, architecture, implementation-plan...
           
           Gate A (requisitos verificáveis): ✓
           Gate B (decisões técnicas): ✓
           Gate C (plano faseado + harness-contract com RG-*): ✓
           
           Pacote de spec pronto:
             .aioson/context/requirements-checkout-stripe.md
             .aioson/context/architecture.md
             .aioson/context/implementation-plan-checkout-stripe.md
             .aioson/context/sheldon-enrichment-checkout-stripe.md
             .aioson/plans/checkout-stripe/harness-contract.json
           
           Próximo: @dev.
```

---

## `@sheldon` no MEDIUM

No MEDIUM, `@sheldon` pode atuar de duas formas:

1. **Pré-etapa antes de `@orchestrator`:** endurece o PRD com análise técnica e pesquisa web antes que `@orchestrator` dispare o fan-out.
2. **Stream do fan-out do `@orchestrator`:** `@orchestrator` o inclui como um dos sub-agentes para análise técnica profunda.

```
@product → @sheldon (endurece PRD) → @orchestrator → @dev → @pentester → @qa
```

---

## Múltiplas rodadas

`@sheldon` pode ser invocado N vezes no mesmo PRD. Ao detectar `sheldon-enrichment-{slug}.md` existente, ele entra em modo de **re-enrichment**: lê o que mudou desde a última rodada e oferece nova análise incremental, sem refazer do zero.

---

## Saídas em disco

| Arquivo | Criado por | Consumido por |
|---|---|---|
| `prd-{slug}.md` | `@sheldon` (atualiza in-place) | `@dev`, `@qa` |
| `sheldon-enrichment-{slug}.md` | `@sheldon` | `@sheldon` (re-entrada) |
| `requirements-{slug}.md` | `@sheldon` | `@dev`, `@qa` |
| `architecture.md` | `@sheldon` (atualiza) | `@dev`, `@qa` |
| `implementation-plan-{slug}.md` | `@sheldon` | `@dev` |
| `harness-contract.json` | `@sheldon` | `@validator` |

**Campo `verification` no contrato (v1.24.0+):** ao gerar o `harness-contract.json`, o `@sheldon` autora um comando de shell `verification` para todo critério `binary:true` mecanicamente verificável. Com isso, `aioson harness:check` consegue verificar o critério de forma determinística fora do self-loop.

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — stack, classificação
- `.aioson/context/prd-{slug}.md` — o PRD alvo
- `.aioson/context/sheldon-enrichment-{slug}.md` — histórico de enriquecimentos (re-entrada)
- `.aioson/context/architecture.md` — estado atual da arquitetura
- `.aioson/context/bootstrap/` — cache semântico do `@discover` (quando disponível)
- `.aioson/briefings/{slug}/briefings.md` — se `briefing_source` está no PRD
- Fontes externas — URLs e arquivos que você fornecer explicitamente
- Código-fonte diretamente (models, schemas, services)

---

## Handoff típico

- **Vem de:** `@product`
- **Vai para:** `@dev` (SMALL) — ou `@orchestrator` (MEDIUM, como pré-etapa)

---

## Próximo passo

- [Ficha do @dev](./dev.md) — implementa com base no pacote de spec produzido
- [Ficha do @orchestrator](./orchestrator.md) — maestro de spec para MEDIUM
- [Receita: Feature completa](../3-receitas/feature-completa-com-sheldon.md) — fluxo prático com todos os artefatos
- [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md) — mapa de todos os artefatos
