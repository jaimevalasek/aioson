# Genome Distribution — Modelo de Distribuição via aioson.com

> Versão: 1.0
> Status: Spec
> Data: 2026-04-07
> Substitui: referências a makopy.com (descontinuado)

---

## Visão geral

Genomes podem ser criados por usuários localmente, publicados no registry do **aioson.com** e instalados em projetos de terceiros via CLI.

---

## Tiers de genome

| Tier | Origem | Curadoria | Disponível em |
|---|---|---|---|
| `aioson-core` | Equipe AIOSON | Revisão manual | Template + aioson.com |
| `community` | Usuários publicados | Score por downloads/rating | aioson.com |
| `local` | Usuário, não publicado | Nenhuma | Só no projeto |

Genomes `aioson-core` chegam pré-instalados no `template/.aioson/genomes/`.
Genomes `community` precisam ser instalados via `aioson genome:install`.

---

## Formato de arquivo — decisão de estrutura

### Decisão: genome permanece arquivo `.md` monolítico

Razões:
- O genome é **camada cognitiva** (injetada em contexto de LLM), não playbook operacional
- Material de referência profundo vive em skills — o genome referencia skills, não as duplica
- Arquivo único facilita install, diff, versionamento e injeção em contexto
- Genome denso é preferível a genome fragmentado: a pesquisa de 2026 confirma que structured prompts superam narrativas dispersas

### Exceção: companion dir opcional para genomes ricos

Quando um genome precisar de material de evidência ou referência própria (não reutilizável por skills), pode ter um diretório companion:

```
.aioson/genomes/
  copywriting.md            ← genome principal (sempre presente)
  copywriting.meta.json     ← metadata (sempre presente)
  copywriting.refs/         ← companion dir (opcional)
    evidence-appendix.md
    trait-examples.md
```

O sistema lê o companion dir automaticamente quando presente, mas não o requer.

### Genomes persona (3.0)

Para genomes com `type: persona` ou `type: hybrid`, o pipeline Profiler já produz arquivos separados em:

```
.aioson/profiler-reports/{slug}/
  research-report.md
  enriched-profile.md
```

Esses arquivos são a fonte de verdade para o genome. Não precisam ir para o companion dir.

---

## Dependências declaradas no `.meta.json`

Genomes podem declarar quais skills e outros genomes são necessários para funcionar corretamente. Isso evita que o usuário instale um genome e descubra na hora de usar que referências estão quebradas.

### Formato

```json
// .aioson/genomes/{slug}.meta.json
{
  "dependencies": {
    "skills": ["marketing", "storytelling"],
    "genomes": ["copywriting"]
  }
}
```

### Quando declarar

| Situação | Declarar |
|---|---|
| Genome referencia arquivos de uma skill específica (ex: `## Conditional reference loading`) | Sim — declare a skill |
| Genome persona pressupõe que outro genome de domínio está instalado | Sim — declare o genome |
| Genome não referencia nenhum arquivo externo | Não — deixar arrays vazios |

### Comportamento do sistema

**`aioson genome:doctor <file>`** — verifica se todas as dependências estão disponíveis no projeto:
```
skill "marketing": OK (.aioson/skills/marketing)
skill "storytelling": MISSING
→ Install: aioson skill:install --slug=storytelling
```

**`@genome` (agente) ao aplicar (Opção 4)** — checa dependências antes de vincular ao squad. Avisa se houver dependências ausentes e pergunta se deve prosseguir.

**`aioson genome:install` (futuro)** — ao instalar um genome do aioson.com, lê `dependencies` do meta e oferece instalar as dependências na mesma operação:
```
Genome "persona-copy" requires:
  skills: marketing, persuasion-psychology
  genomes: copywriting
Install dependencies too? [Y/n]
```

### Skills built-in vs. instaladas

O sistema considera uma skill disponível se ela existir em qualquer um destes caminhos:
- `.aioson/installed-skills/{slug}/` — skills instaladas via `skill:install`
- `.aioson/skills/{slug}/` — skills built-in do projeto (sem precisar instalar)

Genomes `aioson-core` como `copywriting` dependem da skill `marketing` que já vem built-in no template. Projetos que não usam o template precisam instalar essa skill separadamente.

---

## Fluxo de publicação (usuário → aioson.com)

### Pré-requisito

```bash
aioson config set AIOSON_TOKEN=<token>
# Token obtido em aioson.com/settings
```

### Publicar genome

Via agente `@genome`, opção [3] na etapa de resultado.

Ou via CLI (a implementar):

```bash
aioson genome:publish --slug=copywriting
```

O sistema envia `.md` + `.meta.json`. O companion dir `.refs/` é enviado se presente.

### Resultado após publicação

```
Genome publicado: aioson.com/genomes/copywriting
Instalar em outro projeto: aioson genome:install --slug=copywriting
```

---

## Fluxo de instalação (terceiro → projeto)

```bash
aioson genome:install --slug=copywriting
```

**Comportamento:**
1. Busca o genome no registry do aioson.com
2. Baixa `.md` + `.meta.json` para `.aioson/genomes/{slug}.md`
3. Baixa `.refs/` se presente
4. Registra em `.aioson/genomes/.installed.json` (source, slug, installedAt, version)
5. Confirma: `Genome "copywriting" instalado em .aioson/genomes/`

**Flags:**
- `--force` — sobrescreve se já existir
- `--dry-run` — mostra o que seria instalado sem salvar
- `--from=./path/genome.md` — instala de arquivo local

---

## Registro de genomes instalados

```json
// .aioson/genomes/.installed.json
[
  {
    "slug": "copywriting",
    "source": "community",
    "author": "jaimevalasek",
    "version": "1.2.0",
    "installedAt": "2026-04-07T14:00:00Z",
    "path": ".aioson/genomes/copywriting.md"
  }
]
```

---

## Comandos CLI (a implementar em /dev)

| Comando | Descrição |
|---|---|
| `aioson genome:install --slug=X` | Instala genome do aioson.com |
| `aioson genome:install --from=./path` | Instala de arquivo local |
| `aioson genome:publish --slug=X` | Publica genome no aioson.com |
| `aioson genome:list` | Lista genomes instalados no projeto |
| `aioson genome:remove --slug=X` | Remove genome do projeto |
| `aioson genome:doctor <file>` | Valida genome (já existe) |
| `aioson genome:migrate <file>` | Migra formato legado (já existe) |

---

## Relação com o sistema de skills

Genome e skill têm sistemas de install paralelos mas independentes:

| Aspecto | Skill | Genome |
|---|---|---|
| Install | `aioson skill:install` | `aioson genome:install` |
| Destino | `.aioson/installed-skills/{slug}/` | `.aioson/genomes/{slug}.md` |
| Estrutura | Diretório com `SKILL.md` + refs | Arquivo `.md` + `.meta.json` opcional |
| Distribuição npm | Via `@tech-leads-club/agent-skills` | Não (só aioson.com) |
| Distribuição cloud | Via `cloudBaseUrl` | Via aioson.com registry |

Um genome pode **referenciar** skills, mas não os empacota:

```markdown
## Conditional reference loading

| When writing... | Load these references |
|---|---|
| Any sales page | `.aioson/skills/marketing/references/patterns.md` |
```

---

## Notas de compatibilidade

- `MAKOPY_KEY` é descontinuado — usar `AIOSON_TOKEN`
- Projetos que tinham `MAKOPY_API_KEY` no `.aioson/install.json` devem migrar para `AIOSON_TOKEN`
- O `mcp-init.js` não inclui mais o servidor makopy
- Genomes gerados antes desta spec continuam funcionando sem mudanças
