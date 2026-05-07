# [Arquivado] Cache de Contexto

> **Esta doc foi consolidada em [`5-referencia/memoria-e-contexto.md`](../5-referencia/memoria-e-contexto.md)**.
> Conteúdo abaixo preservado para referência histórica.

---

# Cache de Contexto

> Salva snapshots de contexto em arquivos temporários locais e restaura quando necessário.

O `context:cache` guarda o conteúdo de sessão em `~/.aioson/temp/` com limpeza automática após 24 horas. Útil para preservar o estado de uma sessão antes de trocar de agente, de branch ou de computador — e restaurar depois sem precisar regenerar tudo do zero.

---

## Comandos

### `context:cache`

Lista as sessões em cache, ordenadas da mais recente para a mais antiga.

```bash
aioson context:cache [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--json` | Retorna lista em JSON |

**Exemplo:**

```bash
aioson context:cache
```

**Saída:**

```
  Cached Context Sessions

  a3f8c2d1  2026-03-30T14:00  2KB — implementar autenticação JWT
  b9e1f4a2  2026-03-30T10:30  8KB — refatorar módulo de pagamento
  c7d2e5b3  2026-03-29T22:15  5KB — review de PRs pendentes
```

---

### `context:cache:save`

Salva um snapshot de contexto na sessão de cache.

```bash
aioson context:cache:save [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--content="..."` | Conteúdo markdown a salvar (obrigatório) |
| `--goal="..."` | Objetivo da sessão (para identificar) |
| `--agent="..."` | Agente ativo |
| `--json` | Retorna ID e caminho em JSON |

**Exemplos:**

```bash
# Salvar conteúdo de contexto atual
aioson context:cache:save . --content="$(cat .aioson/context/recovery-context.md)" --goal="implementar JWT"

# Com agente
aioson context:cache:save . --content="..." --goal="refatorar pagamento" --agent="dev"
```

---

### `context:cache:restore`

Restaura o conteúdo de uma sessão em cache.

```bash
aioson context:cache:restore [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--session=<id>` | ID da sessão a restaurar (obrigatório) |
| `--query=<texto>` | Filtrar apenas linhas que contêm o texto |
| `--json` | Retorna conteúdo em JSON |

**Exemplos:**

```bash
# Restaurar sessão completa
aioson context:cache:restore --session=a3f8c2d1

# Restaurar apenas as linhas com "JWT"
aioson context:cache:restore --session=a3f8c2d1 --query="JWT"
```

---

### `context:cache:cleanup`

Remove sessões expiradas.

```bash
aioson context:cache:cleanup [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--max-age=<horas>` | Remover sessões com mais de N horas (padrão: 24) |
| `--json` | Retorna quantidade removida em JSON |

**Exemplos:**

```bash
# Remover sessões com mais de 24h (padrão)
aioson context:cache:cleanup

# Manter apenas sessões das últimas 6 horas
aioson context:cache:cleanup --max-age=6
```

---

## Onde fica o cache

As sessões são salvas em `~/.aioson/temp/` — fora do repositório, nunca commitadas. Cada sessão tem um diretório próprio com:

```
~/.aioson/temp/
  a3f8c2d1/
    context.md       # conteúdo salvo
  sessions.json      # índice com metadados de todas as sessões
```

---

## Restauração parcial com `--query`

O `--query` filtra o conteúdo restaurado linha a linha, retornando apenas as linhas que contêm o texto buscado. Útil quando você quer extrair apenas a parte relevante de um contexto grande.

```bash
# Pegar só as linhas sobre banco de dados de uma sessão
aioson context:cache:restore --session=a3f8c2d1 --query="database"
```

---

## Quando usar

- Antes de trocar de branch ou reiniciar o cliente de IA
- Para preservar o estado de uma sessão longa antes de um `context:pack` novo
- Para compartilhar contexto entre dois agentes diferentes sem reescrever tudo
- Como fallback quando o `recovery:generate` não tem git disponível
