# @setup — Onboarding do projeto e geração de contexto

> **Para quem é:** quem está iniciando AIOSON num projeto novo ou existente.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que o @setup faz e quando re-ativá-lo.
> - Quais arquivos ele cria e por que eles importam.

## Para que serve

Todo projeto AIOSON começa aqui. O `@setup` é o agente responsável por entrevistar você e o codebase, calcular a classificação (MICRO/SMALL/MEDIUM), e escrever o `project.context.md` — o arquivo que todos os outros agentes lêem antes de agir.

Sem o `project.context.md`, nenhum outro agente sabe o stack, o idioma de interação, nem o tamanho do projeto. Eles se recusam a agir ou agem com suposições erradas. Rodar `@setup` antes de tudo evita esse problema.

Em projetos existentes, o `@setup` detecta o framework automaticamente (Laravel, Next.js, Rails, Django, Node.js, etc.) e pula perguntas desnecessárias.

## Quando invocar

- Primeira vez que você usa AIOSON num projeto.
- Quando o `project.context.md` está desatualizado ou com campos inválidos (`auto`, `null`, valores em branco).
- Quando muda o stack, o idioma de interação, ou a classificação esperada.
- Quando `@neo` retorna `needs_setup` ou `needs_setup_repair`.

## Quando NÃO invocar

- Se o `project.context.md` já existe e está válido — `@neo` te confirma isso.
- Se você quer simplesmente continuar uma feature — use `@deyvin`.
- Se quer mudar só o design skill — edite `design_skill:` diretamente no `project.context.md`.

## Diálogo típico

```
Você > @setup

@setup > Detectei: Node.js + Express (package.json com express 4.x).
         Confirma a stack?
Você > Sim, mais SQLite via better-sqlite3.

@setup > Tipo de projeto?
         [web_app · api · site · script · dapp · desktop_app]
Você > web_app

@setup > Quantos tipos de usuário? (admin conta como um)
Você > 2

@setup > Integrações externas? (APIs de terceiros, gateways, etc.)
Você > Stripe e S3 (2)

@setup > Regras de negócio não-óbvias? (cálculos especiais, fluxos condicionais)
Você > Não

@setup > Score: 1 + 1 + 0 = 2 → SMALL.
         Design system?
         [clean-saas-ui · aurora-command-ui · cognitive-core-ui · (outros) · Pular]
Você > clean-saas-ui

@setup > Idioma de interação? [en · pt-BR · es · fr]
Você > pt-BR

@setup > project.context.md criado em .aioson/context/project.context.md.
         Próximo agente recomendado: @product.
```

## Saídas em disco

| Arquivo | O que contém |
|---|---|
| `.aioson/context/project.context.md` | Frontmatter YAML com todos os campos do contexto |

O frontmatter inclui: `project_name`, `project_type`, `framework`, `framework_installed`, `classification`, `interaction_language`, `design_skill`, `test_runner`, `aioson_version`.

## Como ele lê seu projeto

1. Verifica se `.aioson/context/project.context.md` já existe (projeto retomado vs. primeira vez).
2. Inspeciona arquivos do workspace: `package.json`, `composer.json`, `artisan`, `manage.py`, `config/routes.rb` etc.
3. Detecta stack e confirma com você antes de registrar.
4. Calcula a classificação a partir das 3 dimensões (ver [Decisões iniciais](../2-comecar/decisoes-iniciais.md)).

## Comandos CLI relacionados

```bash
# Instalar AIOSON e rodar wizard (novo projeto)
npx @jaimevalasek/aioson init meu-projeto

# Instalar em projeto existente
npx @jaimevalasek/aioson install

# Re-configurar ferramentas AI
npx @jaimevalasek/aioson install --reconfigure

# Escanear codebase antes do setup
npx @jaimevalasek/aioson scan:project . --folder=src
```

## Handoff típico

- **Vem de:** primeira ativação ou `@neo` detectando contexto ausente/inválido.
- **Vai para:** `@product` (para definir a primeira feature).

## Próximo passo

- Entender classificações → [Decisões iniciais](../2-comecar/decisoes-iniciais.md)
- Visão geral do ciclo → [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
- Termos como "design skill" e "classification" → [Glossário](../1-entender/glossario.md)
