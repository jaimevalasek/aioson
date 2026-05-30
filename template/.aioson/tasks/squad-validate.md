# Task: Squad Validate

> Fase de validação do lifecycle. Verifica consistência do pacote.

## Quando usar
- `@squad validate <slug>` — invocação direta
- Automaticamente após `@squad create`
- Quando o CLI `aioson squad:validate <slug>` é executado

## Entrada
- slug do squad (deve existir em `.aioson/squads/<slug>/`)

## Processo

### Camada 1 — Validação de schema
1. Leia `.aioson/squads/<slug>/squad.manifest.json`
2. Valide contra `.aioson/schemas/squad-manifest.schema.json`
3. Campos obrigatórios: schemaVersion, slug, name, mode, mission, goal
4. Se falhar: ERRO com campo faltante e sugestão

### Camada 2 — Validação estrutural
Verifique que existem:
- `.aioson/squads/<slug>/squad.manifest.json` (obrigatório)
- `.aioson/squads/<slug>/agents/agents.md` (obrigatório)
- `.aioson/squads/<slug>/agents/orquestrador.md` (obrigatório)
- Para cada executor em manifest.executors: o arquivo referenciado existe
- Diretórios: `output/<slug>/`, `aioson-logs/<slug>/`

### Camada 3 — Validação semântica (básica nesta fase, aprofundada na Fase 2)
- Slug do manifesto bate com o nome do diretório
- Executores no manifesto têm arquivo correspondente
- Não há executores duplicados
- **Profundidade do executor:** para cada executor `agent`/`clone`/`assistant`, o `.md` tem o bloco de profundidade no `## Quick context` (Variante A `persona`+`expertise` ou Variante B `operational_breadth` — ver `package-contract.md` § Executor depth block)? `role:` solto sem o bloco = ⚠️ WARNING (executor básico). Em `--strict`, vira ❌ ERROR.
- **Fontes destiladas:** se o manifest tem `sourceDocs`/`analysis`, ao menos um executor referencia o vocabulário/frameworks das fontes? Se nenhum referencia = ⚠️ WARNING (fontes viraram só metadado).

### Relatório
Classifique cada check como:
- ✅ PASS
- ⚠️ WARNING (não bloqueia, mas recomenda correção)
- ❌ ERROR (bloqueia — squad inválido)

Formato de output:
```
═══ Squad Validation: <slug> ═══

Schema:     ✅ PASS
Structure:  ✅ PASS (7/7 files found)
Depth:      ⚠️ 1 warning
  - executor "analyst": no depth block (basic executor) — run @squad refresh
Semantics:  ⚠️ 1 warning
  - executor "analyst" has no skills declared

Result: VALID (2 warnings)
```

## Saída
- Relatório de validação (console)
- Status: VALID | VALID_WITH_WARNINGS | INVALID

## Regras
- NÃO corrija problemas automaticamente — apenas reporte
- SUGIRA o comando de correção quando possível (ex: "run @squad extend to add skills")
- `--strict`: converte WARNINGs em ERRORs (inclui executor básico) — útil em CI / gate de entrega
- Gaps de profundidade (executor básico, fontes não-destiladas) roteiam para `@squad refresh <slug>`
- Este é o gate barato sempre-on (estrutura + presença do depth block). Para o veredito profundo source-grounded (rubrica das fontes + júri multi-modelo), use `@squad eval <slug>` (`.aioson/tasks/squad-eval.md`)
