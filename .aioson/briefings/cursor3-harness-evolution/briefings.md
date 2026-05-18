---
slug: cursor3-harness-evolution
created_at: 2026-05-18
updated_at: 2026-05-18
source_plans: ["plans/relatorio-proposta-melhoria-analisar.txt"]
decision: documented-only
decision_at: 2026-05-18
decided_with: product
---

# Briefing — Cursor 3 / SDK / Composer 2: Inteligência Competitiva e Oportunidades de Evolução do AIOSON

## Decision log (2026-05-18 com @product)

**Estado final: documented-only.** Este briefing **NÃO gera PRD nem feature**. Fica como referência estratégica viva pra rejeitar futuros "vamos copiar X do Cursor" sem dado de pain real.

| ID | Decisão | Resultado |
|---|---|---|
| **Q1** | Escopo institucional do AIOSON | **(a) AIOSON enriquece sem mudar foco.** Pega aprendizados do Cursor, não compete com Cursor SDK. Filtra Themes 1, 3, 5 como `[out-of-scope]` automaticamente. |
| **Q2** | Theme 2 — Context-First soft audit | **Parked.** Variante (a) custaria 1.5-2 dias. Sem pain observado: `deyvin-density` + `agent-chain-continuity` + `dev-state-producer` já cobrem os gaps reais. Reabrir SE incidente de "agente cego" surgir em produção. |
| **Q3** | Theme 4 — Multi-Model `agent_model_hints` | **Dropped.** Imposição de opinião como config; risco real de quebrar usuários sem Opus / surpresas de fatura; manutenção 3-cliente (Claude/Codex/Gemini). README/tutorial entrega o mesmo valor sem feature. |
| **Q10** | Themes que viram features dedicadas | **Nenhum.** Briefing fica como referência permanente. |

**Razão de fundo:** o briefing já entregou seu valor — strategic positioning + vocabulário pra rejeitar framework envy. Intake documents podem ser outputs sem gerar features. A diferenciação real do AIOSON (SDD + agentes especializados + context handoff via dossiers/dev-state) está intacta e não precisa do harness do Cursor pra existir.

---

## Context

Em maio de 2026 o mercado de IDEs com agentes consolidou três marcos: Cursor 3 (lançado 2026-04-02) reorganizou a IDE em torno de uma *Agents Window* com até 8 agentes paralelos em Git worktrees isolados; Cursor liberou um TypeScript SDK que dá a terceiros o mesmo harness em três modalidades (cloud sandboxed, self-hosted outbound-only, local); e Composer 2 (lançado 2026-03-18, sobre Kimi K2.5 open-source) baixou o custo de inferência para US$ 0,50/M tokens de input, deslocando a fronteira de viabilidade econômica para squads que consomem dezenas de milhões de tokens por sprint.

O AIOSON nasceu como framework CLI orientado a Spec-Driven Development, hoje na v1.9.2, com `harness-driven-aioson` já implementado (2026-05-08) e dossiês/skills/runtime/SQLite no lugar. O plano-fonte (relatorio-proposta-melhoria-analisar.txt) sintetiza essas mudanças do mercado e propõe 4 diretrizes de evolução. Este briefing converte essas diretrizes em blocos de oportunidade auditáveis para o AIOSON, com gaps mapeados e perguntas abertas categorizadas — sem ainda comprometer escopo, prioridade, ou roadmap.

## Problem

O AIOSON precisa decidir, em janela curta, **quais elementos do "harness moderno" (orquestração visual, codebase indexing enforcement, sandbox isolation, tokenomics routing) entram no roadmap próprio e quais permanecem delegados ao cliente de IA (Claude Code, Codex, Gemini, Cursor) ou ao próprio Cursor SDK**. Sem essa decisão consciente: (a) corre risco de *framework envy* — copiar features que não casam com a distribuição npm-CLI e a identidade Lane-2 (hardening); (b) corre risco oposto de *estagnar como wrapper* — manter SDD/agentes especializados sem evoluir o substrato de execução que sustenta esses agentes.

A pergunta JTBD por trás: *"Quando o mercado de harness comoditiza (Cursor SDK em 3 linhas), eu quero diferenciação clara do AIOSON, para continuar tendo razão de existir além do produto Cursor."*

## Proposed solution

**Documento estratégico de intake** — não uma feature única. As 4 diretrizes do plano viram 4 temas independentes (mais um quinto surgido do enrichment), cada um com: estado atual mapeado, gap quantificado, opção arquitetural mais barata, opção mais ambiciosa, e perguntas abertas que travam aprovação para PRD. Output esperado deste briefing: o usuário escolhe **quais temas viram briefings dedicados** (com `aioson briefing:approve`) e quais permanecem `[out-of-scope]` documentados. Nenhum compromisso de implementação é tomado aqui.

## Themes

### Theme 1 — Orquestração visual (Cursor 3 Agents Window)

> **Verdict 2026-05-18:** `[out-of-scope]` — filtrado por Q1=(a). AIOSON não compete em UX visual contra IDE completa.

**Claim do plano:** sessões CLI quebram acima de ~4 sessões paralelas; orquestração visual com pinning resolve.

**Estado AIOSON:**
- CLI-first via slash commands; `aioson live:start/status/close` gerenciam sessões mas em texto.
- Dashboard existe como app separada (não integrada ao runtime principal).
- `aioson live:status --watch` é o mais próximo de "ver todas as sessões".

**Gap real:** o AIOSON não compete em UX visual contra Cursor 3 (IDE completa). Mas pode oferecer **agregação multi-sessão** via dashboard para usuários que rodam o AIOSON dentro de Claude Code/Codex/Gemini (clientes que já fornecem janela visual da própria conversa, mas não veem outras sessões AIOSON em paralelo).

**Opção barata:** ampliar `aioson live:status --watch=2 --json` para servir um endpoint local consumível pela dashboard existente; pinning e drag-spawn ficam de fora.

**Opção ambiciosa:** repensar a dashboard como surface principal de orquestração (não app separada) — maior reescrita, compete com clientes IA.

---

### Theme 2 — Harness-as-a-Service / Context-First Enforcement

> **Verdict 2026-05-18:** `[parked]` — variante (a) defensável mas prematura. Sem pain observado e gaps reais já cobertos por `deyvin-density` + `agent-chain-continuity` + `dev-state-producer`. Reabrir se "agente cego" virar incidente.

**Claim do plano:** 80% da eficácia é harness, 20% modelo. Indexação semântica antes de qualquer chamada ao modelo é obrigatória.

**Atualização do enrichment:** indústria converge para **95/5** (Inside the Agent Harness, Codex/Claude Code post-mortem). AIOSON já tem todos os ingredientes do harness — só não os **enforça**.

**Estado AIOSON:**
- `aioson scan:project`, `context-search`, FTS5 sobre `content_items`, brain nodes, dossier vivo, skills.
- Living Memory existe e tem bootstrap gate em `@deyvin` (deyvin-density feature).
- Não há gate equivalente para `@product / @analyst / @architect / @dev / @qa / @sheldon`.

**Gap real:** agentes podem responder sem consultar `researchs/`, dossiês, ou `aioson context:search`. Já temos um caso clínico próximo (multi-agent-token-budget research confirmou que sem context-first o consumo de tokens cresce 4-15x).

**Opção barata:** adicionar um *Context Preflight Section* obrigatório no `agent:done` schema — agente lista (sources consultadas, queries executadas, dossier IDs lidos) antes de fechar sessão. Não bloqueia execução; cria pegada auditável.

**Opção ambiciosa:** gate de ativação por agente (similar à Living Memory bootstrap do `@deyvin`) — o agente NÃO PODE produzir output sem registrar pelo menos uma consulta de contexto via skill `web-research-cache` ou `context:search`.

---

### Theme 3 — Sandboxing / Isolamento (VMM)

> **Verdict 2026-05-18:** `[out-of-scope]` — incompatível com modelo de distribuição npm-CLI. Limitação a documentar no `secure-by-default`.

**Claim do plano:** cada agente roda em VM dedicada para isolar credenciais de produção do desenvolvedor.

**Estado AIOSON:**
- Zero camada de isolamento. Agentes operam diretamente no working tree do usuário.
- `git-guard.json` bloqueia paths sensíveis (node_modules, aioson-logs) mas é guarda de path, não isolamento de processo.
- `secure-by-default` feature (2026-04-29) endereçou postura adversarial, não execução isolada.

**Gap real:** o AIOSON é npm-CLI distribuído — sandbox VM/Docker seria reescrita radical do modelo de distribuição.

**Opção barata (provavelmente recomendada):** documentar limitação no `secure-by-default` doc — "AIOSON não isola execução do agente do seu shell; rode em devcontainer/VM se ambiente exigir." Não construir nada.

**Opção ambiciosa:** profile `--sandbox=docker` opt-in que mata `aioson live:start` em container com mount read-write apenas do repo. Custo de manutenção alto, casos de uso estreitos.

**Recomendação preliminar:** `[out-of-scope]` para AIOSON. Padrão da Cursor self-hosted (worker outbound-only HTTPS) é elegante, mas requer infraestrutura cloud da própria Cursor — AIOSON não tem nem cloud.

---

### Theme 4 — Multi-Model / Tokenomics Routing

> **Verdict 2026-05-18:** `[dropped]` — opinião disfarçada de config. Risco de quebrar usuários sem Opus / surpresas de fatura / manutenção 3-cliente. Documentar recomendação em tutorial se necessário, sem feature.

**Claim do plano:** usar Composer 2 para coding, Frontier (Opus 4.7) para arquitetura. Roteamento por tipo de tarefa.

**Correções factuais do enrichment (importantes pra PRD):**
- Composer 2 é **Kimi K2.5 open-source** + RL da Cursor — implicação: a parte "open-source" pode ser autohostada fora do contrato da Cursor.
- Pricing real: **$0.50 input / $2.50 output por M tokens** (Standard), não $0.50 universal. Fast: $1.50/$7.50.
- Benchmarks: 61.7 Terminal-Bench 2.0 (acima de Opus 4.6), 73.7 SWE-bench Multilingual.

**Estado AIOSON:**
- `aioson-models.json` permite configurar `preferred_scan_provider` e providers (OpenAI, Anthropic, DeepSeek, etc.).
- Sem lógica de roteamento por classe de agente (`@dev` vs `@architect`).
- O usuário hoje escolhe o modelo via cliente IA (Claude Code → Anthropic; Codex → OpenAI). AIOSON não escolhe.

**Gap real:** AIOSON delega escolha de modelo ao cliente IA. Roteamento por agente só faria sentido se o AIOSON tivesse seu próprio runtime de inferência (não tem) OU se o cliente IA aceitasse hints declarativos (não é o caso hoje para Claude Code/Codex).

**Opção barata:** documentar em `aioson-models.json` um campo `agent_model_hints` (informativo apenas) — quando um usuário escolhe Anthropic, sugerir Haiku 4.5 para `@dev` e Opus 4.7 para `@architect`. Não força nada; surface ao usuário.

**Opção ambiciosa:** integrar via Cursor SDK como provider de execução (alterando o modelo de distribuição do AIOSON). Quebra o "small project, small solution".

---

### Theme 5 — Padrão worker outbound-only (BÔNUS — surgido no enrichment)

> **Verdict 2026-05-18:** `[out-of-scope]` — AIOSON não tem cloud component; padrão arquivado como referência caso versão hosted apareça no futuro.

**Claim:** Cursor self-hosted: cloud roda inferência + planning, worker outbound-only roda tools/file-ops dentro da rede do cliente. Sem portas inbound, sem VPN.

**Aplicabilidade ao AIOSON:** **baixa**. AIOSON é CLI 100% local. Não há cloud component. Mas é um padrão de referência caso o AIOSON eventualmente ofereça uma versão hosted (não há plano).

**Recomendação:** `[out-of-scope]` — catalogar como referência no `researchs/` e seguir.

## Risks

**Value (os usuários querem isso?)** — A base de usuários do AIOSON é pequena (admitido pelo próprio usuário em sessão de 2026-05-18). Investir em copiar Cursor 3 é desperdício se os usuários atuais já estão satisfeitos com SDD + agentes especializados via Claude Code. Risco: *framework envy* sem demanda real.

**Usability** — Gate de context-first preflight (Theme 2 ambicioso) pode irritar power users que sabem o que estão fazendo. Toda fricção adicional é taxação de produtividade — precisa ser mensurada antes de generalizar.

**Feasibility** — Themes 1 (visual ambicioso), 3 (sandbox), 5 (worker outbound) requerem reescrita do modelo de distribuição (npm CLI → app/serviço). Inviável com a estrutura atual de mantenedor único.

**Viability** — Cada novo eixo (sandbox, routing, visual) multiplica superfície de suporte. Sem squad de mantenedores, cada feature nova é dívida operacional eterna. O `harness-driven-aioson` já existente é exemplo: melhorias contínuas, não conclusão.

**Risk of NOT doing it** — O AIOSON pode ser percebido como "wrapper de slash commands" se o substrato de execução (harness) não evoluir. A diferenciação real do AIOSON é **SDD + agentes especializados + Spec-Driven** — não a infraestrutura de execução, que está sendo comoditizada pela Cursor SDK. **Conclusão honesta:** ignorar Themes 1/3/5 é provavelmente correto; Themes 2 e 4 (low-cost variants) podem ser feitos sem comprometer identidade.

## Identified gaps

1. **Métrica de eficácia atual do AIOSON ausente.** Não há baseline de quanto contexto os agentes consomem ou consultam hoje. Sem isso, qualquer ROI estimado para Theme 2 (Context-First) é especulativo.
2. **Inventário de queixas/wishlist real dos usuários atuais.** As 4 diretrizes do plano são *industry-driven*, não *user-driven*. Risco de Building-for-Hypothetical-User.
3. **Critério explícito de "está no escopo do AIOSON" vs "delegar ao cliente IA".** Tema recorrente em todos os themes acima; sem rubrica, decisões viram caso a caso e drift acumula.
4. **Estado do `harness-driven-aioson` shippado.** Não foi feito retro/lessons-learned visível neste briefing — não sei se o módulo está saturado ou ainda em expansão. Affeta decisão de Theme 2.
5. **Comparativo direto AIOSON ↔ Cursor 3 ↔ Claude Code para tarefas idênticas.** Falta evidência empírica de onde AIOSON ganha/perde. Sem isso, todo este briefing é hipotético.

## Sources

- `researchs/cursor3-harness-evolution-2026/summary.md` — 12 URLs validando Cursor 3, SDK, Composer 2, AI Harness
- `researchs/multi-agent-token-budget-2026/summary.md` — token amplificação 4-15x (Sheldon, 2026-05-13)
- `researchs/hermes-agent-architecture-2026/summary.md` — confirma FTS5+brain nodes como baseline indústria (Sheldon, 2026-05-13)
- `.aioson/context/done/MANIFEST.md` — features arquivadas (harness-driven-aioson, deyvin-density, active-learning-loop, secure-by-default)

## Open questions

1. [decision-required] **Escopo institucional**: o AIOSON deve evoluir o substrato de execução (harness) ou deve focar em SDD + agentes e delegar substrato ao cliente IA (Claude Code, Codex, Cursor)? Esta decisão filtra Themes 1, 3, 5 automaticamente.
2. [decision-required] **Theme 2 (Context-First Enforcement)** — preflight obrigatório (gate hard) ou auditoria pós-fato (gate soft)? Trade-off: fricção vs accountability.
3. [decision-required] **Theme 4 (Multi-Model)** — adicionar `agent_model_hints` informativo em `aioson-models.json` agora, ou postergar até existir cliente IA que consuma o hint?
4. [research-able] Qual o uso real de tokens por sessão AIOSON hoje? (< 4h de investigação rodando `aioson runtime:emit` filtrado por sessão).
5. [research-able] Existe levantamento ou survey dos usuários atuais do AIOSON sobre o que falta? (Provavelmente não — base muito pequena.)
6. [testable] Theme 2 barato: instrumentar 1 agente (sugestão: `@product`) com Context Preflight Section por 1 semana. Comparar qualidade de PRDs antes/depois. 1-2 dias de trabalho.
7. [testable] Theme 4 barato: implementar `agent_model_hints` informativo em `aioson-models.json` + surface no `aioson info`. Não muda comportamento, mede se usuários customizam. 0.5-1 dia.
8. [out-of-scope] Theme 3 (Sandboxing) — fora de escopo dado o modelo de distribuição npm-CLI. Documentar limitação em `secure-by-default` doc.
9. [out-of-scope] Theme 5 (Worker outbound-only) — fora de escopo; AIOSON não tem cloud component.
10. [decision-required] Após estas decisões, **quais Themes viram briefings dedicados** (com slug próprio) e quais ficam neste documento estratégico como referência?
