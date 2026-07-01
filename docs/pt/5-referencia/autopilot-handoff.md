# Autopilot Handoff — o full-feature autopilot

> Protocolo opt-in que remove as confirmações **mecânicas** de handoff em toda a cadeia de uma feature — do `@product` até a recomendação de `aioson feature:close`. Decisões humanas genuínas (escopo, sizing) continuam acontecendo dentro dos próprios agentes; o autopilot só remove o "roda o próximo passo" depois que o trabalho do agente atual já está resolvido. `feature:close`/publish **nunca** roda sozinho — é sempre gate humano.

---

## Dois segmentos

```
Segmento 1: @product → @sheldon (SMALL) / @orchestrator (MEDIUM) → @dev
Segmento 2: @dev → @qa (hub) → @tester / @pentester (quando o trigger dispara) → @validator → STOP
```

1. **Cadeia spec → dev** — cada agente de spec, uma vez resolvidas as próprias decisões (sem `AskUserQuestion` aberta, gates que ele possui aprovados), semeia o esquema agêntico e invoca o próximo estágio em vez de parar. A travessia pré-dev acontece pelo pacote `dev-state.md`, não carregando o chat bruto adiante.
2. **Ciclo de revisão pós-dev** — `@dev` e os agentes de revisão se encadeiam automaticamente até a feature estar pronta para fechar. `@qa` é o hub: possui o roteamento para os agentes especializados e o ciclo de correções.

Historicamente o Segmento 1 sempre parava no humano (os agentes de spec terminavam em decisões humanas); hoje o autopilot atravessa esse segmento também — mas só mecanicamente. Uma decisão real de produto/escopo/sizing sempre pausa antes de qualquer auto-invocação.

---

## Ativação

Autopilot está ativo quando as duas primeiras condições valem, com a terceira como gate:

1. **Sinal de autopilot armado** — `auto_handoff: true` no `project.context.md` (flag do projeto), **ou** `.aioson/context/workflow-execute.json` existe com `agentic_policy.enabled: true` **e `feature` igual ao slug atual** (esquema semeado — um esquema deixado por outra feature/já fechada **não conta**, para nenhum agente da cadeia). **O desarme por feature vence a flag:** um esquema para o slug atual com `agentic_policy.enabled: false` (escrito por `aioson workflow:execute . --feature={slug} --seed --step`) desliga o autopilot **só para essa feature**, mesmo com `auto_handoff: true` no projeto.
2. Um workflow de feature está ativo (slug conhecido).
3. O gate/veredito do agente atual passou **e** não há decisão humana genuína em aberto (ver condições de parada).

### Token inline de modo de execução (maior precedência)

Um `--auto` ou `--step` isolado nos argumentos de ativação do `@product` (kickoff) ou do `@dev` (entrada tardia/override) **é** a decisão de modo de execução — o agente remove o token do texto da tarefa e nunca pergunta:

| Token | Onde | Efeito |
|---|---|---|
| `/product --auto <tarefa>` | Kickoff da feature | Pula a pergunta na tela; semeia o esquema e arma toda a cadeia a partir dali |
| `/product --step <tarefa>` | Kickoff da feature | Pula a pergunta; grava o esquema desarmado (`agentic_policy.enabled: false`) — handoff manual |
| `/dev --auto` | Entrada em `@dev` | Arma o autopilot a partir daqui mesmo sem flag/esquema prévio — implementação + ciclo de revisão pós-dev rodam sozinhos |
| `/dev --step` | Entrada em `@dev` | Desarma o autopilot **só para esta feature** — para no handoff `@dev → @qa` mesmo em projeto com `auto_handoff: true` (o desarme por feature sempre vence a flag do projeto) |

Agentes downstream (`@qa`/`@tester`/`@pentester`/`@validator`) não parseiam tokens — eles só leem a flag/esquema já decidido. Só `@product` pergunta; os demais nunca re-perguntam.

### Sem token: a pergunta acontece uma única vez, no handoff do `@product`

Quando não há token inline nem escolha padrão registrada, `@product` pergunta on-screen ao fechar o PRD (`AskUserQuestion`, localizado, com marcador de recomendação):

- **Autopilot — roda tudo até `feature:close`** → roda as ações de autopilot só para esta feature (não persiste default).
- **Passo a passo — eu conduzo cada etapa** → apresenta o handoff manual e para.
- **Sempre autopilot neste projeto** → grava `auto_handoff: true` no `project.context.md` (cria a linha se ausente) e roda as ações de autopilot.

Precedência completa, da mais forte para a mais fraca:

```
1. Token inline (--auto / --step)
2. Esquema por feature (.aioson/context/workflow-execute.json com feature={slug}) — armado ou desarmado
3. Flag do projeto (auto_handoff: true/false em project.context.md)
4. Pergunta on-screen do @product (quando nada dos 3 acima está definido)
```

---

## Semeando o esquema agêntico

O primeiro agente de spec a terminar sob autopilot semeia o contrato do run — o "esquema" que toda a cadeia segue, e o que torna uma feature construída do jeito normal (`@product → @sheldon`/`@orchestrator` → …) rodar até `feature:close` sem você precisar invocar nada:

```bash
aioson workflow:execute . --feature={slug} --seed --tool=<tool>
```

`--seed` grava `.aioson/context/workflow-execute.json` (com `agentic_policy.enabled: true` — caps do ciclo de revisão, `feature_close: human_gate`, condições de parada) mais `.aioson/context/workflow.state.json`. É **seed-only**: registra a política que os agentes interativos seguem, mas **não** dirige as transições de estágio sozinho (quem faz isso são os próprios agentes, via `Skill(aioson:agent:<próximo>)` + `aioson workflow:next . --complete=<agente>`). Re-semear o mesmo slug é idempotente.

**Falha ao semear é condição de parada.** O agente que semeia checa o resultado do comando: uma falha `different_active_feature` significa que outra feature genuinamente ativa segura o `workflow.state.json` — expõe isso ao usuário (fechar/pausar essa feature, ou `aioson feature:sweep .`) e para com o handoff manual. Nunca continue a cadeia como se o autopilot estivesse armado quando o seed falhou.

---

## Roteamento — determinístico, nunca escolhido pelo modelo

O próximo agente vem da máquina de estados do workflow e da evidência em disco, nunca de julgamento do LLM:

- CLI disponível: rode `aioson workflow:next .` (modo inspeção) e use o estágio reportado, ou o campo `next` de `.aioson/context/workflow.state.json`.
- CLI ausente: siga a sequência de classificação em `.aioson/config.md` e as tabelas de roteamento abaixo, exatamente.

Nunca pule um estágio, reordene, ou escolha um agente que a máquina de estados/tabela não nomeou.

---

## Segmento 1 — cadeia spec → dev

**SMALL (lane lean, padrão):** `@product` → `@sheldon` → `@dev`. Sob autopilot: `@product`, com o PRD resolvido, semeia o esquema e invoca `@sheldon`; `@sheldon`, com sizing/enriquecimento confirmados e o pacote lean + `dev-state.md` gravados, completa o próprio estágio (`aioson workflow:next . --complete=sheldon`) e invoca `@dev`. O detour opt-in full-merged do SMALL encadeia `@analyst` → `@architect` → `@dev` quando ativado (com `@scope-check`/`@discovery-design-doc` só se a sequência os inclui).

**MEDIUM (lane maestro, padrão):** `@product` → `@orchestrator` → `@dev`. Sob autopilot: `@product` semeia e invoca `@orchestrator`; `@orchestrator`, com o pacote de spec com gates aprovados (Gates A/B/C, readiness pronta) + `dev-state.md` gravados, invoca `@dev`. O fan-out para `@analyst`/`@architect`/`@pm` acontece como sub-agentes, não como estágios do workflow — eles só encadeiam como estágios sob um detour opt-in full-chain.

A travessia para `@dev` passa pelo pacote `dev-state.md` que o agente de spec grava — o protocolo de início de sessão do `@dev` carrega só esse pacote mínimo, então `@dev` não herda o chat pesado anterior; auto-compact transparente cuida do resto. É por isso que a travessia é segura sem um `/compact` manual. O agente de spec ainda para com o handoff manual normal se tiver uma decisão de produto/escopo/sizing em aberto, ou um gate que ele possui não aprovado. Recomende `/clear` só para reset forte, troca de feature, contexto poluído ou reset sensível a segurança.

---

## Segmento 2 — ciclo de revisão pós-dev (hub = `@qa`)

Uma vez que um humano inicia `@dev` e ele termina, a cadeia retoma automaticamente. `@qa` é o hub; cada agente especializado volta para ele.

| Agente atual | Condição | Próximo invocado |
|---|---|---|
| `@dev` (1ª passagem) | testes ok, gates limpos, sem ciclo de correções aberto | `@qa` |
| `@dev` (correções) | correções aplicadas, testes ok | `@qa` (re-verificação) |
| `@qa` | veredito **FAIL** (Critical/High) | `@dev` via ciclo de correções (cap 3, gate de segurança) |
| `@qa` | veredito **PASS** + trigger `@tester` dispara e ainda não rodou limpo | `@tester` |
| `@qa` | veredito **PASS** + trigger `@pentester` dispara e ainda não rodou limpo | `@pentester` |
| `@qa` | veredito **PASS** + contrato harness presente e `@validator` ainda não PASS | `@validator` |
| `@qa` | veredito **PASS** + nenhum trigger/contrato pendente | **STOP** — recomenda `aioson feature:close . --feature={slug}` |
| `@tester` | gaps bloqueantes de propriedade do dev | `@dev` |
| `@tester` | sem gaps bloqueantes | `@qa` (reavaliação/sign-off) |
| `@pentester` | findings abertos com `recommended_owner = dev` | `@dev` |
| `@pentester` | sem findings abertos do dev | `@qa` (reavaliação/sign-off) |
| `@validator` | PASS | **STOP** — recomenda `aioson feature:close` |
| `@validator` | FAIL | `@dev` |

**Origem do trigger para `@tester`/`@pentester`:** a lógica de trigger do `@qa` já existente (gaps de cobertura → `@tester`; superfície sensível auth/secrets/data/upload/URL externa/supply-chain → `@pentester`). Os quatro agentes estão **sempre** ligados na cadeia, mas `@tester`/`@pentester` só **executam** quando o trigger dispara — do contrário `@qa` pula direto para a próxima linha de roteamento.

**Guarda de reentrada (sem loop infinito):** antes de auto-invocar um agente especializado, `@qa` checa evidência em disco de que ele já rodou limpo neste ciclo (`security-findings-{slug}.json` limpo → `@pentester` feito; artefato de cobertura do tester presente sem gap novo → `@tester` feito; `progress.json.ready_for_done_gate`/PASS do validador registrado → `@validator` feito). Um agente que já retornou limpo não é reinvocado.

**`@validator` roda em contexto fresco:** ao rotear para `@validator` com contrato de harness presente, não rode inline na sessão atual — o histórico de implementação enviesa o veredito. A sequência: `harness:check` (checks determinísticos) → `harness:validate` (gera `validator-prompt.txt` autocontido: critérios + resultados do check + diff vs. base) → execução em **subagente isolado** (Task tool, sem contexto de conversa) que grava o veredito em `last-validator-output.json` → `harness:validate` de novo, para consumir o veredito pelo circuit breaker. Clientes sem suporte a subagente caem para `Skill(aioson:agent:validator)` numa sessão fresca, como antes.

---

## Condições de parada — quebram a cadeia e emitem o handoff manual normal

1. **`feature:close`/publish** — SEMPRE o gate humano. Quando `@qa` (PASS, nada pendente) ou `@validator` (PASS) é o último passo limpo, STOP e recomenda `aioson feature:close . --feature={slug}`. Nunca roda `feature:close`, `feature:archive`, `npm publish`, ou qualquer ação de publish/close sozinho.
2. **Decisão humana genuína em aberto** — um agente de spec com pergunta de produto/escopo/sizing não resolvida (uma `AskUserQuestion` aberta, ou um gate que ele possui ainda não aprovado) resolve essa decisão com o humano antes de qualquer auto-invocação, e para com o handoff manual normal. Autopilot remove paradas mecânicas, nunca decisões reais.
3. **Cap de correções atingido** — ciclos de revisão são limitados por `agentic_policy.review_cycle` (default **3**); quando `review-cycle:advance` retorna `stop_cycle_limit`, para e escala para o humano.
4. **Finding crítico de segurança** — o gate de segurança de correções do `@qa` (keywords auth/secret/credential/session/password/token/PII/encryption) bloqueia o auto-loop; para e exige intervenção humana.
5. **Veredito não limpo / gate ou readiness bloqueado** — o pacote de spec maestro do `@orchestrator` sem Gates A/B/C aprovados ou com readiness `blocked`, `@validator` FAIL sem caminho seguro de correção (e, quando presentes como detours, `@architect` Gate B/readiness modo-merged `blocked`, `@pm` Gate C bloqueado, `@scope-check` não `approved`/`patched`, ou `@discovery-design-doc` readiness `blocked`): para e roteia ao dono manualmente.
6. **Orçamento de contexto** — uso estimado ≥ `context_warning_threshold` (`.aioson/config.md`): grava o checkpoint de compactação em `.aioson/context/last-handoff.json`, para, e recomenda `/compact` para continuar a mesma feature. O workflow retoma de `.aioson/context/workflow.state.json` — a próxima sessão reentra no autopilot automaticamente. Recomende `/clear` só para reset forte, troca de feature, contexto poluído ou reset sensível a segurança.
7. **Ambiguidade** — estado do workflow indisponível e roteamento ambíguo, ou qualquer decisão real exige input do usuário: para e pergunta, manualmente.

Você pode interromper a qualquer momento com Ctrl+C; o autopilot nunca retenta uma invocação interrompida.

---

## Opção `--help` nos 13 agentes mais usados

Uma ativação com `--help` isolado (`/<agente> --help`) faz o agente imprimir um bloco de ajuda rápido — o que faz / quando usar / opções / chamada típica / o que produz / próximo agente —, localizado no seu idioma, e parar sem fazer nenhum trabalho. Isso vale para os 13 agentes mais usados, fonte única em `.aioson/docs/agent-help.md`:

```
@product · @briefing · @briefing-refiner · @dev · @deyvin · @discover ·
@neo · @orache · @orchestrator · @tester · @pentester · @qa · @sheldon
```

Cada agente imprime **só a própria seção**, nunca o arquivo inteiro. Fichas individuais em [`4-agentes/`](../4-agentes/README.md) linkam para essa referência quando relevante.

---

## Confiabilidade

Três ajustes de confiabilidade que afetam diretamente quem usa o autopilot:

- **Estado de workflow obsoleto não bloqueia mais a próxima feature.** Um `workflow.state.json` deixado por uma feature já fechada/abandonada é descartado e re-semeado automaticamente — só uma feature *genuinamente* ativa e diferente (aparece como `in_progress` em `features.md`) segue gerando o refuso `different_active_feature`. Nesse caso, a orientação é fechar/pausar a feature ativa ou rodar:

  ```bash
  aioson feature:sweep .
  ```

- **`aioson update` agora informa exatamente qual template chegou**, incluindo o build exato de uma instalação `npm link`:

  ```
  Template version applied: 1.36.0 (a1b2c3d, 2026-07-01)
  ```

  (o `(sha, data)` só aparece quando a instalação vem de um checkout git — ex.: dogfooding via `npm link`; instalações normais via npm mostram só a versão semântica.)

- **A lane lean não regride mais para `@sheldon` depois da implementação.** Antes, nada resolvia o estágio `sheldon` na máquina de estados, então `aioson workflow:next --complete=dev` reativava `@sheldon` (uma ativação para trás). O estágio `sheldon` agora é reconhecido como concluído junto com o resto da cadeia — completar um estágio posterior nunca deixa `next` apontando para um estágio anterior já resolvido.

---

## Como os agentes se encadeiam

Quando autopilot está ativo e nenhuma condição de parada aplica:

1. O agente termina suas responsabilidades de fechamento primeiro (artefatos em disco, registro de gate, dossier/spec atualizados, `agent:epilogue`/`agent:done`).
2. Se o checkpoint do runtime contém `agentic_policy.enabled=true`, deixa o gateway continuar a partir de `.aioson/context/workflow-execute.json` — não pergunta ao usuário para confirmar o próximo estágio determinístico.
3. Sem gateway de runtime disponível, emite um aviso de transição de uma linha: `Autopilot: @<atual> done → invocando @<próximo> (Ctrl+C para interromper)`.
4. Invoca `Skill(aioson:agent:<próximo>)` com a tarefa `"continue feature {slug} — autopilot handoff from @<atual>"`. Sem pergunta ao usuário — Ctrl+C interrompe.

---

## Rastreamento via CLI

```bash
# Ver estado atual do workflow (qual agente está ativo)
aioson workflow:status .

# Semear o esquema agêntico sem avançar (agentes de spec fazem isso ao terminar)
aioson workflow:execute . --feature=checkout --seed --tool=claude

# Semear já desarmado (equivalente ao token --step)
aioson workflow:execute . --feature=checkout --seed --step --tool=claude

# Avançar manualmente (quando autopilot está desligado)
aioson workflow:next .

# Limpar workflow.state.json obsoleto de features já fechadas/abandonadas
aioson feature:sweep .

# Ver handoff preparado pelo agente anterior
cat .aioson/context/last-handoff.json
```

---

## Exemplo: feature SMALL com autopilot ativo do início ao fim

```
Você > /product --auto build email notifications

@product > PRD fechado. Modo Autopilot (token inline) — sem pergunta.
           Semeando esquema... invocando @sheldon.

@sheldon > Gates A/B/C aprovados. dev-state.md gravado.
           Autopilot: @sheldon done → invocando @dev.

@dev     > Loop de fases: 3 fases implementadas em sequência, sem parar.
           Testes verdes. Autopilot: @dev done → invocando @qa.

@qa      > PASS. Nenhum trigger de @tester/@pentester disparou. Sem harness-contract pendente.
           STOP — "Recomendo: aioson feature:close . --feature=email-notifications"

Você > aioson feature:close . --feature=email-notifications
```

---

## Exemplo: feature MEDIUM, escolha feita on-screen no handoff do `@product`

```
Você > /product

@product > [conduz o PRD...] PRD fechado. Classificação: MEDIUM.
           Como você quer rodar esta feature?
           1. Autopilot — rodar tudo até feature:close (recomendado)
           2. Passo a passo — eu conduzo cada etapa
           3. Sempre autopilot neste projeto

Você > 3

@product > Gravado auto_handoff: true em project.context.md.
           Semeando esquema... invocando @orchestrator.

@orchestrator > Fan-out @analyst + @architect + @pm (+ @ux-ui). Gates A/B/C aprovados.
                Autopilot: @orchestrator done → invocando @dev.

@dev          > Implementado. Autopilot: @dev done → invocando @pentester (inline no MEDIUM).

@pentester    > Sem findings HIGH/CRITICAL. Autopilot: @pentester done → invocando @qa.

@qa           > PASS. Harness-contract presente, @validator ainda não PASS → invocando @validator.

@validator    > Contexto fresco e isolado. harness:check + julgamento LLM dos critérios sem verification.
                PASS. STOP — "Recomendo: aioson feature:close . --feature=..."
```

---

## Lane B — execução compilada (alternativa opt-in)

Para features **MEDIUM**, existe uma lane de execução alternativa ao autopilot em tempo real: a **Lane B**, acionada pelo agente `@forge-run` (`/forge-run`). Em vez de encadear agentes vivos, o `@forge-run` **compila** os artefatos da feature num `.aioson/plans/{slug}/forge-run.workflow.js` (via `aioson forge:compile`) e o executa pelo runtime de workflows.

O workflow compilado embute o mesmo ciclo de revisão: um `parallel()` por Wave → convergência no `harness:check` → revisão adversarial de 3 lentes para critérios binários sem `verification` → validador fresh-context fechando por `harness:validate` → `apply-validation`. Como a lane normal, ele **nunca** roda `feature:close`/publish: PASS recomenda o humano rodar `feature:close`; FAIL volta ao `@dev` pela lane normal. Uma feature por run.

Quando preferir cada uma:
- **Autopilot (lane normal)** — handoffs determinísticos entre agentes vivos; padrão para SMALL e MEDIUM.
- **Lane B (`@forge-run`)** — execução compilada, reproduzível e versionável de uma feature MEDIUM; opt-in, com aviso de custo antes de rodar.

Veja [SDD Automation Scripts — forge:compile](./sdd-automation-scripts.md#forgecompile-lane-b).

---

## Próximos passos

- [SDD Framework](./sdd-framework.md) — sequência completa MICRO/SMALL/MEDIUM e as lanes lean/maestro
- [Comandos CLI](./comandos-cli.md) — `workflow:next`, `workflow:execute`, `feature:sweep`
- [Motor Hardening](./motor-hardening.md) — gates técnicos e auto-cura
- [Ficha do @product](../4-agentes/product.md) — onde o modo de execução é decidido
- [Ficha do @dev](../4-agentes/dev.md) — `--auto`/`--step` na entrada da implementação
