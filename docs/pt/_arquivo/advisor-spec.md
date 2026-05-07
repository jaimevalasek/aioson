# [Arquivado] Advisor Agent — Especificação de Formato

> **Esta doc foi substituída.**
> A spec de advisor agora faz parte da doc do `@profiler-forge` em [`../4-agentes/profiler-forge.md`](../4-agentes/profiler-forge.md).
> Conteúdo abaixo preservado para referência histórica.

---

# Advisor Agent — Especificação de Formato

> Versão: 1.0  
> Status: Ativo  
> Gerado por: `@profiler-forge`  
> Localização: `.aioson/advisors/{slug}-advisor.md`

---

## O que é um Advisor

Um Advisor é um agente operacional completo baseado no perfil cognitivo inferido de uma pessoa real. Ele não é um genome aplicado passivamente; ele opera diretamente em modo consultivo.

Capacidades esperadas:

- analisar situações, planos e materiais
- questionar premissas usando frameworks da persona
- aconselhar no estilo da persona
- pesquisar informação atual na web e reinterpretá-la pelas lentes cognitivas da persona
- manter memória de decisões e outcomes

---

## Advisor versus Genome

| Aspecto | Genome | Advisor |
|---------|--------|---------|
| Tipo | Artefato passivo de conhecimento | Agente ativo |
| Execução direta | Não | Sim, em modo consultivo |
| Web search | Não | Sim |
| Memória | Não | Sim |
| Uso principal | Enriquecer executores | Opinar, desafiar, aconselhar |
| Localização | `.aioson/genomes/` | `.aioson/advisors/` |

---

## Frontmatter

```yaml
---
advisor: [person-slug]-advisor
persona: "[Full Name]"
domain_focus: "[primary domain]"
generated: [YYYY-MM-DD]
version: 1
format: advisor-v1
language: [lang]

disc: "[XY]"
enneagram: "[XwY]"
big_five: "[summary]"
mbti: "[XXXX]"
confidence: [low|medium|high]

profiler_report: ".aioson/profiler-reports/[slug]/enriched-profile.md"
genome: ".aioson/genomes/[slug].md"

web_search: true
memory: true
challenge_mode: true
---
```

---

## Seções obrigatórias

| Seção | Descrição |
|-------|-----------|
| `## Identity` | Identidade do advisor + disclaimer |
| `## Cognitive Core` | Frameworks, filtros de decisão e modelos mentais em primeira pessoa |
| `## Communication Style` | Como fala, argumenta e reage |
| `## Values & Principles` | Não-negociáveis e critérios de julgamento |
| `## Operating Modes` | Advisory, Web Search, Challenge e Analysis |
| `## Known Limitations` | Biases, pontos cegos e limites do perfil |
| `## Memory` | Decision log + contexto acumulado |
| `## Tools` | Regras de uso de web search e protocolo de análise |

---

## Estrutura mínima recomendada

```markdown
# Advisor: [Person Name]

## Identity

## Cognitive Core

### Primary Frameworks

### Decision Filters

### Mental Models Active

## Communication Style

## Values & Principles

## Operating Modes

## Known Limitations

## Memory

## Tools
```

---

## Modos de operação

### 1. Advisory

Modo padrão. O advisor recebe uma pergunta, situação ou decisão e responde com o filtro da persona.

Fluxo esperado:

1. entender o contexto
2. identificar o framework mais relevante
3. aplicar o framework
4. responder no estilo da persona
5. destacar risco, tradeoff ou blind spot

### 2. Web Search Grounded

Usado quando o tema depende de informação atual.

Fluxo esperado:

1. buscar dados atuais
2. resumir achados relevantes
3. reinterpretar tudo pelas lentes da persona
4. aconselhar com base em dados + perfil cognitivo

O advisor não deve usar web search como enfeite; ela existe para grounded advisory.

### 3. Challenge

Usado quando o usuário traz um plano, decisão ou hipótese.

Fluxo esperado:

1. reconhecer o que está forte
2. aplicar a pergunta favorita da persona
3. inverter e procurar falha provável
4. expor premissas ocultas
5. sugerir teste, validação ou alternativa

### 4. Analysis

Usado para materiais enviados pelo usuário.

Exemplos:

- copy
- estratégia
- tese
- roteiro
- deck
- documento

Fluxo esperado:

1. ler tudo
2. identificar o primeiro critério que a persona usaria
3. aplicar frameworks relevantes
4. dar assessment honesto
5. sugerir melhorias específicas

---

## Cognitive Core

O `## Cognitive Core` deve ser escrito em primeira pessoa, mas sem fingir ser a pessoa real.

Deve conter:

- top 3-5 frameworks
- filtros de decisão em ordem
- modelos mentais dominantes
- gatilhos cognitivos

Exemplo:

```markdown
## Cognitive Core

### Primary Frameworks

**I use leverage-first thinking when...**
[descrição]

### Decision Filters

1. Isso me dá leverage?
2. O downside é aceitável?
3. Isso aumenta ou reduz liberdade de longo prazo?
```

---

## Communication Style

Esta seção deve traduzir o perfil de comunicação em regras utilizáveis.

Cobrir:

- tom dominante
- estrutura típica de resposta
- o que a persona valoriza numa conversa
- o que dispara impaciência
- expressões recorrentes
- padrão de persuasão

Se houver evidência suficiente, incluir:

- comportamento sob pressão
- resposta a objeções
- uso de metáforas, histórias e dados

---

## Values & Principles

Escrever em primeira pessoa:

- o que nunca compromete
- o que prioriza
- o que considera sinal de qualidade
- o que considera desperdício, fraqueza ou erro

Essa seção deve ser diretamente derivada de `enriched-profile.md`, não inventada.

---

## Known Limitations

Todo advisor deve explicitar limites.

Cobrir:

- vieses cognitivos observados
- situações em que a persona costuma falhar
- áreas em que o perfil pode estar desatualizado
- limite estrutural: perfil inferido a partir de informação pública

Disclaimers mínimos:

- não é a pessoa real
- não é diagnóstico formal
- pode não refletir mudanças recentes

---

## Memory

O advisor mantém memória operacional. Estrutura recomendada:

```markdown
## Memory

### Decision Log

| Date | Topic | User's Position | Advice Given | Framework Used | Outcome | Notes |
|------|-------|----------------|--------------|----------------|---------|-------|

### Context Accumulated

#### User's Business
- [fact]

#### User's Tendencies
- [pattern]

#### Previous Outcomes
- [result]
```

Regras:

- referenciar decisões passadas quando relevante
- não repetir recomendação que já falhou sem reconhecer isso
- acumular contexto do usuário progressivamente

---

## Uso em squad

Um advisor pode participar de uma squad como papel consultivo.

Exemplo no `agents.md`:

```markdown
## Advisory Members

- @stefan-advisor — Analisa copy e estratégia de oferta
- @munger-advisor — Desafia premissas e avalia downside
```

Regras:

- advisor não produz output principal da squad
- advisor avalia, critica e orienta
- advisor pode ser consultado pelo orquestrador
- advisor mantém sua memória mesmo atuando dentro da squad

---

## Board de Conselheiros

Múltiplos advisors podem operar como board.

Comportamento recomendado:

1. cada advisor responde separadamente
2. o sistema mostra convergências e divergências
3. o usuário escolhe qual linha aprofundar

Isso é útil para:

- decisões estratégicas
- comparação de ofertas
- análise de mercado
- revisão de tese ou plano

---

## Regras de qualidade

- não confundir advisor com executor
- não gerar conteúdo final fingindo ser a persona
- usar web search quando atualidade importar
- manter primeira pessoa apenas como interface cognitiva, não como impersonation literal
- expor limites do perfil com honestidade
