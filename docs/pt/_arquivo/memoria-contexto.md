# [Arquivado] Memória e Contexto

> **Esta doc foi consolidada em [`5-referencia/memoria-e-contexto.md`](../5-referencia/memoria-e-contexto.md)**.
> Conteúdo abaixo preservado para referência histórica.

---

# Memória e Contexto

> Guia prático para entender quais arquivos o AIOSON gera, qual é a função de cada um e como montar contexto mínimo para trabalhar melhor com LLMs e CLIs como Codex, Claude Code e OpenCode.

## Visão geral

O AIOSON separa contexto em camadas para evitar que você precise mandar o repositório inteiro para a IA em toda tarefa.

Pense assim:

- `scan:*` gera mapas e índices do código
- `discovery.md` e `skeleton-system.md` explicam o sistema existente
- `architecture.md` define a estrutura técnica alvo
- `spec.md` guarda a memória viva do desenvolvimento
- arquivos derivados, como `memory-index.md` e `spec-current.md`, ajudam a carregar só o que importa
- `context:pack` monta um pacote mínimo de leitura para uma tarefa específica

## Arquivos principais

| Arquivo | Papel |
|---|---|
| `.aioson/context/project.context.md` | Contexto base do projeto: stack, classificação, idioma, framework e premissas |
| `.aioson/context/discovery.md` | Memória de descoberta do sistema existente |
| `.aioson/context/skeleton-system.md` | Índice estrutural leve do sistema |
| `.aioson/context/architecture.md` | Decisões técnicas e estrutura de implementação |
| `.aioson/context/spec.md` | Memória viva de desenvolvimento; continua sendo a fonte principal |
| `.aioson/context/memory-index.md` | Índice de navegação: “leia este arquivo quando precisar de X” |
| `.aioson/context/spec-current.md` | Recorte derivado do `spec.md` com foco no estado atual |
| `.aioson/context/spec-history.md` | Recorte derivado do `spec.md` com foco no histórico |
| `.aioson/context/module-<pasta>.md` | Memória focada de um módulo ou pasta escaneada |
| `.aioson/context/context-pack.md` | Pacote mínimo para a tarefa atual |

## Arquivos de scan

Quando você roda `scan:project`, o AIOSON gera os mapas brutos do projeto:

- `.aioson/context/scan-index.md`
- `.aioson/context/scan-folders.md`
- `.aioson/context/scan-<pasta>.md`
- `.aioson/context/scan-aioson.md`

Esses arquivos são ótimos para brownfield porque mostram a estrutura real do código. Eles não substituem o `discovery.md`; eles servem de base para construí-lo.

## O que o scan gera hoje

### 1. Scan local

```bash
aioson scan:project . --folder=src,app
```

Esse modo gera:

- `scan-index.md`
- `scan-folders.md`
- `scan-src.md`, `scan-app.md`, etc.
- `scan-aioson.md`
- `memory-index.md`
- `module-src.md`, `module-app.md`, etc.

Se existir `spec.md`, ele também gera:

- `spec-current.md`
- `spec-history.md`

### 2. Scan com LLM

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai
```

Além dos arquivos acima, esse modo gera ou atualiza:

- `discovery.md`
- `skeleton-system.md`

Importante:

- `scan:project` nunca gera `architecture.md`
- `architecture.md` continua vindo depois com `@architect`

## Merge x rewrite

Quando `discovery.md` e `skeleton-system.md` já existem, o padrão agora é:

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai
```

Nesse caso, o comportamento é `merge`.

O que isso significa:

- o scanner lê a memória existente
- tenta preservar conhecimento estável e notas ainda válidas
- atualiza o que mudou no projeto
- cria backup automático em `.aioson/backups/` antes de sobrescrever

Se você quiser regenerar do zero:

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai --context-mode=rewrite
```

Use `rewrite` quando:

- a memória antiga está claramente errada
- o projeto mudou radicalmente
- você quer uma regeneração limpa

## O papel do `spec.md`

O `spec.md` continua sendo a memória viva principal do desenvolvimento.

Os derivados:

- `spec-current.md`
- `spec-history.md`

não substituem o `spec.md`. Eles existem para facilitar leitura seletiva.

Regra prática:

- quer a verdade completa do histórico e do plano? leia `spec.md`
- quer só o estado atual e o que está em andamento? leia `spec-current.md`
- quer decisões passadas, trabalho concluído e contexto histórico? leia `spec-history.md`

## O papel do `memory-index.md`

O `memory-index.md` é um roteador.

Ele existe para responder perguntas como:

- “qual arquivo devo ler primeiro?”
- “onde está o contexto de produto?”
- “onde está a memória de implementação?”
- “qual arquivo eu abro para um módulo específico?”

Em vez de mandar tudo para a LLM, você pode começar por ele e depois abrir apenas o que fizer sentido.

## O que é `context:pack`

`context:pack` é um montador de contexto mínimo.

Exemplo:

```bash
aioson context:pack . --agent=dev --goal="ajustar captions do editor do YouTube" --module=src
```

Ele gera:

- `.aioson/context/context-pack.md`

Esse arquivo contém:

- ordem de leitura recomendada
- lista dos arquivos escolhidos
- trechos embutidos dos arquivos mais relevantes

Na prática, ele tenta selecionar só o que a tarefa precisa, por exemplo:

- `project.context.md`
- `memory-index.md`
- `skeleton-system.md`
- `discovery.md`
- `spec-current.md`
- `architecture.md`
- `module-src.md`
- `scan-src.md`

## Fluxos práticos

### Brownfield sem API no AIOSON

```bash
aioson scan:project . --folder=src,app
aioson context:pack . --agent=analyst --goal="consolidar discovery brownfield" --module=src
```

Depois:

1. Abra Codex, Claude Code ou OpenCode.
2. Rode `@analyst`.
3. Use os arquivos de scan ou o `context-pack.md` para escrever `discovery.md`.
4. Depois passe para `@architect`.
5. Só então vá para `@dev`.

### Brownfield com API no AIOSON

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai
aioson context:pack . --agent=dev --goal="implementar ajuste no caption editor" --module=src
```

Depois:

1. Revise `discovery.md` com `@analyst` se necessário.
2. Gere `architecture.md` com `@architect`.
3. Monte um `context:pack` para a tarefa atual.
4. Trabalhe com `@dev`.

### Atualizar memória existente com segurança

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai
```

Esse comando:

- usa `merge` por padrão
- preserva a memória existente quando possível
- cria backup automático

### Forçar regeneração limpa

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai --context-mode=rewrite
```

## Regra simples para uso diário

Se estiver em dúvida, siga esta ordem:

1. `project.context.md`
2. `memory-index.md`
3. `skeleton-system.md`
4. `discovery.md`
5. `spec-current.md`
6. `architecture.md`
7. `module-<pasta>.md` ou `scan-<pasta>.md` só se precisar aprofundar

## O que pode ir para commit

Regra prática:

- pode versionar os arquivos de `.aioson/context/`
- pode versionar squads e genomes do projeto quando eles forem parte real do trabalho
- normalmente nao deve versionar arquivos gerenciados do framework em `.aioson/agents/`, `.aioson/locales/`, `.aioson/skills/`, `.aioson/schemas/`, `.aioson/tasks/`, `.aioson/templates/` e `.aioson/advisors/`

O AIOSON agora reforça isso no `.gitignore` do projeto durante `install`, `update` e `scan:project`.

Importante:

- se esses arquivos ja estavam rastreados pelo Git antes, adicionar no `.gitignore` nao basta
- nesse caso, remova-os do indice uma vez com `git rm --cached` para que parem de aparecer no status

## Resumo sem dúvida

- `scan:project` cria os mapas e os derivados locais
- `--with-llm` gera ou atualiza `discovery.md` e `skeleton-system.md`
- `merge` é o padrão para brownfield
- `rewrite` é opção explícita para regeneração limpa
- `spec.md` continua sendo a fonte principal da memória de desenvolvimento
- `context:pack` serve para montar um pacote mínimo e relevante para a tarefa atual
