# O que é o Sub-task Scout

> O scout fecha o item explicitamente adiado na feature `deyvin-density` (2026-05-11). A rubrica do `@deyvin` na linha 111 dizia: "diagnóstico ambíguo; precisa de survey de >5 arquivos ou rastreamento de fluxo de runtime → Despachar sub-task scout (adiado para `deyvin-subtask-scout`; até então: parar e perguntar ao usuário)." Agora tem primitiva.

---

## O problema

Sem o scout, `@deyvin` tinha duas opções ruins quando uma pergunta precisava inspecionar muitos arquivos:

1. **Ler tudo inline** — queima ≥10k tokens no contexto pai, polui a memória de trabalho do agente e força o próximo turno a competir com conteúdo de survey obsoleto.
2. **Fazer handoff para `/aioson:agent:architect` ou pausar** — ultrapassa a necessidade real (a maioria dos surveys não precisa de decisões arquiteturais) e quebra o fluxo da conversa com uma troca completa de agente.

O scout resolve isso: o agente pai mantém o contexto limpo e recebe um relatório estruturado de ~500 tokens em vez dos arquivos brutos.

---

## Como funciona

### Ciclo de vida completo

```
@deyvin detecta rubrica linha 111
         │
         ▼
aioson scout:prep --question="..." --scope-paths="a.js,b.js" ...
  └─ valida inputs
  └─ checa caps (sessão, escopo)
  └─ gera prompt padronizado para o sub-agente
  └─ retorna { id, prompt, output_path, cap_remaining }
         │
         ▼
@deyvin chama harness.sub-agent(prompt)
  └─ sub-agente roda em contexto ISOLADO
  └─ ferramentas permitidas: [Read, Grep]
  └─ ferramentas proibidas: [Bash, Edit, Write]   ← Nautilus pattern
  └─ escreve JSON em output_path
         │
         ▼
aioson scout:validate --input=<output_path>
  └─ valida JSON contra OUTPUT_SCHEMA
  └─ PASS → continua
  └─ FAIL → incrementa retry; @deyvin re-prompta (máx 1 retry)
         │
         ▼
aioson scout:commit --input=<output_path>
  └─ persiste em .aioson/runtime/scouts/{id}.json
  └─ decrementa cap_remaining
  └─ emite telemetria action=committed
         │
         ▼
@deyvin lê findings, confidence, recommendation
  └─ dobra na resposta ao usuário
  └─ contexto pai cresceu ~500 tokens (só o relatório)
     em vez de ~10k+ (os arquivos inspecionados)
```

### O relatório (OutputSchema)

Campo | Tipo | O que é
`id` | string | Identificador único do scout (`scout-{slug}-{data}-{rand6}`)
`parent_agent` | string | Agente que despachou (`"deyvin"` em V1)
`parent_session_id` | string | ID da sessão pai (para rastreabilidade de caps)
`parent_session_excerpt` | string (50-1000 chars) | **Obrigatório.** Por que o scout foi despachado — essencial para cold-load por agentes futuros
`feature_slug` | string \| null | Feature em andamento, se houver
`question` | string | A pergunta original
`scope` | object | Arquivos e diretórios inspecionados
`findings[]` | array | Cada finding: `file`, `line`, `evidence` (max 200 chars), `relevance`, `explanation` (20-300 chars)
`confidence` | `"high" \| "medium" \| "low"` | Autoavaliação do sub-agente
`recommendation` | string (30-1000 chars) | O que o agente pai deve fazer a seguir
`files_inspected[]` | string[] | Lista de arquivos efetivamente lidos
`status` | `"success" \| "partial" \| "no_findings" \| "error"` | Estado final do scout
`completed_at` | ISO string | Timestamp de conclusão

---

## As 3 fases da feature

### Fase 1 — `core-engine`
Módulo puro `src/sub-task-engine.js`: template de prompt, validadores JSON hand-rolled (zero novas dependências), gerenciamento de estado de caps, lifecycle state. Sem I/O — só o que os comandos CLI invocam explicitamente.

### Fase 2 — `cli-verbs`
Três verbos CLI (`scout:prep`, `scout:validate`, `scout:commit`) + estado com file-lock em `src/sub-task-state.js`. Template de config `template/.aioson/config/scout-engine.json` (vazio `{}`; defaults ativos). Sandbox path check: `scope_paths` fora do root do projeto são rejeitados.

### Fase 3 — `wiring-and-lifecycle`
- `deyvin.md` (workspace + template byte-identical, 13611 bytes, abaixo do limite de 15360): nova seção "Sub-task scout invocation" com caminho CLI + fallback CLI-less por harness (Claude Code Agent tool, Codex MultiAgentV2, Gemini/OpenCode com mensagem `harness_unsupported`)
- `feature:close`: hook de arquivamento copia scouts com `feature_slug` correspondente para `.aioson/context/features/{slug}/scouts/`, appenda bullet no dossier
- `memory:summary`: linha "Scouts dispatched: N (top topics: ...)" sempre presente — visível em cold-load de agente
- `doctor`: check advisory `scouts_directory_pruning` (scouts órfãos >90d); `--fix` apaga; scouts com `feature_slug` **nunca** são podados

---

## Padrões de segurança

**Nautilus pattern** — ferramenta de whitelist no sub-agente:
- Permitido: `[Read, Grep]`
- Proibido: `[Bash, Edit, Write]`
- Aplicado via prompt template; harnesses que suportam configuração explícita de tools também recebem a whitelist como parâmetro

**Sandbox de path** — `scope_paths` fora do `rootDir` do projeto são rejeitados com `error.code = 'path_outside_root'`

**Cap discipline** — nenhum scout pode ultrapassar os limits configurados; exceder retorna exit 2 antes de despachar o sub-agente

**`parent_session_excerpt` obrigatório** — bloqueado em `scout:prep` se ausente. É o campo que garante que agentes futuros lendo o scout em cold-load consigam reconstruir a intenção sem histórico de conversa.

---

## Continue lendo

- [Como usar](./como-usar.md) — fluxos concretos passo a passo
- [Referência CLI](./comandos-cli.md) — flags completos
- [Diagramas](./diagramas.md) — fluxo visual
- [Troubleshooting](./troubleshooting.md) — problemas conhecidos
