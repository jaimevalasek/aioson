# [Arquivado] Sistema Profiler — Guia Rápido

> **Esta doc foi substituída.**
> O sistema profiler foi documentado por agente individual: [`../4-agentes/profiler-researcher.md`](../4-agentes/profiler-researcher.md), [`../4-agentes/profiler-enricher.md`](../4-agentes/profiler-enricher.md), [`../4-agentes/profiler-forge.md`](../4-agentes/profiler-forge.md).
> Conteúdo abaixo preservado para referência histórica.

---

# Sistema Profiler — Guia Rápido

> Pipeline oficial para pesquisa, enriquecimento e geração de Genome 3.0 e Advisors no AIOSON.

---

## O que é

O Sistema Profiler cria um perfil cognitivo inferido de pessoas públicas a partir de evidências observáveis. O objetivo não é produzir uma "persona decorativa", mas sim um artefato utilizável que capture:

- como a pessoa pensa
- como decide
- como comunica
- onde demonstra expertise real
- quais vieses e blind spots aparecem com frequência

O pipeline gera dois outputs principais:

- `Genome 3.0`: conhecimento destilado + perfil cognitivo aplicável a agentes executores
- `Advisor Agent`: conselheiro ativo que responde como a persona, com web search e memória

---

## Pipeline

O fluxo oficial é sequencial:

1. `@profiler-researcher`
   Coleta material público e organiza evidências em `.aioson/profiler-reports/{person-slug}/research-report.md`
2. `@profiler-enricher`
   Consolida a pesquisa com materiais extras do usuário e produz `.aioson/profiler-reports/{person-slug}/enriched-profile.md`
3. `@profiler-forge`
   Transforma o perfil enriquecido em Genome 3.0, Advisor Agent ou ambos

Fluxo resumido:

```text
Pessoa alvo
  -> @profiler-researcher
  -> research-report.md
  -> @profiler-enricher
  -> enriched-profile.md
  -> @profiler-forge
  -> Genome 3.0 / Advisor / ambos
```

---

## Como iniciar

### Opção 1: pipeline completo

```text
@profiler-researcher Stefan Georgi
```

Depois siga a sequência natural:

```text
@profiler-enricher stefan-georgi
@profiler-forge stefan-georgi
```

### Opção 2: via `@genome`

```text
/aioson:agent:genome
Tipo: persona
Pessoa: Stefan Georgi
Domínio: direct response copywriting
```

Quando `type: persona` é detectado, o `@genome` deve redirecionar para o pipeline profiler por padrão.

### Opção 3: modo rápido

Se o usuário pedir explicitamente um genome persona rápido, leve ou `--quick`, o sistema pode gerar um resultado com baixa fidelidade usando apenas conhecimento inferido do LLM.

Nesses casos:

- `evidence_mode: inferred`
- `confidence: low`
- o arquivo deve explicitar que não houve profiling baseado em evidência

---

## Dimensões capturadas

O profiler trabalha com múltiplas camadas de análise:

- `DISC`
- `Eneagrama`
- `Big Five`
- `MBTI`
- frameworks e heurísticas de decisão
- estilo de comunicação
- valores e crenças operacionais
- expertise demonstrada
- histórico de decisões públicas
- influências e antagonismos
- vieses cognitivos e padrões de erro
- valores inferidos via Schwartz
- perfil de risco
- estilo de liderança, quando aplicável

Todos os perfis psicométricos devem ser tratados como `INFERIDOS`.

---

## Arquivos gerados

### Relatórios intermediários

```text
.aioson/profiler-reports/{person-slug}/
  research-report.md
  enriched-profile.md
```

### Outputs finais

```text
.aioson/genomes/{person-slug}-{domain-slug}.md
.aioson/genomes/{person-slug}-{domain-slug}.meta.json
.aioson/advisors/{person-slug}-advisor.md
```

---

## Quando usar Genome 3.0

Use Genome 3.0 quando você quer enriquecer executores já existentes com a forma de pensar de uma pessoa.

Exemplos:

- copywriter do squad escrevendo com o raciocínio de um especialista em ofertas
- estrategista editorial operando com lentes mentais de um criador específico
- time de liderança avaliando decisões com a filosofia operacional de uma referência

Genome é artefato passivo. Ele não executa sozinho.

---

## Quando usar Advisor

Use Advisor quando você quer consulta direta.

Exemplos:

- pedir opinião estratégica
- desafiar um plano
- analisar copy, documento, pitch ou tese
- interpretar contexto atual com web search

Advisor é ativo. Ele não substitui o executor; ele aconselha.

---

## Board de Advisors

Múltiplos advisors podem operar como um board para comparar perspectivas.

Uso recomendado:

- decisões estratégicas
- revisão de oferta
- análise de mercado
- resolução de conflito entre frameworks

Nesse modelo:

- cada advisor responde separadamente
- o sistema destaca convergências e divergências
- o usuário escolhe qual linha seguir ou aprofundar

---

## Critérios de qualidade

Um profiling é considerado forte quando:

- existe evidência suficiente e variada
- os claims principais estão ancorados em fontes
- a expertise real foi separada de opinião superficial
- o output diferencia conhecimento, estilo, princípio e viés
- limitações e blind spots aparecem explicitamente

Sinais de profiling fraco:

- material escasso
- excesso de inferência sem evidência
- confusão entre fama e competência
- psicometria afirmada sem disclaimer

---

## Relação com o sistema atual

O Profiler System é uma extensão do fluxo de genomes, não um substituto do Genome 2.0.

- Genome 2.0 continua válido para `domain` e `function`
- Genome 3.0 entra quando existe `persona`
- Advisors convivem com squads como membros consultivos
- relatórios intermediários viram a fonte de verdade para reprocessamento futuro

---

## Regras operacionais

- não tratar inferência psicométrica como diagnóstico clínico
- não omitir limitações do perfil
- não pular o enriquecimento quando o objetivo for alta fidelidade
- preservar os relatórios intermediários como trilha de auditoria
- preferir `Genome 3.0 + Advisor` quando o caso exigir execução e consultoria
