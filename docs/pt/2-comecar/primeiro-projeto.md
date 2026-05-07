# Primeiro projeto do zero

> **Para quem é:** quem nunca usou AIOSON e quer rodar uma vez para entender.
> **Tempo de execução:** 30–45 min.
> **O que você vai ter no fim:** um app web simples (lista de tarefas) com spec, código, testes e dossier — todos rastreáveis em disco.

Vamos construir um **mini-app de TODO** usando o ciclo SMALL. Você verá cada agente entrar, fazer sua parte, e passar para o próximo.

---

## Pré-requisitos

- **Node.js 18+** instalado
- Um cliente AI configurado: **Claude Code**, **Codex CLI**, **Gemini CLI** ou **OpenCode**. Os exemplos aqui usam Claude Code; é trivial trocar.
- Um terminal aberto

Se você não tem cliente AI ainda: o Claude Code é o mais usado pela comunidade AIOSON. Veja [`clientes-ai.md`](../5-referencia/clientes-ai.md).

---

## Passo 1 — Criar o projeto

```bash
npx @jaimevalasek/aioson init meu-todo
cd meu-todo
```

O wizard vai te perguntar:

```
? Quais ferramentas AI? › Claude Code
? Modo? › Development (sem squads agora)
? Design system? › (pular por enquanto)
? Idioma dos agentes? › pt-BR
```

> **Dica leigo:** se quiser pular o wizard e instalar tudo, `--all`. Se for em CI, `--no-interactive`.

O comando deixa essa estrutura:

```
meu-todo/
├── .aioson/         ← agentes, regras, config
├── .claude/         ← integração Claude Code
├── CLAUDE.md        ← instruções automáticas para Claude Code
├── AGENTS.md        ← instruções para Codex
└── (vazio — sem package.json ainda)
```

---

## Passo 2 — Abrir o cliente AI no projeto

```bash
claude .   # ou: codex .   ou: gemini .   ou: opencode .
```

A partir daqui, vamos conversar com a IA.

---

## Passo 3 — `@setup` faz o onboarding

```
Você > @setup
```

Diálogo esperado (pode variar):

```
@setup > Olá! Vou configurar o contexto deste projeto.
@setup > Não detectei stack instalada ainda. Vamos do zero — qual o tipo?
        [web_app · api · site · script · dapp · desktop_app]
Você > web_app

@setup > Stack preferido?
Você > Node.js + Express + SQLite

@setup > Quantos tipos de usuário?
Você > 1

@setup > Quantas integrações externas (APIs, gateways, etc.)?
Você > 0

@setup > Há regras de negócio não-óbvias (cálculos especiais, fluxos com muitas condições)?
Você > Não

@setup > [calcula] Score: 0+0+0 = 0 → MICRO. Mas você pediu spec/test...
@setup > Recomendo SMALL para ter @qa no fim. Concorda?
Você > Sim

@setup > project.context.md criado.
@setup > Próximo agente: @product (para definir a feature inicial).
```

Olha o que apareceu em disco:

```bash
cat .aioson/context/project.context.md
```

```yaml
---
project_name: "meu-todo"
project_type: "web_app"
profile: "developer"
framework: "Node.js"
classification: "SMALL"
interaction_language: "pt-BR"
...
---
```

> **O que aconteceu:** o `@setup` te entrevistou e gravou as respostas num arquivo. **Esse arquivo é a memória externa** que todos os outros agentes vão ler.

---

## Passo 4 — `@product` define a primeira feature

```
Você > @product

@product > Vamos definir a feature inicial. Qual o nome curto (slug)?
Você > lista-todos

@product > Em uma frase, qual o problema que ela resolve?
Você > Permitir ao usuário criar e marcar tarefas como concluídas

@product > Quais critérios de aceitação?
Você > Criar tarefa com texto. Marcar como concluída. Listar pendentes e concluídas separadas. Persistir em SQLite.

@product > [...detalhes...] Spec gravada em
        .aioson/context/features/lista-todos/spec.md
@product > Próximo: @analyst.
```

```bash
cat .aioson/context/features/lista-todos/spec.md
```

Você verá uma spec estruturada com escopo, ACs e fora-de-escopo.

---

## Passo 5 — `@analyst` mapeia o domínio

```
Você > @analyst

@analyst > Lendo spec... domínio: tarefas pessoais.
@analyst > Entidades:
        - Task { id, text, completed, created_at }
@analyst > Não há outras entidades no escopo.
@analyst > Domain map gravado em context/architecture.md.
@analyst > Próximo: @architect.
```

---

## Passo 6 — `@architect` decide a estrutura

```
Você > @architect

@architect > Stack confirmado: Node + Express + SQLite.
@architect > Decisões:
        - Estrutura: src/{routes,db,server}.js
        - Persistência: better-sqlite3 (SQLite síncrono, simples)
        - Validação: pequena, manual (sem libs extras — Article VI)
        - Sem framework de teste pesado: usar `node:test` (built-in)
@architect > Decisões registradas em architecture.md.
@architect > Próximo: @dev.
```

> **Atenção ao Artigo VI ("Simplicity Over Ceremony"):** o `@architect` evitou puxar libs desnecessárias.

---

## Passo 7 — `@dev` implementa

```
Você > @dev

@dev > [lê spec, architecture, project.context]
@dev > Vou criar:
        package.json
        src/db.js          (init schema)
        src/routes.js      (POST /tasks, PATCH /tasks/:id, GET /tasks)
        src/server.js
        tests/tasks.test.js (placeholder — @qa cobre)

@dev > [implementa]
@dev > Implementação OK. Rodando smoke:
        $ node src/server.js → escutando na 3000 ✓
@dev > dev-state.md atualizado.
@dev > Próximo: @qa.
```

Veja o que mudou:

```bash
ls src/
# db.js  routes.js  server.js
cat .aioson/context/dev-state.md
```

`dev-state.md` mostra exatamente o que foi feito, em que arquivos, e o status.

---

## Passo 8 — `@qa` testa

```
Você > @qa

@qa > Lendo spec... 4 ACs identificados.
@qa > Plano de teste:
        AC-01: criar tarefa → POST retorna 201 e id
        AC-02: marcar concluída → PATCH altera completed
        AC-03: listar separados → GET /tasks?status=pending|done
        AC-04: persistência → reiniciar processo, dados persistem
@qa > Escrevendo tests/tasks.test.js... rodando...

[Algum teste falhou? Ciclo autônomo QA→Dev (até 2 iterações):]
@qa > AC-03 falhou: GET sem filtro retorna mistura.
        Repassando para @dev (iteração 1/2)...
@dev > Corrigindo... done.
@qa > Re-rodando... 4/4 OK.
@qa > test-plan.md e qa-report.md gravados. Feature pronta.
```

> **A novidade:** o ciclo *autônomo QA→Dev* (cap 2) deixa o @qa pedir correções pequenas sem você ter que reativar manualmente. Foi adicionado em Mai/2026.

---

## Passo 9 — Commit limpo com `@committer`

```
Você > @committer

@committer > Lendo diff e dev-state...
        Mensagem proposta:
        ┌────────────────────────────────────────────────────┐
        │ feat(tasks): add basic CRUD with SQLite            │
        │                                                    │
        │ - POST /tasks creates a task                       │
        │ - PATCH /tasks/:id toggles completion              │
        │ - GET /tasks supports status=pending|done filter   │
        │                                                    │
        │ Closes spec lista-todos. Tests: 4/4 pass.          │
        └────────────────────────────────────────────────────┘
        [✓] Aceitar  [ ] Editar  [ ] Cancelar
Você > [Enter para aceitar]
@committer > Commitado.
```

---

## O que ficou rastreável

```
.aioson/context/
├── project.context.md         ← visão do projeto (passo 3)
├── architecture.md            ← decisões (passos 5+6)
├── dev-state.md               ← o que o @dev fez (passo 7)
├── test-plan.md               ← plano do @qa (passo 8)
├── qa-report-test-coverage.md ← relatório de QA
└── features/
    └── lista-todos/
        └── spec.md            ← spec original (passo 4)
```

Daqui a três meses, alguém (você ou outra IA) pode abrir esse projeto e entender **tudo** lendo só esses arquivos. Sem precisar do histórico de chat.

---

## E quando eu quiser uma feature nova?

Volte para o passo 4. `@product` cria nova feature → `@analyst` → `@architect` → `@dev` → `@qa`. O `@setup` não precisa rodar de novo (já tem o contexto).

Se você se perder no meio, lembre:

```
Você > @neo
```

Ele te diz quem é o próximo.

---

## Solução de problemas comuns

| Problema | Solução |
|---|---|
| O agente "esqueceu" o contexto | Confira `cat .aioson/context/project.context.md`. Se faltar campos, rode `@setup` de novo. |
| Quero retomar uma feature interrompida | Rode `@deyvin` — ele lê `dev-state.md` e continua. |
| Não sei se a classificação certa é SMALL | Pergunte ao `@neo` — ele explica o cálculo. |
| Falhou ao instalar | `npx @jaimevalasek/aioson doctor` — diagnostica e sugere fix. |
| Quero adicionar Codex/Gemini depois | `npx @jaimevalasek/aioson install --reconfigure`. |

---

## Próximo passo

- Tem um projeto que **já existe** e quer adicionar AIOSON nele? → [Em projeto existente](./projeto-existente.md)
- Quer entender quando MICRO vs SMALL vs MEDIUM? → [Decisões iniciais](./decisoes-iniciais.md)
- Quer ver o time inteiro? → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
