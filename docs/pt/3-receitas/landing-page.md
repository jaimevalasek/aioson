# Receita: Landing page do zero

> **Para quem é:** desenvolvedor solo ou designer que precisa de uma landing page convincente sem gastar horas escrevendo copy e definindo componentes.
> **Tempo de execução:** 45–90 min.
> **O que você vai ter no fim:** landing page com copy de conversão, sistema visual aplicado, componentes especificados, código funcional e testes básicos — tudo rastreável em artefatos.

---

## Cenário

Você tem um produto ou serviço novo e precisa de uma página de apresentação. O desafio clássico: ou você escreve copy genérico ("Bem-vindo ao nosso produto"), ou gasta horas tentando encontrar as palavras certas. E quando chega no código, o visual fica inconsistente — um botão com uma cor, o header com outra.

Com AIOSON, `@product` define o que comunicar, `@copywriter` e `@ux-ui` podem enriquecer o PRD sob pedido explícito, `@planner` transforma o resultado num plano vertical e `@dev` implementa. `@qa` fecha com um veredito proporcional. O resultado é uma página com narrativa e visual coerentes.

Este é um projeto **SMALL** (1 tipo de usuário, 0 integrações externas, sem regras de negócio complexas — mas o design justifica o `@ux-ui`).

> **Como o framework garante a ordem certa:** quando `project_type=site`, o `@product` recomenda `@copywriter` no handoff, e o `@ux-ui` tem um copy gate que **bloqueia** se `copy-{slug}.md` não existir. Você pode também iniciar pelo `@neo` — ele detecta `needs_copy` e roteia automaticamente. Em qualquer caminho, é impossível chegar no visual sem o copy pronto.

---

## Pré-requisitos

- Node.js 18+ instalado
- Claude Code (ou Codex/OpenCode)
- AIOSON instalado no projeto (`npx @jaimevalasek/aioson init minha-landing`)
- Opcional: uma URL de referência para estilo visual (qualquer site público que você admire)

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
? Design system? › Clean SaaS UI
? Idioma dos agentes? › pt-BR
```

> **Nota sobre design system:** se você prefere algo mais editorial, escolha Bold Editorial UI. Para apps dark e técnicos, Aurora Command UI. Pode trocar depois invocando `@ux-ui`. Veja a lista completa em [Decisões iniciais](../2-comecar/decisoes-iniciais.md).

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

@setup > Score: 0+0+0 = 0 → MICRO, mas site com design system → recomendo SMALL para @ux-ui.
Você > Sim, SMALL.

@setup > Classificação: SMALL. Design skill registrado: clean-saas-ui.
         project.context.md criado. Próximo: @product.
```

---

## Passo 2 — `@product` define o que comunicar

```
Você > @product

@product > Vamos definir o produto desta landing page.
           Nome do produto?
Você > ContaFácil — software de controle financeiro para pequenos negócios

@product > Em uma frase, qual problema o ContaFácil resolve?
Você > Pequenos empresários perdem dinheiro por não saber onde gastam. ContaFácil mostra.

@product > Público-alvo principal?
Você > Donos de restaurantes e pequenas lojas de 1–5 funcionários. Maioria sem formação financeira.

@product > Qual a única ação que o visitante deve tomar nesta página?
Você > Clicar em "Comece grátis" e criar uma conta

@product > Quais objeções típicas o público tem?
Você > "É complicado de usar", "Não tenho tempo pra aprender", "Funciona com meu tipo de negócio?"

@product > Algum diferencial competitivo claro?
Você > Dashboard em 5 minutos, importação automática do extrato bancário, sem planilhas.

@product > Spec da landing gravada em .aioson/context/features/landing-principal/spec.md.
           project_type=site detectado → próximo: @copywriter.
           (Site converte por copy. O layout do @ux-ui só desbloqueia depois que copy-{slug}.md existir.)
```

> **Dica:** copy antes do layout é a ordem certa. O texto define o espaço que o visual vai preencher — não o contrário. O framework força isso: o `@ux-ui` tem um copy gate que para a sessão se nenhum `copy-*.md` existir em `.aioson/context/`.

---

## Passo 3 — `@copywriter` escreve o copy de conversão

```
Você > @copywriter

@copywriter > Lendo spec da landing-principal...
              Público: donos de restaurantes/lojas, sem formação financeira.
              Objeções: complexidade, tempo, adequação.
              CTA: "Comece grátis".

@copywriter > Gerando copy com framework Problem → Agitate → Solution + prova social...

@copywriter > Copy gerado e salvo em .aioson/context/copy-landing-principal.md.
              Resumo das seções:

              HERO:
              Headline: "Saiba para onde vai cada real do seu negócio — em 5 minutos"
              Subheadline: "ContaFácil conecta com seu banco e mostra o quadro real,
                           sem planilhas, sem contador."
              CTA: "Comece grátis — sem cartão"

              PROBLEMA:
              "Todo mês você fecha o caixa sem entender por que sobrou tão pouco..."

              SOLUÇÃO + PROVA:
              3 bullets com diferenciais + depoimento fictício de Maria, dona de restaurante.

              FAQ: 3 perguntas cobrindo as objeções mapeadas.
              CTA final repetido.

@copywriter > Próximo: @ux-ui para especificar o layout onde este copy vai encaixar.
```

---

## Passo 4 — `@ux-ui` especifica o sistema visual e layout

```
Você > @ux-ui

@ux-ui > Lendo spec + copy da landing-principal. Design skill: clean-saas-ui.
          Vou especificar seções, componentes e tokens.

@ux-ui > Estrutura da página:
          1. NavBar — logo + link âncoras + CTA ghost
          2. Hero — headline H1 + sub + CTA primário + screenshot/mockup
          3. Problema — 1 parágrafo + ícone ilustrativo
          4. Funcionalidades — 3 cards feature com ícone, título e descrição
          5. Prova social — 1 depoimento com foto avatar + estrelas
          6. FAQ accordion — 3 perguntas
          7. CTA final — fundo colorido + headline + botão grande
          8. Footer — links legais

@ux-ui > Tokens Clean SaaS UI aplicados:
          Cor primária: #2563EB (azul)
          Cor neutra: #F9FAFB (fundo), #111827 (texto)
          Tipografia: Inter, 16px base, H1 48px/56px
          Raio: 8px, Sombra: shadow-md

@ux-ui > Especificação gravada em .aioson/context/design-doc-landing-principal.md.
          Próximo: @dev para implementar.
```

---

## Passo 5 — `@dev` implementa

```
Você > @dev

@dev > [lê spec, copy, design-doc, project.context]
       Stack: Next.js + Tailwind. Vou criar:

       app/page.tsx             — página principal
       components/NavBar.tsx
       components/Hero.tsx
       components/Features.tsx
       components/Testimonial.tsx
       components/FAQ.tsx
       components/CTABand.tsx
       components/Footer.tsx

@dev > [implementa componentes com copy do arquivo]
       Smoke test: next build → sem erros de TS/lint.
       Servidor: next dev → abrindo localhost:3000 ✓

@dev > dev-state.md atualizado. Próximo: @qa.
```

---

## Passo 6 — `@qa` valida

```
Você > @qa

@qa > ACs da spec:
      AC-01: todas as 8 seções renderizam sem erro ✓
      AC-02: CTA "Comece grátis" aparece em hero e CTA band ✓
      AC-03: FAQ abre/fecha ao clicar (accordion) — verificando...
      AC-04: responsivo em 375px, 768px, 1280px — verificando...

@qa > AC-03 OK. AC-04: quebra no mobile (Hero — texto ultrapassa viewport).
      Ciclo autônomo QA→Dev (iteração 1/2):
      Repassando para @dev...
@dev > Corrigindo Hero: max-w-full + text-3xl no mobile.
@qa > Re-rodando... 4/4 ACs passando. Relatório salvo.
```

---

## Passo 7 (opcional) — Commitar com `@committer`

```
Você > @committer

@committer > Diff lido. Mensagem proposta:
             feat(landing): implement ContaFácil landing page with Clean SaaS UI

             - 8 sections: NavBar, Hero, Features, Testimonial, FAQ, CTABand, Footer
             - Copy from @copywriter targeting restaurantes/lojas audience
             - Mobile-responsive (375/768/1280px)

             [✓] Aceitar
Você > [Enter]
@committer > Commitado.
```

---

## O que ficou em disco (rastreio)

```
.aioson/context/
├── project.context.md                    ← classificação SMALL, site, clean-saas-ui
├── features/
│   └── landing-principal/
│       └── spec.md                       ← o que comunicar, ACs, fora-de-escopo
├── copy-landing-principal.md             ← copy de conversão completo (@copywriter)
├── design-doc-landing-principal.md       ← seções, tokens, componentes (@ux-ui)
├── dev-state.md                          ← o que foi implementado, status
└── qa-report-test-coverage.md            ← 4/4 ACs, 1 fix aplicado
```

---

## Variações

| Situação | Ajuste |
|---|---|
| Não quer usar Next.js | Diga no `@setup`. O `@dev` se adapta a Astro, HTML puro, Vue, etc. |
| Quer clonar o estilo de um site que admira | Use `@site-forge` antes do `@ux-ui`. Veja a [receita de clone de design](./clonar-design-de-site.md). |
| Quer combinar dois estilos visuais | `@design-hybrid-forge` cria um skill híbrido. |
| Não precisa de copy elaborado | Pule o `@copywriter`. Passe o copy diretamente para `@ux-ui`. |
| Precisa de formulário de captura de email | Declare no `@product` como AC. O `@dev` incluirá. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `@ux-ui` ignorou o design skill escolhido | Confira `design_skill: clean-saas-ui` em `project.context.md`. Se vazio, edite e reative `@ux-ui`. |
| Copy gerado está genérico | Abra `copy-landing-principal.md` e adicione dados reais (preços, nome do fundador). Reative `@copywriter` com "refine a seção Hero com esses dados". |
| `next build` com erros de tipo TS | Rode `@deyvin` — ele lê `dev-state.md` e resolve o erro em pair. |

---

## Próximo passo

- Quer clonar o design de um concorrente? → [Clonar design de site](./clonar-design-de-site.md)
- Quer publicar a landing no aioson.com? → [Publicar no aioson.com](./publicar-no-aioson-com.md)
- Precisa de copy mais profundo? Consulte `copy-landing-principal.md` e peça ao `@copywriter` seções específicas.
