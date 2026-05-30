# Task: Squad Design

> Fase de design do lifecycle do squad. Produz um blueprint intermediário.

## Quando usar
- `@squad design <nome>` — invocação direta
- `@squad` sem subcomando quando não existe blueprint para o slug

## Entrada
- Contexto do usuário: domínio, objetivo, constraints, roles desejados
- Opcional: documentação fonte (arquivos `.md`, texto colado, screenshots)
- Opcional: domínio hint para guiar a análise

## Processo

### Passo 0 — Verificar contexto do projeto, artisan input e templates disponíveis

**0A — Artifacts do pipeline AIOSON**

Antes de perguntar qualquer coisa, procure:
- `.aioson/context/implementation-plan-*.md`
- `.aioson/context/requirements-*.md`
- `.aioson/context/architecture.md`
- `.aioson/context/prd.md` e `prd-*.md`

Se encontrar arquivos claramente relevantes para o squad atual:
1. Leia primeiro o `implementation-plan` quando existir
2. Depois leia `requirements`, `architecture` e `prd` relevantes
3. Extraia: domain, goal, output type, constraints, expected behaviors, risks e sinais de done
4. Registre os caminhos consumidos em `sourceDocs`
5. NÃO repita perguntas cujas respostas já estão explícitas nesses artifacts
6. Se houver mais de um conjunto possível de artifacts, faça uma única pergunta curta de desambiguação

**0B — Artisan input**

Se o usuário forneceu `--from-artisan <id>`:
1. Procure `.aioson/squads/.artisan/<id>.md`
2. Se encontrar, leia o Squad PRD
3. Extraia: domain, goal, mode, executors propostos, skills, constraints, content blueprints
4. Use como base para o blueprint — pule para o Passo 5 (calcular readiness)
5. Mostre ao usuário: "Li o PRD do Artisan. Posso gerar o blueprint com base nele — quer ajustar algo?"

**0C — Templates**
Verifique se existe `.aioson/templates/squads/`. Se existir, liste os templates disponíveis e pergunte:
"Quer partir de um template? Opções: content-basic, research-analysis, software-delivery, media-channel — ou começar do zero."
Se o usuário escolher um template, leia o `template.json` e use como base para o blueprint (executores, content blueprints, mode).

### Passo 1 — Coletar contexto mínimo
Pergunte em um bloco só (não faça múltiplas rodadas):
1. Domínio ou tópico do squad
2. Problema principal ou objetivo
3. Tipo de output esperado (artigos, scripts, código, análise, etc.)
4. Constraints (audiência, tom, nível técnico, idioma)
5. (opcional) Roles específicos desejados

Se o usuário já forneceu contexto suficiente (texto, docs, imagens), infira as respostas e siga em frente. Pergunte somente se há lacunas materiais.

### Passo 1.5 — Gate de classificação de domínio + locale scope

Antes de definir executores, classifique o domínio usando `.aioson/docs/squad/domain-classification.md`:

- **Tier 1 — regulado:** investigação via `@squad investigate` / `@orache` é obrigatória. Não finalize o blueprint sem relatório.
- **Tier 2 — especializado:** recomende fortemente investigação. Se o usuário recusar, registre a limitação em `assumptions` e `risks`.
- **Tier 3 — comum:** prossiga sem criar fricção desnecessária.

Se já existir investigação relevante, reutilize o relatório em vez de pedir uma nova.

Depois da classificação:
- decida `locale_scope` com base em `.aioson/rules/agent-language-policy.md` quando a rule existir
- sugira `universal` por padrão
- se o squad for claramente local, confirme um locale específico (`pt-BR`, `es-MX`, etc.) e registre `locale_rationale`
- capture no blueprint:
  - `domainClassification.tier`
  - `domainClassification.rationale`
  - `domainClassification.regulations` quando existirem
  - `domainClassification.investigationPolicy`
  - `locale_scope`
  - `locale_rationale` quando aplicável

### Passo 2 — Derivar design-doc mental
Antes de definir executores, consolide:
- Problema que está sendo resolvido
- Objetivo prático do squad
- Scope e out-of-scope
- Risks e assumptions
- Skills e docs que precisam entrar no contexto
- Mode do squad (content | software | research | mixed)
- Source docs consumidos
- Investigation aplicada e o que ela muda no design
- Locale scope do squad

### Passo 2.5 — Decomposição de domínio das fontes
Se há `sourceDocs`, `investigation` ou contexto de domínio colado, **derive o roster das fontes — não chute "3-5 roles"**. Rode as quatro passadas de extração e a derivação descritas em `.aioson/docs/squad/creation-flow.md` § "Domain decomposition":
- `entities` — substantivos/conceitos centrais do domínio
- `workflows` — unidades de trabalho como `verbo + objeto` (o que é *feito* com as entidades)
- `integrations` — sistemas/canais/fontes externas que o trabalho toca
- `stakeholders` — papéis/personas que o squad serve ou encarna

Registre tudo no blueprint em `analysis`. Sem fontes: pule esta passada e defina o roster pelo objetivo declarado (marque os executores com `confidence` mais baixo).

### Passo 3 — Definir executores (derivados da decomposição)
Agrupe os `workflows` em **modos de trabalho distintos** (originar / transformar / julgar / orquestrar — adapte ao domínio); cada modo que as fontes realmente exigem vira um executor. O cluster, não o título, define o papel. Funda clusters com sobreposição pesada. Para cada executor, defina:
- slug (kebab-case)
- title
- role (uma frase)
- focus (3-5 bullets)
- `traces` — quais `workflows`/`entities` este executor possui (executor que não rastreia nenhum workflow é cerimônia — corte)
- `confidence` (0-1) — quão bem as fontes justificam este papel; baixo = investigar ou cortar, nunca preencher com enchimento
- skills que vai usar
- genomes que herda

Inclua sempre um `orquestrador`. Mantenha 3-5 (a decomposição diz quantos o trabalho real exige — não infle para parecer completo).

### Passo 3.5 — Detectar e capturar UI/UX capability

Após definir executores, verifique se o squad produz output visual.

**Triggers que ativam esta detecção:**
- Output type contém: site, landing page, sales page, event page, dashboard, web app, HTML, layout, screens, interface, UI, UX
- Domain contém: marketing, agência, design, produto digital, e-commerce, funil, conversão, branding
- Goal contém: "criar página", "build a site", "fazer dashboard", "design interface", "páginas para clientes"

**Se detectado, pergunte:**
> "Este squad vai produzir output visual. Como quer incluir UI/UX?
>
> (1) Skills — instala `landing-page-forge` + `ui-ux-modern` como skills do squad (leve, executores referenciam)
> (2) Executor — adiciona `@ui-specialist` ao squad (autônomo, produz ui-spec + HTML)
> (3) Externo — sem UI no squad, chama `@ux-ui` separadamente
> (4) Pular"

**Se não detectado:** prosseguir sem UI capability (equivalente à opção 4).

**Capture a decisão no blueprint** como `uiCapability`:
```json
"uiCapability": {
  "mode": "skills | executor | external | none",
  "skills": ["landing-page-forge", "ui-ux-modern"],
  "executor": "ui-specialist | null"
}
```

Se `mode = executor`, adicione `ui-specialist` à lista de executores do blueprint antes de continuar.

### Passo 4 — Definir content blueprints
Se o squad é content-oriented, defina pelo menos 1 content blueprint com:
- slug, contentType, layoutType
- sections com key, label, blockTypes

### Passo 5 — Calcular readiness
Avalie cada dimensão:
- contextReady: há contexto suficiente?
- blueprintReady: o blueprint está completo?
- generationReady: dá para gerar os executores?
- se `domainClassification.tier = tier-1-regulated`: generationReady = false enquanto não houver `investigation`

### Passo 6 — Gerar blueprint JSON
Salve o blueprint em `.aioson/squads/.designs/<slug>.blueprint.json`

O JSON deve seguir o schema `squad-blueprint.schema.json`.

Gere um UUID para o campo `id`. Use `new Date().toISOString()` para `createdAt`.

Quando houve decomposição (Passo 2.5), persista: `analysis` (`entities`, `workflows`, `integrations`, `stakeholders`), `confidence` + `traces` por executor, e `confidence` geral (média dos executores). Estes campos alimentam o self-review e o readiness.

### Passo 6.5 — Squad Spec Self-Review

Antes de apresentar ao usuário, revisar o blueprint como se fosse outro agente lendo pela primeira vez:

**Verificar completude:**
- [ ] Cada executor tem role único e não sobrepõe outro executor
- [ ] Cada executor tem focus com 3-5 bullets concretos (não vagos)
- [ ] Sem "TBD", "a definir", "conforme necessário" em nenhum campo
- [ ] Mission do squad é uma frase que explica o que faz E para quem

**Verificar consistência:**
- [ ] Sem contradições: tom/audiência do squad vs tone de cada executor
- [ ] Se mode=content: content blueprints cobrem os outputs esperados
- [ ] Se mode=software: executores cobrem as fases de desenvolvimento necessárias
- [ ] Squad não tem mais responsabilidades do que os executores conseguem cobrir

**Verificar scope:**
- [ ] O squad resolve o problema declarado pelo usuário — nem mais, nem menos
- [ ] Nenhum executor foi adicionado por "seria útil" sem relação com o objetivo
- [ ] Se user pediu N executores: verificar que não foram adicionados extras silenciosamente
- [ ] (Quando houve decomposição) Cada executor rastreia ≥1 `workflow`; nenhum executor órfão de workflow
- [ ] (Quando houve decomposição) Executores com `confidence` baixo foram investigados, fundidos ou cortados — não entregues como estão

**Calibração:** Só bloqueie se o problema causaria output fundamentalmente errado.
Preferências de estilo não bloqueiam. Lacunas de detalhe não bloqueiam.
Contradições de escopo e roles sem responsabilidade real = bloqueiam.

Se encontrar problemas: corrigir no blueprint antes de apresentar ao usuário.
Se tudo OK: prosseguir para Passo 7.

### Passo 7 — Apresentar resumo
Mostre ao usuário:
- Executores propostos com roles
- Decomposição das fontes: entities / workflows / stakeholders (quando houve)
- Content blueprints definidos
- Tier de domínio e política de investigação
- Locale scope
- Assumptions feitas
- Risks identificados
- Readiness status
- Confidence score

Pergunte se quer ajustar algo antes de criar.

## Saída
- Arquivo: `.aioson/squads/.designs/<slug>.blueprint.json`
- Resumo no chat para review do usuário

## Próximo passo
- Se aprovado: `@squad create <slug>` (que lê o blueprint e gera o pacote)
- Se precisa ajuste: o usuário indica e o design é atualizado

## Regras
- NÃO crie o pacote do squad aqui — isso é responsabilidade da task create
- NÃO pule o blueprint — ele é obrigatório
- MANTENHA o blueprint leve — o LLM preenche lacunas na fase create
- NÃO ignore `implementation-plan` / `requirements` relevantes quando existirem
- NÃO bypass o gate de domínio regulado
