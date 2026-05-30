# Task: Squad Analyze

> Diagnostica um squad existente: cobertura, redundâncias, gaps, oportunidades.

## Quando usar
- `@squad analyze <slug>`
- Quando o usuário quer melhorar um squad existente

## Entrada
- slug do squad existente

## Processo

### Passo 1 — Inventário de componentes
Leia o squad.manifest.json e o filesystem real. Monte um inventário:
- Executores: quantos, quais, com/sem skills, com/sem genomes
- Skills: declaradas vs. instaladas em skills/
- Content blueprints: quantos, com/sem sections
- Templates: existem em templates/?
- Docs: design-doc.md existe? readiness.md existe?
- Output: há sessões HTML geradas?

### Passo 2 — Métricas de cobertura
Calcule:
- % de executores com skills declaradas
- % de executores com genomes
- % de content blueprints com sections completas
- % de docs presentes (design-doc, readiness)
- Consistency score: manifest vs filesystem (arquivos referenciados que existem)
- **Profundidade** (a métrica que pega "squad básico"):
  - % de executores com bloco de profundidade no `## Quick context` (Variante A `persona + expertise` ou Variante B `operational_breadth` — ver `package-contract.md` § Executor depth block)
  - % de executores cujas fontes foram destiladas (vocabulário/frameworks reais no prompt, não genérico) quando o squad tem `sourceDocs`/`analysis`
  - % de executores que rastreiam ≥1 workflow (`analysis.workflows`/`traces`) quando houve decomposição

### Passo 3 — Diagnóstico de problemas
Identifique:
- Sobreposição de responsabilidades entre executores (roles muito parecidos)
- **Executor básico** (a falha de qualidade central): `role:` solto sem bloco de profundidade — sem `persona`+`expertise` (frameworks, vocabulary, signature_moves) nem `operational_breadth`. Um nome de papel com bullets genéricos é o sintoma.
- **Fontes não-destiladas**: o squad tem `sourceDocs`/`analysis` mas o vocabulário/frameworks delas não aparece em nenhum prompt de executor (fonte virou só metadado).
- **Executor órfão de workflow**: quando houve decomposição, executor que não rastreia nenhum `workflow` (cerimônia — corte ou justifique).
- Skills faltantes (executor sem nenhuma skill)
- Blueprints genéricos demais (sem sections ou com sections vazias)
- Readiness fraco (dimensões blocked ou partial)
- Excesso de complexidade (mais de 6 executores sem justificativa)
- Arquivos órfãos (existem no filesystem mas não no manifesto)
- Referências quebradas (no manifesto mas não no filesystem)

### Passo 4 — Sugestões priorizadas
Gere sugestões com prioridade (high/medium/low):
- high: referências quebradas, manifest inconsistente, executor sem role, **executor básico (sem bloco de profundidade)**, **fontes não-destiladas**
- medium: skills faltantes, blueprints incompletos, docs ausentes, executor órfão de workflow
- low: readiness parcial, genomes não aplicados, output vazio

Para cada sugestão dê o próximo comando concreto. Gaps de profundidade roteiam para `@squad refresh <slug>` (que aprofunda executores básicos, não só breadth customer-facing).

### Passo 5 — Relatório
Apresente com este formato:

```
═══ Squad Analysis: <slug> ═══

Overview
  Name: <name>  |  Mode: <mode>  |  Version: <version>

Components
  Executors:   <n> (<n> with skills, <n> with genomes)
  Skills:      <n> declared, <n> installed
  Blueprints:  <n> (<n> complete)
  Docs:        <status>

Coverage
  Depth:     ███░░░░░░░ 30%   (executores com bloco de profundidade)
  Skills:    ████░░░░░░ 40%
  Genomes:   ██████░░░░ 60%
  Docs:      ████████░░ 80%
  Manifest:  ██████████ 100%

Suggestions (<n>)
  🔴 <high priority item>
  🟡 <medium priority item>
  🟢 <low priority item>

Next: @squad refresh <slug> to deepen basic executors · @squad extend <slug> to add components
```

## Saída
- Relatório no chat
- Se --format markdown: salvar em .aioson/squads/<slug>/docs/ANALYSIS.md
- Se --format json: saída JSON parseable

## Regras
- NÃO modifique nada — apenas diagnostique e recomende
- SEMPRE sugira o próximo comando concreto para cada problema
