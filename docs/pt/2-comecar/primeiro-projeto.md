# Primeiro projeto do zero

> **Para quem é:** quem nunca usou AIOSON e quer rodar uma vez para entender.
> **Tempo de execução:** 30–45 min.
> **O que você vai ter no fim:** um app web simples (lista de tarefas) com spec, código, testes e dossier — todos rastreáveis em disco.

Vamos construir um **mini-app de TODO** percorrendo a esteira principal num projeto SMALL. Você verá cada agente entrar, fazer sua parte, e passar para o próximo.

A esteira completa é:

```text
@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester
```

Neste tutorial a ideia já está clara, então começamos direto no `@product` e pulamos o bloco de briefing. (Se a sua ideia ainda estivesse crua, entraria pelo `@briefing`; e se ela tivesse tela, o `@refiner` montaria um protótipo navegável para você aprovar antes de qualquer PRD — ver [Da ideia ao PRD via briefing](../3-receitas/da-ideia-ao-prd-via-briefing.md).)

---

## Pré-requisitos

- **Node.js 20+** instalado
- Um cliente AI configurado: **Claude Code**, **Codex CLI** ou **OpenCode**. Os exemplos aqui usam Claude Code; é trivial trocar.
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

No fim, o `init` também instala os hooks do AIOSON:

```
Instalando hooks do AIOSON (context:guard + telemetria de runtime) — desative com --no-hooks:
  ✓ Claude Code — /home/voce/.claude/settings.json
```

São eles que aplicam as regras do projeto antes de cada escrita de arquivo e registram o que o agente fez. Se você não quer, use `--no-hooks`. Detalhes em [Hooks e Session Guard](../5-referencia/hooks-session-guard.md).

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
claude .   # ou: codex .   ou: opencode .
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
        Se a ideia ainda estivesse vaga, eu recomendaria @briefing primeiro.
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

@product > [...detalhes...] PRD gravado em
        .aioson/context/features/lista-todos/prd-lista-todos.md
        4 capacidades CAP-* com critério observável, e o que fica fora do escopo.
@product > Próximo: @sheldon (revisão independente antes do plano).
```

```bash
cat .aioson/context/features/lista-todos/prd-lista-todos.md
```

Você verá o PRD estruturado: capacidades `CAP-*`, ACs verificáveis e exclusões explícitas.

> **A regra aqui:** o PRD diz o que o usuário precisa poder fazer. Ele **não** decide implementação — isso é do `@planner` e do `@dev`.

---

## Passo 5 — `@sheldon` desafia o PRD antes de virar plano

```
Você > @sheldon

@sheldon > Confrontando o PRD com project.context.md e com o código atual...
@sheldon > 3 achados:
        - AC-03 ("listar separados") não define o comportamento sem filtro → corrigido no PRD
        - "Persistir" não dizia o que acontece ao reiniciar o processo → AC-04 tornado observável
        - Escopo especulativo recusado: "tags" não foi pedido, fica fora
@sheldon > Correções aplicadas no próprio prd-lista-todos.md (sem criar arquivo paralelo).
@sheldon > sheldon_review: approved — PASS vinculado ao hash atual do PRD.
@sheldon > Próximo: @planner.
```

> **O que o `@sheldon` não faz:** ele não escreve uma spec paralela. Ele corrige o mesmo arquivo e sela. Se o PRD for editado depois, o PASS cai e ele revisa de novo.

---

## Passo 6 — `@planner` corta em etapas verificáveis

```
Você > @planner

@planner > Lendo o PRD selado. Plano vertical em 3 etapas:

        Etapa 1 — persistência
          arquivos: package.json, src/db.js
          check:    node -e "require('./src/db')" cria o schema
        Etapa 2 — escrita de tarefa (CAP-01, CAP-02)
          arquivos: src/routes.js, src/server.js
          check:    POST /tasks → 201 com id; PATCH alterna completed
        Etapa 3 — leitura separada e persistência (CAP-03, CAP-04)
          arquivos: src/routes.js
          check:    GET /tasks?status=pending|done; reiniciar processo mantém dados

@planner > Sem libs extras: better-sqlite3 para persistência e `node:test` embutido
        para os checks (Artigo VI — Simplicity Over Ceremony).
@planner > implementation-plan-lista-todos.md gravado. Gate C aprovado?
Você > Sim
@planner > Próximo: @dev.
```

> **Cada etapa entrega comportamento observável pelo usuário** — não "camada de banco" numa etapa e "camada de rota" na outra. É isso que "vertical" quer dizer.

---

## Passo 7 — `@dev` implementa etapa por etapa

```
Você > @dev

@dev > [lê PRD selado, plano e project.context]
@dev > Etapa 1/3 — persistência
        package.json, src/db.js criados. Check ✓
@dev > Etapa 2/3 — escrita de tarefa
        src/routes.js, src/server.js criados. Check ✓
@dev > Etapa 3/3 — leitura separada e persistência
        src/routes.js atualizado. Check ✓

@dev > Smoke pelo caminho real:
        $ node src/server.js → escutando na 3000 ✓
@dev > 3/3 etapas completas. dev-state.md atualizado.
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

## Passo 8 — `@qa` dá o veredito (Gate D)

```
Você > @qa

@qa > Lendo o PRD... 4 ACs identificados.
@qa > Exercitando cada critério no app real:
        AC-01: criar tarefa → POST retorna 201 e id
        AC-02: marcar concluída → PATCH altera completed
        AC-03: listar separados → GET /tasks?status=pending|done
        AC-04: persistência → reiniciar processo, dados persistem

[Algum critério falhou? Ciclo QA→Dev, limitado:]
@qa > AC-03 falhou: GET sem filtro retorna mistura.
        Repassando para @dev (correção 1/1)...
@dev > Corrigindo... done.
@qa > Re-verificando... 4/4 OK.
@qa > Veredito PASS gravado em qa-report-lista-todos.md, com evidência por AC.
@qa > Feature pronta. Rode `aioson feature:close` quando quiser fechar.
```

> **O `@qa` é o Gate D.** O veredito é independente de quem implementou e vale contra o PRD, exercitado pelo caminho normal de produção — nunca por mock. Uma falha permite uma correção do Dev e um passe final; ela não negocia o critério.
>
> Sob autopilot, o encadeamento automático é `@product → @sheldon → @planner → @dev → @qa` e **para aqui**: nem o workflow nem o autopilot fecham ou publicam uma feature. Veja [Autopilot Handoff](../5-referencia/autopilot-handoff.md).

---

## Passo 9 — Endurecer com `@tester` e `@pentester` (opcional)

As duas últimas fases da esteira entram **depois** do PASS e são habilitadas por feature. Elas não concedem o Gate D — elas protegem o que ele aprovou.

```
Você > @tester

@tester > O comportamento aprovado vira suíte executável.
        tests/tasks.test.js — 4 ACs + 3 casos de borda
          · texto vazio → 400
          · PATCH em id inexistente → 404
          · reinício com o arquivo SQLite bloqueado
@tester > test-report-lista-todos.md gravado. Cobertura onde há risco, não onde é fácil.

Você > @pentester

@pentester > Sondando a superfície dentro do escopo autorizado (só este workspace).
        - MEDIUM: POST /tasks aceita texto sem limite de tamanho
        - LOW: erro de SQLite vaza o caminho absoluto do arquivo
@pentester > Os dois são determinísticos: corrigidos no mesmo pacote e re-sondados ✓
@pentester > security-findings-lista-todos.json gravado. Publicar continua sendo decisão sua.
```

> **Alvo público, produção e sistema de terceiro ficam fora por contrato.** O `@pentester` só ataca o que é seu e está no escopo autorizado.

---

## Passo 10 — Commit limpo com `@committer`

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
├── project.context.md                    ← visão do projeto (passo 3)
├── dev-state.md                          ← o que o @dev fez (passo 7)
├── qa-report-lista-todos.md              ← veredito do @qa (passo 8)
├── test-report-lista-todos.md            ← cobertura do @tester (passo 9)
├── security-findings-lista-todos.json    ← sondagem do @pentester (passo 9)
└── features/
    └── lista-todos/
        ├── prd-lista-todos.md                    ← PRD selado (passos 4+5)
        └── implementation-plan-lista-todos.md    ← plano vertical (passo 6)
```

Daqui a três meses, alguém (você ou outra IA) pode abrir esse projeto e entender **tudo** lendo só esses arquivos. Sem precisar do histórico de chat.

---

## E quando eu quiser uma feature nova?

Volte para o passo 4 — a esteira é um ciclo. Toda feature rastreada segue `@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester`; MICRO, SMALL e MEDIUM mudam a profundidade, não a ordem. O `@setup` não precisa rodar de novo (já tem o contexto).

**E se for só um ajuste pequeno?** Não puxe a esteira inteira. Chame o `@dev`: ele confirma que a mudança cabe numa frase, registra um plano mínimo, implementa a menor fatia útil e fecha com o check combinado. Se o escopo crescer no meio, ele escala para a esteira em vez de inflar em silêncio.

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
| Quero retomar uma feature interrompida | Rode `@dev` — ele lê `dev-state.md` e continua. |
| Não sei se a classificação certa é SMALL | Pergunte ao `@neo` — ele explica o cálculo. |
| Falhou ao instalar | `npx @jaimevalasek/aioson doctor` — diagnostica e sugere fix. |
| Quero adicionar Codex depois | `npx @jaimevalasek/aioson install --reconfigure`. |

---

## Próximo passo

- Tem um projeto que **já existe** e quer adicionar AIOSON nele? → [Em projeto existente](./projeto-existente.md)
- Quer entender quando MICRO vs SMALL vs MEDIUM? → [Decisões iniciais](./decisoes-iniciais.md)
- Todas as flags de `init`/`install`/`update` e como subir de versão → [Instalar e atualizar](./instalar-e-atualizar.md)
- Quer ver o time inteiro? → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
