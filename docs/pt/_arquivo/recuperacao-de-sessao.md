# [Arquivado] Recuperação de Sessão

> **Esta doc foi substituída.**
> A receita completa de continuidade entre sessões (feature dossier, dev-resume, drift detection) está em [`../3-receitas/continuidade-entre-sessoes.md`](../3-receitas/continuidade-entre-sessoes.md).
> Referência técnica do agent-chain-continuity em `../5-referencia/agent-chain-continuity.md`.
> Conteúdo abaixo preservado para referência histórica.

---

# Recuperação de Sessão

> Gera e restaura contexto entre sessões do Claude Code sem perder estado após compactação.

Quando o LLM compacta o contexto durante uma sessão longa, o histórico de tarefas, objetivo e arquivos modificados se perde. O `recovery:generate` cria um arquivo markdown estruturado em `.aioson/context/recovery-context.md` que pode ser re-injetado no início da próxima sessão para restaurar exatamente onde você parou.

---

## Comandos

### `recovery:generate`

Gera o arquivo de recuperação para a sessão atual.

```bash
aioson recovery:generate [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--goal="..."` | Objetivo atual da sessão |
| `--agent="..."` | Agente ativo |
| `--json` | Retorna resultado em JSON |

**Exemplos:**

```bash
# Gerar recovery simples
aioson recovery:generate .

# Gerar com contexto da sessão
aioson recovery:generate . --goal="implementar busca FTS5" --agent="deyvin"

# Retornar JSON para scripts
aioson recovery:generate . --json
```

---

### `recovery:show`

Exibe o conteúdo do arquivo de recuperação existente.

```bash
aioson recovery:show [path]
```

**Exemplos:**

```bash
# Ver o recovery atual
aioson recovery:show .

# Saída em JSON
aioson recovery:show . --json
```

---

## O que o arquivo contém

O `recovery-context.md` é gerado automaticamente com:

- **Objetivo da sessão** — o que foi passado via `--goal`
- **Agente ativo** — o que foi passado via `--agent`
- **Tarefas recentes** — lista de tasks com status
- **Notas** — observações da sessão
- **Arquivos modificados** — `git diff --name-only HEAD`
- **Commits recentes** — últimos 10 commits do repositório

O arquivo é salvo em `.aioson/context/recovery-context.md`.

**Exemplo de arquivo gerado:**

```markdown
# Recovery Context — Direct Session
> Generated: 2026-03-30T06:00:00.000Z

## Current Goal
implementar busca FTS5 e cache de contexto

## Active Agent
deyvin

## Modified Files
- src/context-search.js
- src/context-cache.js
- tests/context-search.test.js

## Recent Commits
- a1b2c3d Adicionar IndexManager com FTS5
- d4e5f6g Implementar context cache RAM
```

---

## Orçamento de tokens

O arquivo é mantido abaixo de **2000 tokens** automaticamente. Se o conteúdo ultrapassar esse limite, os commits e eventos mais antigos são removidos — o objetivo, agente, arquivos modificados e tarefas são sempre preservados.

---

## Como usar após uma compactação

Quando o Claude compactar o contexto da sessão, basta re-injetar o arquivo:

```
Read .aioson/context/recovery-context.md and continue from where we left off.
```

Ou usar o `recovery:show` para copiar o conteúdo direto:

```bash
aioson recovery:show .
```

---

## Relação com squads

O `recovery:generate` é específico para **sessões diretas** (sem squad). Para squads, o AIOSON já gera recovery automaticamente via `squad:recovery` quando detecta queda de 30% no uso de contexto.

Para saber mais sobre recovery em squads, veja a documentação do [Squad Dashboard](./squad-dashboard.md).
