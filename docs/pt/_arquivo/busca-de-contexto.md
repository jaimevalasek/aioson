# [Arquivado] Busca de Contexto

> **Esta doc foi consolidada em [`5-referencia/memoria-e-contexto.md`](../5-referencia/memoria-e-contexto.md)**.
> Conteúdo abaixo preservado para referência histórica.

---

# Busca de Contexto

> Indexa e busca documentos do projeto via FTS5 (full-text search) com ranking automático por relevância e recência.

O `context:search` constrói um índice SQLite FTS5 dos arquivos do projeto e permite buscas em linguagem natural que retornam os documentos mais relevantes — ordenados por BM25 e com reranking por data de modificação. Integra com o `context:pack` para montar pacotes de contexto mais precisos.

---

## Comandos

### `context:search:index`

Indexa os arquivos do diretório para permitir buscas futuras.

```bash
aioson context:search:index [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--force` | Reindexar arquivos já indexados |
| `--json` | Retorna resultado em JSON |

**Exemplos:**

```bash
# Indexar o projeto atual
aioson context:search:index .

# Forçar reindexação completa
aioson context:search:index . --force
```

---

### `context:search`

Busca documentos relevantes no índice.

```bash
aioson context:search <query> [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--limit=N` | Máximo de resultados (padrão: 10) |
| `--cwd=<path>` | Diretório do projeto |
| `--json` | Retorna resultados em JSON |

**Exemplos:**

```bash
# Busca simples
aioson context:search "autenticação JWT"

# Limitar resultados
aioson context:search "configuração de banco de dados" --limit=5

# JSON para uso em scripts
aioson context:search "endpoint de pagamento" --json
```

**Saída:**

```
  Search results for: "autenticação JWT"

  1. Arquitetura de Segurança
     .aioson/context/architecture.md
     ...sistema usa [JWT] com expiração de 24h, [autenticação] via Bearer token...

  2. Especificação de API
     .aioson/context/spec.md
     ...endpoints protegidos exigem header [Authorization: Bearer <token>]...
```

---

## Como funciona

**Indexação:**
- Varre `.md`, `.txt` e `.json` recursivamente
- Ignora `node_modules` e pastas ocultas
- Salva em `~/.aioson/search/context-search.sqlite` com WAL mode
- Arquivos já indexados são pulados (use `--force` para atualizar)

**Ranking:**
- BM25 built-in do FTS5 (penaliza spam, recompensa termos raros)
- Bônus de recência: arquivos modificados há menos tempo têm score ligeiramente maior
- Decay de 30 dias: após um mês, o bônus de recência se dissipa

**Concorrência:**
- WAL mode habilitado — múltiplas instâncias podem ler simultaneamente

---

## Invalidação automática

Entradas com mais de 24 horas são consideradas obsoletas e removidas automaticamente na próxima indexação. Para forçar atualização antes disso, use `--force`.

---

## Quando usar

- Antes de montar um `context:pack` para uma tarefa específica
- Quando o projeto tem muitos arquivos e você quer encontrar qual documento tem o contexto certo
- Em scripts que precisam descobrir automaticamente documentação relevante para uma tarefa

---

## JSON output

```json
{
  "ok": true,
  "results": [
    {
      "relPath": ".aioson/context/architecture.md",
      "title": "Arquitetura de Segurança",
      "snippet": "...sistema usa [JWT] com expiração...",
      "score": 3.42
    }
  ]
}
```
