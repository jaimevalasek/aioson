# @discover — Cache semântico do projeto

> **Para quem é:** quem trabalha em codebase médio/grande e quer que os agentes "saibam" o sistema sem precisar varrer tudo toda vez.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que é o cache semântico e por que economiza contexto.
> - Quando rodar @discover e quando re-rodar.

## Para que serve

Num projeto com 500+ arquivos, quando você invoca `@analyst` ou `@dev`, eles precisam entender o sistema antes de agir. Sem cache, eles varrem o codebase inteiro — consome janela de contexto, é lento, e pode perder coisas.

O `@discover` resolve isso de vez: ele lê o projeto uma vez, extrai as informações semânticas relevantes (entidades, rotas, fluxos, dependências, estado atual), e salva tudo em `.aioson/context/bootstrap/`. Na próxima vez que qualquer agente precisar entender o sistema, ele lê o cache em vez de varrer tudo.

É como ter um **mapa do território** que todos os agentes consultam. Você atualiza o mapa quando o território muda.

## Quando invocar

- Primeira vez rodando AIOSON num projeto existente com código.
- Após mudanças estruturais significativas no codebase (novos módulos, refatoração grande).
- Quando um agente se perde ou dá respostas imprecisas por falta de contexto.
- `@neo` ou `@deyvin` sinalizam que o cache está desatualizado.

## Quando NÃO invocar

- Projeto novo/vazio — não há o que descobrir ainda.
- Cache foi rodado há menos de uma semana e não houve mudanças estruturais.
- Você quer só rodar `@setup` — o discover vem depois, é um passo separado.

## Diálogo típico

```
Você > @discover

@discover > Lendo project.context.md... Stack: Node.js + Express + Postgres.
            Verificando bootstrap existente... nenhum encontrado.

            Iniciando descoberta semântica:
            - Lendo src/routes/      → 12 rotas detectadas
            - Lendo src/models/      → 6 entidades: User, Order, OrderItem,
                                        Product, Payment, Address
            - Lendo src/services/    → 8 services identificados
            - Lendo tests/           → 47 testes, cobertura em: auth, orders
            - Lendo package.json     → dependências: stripe, nodemailer, knex

            Extraindo relacionamentos:
            Order → User (many-to-one)
            Order → OrderItem (one-to-many)
            OrderItem → Product (many-to-one)

            Salvando cache:
            .aioson/context/bootstrap/entities.md
            .aioson/context/bootstrap/routes.md
            .aioson/context/bootstrap/services.md
            .aioson/context/bootstrap/dependencies.md
            .aioson/context/bootstrap/test-coverage.md

            Cache pronto. Próximo agente pode usar .aioson/context/bootstrap/
            em vez de re-escanear o projeto.
```

## Saídas em disco

`@discover` produz **dois outputs complementares**, com propósitos diferentes:

- **`bootstrap/`** — cache **semântico**, organizado por *tipo de artefato* (entidades, rotas, services, dependências, testes). Pensado para o próximo agente ler em sequência sem re-escanear o projeto.
- **`brains/discover/`** — nodes em formato **Zettelkasten**, com cross-references entre conceitos. Pensado para qualquer agente consultar pontualmente ("o que sei sobre `OrderItem`?") via `aioson brains:query`.

| Arquivo | O que contém |
|---|---|
| `.aioson/context/bootstrap/entities.md` | Entidades, atributos e relacionamentos detectados |
| `.aioson/context/bootstrap/routes.md` | Endpoints/rotas com método, path e responsabilidade |
| `.aioson/context/bootstrap/services.md` | Services e suas funções principais |
| `.aioson/context/bootstrap/dependencies.md` | Dependências externas e propósito |
| `.aioson/context/bootstrap/test-coverage.md` | O que está coberto por testes |
| `.aioson/brains/discover/` | Nodes Zettelkasten para consulta cruzada por outros agentes |

## Como ele lê seu projeto

Escaneia em ordem de prioridade:

1. `project.context.md` — stack, framework, linguagem.
2. `discovery.md` / `skeleton-system.md` — se `scan:project` foi rodado antes.
3. Arquivos de rotas (por stack detectada).
4. Models, schemas, entidades.
5. PRDs e specs em `.aioson/context/`.
6. `package.json`, `composer.json`, `.env.example`.
7. Testes (para inferir comportamento esperado).
8. Bootstrap anterior (modo refresh — detecta o que mudou).

## Comandos CLI relacionados

```bash
# Escanear estrutura de pastas (complementar ao @discover)
npx @jaimevalasek/aioson scan:project . --folder=src

# Ver o cache gerado
ls .aioson/context/bootstrap/
cat .aioson/context/bootstrap/entities.md
```

## Opção `--help`

Uma ativação com `--help` (`/discover --help`) imprime um resumo rápido — o que faz, quando usar, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

## Handoff típico

- **Vem de:** `@setup` (primeira vez) ou qualquer ponto quando o cache está stale.
- **Vai para:** `@analyst`, `@dev`, `@deyvin` — qualquer agente que precise entender o sistema.

## Diferença entre @discover e scan:project

| | `scan:project` (CLI) | `@discover` (agente) |
|---|---|---|
| O que faz | Análise estrutural estática | Extração semântica rica |
| Saída | `discovery.md`, `skeleton-system.md` | `bootstrap/*.md`, `brains/` |
| Quando rodar | Como preparação rápida | Para cache profundo e relacional |
| Frequência | Pode rodar sempre | Quando houver mudança estrutural |

Os dois se complementam: `scan:project` primeiro, `@discover` depois, é o combo mais eficiente.

## Próximo passo

- Projeto existente sem cache → [Em projeto existente](../2-comecar/projeto-existente.md)
- Ver o ecossistema completo → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
- Termos como "brains" e "bootstrap" → [Glossário](../1-entender/glossario.md)
