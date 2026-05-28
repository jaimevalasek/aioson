---
slug: neural-chain
created_at: 2026-05-21
updated_at: 2026-05-21
source_plans: ["conversational — seed from user idea, 2026-05-21 (uninstall-app-button incident)"]
methodology: jtbd + cagan-discovery (single-voice — user as PM + engineering perspective)
---

# Briefing — Neural Chain (impact-aware code editing)

## Context

AIOSON evoluiu cinco camadas de memória/contexto em ~2 meses: `feature-dossier` (per-feature), `brains` (procedural patterns), `living-memory` (project bootstrap), `active-learning-loop` (cross-feature learning), `operator-memory` (per-operator decisions across sessions/projects/harnesses — v1.16.0, fechada 2026-05-21).

**Nenhuma é code-graph-aware no momento da edição.** Quando `@dev` ou `@deyvin` modificam um arquivo, leem aquele arquivo + context pack, mas não enxergam vínculos implícitos cross-file: eventos, listeners, hooks, jobs, classes dependentes, testes nominais. Esses vínculos existem no código mas ficam invisíveis à LLM editora — que então deixa órfãos, dead references, ou impactos não-propagados.

**Trigger ("why now?"):** sessão imediatamente anterior à ativação deste briefing, em ambiente externo do usuário. App de uma categoria foi desinstalado; a LLM aplicou a mudança no arquivo de app mas **não detectou que existia um sistema de eventos que removeria o botão associado**. Resultado: botão órfão na UI → segunda chamada explícita pra correção → LLM aí enxergou o sistema de eventos e corrigiu. Caso real, observado, não-hipótese. O custo é dobro de tokens, dobro de turnos, e risco real de a falha passar despercebida em casos menos óbvios (silent bug em produção).

A entrega de `operator-memory` Phase 5 ontem (v1.16.0) estabeleceu padrão de TTL decay + closure no projeto — base reutilizável pra parte do escopo aqui (Mecanismo 2). Storage SQLite+WAL já é infra padrão do AIOSON.

## Problem

**JTBD:** *Quando eu (ou meu agente LLM) estou prestes a alterar um arquivo de código, quero ver as ligações implícitas relevantes daquele arquivo — eventos, listeners, hooks, jobs, classes, funções, testes e decisões históricas de desenvolvimento que tocaram aí — pra não esquecer de propagar/corrigir, e não cair no loop de "fiz a mudança → bug silencioso → segunda chamada pra correção".*

**Quem sente:**
- Agentes LLM (`@dev`, `@deyvin`, e qualquer code-editor downstream) que mudam código sem visibilidade de impacto cross-file.
- Desenvolvedor humano usando AIOSON, que precisa fazer correção manual ou nova chamada de agente quando o impacto foi missado.

**Como sente hoje:** cada miss = correction loop = 2-3x token cost da operação original + risco real de bug silencioso passar pra produção. A dor não é teórica — manifestou-se na sessão imediatamente anterior.

## Proposed solution

Uma camada **Neural Chain** sobre o código do projeto, materializada em **dois mecanismos distintos** (decisão estrutural confirmada pelo usuário nesta sessão).

### Mecanismo 1 — Impact propagation (por edit)

- **Trigger:** cada edit de arquivo por agente AIOSON code-editor (hook em `@dev` / `@deyvin` / outros).
- **Ação:** roda `chain:audit` no arquivo modificado → grafo retorna ligações afetadas → conforme `autonomy` do `.aioson/config.md`:
  - `guarded` → sempre cria `.aioson/context/noises/{slug}.md` pra revisão (conservador).
  - `standard` → threshold de confiança: arestas óbvias (teste com nome do módulo, listener literal do evento) auto-corrigem; ambíguas viram noise.
  - `autonomous` → tenta corrigir tudo que conseguir; só registra noise pro que falhou.
- **Noise file** é deletado quando todos os items foram resolvidos. Vira artefato de continuidade entre sessões.
- **Rede de segurança:** ao ativar `@neo`, se houver noises pendentes, surfa no dashboard como blocker — fluxo simétrico ao já existente `harness contract` em `@neo`.

### Mecanismo 2 — Graph maintenance (periódico)

- **Trigger:** ciclo longo — fim de feature/release, ou comando explícito `aioson chain:prune .`.
- **Ação:** skill LLM-judged (rodando dentro de agente — `@neo` estendido, ou agente novo `@chain-keeper`) que olha o grafo e julga utilidade real:
  - Arestas apontando pra símbolos que não existem mais → deleta.
  - Co-edits temporais sem co-edit nos últimos 90 dias → arquiva (validity-window pattern do Zep — referência cached em `researchs/agent-memory-backends-2026`).
  - Frequência abaixo de threshold → poda.
- **Disciplina dupla:** heurística determinística (TTL, frequency, dead-symbol check) cuida do bulk barato; skill LLM faz só o julgment fino dos ambíguos.
- Reusa pattern já validado em v1.16.0 (`operator-memory` Phase 5 TTL decay + closure).

### Arquitetura de fonte das arestas (combinação ponderada — todas três)

| Fonte | Tipo de aresta | Custo | Quando |
|---|---|---|---|
| AST estático | `import`, `export`, function ref, listener literal | médio (parser por linguagem) | drill-down on-demand |
| Git history | co-edit frequency (X mudou junto com Y em N commits) | barato | ingest contínuo |
| Agent events AIOSON | "@dev modificou X com motivo Y; também tocou Z" | barato | toda execução de agente |

### Granularidade híbrida
File-level por default (grep/heurística — multi-language barato, linguagem-agnóstico). Symbol-level (função/classe/listener) drill-down só on-demand quando o agente pede explicitamente ou quando heurística de impacto justifica AST.

### Storage híbrido
- **SQLite em `.aioson/runtime/aios.sqlite`** pra grafo, query e poda — alinhado com pattern AIOSON validado (`agent-memory-backends-2026` confirma SQLite+FTS5+WAL como padrão de produção em Engram, MNEMOS, BrainCTL).
- **Markdown gerado on-demand** pra surfacing humano (`noises/`, opcionalmente exports). Sem arquivo-por-aresta — o grafo mora em SQLite (decisão explícita do usuário pra evitar "monte de arquivos que podem ficar perdidos").

## Themes

### Theme A — Mecanismo 1: Impact propagation

**Concern único:** detectar e propagar impactos no momento da mudança, materializando saída dupla (auto-correção quando seguro + noise file quando ambíguo).

**Independência:** pode shippar isolado como MVP — entrega valor sem o Mecanismo 2 funcionando, desde que se aceite que o grafo cresce sem poda no V1 (manageable em 1-2 ciclos de feature antes do M2 entrar).

**Open questions próprias desta theme:** quais agentes consomem (só `@dev`/`@deyvin` ou todos os code-editors AIOSON); formato exato do noise file; regras concretas do threshold no modo `standard`.

### Theme B — Mecanismo 2: Graph maintenance

**Concern único:** manter o grafo limpo, controlar custo de tokens, garantir sinal > ruído ao longo do tempo.

**Independência:** depende do Mecanismo 1 existir antes (não tem grafo pra podar enquanto o grafo não nasce). Por isso entra naturalmente como Phase 2.

**Open questions próprias:** skill mora em qual agente; cadência (release / comando / hook do harness); critério LLM-judged de utilidade (prompt da skill).

## Risks

### Value — agentes (e dev humano) vão consumir a saída?
- **Risco:** chain detecta 30 impactos por edit → agente ignora ou só lê os 3 primeiros → mesmo problema do "context dump" que afeta sistemas tipo Cursor.
- **Mitigação:** noise file curto e ordenado por confiança (top-N), não exaustivo. Threshold de confiança alta pra Mecanismo 1 não disparar em ruído.

### Usability — agentes (e devs) conseguem entender e agir?
- **Risco:** noise file vira TODO infinito que ninguém fecha; vira lixo igual `// TODO: fix this` em código abandonado.
- **Mitigação:** deletion-on-close obrigatório (no items pendentes → arquivo deletado automaticamente). Dashboard de `@neo` mostra noises pendentes como blocker — não fica invisível.

### Feasibility — conseguimos construir dado nosso stack?
- **Risco grande:** AST multi-language é heavy. JS/TS tem `acorn`/`@babel/parser`; Python/Go/Java/Rust exigem parser-por-linguagem.
- **Mitigação MVP:** file-level via grep + git history first (linguagem-agnóstico). AST drill-down só pra JS/TS no V1 (parser nativo Node disponível). Outras linguagens em V2 via language adapter abstrato.

### Viability — token cost, manutenção, brand
- **Risco-mãe estrutural:** grafo cresce → cada `chain:audit` lê mais → tokens explodem. `researchs/multi-agent-token-budget-2026` documenta 4-15x amplificação em sistemas multi-agent mal-disciplinados.
- **Mitigação estrutural, não opcional:** Mecanismo 2 não é nice-to-have — é estrutural. Hard cap em arestas por nó (10k pattern de `agent-memory-backends-2026`). Validity-window per aresta (start_at/end_at) ao invés de mutação destrutiva — auditável e podável.

### Risk of NOT doing it (forcing function)
- Status quo: LLM continua perdendo impactos cross-file. Evidência observada (uninstall-app-button) é caso concreto, não hipótese.
- Cada miss = correction loop (2-3x token cost da operação original) + risco real de bug silencioso passar pra produção em casos menos óbvios que o do botão.
- AIOSON tem 5 layers de memória mas é cego pro grafo de código — gap visível, e cresce em severidade conforme o framework é adotado em projetos maiores e mais entrelaçados.

## Identified gaps

### Gap 1 — Code-edge indexing
- **Current:** zero. AIOSON não conhece relações entre arquivos no nível de código. `feature-dossier` registra agent trail por feature, mas não dependency edges entre símbolos/arquivos.
- **Desired:** SQLite-backed edge index com ≥3 tipos de aresta (AST import, git co-edit, agent event), com validity-window (`start_at`/`end_at`) por aresta.
- **Delta:** módulo `src/neural-chain/` novo + schema SQLite + ingestion pipeline (git hook + agent event listener + AST scanner).

### Gap 2 — Post-edit hook em code-editor agents
- **Current:** `@dev`/`@deyvin` editam direto sem audit hook downstream.
- **Desired:** hook post-edit que dispara `chain:audit` automaticamente; integração via runtime.
- **Delta:** provável extensão em `src/commands/runtime.js` (mesmo arquivo do `agent:done` integrity check); novo comando `chain:audit`.

### Gap 3 — Noise file convention
- **Current:** não existe. AIOSON não tem padrão de "TODO list de impactos pendentes vinculados a um edit".
- **Desired:** `.aioson/context/noises/{slug}.md` format spec; deletion-on-close enforcement; surfacing via `@neo` dashboard como blocker.
- **Delta:** nova convenção + seção em `@neo` activation protocol + documentação no `.aioson/config.md`.

### Gap 4 — Skill de poda LLM-judged
- **Current:** `operator-memory` Phase 5 tem TTL decay determinístico (precedente parcial, mas só time-based).
- **Desired:** skill LLM que julga utilidade real de arestas — não só TTL/frequency, também "essa aresta ainda faz sentido dado o estado atual do código?".
- **Delta:** nova skill em `.aioson/skills/process/` + agente owner (decisão em open question 2).

### Gap 5 — Multi-language symbol detection
- **Current:** zero AST suporte no CLI AIOSON.
- **Desired:** pelo menos JS/TS no MVP (Node parser nativo); roadmap claro para Python/Go/Java conforme demanda.
- **Delta:** dependência `@babel/parser` (ou `acorn`) + abstração de `LanguageAdapter` interface pra futuras linguagens.

## Sources

- **Internal evidence (primary, non-hypothetical):** sessão imediatamente anterior do usuário, 2026-05-21 — caso real de uninstall-app-button que disparou este briefing. Não-hipotético.
- **`researchs/multi-agent-token-budget-2026/summary.md`** (cache válido, 2026-05-13, freshness OK) — multi-agent systems consomem 4-15x mais tokens sem disciplina (arxiv 2510.26585); valida o **Viability risk** (risco-mãe) e torna o Mecanismo 2 estrutural, não opcional.
- **`researchs/agent-memory-backends-2026/summary.md`** (cache válido, 2026-05-13, freshness OK) — confirma SQLite+FTS5+WAL como padrão de produção (Engram, MNEMOS, BrainCTL); Zep validity-window pattern (`start_at`/`end_at` por fato) é referência direta pra decay de arestas; hard cap ~10k memórias/agent como guideline.
- **AIOSON features arquivadas relevantes** (de `.aioson/context/done/MANIFEST.md`):
  - `feature-dossier` — per-feature agent trail (precedente parcial pra "agent events" como fonte de arestas).
  - `living-memory` — bootstrap context cache pattern.
  - `active-learning-loop` — learning across features (precedente pra ingest de sinal).
  - `operator-memory` Phase 5 — TTL decay + migration + closure (precedente direto pra heurística determinística do Mecanismo 2).
- **Sem pesquisa web nova realizada nesta sessão.** Cache `researchs/` cobriu os dois eixos centrais (tokens + storage).

## Open questions

1. **[decision-required]** Escopo do MVP — Mecanismo 1 (impact propagation) sozinho como SMALL/MEDIUM primeiro, com Mecanismo 2 (poda) como feature follow-up? Ou shippar ambos em uma única MEDIUM grande?
   - **Owner:** `@product` + `@sheldon` (sizing call).
   - **Path:** enrichment + sizing. Trade-off: M1 sozinho entrega valor antes mas pode acumular ruído sem M2 por 1-2 ciclos; bundle MEDIUM atrasa entrega inicial.

2. **[decision-required]** Skill de poda do Mecanismo 2 mora em qual agente?
   - (a) estende `@neo` (já é router, já lê estado global)
   - (b) estende `@sheldon` (deep analysis — julgment fino faz sentido aí)
   - (c) agente novo `@chain-keeper` (dedicado, coesão única)
   - **Owner:** `@architect`.
   - **Path:** decision doc pesando coesão dos agentes existentes vs proliferação da ecosystem.

3. **[decision-required]** Threshold no modo `autonomy: standard` — quais regras concretas decidem "corrige direto" vs "vira noise"?
   - (a) heurística determinística (nome de teste bate exato com nome do módulo; listener literal bate com evento; etc.)
   - (b) LLM-judged in-loop (cada edit pergunta ao modelo — custa tokens extras)
   - (c) híbrido (heurística primeiro pra óbvios; LLM só pra ambíguos no threshold borderline)
   - **Owner:** `@architect`.

4. **[research-able]** Quais linguagens precisam de AST drill-down no MVP além de JS/TS?
   - **Owner:** `@architect` (ou self via `aioson scout`).
   - **Path:** olhar projetos consumidores conhecidos de AIOSON + features arquivadas. Hipótese: só JS/TS no V1; Python como tier 1 V2.

5. **[research-able]** Bootstrap inicial em projeto existente com codebase grande — scan one-shot completo ou aprendizado incremental?
   - **Owner:** `@architect`.
   - **Path:** heurística por LOC do projeto; trade-off de tempo de instalação inicial vs cobertura. Provável: incremental + ingest do git log histórico em background.

6. **[testable]** Métrica de sucesso — como medir sinal vs ruído do grafo?
   - (a) % de items de noise corrigidos sem ajuste manual posterior
   - (b) % de "second-call correction loops" reduzidos comparado a baseline pre-feature
   - (c) tokens consumidos por `chain:audit` estáveis ao longo do tempo (não-crescentes)
   - **Owner:** `@qa` + `@product` (success contract).
   - **Path:** instrumentar baseline em N sessões antes do MVP shippar; comparar pós-shipping.

7. **[decision-required]** Format do noise file — markdown narrativo deletável vs JSON estruturado machine-readable vs híbrido (markdown com frontmatter YAML)?
   - **Owner:** `@architect` + `@product`.
   - **Path:** provavelmente híbrido (`feature-dossier` já usa esse pattern com sucesso).

8. **[out-of-scope]** Visualização tipo Obsidian pra dev humano (grafo navegável visual interativo) — vale ou é distração?
   - **Park.** MVP é LLM consumption only; visualização vira feature separada se demanda real aparecer pós-shipping. Não bloqueia.

---

## Methodology note

Single-voice briefing — usuário atua como PM + engineering perspective combinados. `briefing-craft.md` flagga isso como "feasibility delusion risk". Recomendação: pass de enrichment via `@sheldon` antes de `@product` comprometer PRD, pra obter "second voice" sobre feasibility de AST multi-language e sobre sizing M1-only vs M1+M2 bundle.
