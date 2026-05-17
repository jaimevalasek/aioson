---
briefing_source: lay-user-agent-mode
classification: SMALL
---

# PRD — Lay-user Agent Mode

## Vision
Habilitar pessoas tecnicamente curiosas mas não-desenvolvedoras a construírem sistemas complexos usando AIOSON, expondo os agentes em linguagem corrente com decisões sempre acompanhadas de uma opção recomendada explicada.

## Problem
Os agentes AIOSON atuais foram afinados para o único persona declarado no PRD principal — "Desenvolvedor". Floodam perguntas técnicas em batches de 5+ sem opção recomendada, em linguagem de engenharia (`MICRO`/`Gate D`/`tier3`/`circuit_open`). Uma pessoa não-técnica trava na primeira rodada porque não tem como decidir entre alternativas que não entende, e a infraestrutura para diferenciar comportamento por perfil de usuário (`profile` field em `project.context.md` aceita `beginner`/`developer`/`team`) existe mas é decorativa — nenhum agente lê esse campo hoje.

## Users
- **Leigo tecnicamente curioso (NOVO — persona principal desta feature)**: sabe rodar `aioson setup` em terminal mas trava em decisões técnicas durante o workflow. Quer construir sistema complexo via agentes IA e precisa de tradução clara + recomendação explícita.
- **Desenvolvedor (preservado)**: o persona original continua suportado via `profile: developer` explícito. Cadência normal (5 perguntas/batch), jargão OK, recomendações opcionais.
- **Team (preservado)**: comportamento dev + resumo executivo no fim da sessão.

## MVP scope

### Must-have 🔴

- **Skill nova `.aioson/skills/process/decision-presentation/SKILL.md`** com regras canônicas: AskUserQuestion obrigatório para decisões ao user, máximo 2-3 opções por pergunta, primeira opção sempre carrega `(Recomendado)` + 1-frase explicando por quê em linguagem corrente, trade-offs em linguagem operacional ("se escolher X, demora mais mas evita Y"), opção "Pausar / quero pensar" sempre disponível.
- **Dicionário de jargão em `.aioson/skills/process/decision-presentation/references/jargon-map.md`** com mapeamento `termo_técnico → tradução_leiga` para os termos críticos do framework (MICRO/SMALL/MEDIUM, Gate A-D, tier1/2/3, circuit_open, harness-contract, waiting_validation, ready_for_done_gate, e os ~15 outros mais expostos). i18n inicial: en + pt-BR.
- **Carga obrigatória da skill em 5 agentes user-facing**: `@neo` (já incorporado via commit `72751cb`), `@setup`, `@product`, `@dev`, `@deyvin`. Cada um adiciona ao "Deterministic preflight" a linha "Always load `.aioson/skills/process/decision-presentation/SKILL.md` before the first user-facing question. Mandatory regardless of profile." E em "Hard constraints": "Never present multiple open questions in one turn without using AskUserQuestion with explicit `(Recomendado)` marker."
- **Modo profile-aware nos 5 agentes**: ao iniciar, agente lê `profile` do `project.context.md`. `beginner` → 1 pergunta/turno, zero jargão (traduzido via dicionário), recomendação obrigatória + explicada. `developer` → comportamento atual preservado. `team` → comportamento dev + summary executivo no fim.
- **Default seguro**: quando `profile` está ausente ou `"auto"`, agentes assumem `beginner`. Devs explícitamente setam `profile: developer` no `project.context.md` (1 linha) para ter o comportamento atual.
- **Doctor check `jargon_leak_detection`**: novo check em `aioson doctor` que escaneia `agent_events` table (SQLite) e flagga ocorrências de termos do dicionário em saídas com `profile=beginner`. Severity: warning. Threshold: zero leaks em uma feature MICRO completa rodada em modo beginner = critério de aceitação do MVP. _(sheldon)_ **Scope filter obrigatório**: check só considera eventos dos 5 agentes participantes do MVP (`@neo`, `@setup`, `@product`, `@dev`, `@deyvin`) — sem filtro, os 6 agentes não-adotantes geram falsos-positivos.
- _(sheldon)_ **Pattern AskUserQuestion respeita limite de 4 opções**: a skill `decision-presentation` precisa codificar o limite do harness (AskUserQuestion aceita 2-4 opções). Para decisões genuinamente com 5+ alternativas, skill define escape hatch: "Conte com suas palavras" como opção livre, e agente sintetiza em uma das alternativas conhecidas internamente.

### Should-have 🟡

- **Aviso amigável no `aioson doctor`** quando projeto tem `profile=beginner` mas agente carregou comportamento dev (drift detection — só warna, não bloqueia).
- **Sample `.aioson/templates/example-beginner-project/`** mostrando project.context.md configurado para o persona leigo (referência docs).

## Out of scope

- Carga obrigatória da skill nos 6 agentes restantes (`@analyst`, `@architect`, `@qa`, `@discovery-design-doc`, `@briefing`, `@committer`) — fica para V2 follow-up após MVP validar.
- Tradução do dicionário para `es` e `fr` — V1 é só `en` + `pt-BR`. `es`/`fr` viram follow-up MICRO sob demanda.
- Auto-detect de profile via heurística comportamental — V2 (precisa de telemetria que ainda não existe).
- Atualização do PRD principal (`.aioson/context/prd.md`) para recognize "leigo" como persona oficial + comunicação externa (README, npm package description) — espera MVP funcionar e provar valor; vira follow-up MICRO após release.
- Onboarding de "absoluto iniciante que nunca abriu terminal" — problema de instalação global, fora desta feature.
- Dashboard / live session UI para leigos — escopo da app dashboard (repo separado).
- Validação de persona via 3-5 entrevistas — fica como atividade paralela de pesquisa, não bloqueia entrega do MVP.

## User flows

### Leigo iniciando feature MICRO em projeto novo

1. Usuário roda `aioson setup .` e seta `profile: beginner` no wizard (ou aceita default `beginner` se ausente).
2. Ativa `/product`. O agente carrega `decision-presentation` skill, detecta `profile=beginner`, e abre conversa em modo friendly: 1 pergunta aberta por turno, zero termos como "MICRO".
3. Cada decisão do user vem via AskUserQuestion com 2-3 opções, primeira marcada `(Recomendado)` + por quê em linguagem corrente.
4. Termos internos do framework aparecem na saída do agente sempre traduzidos: "tipo de feature: rápida / padrão / completa" em vez de "classification: MICRO/SMALL/MEDIUM".
5. Ao final do PRD, handoff também em linguagem leiga: "vou passar para o engenheiro de detalhes (@dev)" em vez de "next agent: /dev (Gate B pending)".

### Dev experiente preservando workflow atual

1. Usuário roda `aioson setup .` e seta `profile: developer` explícitamente.
2. Agentes detectam `profile=developer` e usam cadência atual (5 perguntas/batch, jargão OK). Comportamento V1.x preservado.
3. Skill `decision-presentation` ainda é carregada mas só ativa o modo strict quando `profile=beginner`.

### Migração beginner → developer (lifecycle esperado) _(sheldon)_

1. Usuário começa projeto novo com `profile: beginner` (default seguro). Pelos primeiros dias/semanas, agentes traduzem tudo, perguntam 1 por vez, sempre recomendam opção.
2. Conforme o usuário ganha familiaridade com vocabulário do framework (`feature`, `slug`, `gate`, etc.), os termos param de ser opacos.
3. Quando confortável, usuário edita `.aioson/context/project.context.md` mudando `profile: beginner` → `profile: developer`. Edição 1 linha.
4. Próxima ativação de agente, comportamento muda imediatamente: cadência developer, jargão liberado, recomendações opcionais.
5. `aioson doctor` pode mostrar mensagem informativa "Bem-vindo ao modo developer — você desativou tradução automática" na primeira execução pós-mudança.

Justificativa: pesquisa mostra que ferramentas de vibe coding (Lovable→Cursor) seguem esse padrão de "começa simples, gradua". Sem fluxo explícito documentado, usuário pode ficar travado em beginner achando que é permanente.

### Time/produto (profile=team) _(sheldon)_

1. Projeto com múltiplos stakeholders (dev + PM + designer não-técnico). Setar `profile: team` no `project.context.md`.
2. Agentes comportam-se como `developer` durante interação (cadência 5 perguntas, jargão OK) — assumem que quem pilota a sessão é técnico.
3. **Diferencial:** ao final de cada agente (no `agent:done`), o agente gera adicional `summary-{slug}-executive.md` em `.aioson/context/` — resumo em linguagem corrente do que foi decidido. Mantém stakeholders não-técnicos no loop sem alterar UX do operador.
4. `@architect` decide formato exato do executive summary durante implementação (provavelmente Markdown estruturado com 3-5 bullets).

## Success metrics

- **Métrica primária (verificável):** `aioson doctor` retorna `0` ocorrências do check `jargon_leak_detection` ao final de uma feature MICRO completa shipada com `profile=beginner`. Auditável em CI.
- _(sheldon)_ **Test fixture pinada**: a feature MICRO usada como ground truth do success metric é a próxima feature MICRO real shipada após este MVP entrar em produção (NÃO um synthetic test). Documentar em `.aioson/context/spec-lay-user-agent-mode.md` qual foi a fixture escolhida + commit SHA do ship.
- **Métrica secundária:** 100% das perguntas user-facing dos 5 agentes do MVP em modo `beginner` usam AskUserQuestion com opção marcada como recomendada (parseável via análise de output do agent).
- **Métricas qualitativas (V2, fora do MVP):** 3-5 entrevistas com leigos pós-release medindo "consegui terminar a feature sem precisar pedir ajuda externa" e "as opções faziam sentido para mim".

## Open questions

Questões classificadas pelo briefing que continuam abertas e que `@sheldon` ou `@analyst` precisam endereçar:

1. `[decision-required]` — `@product` linhas 269-270 hoje autoriza "5 questions per batch". Modificar (preservando comportamento dev-mode via branch interno) ou substituir (uma regra única que ramifica em profile)? Recomendação: substituir — fonte única de verdade é mais fácil de manter.
2. `[decision-required]` — Dicionário de jargão lazy-load ou inline? Recomendação do briefing: separado em `references/jargon-map.md` com carga lazy quando agente está prestes a emitir um termo do mapeamento.
3. _(sheldon)_ `[research-able]` — ~~Patterns de Cursor / Replit Ghostwriter / Lovable / v0 / Bolt para onboarding não-dev~~ **PARTIALLY CLOSED**: pesquisa em `researchs/lay-user-agent-mode-2026/summary.md` (verdict: has-alternatives). Achados-chave: market 63% non-dev, Lovable usa task-mode (não identity-mode), padrão de migração beginner→developer. Restante: validation por entrevista (3-5 candidatos), tarefa paralela.
4. `[testable]` — Pilot 1-dia com persona sintética de leigo medindo se "1 pergunta/turno" introduz fricção inaceitável. Pode rodar como parte do teste de aceitação.
5. `[out-of-scope]` — Quando atualizar `.aioson/context/prd.md` (PRD principal) para recognize leigo oficialmente — follow-up MICRO após MVP shipar.
6. `[out-of-scope]` — Drift detection do dicionário: cada feature nova introduz termos. Sem guard, dicionário desatualiza. Follow-up MICRO com doctor check `jargon_dictionary_coverage`.
7. _(sheldon)_ `[decision-required]` — **Identity-mode (`profile` field) vs task-mode (skill ativa por contexto da tarefa)**. PRD hoje usa identity-mode. Pesquisa mostra que Lovable usa task-mode (Agent Mode + Visual Edits coexistem por escolha do usuário, não por perfil). Trade-off: identity é mais simples (1 setting), task-mode é mais flexível (não exige re-classificação). Decisão de @analyst após mapear decision points.
8. _(sheldon)_ `[decision-required]` — **Naming do valor `beginner`**. Pesquisa: mercado usa "vibe coding" para o segmento não-técnico. "Beginner" pode soar "tutorial". Alternativas: `creator` (neutro), `vibe` (modern), `guided` (descreve o modo). Trade-off: muda valores aceitos em `CONTEXT_ALLOWED_PROFILES` e quebra backward-compat. @analyst pode propor 2-3 opções e levar pra você decidir.
9. _(sheldon)_ `[testable]` — **Verificar schema da tabela `agent_events` em `aios.sqlite`**: doctor check `jargon_leak_detection` pressupõe que a tabela captura output completo dos agentes, não só metadata. Se só captura metadata, doctor check precisa de nova infra (Phase 0). `@analyst` ou `@architect` verifica via `aioson context:health` + leitura direta de `runtime-store.js`.
10. _(sheldon)_ `[decision-required]` — **Schema do `jargon-map.md`**: markdown table com colunas `[term, beginner_translation_en, beginner_translation_pt-BR]`, OU YAML estruturado para parse programático? Decisão de @architect. Trade-off: markdown é human-friendly, YAML é tool-friendly.

## Visual identity

Não aplicável. Feature é comportamento de agentes em interação CLI/chat. Não há componentes visuais, mockups ou design skill envolvido. A "identidade" da experiência vive nos prompts dos agentes e na skill `decision-presentation` — não em CSS/componentes.

## Specify depth

Classification: **SMALL** (3-stage workflow: `@product → @analyst → @dev → @qa`).

Justificativa: MVP cirúrgico (5 agentes, 1 skill nova, 1 dicionário, 1 doctor check). Cross-cutting mas escopo limitado. Sem novas entidades de banco. Sem mudanças arquiteturais significativas além da skill nova.

Reclassificação para MEDIUM é possível se `@analyst` descobrir que o mapeamento exaustivo (todos os termos do framework × todos os agentes × profile) é mais profundo que estimado — flag para upgrade durante Requirements phase.

## Delivery plan _(sheldon)_

Sizing score: **4** (5 entidades + 4 user flows + AC complexity provável > 10). Path A in-place + delivery plan. SMALL classification preservada.

Três fases sequenciais, todas no mesmo ship:

### Fase 1 — Foundation: skill + dicionário (~1-2 dias)
- Criar `.aioson/skills/process/decision-presentation/SKILL.md` (~150 LOC estimado, sob orçamento <200 do brain `skill-consolidation-patterns-2026`)
- Criar `.aioson/skills/process/decision-presentation/references/jargon-map.{en,pt-BR}.{md|yaml}` (15-20 termos cobrindo MICRO/SMALL/MEDIUM, Gate A-D, tier1/2/3, circuit_open, harness-contract, waiting_validation, ready_for_done_gate, dossier, brain, scout, e adjacentes)
- Adicionar skill ao `MANAGED_FILES` em `src/constants.js`
- Sincronizar workspace ↔ template
- **Gate:** skill loadable + i18n carrega corretamente em en + pt-BR. Sem mudança comportamental ainda.

### Fase 2 — Agent integration: profile-aware + mandatory carga (~2-3 dias)
- Editar 4 agentes (`@setup`, `@product`, `@dev`, `@deyvin`) — `@neo` já feito via commit `72751cb`
  - Adicionar mandatory load da skill em "Deterministic preflight"
  - Adicionar hard constraint "Never present multiple open questions without AskUserQuestion + (Recomendado)"
  - Adicionar lógica de leitura de `profile` no kernel + branching para 1-pergunta/turno em beginner
- Atualizar `@product` linhas 269-270 substituindo a regra fixa por branch profile-aware
- Sincronizar workspace ↔ template para os 4 agentes
- Validar kernel budget continua ≤ 20000 bytes por agente
- **Gate:** rodar uma feature MICRO synthetic com `profile=beginner` e verificar manualmente que nenhum dos 4 agentes flooda 5 perguntas em batch ou usa jargão.

### Fase 3 — Verification: doctor check + acceptance fixture (~1-2 dias)
- Verificar schema `agent_events` (Q9 open) — se metadata-only, criar migration para output capture (este pode virar bloqueador → flag para @architect)
- Implementar `src/learning-loop-doctor.js` extension OR novo módulo `src/jargon-leak-doctor.js` com função `jargon_leak_detection(targetDir)` lendo `agent_events` table filtrada pelos 5 agentes participantes
- Wire em `src/doctor.js` como check `severity=warning`
- i18n keys em 4 locales (en/pt-BR/es/fr) com `doctor.jargon_leak_detection.{ok,fail,hint}`
- Testes determinísticos cobrindo: scope filter, leak detection sample, false-positive resistance
- **Gate:** `npm test` verde + `aioson doctor` retorna `0` ocorrências em uma feature MICRO completa shipada com `profile=beginner` (fixture real, não synthetic).

## Reference sources (sheldon)

- `.aioson/briefings/lay-user-agent-mode/briefings.md` — briefing original com Cagan four risks + 13 open questions classificadas
- `plans/lay-user-agent-mode.md` — raw plan da sessão `/deyvin` que disparou o briefing
- `researchs/lay-user-agent-mode-2026/summary.md` — pesquisa web (2 queries) sobre vibe coding tools + CLI agent profile patterns (verdict: has-alternatives)
- `.aioson/brains/sheldon/architecture-decisions.brain.json` — patterns 002 (classification gates), 004 (discovery before architecture), 006 (design-complete is not execution-complete)
- `.aioson/agents/neo.md` — Camada A já incorporada via commit `72751cb` (referência de implementação para Fases 2-3)
- `.aioson/docs/handoff-persistence.md` — commit `73adfd2` da mesma sessão, padrão de persistência pré-/clear que esta feature DEVE seguir nos seus próprios handoffs
