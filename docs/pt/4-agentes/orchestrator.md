# @orchestrator — Coordene lanes paralelas em projetos MEDIUM

> **Para quem é:** quem trabalha em projetos MEDIUM e precisa dividir a implementação em frentes paralelas.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que é uma "lane" e quando paralelizar faz sentido
> - Comandos CLI do sistema de lanes

---

## Para que serve

Em projetos MEDIUM, a implementação pode ser grande o suficiente para ter partes independentes — backend de autenticação e frontend de listagem, por exemplo — que podem acontecer em paralelo sem conflito. Tentar fazer isso manualmente sem coordenação é receita para conflitos de merge e arquivos sobrescritos.

`@orchestrator` divide o trabalho em **lanes** (faixas de execução): cada lane tem seu escopo, seus arquivos permitidos, e seu estado independente. Ele garante que as lanes não escrevam nos mesmos arquivos e coordena o merge no final.

**Regra dura:** `@orchestrator` só ativa em projetos MEDIUM. Para MICRO e SMALL, execução sequencial é o suficiente.

---

## Quando invocar

- Projetos MEDIUM, após `@pm`, quando há implementação paralelizável.
- Quando você tem múltiplos devs (humanos ou IAs) trabalhando na mesma feature.
- Quando uma feature tem frentes claramente independentes (ex: API + UI + migrations).

---

## Quando NÃO invocar

- Projeto MICRO ou SMALL → ele mesmo recusa e te avisa.
- A feature tem dependências lineares fortes → implemente sequencialmente com `@dev`.

---

## Diálogo típico

```
Você > @orchestrator

@orchestrator > Verificando classificação... MEDIUM. OK.
                Lendo architecture.md, tasks.md, ui-spec.md...
                
                Dividindo em 3 lanes:
                Lane 1 — backend
                  Escopo: src/models/payment.js, src/services/payment-service.js, src/routes/checkout.js
                Lane 2 — frontend
                  Escopo: src/views/checkout/, src/components/PaymentForm/
                Lane 3 — migrations
                  Escopo: db/migrations/add-payment-table.sql
                
                Guard configurado: lanes não podem escrever fora do próprio escopo.
                
                $ aioson parallel:init .          ✓
                $ aioson parallel:assign .        ✓
                Workspace pronto em .aioson/context/parallel/
                
                Quando terminar cada lane, rode:
                  aioson parallel:status .
                  aioson parallel:merge . --apply
```

---

## Saídas em disco

| Arquivo/Diretório | Conteúdo |
|---|---|
| `.aioson/context/parallel/lane-1.md` | Escopo e estado da lane 1 |
| `.aioson/context/parallel/lane-2.md` | Escopo e estado da lane 2 |
| `.aioson/context/parallel/lane-N.md` | ... |

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — confirma `classification: MEDIUM`
- `.aioson/context/discovery.md`, `architecture.md`, `prd.md`, `ui-spec.md`
- `.aioson/context/implementation-plan-{slug}.md` — se existir
- `.aioson/context/parallel/` — ao retomar sessão

---

## Comandos CLI relacionados

```bash
# Inicializar workspace de lanes
aioson parallel:init .

# Distribuir escopos
aioson parallel:assign .

# Ver progresso de cada lane
aioson parallel:status .

# Validar que uma lane está autorizada a escrever num arquivo
aioson parallel:guard . --lane=1 --paths=src/models/payment.js

# Merge final (só quando todas as lanes estão prontas)
aioson parallel:merge . --apply

# Corrigir workspace quebrado
aioson parallel:doctor . --fix
```

---

## Handoff típico

- **Vem de:** `@pm`
- **Vai para:** `@dev` (em cada lane)

---

## Próximo passo

- [Ficha do @dev](./dev.md) — executa dentro de cada lane
- [Decisões iniciais: MEDIUM](../2-comecar/decisoes-iniciais.md#medium--workflow-completo)
