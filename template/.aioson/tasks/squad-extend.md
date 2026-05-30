# Task: Squad Extend

> Adiciona componentes a um squad existente sem reescrever o pacote.

## Quando usar
- `@squad extend <slug>` — modo interativo
- `@squad extend <slug> --add executor --name <name>` — modo direto
- Após `@squad analyze` recomendar adições

## Entrada
- slug do squad existente
- tipo do componente: executor | skill | template | blueprint | genome | mcp
- detalhes do componente (nome, role, etc.)

## Processo

### Passo 1 — Ler estado atual
Leia squad.manifest.json e inventarie o que já existe.

### Passo 2 — Se modo interativo, perguntar o que adicionar
```
O que deseja adicionar ao squad "<slug>"?
1. Executor — Novo agente especialista
2. Skill — Nova capacidade reutilizável
3. Content Blueprint — Novo tipo de deliverable
4. Genome — Aplicar genome existente
5. MCP — Nova integração externa
```

### Passo 3 — Coletar detalhes do componente
Dependendo do tipo:
- **Executor:** slug, title, role, focus areas, skills. Gerar o arquivo .md.
- **Skill:** slug, title, description. Criar em squads/<slug>/skills/
- **Content Blueprint:** slug, contentType, layoutType, sections.
- **Genome:** slug do genome, scope (squad ou executor específico).
- **MCP:** slug, required, purpose.

### Passo 4 — Mostrar diff antes de persistir
Antes de salvar, mostre exatamente o que será alterado:
```
Changes to apply:

  NEW FILE: .aioson/squads/<slug>/agents/<executor>.md
  UPDATED: .aioson/squads/<slug>/squad.manifest.json
    + executors[]: { slug: "<executor>", role: "...", file: "..." }
  UPDATED: .aioson/squads/<slug>/agents/agents.md
    + @<executor> — <role>
  UPDATED: CLAUDE.md
    + /<executor> -> .aioson/squads/<slug>/agents/<executor>.md
  UPDATED: AGENTS.md
    + @<executor> -> .aioson/squads/<slug>/agents/<executor>.md

Proceed? [Y/n]
```

### Passo 5 — Persistir alterações
- Criar arquivo(s) novo(s)
- Atualizar squad.manifest.json
- Atualizar agents.md
- Atualizar CLAUDE.md e AGENTS.md (se executor)

### Passo 6 — Validar
Rodar mentalmente a task squad-validate para confirmar que o pacote está consistente.

## Regras
- SEMPRE mostrar diff antes de persistir
- NUNCA deletar componentes existentes — extend é somente aditivo
- Para remoção, oriente o usuário a editar manualmente ou usar repair (Fase 4)
- **Idempotência:** ao atualizar manifest/agents.md, só adicione a entrada se ela ainda não existe — nunca duplique
- **Não sobrescrever às cegas:** se o arquivo do componente já existe, pare e peça confirmação (ou exija `--force`); com `--force`, faça backup do arquivo antes de sobrescrever
- **Slug seguro:** rejeite nomes com `/`, `\`, `..` ou fora de kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) antes de criar qualquer arquivo
- **Preservar o existente:** ao tocar manifest/agents.md/CLAUDE.md/AGENTS.md, edite só a seção do novo componente; não reescreva nem reordene o resto
