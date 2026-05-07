# Runner System

> Subsistema de execução persistente para tarefas fora do loop principal de sessão. Introduzido na v1.7.0+.

## Quando usar

O runner é útil quando você precisa:
- Executar tarefas em **background** sem bloquear a sessão atual
- Processar **filas de trabalho** com prioridade
- Manter um **daemon 24/7** para workers automáticos
- Executar planos de implementação por **fase** de forma independente

## Comandos

| Comando | O que faz |
|---|---|
| `runner:run` | Executa uma tarefa ou worker diretamente |
| `runner:queue` | Enfileira tarefas com prioridade e agente designado |
| `runner:plan` | Gera ou inspeciona planos de execução do runner |
| `runner:daemon` | Inicia, para ou monitora o daemon de background |
| `runner:queue:from-plan` | Extrai fases de um plano `.md` e enfileira automaticamente |

## Ciclo de vida básico

### 1. Inicializar o runtime

O runner depende do banco SQLite de runtime:

```bash
aioson runtime:init .
```

### 2. Enfileirar tarefas manualmente

```bash
aioson runner:queue . \
  --task="implementar-checkout" \
  --agent=dev \
  --priority=1 \
  --input='{"feature":"checkout","phase":1}'
```

### 3. Executar uma tarefa diretamente

```bash
aioson runner:run . --task="implementar-checkout"
```

### 4. Usar um plano como fonte

```bash
# Gerar plano a partir de uma feature
aioson runner:plan . --feature=checkout --generate

# Enfileirar todas as fases do plano
aioson runner:queue:from-plan . --feature=checkout --agent=dev
```

### 5. Daemon para execução contínua

```bash
# Iniciar daemon
aioson runner:daemon . --sub=start

# Ver status
aioson runner:daemon . --sub=status

# Parar
aioson runner:daemon . --sub=stop
```

## Estrutura interna

O runner é composto por 4 módulos principais em `src/runner/`:

| Módulo | Responsabilidade |
|---|---|
| `queue-store.js` | Persistência da fila no SQLite |
| `plan-importer.js` | Parsing de planos Markdown em tarefas enfileiráveis |
| `cascade.js` | Lógica de execução sequencial/paralela e retry |
| `cli-launcher.js` | Interface entre CLI e o motor do runner |

## Integração com squads

Squads podem usar o runner para executar workers não-LLM em background:

```bash
# Enfileirar worker de uma squad
aioson runner:queue . \
  --squad=marketing \
  --worker=gerar-post \
  --input='{"tema":"IA no marketing"}'
```

## Diferença entre runner e squad:daemon

| | Runner | Squad Daemon |
|---|---|---|
| **Escopo** | Tarefas genéricas do projeto | Workers específicos de uma squad |
| **Trigger** | Manual, plano ou fila | Cron, webhook ou evento |
| **Persistência** | SQLite do runtime | SQLite do runtime + bus JSONL |
| **Uso típico** | Execução por fase de plano | Workers 24/7 (WhatsApp, notificações) |

## Troubleshooting

**Erro: "Runtime not initialized"**
→ Rode `aioson runtime:init .` antes de qualquer comando do runner.

**Erro: "No tasks in queue"**
→ Verifique se as tarefas foram enfileiradas corretamente com `runner:queue` ou `runner:queue:from-plan`.

**Daemon não inicia**
→ Verifique permissões de escrita no diretório do projeto e se a porta padrão está livre.
