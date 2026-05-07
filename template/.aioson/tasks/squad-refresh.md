# Task: Squad Refresh

> Atualiza um squad existente com world-model breadth, yes-and patterns, e research focada. Diferente de `analyze` (só diagnostica), `extend` (só adiciona) e `repair` (só conserta estrutura). É a task certa quando o usuário relata que um squad está rejeitando pedidos legítimos ou agindo "narrow demais" (ex: farmácia que só fala de remédio, restaurante que recusa pedido fora do menu).

## Quando usar

- `@squad refresh <slug>` — modo interativo (default)
- O usuário relata um caso real de falha do squad ("cliente pediu X e o agente disse que só sabe Y")
- `@squad analyze` indicou gaps de breadth ou rigidez
- Squads antigos criados antes da introdução do `domain-breadth.md` (commits pre-2026-05-07)

## Entrada

- slug do squad existente em `.aioson/squads/<slug>/`

## Pré-carregamento obrigatório

Antes de qualquer coisa, carregue `.aioson/docs/squad/domain-breadth.md`. É a base do refresh — o template `role + backstory + goal + operational_breadth + interaction_principles`, os padrões yes-and, o método HEARD para refusals, e os 4 worked examples (pharmacy, restaurant, gym, hotel) ficam aqui.

Carregue também `.aioson/docs/squad/quality-lens.md` (scorecard com critério "domain breadth").

## Processo

### Passo 1 — Ler squad package

Inventário completo:

- `.aioson/squads/<slug>/squad.manifest.json` — metadata + executors declarados
- `.aioson/squads/<slug>/squad.md` — texto canônico
- `.aioson/squads/<slug>/agents/agents.md` — mapa textual
- `.aioson/squads/<slug>/agents/<executor>.md` — todos os prompts
- `.aioson/squads/<slug>/docs/design-doc.md`, `readiness.md` — se existirem
- `.aioson/squads/<slug>/skills/`, `templates/`, `workflows/` — listagem

Se o slug não tem `squad.manifest.json` (squad legado), rode `squad-repair.md` primeiro para gerar o manifesto antes de continuar.

### Passo 2 — Diagnóstico silencioso de breadth

Para cada executor cuja descrição indica papel **customer-facing** (atendimento, vendas, suporte, recepção, host, concierge, etc.), verifique:

- [ ] O prompt tem o bloco `role + backstory + goal` na seção Quick Context (ou equivalente)?
- [ ] Existe um bloco `operational_breadth` com `primary`, `adjacent` (≥ 5 itens), e `out_of_scope`?
- [ ] Existem `interaction_principles` que incluem yes-and explícito ("default 'yes, and...'")?
- [ ] O backstory é ancorado em real-world (cita venues reais, anos de experiência, tipos de cliente reais)? Ou é genérico ("você é um atendente")?
- [ ] O prompt inclui o anti-padrão "never say 'we only sell X'"?

Monte uma matriz silenciosa `{executor: [gaps]}`. Não mostre ainda — você vai usar isso ao gerar o plano.

### Passo 3 — Intake conversacional

Apresente ao usuário em uma única mensagem (não rebatia perguntas):

> "Vamos refrescar a squad **`<slug>`**. Já li o pacote ({n} executors, {n} skills). Pra eu calibrar o refresh, me responde no mesmo bloco se quiser:
>
> 1. **Caso real de falha:** o que não está funcionando hoje? Algum exemplo específico em que o squad agiu estreito ou recusou algo legítimo? (ex: 'cliente pediu doce e o atendente disse que só vendemos remédio')
> 2. **Realidade operacional:** o que praticantes reais nesse domínio lidam dia-a-dia além do óbvio? Se você não souber, eu pesquiso.
> 3. **Outras melhorias:** tom, idioma, novos executors, fluxos? Ou foco só em breadth?"

Se o usuário responder rapidamente (linha curta), assuma autonomia alta e infira o resto. Se o usuário descreveu um caso de dor específico, aquele caso vira o **anchor case** do refresh.

### Passo 4 — Web research (condicional)

Dispare research apenas quando algum desses sinais ocorrer:

- O usuário pediu explicitamente ("não sei o que vende numa farmácia, pesquisa")
- O domínio é desconhecido para você ou o `operational_breadth` declarado é vago
- O caso de dor envolve um produto/serviço/cenário sobre o qual você não tem confiança

Quando disparar, prefira invocar `@orache` para uma investigation pass focada — ele vai scout real venues, reviews, competitor stores, e voltar com adjacency map. Use `@orache` em vez de fazer 5 web searches dispersas.

Salve o output em `researchs/<slug>-refresh-<ISO-date>/summary.md` (a pasta `researchs/` é gitignored — local cache).

### Passo 5 — Gerar plano de correções

Crie `.aioson/squads/<slug>/docs/REFRESH-<ISO-date>.md` com este formato:

```markdown
---
slug: <slug>
created_at: <ISO-date>
trigger: user-reported breadth failure | analyze recommendation | preventive
status: draft
based_on:
  user_pain: "<quote do user, se houve>"
  research: "<path do summary se houve>"
  diagnosis: "<resumo silencioso da matriz>"
---

# Refresh Plan — <slug> — <date>

## Anchor case (the user's pain story, if any)
"<quote literal do user>"

## Diagnosis matrix
| Executor | Gaps detected |
|---|---|
| atendente | missing operational_breadth.adjacent; backstory genérica; no yes-and |
| orquestrador | no breadth context propagation |

## Research synthesis (if web research happened)
- Real practitioners in <domain> handle: <adjacency list>
- Adjacent businesses customers come from: <list>
- Yes-and patterns observed in industry: <list>

## Per-executor changes

### Executor: atendente

**Current state (relevant excerpt):**
```yaml
role: "Atendente de farmácia"
mission: "Atender clientes e vender remédios"
```

**Refresh — replace Quick Context block with:**
```yaml
role: "Atendente de Farmácia — drogaria de bairro"
backstory: |
  Você atende o balcão de uma farmácia brasileira de bairro há 8+
  anos. Seus clientes vêm para receitas, mas também levam doce pro
  filho que tá esperando no carro, snacks, cosméticos, vitaminas...
goal: "Cada cliente sai com o que precisa ou um próximo passo claro."

operational_breadth:
  primary: ["medicamentos com receita", "OTC", "consulta com farmacêutico"]
  adjacent:
    - "doces, chocolates, gomas"
    - "cosméticos, hidratantes, protetor solar"
    - "produtos de bebê (fórmula, fraldas)"
    - "vitaminas, suplementos"
    - "preservativos, absorventes"
    - "primeiros socorros, termômetros"
    - "cartões de presente, lotéricas"
  out_of_scope:
    - "diagnóstico médico"
    - "medicamentos controlados sem receita"

interaction_principles:
  - "Default 'yes, and...' — aceite o pedido, construa a partir dele"
  - "Recuse só quando ilegal, inseguro ou genuinamente indisponível"
  - "Nunca diga 'só vendemos remédio' — diga o que VOCÊ tem"
  - "Valide a necessidade antes de responder ao pedido literal"
```

### Executor: <next>
...

## Files to update
- `.aioson/squads/<slug>/agents/atendente.md` — replace Quick Context
- `.aioson/squads/<slug>/agents/orquestrador.md` — add breadth context line
- `.aioson/squads/<slug>/squad.md` — version bump

## Validation
Após apply, rodar `squad-validate` mentalmente. Recomendar warm-up round com o anchor case.
```

### Passo 6 — Mostrar diff e pedir confirmação

Apresente ao usuário em formato compacto:

```
Refresh plan for "<slug>" salvo em:
  .aioson/squads/<slug>/docs/REFRESH-<date>.md

Mudanças propostas:
  UPDATE  agents/atendente.md       — replace Quick Context block (+~40 linhas)
  UPDATE  agents/orquestrador.md    — add breadth propagation line (+~5 linhas)
  UPDATE  squad.md                  — version bump <n> → <n+1>

Aplicar tudo? [Y/n/selecionar específico]
```

Se o usuário disser "selecionar específico", ofereça uma lista numerada e aplique apenas o que ele aprovar.

### Passo 7 — Aplicar mudanças

Para cada executor afetado:

1. Leia o arquivo atual.
2. Identifique a seção `## Quick context` (ou equivalente).
3. **Preserve**: `## Mission`, header com slug, `## Active genomes`, `## Hard constraints`, `## Output contract`, e qualquer instrução customizada que o usuário tenha adicionado.
4. **Substitua ou insira**: o bloco YAML `role + backstory + goal + operational_breadth + interaction_principles` na seção Quick Context.
5. Se o executor não tem seção Quick Context, insira-a logo após `## Mission`.
6. Salve o arquivo.

Atualize `squad.md`:
- Bump `version` (1.0.0 → 1.1.0)
- Adicione entrada no histórico de refresh: `## Refresh history` → "<date>: breadth refresh based on <pain quote summary>"

Atualize `squad.manifest.json` se houver mudanças de metadata (raramente — geralmente só `squad.md` muda).

### Passo 8 — Validar

Rode mentalmente `.aioson/tasks/squad-validate.md`:
- Manifest ↔ filesystem consistente?
- Todos os executors ainda referenciados existem?
- Frontmatter dos executors válido?

Se algo quebrou, pare e pergunte ao usuário antes de tentar consertar.

### Passo 9 — Recomendar warm-up

Conclua com:

> "Refresh aplicado em **`<slug>`**. Recomendo um warm-up round pra testar:
>
> Use o caso real que motivou o refresh: '<anchor case>'. O atendente agora deve responder com yes-and (ex: 'sim, temos chocolate na seção 2...') em vez de '<resposta narrow original>'.
>
> Se o comportamento não bater, rode `@squad refresh <slug>` de novo descrevendo o que ainda está faltando."

## Diferenças de outras tasks

| Task | Foco | Modifica prompts dos executors? |
|---|---|---|
| `analyze` | Diagnóstico de cobertura/estrutura | Não |
| `extend` | Adicionar NOVOS componentes | Não |
| `repair` | Consertar inconsistência manifest↔filesystem | Regenera arquivos faltantes apenas |
| **`refresh`** | **Melhorar world model dos executors** | **Sim — atualiza Quick Context blocks** |

## Regras

- NUNCA aplicar mudanças sem aprovação explícita do usuário
- SEMPRE mostrar diff antes
- Preservar Mission, headers, hard constraints, output contracts dos executors — modificar APENAS o Quick Context block
- Salvar plano em `.aioson/squads/<slug>/docs/REFRESH-<date>.md` antes de aplicar
- Carregar `.aioson/docs/squad/domain-breadth.md` no Passo 0 (antes do Passo 1)
- Para squads sem manifest formal: rodar `squad-repair` primeiro
- Bumpar version em `squad.md` a cada refresh aplicado
- Refresh é incremental: você pode rodar `refresh` várias vezes na mesma squad ao longo do tempo

## Saída

- `.aioson/squads/<slug>/docs/REFRESH-<date>.md` (plano persistido)
- Arquivos `agents/<executor>.md` atualizados
- `squad.md` com version bump + refresh history entry
- Recomendação de warm-up no chat
