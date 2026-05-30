# Task: Squad Create

> Fase de criação do lifecycle. Gera o pacote completo a partir de um blueprint.

## Quando usar
- `@squad create <slug>` — invocação direta
- Automaticamente após `@squad design` ser aprovado
- `@squad` fluxo rápido (após design inline ser aprovado)

## Entrada
- Blueprint em `.aioson/squads/.designs/<slug>.blueprint.json`
- Se não existe blueprint: instrua o usuário a rodar `@squad design <slug>` primeiro
- OU: se o usuário chamou `@squad` sem subcomando, rode design + create em sequência

## Processo

### Passo 1 — Ler blueprint
Leia `.aioson/squads/.designs/<slug>.blueprint.json` e valide que os campos obrigatórios existem (slug, name, problem, goal, mode, executors).
Se existirem, preserve também:
- `locale_scope`
- `locale_rationale`
- `domainClassification`
- `investigation`
- `sourceDocs`

### Passo 2 — Criar estrutura de diretórios
```
.aioson/squads/<slug>/
├── agents/
│   ├── agents.md              # Manifesto textual
│   ├── orquestrador.md        # Orquestrador
│   └── <executor-slug>.md     # Um por executor
├── skills/
├── templates/
├── docs/
│   ├── design-doc.md
│   └── readiness.md
└── squad.manifest.json        # Manifesto JSON formal

output/<slug>/                  # Diretório de output
aioson-logs/<slug>/               # Diretório de logs
media/<slug>/                   # Diretório de mídia
```

### Passo 2.5 — Processar UI/UX capability do blueprint

Leia o campo `uiCapability` do blueprint. Se ausente, trate como `mode: none`.

**Se `mode = skills`:**
1. Copie `.aioson/skills/static/landing-page-forge.md` → `.aioson/squads/{slug}/skills/design/landing-page-forge.md`
2. Copie `.aioson/skills/static/ui-ux-modern.md` → `.aioson/squads/{slug}/skills/design/ui-ux-modern.md`
3. Se `design_skill` está em `project.context.md`, copie também esse skill para `skills/design/`
4. Registre as skills no `squad.manifest.json`

**Se `mode = executor`:**
1. Execute os mesmos passos de skills acima (executor depende das skills)
2. Gere o arquivo `.aioson/squads/{slug}/agents/ui-specialist.md` seguindo `.aioson/docs/squad/package-contract.md`:
   - usar a mesma estrutura dos demais executores permanentes
   - missão focada em UI, layout, componentes e direção visual
   - output esperado: `ui-spec.md` e, quando fizer sentido, HTML/entregável visual
   - deixar explícito quando delegar contexto de negócio de volta ao `@orquestrador`
3. Registre o executor no `squad.manifest.json` com `modelTier: powerful` e `behavioralProfile: compliant-dominant`
4. Adicione ao routing guide do orquestrador: "Visual / UI / layout requests → @ui-specialist"

**Se `mode = external`:** Adicione nota em `docs/design-doc.md` indicando que `@ux-ui` é chamado externamente.

**Se `mode = none`:** Nenhuma ação.

Em todos os casos, salve `uiCapability` no `squad.manifest.json`.

### Passo 3 — Gerar squad.manifest.json
Monte o manifesto a partir do blueprint. O JSON deve seguir o schema `squad-manifest.schema.json`. Copie executors, skills, mcps, genomes, contentBlueprints do blueprint. Adicione package paths e rules.

Persistência obrigatória:
- `locale_scope`: usar `"universal"` por padrão quando o blueprint não trouxer valor explícito
- `locale_rationale`: copiar quando existir
- `domainClassification`: copiar quando existir
- `investigation`: copiar quando existir
- `sourceDocs`: copiar quando existir

### Passo 4 — Gerar agents.md (manifesto textual)
Siga `.aioson/docs/squad/package-contract.md` na seção `agents/agents.md`.

Regras adicionais para o manifesto textual:
- agrupe executores por tipo quando houver workers, clones, assistants ou human-gates
- se uma categoria não existir, omita a seção em vez de deixar placeholder
- reflita `locale_scope`, skills, MCPs e política de revisão quando isso mudar o comportamento real do squad

Formato mínimo:
```markdown
# Squad <name>

## Mission
[do blueprint.mission]

## Does
[derivado do scope]

## Does not do
[derivado do outOfScope]

## Permanent executors
- @orquestrador — [role]
- @<slug> — [role]

## Squad skills
## Squad MCPs
## Subagent policy
## Outputs and review
```

### Passo 5 — Gerar cada executor
Para cada executor no blueprint, crie `.aioson/squads/<slug>/agents/<executor-slug>.md` seguindo `.aioson/docs/squad/package-contract.md` na seção `Executor generation`:
- **Antes de escrever**, rode o *Pre-write depth gate* de `.aioson/docs/squad/creation-flow.md` para cada executor (persona, frameworks, vocabulário das fontes, signature_moves, anti-patterns). Gate vazio = não escreva ainda.
- Header com `# Agent @<slug>` + bloco ACTIVATED
- Mission, Quick context, Active genomes, Focus, Response standard, Hard constraints, Output contract
- **Bloco de profundidade obrigatório** no `## Quick context` (package-contract § `Executor depth block`): Variante A (persona + expertise: frameworks, vocabulary, signature_moves, quality_bar, anti_patterns) para executores de conhecimento/criativo/técnico; Variante B (operational_breadth) para executores customer-facing. Um `role:` solto sem bloco de profundidade = executor básico — não entregue assim.
- **Destilar fontes:** se o blueprint tem `sourceDocs` ou `investigation`, leia/reaproveite a extração e injete em cada executor relevante — vocabulário (termos de arte reais, não inventados), frameworks/métodos nomeados, exemplos e anti-patterns. Registre em `expertise.sources` qual fonte alimentou cada executor. Use `analysis.entities`/`analysis.workflows` e os `traces` do executor (decomposição do Passo 2.5) como sementes do `expertise.vocabulary` e dos `focus`. Fonte que ficou só no manifest e não entrou em nenhum prompt é defeito.
- Cada `anti_pattern` do bloco de profundidade vira uma linha real em `## Hard constraints`.
- Antes de passar para o próximo executor, aplique um teste: *um sênior real nesse papel se reconheceria neste prompt?* Se não, aprofunde antes de seguir.
- Se `locale_scope` for locale-specific, escreva o prompt no idioma do locale; identificadores de código continuam em inglês

### Passo 6 — Gerar orquestrador
Crie `.aioson/squads/<slug>/agents/orquestrador.md` seguindo `.aioson/docs/squad/package-contract.md` na seção `Orchestrator prompt`.
Se `uiCapability.mode = executor`, inclua no routing guide que demandas visuais vão para `@ui-specialist`.

### Passo 7 — Gerar docs
- `docs/design-doc.md`: resumo do design derivado do blueprint
- `docs/readiness.md`: estado de readiness derivado do blueprint

### Passo 8 — Registrar nos gateways
Atualize `CLAUDE.md` e `AGENTS.md` no root do projeto conforme `.aioson/docs/squad/package-contract.md` na seção `Gateway registration`.

### Passo 9 — Salvar metadata
Salve `.aioson/squads/<slug>/squad.md` conforme `.aioson/docs/squad/package-contract.md` na seção `Squad metadata`.
Inclua `locale_scope`, `locale_rationale`, `investigation` e `sourceDocs` quando existirem.

### Passo 10 — Rodar validate
Após criar tudo, execute mentalmente a task squad-validate (leia `.aioson/tasks/squad-validate.md`) para verificar que o pacote está consistente.

### Passo 11 — Warm-up round
Siga `.aioson/docs/squad/workflow-quality.md` na seção `Confirmation, coverage, and warm-up`: mostre cada especialista com problem reading, initial recommendation, main risk e suggested next step.

## Saída
- Pacote completo em `.aioson/squads/<slug>/`
- CLAUDE.md e AGENTS.md atualizados
- Warm-up round executado

## Regras
- SEMPRE leia o blueprint antes de gerar
- SIGA `.aioson/docs/squad/package-contract.md` e `.aioson/docs/squad/workflow-quality.md`
- MANTENHA o HTML deliverable após cada rodada (regra existente)
- NÃO pule o warm-up — é mandatório
