---
briefing_source: harness-retrospective-optimization
feature: harness-retrospective-optimization
classification: SMALL
created_at: 2026-06-10
created_by: product
---

# PRD — Harness Retrospective Optimization (RHO-lite)

## Vision

Fechar o loop de melhoria do harness AIOSON: a trilha de falhas que o framework já coleta deixa de ser write-only e passa a gerar propostas de correção do próprio harness — de forma aditiva, determinística e sempre com aprovação humana.

## Problem

O AIOSON registra FAILs de QA, corrections plans, trips de circuit-breaker, assinaturas de falha e eventos SQLite — mas nenhum mecanismo agrega essa trilha entre features. Classes de erro recorrentes (ex.: "feature instalada mas silenciosamente inativa", ocorrida ≥2x) são redescobertas pelo @qa a cada feature, pagando o ciclo FAIL→corrections→re-QA inteiro a cada recorrência. Quem sente a dor: o operador (retrabalho) e os agentes (contexto poluído por outputs grandes sem tier).

## Users

- **Operador (dev mantenedor)**: quer que classes de erro já pagas não se repitam na feature seguinte; decide quais propostas de delta aceitar.
- **Agentes AIOSON (@sheldon, @qa, @tester, self:loop)**: consomem o dossiê retrospectivo como evidência e recebem outputs grandes em formato preview + ponteiro, preservando janela de raciocínio.

## MVP scope

### Must-have 🔴 — Tema 1: `harness:retro` (RHO-lite)

- `aioson harness:retro . --feature={slug} [--last=N]` — mineração 100% determinística da trilha (execution_events do `aios.sqlite`, `attempts/{n}/`, QA sign-offs, corrections plans, devlogs) — sem LLM na CLI; required: a CLI minera, o agente analisa.
- Saída: dossiê retrospectivo em `.aioson/context/retro/{slug}.md` — falhas agrupadas por assinatura/classe, correções aplicadas, custo de retrabalho estimado (tokens/eventos quando disponíveis).
- **Critério de proposta** (anti-opinião): uma classe de falha só vira proposta no dossiê com **≥2 ocorrências documentadas** OU 1 ocorrência de severidade High; o resto entra como apêndice "observações".
- Análise e proposta de deltas: **@sheldon sob demanda** lê o dossiê e propõe mudanças de prompt/contrato/regra — nenhum agente novo.
- Aterrissagem das propostas aceitas: **canais existentes apenas** — `.aioson/learnings/` (gotchas/recipes) e `.aioson/rules/`. Nenhum store de memória novo.
- Retrocompatibilidade total: comando novo e diretório novo; zero mudança de comportamento em fluxos existentes sem opt-in.

### Should-have 🟡 — Tema 2: Intelligent Preview

- Helper único em `src/harness/` (`previewArtifact(content, {maxBytes})`): persiste o output completo em disco e retorna preview + ponteiro para o arquivo integral.
- Adoção inicial em 2 pontos de maior volume: logs de teste consumidos por @qa/@tester e `attempts/{n}/` do `self:loop`.
- Threshold configurável, default inicial 8KB — a calibrar com medição local (ver Open questions).
- Se o orçamento da feature apertar, o Tema 2 cai sem afetar o Tema 1 (independência mecânica confirmada).

## Out of scope

- RHO completo (re-rollouts paralelos, DPP coreset, self-preference) — exige LLM no loop da CLI; incompatível com o modelo npm-CLI.
- Auto-aplicação de deltas sem aprovação humana — mantém a decisão do roadmap squad-self-improving.
- Agente novo dedicado a retrospectivas.
- Trigger automático do retro em `feature:close` — evolução futura, condicionada ao piloto provar valor.
- Novo sistema/store de memória paralelo a learnings/brains/playbook.
- Tiering de `context:pack` e injeção de handoff (opção ambiciosa do Tema 2) — só depois de medir os 2 pontos iniciais.

## User flows

### Retro sob demanda (must-have)
Operador fecha uma feature com retrabalho → roda `aioson harness:retro . --feature={slug}` → CLI minera a trilha e escreve `.aioson/context/retro/{slug}.md` → operador ativa `@sheldon` apontando o dossiê → @sheldon propõe deltas (prompt/contrato/regra) com evidência citada → operador aceita/rejeita → propostas aceitas são gravadas em `.aioson/learnings/` ou `.aioson/rules/` → próxima feature carrega a regra automaticamente pelos mecanismos existentes.

### Output grande com preview (should-have)
Agente executa comando/teste com output acima do threshold → helper grava o artefato completo em disco → contexto recebe `preview (8KB) + caminho do arquivo completo + tamanho` → agente decide deep-dive lendo o arquivo só quando necessário.

## Success metrics

- **Piloto**: retro manual sobre `loop-guardrails` (feature recém-fechada com 1 High + 2 Medium corrigidos) produz ≥1 proposta acionável aceita pelo operador.
- **Recorrência**: classe de erro identificada num retro não reaparece nas 2 features seguintes (verificação qualitativa via QA sign-offs).
- **Preview (se Tema 2 entrar)**: redução mensurável de bytes injetados em contexto nos 2 pontos adotados, medida antes/depois.
- **Zero retrocesso**: suíte completa permanece verde; nenhum fluxo existente muda sem opt-in; `harness:retro` em projeto sem trilha retorna dossiê vazio sem erro.

## Open questions

- Formato exato das seções do dossiê retro (agrupamento por assinatura vs. por feature) — definir em requirements (@analyst).
- Inventário de classes de erro recorrentes das últimas ~10 features (OQ-3 do briefing, <4h de mineração) — fazer durante discovery; dimensiona as primeiras propostas e valida o critério ≥2 ocorrências.
- Distribuição real de tamanho dos outputs hoje injetados (test logs, attempts) para calibrar o threshold de preview (OQ-4 do briefing) — só relevante se o Tema 2 entrar no ciclo.
- Como estimar "custo de retrabalho" no dossiê: contagem de eventos/correções vs. estimativa de tokens (chars/4 já disponível em `execution_events.token_count`).
