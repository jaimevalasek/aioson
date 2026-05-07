# Genome 4.0 — Especificação de Formato

> Versão: 3.1  
> Status: Ativo  
> Compatibilidade: retrocompatível com Genome 2.0 e 3.0  
> Data: 2026-04-07  
> Changelog: adição de campos 4.0-track (anchor_prompt, relations, hexaco_h, trait_interactions)

---

## Visão geral

O Genome 3.0 estende o Genome 2.0 com suporte a profiling de persona baseado em evidências. O objetivo é representar não só o que um domínio exige, mas como uma pessoa específica pensa sobre esse domínio.

O formato mantém as 10 seções canônicas do Genome 2.0 e adiciona seções específicas para:

- perfil cognitivo
- estilo de comunicação
- vieses e blind spots
- resolução de conflito entre personas, quando houver multi-persona

---

## Tipos de genome

| Tipo | Versão mínima | Descrição |
|------|---------------|-----------|
| `domain` | 2.0 | Conhecimento de domínio puro |
| `function` | 2.0 | Capacidade funcional específica |
| `persona` | 3.0 | Perfil cognitivo de pessoa real |
| `hybrid` | 2.0+ | Combinação de tipos |

### Modos de `hybrid`

| Modo | Versão | Descrição |
|------|--------|-----------|
| `domain-function` | 2.0 | Domínio + função |
| `single-persona` | 3.0 | Persona + domínio |
| `multi-persona` | 3.0 | Múltiplas personas com papéis atribuídos |

---

## Frontmatter

### Campos base

```yaml
---
genome: [slug]
domain: [human-readable]
type: [domain|function|persona|hybrid]
language: [en|pt-BR|es|fr|other]
depth: [surface|standard|deep]
version: [2|3]
format: [genome-v2|genome-v3]
evidence_mode: [inferred|evidenced|hybrid]
generated: [YYYY-MM-DD]
sources_count: [int]
mentes: [int]
skills: [int]
# Campos opcionais do track 4.0 (retrocompatíveis — leitores 2.0/3.0 ignoram)
relations:
  - genome: [slug]
    type: [complementa|contradiz|depende-de|sobrepõe]
activation_scope:
  - task: [strategic-decision|content-generation|review-critique|research]
    load: [lista de seções canônicas a carregar]
---
```

### Campos adicionais de persona

Obrigatórios quando `type: persona` e recomendados em `hybrid` com persona:

```yaml
persona_source: "[Full Name]"
persona_sources: ["Name 1", "Name 2"]
disc: "[XY]"
enneagram: "[XwY]"
big_five: "O:[H] C:[M] E:[L] A:[L] N:[M]"
mbti: "[XXXX]"
# hexaco_h: dimensão Honesty-Humility do HEXACO (opcional, track 4.0)
# Relevante para personas com dimensão ética, negociação ou comportamento moral
# low = tendência estratégico-manipulativa | high = código de honra rígido, transparência auto-imposta
hexaco_h: [low|medium|high]
confidence: [low|medium|high]
profiler_report: ".aioson/profiler-reports/[slug]/enriched-profile.md"
hybrid_mode: [domain-function|single-persona|multi-persona]
# anchor_prompt: resumo ultra-compacto para reforço em sessões longas (track 4.0)
# Inserir a cada ~10 turnos para evitar deriva de persona (PersonaAgent NeurIPS 2025)
anchor_prompt: |
  [1-3 linhas: traço dominante, padrão de julgamento, anti-padrão central]
```

### Exemplo de frontmatter persona

```yaml
---
genome: stefan-georgi-copywriting
domain: "Stefan Georgi — Direct Response Copywriting"
type: persona
language: pt-BR
depth: deep
version: 3
format: genome-v3
evidence_mode: evidenced
generated: 2026-03-13
sources_count: 27
mentes: 4
skills: 8
persona_source: "Stefan Georgi"
disc: "DI"
enneagram: "3w4"
big_five: "O:H C:H E:H A:M N:L"
mbti: "ENTJ"
confidence: medium
profiler_report: ".aioson/profiler-reports/stefan-georgi/enriched-profile.md"
---
```

---

## Seções canônicas

### Obrigatórias em todo genome

| Seção | Descrição |
|-------|-----------|
| `## O que saber` | Nós de conhecimento do domínio |
| `## Filosofias` | Crenças e axiomas operacionais |
| `## Modelos mentais` | Lentes cognitivas reutilizáveis |
| `## Heurísticas` | Atalhos de decisão |
| `## Frameworks` | Processos estruturados |
| `## Metodologias` | Abordagens amplas |
| `## Mentes` | Perspectivas cognitivas acionáveis |
| `## Skills` | Capacidades operacionais |
| `## Evidence` | Fontes e rastreabilidade |
| `## Application notes` | Notas de uso e combinação |

### Obrigatórias em persona

| Seção | Obrigatória | Descrição |
|-------|-------------|-----------|
| `## Perfil Cognitivo` | Sim | Resumo psicométrico inferido com evidência |
| `## Estilo de Comunicação` | Sim | Voz, persuasão e padrões retóricos |
| `## Vieses e Pontos Cegos` | Sim | Biases, erros recorrentes e compensações |
| `## Conflict Resolution` | Só multi-persona | Hierarquia e desempate entre personas |

### Opcionais — track 4.0 (retrocompatíveis)

| Seção | Quando usar |
|-------|-------------|
| `## Trait Interactions` | Em `## Perfil Cognitivo` de personas com perfis psicométricos combinados complexos |
| `## Relations` | Quando o genome depende ou complementa outros genomes instalados |
| `## Activation Scope` | Quando o genome deve carregar seções diferentes por tipo de task |

---

## Estrutura recomendada das novas seções

### `## Perfil Cognitivo`

Use esta ordem:

1. aviso explícito de que o perfil é inferido
2. tabela de resumo psicométrico
3. tendências cognitivas
4. hierarquia de valores
5. Schwartz Values inferidos

Exemplo:

```markdown
## Perfil Cognitivo

> PERFIL INFERIDO. Não é avaliação psicométrica formal.

### Psychometric Summary

| Framework | Profile | Confidence | Key Evidence |
|-----------|---------|------------|--------------|
| DISC | DC — D:8 I:5 S:3 C:8 | medium | alta assertividade + frameworks |
| Enneagram | 3w4 | medium | foco em performance e diferenciação |
| Big Five | O:H C:H E:M A:L N:L | medium | discurso ambicioso e baixo hedge |
| MBTI | ENTJ | low | visão estratégica + decisão direta |
```

### `## Estilo de Comunicação`

Cobrir:

- tom
- registro
- assertividade
- humor
- palavrão
- padrão de frase
- metáforas
- uso de dados
- uso de histórias
- padrão de persuasão
- expressões recorrentes
- comportamento sob pressão

Exemplo:

```markdown
## Estilo de Comunicação

### Voice Profile

| Dimension | Value | Evidence |
|-----------|-------|----------|
| Tone | direto | calls e entrevistas |
| Register | técnico-acessível | breakdowns públicos |
| Assertiveness | high | pouca linguagem hedging |
```

### `## Vieses e Pontos Cegos`

Cobrir:

- vieses cognitivos observados
- padrões típicos de erro
- áreas de excesso de confiança
- áreas de subconfiança
- guidance compensatório para agentes que aplicarem o genome

### `## Conflict Resolution`

Obrigatória quando `hybrid_mode: multi-persona`.

Cobrir:

- domínio que cada persona lidera
- regra de desempate
- como resolver conflito de framework
- como resolver conflito de estilo
- princípio geral de tiebreaker

---

## Seções track 4.0 (opcionais, retrocompatíveis)

### `## Trait Interactions`

Incluída dentro de `## Perfil Cognitivo` quando a combinação de traços psicométricos gera comportamentos emergentes relevantes para quem aplica o genome.

**Por que importa:** pesquisa de 2026 (HumanLLM arXiv 2601.10198) demonstrou que avaliar traços em combinação (MPD — Multi-Pattern Dynamics) produz fidelidade de persona significativamente superior à avaliação por traço isolado (IPE). Um perfil DISC:D + Enneagram:9 cria tensão real que muda como o agente se comporta.

Estrutura recomendada:

```markdown
### Trait Interactions

| Combinação | Comportamento Emergente | Implicação para Agentes |
|---|---|---|
| DISC-D × Enneagram-9 | Liderança assertiva em público, conflito-aversivo em privado | Não espere confronto direto — busque harmonia primeiro |
| Big Five O:H × C:H | Cria sistemas para explorar novidade — inventário, não caos | Respostas vêm em frameworks, não em brainstorms livres |
| Enneagram-3w4 × DISC-DI | Competição orientada a distintividade, não só resultado | Gatilho: comparação com pares percebidos como criativos |
```

Regras:
- incluir apenas combinações que gerem comportamento não-óbvio
- máximo 5 entradas por genome
- focar em implicações práticas para agentes que aplicam o genome

### `## Relations`

Declara dependências e relações tipadas com outros genomes instalados no projeto.

**Por que importa:** Agentic RAG e sistemas de memória 2026 (A-MEM, MemOS) demonstram que representação explícita de relações entre nós de conhecimento reduz turnos necessários em 18% e aumenta completude de task em 19%.

Estrutura recomendada:

```markdown
## Relations

| Genome | Tipo | Nota |
|---|---|---|
| `persuasion-psychology` | depende-de | frameworks de persuasão usados nas heurísticas |
| `brand-voice-acme` | sobrepõe | voz da marca tem precedência sobre tom genérico |
| `storytelling-retention` | complementa | narrativa + copy trabalham juntos |
```

Tipos válidos:
- `depende-de` — este genome pressupõe o outro instalado
- `complementa` — combinação produz resultado superior
- `contradiz` — aplicar ambos simultaneamente cria conflito — escolher um
- `sobrepõe` — o outro tem precedência no campo declarado

### `## Activation Scope`

Define quais seções canônicas carregar por tipo de task. Permite injeção parcial do genome em contexto, reduzindo tokens e aumentando precisão.

**Por que importa:** PRISM (arXiv 2603.18507, 2026) demonstrou que personas de expert melhoram alinhamento mas podem danificar acurácia factual quando ativadas integralmente em tasks analíticas. Roteamento seletivo por task resolve isso.

Estrutura recomendada:

```markdown
## Activation Scope

| Task type | Seções a carregar |
|---|---|
| `strategic-decision` | Filosofias, Modelos mentais, Perfil Cognitivo |
| `content-generation` | Frameworks, Heurísticas, Skills, Estilo de Comunicação |
| `review-critique` | Vieses e Pontos Cegos, Mentes, Application notes |
| `research` | O que saber, Evidence, Relations |
```

Se esta seção estiver ausente: carregar o genome completo (comportamento padrão).

---

## Regras de compatibilidade

### Leitura por sistema 2.0

Um leitor de Genome 2.0 deve conseguir:

- ignorar campos extras no frontmatter
- ignorar seções extras
- continuar lendo normalmente as 10 seções canônicas

Isso torna o Genome 3.0 retrocompatível por adição.

### Migração de 2.0 para 3.0

Quando um genome 2.0 recebe camada de persona:

1. preservar o slug base quando fizer sentido
2. elevar `version` para `3`
3. trocar `format` para `genome-v3`
4. adicionar os campos de persona no frontmatter
5. manter as 10 seções canônicas
6. acrescentar as novas seções sem remover conteúdo anterior útil

### Quick mode

Quando um genome persona for gerado sem profiler completo:

- `evidence_mode: inferred`
- `confidence: low`
- incluir disclaimer explícito em `## Application notes`

### Campos track 4.0 (adição retrocompatível)

Os campos `relations`, `activation_scope`, `hexaco_h` e `anchor_prompt` são retrocompatíveis por adição:

- leitores 2.0/3.0 que não reconhecem esses campos os ignoram
- o genome continua válido e operacional sem eles
- nenhum campo track 4.0 é obrigatório
- `anchor_prompt` é recomendado para genomes persona usados em sessões longas (multi-turn)

---

## Meta file recomendado

Além do markdown, recomenda-se um `.meta.json` correspondente com:

```json
{
  "genome": "stefan-georgi-copywriting",
  "domain": "Stefan Georgi — Direct Response Copywriting",
  "type": "persona",
  "version": 3,
  "format": "genome-v3",
  "language": "pt-BR",
  "depth": "deep",
  "evidence_mode": "evidenced",
  "persona_source": "Stefan Georgi",
  "disc": "DI",
  "enneagram": "3w4",
  "big_five": "O:H C:H E:H A:M N:L",
  "mbti": "ENTJ",
  "hexaco_h": "medium",
  "confidence": "medium",
  "profiler_report": ".aioson/profiler-reports/stefan-georgi/enriched-profile.md",
  "anchor_prompt": "Pensa em copy como vendedor infatigável. Pesquisa antes de escrever. Mecanismo vem antes do headline. Especificidade > generalidade. Evitar: persuasão genérica sem ângulo único.",
  "relations": [
    { "genome": "copywriting", "type": "complementa" },
    { "genome": "persuasion-psychology", "type": "depende-de" }
  ]
}
```

---

## Regras de qualidade

- separar expertise real de opinião superficial
- ancorar claims principais em evidência
- deixar explícito o que é inferência
- não tratar psicometria como verdade clínica
- expor limitações e contextos onde a persona falha

---

## Ordem recomendada de geração

1. consolidar `enriched-profile.md`
2. transformar expertise em `## O que saber`
3. transformar crenças em `## Filosofias`
4. transformar frameworks e heurísticas em blocos aplicáveis
5. gerar `## Mentes` como modos cognitivos acionáveis
6. preencher as seções novas de persona
7. fechar com `## Evidence` e `## Application notes`
