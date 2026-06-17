# Autopilot Handoff — Encadeamento automático de agentes

> Protocolo opt-in que elimina confirmações manuais de handoff nos segmentos determinísticos do workflow de feature.

Introduzido na v1.21.x, completado na v1.22.0 (com @pm no MEDIUM). Quando ativado, os agentes do pré-dev e do ciclo pós-dev se encadeiam automaticamente — cada um termina, emite um aviso de transição e invoca o próximo. As decisões genuinamente humanas (entrada no `@dev` e `feature:close`) permanecem manuais.

---

## Ativação

O autopilot é opt-in. Para ativar, adicione ao `project.context.md`:

```yaml
auto_handoff: true
```

Sem essa flag (ou com `false`), o comportamento padrão é handoff manual — cada agente para e espera você invocar o próximo. O `aioson doctor` emite um aviso `context:auto_handoff_declared` se o protocolo estiver instalado mas a flag não for declarada.

**Pré-requisitos adicionais para ativação de cada handoff:**
1. O workflow de feature deve estar ativo (slug conhecido, classificação SMALL ou MEDIUM).
2. O gate/verdict do agente atual deve ter passado.

---

## Dois segmentos

### Segmento 1 — Cadeia pré-dev

```
@analyst → @scope-check → @architect → @discovery-design-doc
        [→ @pm  (apenas MEDIUM)]
              ↓
        STOP — human entra com /dev
```

A cadeia pré-dev **sempre para antes do primeiro `@dev`**. O desenvolvedor faz `/compact` quando continua a mesma feature e inicia a implementação a partir do pacote/checkpoint de contexto — `@dev` é pesado e se beneficia de um handoff operacional compacto. Use `/clear` apenas para reset forte, troca de feature, contexto poluído ou reset sensível a segurança.

### Segmento 2 — Ciclo de revisão pós-dev (hub = @qa)

Uma vez que o `@dev` inicial termina, o autopilot retoma automaticamente:

| Agente atual | Condição | Próximo invocado |
|---|---|---|
| `@dev` (1ª passagem) | testes ok, sem correções abertas | `@qa` |
| `@dev` (correções) | correções aplicadas, testes ok | `@qa` (re-verificação) |
| `@qa` | FAIL (Critical/High) | `@dev` via ciclo de correções (cap 2) |
| `@qa` | PASS + trigger `@tester` não executado | `@tester` |
| `@qa` | PASS + trigger `@pentester` não executado | `@pentester` |
| `@qa` | PASS + contrato harness presente + `@validator` não PASS | `@validator` |
| `@qa` | PASS + sem pendências | **STOP** — recomenda `aioson feature:close` |
| `@tester` | bloqueios do dev | `@dev` |
| `@tester` | sem bloqueios | `@qa` (re-avaliação) |
| `@pentester` | findings abertos do dev | `@dev` |
| `@pentester` | sem findings do dev | `@qa` (re-avaliação) |
| `@validator` | PASS | **STOP** — recomenda `aioson feature:close` |
| `@validator` | FAIL | `@dev` |

`@tester` e `@pentester` só executam quando os seus triggers disparam (`@qa` identifica gaps de cobertura → `@tester`; superfície sensível auth/secrets/data → `@pentester`).

### Protocolo de contexto fresco do @validator

O `@validator` roda em contexto **fresco e isolado** (subagente/Task tool ou sessão separada), nunca inline na sessão que implementou — o histórico de implementação enviesa o veredito. Quando o autopilot roteia para `@validator`, a sequência é:

```
harness:check                  → roda os criteria[].verification deterministicamente (exit code = veredito)
  ↓
harness:validate               → gera validator-prompt.txt com REVIEW PAYLOAD autocontido:
                                   (a) resultados do harness:check
                                   (b) lista de arquivos alterados (untracked incluídos, .aioson/** filtrado)
                                   (c) diff unificado vs base resolvida (--base > baseline.json > merge-base > HEAD)
  ↓
execução isolada em subagente  → @validator julga só os critérios sem verification, em contexto limpo
  ↓
harness:validate (de novo)     → consome o veredito pelo circuit breaker (waiting_validation/apply-validation)
```

O review payload torna o prompt do validador **autocontido**: ele não precisa explorar o repositório. O diff tem teto de tamanho (`--max-diff-bytes`, default 200KB, truncamento em fronteira de linha); `--no-diff` omite o diff; fora de repo git, degrada graciosamente. A máquina de estados `waiting_validation`/`apply-validation` permanece inalterada.

---

## Condições de parada

O autopilot interrompe a cadeia e emite o handoff manual normal quando:

1. **`feature:close` / publish** — sempre gate humano. `@qa` PASS sem pendências ou `@validator` PASS → STOP, recomenda `aioson feature:close`.
2. **Primeira entrada em `@dev`** — a cadeia pré-dev para aqui.
3. **Cap de correções atingido** — ciclo `@qa` ↔ `@dev` limitado a 2 rounds.
4. **Finding crítico de segurança** — keywords auth/secret/credential/session/password/token/PII detectados pelo gate de segurança do `@qa` → STOP, requer intervenção humana.
5. **Verdict não passou** — `@scope-check` não aprovado, `@architect` Gate B bloqueado, `@discovery-design-doc` readiness bloqueado, `@pm` Gate C bloqueado, `@validator` FAIL sem caminho seguro → STOP, roteamento manual.
6. **Orçamento de contexto** — uso ≥ `context_warning_threshold`: grava checkpoint em `last-handoff.json`, STOP, recomenda `/compact` para continuidade na mesma feature. A próxima sessão reentra no autopilot automaticamente. Use `/clear` apenas para reset forte, troca de feature, contexto poluído ou reset sensível a segurança.
7. **Ambiguidade** — estado do workflow indisponível ou qualquer decisão real requer input humano → STOP.

O usuário pode interromper a qualquer momento com Ctrl+C. O autopilot nunca retenta uma invocação interrompida.

---

## Como os agentes se encadeiam

Quando autopilot está ativo e nenhuma condição de parada aplica:

1. O agente termina suas responsabilidades (artefatos em disco, gate, dossier, `pulse:update`, `agent:done`).
2. Emite: `Autopilot: @<atual> done → invocando @<próximo> (Ctrl+C para interromper)`.
3. Invoca `Skill(aioson:agent:<próximo>)` com contexto `"continue feature {slug} — autopilot handoff from @<atual>"`.

O roteamento é **determinístico** — nunca escolhido pelo modelo. O próximo agente vem do state machine do workflow (`workflow.state.json` ou `aioson workflow:status .`), não de julgamento do LLM.

---

## Rastreamento via CLI

```bash
# Ver estado atual do workflow (qual agente está ativo)
aioson workflow:status .

# Avançar manualmente (quando autopilot está desligado)
aioson workflow:next .

# Ver handoff preparado pelo agente anterior
cat .aioson/context/last-handoff.json
```

---

## Exemplo: feature MEDIUM com autopilot ativo

```
Você > /analyst  (start)

@analyst  → scope + domain → STOP pré-dev (autopilot para @analyst)
@scope-check → pre-dev check → autopilot: invocando @architect
@architect   → Gate B PASS → autopilot: invocando @discovery-design-doc
@discovery-design-doc → readiness ok → autopilot: invocando @pm (MEDIUM)
@pm          → Gate C PASS → STOP — "Recomendo /compact e /dev"

Você > /compact
Você > /dev  (implementação manual — contexto limpo)

@dev → testes ok → autopilot retoma: invocando @qa
@qa  → PASS + nenhum trigger → STOP — "Execute: aioson feature:close . --feature=..."

Você > aioson feature:close . --feature=minha-feature
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

- [SDD Framework](./sdd-framework.md) — sequência completa MICRO/SMALL/MEDIUM
- [Comandos CLI](./comandos-cli.md) — `workflow:next`, `workflow:status`, `workflow:heal`
- [Motor Hardening](./motor-hardening.md) — gates técnicos e auto-cura
