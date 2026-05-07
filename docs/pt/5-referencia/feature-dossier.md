# Feature Dossier

> **Para quem é:** desenvolvedores que perdem contexto entre sessões ou que colaboram num projeto com outros.
> **Tempo de leitura:** 7 min
> **O que você vai sair sabendo:**
> - O que é o dossier e qual problema ele resolve
> - Como criar, consultar e enriquecer um dossier durante o desenvolvimento

## Para que serve

Você chega no projeto depois de dois dias, abre o Claude Code e percebe que não lembra mais em que ponto a feature estava: o `@dev` tinha terminado a autenticação ou ainda estava na validação? A especificação mudou ou não? Quais fontes de pesquisa foram consultadas?

Esse é o problema do dossier. Ele é uma pasta viva por feature — criada automaticamente ou manualmente — que concentra num único lugar a spec, o plano, as decisões, as pesquisas e o estado atual. Qualquer agente que entrar na feature vai ali primeiro.

O dossier não substitui a spec nem o PRD. Ele é a *pasta de trabalho* da feature: documenta o que foi decidido, por quê, com base em quê — e atualiza esse mapa à medida que o trabalho avança.

## Quando usar

- Toda vez que uma feature vai durar mais de uma sessão.
- Quando mais de uma pessoa (ou agente) vai tocar no mesmo código.
- Quando você precisa retomar um trabalho interrompido sem reler o histórico inteiro de chat.
- Quando quer indexar pesquisas externas (links, PDFs, notas) e referenciá-las depois.

## Como funciona (visão geral)

```
aioson dossier:init . --slug=checkout-stripe
           │
           ▼
.aioson/context/dossier/checkout-stripe/
├── dossier.json          ← schema v1.2 com metadados, status, classification
├── research-index.json   ← índice de pesquisas adicionadas
├── codemap.json          ← mapa de arquivos relevantes (bootstrap opcional)
└── notes.md              ← notas livres da sessão atual
           │
           ▼
Agentes leem dossier antes de qualquer ação:
@dev → @qa → @validator → @committer
```

O dossier é **auto-inicializado** quando você roda `aioson feature:close` ou `aioson workflow:next` — se ainda não existir para a feature em andamento, o sistema cria. Você também pode criar manualmente para features novas.

## Comandos

```bash
# Criar dossier para uma feature
aioson dossier:init . --slug=<kebab-case>

# Ver estado atual do dossier
aioson dossier:show . --slug=<kebab-case>

# Adicionar pesquisa ao índice (URL ou caminho local)
aioson dossier:add-research . --slug=<kebab-case> --research-slug=<id-da-pesquisa>

# Auditar consistência do dossier (detecta drift, artefatos faltando)
aioson dossier:audit . --slug=<kebab-case>

# Bootstrap do mapa de código (identifica arquivos relevantes para a feature)
aioson dossier:codemap-bootstrap . --slug=<kebab-case>

# Saída em JSON (para integração com CI ou scripts)
aioson dossier:show . --slug=<kebab-case> --json
```

Flags comuns:
- `--slug=<kebab-case>` — identificador da feature (obrigatório)
- `--json` — saída estruturada em vez de texto
- `--classification=MICRO|SMALL|MEDIUM` — sobrescreve a classificação detectada

## Exemplo prático

```
# Sessão 1
Você > aioson dossier:init . --slug=checkout-stripe
> Dossier criado: .aioson/context/dossier/checkout-stripe/dossier.json
> Classification detectada: SMALL
> Próximo: adicione pesquisas ou comece com @product.

Você > @dev
@dev > Lendo dossier checkout-stripe... spec encontrada, plano de implementação OK.
@dev > Implementando: src/payments/stripe-handler.js, src/routes/checkout.js
@dev > dev-state.md atualizado. Sessão encerrada às 18h.

# Sessão 2 (dia seguinte)
Você > @neo
@neo > Dossier checkout-stripe: @dev terminou stripe-handler, falta integrar com routes.
      Próximo: continuar com @deyvin ou retomar @dev.

Você > aioson dossier:show . --slug=checkout-stripe
> Status: in_progress | Agente atual: @dev | Último checkpoint: stripe-handler done
> Artefatos: spec.md ✓ | dev-state.md ✓ | codemap.json ✓
> Pesquisas indexadas: 0

Você > @deyvin
@deyvin > Retomando checkout-stripe. Lendo dossier e dev-state...
         Último ponto: stripe-handler implementado, rota de webhook pendente.
```

## Saídas em disco

```
.aioson/context/dossier/<slug>/
├── dossier.json           ← metadados: status, classification, agent, timestamps
├── research-index.json    ← entradas de pesquisa (schema v1.2)
├── codemap.json           ← arquivos relevantes mapeados (após codemap-bootstrap)
└── notes.md               ← notas livres (opcional)
```

O `dossier.json` referencia artefatos via `artifact_uris` — caminhos relativos para spec, PRD, architecture.md e outros.

## Quando NÃO usar

- Features de um único comando, sem continuidade esperada. Um MICRO de 30 minutos não precisa de dossier.
- Você vai usar `@deyvin` para retomar e ele já lê `dev-state.md` diretamente. Para esses casos o dossier é opcional.
- Quando o projeto usa o `runner-system` com fases automáticas — o runner gerencia o ciclo e cria os artefatos necessários.

## Próximo passo

- [Agent-chain continuity](./agent-chain-continuity.md) — como dossier, handoff-protocol e dev-resume trabalham juntos
- [Feature Archive](./feature-archive.md) — o que acontece quando a feature é fechada
- [Ficha do @deyvin](../4-agentes/deyvin.md) — agente de retomada que lê o dossier
