# Task: Squad Eval

> Portão de qualidade source-grounded: deriva uma rubrica das próprias fontes do squad e julga cada executor com júri multi-modelo. Versão *enforçada* do quality-lens. Opt-in / CI.

## Quando usar
- `@squad eval <slug>` — invocação direta
- Antes de entregar/publicar um squad, ou em CI como gate
- Após `@squad analyze` apontar executores básicos e `@squad refresh` aplicar correções (re-verificar)

## Pré-carregamento obrigatório
Carregue `.aioson/docs/squad/eval-gate.md` (o método) e `.aioson/docs/squad/package-contract.md` § Executor depth block.

## Entrada
- slug de um squad existente em `.aioson/squads/<slug>/`

## Processo

### Passo 1 — Reunir contexto-fonte
Leia `squad.manifest.json` (incl. `sourceDocs`, `analysis`, executores + `traces`/`confidence`), `squad.md`, os prompts em `agents/<executor>.md`, e os `sourceDocs`/investigation quando existirem.

### Passo 2 — Sintetizar a rubrica
Para cada executor, extraia os claims atômicos com citação à fonte conforme `eval-gate.md` § Step 1. Cubra os kinds `responsibility`, `depth`, `grounding`, `handoff`, `anti_pattern`, `scope`. Claim sem fonte para citar → não invente, descarte.

### Passo 3 — Julgar
Grade cada executor conforme `eval-gate.md` § Step 2. Se o squad tem (ou pode declarar) um executor `reviewer` com `cross_ai`, use o júri multi-modelo real (claude/gemini/codex); senão, simule o júri de 3 lentes adversariais (correctness / grounding / skeptic). Pondere por concordância; marque claims divididos como `uncertain`.

### Passo 4 — Gate + relatório
Calcule coverage/agreement e o veredito (PASS/WARN/FAIL) por executor e do squad conforme `eval-gate.md` § Step 3. Salve `.aioson/squads/<slug>/docs/EVAL-<ISO-date>.md`:

```
---
slug: <slug>
created_at: <ISO-date>
verdict: PASS | WARN | FAIL
coverage: <0-1>
agreement: <0-1>
---
# Eval-Gate — <slug> — <date>

## Verdict: <PASS|WARN|FAIL>  (coverage <x>, agreement <y>)

## Per-executor
| Executor | Coverage | Unmet claims | Verdict |
|---|---|---|---|
| <slug> | 6/7 | c3 (grounding) | WARN |

## Actionable diffs (route to @squad refresh)
- <executor> claim <id> (<kind>) unmet → <what to add>

## Uncertain (human glance — jury split)
- <executor> claim <id> — <why split>
```

### Passo 5 — Rotear correções e aprender
Para cada claim FAIL/unmet, recomende `@squad refresh <slug>` com o diff específico. Não corrija aqui — eval só julga e roteia (igual validate; refresh aplica). Depois, capture a lição *generalizada* no playbook do gerador: `aioson squad:playbook capture --rule="<regra de geração que causou>" --lesson="<o que fazer no lugar>" --from=<slug>/<claim>` — a regra, não o conserto específico daquele squad.

## Saída
- `.aioson/squads/<slug>/docs/EVAL-<date>.md`
- Veredito no chat + próximos comandos

## Regras
- NÃO corrija nada — apenas julgue e roteie (refresh aplica)
- A régua vem das fontes — claim sem citação não entra
- Veredito FAIL se qualquer claim de `depth` ou `grounding` falhar (executor básico/sem fonte reprova)
- Reporte coverage + agreement + breakdown por kind — nunca um número só
- Eval verifica fidelidade ao spec/fonte, NÃO performance real — recomende alguns checks de execução antes de produção
- Atualize o rubricário quando as fontes mudarem (régua velha aprova squad que derivou)
