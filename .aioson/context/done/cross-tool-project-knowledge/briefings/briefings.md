---
slug: cross-tool-project-knowledge
created_at: 2026-05-22
updated_at: 2026-05-22
source_plans: ["plans/cross-tool-project-knowledge-and-gemini-phaseout.md"]
---

# Briefing — Cross-tool project knowledge memory + Gemini CLI phase-out

## Context

Dois gatilhos separáveis surgiram da sessão `@dev` de 2026-05-21 no projeto `aioson-play`:

**Trigger A (Project knowledge memory):** Durante o W1-fix do OpenClaw + diagnóstico de postgres órfão no Paperclip, dois aprendizados técnicos não-óbvios sobre o stack ficaram presos em `~/.claude/projects/C--dev-aioson-play/memory/` — invisíveis para Codex e OpenCode trabalhando no mesmo projeto. O usuário confirmou a fricção explicitamente: *"realmente está funcionando este aprendizado para quando é claude code, codex e opencode?"*. A camada multi-harness do AIOSON já está madura (`harness-driven-aioson` v1.9.0 com `permissions-generator` + `AGENTS.md`); falta o eixo de **project knowledge** propagar cross-harness.

**Trigger B (Gemini CLI phase-out):** Google anunciou (2026-05-20) que o Gemini CLI free/personal tier acaba em **2026-06-18**. AIOSON declara suporte `compatible via AGENTS.md` em todas as features (operator-memory matriz V1, permissions-generator, install-wizard). Pós-cutoff, chamadas de free users vão falhar e a fricção será atribuída ao AIOSON. Deadline efetivo: ~**4 semanas** a partir desta data (2026-05-22).

A feature `operator-memory` (DONE v1.16.0) cobre **preferências do operador** (autonomia, idioma) — não cobre **achados técnicos sobre stack**. Esse vacuum é o que o Trigger A força a resolver. Entretanto, o AIOSON já possui infra parcial para o problema: a feature `active-learning-loop` (DONE 2026-05-13) shipou `learning` CLI, `memory:search --surface=learnings`, `memory:archive`, `evolution_log` com validity-window estilo Zep, `feature:close` distillation hook. O plano-seed não reconcilia explicitamente com essa infra — esse é o primeiro problema do briefing.

## Problem

**Theme 1 — Project knowledge memory cross-tool:**
- Auto-memory do Claude Code (`~/.claude/projects/{slug}/memory/`) captura achados técnicos não-óbvios — mas só Claude Code lê esse path.
- Codex (`AGENTS.md`), OpenCode (`OPENCODE.md`), e qualquer harness futuro repassam pela mesma curva de descoberta — conhecimento não propaga.
- Hoje devs propagam manualmente (copy/paste para `.aioson/docs/integrations/*.md`, ou para `spec-{slug}.md`, ou perdem o conhecimento).
- `operator-memory` resolve isso para preferências do dev (cross-projeto, per-operator); não resolve para achados técnicos (per-projeto, shared).
- `active-learning-loop` resolve parte: a `learnings` surface em SQLite existe, mas **não é legível por Claude/Codex/OpenCode sem chamar `aioson memory:search`** em cada preflight — ineficiente e dependente de side-channel.

**JTBD:** "Quando descubro um achado técnico não-óbvio sobre o stack durante uma sessão, quero que o achado se torne disponível para qualquer harness/dev que tocar o mesmo projeto no futuro, sem reaprender do zero, para que o time não pague de novo o custo de descoberta."

**Theme 2 — Gemini CLI deprecation:**
- AIOSON tem Gemini em 27 src files + 18 template files (install-wizard, doctor, permissions-generator, agentes — números a confirmar no enrichment).
- Free/personal tier (Google AI Pro/Ultra) acaba 2026-06-18; enterprise (Code Assist Standard/Enterprise) continua operando.
- Replacement oficial Google é Antigravity CLI (Go, closed-source, multi-agent background) — não é drop-in.

**JTBD:** "Quando os free users do AIOSON tentarem usar Gemini após 2026-06-18, quero que o framework já tenha emitido warning prévio e oferecido fallback para Codex/OpenCode, sem que a falha apareça como bug do AIOSON."

## Proposed solution

Direções propostas (não comprometidas). `@product` decide no PRD.

**Theme 1 — opção A (extensão da infra existente, recomendada):**
- Estender `active-learning-loop` com **materialização disk-first**: além da `learnings` surface em SQLite, gerar `.aioson/learnings/INDEX.md` (1 linha por learning, ~150 char, sempre carregado) e `.aioson/learnings/{category}/{slug}.md` (lazy-load) toda vez que um learning é promovido.
- Adicionar diretiva universal em `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`: *"Read `.aioson/learnings/INDEX.md` if it exists. Lazy-load individual files when title/scope matches current task."*
- Adicionar `learning:import-from-claude` (ler `~/.claude/projects/{hash}/memory/MEMORY.md` + indexed files, propor seleção, promover via existing `learning` CLI).
- Adicionar sinais de capture específicos para project-knowledge na diretiva LLM-driven já existente — distintos dos sinais do operator-memory.
- **Não introduzir** namespace CLI novo (evita colisão com `aioson learning [--sub=list|stats|promote]` existente).

**Theme 1 — opção B (parallel layer, conforme plano-seed):**
- Criar `.aioson/learnings/` como nova layer paralela ao `active-learning-loop` (não estendê-lo).
- Novo CLI `learning:capture|promote|forget|list|show|audit|export|import-from-claude` — colide com o existing `aioson learning` e exigirá rename (provável `learnings:*` plural ou `knowledge:*`).
- Maior superfície, maior risco de duplicação.

**Theme 2 — phase-out em 2 fases:**
- **v1.17 (deprecation warning):** install-wizard, doctor, permissions-generator emitem warning ao detectar `.gemini/` ou ao oferecer Gemini como opção: *"Gemini CLI free tier ends 2026-06-18; consider migrating to Codex or OpenCode"*. Permissions-generator continua emitindo `.gemini/permissions.toml`. CHANGELOG entry. Operator-memory matriz V1 atualizada para `gemini-cli (deprecated until 2026-06-18, removed in v1.18)`.
- **v1.18 (pós-2026-06-18, hard removal):** remove `.gemini/` do template, remove Gemini de permissions-generator e install-wizard. Preserva `.gemini/permissions.toml` pré-existente no projeto (enterprise users protegidos). Doctor reporta `gemini_legacy_detected` (info-tier, não warning).
- Antigravity CLI = investigação separada (out-of-scope deste briefing).

## Themes

### Theme 1 — Project knowledge memory cross-tool

**Scope:** Materialização disk-first dos learnings + diretiva universal cross-harness + import-from-claude + signal taxonomy delta vs operator-memory.

**Distinção operacional vs camadas existentes:**

| Eixo | operator-memory (DONE v1.16) | active-learning-loop (DONE 2026-05-13) | project-knowledge (proposto) |
|---|---|---|---|
| Escopo | Cross-projeto, per-operator | Per-projeto, per-feature | Per-projeto, shared, **cross-harness** |
| Storage | `~/.aioson/operators/{hash}/` | SQLite (`learnings` surface) + `evolution_log` | `.aioson/learnings/{category}/{slug}.md` + `INDEX.md` (committed, disk-first) |
| Conteúdo | Preferências (autonomia, idioma) | Mix: rules promovidas, brain candidates, learnings de feature | Achados técnicos cross-feature (gotchas, fix-recipes, stack-specific) |
| Sinais | Auth / exclusion / correction / confirmation 2x | `feature:close` distillation + `pattern:detect` | Incident-resolution / gotcha / fix-recipe / root-cause (1x) |
| Threshold | 2x promoção | Heurístico via `learning:auto-promote` | 1x (achado técnico já é valioso na 1ª) |
| Loading | Diretiva `memory-capture` em todos agentes | `memory:search --surface=learnings` (lookup explícito) | `INDEX.md` lazy-load via diretiva universal cross-harness |
| Cross-harness | V2 (AGENTS.md convention pending) | Apenas via `aioson memory:search` CLI | **Nativo via `INDEX.md`** (Codex/OpenCode leem direto) |

**Fixtures iniciais** (Phase 1 test cases para `learning:import-from-claude`):
- `~/.claude/projects/C--dev-aioson-play/memory/openclaw_iframe_csp_patch.md`
- `~/.claude/projects/C--dev-aioson-play/memory/external_apps_orphan_processes_windows.md`

**Sizing estimado:** **SMALL→MEDIUM** se Theme 1 = opção A (extensão); **MEDIUM** se opção B (parallel layer). User-types 0, integrations 0 (V1 local-only), business rules +1 (signal taxonomy delta, 1x promotion vs 2x, conflict política cross-layer), cross-cutting +1 (3 harness entry-points + INDEX maintenance hook em `feature:close`), inception +1 (framework manipulando próprio prompt loading — padrão já enfrentado). Total opção A: **2-3 pts (SMALL→MEDIUM)**. Total opção B: **4 pts (MEDIUM)**.

### Theme 2 — Gemini CLI phase-out

**Scope:** v1.17 (warning emitido + doc + matriz operator-memory atualizada) → v1.18 (hard removal mecânica), com compat silenciosa para enterprise users com `.gemini/permissions.toml` pré-existente.

**Deadline crítico:** **2026-06-18** — aprox. 4 semanas a partir de 2026-05-22.
- **v1.17 deve sair antes de 2026-06-18.** Caso contrário free users veem falha sem warning prévio.
- **v1.18 ideal entre 2026-06-19 e 2026-07-03.**

**Impacto cruzado em Theme 1:** o `learning:import-from-claude` lê `~/.claude/projects/`; um equivalente `learning:import-from-gemini` faria sentido pré-cutoff. Baixa prioridade — enterprise não migra, free users provavelmente não acumularam histórico significativo. Decisão deferida ao PRD (Q12).

**Sizing estimado:** **SMALL** (1-2 pts). User-types 0, integrations 0, business rules simples (warning condicional + removal mecânica) +1, cross-cutting +1 (27 src + 18 template files), inception 0. Ações são predominantemente mecânicas + 1 prompt de migration adicionado em install-wizard.

## Risks

**R0 — CRÍTICO — Overlap com `active-learning-loop`:**
O plano-seed propõe uma camada `.aioson/learnings/` + CLI `learning:capture|promote|forget|...` como se fosse greenfield. Mas o AIOSON já shipou: (a) `aioson learning [--sub=list|stats|promote]`, (b) `memory:search --surface=learnings|rules|all`, (c) `memory:archive` com validity-window estilo Zep, (d) `evolution_log`, (e) `feature:close` distillation hook. **Construir uma camada paralela sem reconciliação criaria duplicação significativa e provável colisão de namespace CLI.** Mitigação: PRD precisa iniciar declarando explicitamente "extend vs build-parallel" e justificar a escolha. Recomendação inline desta `@briefing`: **extender** (opção A acima) — risco de regressão menor, sizing colapsa para SMALL/MEDIUM.

**Theme 1:**
- **R1 (alto):** Inception complexity em compounding. AIOSON já manipula próprio prompt loading via operator-memory + brains + rules + (agora) learnings. Adicionar uma 5ª camada (project-knowledge disk-first) sem ordem clara cria loading-order ambiguity. Mitigação: PRD precisa explicitar ordem `rules > operator-memory > project-learnings > brain > raw context` e Test Suite cross-layer no QA.
- **R2 (médio):** Signal taxonomy granular demais. 4 sinais (incident-resolution / gotcha / fix-recipe / root-cause) podem colapsar na prática (90% dos casos são "gotcha + fix"). Risk: LLM-driven capture vira ruidoso, audit prompts irritam dev. Mitigação: começar com 2 sinais (resolution + gotcha) e expandir baseado em uso real.
- **R3 (médio):** Sanitização de PII em capture. Plano #7 levanta "emails, paths sensíveis, IPs" em incident-resolution. Repository committed amplifica risk vs operator-memory (per-user, não compartilhado). Mitigação: sanitize rules embutidas no capture directive (regex pre-promote) ou prompt explícito *"esta captura contém info sensível? [y/N]"* em audit 1-liner.
- **R4 (médio):** Conflito gravitacional com `.aioson/docs/`. Hoje muitos achados técnicos vão para `docs/integrations/*.md`. Sem política clara, `learnings/` vira "docs/ leve" e `docs/` vira "learnings/ curado", criando incerteza onde escrever. Mitigação: PRD precisa nomear claramente o promotion path `learnings/ → docs/` (quando learning vira pattern estável) ou matá-lo deliberadamente.
- **R5 (baixo):** Decay event-driven via `git log --since` é frágil em projetos com rewrite frequente (rebase/squash). Audit pode marcar learning como obsoleto quando o conteúdo apenas mudou de SHA. Mitigação: usar `git log --follow` + file content hash, não SHA. Ou seguir o pattern de `active-learning-loop` (audit em `feature:close`, não via git scan).

**Theme 2:**
- **R6 (alto):** Janela apertada de 4 semanas. v1.17 com warning precisa SAIR antes de 2026-06-18. Atraso = free users veem falha sem warning prévio. Mitigação: scope-cut radical em v1.17 (só warning textual, sem código novo de degradação); empurrar lógica de gemini-detection-and-graceful-fallback para v1.18 ou v1.19.
- **R7 (médio):** "Compat silenciosa" para `.gemini/permissions.toml` pré-existente é ambígua. Se enterprise user roda `aioson setup .` em projeto novo, deve oferecer Gemini? Plano diz não. Mas e em `aioson doctor`? Plano diz info-tier reporta `gemini_legacy_detected`. Behavior precisa ser determinístico, testável e documentado.
- **R8 (baixo):** Antigravity CLI como "replacement option" no warning é prematuro — AIOSON não suporta nativamente. Recomendar replacement sem prova de capacidade é risco reputacional. Mitigação: warning recomenda Codex/OpenCode (suportados); Antigravity citado como *"may consider"* sem endorsement.

**Cross-theme:**
- **R9 (alto):** Timelines divergentes podem contaminar prioridade. Gemini = deadline hard 2026-06-18; Project knowledge = SMALL/MEDIUM com ~3-5 minor releases. Bundlar em um único PRD pode atrasar Theme 2 ou drenar atenção do Theme 1. Mitigação: `@product` deve avaliar split em 2 PRDs no momento de enrichment (SMALL `gemini-phaseout` + SMALL/MEDIUM `cross-tool-project-knowledge`).

## Identified gaps

**Pré-PRD (gaps que `@product` precisa resolver antes do enrichment):**
- **G0 (CRÍTICO):** Não há reconciliação no plano-seed entre o feature proposto e o `active-learning-loop` DONE. **`@product` precisa, no início do enrichment, ler `.aioson/context/done/active-learning-loop/prd-active-learning-loop.md` + `spec-active-learning-loop.md`** para decidir se o PRD será "extensão de active-learning-loop" ou "feature paralela".

**Theme 1:**
- **G1:** Antes do PRD existir, falta decisão sobre **escopo V1 vs V2**: import-from-claude (Phase 1?), aioson.com sync (V2), Antigravity import (out-of-scope?). Sem essa fronteira, sizing pode escalar.
- **G2:** Não há precedent claro de **sanitization** dentro do AIOSON. operator-memory é per-user (privacy menos crítica). Decision-required: sanitize-or-prompt vs sanitize-mandatory vs sanitize-opcional.
- **G3:** **Política de leitura cross-layer** precisa ser testada na prática antes de virar contrato. PRD pode iniciar como hipótese (`rules > operator-memory > project-learnings > brain > raw context`), mas precisa validation com squad-driver após Phase 1 land.
- **G4:** Padrões reais de project memory em Cursor 3, Aider 2026, Windsurf, Hermes (sucessor do Claude Code), Codex memory, Cody context **não estão pesquisados**. A pesquisa cacheada (`agent-memory-backends-2026`, 2026-05-13) cobre stack de backend (Mem0/Letta/Zep) mas não padrões cross-session/cross-tool em harnesses concorrentes — research recomendado para `@sheldon` no enrichment.

**Theme 2:**
- **G5:** Falta confirmação dos números exatos: lista de **27 src files + 18 template files** que tocam Gemini. Plano cita o agregado; @product/@dev precisará materializar a lista no enrichment via `grep -ril gemini src/ template/`.
- **G6:** **Estratégia de comunicação ao usuário** (CHANGELOG entry, blog post, banner no `aioson doctor`) não está definida. Mecanicamente fácil; precisa decisão de tom/momento.
- **G7:** **Operator-memory matriz V1 declara `gemini-cli`** como compat tier. Atualizar para `gemini-cli (deprecated until 2026-06-18, removed in v1.18)` deve ser parte do scope de v1.17 (não só install-wizard).

## Sources

**Cached research (reused, no new search):**
- [`researchs/agent-memory-backends-2026/summary.md`](../../researchs/agent-memory-backends-2026/summary.md) (2026-05-13, agent: `@sheldon`, query: *"Mem0 Letta Zep agent memory FTS5 SQLite schema TTL decay 2026"*) — valida SQLite+FTS5 como pattern V1, decay per-categoria como standard, Zep validity-window pattern para audit trails, cap de 10k memórias/agent. Implicação: stack de Theme 1 está bem ancorada via active-learning-loop.

**Internal precedents (leitura obrigatória no enrichment de `@product`):**
- `.aioson/context/done/active-learning-loop/prd-active-learning-loop.md` (DONE 2026-05-13) — **PRD da infra que se sobrepõe ao Theme 1**. M2/M4/M5 já implementam telemetria + search + archive com validity-window. Decisão extend-vs-parallel sai daqui.
- `.aioson/context/done/operator-memory/` (DONE v1.16.0) — feature DONE com signal taxonomy, promotion threshold 2x, decay per-categoria. Theme 1 deve usar esse precedent como espelho operacional (mesma estrutura, parâmetros divergentes).
- `.aioson/context/done/harness-driven-aioson/` (DONE v1.9.0) — infra multi-harness madura (`permissions-generator`, `AGENTS.md`/`OPENCODE.md`/`CLAUDE.md` entry-points). Theme 1 reusa esses entry-points para diretiva universal de loading.

**Gemini CLI deprecation (do próprio plano-seed, 2026-05-21):**
- [An important update: Transitioning Gemini CLI to Antigravity CLI — Google Developers Blog](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [Google to Deprecate the Old Gemini CLI by June 18, 2026 — KuCoin](https://www.kucoin.com/news/flash/google-to-deprecate-old-gemini-cli-by-june-18-2026-pushes-antigravity-cli)
- [Bye-bye, Gemini CLI — The Register](https://www.theregister.com/ai-ml/2026/05/20/bye-bye-gemini-cli-google-nudges-devs-toward-antigravity/5243605)
- [An important update — GitHub Discussion #27274 (google-gemini/gemini-cli)](https://github.com/google-gemini/gemini-cli/discussions/27274)

**Aprendizados fixture (Theme 1 import test cases):**
- `~/.claude/projects/C--dev-aioson-play/memory/openclaw_iframe_csp_patch.md` (sessão 2026-05-21)
- `~/.claude/projects/C--dev-aioson-play/memory/external_apps_orphan_processes_windows.md` (sessão 2026-05-21)

## Open questions

> Classification tags: `[research-able]` <4h dig · `[testable]` 1-2d exp · `[decision-required]` judgment call · `[out-of-scope]` park.
> Recommendation tags for `@product` enrichment: `[needs:sheldon]` deep technical research · `[needs:architect]` design call · `[needs:analyst]` requirements detail.

**Top priority (block PRD start):**

1. **Extender `active-learning-loop` ou construir parallel layer `.aioson/learnings/`?** Plano-seed assume parallel; este briefing recomenda extend. — `[decision-required]` · `[needs:architect]` — **recomendação `@briefing`: extender** (R0 + G0). Razão: 60-70% do scope proposto já existe em `active-learning-loop`; parallel layer dobra superfície sem ganho proporcional.

11. **Bundle vs split em 2 PRDs:** timelines divergentes (Theme 2 = ~4 sem deadline hard; Theme 1 = SMALL/MEDIUM, 3-5 minor releases). — `[decision-required]` — **recomendação `@briefing`: split** (R9). Razão: deadline tático do Gemini não deve esperar PRD estrutural; arquiteturas multi-harness não se sobrepõem o suficiente para justificar bundle.

**Theme 1:**

2. **Storage default: committed ou gitignored?** Plano default = committed (compartilhar com time). Privacy: learnings podem citar paths internos, names de cliente, IPs. — `[decision-required]`
3. **Tamanho máximo de learning:** operator-memory limita decision body a ≤500 chars; learnings precisam mais (stack traces, snippets). Limit 2000? 5000? Frontmatter strict + body unlimited? — `[decision-required]`
4. **Signal taxonomy granularity:** 4 sinais propostos (incident-resolution / gotcha / fix-recipe / root-cause) suficientes? Ou colapsar para 2 (resolution + gotcha) e expandir baseado em uso? — `[testable]` (1-week dogfood) · `[needs:architect]`
5. **Decay event-driven: como?** `git log --since=<promoted_at> -- <path>` é a hipótese do plano. Triggers: manual / pre-commit hook / `doctor` check / piggyback em `feature:close`? — `[decision-required]` · `[needs:architect]`
6. **Cross-projeto V2: `learning:export --to=aioson-com` faz sentido?** V1 = nada. V2 = sync via aioson.com. — `[out-of-scope]` para PRD V1.
7. **Conflito com `.aioson/docs/`:** matar `docs/`? Coexistir com promotion path `learnings/ → docs/` quando estabiliza? — `[decision-required]`
8. **PII risk em incident-resolution capture:** sanitize-mandatory (regex pre-promote) vs sanitize-opcional (prompt em audit 1-liner) vs trust-user? — `[decision-required]` · `[needs:sheldon]`
9. **Padrões em harnesses concorrentes:** como Cursor 3, Aider 2026, Windsurf, Hermes, Codex memory, Cody context gerenciam project knowledge cross-session? — `[research-able]` · `[needs:sheldon]`

**Theme 2:**

10. **Antigravity CLI vira tool first-class no AIOSON?** Capability matrix, permission model, AGENTS.md compat. — `[research-able]` · `[needs:sheldon]` — **recomendação:** plan separado, não bloquear v1.17/v1.18.
12. **Backward compat depth:** `.gemini/` no projeto preserva legacy enterprise. Manter "frozen tier" até quando? v1.18 indefinido? v1.20 hard sunset? — `[decision-required]`
13. **Operator-memory matriz V1:** spec declara compat Gemini CLI. Atualizar para `[claude-code, codex, opencode, gemini-cli (deprecated until 2026-06-18, removed in v1.18)]`? — `[decision-required]` — **recomendação:** sim, parte do scope de v1.17.
14. **`learning:import-from-gemini` pre-cutoff:** baixa prioridade (enterprise não migra; free não tem histórico relevante). Bundle no scope de import-from-claude ou deixar fora? — `[decision-required]` — **recomendação:** out-of-scope V1.

## Additional files

Nenhum por enquanto. Se `@product` decidir split em 2 PRDs (Q11), considere subir os dois Themes para arquivos próprios: `cross-tool-project-knowledge/theme-memory.md` + `cross-tool-project-knowledge/theme-gemini-phaseout.md`. Por ora, ambos cabem num único briefing.
