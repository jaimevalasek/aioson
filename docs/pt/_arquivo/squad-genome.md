# [Arquivado] Squad e Genome

> **Esta doc foi substituída.**
> Conteúdo dividido entre as fichas individuais:
> - Squad: [`../4-agentes/squad.md`](../4-agentes/squad.md)
> - Genome: [`../4-agentes/genome.md`](../4-agentes/genome.md)
> Conteúdo abaixo preservado para referência histórica.

---

# Squad e Genome

> Guia prático para usar `@squad` e `@genome` no AIOSON sem confundir time operacional, skill e camada cognitiva.

---

## Visão rápida

`@squad` e `@genome` resolvem problemas diferentes:

- `@squad` cria uma **squad modular em pacote** sob `.aioson/squads/{squad-slug}/`
- `@genome` cria uma **base estruturada de conhecimento e lentes cognitivas** em `.aioson/genomes/{slug}.md`

Em termos simples:

- `skill` define **o que saber fazer**
- `genome` define **como pensar**
- `@squad` organiza isso em **pacote versionável, executores leves, output, logs e media**
- o `@orquestrador` gerado para cada squad consolida o trabalho em HTML

---

## Distinção central: skill, genome, executor e subagente

Essa separação precisa ficar estável no sistema:

- `skill` é capacidade operacional reutilizável
- `genome` é lente cognitiva, repertório e forma de pensar
- `agente executor` é um trabalhador permanente da squad
- `subagente` é uma unidade temporária de investigação, comparação ou paralelismo
- `agents.md` é o manifesto curto da squad, não é um executor

### Skill

Use skill para descrever algo como:

- estruturar roteiro
- revisar arquitetura
- sintetizar briefing
- analisar hook
- extrair critérios de aceite

Skill responde à pergunta:

> "O que este sistema sabe fazer bem?"

### Genome

Use genome para descrever algo como:

- mente de estrategista editorial
- mente de copywriter de retenção
- mente de advogado cético
- mente de criador viral

Genome responde à pergunta:

> "Com que lentes este sistema pensa, julga e escolhe?"

### Agente executor

É o papel operacional fixo do squad:

- `@roteirista-viral`
- `@copywriter-de-titulos`
- `@analista-de-retencao`
- `@orquestrador`

### Subagente

É temporário e não define a identidade principal da squad.

Use para:

- pesquisa ampla
- comparação de alternativas
- resumo de material grande
- leitura paralela

Não use subagente como substituto de:

- skill
- genome
- executor permanente

---

## O que é um squad

Um squad é uma unidade operacional modular criada para um objetivo específico.

O AIOSON suporta varias squads paralelas no mesmo projeto.

Regra pratica:

- se voce quer uma nova squad, o `@squad` deve criar uma nova squad
- ele nao deve assumir upgrade de uma squad antiga so porque o dominio parece parecido
- melhoria, refatoracao ou manutencao de squad existente so entram quando isso for pedido explicitamente

Ela não é só uma pasta com agentes. Uma squad bem formada tem:

- manifesto curto em `.aioson/squads/{squad-slug}/agents/agents.md`
- manifesto estruturado em `.aioson/squads/{squad-slug}/squad.manifest.json`
- `design-doc` local em `.aioson/squads/{squad-slug}/docs/design-doc.md`
- `readiness` local em `.aioson/squads/{squad-slug}/docs/readiness.md`
- executores permanentes em `.aioson/squads/{squad-slug}/agents/`
- metadata em `.aioson/squads/{slug}/squad.md`
- outputs em `output/{squad-slug}/`
- logs em `aioson-logs/{squad-slug}/`
- mídia em `media/{squad-slug}/`

Para squads de conteudo, o ideal nao e despejar tudo solto no `output/`.
O modelo recomendado e:

- `output/{squad-slug}/{content-key}/content.json`
- `output/{squad-slug}/{content-key}/index.html`

Assim o runtime e o dashboard podem tratar cada entrega como um conteudo real, e nao so como um arquivo solto.

O importante aqui e: o AIOSON **nao fixa os campos internos** desse conteudo.
Ele fixa apenas a casca:

- `content_key`
- `contentType`
- `layoutType`
- `payload_json`

O resto nasce do dominio da squad.
Uma squad de YouTube pode ter `roteiro` e `thumb-prompts`.
Uma squad juridica pode ter `parecer`, `riscos` e `clausulas`.
Uma squad de produto pode ter `prd`, `edge-cases` e `rollout`.

Por isso a squad deve declarar `contentBlueprints` no manifesto JSON.
Esse blueprint e o contrato dinamico do entregavel e precisa ser generico o suficiente para:

- ser salvo no SQLite local
- ser renderizado no dashboard
- ser publicado no `aiosforge.com`
- ser exportado/importado em outro projeto

### Como escolher o `layoutType`

Use uma heurística simples:

- `document`: quando a entrega principal for longa e linear
- `tabs`: quando houver várias saídas irmãs no mesmo pacote
- `accordion`: quando houver alternativas, comparações, opções ou FAQs
- `stack`: quando a leitura for uma sequência de blocos independentes
- `mixed`: quando o pacote precisar combinar hero, seções e componentes diferentes

### Como desenhar um `contentBlueprint`

- derive `sections` do objetivo real da squad
- use a linguagem do domínio do usuário quando ela fizer sentido
- aproveite skills e docs locais que já apontem entregáveis recorrentes
- aproveite tambem skills instaladas em `.aioson/squads/{squad-slug}/skills/`
- prefira 1 blueprint principal forte antes de criar vários superficiais
- escolha `blockTypes` pelo padrão de leitura esperado, não pelo efeito visual

Antes de escrever essa estrutura, o `@squad` deve consolidar um mini pacote de:

- discovery do problema
- design doc do escopo atual
- leitura de prontidao

Quando esse pacote e materializado, ele passa a existir como parte da squad:

- `.aioson/squads/{squad-slug}/docs/design-doc.md`
- `.aioson/squads/{squad-slug}/docs/readiness.md`

Esse passo existe para evitar squads montadas em cima de contexto vago demais.
Na pratica, o `@squad` decide:

- se o pedido parece `modo projeto` ou `modo feature`
- quais skills e documentos realmente precisam entrar agora
- o que pode ficar fora do contexto ativo por enquanto

Exemplo:

```text
.aioson/squads/youtube-creator/agents/
  agents.md
  squad.manifest.json
  roteirista-viral.md
  estrategista-de-titulos.md
  analista-de-retencao.md
  copywriter-de-thumbnail.md
  orquestrador.md
```

Esses agentes não são os agentes oficiais da aioson. Eles são executores do seu projeto.

> Para criar agentes customizados via CLI com template enriquecido (Voice DNA, anti-patterns, infra operacional), veja [Agentes Customizados](./agentes-customizados.md).

---

## O que é um genome

Um genome é um artefato de domínio e cognição. Ele descreve:

- `O que saber`: conceitos, tensões, heurísticas e linguagem do domínio
- `Mentes`: perspectivas cognitivas úteis para pensar naquele domínio
- `Padrões de julgamento`: o que valorizar, evitar e tensionar
- `Skills`: fragmentos curtos de capacidade reutilizável que podem nascer desse domínio

Exemplo:

```text
.aioson/genomes/storytelling-retencao-youtube.md
```

Esse genome não faz trabalho sozinho. Ele não substitui o agente. Ele não substitui skill. Ele enriquece a forma como os agentes executam suas skills.

### Como pensar no genome na prática

O jeito mais útil de entender genome é:

- `skill` = ferramenta
- `genome` = mente

Exemplo:

- o agente `@roteirista-viral` pode ter a skill de `roteiro-short-form`
- o genome `storytelling-retencao-youtube` muda como esse agente pensa:
  - que tipo de hook priorizar
  - que tensão narrativa abrir
  - que payoff prometer
  - o que evitar por soar genérico

Então, para o sistema:

- skill sem genome pode executar
- genome sem skill não executa
- executor com skill + genome tende a entregar melhor

Quando uma skill vier do catálogo online ou de outro pacote, ela deve ser salva em:

```text
.aioson/squads/{squad-slug}/skills/{dominio}/{skill-slug}.md
```

Depois disso, essa skill passa a ser parte real do pacote local da squad e deve ser considerada pelos agentes sob demanda.

---

## Genome não é clone literal de pessoa

Se você quiser usar uma inspiração autoral, prefira este pensamento:

- melhor: `genome de estilo editorial`
- melhor: `genome de raciocínio`
- melhor: `genome de storytelling`
- evitar como regra principal: `clone da pessoa X`

O uso mais saudável é:

- "genome de copy de retenção"
- "genome de estratégia editorial para YouTube"
- "genome de narrativa emocional"

Isso deixa o sistema:

- mais reutilizável
- mais consistente
- menos confuso com persona, executor e skill

---

## Relação entre squad e genome

O modelo recomendado é:

1. criar o squad
2. criar ou importar genomes
3. aplicar genomes ao squad inteiro ou a agentes específicos
4. chamar os agentes normalmente

Depois que o genome é aplicado, o usuário não deveria precisar repetir isso em toda sessão.
O vínculo precisa ficar salvo no metadata do squad e refletido no manifesto da squad.

Exemplo:

```text
.aioson/squads/youtube-creator.md
```

```md
Squad: YouTube Creator
Mode: Squad
Goal: Criar conteúdos virais com retenção forte
Agents: .aioson/squads/youtube-creator/agents/
Manifest: .aioson/squads/youtube-creator/squad.manifest.json
Output: output/youtube-creator/
Logs: aioson-logs/youtube-creator/
Media: media/youtube-creator/
LatestSession: output/youtube-creator/latest.html

Genomes:
- .aioson/genomes/storytelling-retencao-youtube.md

AgentGenomes:
- roteirista-viral: .aioson/genomes/redacao-emocional-youtube.md
- copywriter-thumbnail: .aioson/genomes/copy-ctr-youtube.md
```

---

## Estrutura modular que o `@squad` deve gerar

O contrato atual esperado de uma squad é este:

```text
.aioson/squads/{squad-slug}/
  squad.manifest.json
  squad.md
  agents/
    agents.md
    orquestrador.md
    {executor-1}.md
    {executor-2}.md
  skills/
  templates/
  docs/
    design-doc.md
    readiness.md
    squad-rules.md
    output-contracts.md

output/{squad-slug}/
aioson-logs/{squad-slug}/
media/{squad-slug}/
```

### `agents.md`

É o manifesto curto da squad.

Deve explicar:

- missão
- faz
- não faz
- executores permanentes
- skills da squad
- MCPs da squad
- política de subagentes
- saídas e revisão

### `squad.manifest.json`

É a versão estruturada da mesma squad, pensada para:

- SQLite local
- dashboard
- export/import
- sync com `aiosforge.com`

O manifesto também deve declarar:

- `mode: content | builder`
- `storagePolicy`
- `package`
- `contentBlueprints`

Ou seja:

- `agents.md` é a leitura curta para humano/LLM
- `squad.manifest.json` é o contrato para sistema

Exemplo de `contentBlueprints` dentro do manifesto:

```json
{
  "contentBlueprints": [
    {
      "slug": "entregavel-principal",
      "contentType": "domain-package",
      "layoutType": "tabs",
      "description": "Contrato do entregável principal desta squad.",
      "sections": [
        {
          "key": "visao-geral",
          "label": "Visão geral",
          "blockTypes": ["hero", "rich-text"]
        },
        {
          "key": "itens-principais",
          "label": "Itens principais",
          "blockTypes": ["bullet-list", "tags", "accordion"]
        }
      ]
    }
  ]
}
```

Perceba que:

- `sections` nao sao uma lista fixa global do framework
- cada squad escolhe `key`, `label` e `blockTypes` conforme o dominio
- o dashboard so precisa saber renderizar os blocos declarativos, nao o dominio em si

### Contrato minimo de `content.json`

Quando o squad publicar um entregavel estruturado, o `content.json` precisa ter pelo menos:

- `contentKey`
- `title`
- `contentType`
- `layoutType`
- `blocks`

E o `layoutType` deve ser um destes:

- `document`
- `tabs`
- `accordion`
- `stack`
- `mixed`

Cada item de `blocks` precisa ser um objeto com `type`.
Para alguns blocos, o contrato minimo tambem importa:

- `tabs` precisa de `items`, e cada item precisa de `label` e `blocks`
- `accordion` precisa de `items`, e cada item precisa de `title` e `content` ou `blocks`
- `section` precisa de `blocks`

Se o JSON estiver malformado:

- o HTML ainda pode existir como arquivo
- o artifact ainda pode ser registrado
- mas o runtime nao indexa esse pacote como `content_item`

Isso evita que dashboard e cloud passem a depender de payloads quebrados.

---

## Separação de responsabilidades

O fluxo recomendado agora é mais direto:

- `@squad` cria e mantém squads
- `@genome` cria e aplica genomes

Na prática:

- `@squad` não deve abrir perguntando entre Lite e Genome
- `@squad` entra direto nas perguntas para criação da squad
- `@genome` é chamado separadamente quando o usuário quiser enriquecer a squad

---

## Fluxo recomendado de uso

### Cenário 1: criar um squad

Exemplo:

```text
/aioson:agent:squad
Quero montar um squad para YouTube.

Domínio: YouTube Creator focado em vídeos longos
Objetivo: criar roteiros mais fortes e títulos com CTR alto
Output: roteiros, títulos, ideias de thumbnail
Restrições: público brasileiro, tom direto, sem clickbait vazio
Papéis: pode escolher
```

Resultado esperado:

- criação de manifesto em `.aioson/squads/youtube-creator/agents/agents.md`
- criação de manifesto JSON em `.aioson/squads/youtube-creator/squad.manifest.json`
- criação de executores em `.aioson/squads/youtube-creator/agents/`
- criação de resumo em `.aioson/squads/youtube-creator/squad.md`
- criação de `output/youtube-creator/`, `aioson-logs/youtube-creator/` e `media/youtube-creator/`
- geração de `output/youtube-creator/latest.html`

### Cenário 2: criar um genome depois

```text
/aioson:agent:genome
Quero um genome para storytelling com retenção alta em vídeos longos do YouTube Brasil.
```

Depois:

```text
Aplicar este genome ao squad youtube-creator.
Aplicar especialmente ao agente @roteirista-viral.
```

Resultado esperado:

- genome salvo em `.aioson/genomes/...`
- vínculo salvo no metadata do squad
- manifesto da squad refletindo o vínculo
- agente `roteirista-viral.md` reescrito com `## Genomes ativos`

### Cenário 3: usar o agente depois disso

```text
@roteirista-viral
Crie um roteiro para um vídeo sobre como aprender inglês sem pagar curso.
```

O agente já deve operar com os genomes vinculados, sem o usuário repetir tudo.

---

## Arquivos gerados

### Squad

```text
.aioson/squads/{squad-slug}/agents/
output/{squad-slug}/
.aioson/squads/{squad-slug}.md
aioson-logs/{squad-slug}/
media/{squad-slug}/
```

### Genome

```text
.aioson/genomes/{genome-slug}.md
```

### Registro nos gateways

Quando o squad é criado, o comportamento esperado é registrar os agentes dinâmicos nos gateways do projeto:

- `CLAUDE.md` para uso via `/agente` no Claude Code
- `AGENTS.md` para uso via `@agente` no Codex

### Drafts, mídia e HTML final

O fluxo recomendado é:

1. cada agente especialista gera conteúdo intermediário em Markdown
2. o `@orquestrador` do squad consolida esse material
3. o `@orquestrador` publica o HTML final da sessão
4. qualquer arquivo de mídia vai para `media/{squad-slug}/`

Exemplo:

```text
output/youtube-creator/
  2026-03-06-153000-roteiro-roteirista-viral.md
  2026-03-06-153000-copy-copywriter-thumbnail.md
  2026-03-06-153000-video-ingles.html
  latest.html

media/youtube-creator/
  referencia-thumb-01.png
  frame-estudo-02.jpg
  audio-gancho-01.mp3
```

Regra prática:

- texto, markdown, html, json e logs podem ser indexados e acompanhados no runtime
- mídia deve ficar no filesystem do projeto em `media/`

---

## Regras importantes

### 1. O orquestrador responsável pelo HTML é o do squad

Não é o `@orchestrator` oficial da aioson.

É o `@orquestrador` gerado dentro de `.aioson/squads/{squad-slug}/agents/`.

### 2. Genome não deve alterar agentes oficiais da aioson

Não aplique genomes customizados do usuário em:

```text
.aioson/agents/
```

Os genomes devem ser aplicados aos agentes criados em:

```text
.aioson/squads/{squad-slug}/agents/
```

### 3. O usuário pode mandar contexto grande

Tanto no `@squad` quanto no `@genome`, o usuário pode enviar:

- textos longos
- PDFs ou arquivos
- prints
- imagens
- anotações brutas
- exemplos de referência

### 4. Um genome pode ser do squad inteiro ou de um agente

Use no squad inteiro quando o contexto vale para todos.

Use por agente quando o contexto for específico.

### 5. HTML final não substitui o chat

O agente ainda responde na sessão.

O HTML é o entregável persistido e organizado para consulta e cópia.

### 6. Estrutura de pastas deve ser leve

Prefira:

- `.aioson/squads/{squad-slug}/agents/`
- `output/{squad-slug}/`
- `aioson-logs/{squad-slug}/`
- `media/{squad-slug}/`

Evite criar subpastas demais sem necessidade.

---

## Qualidade mínima das respostas

Os agentes do squad não devem responder só com frases curtas e genéricas.

O comportamento esperado é:

- leitura do problema ou diagnóstico
- recomendação principal
- justificativa específica
- tradeoff, risco ou tensão
- próximo passo prático

Se a tarefa pedir um artefato final:

- o agente entrega primeiro o artefato
- depois explica por que aquela solução faz sentido

---

## Direção visual do HTML

O HTML final do squad deve seguir um dark theme mais confortável e premium.

Direção recomendada:

- dark sofisticado e técnico
- contraste controlado
- superfícies em camadas discretas
- bordas suaves
- no máximo 2 cores de acento

Evite:

- glow verde forte
- neon exagerado
- fundo preto puro com branco chapado
- arco-íris de bordas por card
- gradientes pesados que cansam a leitura

---

## Automação de processos

Depois que a squad produz output, o orquestrador pode analisar se o processo é determinístico o suficiente para virar um script Python ou Node.js que roda sem LLM. Veja [Automação de Squads](./automacao-squads.md) para o guia completo com exemplos.

## Boas práticas

- comece criando a squad antes de enriquecer com genomes
- aplique genomes ao menor escopo possível
- use `agents.md` como mapa curto da squad
- use `squad.manifest.json` como contrato de runtime e sync
- deixe o orquestrador do squad cuidar do HTML final
- use drafts `.md` para manter rastreabilidade entre agentes e entregável final

---

## Genome 3.0 e o Sistema Profiler

### O que é o Genome 3.0

O Genome 3.0 estende o formato 2.0 com suporte a profiling de personas baseado em evidência. Enquanto o Genome 2.0 responde "como pensar sobre um assunto", o Genome 3.0 responde "como uma pessoa específica pensa sobre um assunto".

### Tipos de output

| Output | O que é | Onde vive |
|--------|---------|-----------|
| Genome 3.0 | Conhecimento destilado + perfil cognitivo | `.aioson/genomes/` |
| Advisor Agent | Conselheiro ativo com a lente da persona | `.aioson/advisors/` |

### O pipeline profiler

O sistema profiler é composto por 3 agentes:

1. `@profiler-researcher`
   Pesquisa web e coleta material
2. `@profiler-enricher`
   Consolida evidências, material do usuário e análise cognitiva
3. `@profiler-forge`
   Gera Genome 3.0, Advisor ou ambos

O pipeline pode começar:

- diretamente com `@profiler-researcher [nome da pessoa]`
- via redirect do `@genome` quando `type: persona` for detectado

### Dimensões capturadas

O profiler cobre múltiplas camadas:

- `DISC`
- `Eneagrama`
- `Big Five`
- `MBTI`
- Schwartz Values inferidos
- frameworks de decisão
- estilo de comunicação
- vieses cognitivos
- padrões de erro
- expertise demonstrada

Perfis psicométricos devem ser tratados como `INFERIDOS`, nunca como avaliação formal.

### Advisors

Advisor não é genome.

- genome é passivo e serve para enriquecer executores
- advisor é ativo e serve para opinar, questionar, analisar e aconselhar

O advisor pode ter:

- web search
- decision log
- challenge mode
- estilo de comunicação coerente com a persona

### Board de Conselheiros

Múltiplos advisors podem operar como board para analisar a mesma pergunta sob perspectivas diferentes. Isso é especialmente útil em decisões de alto impacto, estratégia, oferta e posicionamento.

### Relação entre Genome 3.0 e Advisor

O uso mais forte costuma ser combinado:

- o Genome 3.0 entra nos agentes executores do squad
- o Advisor revisa, desafia e aconselha sobre os outputs produzidos

Exemplo:

```text
Squad: youtube-creator
  Executores: @roteirista-viral (com Genome 3.0 aplicado)
  Advisory: @stefan-advisor (analisa os roteiros produzidos)
```

### Relatórios intermediários do profiler

```text
.aioson/profiler-reports/{person-slug}/
  research-report.md
  enriched-profile.md
```

Esses arquivos são a fonte de verdade para genomes e advisors gerados.

---

## O que ainda vem pela frente

O modelo atual já suporta squads modulares, publish/import e genomes vinculados.

Os próximos blocos naturais do framework são:

- capability oficial de `Discovery / Design-Doc`
- score formal de prontidão antes de implementação
- uso mais claro de skills e arquivos sob demanda
- herança disso pelo `@squad` na criação de novas squads

Ou seja: a base de squad/genome já existe, mas ainda vai ficar mais forte quando o fluxo completo de discovery/design estiver costurado no core.
