# compress:agents — Compressão de Agentes

`aioson compress:agents` reduz o tamanho dos arquivos de instrução dos agentes (`.aioson/agents/`) e opcionalmente das regras (`.aioson/rules/`), diminuindo o consumo de tokens por sessão sem alterar nenhuma regra ou lógica.

---

## Por que comprimir

Cada sessão de agente carrega os arquivos de instrução inteiros no contexto da IA. Arquivos maiores custam mais tokens — e os custos se multiplicam porque quase toda sessão carrega o mesmo conjunto de arquivos.

A compressão elimina:
- Seções explicativas que repetem o que as regras já dizem ("Por que isso importa")
- Frases introdutórias vazias ("É importante notar que...", "Vale ressaltar que...")
- Resumos finais que repetem o que foi escrito acima
- Parágrafos que explicam o óbvio a partir do contexto

O conteúdo técnico — tabelas, code blocks, comandos, paths, URLs, regras, constraints — permanece 100% intacto.

---

## Dois modos

| Modo | Flag | Como funciona | Custo |
|------|------|---------------|-------|
| **Estrutural** | *(padrão, sem flag)* | Remove padrões conhecidos de baixo valor por regex | Gratuito |
| **LLM** | `--llm` | Envia cada arquivo ao Claude para compressão semântica | Pago (API) |

Use o modo estrutural no dia a dia. Use `--llm` quando quiser o máximo de redução possível — especialmente em agentes novos ou gerados por squads que tendem a ser mais verbosos.

---

## Instalação e pré-requisitos

O comando está incluído no AIOSON a partir da versão **1.7.3**. Nenhuma dependência extra necessária para o modo estrutural.

Para o modo `--llm`, a variável de ambiente `ANTHROPIC_API_KEY` precisa estar definida no seu shell com a chave da API Anthropic.

---

## Referência completa

```
aioson compress:agents [path] [opções]
```

`path` é opcional — omitir usa o diretório atual.

### Opções

| Flag | Tipo | Descrição |
|------|------|-----------|
| `--agent=<nome>` | string | Comprime apenas o(s) agente(s) especificado(s). Aceita lista separada por vírgula. |
| `--rules` | boolean | Inclui `.aioson/rules/*.md` além dos agentes. |
| `--dry-run` | boolean | Mostra o que seria comprimido sem alterar nenhum arquivo. |
| `--llm` | boolean | Usa a API do Claude para compressão semântica. Requer `ANTHROPIC_API_KEY`. |
| `--model=<alias>` | string | Modelo para o modo `--llm`. Valores: `haiku` (padrão), `sonnet`, `opus`. |
| `--restore` | boolean | Restaura todos os agentes a partir dos backups `.original.md`. |
| `--stats` | boolean | Exibe estatísticas de tamanho sem alterar arquivos. |

---

## Exemplos práticos

### 1. Preview — ver o que seria comprimido sem alterar nada

```bash
aioson compress:agents . --dry-run
```

Saída esperada:
```
Preview — mode: structural

Agents:
  ~ dev.md: 14.5KB → 9.2KB  (−37%)
  ~ analyst.md: 14.2KB → 9.8KB  (−31%)
  ~ setup.md: 19.4KB → 11.3KB  (−42%)
  · committer.md: 8.6KB — already compact, skipped

─────────────────────────────────────
Files processed : 29
Compressed      : 3
Total saved     : 18.2 KB
```

---

### 2. Comprimir todos os agentes (modo estrutural)

```bash
aioson compress:agents .
```

Saída esperada:
```
Compress — mode: structural

Agents:
  ✓ dev.md: 14.5KB → 9.2KB  (−37%) ← backup saved
  ✓ analyst.md: 14.2KB → 9.8KB  (−31%) ← backup saved
  ✓ setup.md: 19.4KB → 11.3KB  (−42%) ← backup saved
  · committer.md: 8.6KB — already compact, skipped

─────────────────────────────────────
Files processed : 29
Compressed      : 3
Total saved     : 18.2 KB

Backups: <agent>.original.md
Restore: aioson compress:agents . --restore
```

O arquivo original é salvo automaticamente como `dev.original.md` antes de qualquer alteração.

---

### 3. Comprimir apenas agentes específicos

```bash
# Um agente
aioson compress:agents . --agent=dev

# Múltiplos agentes
aioson compress:agents . --agent=dev,analyst,product

# Preview dos mesmos
aioson compress:agents . --agent=dev,analyst,product --dry-run
```

---

### 4. Comprimir agentes + regras

```bash
aioson compress:agents . --rules
```

Útil logo após instalar o AIOSON em um projeto — comprime tanto os agentes quanto os arquivos em `.aioson/rules/` de uma só vez.

---

### 5. Compressão semântica via LLM (máxima redução)

```bash
# Com Haiku — barato, rápido (padrão)
aioson compress:agents . --llm

# Com Sonnet — melhor qualidade de compressão
aioson compress:agents . --llm --model=sonnet

# Preview antes de gastar créditos
aioson compress:agents . --llm --dry-run
```

O modo `--llm` é mais agressivo: além dos padrões estruturais, reescreve parágrafos inteiros para a menor forma que preserva o significado completo. Recomendado para agentes grandes (> 10KB) onde o modo estrutural já não encontra mais ganhos.

**Custo estimado por arquivo com Haiku:**
| Tamanho | Tokens de entrada | Custo aprox. |
|---------|-----------------|-------------|
| 5 KB | ~1.300 tokens | < $0.001 |
| 15 KB | ~3.800 tokens | ~$0.001 |
| 65 KB | ~16.000 tokens | ~$0.004 |

---

### 6. Comprimir um agente de squad gerado automaticamente

Agentes gerados pelo comando `aioson squad:agent-create` tendem a ser mais verbosos. Para comprimi-los:

```bash
# Os agentes de squad ficam em .aioson/squads/<slug>/agents/
# Use o caminho do projeto como base
aioson compress:agents . --agent=atendente-farmacia --dry-run
```

> **Nota:** No momento o comando aponta para `.aioson/agents/`. Para squads em `.aioson/squads/`, use `--llm` com o arquivo diretamente ou comprima manualmente o `.md` do agente.

---

### 7. Restaurar a versão original

```bash
# Restaurar todos
aioson compress:agents . --restore

# Restaurar apenas um agente
aioson compress:agents . --restore --agent=dev
```

O restore lê o arquivo `.original.md`, sobrescreve o comprimido e remove o backup:

```
  Restored: dev.md
  Restored: analyst.md

Restored 2 file(s). Backup files removed.
```

---

### 8. Ver estatísticas sem alterar arquivos

```bash
aioson compress:agents . --stats
```

Equivalente ao `--dry-run` mas semântica mais clara quando o objetivo é apenas monitorar o tamanho dos agentes.

---

## Como funciona o modo estrutural

O modo estrutural processa cada arquivo em três etapas, protegendo o conteúdo técnico:

**1. Proteção de blocos imutáveis**

Antes de qualquer transformação, os seguintes elementos são extraídos e preservados intactos:
- Frontmatter YAML (`---` ... `---`)
- Code blocks (` ``` ` ... ` ``` `)
- Tabelas markdown (`| ... |`)
- Inline code (`` ` `` ... `` ` ``)
- URLs e paths

**2. Remoção de seções de baixo valor**

Seções cujo header corresponde a um dos padrões abaixo são removidas por completo (header + conteúdo):

| Header removido |
|-----------------|
| `## Por que isso importa` |
| `## Por que isso é importante` |
| `## Why this matters` |
| `## Why this is important` |
| `## Rationale` |

Essas seções são removidas apenas quando o header corresponde exatamente — seções com conteúdo técnico único (listas, tabelas, exemplos) não são afetadas mesmo com nome similar.

**3. Remoção de filler em linhas de prosa**

Frases introdutórias sem valor informativo são removidas do início das linhas:

| Padrão removido |
|-----------------|
| `É importante notar que` |
| `Vale ressaltar que` |
| `Deve-se observar que` |
| `It is important to note that` |
| `Note that` / `Please note that` |
| `Keep in mind that` |
| `As mentioned earlier` |
| `Observe que` |

Trailers ao fim de frases também são eliminados: `— o que garante...`, `— isso é fundamental porque...`, `como mencionado anteriormente`.

---

## Como funciona o modo LLM

O modo `--llm` usa a [API Messages da Anthropic](https://docs.anthropic.com/en/api/messages) via `fetch` nativo (sem dependência extra no projeto). O prompt de sistema instrui o modelo a:

- Preservar todo o conteúdo técnico (code blocks, tabelas, comandos, regras, constraints)
- Remover redundância semântica — parágrafos que repetem o que já está acima
- Comprimir explicações de múltiplos parágrafos para 1–2 frases densas
- Não alterar frontmatter, paths, URLs

O arquivo original é salvo como `.original.md` antes de qualquer escrita.

---

## Backup e segurança

Toda compressão (estrutural ou LLM) gera um backup automático na primeira execução:

```
.aioson/agents/
├── dev.md              ← arquivo comprimido (ativo)
└── dev.original.md     ← backup original (para edição humana)
```

Se você editar o arquivo original e quiser recomprimi-lo, delete o `.original.md` antes — o comando não sobrescreve backups existentes para não perder alterações manuais.

Para restaurar: `aioson compress:agents . --restore`

---

## Dúvidas frequentes

**Os agentes funcionam igual após a compressão?**
Sim. O modelo lê prose comprimida tão bem quanto prose longa — pesquisa do projeto Caveman mostra que brevidade pode até aumentar precisão em certos benchmarks. Nenhuma regra, instrução ou constraint é removida.

**Quais arquivos são comprimidos?**
Por padrão, apenas `.aioson/agents/*.md`. Com `--rules`, inclui `.aioson/rules/*.md`. Arquivos `.original.md` são sempre ignorados.

**O que acontece se eu rodar duas vezes?**
Na segunda execução, o arquivo já estará comprimido e o comando reportará "already compact, skipped". O backup `.original.md` não é sobrescrito.

**Posso comprimir um único agente sem afetar os outros?**
Sim: `aioson compress:agents . --agent=dev`

**O modo `--llm` respeita o contexto do projeto?**
O prompt de sistema foca em preservar conteúdo técnico universalmente — não lê o `project.context.md`. Para compressão consciente do projeto, use o modo estrutural (que é determinístico) e aplique `--llm` pontualmente nos agentes maiores.

**Como integrar na atualização do framework?**
Após `aioson update`, rode `aioson compress:agents . --dry-run` para ver se novos agentes ou regras têm ganho potencial. Execute sem `--dry-run` para aplicar.
