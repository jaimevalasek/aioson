---
slug: harness-retrospective-optimization
created_at: 2026-06-10
updated_at: 2026-06-10
source_plans: ["plans/HarnessEngineering.txt"]
---

# Briefing — Harness Retrospective Optimization (RHO-lite + Intelligent Preview)

## Context

O AIOSON acabou de fechar `loop-guardrails` (v1.22.0 prep, Gate D aprovado 2026-06-10): o harness agora tem guardrails contract-driven no `self:loop`, circuit-breaker com assinaturas sha1 de falha, artefatos por tentativa em `attempts/{n}/`, human gates persistidos, enforcement de `cost_ceiling_tokens` e telemetria SQLite contínua. Ou seja: o framework **já produz uma trilha de erros estruturada e auditável** — exatamente a matéria-prima que a literatura recente de Harness Engineering diz ser o próximo diferencial.

O gatilho deste briefing: a pesquisa `plans/HarnessEngineering.txt` (validada via web em 2026-06-10 — ver `researchs/harness-engineering-rho-2026/summary.md`) confirma três fatos externos relevantes:

1. **RHO existe e funciona** — "Retrospective Harness Optimization" (arXiv 2606.05922, Microsoft Research Asia): agentes melhoram o próprio harness analisando trajetórias passadas, sem ground-truth labels, via self-validation + self-consistency + self-preference. Uma passada retrospectiva: SWE-Bench Pro 59% → 78%.
2. **O harness domina o resultado** — estudo Stanford/Tsinghua: mesmo modelo, até 6x de diferença conforme o harness.
3. **O paradigma tem nome e tração** — "harness engineering" (Hashimoto, fev/2026): cada erro do agente vira fix permanente no ambiente, eliminando a classe de erro.

O AIOSON já pratica o item 3 manualmente (é a história de quase toda feature dos últimos 2 meses). O que não existe é o item 1: **fechar o loop automaticamente sobre a trilha que já é coletada**.

Decisão estratégica herdada que este briefing respeita: `cursor3-harness-evolution` (documented-only, 2026-05-18) fixou "AIOSON enriquece sem mudar foco" — nada aqui copia substrato de IDE/cloud; os dois temas operam sobre primitivos que já existem.

## Problem

**Tema 1 — a trilha de falhas é write-only.** O AIOSON registra FAILs de QA, trips de circuit-breaker, correções C-01..C-NN, gate blocks, devlogs e learnings — mas nenhum mecanismo minera essa trilha para propor melhorias no harness (prompts, contratos, regras). O loop de melhoria existe apenas: (a) manual, quando o operador percebe um padrão; (b) local por subsistema (`squad:playbook capture` fecha o loop só para geração de squads; learnings de devlog promovem gotchas, mas `learnings/INDEX.md` está vazio hoje). Resultado: classes de erro se repetem entre features até alguém notar — ex.: o padrão "feature implementada mas silenciosamente inativa" já apareceu ao menos 2x (C-01 guards inactive em loop-guardrails; `auto_handoff` instalado mas não declarado).

JTBD: *"Quando uma feature fecha com retrabalho registrado (FAILs, correções, trips), quero que o framework analise a própria trilha e proponha correções no harness, para que a mesma classe de erro não volte na feature seguinte."*

**Tema 2 — outputs grandes degradam sinal/ruído.** Logs de teste, outputs de comando e artefatos de tentativa entram inteiros no contexto dos agentes. A pesquisa multi-agent-token-budget já mediu amplificação de 4–15x no consumo de tokens sem disciplina de contexto; o trabalho de `memory:trim` (hot/cold) resolveu isso para o bootstrap, mas não existe padrão equivalente para **outputs de ferramenta**: "salva o artefato completo em disco, injeta só um preview, deep-dive sob demanda".

## Proposed solution

Dois temas independentes, ambos reusando primitivos existentes — nenhum cria runtime de inferência próprio (o LLM continua sendo o cliente IA; a CLI fica determinística).

**Tema 1 — `harness:retro` (RHO-lite):** comando determinístico que minera a trilha de uma ou N features fechadas (execution_events do `aios.sqlite`, `attempts/{n}/`, QA sign-offs, corrections plans, devlogs) e materializa um **dossiê retrospectivo** (`.aioson/context/retro/{slug}.md`): falhas agrupadas por assinatura, correções aplicadas, custo de retrabalho estimado. Um agente (ou seção no fluxo de `feature:close`) lê o dossiê e propõe deltas de harness — mudança de prompt, regra nova em `.aioson/rules/`, claim novo em contrato — **sempre gated por aprovação humana**, coerente com a decisão registrada no roadmap squad-self-improving que adiou qualquer Reflector auto-aplicante.

**Tema 2 — Intelligent Preview (tiered tool output):** helper no harness que, acima de um threshold, grava o output completo em disco e devolve preview + ponteiro (`full: attempts/3/test-log.txt — 142KB, preview abaixo`). Candidatos de adoção: logs de teste consumidos por `@qa`/`@tester`, `attempts/{n}/` no `self:loop`, `context:pack`. Continuação natural do trabalho da feature `cost-context-optimization` (done 2026-06-01) e do doc `aioson-cost-optimization-analysis.md`.

## Themes

### Theme 1 — RHO-lite: `harness:retro`

**Estado atual:** trilha completa já existe (SQLite events com `token_count`, attempts com failure signatures sha1, QA sign-offs com findings C-NN/O-NN, corrections plans com frontmatter de status, devlogs com learnings tagged). Precedente arquitetural: `squad:playbook capture|list` — append-only, deduped, "what-works" memory que a creation-flow carrega antes de gerar executores.

**Gap:** nada agrega essa trilha entre features nem entre subsistemas; nenhum agente é dono da pergunta "que classe de erro está se repetindo?".

**Opção barata:** `aioson harness:retro . --feature={slug} [--last=N]` gera o dossiê retrospectivo em Markdown (mineração 100% determinística, sem LLM). O passo de análise/proposta fica com um agente existente lendo o dossiê (candidatos: @sheldon para análise técnica, ou um passo opcional do @qa no Gate D). Propostas aceitas aterrissam nos canais que já existem: `.aioson/learnings/` (gotchas/recipes) e `.aioson/rules/`.

**Opção ambiciosa (estilo RHO real):** gerar múltiplos candidatos de delta e testá-los contra as falhas históricas (re-run das verificações dos `attempts/` com o contrato alterado). Caro, exige orquestração de re-execução — só faz sentido depois que a opção barata provar valor.

### Theme 2 — Intelligent Preview para outputs grandes

**Estado atual:** `memory:trim` resolveu hot/cold para o bootstrap; `context:health` mede tamanho dos arquivos de contexto; `cost_ceiling_tokens` mede consumo no `self:loop`. Outputs de ferramenta (test logs, comandos, artefatos) não têm tier — entram inteiros ou não entram.

**Gap:** nenhum helper compartilhado de "persist full + preview N KB + pointer"; cada agente decide ad hoc quanto log cola no contexto.

**Opção barata:** helper único em `src/harness/` (`previewArtifact(content, {maxBytes})` → grava em disco, retorna preview + caminho), adotado primeiro nos 2 pontos de maior volume (test output do @qa/@tester e `attempts/{n}/` do self:loop). Threshold inicial configurável, default a calibrar (ver Open question 4).

**Opção ambiciosa:** aplicar o tier também a `context:pack` e a injeção de handoff, com política por agente. Só depois de medir.

## Risks

**Value** — base de usuários pequena: relatórios retro que ninguém lê são ruído com custo de manutenção. Mitigação: o dossiê retro só é gerado sob demanda (ou em FAIL→PASS com retrabalho), nunca em fluxo verde; piloto manual antes de qualquer automação (Open question 5).

**Usability** — propostas de delta mal calibradas (genéricas, "adicione mais validação") geram fadiga de revisão e descrédito do mecanismo. O dossiê precisa agrupar por assinatura de falha e citar evidência concreta (arquivo, evento, data) — o formato do `squad:playbook` (lição generalizada + dedupe) é o modelo a seguir.

**Feasibility** — o RHO completo depende de re-rollouts paralelos com LLM no loop; o AIOSON não tem runtime de inferência e não deve ter (fronteira prompt/runtime registrada em `how-it-works.md`). O RHO-lite contorna isso: CLI determinística minera, agente cliente analisa. Risco residual: a mineração depende da qualidade do tagging existente (`[slug · date]`, frontmatter de corrections) — onde a trilha for pobre, o retro sai pobre.

**Viability** — mantenedor único; cada subsistema novo é dívida eterna. Risco específico: criar um **quarto** sistema de memória paralelo (já existem learnings, brains, playbook). Constraint de design: `harness:retro` NÃO cria store novo — materializa dossiês em `.aioson/context/retro/` e deposita propostas aceitas nos canais existentes.

**Custo de NÃO fazer** — a trilha de falhas continua write-only; classes de erro recorrentes (ex.: "feature instalada mas silenciosamente inativa") seguem sendo redescobertas pelo @qa a cada feature, pagando o ciclo FAIL→corrections→re-QA inteiro a cada recorrência. O diferencial competitivo apontado pela literatura (harness > modelo) fica coletado mas inerte.

## Identified gaps

1. **Sem inventário de classes de erro recorrentes.** Hoje temos X correções registradas, queremos saber quantas pertencem a classes repetidas; o delta é mensurável minerando QA sign-offs + corrections das últimas ~10 features (é a Open question 3 — fazer ANTES de aprovar o briefing, pois dimensiona o valor real do Tema 1).
2. **Fronteira CLI/agente do passo de análise indefinida.** Quem propõe o delta: @sheldon sob demanda, passo do Gate D do @qa, ou agente novo? Agente novo contraria "small project, small solution" — precisa de justificativa forte.
3. **Threshold de preview sem medição própria.** O "8KB" da literatura é referência externa; hoje temos zero medição da distribuição de tamanho dos outputs reais injetados (test logs, attempts). Queremos um default com evidência local.
4. **`learnings/INDEX.md` vazio.** O canal de aterrissagem preferido do Tema 1 existe mas nunca foi populado neste repo — validar que o pipeline `feature:close` → learnings materializa de fato antes de apontar o retro para lá.
5. **Critério de aceitação de proposta.** RHO usa self-preference; RHO-lite usa humano — mas falta definir o que torna uma proposta "aplicável" (evidência mínima: ≥2 ocorrências da classe? custo de retrabalho acima de N?). Sem critério, vira opinião.

## Sources

- `researchs/harness-engineering-rho-2026/summary.md` — validação web desta sessão (RHO arXiv 2606.05922 + Stanford/Tsinghua 6x + origem do termo, com correções aos artefatos de transcrição do arquivo-fonte)
- `researchs/llm-token-estimation-2026/summary.md` — chars/4 já adotado no cost ceiling; base para medir outputs (Tema 2)
- `researchs/multi-agent-token-budget-2026/summary.md` — amplificação 4–15x sem disciplina de contexto
- `.aioson/briefings/cursor3-harness-evolution/briefings.md` — decisão estratégica herdada (documented-only, "enriquece sem mudar foco")
- `.aioson/design-docs/squad-self-improving-roadmap.md` — precedente do loop de feedback gated e do adiamento de auto-aplicação
- `.aioson/docs/aioson-cost-optimization-analysis.md` — candidatos de otimização de contexto já mapeados (Tema 2 é continuação)

## Open questions

1. [decision-required] **Dono do passo de análise (Tema 1):** @sheldon sob demanda, passo opcional do @qa no Gate D, ou seção do `feature:close`? (Recomendação preliminar: @sheldon sob demanda no piloto; automatizar só depois.)
2. [decision-required] **Trigger do retro:** somente sob demanda, ou automático quando `feature:close` detecta retrabalho (≥1 corrections plan)? (Recomendação: sob demanda no piloto.)
3. [research-able] Minerar QA sign-offs + corrections plans + `attempts/` das últimas ~10 features e inventariar classes de erro recorrentes (<4h). **Dimensiona o valor do Tema 1 — fazer antes de aprovar.**
4. [research-able] Medir a distribuição de tamanho dos outputs hoje injetados em contexto (test logs do @qa/@tester, attempts do self:loop) para calibrar o threshold de preview (<4h).
5. [testable] Piloto manual do Tema 1: rodar o retro "na mão" sobre `loop-guardrails` (feature recém-fechada com 1 High + 2 Medium corrigidos) e avaliar se as propostas resultantes teriam evitado retrabalho (1 dia).
6. [decision-required] **Aterrissagem das propostas aceitas:** `.aioson/learnings/` + `.aioson/rules/` (canais existentes) vs. arquivo de governança novo. (Recomendação forte: canais existentes — ver Risk Viability.)
7. [out-of-scope] RHO completo (re-rollouts paralelos, DPP coreset, self-preference) — exige LLM no loop da CLI; fora do modelo de distribuição npm-CLI.
8. [out-of-scope] Auto-aplicação de deltas sem aprovação humana — mantém a decisão do roadmap squad-self-improving.
