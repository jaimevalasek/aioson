# Receita: Landing page do zero

> **Para quem é:** desenvolvedor solo ou designer que precisa de uma landing page convincente sem gastar horas escrevendo copy e brigando com o visual.
> **Tempo de execução:** 45–90 min.
> **O que você vai ter no fim:** landing page com protótipo aprovado por você, copy de conversão, código funcional e veredito de QA — tudo rastreável em artefatos.

---

## Cenário

Você tem um produto novo e precisa de uma página de apresentação. O desafio clássico: ou você escreve copy genérico ("Bem-vindo ao nosso produto"), ou gasta horas tentando encontrar as palavras certas. E quando chega no código, o visual fica inconsistente — um botão com uma cor, o header com outra.

Landing page é **superfície visual rica**. Por isso ela entra na esteira pelo começo, e não direto no PRD:

```text
@briefing → @refiner → @copywriter → @product → @sheldon → @planner → @dev → @qa
                    ↓
        prototype.html aprovado por VOCÊ
```

O `@refiner` monta um **protótipo navegável** com as seções, os estados e as interações reais. Você caminha por ele e aprova. Só então o PRD existe — e o protótipo aprovado vira a autoridade visual que o `@dev` segue.

> **A regra dura:** escopo visual não passa para o `@product` sem um protótipo próprio aprovado (`prototype_status: current`). Isso é o que impede a página de nascer "quase certa" e virar retrabalho depois.

Este é um projeto **SMALL** (1 tipo de usuário, 0 integrações externas, sem regras de negócio complexas).

---

## Pré-requisitos

- Node.js 20+ instalado
- Claude Code (ou Codex/OpenCode)
- AIOSON instalado no projeto (`npx @jaimevalasek/aioson init minha-landing`)
- **Recomendado:** 2–4 imagens de referência do visual que você quer (sua marca, ou páginas que você admira)

---

## Passo 1 — Criar o projeto e configurar

```bash
npx @jaimevalasek/aioson init minha-landing
cd minha-landing
```

No wizard:
```
? Quais ferramentas AI? › Claude Code
? Modo? › Development
? Idioma dos agentes? › pt-BR
```

> **Sobre a identidade visual:** o wizard não pergunta por design — o template embarca só o motor `interface-design`, sempre instalado. A rota recomendada não é escolher um preset (não existe mais catálogo) — é dar suas **imagens de referência**. A skill `reference-identity-extract` as converte **uma única vez** num `identity.md` de texto, e o motor `interface-design` aplica essa identidade em tudo que vier depois (protótipo e build). É isso que evita a página sair com cara de template. `@setup` oferece essa rota logo no início, sempre com confirmação explícita. Ver [Decisões iniciais](../2-comecar/decisoes-iniciais.md#escolhendo-o-design-system).

```bash
claude .
```

```
Você > @setup

@setup > Detectando stack... Nenhuma instalada ainda.
         Qual o tipo do projeto? [web_app · api · site · script · ...]
Você > site

@setup > Stack preferido? (ex: Next.js, Astro, HTML puro)
Você > Next.js + Tailwind

@setup > Quantos tipos de usuário? (visitantes da landing não contam como "tipo")
Você > 1 (potencial cliente lendo a página)

@setup > Integrações externas?
Você > 0 por enquanto

@setup > Score: 0+0+0 = 0 → MICRO. Como é um site com superfície visual,
         recomendo SMALL: mais evidência no protótipo e no QA. Concorda?
Você > Sim, SMALL.

@setup > Classificação: SMALL. Quer usar imagens de referência para a identidade
         visual, ou prefere um preset? [referência / preset / pular]
Você > referência

@setup > Coloque as imagens em plans/landing-principal/ e me avise.
         project.context.md criado. Próximo: @briefing.
```

---

## Passo 2 — `@briefing` enquadra a promessa

Junte o que você já tem em `plans/landing-principal/` — anotações, imagens de referência, prints de concorrentes, um rascunho de pitch. É a matéria-prima.

```
Você > @briefing

@briefing > Lendo plans/landing-principal/ — 3 imagens de referência, 1 nota de pitch.
            Cada fonte entra com caminho e hash.

@briefing > Qual o resultado que essa página precisa produzir?
Você > Dono de restaurante entende em 10 segundos que vai saber para onde vai o dinheiro dele, e cria conta.

@briefing > Público-alvo principal?
Você > Donos de restaurantes e pequenas lojas, 1–5 funcionários. Maioria sem formação financeira.

@briefing > Quais objeções típicas?
Você > "É complicado", "não tenho tempo pra aprender", "funciona pro meu tipo de negócio?"

@briefing > Promessas registradas:
            PROM-1 valor entendido em ≤10s de leitura
            PROM-2 as três objeções aparecem respondidas antes do CTA final
            PROM-3 dashboard em 5 minutos é o diferencial que abre a página
            PROM-4 CTA "Comece grátis — sem cartão" repetido no topo e no fim

@briefing > Ainda em aberto (marcado, não inventado):
            - preço aparece na página ou só depois do cadastro?
            - depoimento real ou nenhum? (fictício não entra)

@briefing > briefing.md gravado. Próximo: @refiner.
```

> **O que muda aqui:** as promessas viram `PROM-1..n` rastreáveis. Lá na frente, o `@product` tem que cobrir todas — não dá para uma promessa sumir no caminho.

---

## Passo 3 — `@refiner` monta o protótipo que você aprova

Esta é a fase que economiza mais tempo na receita inteira.

```
Você > @refiner

@refiner > Extraindo a identidade das 3 imagens de referência...
                    identity.md gravado: paleta, peso tipográfico, densidade,
                    tratamento de borda e sombra, cadência de espaçamento.

@refiner > Lacunas do briefing viraram achados com opções:
                    [1] Preço na página?
                        (a) faixa "a partir de R$ X"  (b) sem preço  (c) tabela completa
                    [2] Prova social sem depoimento real?
                        (a) logos de clientes  (b) número de negócios atendidos  (c) omitir
Você > 1a, 2b

@refiner > Montando prototype.html — autocontido, com as seções reais:
                    nav · hero · problema · como funciona · faixa de preço ·
                    prova (número) · FAQ (3 objeções) · CTA final · footer
                    Estados incluídos: hover dos CTAs, FAQ aberto/fechado,
                    mobile 390px, dark/light.

@refiner > Abra .aioson/context/features/landing-principal/prototype.html
                    e me diga o que mudar — pode comentar na própria tela.
```

Você abre no navegador, navega, e devolve o feedback:

```
Você > O hero está com muito respiro, a headline perde força. E o FAQ deveria vir antes do preço.

@refiner > Rodada 2 aplicada: hero mais compacto, FAQ movido para antes do preço.
                    refinement-report.md registra as duas rodadas.

Você > Agora sim. Aprovado.

@refiner > prototype_status: current, aprovado por você.
                    Próximo: @copywriter (texto de conversão) e depois @product.
```

> **Por que o protótipo antes do PRD:** ele é a única forma de você discordar do visual **antes** de existir código. Depois de aprovado, ele vira autoridade — o `@dev` implementa a partir dele, não a partir da imaginação dele.

---

## Passo 4 — `@copywriter` escreve o copy de conversão

O protótipo definiu o espaço; agora o texto entra nele. (Se você já tem o copy pronto, pule este passo — o `@copywriter` é uma especialização, não uma etapa obrigatória da esteira.)

```
Você > @copywriter

@copywriter > Lendo briefing + protótipo aprovado.
              Público: donos de restaurantes/lojas, sem formação financeira.
              Objeções: complexidade, tempo, adequação.
              CTA: "Comece grátis — sem cartão".
              O protótipo me dá o espaço exato de cada bloco.

@copywriter > Copy gerado em .aioson/context/copy-landing-principal.md:

              HERO
              Headline: "Saiba para onde vai cada real do seu negócio — em 5 minutos"
              Sub: "ContaFácil conecta com seu banco e mostra o quadro real,
                    sem planilhas, sem contador."
              CTA: "Comece grátis — sem cartão"

              PROBLEMA
              "Todo mês você fecha o caixa sem entender por que sobrou tão pouco..."

              COMO FUNCIONA — 3 passos, um por card do protótipo
              PROVA — "1.200 negócios já sabem" (número, sem depoimento fictício)
              FAQ — 3 perguntas, uma por objeção mapeada no briefing
              CTA final

@copywriter > Próximo: @product.
```

> **Copy antes do PRD, layout antes do copy.** O protótipo define quanto espaço cada bloco tem; o copy preenche esse espaço; o PRD registra o que a página precisa provar. Nessa ordem, ninguém reescreve o trabalho do outro.

---

## Passo 5 — `@product` escreve o PRD

```
Você > @product

@product > Lendo briefing aprovado + protótipo (current) + copy.
           Convertendo em capacidades observáveis:

           CAP-01 Comunicar a promessa central acima da dobra
                  AC: hero renderiza headline, sub e CTA sem scroll em 390px e 1440px
           CAP-02 Responder as 3 objeções antes do CTA final
                  AC: FAQ tem 3 itens, cada um abre/fecha, um por objeção do briefing
           CAP-03 Levar ao cadastro
                  AC: CTA "Comece grátis — sem cartão" aparece no hero e no rodapé,
                      ambos apontando para /signup
           CAP-04 Manter a identidade aprovada
                  AC: cores, tipografia e espaçamento conferem com identity.md

           Fora de escopo (escrito, não subentendido): formulário de captura de
           email, integração de analytics, versão em inglês.

           Cobertura de promessas: PROM-1..4 → CAP-01..04 ✓

@product > prd-landing-principal.md gravado. Próximo: @sheldon.
```

---

## Passo 6 — `@sheldon` sela, `@planner` corta

```
Você > @sheldon

@sheldon > PRD × briefing × protótipo × repositório.
           - CAP-01 dizia "acima da dobra" sem viewport → AC agora nomeia 390px e 1440px
           - protótipo tem estado dark; o PRD não dizia nada → CAP-05 adicionado
           - "carrossel de depoimentos" não estava em lugar nenhum → escopo recusado
@sheldon > sheldon_review: approved, PASS vinculado ao hash atual.
@sheldon > Próximo: @planner.

Você > @planner

@planner > Plano vertical em 3 etapas, cada uma entregando página navegável:
           Etapa 1 — shell + hero (CAP-01)      app/page.tsx, components/{NavBar,Hero}.tsx
           Etapa 2 — corpo e FAQ (CAP-02)       components/{ComoFunciona,Preco,Prova,FAQ}.tsx
           Etapa 3 — CTA, footer, dark (CAP-03/04/05)  components/{CTABand,Footer}.tsx, tokens
           Check por etapa: next build + inspeção nos dois viewports.
@planner > Gate C aprovado. Próximo: @dev.
```

---

## Passo 7 — `@dev` implementa a partir do protótipo

```
Você > @dev

@dev > Autoridade visual resolvida: identity.md (vinculado no PRD) → protótipo aprovado.
       Não vou inventar sistema visual nem trocar o design.

@dev > Etapa 1/3 — shell + hero ✓   next build ✓
@dev > Etapa 2/3 — corpo e FAQ  ✓   next build ✓
@dev > Etapa 3/3 — CTA, footer, dark ✓

@dev > Preview: next dev → localhost:3000 ✓
@dev > dev-state.md atualizado. Próximo: @qa.
```

> **O que mudou em relação a versões antigas do AIOSON:** o `@dev` não pede mais um `design-doc.md` de um agente de UI. Ele resolve a direção visual nesta ordem, parando no primeiro acerto: **identidade vinculada no PRD → protótipo aprovado → design skill do projeto → convenção que já existe no repositório.** Se ainda assim a direção não estiver resolvida, isso é pergunta de produto — volta para o `@product`.

---

## Passo 8 — `@qa` dá o veredito

```
Você > @qa

@qa > Exercitando cada CAP/AC na página real:
      CAP-01: hero completo sem scroll em 390px ✓ e 1440px ✓
      CAP-02: FAQ com 3 itens, abre/fecha, um por objeção ✓
      CAP-03: CTA no hero e no rodapé, ambos → /signup ✓
      CAP-04: paleta e tipografia conferem com identity.md — verificando...
      CAP-05: dark mode — verificando...

@qa > CAP-04 FAIL: o CTA band usa #2563EB, e identity.md declara #1B4D3E.
      Repassando para @dev (correção 1/1)...
@dev > Token corrigido; a cor vinha hardcoded no CTABand.
@qa > Re-verificando... 5/5 CAPs passando.
@qa > Veredito PASS em qa-report-landing-principal.md.
      Rode `aioson feature:close` quando quiser fechar.
```

---

## Passo 9 (opcional) — Commitar com `@committer`

```
Você > @committer

@committer > Diff lido. Mensagem proposta:
             feat(landing): implement ContaFácil landing from approved prototype

             - 8 sections built against the approved prototype and identity.md
             - Copy from @copywriter targeting restaurantes/lojas audience
             - Responsive (390/768/1440) with dark mode

             [✓] Aceitar
Você > [Enter]
@committer > Commitado.
```

---

## O que ficou em disco (rastreio)

```
plans/landing-principal/                      ← fontes cruas e imagens de referência
.aioson/context/
├── project.context.md                        ← SMALL, site, identidade por referência
├── identity.md                               ← identidade extraída das suas imagens
├── copy-landing-principal.md                 ← copy de conversão (@copywriter)
├── dev-state.md                              ← o que foi implementado, status
├── qa-report-landing-principal.md            ← 5/5 CAPs, 1 fix aplicado
└── features/
    └── landing-principal/
        ├── briefing.md                       ← promessas PROM-1..4 e fontes
        ├── prototype.html                    ← protótipo APROVADO por você
        ├── refinement-report.md              ← as 2 rodadas de feedback
        ├── prd-landing-principal.md          ← PRD selado pelo @sheldon
        └── implementation-plan-landing-principal.md
```

---

## Variações

| Situação | Ajuste |
|---|---|
| Não quer usar Next.js | Diga no `@setup`. O `@dev` se adapta a Astro, HTML puro, Vue, etc. |
| Não tem imagens de referência | Escolha um preset no wizard. O protótipo continua sendo obrigatório. |
| Quer clonar o estilo de um site que admira | `@site-forge` antes do `@briefing` — o skill extraído vira insumo do protótipo. Ver [clonar design de site](./clonar-design-de-site.md). |
| Quer combinar dois estilos visuais | `@design-hybrid-forge` cria um skill híbrido antes do protótipo. |
| Já tem o copy pronto | Pule o `@copywriter` e passe o texto direto no `@briefing`. |
| A ideia já está 100% clara e sem tela nova | Aí não é esta receita: vá direto ao `@product`. Mas landing quase sempre tem tela nova. |
| Precisa de formulário de captura de email | Declare no `@briefing` como promessa. Ele entra no protótipo e vira CAP no PRD. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| O `@dev` implementou diferente do protótipo | Confira `prototype_status: current` no PRD. Se estiver vazio ou `stale`, o vínculo se perdeu — rode o `@refiner` para reaprovar. |
| A página saiu com cara de template | Provavelmente rodou sem identidade. Confira se `identity.md` existe e está vinculado no PRD; se não, rode a extração a partir das suas imagens de referência. |
| Copy gerado está genérico | Abra `copy-landing-principal.md` e adicione dados reais (preços, nome do fundador). Reative o `@copywriter` pedindo "refine a seção Hero com esses dados". |
| Sobrou uma dúvida de interação que o protótipo não resolveu | É decisão de produto: leve ao `@product` para registrar no PRD (a direção visual continua no `@refiner`/protótipo). |
| `next build` com erros de tipo TS | Rode `@dev` — ele lê `dev-state.md` e resolve o erro como correção pequena. |

---

## Próximo passo

- Quer entender melhor a fase do protótipo? → [Da ideia ao PRD via briefing](./da-ideia-ao-prd-via-briefing.md)
- Quer testar variantes visuais antes de decidir? → [Exploração visual e arena entre modelos](./arena-de-exploracao-visual.md)
- Quer clonar o design de um concorrente? → [Clonar design de site](./clonar-design-de-site.md)
- Quer publicar a landing no aioson.com? → [Publicar no aioson.com](./publicar-no-aioson-com.md)
