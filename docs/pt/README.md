# Documentação AIOSON — Português

> **AIOSON** dá a cada sessão de IA um **papel**, um **protocolo** e um **ciclo de vida**.
> Em vez de um prompt gigante tentando fazer tudo, agentes especializados se revezam: cada um cuida de uma fatia (entender, planejar, implementar, revisar) e passa o bastão para o próximo de forma limpa.

Esta é a porta de entrada. Siga a ordem abaixo se você é novo, ou pule direto para a seção que interessa.

**Entender → Começar → Receitas → Agentes → Referência**

---

## O fluxo principal — da ideia bruta ao veredito

Esta é a rota que uma feature percorre no AIOSON. Cada agente entrega um **artefato em disco**; o próximo lê esse artefato e continua de onde o anterior parou. Ninguém depende de "lembrar da conversa" — a passagem de bastão é sempre um arquivo.

```text
   matéria-prima            plans/{slug}/, anotações, SQL, prints, uma ideia solta
        │
        ▼
   @briefing                → .aioson/briefings/{slug}/briefings.md
        │                      problema, temas, riscos, gaps, perguntas em aberto
        ▼
   @refiner        → review.html + refinement-report.md
        │                      + prototype.html quando o escopo é visual
        ▼
   VOCÊ aprova              → aioson briefing:approve . --slug={slug}
        │
        ▼
   @product                 → .aioson/context/prd-{slug}.md
        │                      capacidades, exclusões, critérios de aceite (ACs)
        ▼
   @sheldon                 → o MESMO prd-{slug}.md, revisado e selado
        │
        ▼
   @planner                 → .aioson/context/implementation-plan-{slug}.md
        │                      fases verticais, arquivos esperados, checks executáveis
        ▼
   @dev                     → código + .aioson/context/dev-state.md
        │
        ▼
   @qa                      → .aioson/context/qa-report-{slug}.md — PASS ou FAIL
```

### O que cada etapa faz

| Etapa | O que o agente faz | O que entra | O que sai |
|---|---|---|---|
| [`@briefing`](./4-agentes/briefing.md) | Coleta a matéria-prima e a transforma em um documento estruturado — sem decidir escopo | Arquivos em `plans/{slug}/` ou uma conversa guiada | `briefings.md` com problema, temas, riscos, gaps e perguntas classificadas |
| [`@refiner`](./4-agentes/refiner.md) | Audita o briefing em achados estruturados e, quando o escopo é visual, produz o **protótipo** que você aprova | O briefing em `draft` | `review.html` para você decidir no navegador, `refinement-report.md` e `prototype.html` |
| **Você** | Aprova o briefing — nenhum agente aprova no seu lugar | Briefing refinado | `aioson briefing:approve . --slug={slug}` |
| [`@product`](./4-agentes/product.md) | Transforma o briefing aprovado em PRD: o que a feature faz, o que ela **não** faz, e como saber que ficou pronta | Briefing aprovado | `prd-{slug}.md` — a autoridade de escopo |
| [`@sheldon`](./4-agentes/sheldon.md) | Revisão técnica e de arquitetura: acha o edge case frágil, o risco não nomeado, o AC que não é verificável | O PRD | O **mesmo** `prd-{slug}.md`, enriquecido e selado para planejamento |
| [`@planner`](./4-agentes/planner.md) | Quebra o PRD aprovado em fases verticais executáveis, cada uma com arquivos esperados e um check que prova a fase | PRD selado | `implementation-plan-{slug}.md` |
| [`@dev`](./4-agentes/dev.md) | Implementa fase por fase, rodando os checks do plano | PRD + plano | Código funcionando + `dev-state.md` |
| [`@qa`](./4-agentes/qa.md) | Revisão final independente: confere cada AC pelo caminho real de produção e emite o veredito | Código + PRD + plano | `qa-report-{slug}.md` com PASS ou FAIL |

### Por que a ordem é essa

Cada etapa existe para impedir que uma decisão cara seja tomada cedo demais, com informação de menos:

1. **`@briefing` antes de tudo** porque escrever um PRD a partir de uma ideia vaga produz um PRD vago. Ele coleta e organiza; não decide.
2. **`@refiner` antes da aprovação** porque ambiguidade que passa daqui vira dívida no PRD — e porque, em escopo visual, é muito mais barato discordar de um protótipo do que de uma tela já implementada.
3. **Sua aprovação antes do `@product`** porque o escopo é decisão de dono do produto, não de agente.
4. **`@sheldon` depois do `@product`** porque revisão técnica precisa de algo concreto para criticar; revisar uma intenção não produz achado.
5. **`@planner` depois do PRD selado** porque plano feito sobre escopo instável é replanejado a cada mudança.
6. **`@dev` depois do plano** porque implementar sem fases verticais leva a "90% pronto" indefinidamente.
7. **`@qa` independente** porque quem implementou não é a melhor pessoa para achar o que ficou faltando. O PASS do QA é o Gate D.
8. **`@tester` e `@pentester` depois do veredito** porque cobertura e endurecimento protegem um comportamento já aprovado — eles não decidem se a feature está pronta.

Esteira completa: `@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester`.

O bloco `@briefing → @refiner → aprovação` é **opcional**: se a feature já está clara, comece direto no `@product`. Mas se você começar, precisa terminar — um briefing pela metade não vira PRD, e escopo visual exige o protótipo aprovado. MICRO, SMALL e MEDIUM percorrem a mesma esteira; a classificação muda profundidade e orçamento, não a ordem. Domínio, arquitetura, sequenciamento e interação são resolvidos dentro da esteira (`@product` e `@planner`); os antigos consultores (`@analyst`, `@architect`, `@ux-ui`, `@pm`) foram aposentados. E para uma mudança pequena existe a rota curta, o Simple Plan via `@dev`.

### Exemplo curto de ponta a ponta

Uma feature pequena: "exportar o relatório de pedidos em CSV".

```text
─── Sessão 1 ───
Você > @briefing
@briefing > Encontrei plans/export-csv/ com 2 arquivos. Uso os dois?
Você > Sim.
@briefing > .aioson/briefings/export-csv/briefings.md criado.
            3 perguntas em aberto (1 decision-required: separador , ou ;).
            Próximo: @refiner.

Você > @refiner
@refiner > 4 achados (1 bloqueia o PRD: formato de data não definido).
                    Revisão renderizada: .aioson/briefings/export-csv/review.html
                    Abra, decida cada achado e volte.
Você > [decide no navegador; o feedback é aplicado]
@refiner > Nada bloqueia o PRD. Aprove quando quiser.

# no terminal:
$ aioson briefing:approve . --slug=export-csv

─── Sessão 2 ───
Você > @product
@product > PRD criado em .aioson/context/prd-export-csv.md — 6 ACs.
           Próximo: @sheldon.

Você > @sheldon
@sheldon > Risco: exportação de 100k linhas trava a request.
           Adicionei AC de streaming e limite. PRD selado.
           Próximo: @planner.

─── Sessão 3 ───
Você > @planner
@planner > Plano em .aioson/context/implementation-plan-export-csv.md
           Fase 1: serializador + testes · Fase 2: endpoint com streaming
           Próximo: @dev.

Você > @dev
@dev > Fases 1 e 2 completas, checks do plano passando.
       Próximo: @qa.

Você > @qa
@qa > 6/6 ACs verificados pelo caminho real. qa-report-export-csv.md: PASS.
```

> **Ativações:** em clientes de linguagem natural (Codex, OpenCode) use `@briefing`, `@product`…; em clientes com slash command (Claude Code) as mesmas ativações funcionam como `/briefing`, `/product`… Os comandos `aioson ...` rodam no terminal.
>
> Perdido no meio do caminho? Ative [`@neo`](./4-agentes/neo.md): ele lê o estado do projeto e diz qual é o próximo agente.

**Aprofundar:** [receita da rota canônica](./3-receitas/feature-completa-com-sheldon.md) · [da ideia ao PRD via `@briefing`](./3-receitas/da-ideia-ao-prd-via-briefing.md) · [fichas de todos os agentes](./4-agentes/README.md) · [fluxo de artefatos](./5-referencia/fluxo-artefatos.md)

---

## Em três comandos

```bash
# 1. Criar o projeto (ou use `install` num projeto que já existe)
npx @jaimevalasek/aioson init meu-projeto

# 2. Entrar na pasta
cd meu-projeto

# 3. Abrir seu cliente AI (Claude Code, Codex ou OpenCode) e digitar:
@setup
```

A partir daí os agentes guiam você. Passo a passo completo em [Primeiro projeto](./2-comecar/primeiro-projeto.md).

---

## 1. Entender — o que é isso

Comece por aqui se você nunca usou. São 15 minutos.

| Página | O que responde |
|---|---|
| [O que é AIOSON](./1-entender/o-que-e-aioson.md) | A analogia simples, o que ele faz por você, e quando *não* usar |
| [Por que existe](./1-entender/por-que-existe.md) | O problema do prompt-monolito |
| [Mapa do ecossistema](./1-entender/mapa-do-ecossistema.md) | O time inteiro num diagrama |
| [Glossário](./1-entender/glossario.md) | Agente, squad, genome, skill, dossier, classificação |

---

## 2. Começar — colocar para rodar

| Página | Quando ler |
|---|---|
| [Instalar e atualizar](./2-comecar/instalar-e-atualizar.md) | Requisitos, todas as flags de `init`/`install`/`update`, hooks e como subir de versão |
| [Primeiro projeto](./2-comecar/primeiro-projeto.md) | Projeto novo, do zero, com diálogos reais de cada agente |
| [Projeto existente](./2-comecar/projeto-existente.md) | Você já tem código e quer trazer o AIOSON |
| [Decisões iniciais](./2-comecar/decisoes-iniciais.md) | MICRO, SMALL ou MEDIUM? Qual cliente AI? |

---

## 3. Receitas — casos prontos para copiar

Índice completo em [`3-receitas/`](./3-receitas/README.md).

**As trilhas canônicas — como uma feature chega ao código:**

1. [Da ideia ao PRD via `@briefing`](./3-receitas/da-ideia-ao-prd-via-briefing.md) — entra pelo começo da esteira, quando a ideia ainda é vaga ou tem tela nova
2. [Feature completa com revisão do `@sheldon`](./3-receitas/feature-completa-com-sheldon.md) — entra no PRD: `@product → @sheldon → @planner → @dev → @qa`
3. [Plans externos para `@product`](./3-receitas/plans-externos-para-product.md) — quando você planejou em outra ferramenta e quer trazer

**Por cenário:**

| Receita | Cenário |
|---|---|
| [Landing page](./3-receitas/landing-page.md) | Página de conversão: protótipo aprovado + `@copywriter` |
| [App SaaS do zero](./3-receitas/app-saas-do-zero.md) | Esteira MEDIUM completa: auth, billing, admin |
| [Integração em codebase grande](./3-receitas/integracao-em-codebase-grande.md) | `install` + `@discover` + esteira em legado |
| [Refatoração grande](./3-receitas/refatoracao-grande.md) | `@sheldon` antes do `@dev` |
| [Auditoria de segurança](./3-receitas/auditoria-seguranca.md) | `@pentester` de ponta a ponta |
| [Continuidade entre sessões](./3-receitas/continuidade-entre-sessoes.md) | Dossier, dev-resume, detecção de drift |
| [Clonar design de site](./3-receitas/clonar-design-de-site.md) | `@site-forge` + `@design-hybrid-forge` |
| [Exploração visual e arena entre modelos](./3-receitas/arena-de-exploracao-visual.md) | Comparar direções de design antes de escolher |
| [Publicar no AIOSON Store](./3-receitas/publicar-no-aioson-com.md) | `system:package` + `system:publish` |

---

## 4. Agentes — quem faz o quê

- **[Fichas por agente](./4-agentes/README.md)** — uma ficha para cada agente, com diálogo típico, saídas em disco e para quem passa o bastão
- [Guia tabular alternativo](./agentes.md) — visão de uma página só

---

## 5. Referência — o detalhe técnico

Índice completo em [`5-referencia/`](./5-referencia/README.md). Os mais procurados:

**CLI e instalação**

- [Comandos do CLI](./5-referencia/comandos-cli.md) — todos os comandos do `aioson`
- [Instalar e atualizar](./2-comecar/instalar-e-atualizar.md) — flags, requisitos, upgrade
- [Clientes AI](./5-referencia/clientes-ai.md) — Claude Code, Codex, OpenCode

**Regras, contexto e memória**

- [Regras de interação e gate visual](./5-referencia/regras-de-interacao-e-gate-visual.md) — máscaras, confirmação, drag-and-drop, widgets, e o que o gate visual mede
- [Hooks e Session Guard](./5-referencia/hooks-session-guard.md) — `context:guard` antes de cada escrita, telemetria de runtime
- [Memória e contexto](./5-referencia/memoria-e-contexto.md) — busca, cache, monitor, carregamento seletivo
- [Agent sharding](./5-referencia/agent-sharding.md) — carregar só a parte relevante de um agente
- [Memória do operador](./5-referencia/operator-memory.md) — decisões por identidade
- [Memória Viva](./living-memory/README.md) · [Active Learning Loop](./active-learning-loop/README.md)

**Fluxo de trabalho**

- [Fluxo de artefatos](./5-referencia/fluxo-artefatos.md) — PRD único → plano único → implementação → veredito
- [Autopilot e handoffs](./5-referencia/autopilot-handoff.md)
- [Execução de agentes](./5-referencia/agent-execution.md) — faixas por host/modelo, fallback explícito, telemetria
- [Feature dossier](./5-referencia/feature-dossier.md) · [Live sessions](./5-referencia/live-sessions.md)
- [Sub-Task Scout do @dev](./deyvin-subtask-scout/README.md)

**Squads e design**

- [Squads](./5-referencia/squads.md) — criação, squad efêmero, roteamento entre squads, webhook
- [Squad Dashboard](./5-referencia/squad-dashboard.md) · [Automação de squads](./5-referencia/automacao-squads.md)
- [Genome 4.0](./5-referencia/genome-4.0-spec.md) · [Skills](./5-referencia/skills.md)

**Outros**

- [Secure by default](./5-referencia/secure-by-default.md) · [Sandbox](./5-referencia/sandbox.md)
- [SDD framework](./5-referencia/sdd-framework.md) · [Motor hardening](./5-referencia/motor-hardening.md)
- [AIOSON Store](./5-referencia/aioson-com-store.md) · [Web3](./5-referencia/web3.md)

---

## Glossário rápido

Versão expandida em [`1-entender/glossario.md`](./1-entender/glossario.md).

| Termo | O que é |
|---|---|
| **Agente** | Um especialista (`@product`, `@dev`, `@qa`…) com prompt e regras próprias |
| **Squad** | Um time de agentes que você cria para um domínio específico |
| **Genome** | O "DNA cognitivo" de um domínio ou de uma pessoa — como o agente pensa |
| **Skill** | Um pacote plugável de instrução (design system, processo, conhecimento) |
| **Regra** | Um contrato em `.aioson/rules/` que todo agente relevante carrega |
| **Dossier** | A pasta de uma feature: spec, plano, decisões, status |
| **Classificação** | MICRO / SMALL / MEDIUM — quanto de processo o trabalho precisa |
| **Constitution** | Os princípios que nenhum agente sobrescreve |

---

## Arquivo histórico

[`_arquivo/`](./_arquivo/) guarda versões anteriores das docs, cada uma com nota apontando para o equivalente atual. Nada foi perdido, mas nada ali é fonte de verdade.

---

## Outras línguas

A documentação em português é a mais completa e a mais atualizada. Existe também [`docs/en/`](../en/README.md), em inglês.
