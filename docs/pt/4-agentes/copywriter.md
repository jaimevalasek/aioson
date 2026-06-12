# @copywriter — Escrever copy de conversão para páginas e campanhas

> **Para quem é:** quem precisa de copy que converta — landing pages, sales letters, VSLs, anúncios pagos, emails — sem escrever linha a linha.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:**
> - Quais tipos de copy o agente entrega e em que formato
> - Como ele usa contexto do projeto para personalizar tom e voz
> - Como escolher entre diferentes "mestres" copywriters (Brunson, Georgi, Diogo Gomes)
> - Quais estruturas narrativas estão disponíveis (5-Act, Tríade, KSTK, CPGC ads)

---

## Para que serve

Copy genérico não converte. O `@copywriter` não é um formatador de texto — é um estrategista de conversão que lê o contexto do projeto, pesquisa a audiência real, aplica frameworks de persuasão provados, e escreve copy que faz o leitor se sentir entendido, elimina objeções, e direciona para uma ação clara.

Ele escreve no idioma da audiência — se o projeto é PT-BR, o copy sai em PT-BR sem precisar pedir.

A grande diferença em relação a um "prompt de copy genérico" é que ele tem **mentes selecionáveis** (genomes), **estruturas selecionáveis**, e **vozes selecionáveis** — você compõe o tipo de copywriter que melhor serve seu projeto.

---

## Quando invocar

- Você precisa de copy para landing page, página de vendas, email ou campanha
- O `@ux-ui` detectou que o projeto `project_type=site` e o copy ainda está faltando (copy gate dispara automático)
- Você precisa de VSL (Video Sales Letter) — Mode 5
- Você precisa de anúncios para Facebook/Instagram (CPGC)
- Um executor de squad precisa de copy especializado num domínio
- Você quer revisar copy existente com critério técnico — Mode 3

---

## Quando NÃO invocar

- Você precisa de documentação técnica — use `@dev` ou o próprio agente de domínio
- Você quer microcopy de UI (labels, tooltips, error messages) — o `@ux-ui` cobre isso dentro do design system
- Você quer pesquisa de mercado profunda sem copy — use `@orache`

---

## Os 5 modos

| Modo | Quando usar | Output |
|------|-------------|--------|
| **1. Full page** | Escrever todas as seções de uma página do zero | `copy-{slug}.md` completo |
| **2. Section** | Apenas hero, benefits, FAQ, CTA, ou outra seção específica | append em `copy-{slug}.md` |
| **3. Review & rewrite** | Você tem copy existente e quer análise + reescrita | `copy-review-{slug}.md` |
| **4. Squad executor** | Atuando como executor dentro de um squad, segue o genome do squad | conforme manifest do squad |
| **5. VSL Script** | Roteiro completo de Video Sales Letter | `vsl-script-{slug}.md` |

---

## Selecionar a mente do copywriter (genomes)

> **Menu via INDEX (v1.29.0):** a descoberta de genomes agora lê o `.aioson/genomes/INDEX.md` — o registro de **todos** os genomes instalados (mestres, personas, domínio, brand-voice), com guias de seleção por audiência e por tipo de output. O menu aparece quando você pergunta "quais genomes tenho", na ativação seca, ou quando mais de um genome serve para a peça. Vale para qualquer entrega: páginas de marketing, conteúdo, copy de site e **microcopy de sistema** (botões, empty states, onboarding, mensagens de erro). Quando o genome escolhido tem seções operacionais (geradas pelo pipeline de persona — `## Operating Procedure`, `## Prohibitions`, `## Style Metrics`, `## Delivery Checklist`), elas são **vinculantes** para a peça: o procedimento dirige o fluxo, as proibições viram hard constraints e o checklist roda na validação final.

Quando há múltiplos genomes de mestres instalados, o `@copywriter` pergunta qual perspectiva aplicar. **8 mestres disponíveis** organizados em 2 hemisférios:

### Mestres universais (US, em inglês — adaptam-se ao idioma do projeto)

| Genome | Filosofia | Melhor para |
|--------|-----------|-------------|
| **`copywriting-schwartz`** | Foundational: 5 Awareness Levels + 5 Sophistication Stages + Mass Desire (channel, not create) | **Camada base** — combine com qualquer mestre aplicado para diagnóstico de awareness/sofisticação |
| **`copywriting-halbert`** | Direct mail school: Starving Crowd + A-Pile/B-Pile + Market First | Direct mail, long-form sales letters, audiências comprovadamente "famintas" |
| **`copywriting-kennedy`** | No B.S.: 10 Rules + Magnetic Marketing Triangle + premium positioning | Premium positioning, magnetic marketing systems, small business direct response |
| **`copywriting-brunson`** | Storytelling/funil + stack de valor + quebra de 3 crenças + comunidade | Cursos, infoprodutos, coaching, comunidades pagas, audiência aspiracional |
| **`copywriting-georgi`** | RMBC (Research → Mechanism → Brief → Copy) + big idea | VSLs, sales letters longas, health/wealth/weight loss |

### Mestres brasileiros (pt-BR, voz preservada com translations side-by-side)

| Genome | Escola BR | Filosofia | Melhor para |
|--------|-----------|-----------|-------------|
| **`copywriting-ladeira`** | Mainstream | VTSD + Light Copy 3 Cs + KSTK + Stories 10x + irreverente | BR mainstream, infoprodutos acessíveis, daily content, Instagram-first |
| **`copywriting-icaro-de-carvalho`** | Intelectual | Contraste + Vulnerabilidade Calculada + 20/80 storytelling + polarização autoral | BR intelectual/premium, content autoral, thought leadership polarizante |
| **`copywriting-diogo-gomes`** | Periferia | Validated recombination + mapa do tesouro + 4 lead variations + pragmatismo agressivo | BR periferia, VSLs agressivas, infoprodutos performance, renda extra |

### Como escolher entre os 3 BR

```
            Mainstream         Intelectual         Periferia
            (Ladeira)          (Ícaro)             (Diogo)
            ─────────          ──────────          ──────────
Audiência   B/C massivo        B+ premium          C/D/E asp.
Vocabulário acessível          articulado          quebrada
Tom         "vamos lá"         "transformando..."  "foda-se ser"
Estratégia  daily-system       contraste/polariz.  recombinação
```

Escolha pela **audience match**, não pela preferência pessoal — cada um cobre um segmento BR distinto.

### Regra de combinação

- **Schwartz + 1 mestre aplicado:** ✅ permitido (Schwartz é camada base)
- **2 mestres aplicados na mesma peça:** ❌ proibido (filosofias colidem — ex: Brunson aspiracional vs Georgi sóbrio; Ladeira mainstream vs Ícaro polarizante)
- **Diferentes mestres em diferentes peças do mesmo projeto:** ✅ permitido (com hierarquia explícita)

> Os 3 personas BR são **Genome 3.0 + Track 4.1** — incluem Decision Weights numéricos, Meta-Axiomas, e Perfil Cognitivo decomposto em Voice DNA / Thinking DNA / Identity Core. Os 5 mestres US são **Genome 2.0 + Track 4.1 partial** (Decision Weights metodológicos + Meta-Axioms, sem DNA split por não serem personas).

---

## Selecionar a estrutura narrativa

Cinco estruturas disponíveis. Pick **uma** por peça.

| Estrutura | Quando usar |
|-----------|-------------|
| **5-Act** (default) | Sales pages e landing pages tradicionais — Hero / Authority / Mechanism / Offer / Close |
| **Tríade Narrativa** | Storytelling profundo — Background (30%) / Emotional (40%) / Discovery (30%) |
| **KSTK Narrativo** | Short-form story-driven — Ken / Shu / Ten / Ketsu (4 atos compactos) |
| **KSTK Argumentativo** | Short-form lógico — premissas → conclusão inevitável |
| **CPGC** | Anúncios FB/IG — Copy + Persona + Gancho + Corpo + CTA |

**Compatibilidade estrutura × mestre:**

| Estrutura | Brunson | Georgi | Diogo Gomes |
|-----------|---------|--------|-------------|
| 5-Act | ✅ | ✅ | ✅ |
| Tríade | ✅ (storytelling forte) | parcial | ✅ |
| KSTK Narrativo | ✅ | parcial | ✅ |
| KSTK Argumentativo | parcial | ✅ (RMBC fit) | parcial |
| CPGC ads | ✅ | ✅ | ✅ |
| VSL (5-Act adaptado) | ✅ | ✅ (mestres VSL) | ✅ (mestres VSL) |

---

## Selecionar a voz (LightCopy styles, opcional)

Quando o projeto pede tom específico além do default, o `@copywriter` carrega `lightcopy-styles.md` com 4 vozes selecionáveis:

| Voz | Quando usar |
|-----|-------------|
| **Narrativo Surpreendente** | Audiência fria, scroll fácil — abre com história inesperada |
| **Autenticidade Estratégica** | Audiência cética de "experts" — vulnerabilidade calculada |
| **Observador Perspicaz** | Audiência experiente que se sente incompreendida |
| **Comandos Indiretos** | Audiência resistente a "tom de venda" — premissas → conclusão |

---

## Avatar gate (Phase 1.5)

Antes de escrever, o `@copywriter` verifica se o projeto tem **avatar profundo** definido:

- Se existe `.aioson/context/avatar-{slug}.md` ou avatar bem definido no PRD → carrega e segue
- Se avatar é shallow ou ausente → carrega `avatar-construction.md` e roda o framework multi-camada (Identity + Empathy Map 6 dimensões + Decision Triggers + Copy Application)

O avatar é gravado em `.aioson/context/avatar-{slug}.md` e reutilizável por outros squads (vendas, atendimento, suporte).

---

## Diálogo típico (Mode 1 — Full page)

```
Você > @copywriter landing page do meu app de finanças pessoais para millennials BR

@copywriter > Lendo project.context.md... projeto "finwise", project_type=site, pt-BR.
              Genomes detectados: copywriting-brunson, copywriting-georgi, copywriting-diogo-gomes.

@copywriter > Qual perspectiva você quer aplicar?
              1. Brunson (storytelling/funnel — cursos, comunidades)
              2. Georgi (RMBC/mechanism — VSLs, sales letters)
              3. Diogo Gomes (BR direct response — VSLs Brasil, infoprodutos)
              4. Baseline (sem mestre)

Você > 3 (Diogo Gomes — fala direto, audiência periferia/aspiração)

@copywriter > Carregando copywriting-diogo-gomes (Genome 3.0 + Track 4.1)...
              Avatar shallow detectado no PRD. Rodando avatar-construction.md...
              [coleta Identity + Empathy Map + Decision Triggers]
              Avatar gravado em .aioson/context/avatar-finwise.md.

@copywriter > Pesquisa PMS:
              Dores: dívida cartão, mês não fecha, vergonha de pedir ajuda
              Mitos: "preciso ganhar mais para sobrar dinheiro"
              Sonhos: respirar no fim do mês, viajar sem culpa, parar de esconder dívida

@copywriter > Escolha de estrutura:
              Recomendo 5-Act adaptado (sales page completa) ou Tríade Narrativa
              (founder story se você tem história). Qual?

Você > 5-Act

@copywriter > One Belief construído:
              "Sair das dívidas é o resultado de mapear cada centavo —
               não de ganhar mais — e isso é possível em 5 minutos por dia
               com o sistema do Finwise."

@copywriter > Escrevendo copy completa...
              Hero: "Você sabe que deveria guardar dinheiro. Mas o mês acaba antes do salário."
              [...]

@copywriter > Copy completo salvo em .aioson/context/copy-finwise.md.
              Próximo: @ux-ui para encaixar no layout.
```

---

## Saídas em disco

```
.aioson/context/
├── copy-{slug}.md              ← copy completo (Mode 1) ou seção (Mode 2)
├── copy-review-{slug}.md       ← revisão anotada (Mode 3)
├── vsl-script-{slug}.md        ← roteiro VSL (Mode 5)
├── avatar-{slug}.md            ← avatar gerado pelo avatar gate (se aplicado)
└── copy-multiplier-{slug}.md   ← 63 variações geradas via content-multiplier (opcional)

researchs/{slug}/
├── pms-map-{date}.md           ← mapeamento Problemas/Mitos/Sonhos
└── copy-intelligence-{date}.md ← inteligência competitiva
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — idioma, tipo de projeto, tom, design skill
- `.aioson/context/prd.md` ou `prd-{slug}.md` — proposta de valor e escopo
- `.aioson/context/avatar-{slug}.md` — avatar (se já existir)
- Cache de pesquisas em `researchs/{slug}/` — se existir e <7 dias, reutiliza
- Genomes em `.aioson/genomes/copywriting-*.md` — mestres disponíveis

---

## Skills/references carregados sob demanda

O `@copywriter` carrega references somente quando precisa, para economizar contexto:

**Foundational (sempre):** `copywriting.md` (genome geral)

**Phase 1 (research):**
- `avatar-construction.md` — quando avatar é shallow
- `pms-research.md` — mapeamento de dores/mitos/sonhos
- `market-intelligence.md` — escaneamento competitivo

**Phase 4 (estratégia + escrita):**
- `one-belief.md` — construção da crença central
- `five-acts.md` — estrutura padrão
- `triade-narrativa.md` — alternativa storytelling
- `kstk-structure.md` — alternativa short-form
- `ads-cpgc.md` — anúncios FB/IG
- `patterns.md` + `anti-patterns.md` — fórmulas e validação
- `offer-structure.md` + `fascinations.md` — construção de oferta
- `lightcopy-styles.md` — seleção de voz

**Multipliers:**
- `vsl-craft.md` — Mode 5 VSL
- `content-multiplier.md` — gerar 63 variações para teste/calendário

---

## Handoff típico

- **Vem de:** `@ux-ui` (copy gate automático para `project_type=site`), `@product` (handoff para `project_type=site`), ou pedido direto
- **Vai para:** `@ux-ui` (encaixar no layout) → `@dev` (implementar no frontend) → `@qa` (validar)

---

## Reuso além do `@copywriter`

Os genomes e skills criados para o copywriter são reutilizáveis por outros agentes/squads:

| Skill / Genome | Reuso |
|----------------|-------|
| `avatar-construction.md` | Squad vendas/atendimento/suporte, `@orache`, `@product` (PRD) |
| `triade-narrativa.md` | Squad sales executors |
| `copywriting-brunson/georgi/diogo-gomes` | Squad executors de vendas, marketing, performance |
| `content-multiplier.md` | Squad content/marketing |
| `ads-cpgc.md` | Squad performance-marketing |

Para bind um genome em um squad existente, use `@genome` com Option 4 (Apply to existing squad/agent).

---

## Próximo passo

- Para montar um squad com executor de copywriter aplicando um genome de mestre: `@squad`
- Para enriquecer um dos 8 genomes existentes via profiler (subir fidelity de 0.65 para 0.85+): pipeline `@profiler-researcher` → `@profiler-enricher` → `@profiler-forge`
- Para gerar genome de outro copywriter ainda não na biblioteca (ex: Erico Rocha, Pedro Sobral, Eugene Schwartz já existe): `@genome` ou pipeline profiler completo
- Para clonar visualmente o estilo de outra landing: `@site-forge` ou `@design-hybrid-forge`
- Para descobrir o que mais existe: ficha [neo.md](./neo.md) ou [agentes.md](../agentes.md)
