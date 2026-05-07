# [Arquivado] Agentes Customizados

> **Esta doc foi substituída.**
> Conteúdo migrado para a ficha do `@squad` em [`../4-agentes/squad.md`](../4-agentes/squad.md), que cobre `squad:agent-create`, domínio, Voice DNA e scoring.
> Conteúdo abaixo preservado para referência histórica.

---

# Agentes Customizados

> Guia prático para criar, organizar e usar agentes personalizados no AIOSON com `squad:agent-create`.

---

## Visão rápida

O AIOSON tem dois níveis de agentes:

- **Agentes oficiais** — vivem em `.aioson/agents/`. São gerenciados pelo framework e atualizados com `aioson update`. Você não edita esses.
- **Agentes customizados** — criados por você para resolver problemas específicos do projeto ou da squad. Esses são seus.

Agentes customizados podem morar em dois lugares:

| Local | Quando usar | Versionado no git? |
|-------|-------------|---------------------|
| `.aioson/my-agents/` | Agentes de uso geral no projeto inteiro | Sim |
| `.aioson/squads/{slug}/agents/` | Agentes focados no domínio de uma squad | Sim |

---

## O comando

```bash
aioson squad:agent-create [path] --name=<nome> [opções]
```

### Opções principais

| Opção | Valor | Padrão | O que faz |
|-------|-------|--------|-----------|
| `--name` | texto | obrigatório | Nome do agente (vira slug automático) |
| `--scope` | `my-agents` ou `squad` | inferido | Onde salvar |
| `--squad` | slug da squad | — | Qual squad (implica `--scope=squad`) |
| `--type` | `agent`, `assistant`, `clone`, `worker` | `agent` | Tipo do executor |
| `--tier` | `0`, `1`, `2`, `3` | — | Classificação de complexidade |
| `--disc` | perfil DISC | — | Perfil comportamental |
| `--mission` | texto | — | Missão do agente |
| `--domain` | texto | — | Domínio de atuação |
| `--specialist` | nome | — | Especialista humano que inspira o agente |
| `--focus` | lista separada por vírgula | — | Áreas de foco |
| `--with-infra` | flag | `false` | Gera stubs de task, template e checklist |
| `--dry-run` | flag | `false` | Mostra o que seria gerado sem criar |

---

## Tipos de agente

Cada tipo gera um template diferente:

### `agent` — o padrão

Agente genérico com julgamento próprio. Recebe contexto, analisa e decide como agir.

Melhor para: revisão de código, análise de dados, scoping de features, automação de processos.

```bash
aioson squad:agent-create --name="code-reviewer" --type=agent \
  --mission="Revisar PRs focando em segurança, performance e legibilidade"
```

### `assistant` — especialista com voz própria

Agente que responde como um especialista de domínio. Tem seção de Voice DNA completa com vocabulário, metáforas e estados emocionais.

Melhor para: consultoria técnica, mentoria, brainstorming com perspectiva especializada.

```bash
aioson squad:agent-create --name="startup-advisor" --type=assistant \
  --squad=advisory-board \
  --mission="Aconselhar sobre estratégia de produto e go-to-market para SaaS" \
  --domain="product strategy" \
  --disc=dominant-influential
```

O template gerado inclui Voice DNA:

```markdown
## Voice DNA

### Sentence starters
- **Explaining:** "[...]", "[...]"
- **Challenging:** "[...]", "[...]"
- **Recommending:** "[...]", "[...]"

### Vocabulary
**Always use:** [8+ termos que o agente prefere]
**Never use:** [5+ termos que o agente evita]

### Metaphors
[5+ metáforas do domínio]

### Emotional states
- **Teaching:** paciente, detalhado, com exemplos
- **Reviewing:** direto, preciso, sem filler
- **Brainstorming:** energético, expansivo, provocativo
```

### `clone` — reprodução de um especialista real

Semelhante ao `assistant`, mas baseado em uma pessoa real cujo estilo e metodologia são conhecidos. Inclui Voice DNA + seção de Specialist.

Melhor para: reproduzir a forma de pensar e escrever de um autor, consultor ou criador específico.

```bash
aioson squad:agent-create --name="gary-halbert" --type=clone \
  --squad=copy-factory \
  --specialist="Gary Halbert" \
  --domain=copywriting \
  --disc=dominant-driver \
  --mission="Escrever sales pages usando a metodologia de direct-response do Gary Halbert" \
  --with-infra
```

O template gerado inclui:

```markdown
## Specialist
Based on: **Gary Halbert**
[Adicionar material fonte: livros, artigos, talks, metodologias]

## Voice DNA
[Seção completa para mapear a voz do especialista]
```

> **Nota:** Clones devem ser enriquecidos com material real do especialista. Um clone sem pesquisa é apenas um agente genérico com nome bonito.

### `worker` — execução determinística

Agente sem criatividade. Recebe instrução e executa exatamente, sem interpretar ou improvisar.

Melhor para: formatação de documentos, conversão de dados, execução de checklists, processos repetitivos.

```bash
aioson squad:agent-create --name="csv-formatter" --type=worker \
  --squad=data-pipeline \
  --mission="Converter relatórios CSV para o formato padronizado do dashboard"
```

O template de worker inclui:

```markdown
## Response standard
Execute the task deterministically. No creative deviation. Follow the process exactly.
```

---

## Tiers: classificando a complexidade do agente

O tier indica o nível de responsabilidade e autonomia do agente:

| Tier | Nome | Quando usar |
|------|------|-------------|
| 0 | Foundation | Agente que roda antes de outros (diagnóstico, análise prévia) |
| 1 | Master | Especialista principal com histórico comprovado |
| 2 | Systematizer | Criou frameworks que outros usam |
| 3 | Specialist | Foco em formato ou canal específico |

```bash
aioson squad:agent-create --name="retention-analyst" --type=agent \
  --tier=0 --squad=youtube-creator \
  --mission="Analisar métricas de retenção antes de qualquer decisão de roteiro"
```

O tier aparece no identity tag do agente:

```markdown
<!-- identity: squad:youtube-creator/retention-analyst | type: agent | tier: 0 -->
```

---

## Perfis DISC

O DISC define como o agente se comporta em interação:

| Perfil | Estilo |
|--------|--------|
| `dominant-driver` | Direto, decisivo, orientado a resultado |
| `influential-expressive` | Expansivo, persuasivo, entusiasmado |
| `steady-amiable` | Paciente, colaborativo, detalhista |
| `compliant-analytical` | Preciso, metódico, baseado em dados |
| `dominant-influential` | Líder carismático, rápido e envolvente |
| `influential-steady` | Comunicador paciente, bom em onboarding |
| `steady-compliant` | Revisor meticuloso, confiável |
| `compliant-dominant` | Analista que decide rápido com base em fatos |

---

## Infraestrutura operacional (`--with-infra`)

Quando você usa `--with-infra` em agentes de squad, o comando gera 3 arquivos adicionais:

```
.aioson/squads/{squad-slug}/
  tasks/{slug}-main-workflow.md      ← processo passo a passo
  templates/{slug}-output-tmpl.md    ← formato do entregável
  checklists/{slug}-quality-gate.md  ← critérios de aprovação
```

### Task (workflow)

Define o processo determinístico do agente:

```markdown
# Task: seo-copywriter main workflow

## Steps

### Step 1: Understand context
**Action:** Read inputs and identify constraints

### Step 2: Execute
**Action:** [The core work]

### Step 3: Validate
**Action:** Run against completion criteria

## Veto conditions
- [ ] [Condição que bloqueia] → STOP and report
```

### Template (output)

Define o formato esperado do entregável:

```markdown
# Template: seo-copywriter output

## {Title}
**Date:** {date}

### Summary
{1-3 sentence executive summary}

### Content
{Main structured output}

### Recommendations
{Actionable next steps}
```

### Checklist (quality gate)

Define os critérios de qualidade com veto:

```markdown
# Quality gate: @seo-copywriter

## Blocking (all must pass)
- [ ] Output follows the defined template structure
- [ ] No invented facts
- [ ] Completion criteria satisfied

## Recommended (80%+ should pass)
- [ ] Output is concise
- [ ] Domain-specific vocabulary used correctly
- [ ] Hand-off context is clear

## Approval
- 100% blocking + 80% recommended = **PASS**
- Any blocking failure = **VETO**
```

> **Por que isso importa:** Um agente sem infraestrutura operacional é uma persona sem processo. Ele sabe quem é, mas não sabe como fazer nada de forma determinística. Se o executor consegue improvisar, vai improvisar — e cada execução será diferente.

---

## Maturity scoring

Após criar o agente, o comando calcula automaticamente o nível de maturidade:

```
Maturity: Level 2 — Functional (needs enrichment) (5.5/10)
Add real output examples and domain-specific anti-patterns to reach Level 3.
```

### Níveis

| Nível | Score | Significado |
|-------|-------|-------------|
| 1 | 0–3.9 | Persona only (scaffold) — precisa de tudo |
| 2 | 4–6.9 | Funcional — precisa de exemplos e anti-patterns reais |
| 3 | 7–8.9 | Operacional (determinístico) — pronto para uso |
| 3+ | 9–10 | Production-ready — completo com infraestrutura |

### O que aumenta o score

| Dimensão | Peso | Como completar |
|----------|------|----------------|
| Identity (missão preenchida) | 1.0 | Escrever missão concreta, não placeholder |
| Core principles | 1.0 | 5-10 princípios reais do domínio |
| Operational framework | 1.0 | Metodologia passo a passo |
| Voice DNA | 1.5 | Vocabulário, metáforas, sentence starters (assistant/clone) |
| Output examples | 1.5 | 3+ exemplos reais de input → output |
| Anti-patterns | 1.0 | Never do + always do com itens específicos |
| Completion criteria | 0.5 | Critérios mensuráveis, não subjetivos |
| Hand-off | 0.5 | Tabela de hand-off preenchida |
| Infrastructure | 1.5 | Task + template + checklist via `--with-infra` |

---

## Anatomia do agente gerado

O template segue 6 níveis inspirados na estrutura AIOX:

### Nível 1 — Identity

Quem é o agente.

```markdown
## Mission
Escrever sales pages usando a metodologia de direct-response do Gary Halbert

## Quick context
Squad: Copy Factory | Agent: @gary-halbert | Type: clone
Domain: copywriting

## Specialist
Based on: **Gary Halbert**

## Behavioral profile
DISC: dominant-driver
```

### Nível 2 — Operational

Como o agente trabalha.

```markdown
## Core principles
[5-10 crenças fundamentais]

## Focus
- Sales pages de conversão
- Headlines que capturam atenção
- CTAs que geram urgência real

## Operational framework
1. **Understand** — Ler contexto, inputs e constraints
2. **Analyze** — Identificar o que é necessário
3. **Execute** — Produzir seguindo a metodologia
4. **Validate** — Checar contra critérios de qualidade
```

### Nível 3 — Voice DNA (assistant/clone)

Como o agente se comunica.

```markdown
## Voice DNA

### Sentence starters
- **Explaining:** "Look, here's the deal...", "The secret is..."
- **Challenging:** "You think that works? Let me tell you why..."
- **Recommending:** "Here's what I'd do if I were you..."

### Vocabulary
**Always use:** prospect, offer, headline, lead, hook, proof, close, guarantee
**Never use:** synergy, leverage, paradigm, optimize, ecosystem

### Metaphors
- "Your headline is the ad for the ad"
- "Copy is salesmanship in print"
- "The envelope is the bouncer at the door"
```

### Nível 4 — Quality

Como saber que o trabalho está bom.

```markdown
## Output examples

### Example 1
**Input:** Landing page para curso de inglês online, público 25-40, preço R$497
**Output:** [Sales page completa com headline, lead, body, proof, CTA, guarantee]

## Anti-patterns

**Never do:**
- Usar jargão corporativo em vez de linguagem de rua
- Abrir com a feature em vez do benefício
- Pular a prova social
- Escrever CTA genérico como "Saiba mais"
- Usar parágrafos longos no above-the-fold

**Always do:**
- Abrir com headline que gera curiosidade ou urgência
- Incluir pelo menos 3 elementos de prova
- Fechar com garantia antes do CTA
- Usar frases curtas e diretas no lead
- Testar o CTA como se fosse um headline separado
```

### Nível 5 — Integration

Para onde o trabalho vai depois.

```markdown
## Output contract

| Artifact | Location | Format |
|----------|----------|--------|
| Sales page | .aioson/squads/copy-factory/output/ | Markdown |
| Headline variants | .aioson/squads/copy-factory/output/ | Markdown list |

## Hand-off

| Condition | Next agent | Context to pass |
|-----------|------------|-----------------|
| Sales page completa | @editor-chefe | Revisar tom e CTA |
| Precisa de prova social | @pesquisador | Coletar depoimentos |
```

### Nível 0 — Infrastructure (com `--with-infra`)

Referências para arquivos operacionais.

```markdown
## Dependencies

```yaml
skills: []
tasks:
  - .aioson/squads/copy-factory/tasks/gary-halbert-main-workflow.md
templates:
  - .aioson/squads/copy-factory/templates/gary-halbert-output-tmpl.md
checklists:
  - .aioson/squads/copy-factory/checklists/gary-halbert-quality-gate.md
```
```

---

## Exemplos práticos completos

### 1. Revisor de código para o projeto

Cenário: você quer um agente que revise PRs em qualquer sessão do projeto.

```bash
aioson squad:agent-create \
  --name="code-reviewer" \
  --type=agent \
  --mission="Revisar código focando em segurança OWASP, performance e legibilidade" \
  --focus="segurança,performance,legibilidade,testes"
```

Resultado:

```
Agent created: .aioson/my-agents/code-reviewer.md
Scope: my-agents (versioned, available globally)
Slug: @code-reviewer
```

Depois, em qualquer sessão:

```
@code-reviewer
Revise o PR #42 — mudanças no módulo de pagamento.
```

### 2. Squad de conteúdo com agentes especializados

Cenário: squad de YouTube com roteirista, analista e copywriter.

```bash
# Primeiro, criar a squad (via @squad na sessão ou CLI)

# Depois, criar agentes especializados
aioson squad:agent-create \
  --name="roteirista-viral" \
  --type=clone \
  --squad=youtube-creator \
  --specialist="MrBeast" \
  --domain="YouTube scripts" \
  --disc=influential-expressive \
  --mission="Criar roteiros de vídeo com hooks fortes e retenção alta" \
  --with-infra

aioson squad:agent-create \
  --name="analista-retencao" \
  --type=agent \
  --tier=0 \
  --squad=youtube-creator \
  --domain="YouTube analytics" \
  --disc=compliant-analytical \
  --mission="Analisar métricas de retenção e recomendar ajustes no roteiro"

aioson squad:agent-create \
  --name="copywriter-thumbnail" \
  --type=assistant \
  --squad=youtube-creator \
  --domain="thumbnail copywriting" \
  --disc=dominant-driver \
  --mission="Criar textos de thumbnail com CTR alto usando tensão visual e curiosidade"
```

Estrutura gerada:

```
.aioson/squads/youtube-creator/
  agents/
    roteirista-viral.md         ← clone com Voice DNA + infra
    analista-retencao.md        ← agent tier 0 (roda primeiro)
    copywriter-thumbnail.md     ← assistant com Voice DNA
  tasks/
    roteirista-viral-main-workflow.md
  templates/
    roteirista-viral-output-tmpl.md
  checklists/
    roteirista-viral-quality-gate.md
```

### 3. Agente consultor baseado em especialista

Cenário: você quer um consultor de copy baseado no Gary Halbert.

```bash
aioson squad:agent-create \
  --name="gary-halbert" \
  --type=clone \
  --squad=copy-factory \
  --specialist="Gary Halbert" \
  --domain=copywriting \
  --disc=dominant-driver \
  --mission="Escrever sales pages usando direct-response methodology" \
  --with-infra
```

Depois de criar, enriqueça o agente:

1. **Preencha a Voice DNA** com vocabulário real do Gary Halbert
2. **Adicione output examples** com sales pages reais como referência
3. **Complete os anti-patterns** com o que ele mesmo dizia para nunca fazer
4. **Defina completion criteria** mensuráveis (ex: "headline gera curiosidade", "tem pelo menos 3 provas")

### 4. Worker determinístico para pipeline de dados

Cenário: agente que formata relatórios sem criatividade.

```bash
aioson squad:agent-create \
  --name="report-formatter" \
  --type=worker \
  --squad=data-pipeline \
  --mission="Converter dados brutos do CSV para o formato padronizado do relatório semanal" \
  --with-infra
```

O worker não tem Voice DNA e inclui a regra:

```markdown
## Response standard
Execute the task deterministically. No creative deviation. Follow the process exactly.
```

### 5. Board de advisors para decisões estratégicas

Cenário: múltiplos consultores com perspectivas diferentes.

```bash
# Advisor de produto
aioson squad:agent-create \
  --name="product-advisor" \
  --type=assistant \
  --squad=advisory-board \
  --domain="product strategy" \
  --disc=dominant-influential \
  --mission="Aconselhar sobre priorização de features e product-market fit"

# Advisor técnico
aioson squad:agent-create \
  --name="tech-advisor" \
  --type=assistant \
  --squad=advisory-board \
  --domain="software architecture" \
  --disc=compliant-analytical \
  --mission="Avaliar viabilidade técnica e riscos de arquitetura"

# Advisor de growth
aioson squad:agent-create \
  --name="growth-advisor" \
  --type=assistant \
  --squad=advisory-board \
  --domain="growth marketing" \
  --disc=influential-expressive \
  --mission="Identificar alavancas de crescimento e estratégias de go-to-market"
```

Depois, use na sessão:

```
@product-advisor @tech-advisor @growth-advisor
Estamos considerando adicionar um plano gratuito. Analisem prós, contras e riscos.
```

---

## Receita para um agente Level 3

Um agente scaffold (Level 1) precisa de enriquecimento para chegar a Level 3. Aqui está o checklist:

1. **Missão concreta** — não genérica. "Revisar PRs focando em OWASP top 10" é melhor que "Revisar código".

2. **Core principles reais** — 5-10 crenças que guiam toda decisão. Extraia de livros, artigos ou experiência do domínio.

3. **Operational framework detalhado** — substitua os 4 passos genéricos por passos específicos do domínio. Um copywriter não trabalha igual a um code reviewer.

4. **3+ output examples reais** — mostrando input → output concreto. Não exemplos genéricos — exemplos que alguém copiaria.

5. **Anti-patterns específicos** — não "evitar erros". Anti-patterns como "nunca abrir com feature em vez de benefício" ou "nunca usar mock no teste de integração".

6. **Completion criteria mensuráveis** — "headline gera curiosidade" não serve. "Headline contém pelo menos um gatilho emocional e tem menos de 10 palavras" serve.

7. **Hand-off table preenchida** — para quem o trabalho vai quando termina, e com que contexto.

8. **Voice DNA preenchida** (assistant/clone) — vocabulário real, não placeholder. 8+ termos que o agente usa, 5+ que evita, metáforas específicas.

---

## Relação com o sistema existente

### Agentes customizados vs agentes oficiais

- Agentes oficiais (`@dev`, `@product`, `@analyst`, etc.) seguem o workflow do AIOSON
- Agentes customizados não participam do workflow oficial — são chamados diretamente
- Agentes de squad são coordenados pelo `@orquestrador` da própria squad

### Agentes customizados vs skills

- **Skill** = capacidade reutilizável (ex: "estruturar roteiro", "analisar hook")
- **Agente** = executor com identidade, processo e julgamento (ex: "@roteirista-viral")
- Use skill quando o conhecimento é genérico e compartilhável
- Use agente quando precisa de identidade, voz e processo específico

### Agentes customizados vs genomes

- **Genome** = lente cognitiva passiva que enriquece agentes
- **Agente** = executor ativo que produz trabalho
- Genomes são aplicados em agentes — não substituem agentes
- Use `@genome` para criar o genome, depois aplique ao agente

---

## FAQ

### O `aioson update` sobrescreve meus agentes?

Não. Tanto `.aioson/my-agents/` quanto `.aioson/squads/{slug}/agents/` são protegidos pelo installer. O `update` só toca arquivos gerenciados pelo framework.

### Agentes customizados funcionam no Codex?

Sim. O comando registra o agente no `AGENTS.md`, então o Codex encontra via `@slug`. Claude Code encontra via `CLAUDE.md` onde é registrado como `/{slug}`.

### Posso usar `--with-infra` em my-agents?

Não — infraestrutura operacional (tasks, templates, checklists) só faz sentido dentro de uma squad que tem estrutura de pastas para isso.

### Qual a diferença entre `--type=assistant` e `--type=clone`?

Ambos têm Voice DNA. A diferença é que `clone` inclui a seção "Specialist" com referência ao especialista humano e a instrução explícita de "Write as the specialist would write". Use `clone` quando tiver material real do especialista; use `assistant` para especialistas de domínio sem referência a uma pessoa específica.

### Preciso usar tier e DISC?

Não são obrigatórios. Use tier quando tiver agentes que precisam rodar em ordem (tier 0 primeiro). Use DISC quando quiser que o agente tenha um estilo de interação definido — especialmente útil em assistants e clones.
