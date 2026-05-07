# Agent Sharding

> Carrega apenas as seções relevantes de um arquivo de instruções de agente para uma tarefa específica, reduzindo consumo de tokens.

Arquivos de instrução de agente podem conter muitas seções — role, guidelines, error handling, output format, checklist de revisão — mas para uma tarefa específica, apenas algumas são necessárias. O `agent:load` divide o arquivo em shards semânticos por heading, indexa via FTS5 e carrega apenas os shards mais relevantes para o objetivo informado.

---

## Comandos

### `agent:shard:index`

Indexa os arquivos de instruções de agentes para permitir carregamento inteligente.

```bash
aioson agent:shard:index [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--agents-dir=<path>` | Diretório dos agentes (padrão: `.aioson/agents`) |
| `--force` | Reindexar mesmo se já indexado |
| `--json` | Retorna resultado em JSON |

**Exemplos:**

```bash
# Indexar todos os agentes do projeto
aioson agent:shard:index .

# Forçar reindexação após atualizar arquivos de agente
aioson agent:shard:index . --force

# Diretório customizado de agentes
aioson agent:shard:index . --agents-dir=.aioson/my-agents
```

---

### `agent:load`

Carrega os shards mais relevantes de um agente para um objetivo dado.

```bash
aioson agent:load <agent-id> [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--goal="..."` | Objetivo da tarefa (direciona a seleção de shards) |
| `--agents-dir=<path>` | Diretório dos agentes (padrão: `.aioson/agents`) |
| `--max-shards=<n>` | Máximo de shards a carregar (padrão: 3) |
| `--max-tokens=<n>` | Orçamento de tokens (padrão: 2000) |
| `--print` | Exibe o conteúdo completo dos shards selecionados |
| `--json` | Retorna shards e tokens em JSON |

**Exemplos:**

```bash
# Ver quais seções do agente dev são relevantes para a tarefa
aioson agent:load dev --goal="implementar endpoint de pagamento com TDD"

# Exibir o conteúdo para usar diretamente no prompt
aioson agent:load dev --goal="refatorar autenticação" --print

# Carregar mais shards se necessário
aioson agent:load dev --goal="..." --max-shards=5 --max-tokens=3000

# JSON para integração em scripts
aioson agent:load dev --goal="..." --json
```

**Saída:**

```
  Agent: dev  (3/8 shards, 420 tokens)

  ## Role  (85 tokens)
  ## Implementation Guidelines  (180 tokens)
  ## Error Handling  (155 tokens)
```

---

## Como funciona

**Divisão em shards:**
O arquivo de instruções é dividido por headings H2 (`##`) e H3 (`###`). Cada shard é uma seção com seu conteúdo. O bloco antes do primeiro heading vira o shard `(preamble)`.

**Indexação:**
Os shards são salvos como arquivos individuais em `~/.aioson/shards/` e indexados via FTS5 (o mesmo motor do `context:search`).

**Seleção:**
1. O shard `(preamble)` e os shards de `Role` são sempre incluídos
2. O FTS5 busca os shards mais relevantes para o `--goal`
3. Shards são adicionados até preencher o orçamento de tokens
4. Se ainda há espaço, shards restantes são adicionados em ordem

**Orçamento:**
O total de tokens dos shards selecionados fica dentro de `--max-tokens` (padrão 2000, estimado como chars/4).

---

## Exemplo de redução de contexto

Para um agente com 9 seções e 228 tokens totais:

```
Carregando para "implementar com TDD e error handling":
  Shards selecionados: 3 de 9
  Tokens usados: 73 de 228

  → Redução de 68% no consumo de tokens
```

---

## Onde ficam os índices

Os shards são indexados em `~/.aioson/shards/` — fora do repositório, não commitado. Use `--force` para atualizar após editar os arquivos de agente.

---

## Quando usar

- Quando um arquivo de instrução de agente tem muitas seções e você quer enviar ao LLM apenas o que é necessário para a tarefa atual
- Para reduzir tokens consumidos por instruções fixas do agente
- Para agentes que têm seções muito diferentes (implementação, revisão, documentação, deploy) e você quer carregar apenas o contexto certo para cada tarefa
