---
description: "Contrato de carga de memória/contexto dos agentes AIOSON — tiers de loading (sempre / por-gatilho / sob-justificativa), política de retenção+arquivamento de memória append-style (current-state.md), matriz por agente e enforcement. Complementa agent-structural-contract."
scope: "governance"
agents: []
status: partially-implemented
implemented: "P0 (rollup), P1 (archive-awareness), tagging, tooling — shipped 2026-05 (v1.21.1)"
deferred: "P2 (mandatory slug-resolve pre-code), P3 (reflect-prompt hash+path), per-tier budget line in context:health"
---

# Agent Loading Contract

> Governança transversal de **quando** cada agente carrega **qual** camada de memória.
> Complementa `agent-structural-contract.md` (que cobre seções/observabilidade/handoff).
> Loaded por todos os agentes na seção "Project rules, docs & design governance".

## Por que existe

A doutrina lazy-load já está nos prompts ("never preload all at once", "cost discipline"),
mas **nunca foi estendida à bootstrap**. Resultado medido (2026-05-28, modo inception):

- `bootstrap/current-state.md` = **81 KB / ~33k tokens** = **84% da bootstrap**, log append-only de
  172 entradas. Lido **na ativação** por `@dev`, `@qa`, `@architect`, `@deyvin` — os agentes mais usados.
- `@product`/`@analyst`/`@neo` já leem só os arquivos pequenos (`what-is`/`what-it-does`) — disciplinados.
- Como `current-state` > cap de leitura (~25k tokens), quem "lê" recebe fatia **truncada e arbitrária**:
  paga caro **e** vê incompleto.
- `aioson context:health` mede `.aioson/context/*.md` mas **ignora `bootstrap/`** — subreporta o maior custo.

Dois modos de falha a corrigir:
- **Over-load:** leitura eager+completa de memória pesada independente da tarefa (desperdício).
- **Under-load:** contexto específico (dossier/spec da feature) só carrega se o agente *decidir* — gatilho
  heurístico, não forçado → trabalho sub-informado ("buraco no processo").

## Princípio

Toda camada de memória tem um **tier de carga** e um **gatilho**. Nada caro entra na ativação por padrão.
Memória que cresce por append tem **política de retenção** — não acumula para sempre no caminho quente.

## Os três tiers de carga

### Tier 0 — Sempre (orçamento ≤ ~2k tokens)
Orientação imediata e barata; responde "o que é + o que está acontecendo + o que falta":
- `bootstrap/what-is.md` — identidade do sistema
- `context/project-pulse.md` — último agente, feature ativa, blockers, próximo passo
- `context/dev-state.md` — estado da feature em desenvolvimento (o que está sendo feito / o que falta)

(O `.md` do próprio agente e `CLAUDE.md` são sempre carregados pelo harness — fora do orçamento.)

### Tier 1 — Por gatilho (carregar SÓ quando o gatilho dispara)

| Gatilho na tarefa | Carregar |
|---|---|
| Precisa de capacidades recém-shipadas (review, não re-descobrir) | `current-state.md` **só a seção HOT**; cold/archive por keyword |
| Raciocínio arquitetural/estrutural | `bootstrap/how-it-works.md` |
| Request nomeia/implica uma feature (slug) | `features/{slug}/dossier.md` + `spec-{slug}.md` (+ prd/requirements) |
| Implementação toca fronteiras de módulo/naming/reuse | `design-docs/*.md` (por relevância) |
| Rule cujo `agents:` inclui o agente ou é `[]` | aquela rule |
| Tarefa casa com um processo (SDD, secure-tdd, decision-presentation) | o SKILL correspondente |

### Tier 2 — Sob justificativa explícita (caro)
- `brain:query` (memória procedural) — antes de recomendações arquiteturais
- `git diff/log` — só quando memória+runtime são insuficientes ou o user pede histórico de commit
- **`current-state.md` completo + `current-state-archive.md`** — só quando um survey precisa do histórico inteiro
- scan artifacts (`scan-*.md`) — deep-dive brownfield

## Política de retenção de memória append-style (o coração)

> Responde diretamente: *"dá pra ir arquivando as partes do current-state.md que não são necessárias?"* — **sim.**

`current-state.md` (e qualquer arquivo de estado que cresce por append) tem **ciclo de vida por entrada**.
Uma entrada "Slice 3 da feature X shipou…" é HOT enquanto X está ativa; depois que X **fecha**, vira histórico —
valiosa para arqueologia, **desnecessária em toda ativação**.

**Estrutura HOT/COLD:**
- `bootstrap/current-state.md` (**HOT**) — apenas: features ativas (`in_progress`) + entradas dentro da
  janela recente (≥ último minor publicado **ou** ~últimos 45 dias). Alvo: **≤ ~10 KB**.
- `bootstrap/current-state-archive.md` (**COLD**) — todo o resto. Nunca carregado na ativação (Tier-2);
  permanece pesquisável via `memory:search` / grep.

**Gatilhos de rollup (mover HOT → COLD, nunca apagar):**
1. **Event-driven** — `feature:close` move as entradas daquela feature para o archive. Requer tag de slug
   por entrada (ver abaixo).
2. **Window-based** — verbo `memory:trim` (ou a etapa de reflexão da Living Memory, que já manda
   *"remove obsolete entries"* — hoje não honrado) aplica a janela de retenção a entradas legadas/sem tag.

**Tag de entrada (going-forward):** quem faz append (`@dev`, `@committer`, reflexão) prefixa a entrada com
`[{slug} · {YYYY-MM-DD}]` para tornar o rollup determinístico. Entradas legadas sem tag caem na regra de janela.

**Leitura:** Tier-1 lê só o HOT; o archive é Tier-2 (arqueologia/keyword).

> Generaliza: **toda memória que cresce por append precisa de política de retenção, não append infinito.**
> Pastas de feature, plans e dossiers já são arquivados em `done/` no `feature:close`; `current-state.md`
> é o único log *global* que ainda não tem rollup — esta política fecha essa lacuna.

## Matriz de loading por agente (sob o contrato)

| Agente | Tier-0 | Gatilhos Tier-1 típicos | Lê `current-state` completo? |
|---|---|---|---|
| @product, @analyst | what-is + (what-it-does) | dossier/spec se feature nomeada | ❌ nunca |
| @neo | what-is | — (roteador) | ❌ nunca |
| @deyvin | Tier-0 | HOT + dossier/spec por slug; pair-exec/debug docs por gatilho | só HOT (full = Tier-2) |
| @dev | Tier-0 + how-it-works | HOT + dossier/spec + rules(dev) + design-docs por toque | só HOT |
| @qa | Tier-0 | HOT (evitar re-flag de shipado) + área sob review | só HOT |
| @architect | Tier-0 + how-it-works | HOT + design-docs governança | só HOT |

## Gatilhos determinísticos (fecha o under-load)

Quando a request **nomeia ou implica** uma feature, o agente **DEVE** resolver o slug
(via `features.md` / `project-pulse.md`) e carregar `dossier` + `spec` **antes** de editar código.
Converte o gatilho de heurístico ("o agente decide") em contrato ("tem que resolver + carregar").
Usar `aioson context:pack . --agent=<a> --goal="<request>"` para obter o conjunto exato de arquivos.

## Enforcement & medição

- `aioson context:health` **DEVE** incluir `bootstrap/*.md` (hoje cego) + uma linha de **orçamento por tier**.
- Orçamentos: Tier-0 ≤ ~2k tokens; ativação (Tier-0 + prompt do agente) alvo ≤ ~8k tokens.
- `@qa` (Gate D) e `@sheldon` (enrichment) checam os prompts contra este contrato, como já fazem com
  `agent-structural-contract` — violação = finding Medium `recommended_owner: dev`, nunca bloqueia feature sozinha.

## Sequência de implementação (@dev — inception-mirror src/ + template/)

1. ✅ **P0 (maior retorno) — shipped v1.21.1:** `memory:trim` (engine + comando, split HOT/COLD) +
   hook de rollup no `feature:close` (keep=25, best-effort). Derrubou `current-state.md` 81KB→21KB.
2. ✅ **P1 — shipped v1.21.1:** seção "Bootstrap context" de @dev/@qa/@architect/@deyvin agora aponta
   pro `current-state-archive.md` (grep/`memory:search` on-demand). A reescrita pesada "ler parcial + grep
   head" foi dispensada — pós-trim o arquivo HOT já é pequeno.
3. ✅ **Tagging — shipped v1.21.1:** reflect-engine + @dev invariant #8 + @committer prefixam
   entradas com `[{slug} · {YYYY-MM-DD}]`.
4. ✅ **Tooling — shipped v1.21.1:** `context:health` mede `bootstrap/` e exclui o archive frio.
   (⬜ linha de orçamento por tier ainda não.)
5. ⬜ **P2 (adiado):** tornar a resolução de slug + load de dossier/spec obrigatória no pré-código.
6. ⬜ **P3 (adiado):** `reflect-prompt.json` guardar hash+path em vez do snapshot completo.

## Não-objetivos / adiado

- Mudar o **conteúdo** ou schema da memória (só a política de carga/retenção).
- Memória cross-project; seleção de contexto por LLM; file-watcher.
- Tocar @product/@analyst/@neo (já disciplinados) além do alinhamento de referência a este doc.
- **Apagar** histórico — arquivamento move, nunca deleta (arqueologia preservada e pesquisável).
