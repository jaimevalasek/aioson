# Receita: Integrar AIOSON em codebase grande

> **Para quem é:** dev que herdou (ou está retomando) um projeto de 10k–100k+ linhas de código.
> **Tempo de execução:** 30–60 min para o setup inicial; depois o fluxo é normal.
> **O que você vai ter no fim:** AIOSON instalado, cache semântico do projeto pronto, agentes funcionando sem precisar varrer o codebase inteiro a cada sessão.

---

## Cenário

Você entrou num projeto existente. São 80 mil linhas, dezenas de módulos, nenhuma documentação atualizada. Quando você abre o Claude Code e diz "adicionar campo de endereço no cadastro de cliente", a IA responde razoavelmente — mas ela releu metade dos arquivos de rotas e modelos só para entender o contexto. Sessões longas viram pesadelo de janela de contexto.

O `@discover` resolve isso. Ele roda uma vez (ou quando você quiser atualizar), constrói um **cache semântico** com resumos de entidades, fluxos, dependências e estado atual — e guarda tudo em `.aioson/context/bootstrap/`. A partir daí, os agentes consultam o cache em vez de varrer o codebase. Você economiza contexto. As respostas ficam mais precisas.

---

## Pré-requisitos

- Node.js 18+ instalado
- Projeto existente com código (qualquer stack)
- Claude Code (ou outro cliente AI suportado)
- AIOSON ainda não instalado no projeto

---

## Passo 1 — Instalar sem tocar no código

```bash
cd meu-projeto-legado
npx @jaimevalasek/aioson install
```

```
? Quais ferramentas AI? › Claude Code
? Modo? › Development
? Design system? › Pular
? Idioma dos agentes? › pt-BR
```

O que foi criado (não tocou no seu código):
```
meu-projeto-legado/
├── .aioson/          ← agentes e config (novo)
├── .claude/          ← comandos Claude Code (novo)
├── CLAUDE.md         ← instruções do projeto (novo)
└── [seu código intacto]
```

---

## Passo 2 — Escanear a estrutura

```bash
npx @jaimevalasek/aioson scan:project
```

```
Detectando stack... Node.js v20 + Express + Sequelize + MySQL
Mapeando diretórios...
  src/controllers/   → 34 arquivos
  src/models/        → 21 arquivos
  src/routes/        → 12 arquivos
  src/services/      → 18 arquivos
  tests/             → 67 arquivos
  migrations/        → 143 arquivos

Scan salvo em:
  .aioson/context/scan-index.md
  .aioson/context/scan-src.md
  .aioson/context/scan-folders.md
```

> **O scan é estático:** analisa arquivos, conta linhas, lista dependências. Não entende semântica. Para isso, o próximo passo.

---

## Passo 3 — Rodar `@setup` para classificar

```bash
claude .
```

```
Você > @setup

@setup > Detectei: Node.js + Express + Sequelize + MySQL. Confirma?
Você > Sim

@setup > Tipos de usuário distintos no sistema?
Você > Admin, Vendedor, Cliente final, Parceiro logístico — 4 tipos

@setup > Integrações externas?
Você > Gateway de pagamento, API dos Correios, ERP via webhook, WhatsApp Business — 4

@setup > Regras de negócio complexas?
Você > Sim — cálculo de frete por região, comissão por tier de vendedor, regras de estoque

@setup > Score: 2 + 2 + 2 = 6 → MEDIUM.
@setup > project.context.md criado. Como o projeto já tem código, recomendo:
         1. @discover → cache semântico
         2. @analyst → domínio mapeado
         Depois o fluxo normal de features.
```

---

## Passo 4 — `@discover` constrói o cache semântico

Este é o passo mais importante desta receita. O `@discover` lê seletivamente as partes mais informativas do projeto — rotas, modelos, schemas, testes, PRDs existentes, arquivos de config — e gera resumos estruturados.

```
Você > @discover

@discover > Iniciando indexação semântica...

            Lendo fontes em ordem de prioridade:
            [1] project.context.md — ok
            [2] src/models/ — 21 arquivos, extraindo entidades...
                Entidades: Customer, Order, OrderItem, Product, Category,
                           Supplier, Shipment, Payment, Commission, Region
            [3] src/routes/ — 12 arquivos, mapeando API surface...
                Endpoints: 67 rotas identificadas
                Flows: checkout, devolução, criação de vendedor, login
            [4] package.json — dependências indexadas
            [5] migrations/ — 143 arquivos, história do schema detectada
                Campo mais recente: order.fraud_score (migration 143)
            [6] tests/ — 67 arquivos, comportamentos esperados extraídos

@discover > Cache gerado em .aioson/context/bootstrap/:
            ├── entities.md        (10 entidades com campos principais)
            ├── api-surface.md     (67 rotas agrupadas por domínio)
            ├── flows.md           (6 fluxos principais)
            ├── state.md           (o que está em progresso / parcial)
            └── dependencies.md   (integrações externas mapeadas)

@discover > Próximas sessões: qualquer agente lê este cache primeiro.
            Sem re-escanear o projeto inteiro.
```

> **Quando refrescar:** rode `@discover` de novo sempre que adicionar novos módulos significativos, novas entidades ou rotas. O cache não se atualiza automaticamente — mas é barato de refrescar.

---

## Passo 5 — `@analyst` usa o cache para mapear o domínio

```
Você > @analyst

@analyst > [lê bootstrap/entities.md, bootstrap/flows.md]
            Não preciso reler os 80k arquivos — o cache tem o que preciso.

@analyst > Domínio identificado:
            Core: Customer, Order, Product, Payment
            Logística: Shipment, Region, Supplier
            Financeiro: Commission, Payment (relação n:1 com Order)
            Gaps: OrderItem sem validação de estoque (campo qty_reserved inexistente)

@analyst > Achado importante: migration 87 adicionou fraud_score mas nenhum
            controller o usa. Possível feature abandonada ou A/B desligado.

@analyst > architecture.md atualizado. Pronto para a primeira feature.
```

> **A surpresa:** agentes lendo o cache conseguem detectar inconsistências (como o `fraud_score` órfão) que você só acharia relendo tudo manualmente.

---

## Passo 6 — Primeira feature com contexto completo

A partir daqui, o fluxo é idêntico a qualquer projeto. O diferencial é que o `@product`, `@dev` e `@qa` lêm o cache antes de agir — as respostas são muito mais precisas.

```
Você > @product

@product > [lê bootstrap/ + architecture.md]
            Já sei que Customer tem endereço simples (uma linha).
            Qual feature você quer?

Você > Adicionar suporte a múltiplos endereços por cliente

@product > Entendido. Existe uma tabela CustomerAddress? Não encontrei no cache.
           Vou criar spec prevendo migration nova.
           [...]
           Spec em features/multi-address/spec.md.
```

O `@product` já sabia que `CustomerAddress` não existia porque o `@discover` catalogou as entidades.

---

## O que ficou em disco (rastreio)

```
.aioson/context/
├── project.context.md           ← stack detectada, MEDIUM
├── scan-index.md                ← mapa de diretórios (do scan)
├── scan-src.md                  ← estatísticas por pasta
├── architecture.md              ← domínio mapeado (@analyst)
└── bootstrap/
    ├── entities.md              ← 10 entidades com campos (@discover)
    ├── api-surface.md           ← 67 rotas agrupadas
    ├── flows.md                 ← 6 fluxos principais
    ├── state.md                 ← o que está incompleto/parcial
    └── dependencies.md         ← integrações externas
```

---

## Quando NÃO usar `@discover`

- Projeto com menos de 20 arquivos de código — o custo de indexar supera o ganho.
- Projeto greenfield (sem código ainda) — não há o que indexar.
- Você quer experimentar uma ideia rápida — vá direto para `@dev` sem setup completo.

---

## Variações

| Situação | Ajuste |
|---|---|
| Legado sem testes | Rode `@tester` após o `@analyst`. Ele mapeia coverage e propõe teste por módulo crítico. |
| Codebase Python (Django, FastAPI) | O `@discover` detecta automaticamente; scan procura `models.py`, `urls.py`, `views.py`. |
| Quer atualizar o cache semanalmente | Rode `@discover` manualmente depois de merges grandes, ou integre no CI. |
| Time grande, cada dev instala AIOSON local | O `.aioson/context/bootstrap/` pode ser commitado para compartilhar o cache. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `@discover` ficou lento | É esperado na primeira vez. Futuras rodadas são incremental. |
| Cache está desatualizado | Reative `@discover` — ele compara com `bootstrap/` existente. |
| `@analyst` faz perguntas que o cache já responde | Verifique se o cache foi gerado e se `bootstrap/` existe. Pode ter sido excluído do `.gitignore` por engano. |
| `scan:project` não detectou a stack certa | Edite `framework` no `project.context.md` manualmente e reative `@setup`. |

---

## Próximo passo

- Quer refatorar um módulo crítico com segurança? → [Refatoração grande](./refatoracao-grande.md)
- Quer auditar segurança do legado? → [Auditoria de segurança](./auditoria-seguranca.md)
- Precisa de continuidade entre sessões longas? → [Continuidade entre sessões](./continuidade-entre-sessoes.md)
