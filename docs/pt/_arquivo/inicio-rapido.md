# [Arquivado] Início Rápido

> **Esta doc foi substituída.**
> O conteúdo foi reformulado em duas trilhas com diálogos reais:
> - Projeto do zero: [`../2-comecar/primeiro-projeto.md`](../2-comecar/primeiro-projeto.md)
> - Projeto existente: [`../2-comecar/projeto-existente.md`](../2-comecar/projeto-existente.md)
> Conteúdo abaixo preservado para referência histórica.

---

# Início Rápido

> Instale, configure e use os agentes de IA em menos de 10 minutos.

## Pré-requisitos

- Node.js 18+
- Um projeto de software (existente ou novo)
- Claude, Codex, Gemini ou OpenCode configurado no seu editor

---

## 1. Instalação

Ao rodar o `init` ou `install`, um **wizard interativo** aparece para você escolher:

1. **Quais ferramentas AI** usar (Claude Code, Codex, Gemini, OpenCode)
2. **Qual modo** (Development ou Development + Squads)
3. **Design system** (opcional) — Clean SaaS UI, Aurora Command UI, Cognitive Core UI, etc.
4. **Idioma dos agentes** — English, Português, Español, Français

Só os arquivos relevantes são copiados. Nenhuma dependência extra é instalada.

### Novo projeto (recomendado)

```bash
npx @jaimevalasek/aioson init meu-projeto
cd meu-projeto
```

### Projeto existente

```bash
cd meu-projeto
npx @jaimevalasek/aioson install
```

### Instalar tudo de uma vez (`--all`)

Use `--all` para pular o wizard e instalar imediatamente com todas as ferramentas e squads ativados:

```bash
# Cria projeto e instala tudo (sem wizard)
npx @jaimevalasek/aioson init meu-projeto --all

# Instala em projeto existente (todas as ferramentas + squads)
npx @jaimevalasek/aioson install --all
```

**O que o `--all` instala:**
- Ferramentas: Claude Code, Codex, Gemini, OpenCode
- Modo: Development + Squads
- Design: nenhum
- Idioma: English

### Re-configurar depois (adicionar ferramentas/modos)

Se precisar adicionar uma ferramenta ou ativar Squads depois:

```bash
npx @jaimevalasek/aioson install --reconfigure
```

Isso roda o wizard novamente — só os arquivos relevantes ao novo perfil são atualizados.

### CI / automação (sem wizard)

```bash
npx @jaimevalasek/aioson install --no-interactive
```

Instala todos os arquivos sem perguntar (comportamento padrão antes do wizard).

### Atualizar para nova versão

```bash
npx @jaimevalasek/aioson update
```

O update respeita o perfil salvo — só atualiza os arquivos que foram instalados originalmente.

Se o projeto já for brownfield e você quiser gerar um panorama inicial da base, rode depois:

```bash
npx @jaimevalasek/aioson scan:project . --folder=src
```

O scanner cria estes arquivos localmente:

- `.aioson/context/scan-index.md`
- `.aioson/context/scan-folders.md`
- `.aioson/context/scan-<pasta>.md`
- `.aioson/context/scan-aioson.md`
- `.aioson/context/memory-index.md`
- `.aioson/context/module-<pasta>.md`

Se existir `.aioson/context/spec.md`, ele tambem deriva:

- `.aioson/context/spec-current.md`
- `.aioson/context/spec-history.md`

Se você também quiser gerar `discovery.md` e `skeleton-system.md`, ative a etapa opcional com LLM:

```bash
npx @jaimevalasek/aioson scan:project . --folder=src --with-llm --provider=openai
```

Se `discovery.md` e `skeleton-system.md` ja existirem, o comportamento padrao agora e `merge`, com backup automatico em `.aioson/backups/`. Para regenerar do zero:

```bash
npx @jaimevalasek/aioson scan:project . --folder=src --with-llm --provider=openai --context-mode=rewrite
```

Se você nao usa API LLM no `aioson`, o caminho manual tambem funciona:

1. Rode `scan:project . --folder=src`
2. Opcional: rode `context:pack . --agent=analyst --goal="consolidar discovery brownfield" --module=src`
3. Abra seu Codex, Claude Code, Gemini CLI ou cliente equivalente
4. Execute `@analyst`
5. O `@analyst` usa os arquivos de scan para gerar `discovery.md`

Quando voce quiser montar um pacote minimo de contexto para uma tarefa especifica, use:

```bash
npx @jaimevalasek/aioson context:pack . --agent=dev --goal="ajustar captions do YouTube" --module=src
```

Esse comando gera `.aioson/context/context-pack.md` com os arquivos e trechos mais relevantes para a tarefa.

---

## 2. Configure o contexto do projeto

```bash
npx @jaimevalasek/aioson setup:context
```

O CLI vai fazer perguntas sobre seu projeto:

```
? Nome do projeto: minha-loja
? Tipo de projeto: web_app
? Framework principal: Laravel
? Framework instalado? Sim
? Classificação: SMALL
? Idioma de conversa: pt-BR
```

Isso gera `.aioson/context/project.context.md` — o arquivo que orienta todos os agentes.

---

## 3. Abra seu AI IDE e comece

No **Claude Code** (CLAUDE.md já configurado):
```
/aioson/setup
```

No **Codex** (AGENTS.md já configurado — sem slash commands):
```
use the @setup agent to onboard this project
```

No **Gemini CLI** (`.gemini/commands/` já configurado):
```
/aios-setup
```

O agente `@setup` detecta o framework, faz as perguntas e gera o `project.context.md`.

> Cada CLI tem uma forma diferente de invocar agentes. Consulte o [Guia de CLIs de IA](./clientes-ai.md) para exemplos detalhados de Claude Code, Codex e Gemini.

Se voce estiver entrando num projeto ja existente e quiser um companheiro tecnico para retomar uma sessao, diagnosticar algo pequeno ou implementar aos poucos, pode chamar `@deyvin` depois que o contexto minimo estiver pronto.

---

## Qual sequência usar?

| Tamanho do projeto | Sequência de agentes |
|---|---|
| **MICRO** — 0–1 ponto | `@setup → @dev` |
| **SMALL** — 2–3 pontos | `@setup → @product → [@sheldon] → @analyst → @architect → @dev → @qa → [@tester]` |
| **MEDIUM** — 4–6 pontos | `@setup → @product → [@sheldon] → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa → [@tester]` |

`[@sheldon]` — opcional, recomendado para validar e enriquecer o PRD antes de codar.
`[@tester]` — opcional, para cobertura sistemática quando o `@dev` implementou sem testes adequados.

### Estratégia de documentos de kickoff

Antes de ativar `@product`, você pode criar arquivos de entrada na raiz do projeto:

```
plans/minha-ideia.md     ← suas notas brutas, esboços, referências
prds/visao-produto.md    ← rascunhos de requisitos, inspirações
```

O `@product` e o `@sheldon` detectam esses arquivos automaticamente e perguntam se devem usá-los como fonte para gerar os artefatos formais em `.aioson/context/`. Os arquivos originais nunca são modificados — você decide quando deletá-los.

Esses arquivos de kickoff **não são versionados por padrão** (estão no `.gitignore`). Eles são documentos de trabalho do desenvolvedor, não artefatos do projeto.

### Atalho recomendado quando o escopo ainda está nebuloso

Se a demanda ainda estiver vaga, se a feature for grande ou se houver risco alto de retrabalho, use:

```text
@setup -> @discovery-design-doc -> proximo agente recomendado
```

Exemplos:
- projeto novo ainda mal definido
- feature grande em sistema existente
- integrações sensíveis como billing, webhooks, Stripe ou permissões

Esse passo de `@discovery-design-doc` é **recomendado quando agrega clareza**, não obrigatório.
Se o pedido já estiver claro e pequeno, siga o fluxo normal.

### Atalho de continuidade

Quando o projeto ja tem memoria suficiente e voce quer retomar trabalho sem abrir uma feature nova:

```text
@deyvin -> pequeno lote -> validar -> seguir ou fazer handoff
```

Exemplos:
- continuar o que foi feito ontem
- revisar logs/tasks recentes do runtime
- corrigir um bug pequeno junto
- ajustar um fluxo ja conhecido sem abrir PRD novo

**Não sabe o tamanho?** Responda 3 perguntas:
1. Quantos tipos de usuário? (1=0pt, 2=1pt, 3+=2pt)
2. Quantas integrações externas? (0=0pt, 1-2=1pt, 3+=2pt)
3. Regras de negócio complexas? (nenhuma=0pt, algumas=1pt, muitas=2pt)

- 0–1 pontos → **MICRO**
- 2–3 pontos → **SMALL**
- 4–6 pontos → **MEDIUM**

---

## Próximos passos

- [Referência completa dos comandos do CLI](./comandos-cli.md)
- [Como usar com Claude Code, Codex e Gemini](./clientes-ai.md)
- [Cenários completos com exemplos práticos](./cenarios.md)
- [Guia de agentes: quando usar cada um](./agentes.md)
- [Hardening do motor: gates, auto-cura e test briefing](./motor-hardening.md)
- [Suporte a projetos Web3](./web3.md)
- [Orquestração paralela para projetos MEDIUM](../en/parallel.md)
