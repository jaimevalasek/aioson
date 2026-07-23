# Receita: Da ideia ao PRD via `@briefing`

> **Para quem é:** quem tem uma ideia ainda vaga — anotações no celular, rascunho no Notion, conversa de reunião não formalizada.
> **Tempo de execução:** 30 a 90 min (depende do quanto de material você já tem).
> **O que você vai ter no fim:** um PRD gerado pelo `@product` com base num briefing enriquecido — sem gaps óbvios, com riscos mapeados.

---

## O problema que esta receita resolve

Você foi direto para `@product` com uma ideia vaga e ouviu:

> "Antes de criar um PRD, preciso entender melhor o problema. Qual o caso de uso principal?"

Esse loop de perguntas acontece porque a ideia ainda não tem forma. O `@briefing` existe exatamente para essa etapa: ele estrutura o que existe antes do PRD, para que o `@product` chegue à conversa com base sólida.

---

## A trilha em uma linha

```
ideia vaga / anotações
       ↓
   @briefing   →  .aioson/briefings/{slug}/briefings.md
       ↓
 (opcional) @briefing-refiner  →  loop de refino: auditoria + review.html + apply-feedback
       ↓
aioson briefing:approve
       ↓
   @product   →  prd-{slug}.md
       ↓
 (opcional) @sheldon  →  enriquece o mesmo PRD
       ↓
   @planner   →  implementation-plan-{slug}.md
```

---

## Variante A — Você já tem rascunhos em `plans/`

Este é o caso mais comum: você pesquisou, copiou texto, escreveu ideias, e agora tem arquivos soltos.

### Passo 1 — Coloque o material em `plans/`

```bash
# Arquivos na raiz do projeto (gitignored por padrão)
plans/
├── ideia-notificacoes.md     ← esboço da ideia
├── pesquisa-firebase.md      ← pesquisa técnica que você fez
└── benchmark-concorrentes.md ← análise que você copiou de outro chat
```

> `plans/` é **somente-leitura para os agentes** — eles lêem mas nunca modificam. Seus arquivos ficam intactos.
> Veja [Plans externos para @product](./plans-externos-para-product.md) para detalhes sobre esse fluxo.

### Passo 2 — Ative `@briefing`

```
Você > @briefing

@briefing > Encontrei 3 arquivos em plans/:
             - plans/ideia-notificacoes.md
             - plans/pesquisa-firebase.md
             - plans/benchmark-concorrentes.md

             Quais devo usar como fonte? (todos ou lista específica)
Você > Todos.

@briefing > Lendo e enriquecendo...
             Validando premissas técnicas sobre Firebase push...

             Briefing gerado: .aioson/briefings/notificacoes-push/briefings.md

             Resumo:
             - Problema: usuários perdem eventos importantes por falta de push
             - Hipóteses validadas: 3/4
             - Gap encontrado: frequência máxima de notificação não definida
             - Risco: rate limit do Firebase em plano gratuito (5.000/dia)
             - Próximo passo: aprovação via CLI → @product

             O briefing está pronto. Deseja ajustar algo antes de aprovar?
```

**O que ficou em disco:**
```
.aioson/briefings/notificacoes-push/
└── briefings.md    ← problema, hipóteses, gaps, riscos, perguntas abertas
.aioson/briefings/
└── config.md       ← índice de todos os briefings (status: draft)
```

### Passo 3 — Revise e aprove

Leia `.aioson/briefings/notificacoes-push/briefings.md`.

> **Quer uma revisão estruturada antes de aprovar?** Ative o [`@briefing-refiner`](../4-agentes/briefing-refiner.md): ele audita o briefing em achados estruturados (categoria, severidade, bloqueio), o CLI renderiza a superfície `review.html` (`aioson briefing:review . --slug=notificacoes-push`) para você decidir cada achado e editar cada seção **num navegador de verdade**, e o feedback confirmado é aplicado com `aioson briefing:apply-feedback . --slug=notificacoes-push --confirm` — em rodadas, até nada bloquear o PRD.

Se estiver bom:

```bash
aioson briefing:approve
# ou especifique o slug:
aioson briefing:approve --slug=notificacoes-push
```

O status muda de `draft` para `approved`. O `@product` detecta isso automaticamente.

### Passo 4 — Ative `@product`

```
Você > @product

@product > Detectei briefing aprovado: notificacoes-push (criado hoje).
            Posso usá-lo como base para o PRD desta feature?
Você > Sim.

@product > [lê briefing, faz perguntas apenas sobre o que falta]
            Qual o slug da feature?
Você > push-notifications

@product > ACs principais que vou incluir no PRD:
            1. Usuário recebe push em ≤ 2s após evento
            2. Rate limit respeitado (1 notif/min por usuário)
            3. Desativação via configurações (LGPD)

            Fora do escopo: notificações por email (briefing sinalizou para fase 2).

            PRD criado: .aioson/context/prd-push-notifications.md
            Próximo: @sheldon para enriquecimento opcional, ou @planner.
```

---

## Variante B — A ideia está só na sua cabeça (modo conversacional)

Sem arquivos. Nenhum rascunho. Só uma vontade de construir algo. Quando `plans/` está vazio, `@briefing` entra em **modo conversacional estruturado** — uma entrevista em 6 etapas que constrói o briefing pergunta por pergunta.

```
Você > @briefing

@briefing > Não encontrei arquivos em plans/. Quer planejar a ideia comigo
            conversacionalmente? Vou fazer perguntas e montar o briefing.
Você > Sim.

─── Etapa A — Contexto (o "por que agora?") ───
@briefing > Me conta o contexto: qual a situação atual e o que mudou
            recentemente que fez isso surgir agora? Sempre existe um
            gatilho.
Você > Clientes estão reclamando que perdem atualizações de pedido.
       Tivemos 3 chamados na semana passada.

─── Etapa B — Problema (framing JTBD) ───
@briefing > Qual a dor específica que você quer resolver? Para quem?
            O que eles não conseguem fazer hoje sem dar uma volta?
Você > Cliente faz pedido, fecha o app, e fica sem saber se foi confirmado.

@briefing > Deixa eu reformular como JTBD: "Quando faço um pedido e fecho
            o app, quero saber que ele foi confirmado, para não precisar
            voltar e checar." Faz sentido?
Você > Sim, exatamente.

─── Etapa C — Solução proposta ───
@briefing > Que direções você está cogitando? Múltiplas é ok — é hipótese,
            não compromisso.
Você > Push notification. Talvez SMS para pedidos acima de R$500.

─── Etapa D — Riscos (os 4 de Cagan + risco de não-fazer) ───
@briefing > Vou perguntar em 4 passes:
            1. Valor: usuários vão querer? (ou só toleram?)
            2. Usabilidade: vão entender e configurar?
            3. Viabilidade técnica: dá para construir?
            4. Viabilidade de negócio: legal/LGPD/custo/marca?
            E por fim: qual o custo de NÃO fazer?
Você > [responde cada um]

─── Etapa E — Gaps (estado atual vs desejado) ───
@briefing > Para cada coisa indefinida, vamos enquadrar como:
            "hoje temos X, queremos Y, o delta é Z (mensurável quando der)".
            O que ainda está em aberto?
Você > Frequência máxima de notif por dia. Hoje: indefinido. Queremos: ?

─── Etapa F — Classificação de questões abertas ───
@briefing > Vou marcar cada pergunta com uma tag:
            [research-able]      → < 4h de pesquisa resolve
            [testable]           → experimento de 1-2 dias
            [decision-required]  → julgamento entre alternativas
            [out-of-scope]       → parar agora, não bloqueia

            Resultado:
            1. Frequência máxima       [decision-required]
            2. Engajamento real esperado [research-able]
            3. SMS para pedidos altos  [out-of-scope — fase 2]

@briefing > 6 etapas concluídas. Briefing gerado:
            .aioson/briefings/notificacoes-pedido/briefings.md
```

> **Regra de qualidade:** se mais de 3 perguntas ficarem como `decision-required` ou vagas, `@briefing` faz outra rodada antes de escrever. Briefing apressado custa caro depois.

O resto do fluxo é igual: aprovar via CLI → `@product`.

---

## O que o `@briefing` detecta que o `@product` não detectaria sozinho

| O que ele identifica | Exemplo |
|---|---|
| Hipóteses de mercado não validadas | "Usuários vão usar push?" — ele pesquisa dados de engajamento |
| Riscos técnicos do plano | Rate limits, latências, custos por volume |
| Gaps de escopo | Frequência máxima de notificação não definida |
| Contradições internas | Rascunho diz "em tempo real" mas pesquisa aponta custo proibitivo |
| Decisões abertas que bloqueiam o PRD | "Firebase ou APNS nativo?" precisa ser resolvido antes |

---

## Quando pular o `@briefing`

- Feature simples e clara: MICRO, sem ambiguidade — vá direto para `@product`.
- Já tem um PRD anterior enriquecido — use `@sheldon` para refinar.
- É uma continuação de feature já iniciada — use `@deyvin`.

---

## Arquivos criados por esta receita

```
plans/                              ← seus rascunhos (intocados)
.aioson/briefings/{slug}/
├── briefings.md                    ← output do @briefing
└── {tema-especifico}.md            ← (opcional) temas complexos
.aioson/briefings/config.md         ← índice de briefings
.aioson/context/prd-{slug}.md       ← output do @product
.aioson/context/implementation-plan-{slug}.md ← output do @planner
```

---

## Próximos passos

- [Plans externos para @product](./plans-externos-para-product.md) — como usar ChatGPT/Claude.ai como fonte para `plans/`
- [Feature completa com @sheldon](./feature-completa-com-sheldon.md) — quando o PRD está pronto para enriquecimento opcional e planejamento
- [@briefing — ficha](../4-agentes/briefing.md) — referência técnica do agente
- [@briefing-refiner — ficha](../4-agentes/briefing-refiner.md) — loop de revisão/refino do briefing antes do PRD
- [@product — ficha](../4-agentes/product.md) — referência técnica do agente
