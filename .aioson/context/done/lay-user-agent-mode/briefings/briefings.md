---
slug: lay-user-agent-mode
created_at: 2026-05-16
updated_at: 2026-05-16
source_plans: ["plans/lay-user-agent-mode.md"]
---

# Briefing — Lay-user Agent Mode

## Context

AIOSON v1.9.0 acaba de sair (release em 2026-05-16) trazendo ~70 commits acumulados desde v1.8.0: Living Memory (autonomy v1.1 + bootstrap cache + reflect engine), harness validator com done-gate enforcement, sub-task scout engine, active-learning-loop com auto-distillation, modular genomes (Track 4.2/4.3), copywriter Mode 6, e um catálogo agora consolidado de 30 agentes especializados.

Esse crescimento aconteceu otimizado para o público que o PRD atual reconhece — `.aioson/context/prd.md` linha 10 lista um único usuário: **"Desenvolvedor (usuário principal)"**. Todos os agentes, kernels, mensagens, gates e termos foram afinados para esse perfil. Funciona bem para devs experientes.

O dono do projeto sinalizou (sessão de 2026-05-16) que a visão pessoal vai além: AIOSON deve ser usável por **pessoas leigas construindo sistemas complexos**. O símbolo que disparou a observação foi o comportamento atual de `@product` e `@dev` — eles "floodam" perguntas técnicas em batches de 5+ sem opção recomendada, em linguagem de engenharia. Um leigo trava na primeira rodada de perguntas porque não tem como decidir entre alternativas que ele não entende.

O `profile` field do `project.context.md` já aceita o valor `"beginner"` (declarado em `src/constants.js` como `CONTEXT_ALLOWED_PROFILES = ['developer', 'beginner', 'team']`) mas nenhum agente lê ou ramifica nele — é infraestrutura decorativa. O fundamento para o modo lay-user já existe; falta o comportamento.

Camada A da proposta já foi entregue na mesma sessão (commit `72751cb`): `@neo` foi expandido para enxergar Living Memory + harness + dossiers + brains, fechando o gap do roteador "ver retrato desatualizado". Este briefing cobre as **Camadas B, C, D** — o modo lay-user em si.

## Problem

**Persona-alvo deste briefing:** pessoa tecnicamente curiosa mas não-desenvolvedora. Consegue rodar `aioson setup` em um terminal mas trava quando os agentes começam a pedir decisões técnicas durante o workflow. Não é o "absoluto iniciante que nunca abriu terminal" — esse é problema maior (instalação, onboarding global), fora do escopo aqui.

**JTBD frame:**
> "Quando sou uma pessoa não-técnica tentando construir um sistema complexo usando agentes de IA, eu quero que os agentes traduzam decisões em linguagem corrente com uma opção claramente recomendada, para eu avançar com confiança em vez de tentar adivinhar entre termos técnicos."

**Sintomas pinados (evidência concreta no código atual):**

1. `@product` kernel autoriza flooding — `.aioson/agents/product.md` linhas 269-270:
   > "First message = one open question only"
   > "From the second message onward, ask up to 5 numbered questions per batch"

   Para um dev: cadência adequada. Para um leigo: avalanche. E nada na regra diz que perguntas devem vir com recomendação explícita.

2. Nenhuma skill existente ensina "decision-presentation". `.aioson/skills/` cobre processo (`aioson-spec-driven`, `secure-tdd`), design, marketing. Zero sobre apresentar escolhas a usuário não-técnico.

3. `profile` field é decorativo. `grep` em todos os 30 agentes: nenhum lê ou ramifica em `profile`.

4. Vazamento de jargão nas saídas: "Classification: MEDIUM — Gate D approved", "harness-contract.json shows ready_for_done_gate=true", "tier2_notified — auto-execute plus inline notify". Vêm de contratos internos e deveriam ser traduzidos na fronteira com o usuário.

## Proposed solution

Modo lay-user em três camadas, ordenadas por dependência:

**Camada A — `@neo` enxerga estado pós-v1.9.0** ✅ ENTREGUE
Commit `72751cb`. `@neo` agora lê bootstrap cache, feature dossiers, harness-contract per active feature, brains. Roteia waiting_validation → `/validator`, circuit_open → bloqueia com motivo, ready_for_done_gate → `/qa` → close. Dashboard ganhou linha `Memory:` e badges por feature.

**Camada B — Skill `decision-presentation-for-non-tech`** 🟡 ESTE BRIEFING
Novo arquivo `.aioson/skills/process/decision-presentation/SKILL.md` com regras canônicas que qualquer agente que interaja com user passa a carregar obrigatoriamente:

- Toda decisão para o user usa pattern de option-presentation (máx 2-3 opções, nunca 5+ perguntas abertas em uma vez)
- Primeira opção sempre carrega `(Recomendado)` + 1-frase "por quê" em linguagem corrente
- Dicionário de jargão proibido com equivalentes leigos:
  - `MICRO/SMALL/MEDIUM` → "rápida / padrão / completa"
  - `Gate D` → "revisão final antes de fechar"
  - `tier3_blocking` → "operação que precisa de você confirmar"
  - `circuit_open` → "trava de segurança ativou — precisa intervir"
  - `harness-contract` → "checklist de critérios de pronto"
- Trade-offs em linguagem operacional ("se escolher X, demora mais mas evita Y")
- "Pausar / quero pensar" sempre disponível como opção não-default
- Quando `profile=beginner`: 1 pergunta por turno (não 5)

**Camada C — Carga obrigatória da skill** 🟡 ESTE BRIEFING
Cada agente que interage com user adiciona ao "Deterministic preflight":
> "Always load `.aioson/skills/process/decision-presentation/SKILL.md` before the first user-facing question. Mandatory regardless of profile."

E em "Hard constraints":
> "Never present multiple open questions in one turn without using AskUserQuestion with explicit `(Recomendado)` marker."

Agentes afetados (~11): `@neo`, `@product`, `@dev`, `@deyvin`, `@qa`, `@analyst`, `@architect`, `@setup`, `@discovery-design-doc`, `@briefing`, `@committer`.

**Camada D — Kernel profile-aware** 🟡 ESTE BRIEFING
Agentes leem `profile` do `project.context.md` e ajustam:

| profile | Cadência | Jargão | Recomendações |
|---|---|---|---|
| `developer` | 5 perguntas/batch OK | OK (com hover-explain) | Opcional, encorajada |
| `beginner` | 1 pergunta/turno máx | Proibido — traduzir tudo | Obrigatória + explicada |
| `team` | 5 perguntas/batch OK | OK | Obrigatória + breve, mais resumo executivo no fim |

Default quando `profile` ausente ou `"auto"`: comportar-se como `beginner` (default mais seguro).

## Themes

A feature é coerente o suficiente para um único briefing, mas três temas internos têm conteúdo próprio e podem virar arquivos separados (`.aioson/briefings/lay-user-agent-mode/{tema}.md`) se a fase de PRD pedir profundidade extra:

### Theme 1 — Skill de apresentação de decisões
Núcleo da feature. Arquivo `SKILL.md` + opcionalmente `references/jargon-map.md` (carregamento lazy). Pattern: AskUserQuestion sempre, opção primeira com `(Recomendado)`, máx 2-3 opções, trade-off em linguagem operacional, "Pausar" sempre disponível.

### Theme 2 — Dicionário de jargão (jargon-map)
Mapeamento `termo_técnico → tradução_leiga` mantido versionado. Decisão pendente: viver dentro da skill (mais coeso) ou em `references/jargon-map.md` separado (lazy load, menos kernel bloat). Crescimento esperado: a cada feature nova do framework que introduz um termo (próximo: termos do harness-validator), o dicionário precisa ser estendido — risco de drift se não houver guard.

### Theme 3 — Profile-aware kernel cadence
Cada agente afetado precisa ler `profile`, comportar-se diferente. Implementação: ou cada agente faz `if profile === 'beginner' { ... }` no prompt, ou a skill encapsula a lógica e os agentes só carregam a skill. Recomendação: a skill carrega o profile e dita a cadência — agentes ficam imutáveis quanto ao profile, só carregam a skill.

### Theme 4 — Telemetria de adesão (auditoria)
Como medir se os agentes estão de fato respeitando o modo? Candidato: novo doctor check `jargon_leak_detection` que escaneia `agent_events` table em `.aioson/runtime/aios.sqlite` (event_type = `agent_output`) e sinaliza ocorrências de termos do dicionário em saída para `profile=beginner`. Verificável objetivamente.

## Risks

Cagan four risks + custo de inação.

**Value (os usuários vão querer?):** Não é certo. A hipótese é que existe demanda real de não-devs querendo construir sistemas complexos via AI agents. Concorrentes (Cursor, Lovable, v0, Bolt) prosperam atendendo perfis que vão do dev pleno ao não-dev. Mas a hipótese específica para AIOSON precisa de validação — o framework é spec-driven com workflow rigoroso, o que pode assustar leigo mesmo com modo friendly. **Risco médio.**

**Usability (vão conseguir usar?):** Tradução pode oversimplificar e perder nuance. "MEDIUM" → "completa" perde a informação de classificação. Risco de criar a sensação errada de "isso vai ser fácil" e depois o leigo se frustra ao bater no muro da complexidade real do que está construindo. Outro vetor: limite de 1 pergunta/turno pode ser sentido como condescendência. **Risco médio-alto.**

**Feasibility (dá pra construir?):** A skill é pequena (~80-120 linhas estimado). Carga obrigatória em 11 agentes é trabalho mecânico mas seguro. Profile-aware kernel é o ponto crítico — agentes hoje não consultam `profile` em runtime; o pattern precisa ser desenhado uma vez e replicado. Token budget dos kernels já está em 20000 bytes (foi rebudgetado em 2026-05-14); adicionar carga de mais uma skill por agente caminha próximo do teto. **Risco baixo-médio.**

**Viability (P&L, legal, suporte, marca?):** Suporte é o vetor real. Cada termo novo do framework que vazar em modo `beginner` vira ticket. Manutenção do dicionário tem que ter dono claro (proposta: doctor check + agent que sinaliza quando termo novo entra no léxico). Branding: AIOSON ainda é nichado em "AI engineering"; abrir para leigo expande mercado mas pode diluir posicionamento — escolha estratégica, não técnica. **Risco médio.**

**Custo de não fazer:** AIOSON permanece ferramenta "developer-only". Mercado de no-code-curious e product builders não-técnicos cresce — concorrentes capturam. A visão pessoal do dono do projeto ("leigo construindo sistema complexo") nunca se materializa. Investimento em Living Memory + harness + spec-driven workflow rica mas com base de usuários estreita. **Risco alto se a visão estratégica é seriamente expandir base de usuários; baixo se AIOSON deve permanecer dev-first.**

## Identified gaps

Lacunas que o briefing não fecha — ficam para `/product` (PRD) ou validação prévia:

1. **Validação do persona não-técnico** — Quem exatamente é? Quantos existem na base potencial? Eles realmente querem usar AIOSON ou uma plataforma low-code (Bubble, Webflow)? Sem isso, otimizar para hipotético usuário é caro. Sugestão: 3-5 entrevistas com candidatos antes de PRD.

2. **Métrica de sucesso lay-user-outcome** — Os candidatos no plan (jargon-leak detection, % perguntas com `(Recomendado)`) são auditáveis mas não medem outcome do usuário. Métrica mais forte seria "% de tarefas iniciadas que chegam ao fim sem o usuário abandonar a sessão" — mas isso requer mais infraestrutura de telemetria.

3. **Escopo do jargão** — Cobre só output de agente? E CLI help text (`aioson --help`)? Doctor messages? Error messages? Cada fronteira é trabalho próprio. Sugestão: V1 só agentes; CLI/doctor em V2.

4. **Auto-detect de profile** — `CONTEXT_ALLOWED_PROFILES` aceita `"auto"`? Hoje não, mas a proposta menciona "default seguro". Heurística para auto-detectar profile (e.g., user pediu para o agente explicar termos técnicos múltiplas vezes → escala para beginner) é trabalho de produto não trivial.

5. **PRD do projeto não recognize não-dev** — `.aioson/context/prd.md` linha 10 lista só "Desenvolvedor". Decisão de produto: atualizar o PRD principal OU criar PRD próprio desta feature que expande escopo? Implica em comunicação externa (README, docs).

6. **Tradução para múltiplos idiomas** — Dicionário precisa existir em en/pt-BR/es/fr (locales suportados). Quem mantém? Sugestão: V1 só pt-BR + en; es/fr são follow-up MICRO sob demanda.

7. **Drift do dicionário ao longo do tempo** — Cada feature nova introduz termos. Sem guard, o dicionário desatualiza. Proposta: doctor check que detecta termos em agent prompts não presentes no dicionário.

## Sources

Arquivos consultados durante o enriquecimento desta sessão (sem web search — cache suficiente):

- `plans/lay-user-agent-mode.md` — fonte primária deste briefing
- `.aioson/agents/product.md` — linhas 269-270 evidenciam "5 questions/batch" sem regra de recomendação
- `.aioson/agents/dev.md` — preflight + memory section
- `.aioson/agents/neo.md` — Camada A já incorporada (commit 72751cb)
- `.aioson/context/prd.md` — linhas 1-40 confirmam "Desenvolvedor" como único usuário declarado
- `.aioson/context/done/MANIFEST.md` — 12 features arquivadas, nenhuma trata de lay-user-friendly UX (zero overlap conceitual)
- `.aioson/briefings/config.md` — briefing existente `harness-driven-aioson` (status implemented), não overlapa
- `src/constants.js` — `CONTEXT_ALLOWED_PROFILES = ['developer', 'beginner', 'team']` (infra decorativa já presente)
- `researchs/skill-consolidation-patterns-2026/summary.md` — precedentes de skills compostas em Claude Code Auto Dream, Letta, etc. Padrão "<200 lines per file" é referência para tamanho da skill nova.

No research conducted in this session.

## Open questions

Classificadas conforme protocolo `@briefing`:

1. `[research-able]` — Como Cursor, Replit Ghostwriter, Lovable, v0, Bolt lidam com onboarding e UI para não-devs? Estimativa: 2-3h de research antes de `/product`. Pode revelar patterns para o jargon-map e cadência.

2. `[testable]` — Doctor check `jargon_leak_detection` é implementável (escaneia `agent_events` table em SQLite)? Experimento 1 dia: protótipo lendo eventos recentes e flagging.

3. `[testable]` — Beginner cadência "1 pergunta/turno" causa fricção de produtividade inaceitável? Pilot 1-dia com persona sintética de leigo: medir tempo até começar feature MICRO vs. tempo no modo developer.

4. `[decision-required]` — Classificação da feature: SMALL ou MEDIUM? Argumento SMALL: 1 skill nova, 11 agentes com edit mecânico. Argumento MEDIUM: cross-cutting + necessita `@analyst` para mapear (quais agentes / quais profiles / quais decision points / como o jargão se espalha pela codebase). Recomendação: **MEDIUM** — o mapeamento exaustivo é o que protege contra drift.

5. `[decision-required]` — Faseamento: todos os 11 agentes de uma vez ou incremental? Recomendação do plan: 5 primeiros (`@neo` já feito, falta `@setup`, `@product`, `@deyvin`, `@dev`), depois 6 restantes na fase 2. Reduz blast radius.

6. `[decision-required]` — `@product` linhas 269-270: modificar (preservando dev-mode) ou substituir (uma única regra que ramifica internamente)? Recomendação: substituir — fonte única de verdade é mais fácil de manter.

7. `[decision-required]` — Dicionário de jargão: dentro da skill ou em `references/jargon-map.md` separado? Recomendação: separado + lazy load — kernel da skill fica pequeno, dicionário pode crescer livremente.

8. `[decision-required]` — Default quando `profile` ausente ou `"auto"`: assumir `beginner` (mais seguro / friendly) ou `developer` (preserva comportamento atual)? Trade-off: friendliness vs. backward-compat com projetos existentes que esperam comportamento dev-first.

9. `[decision-required]` — Atualizar `.aioson/context/prd.md` (PRD do projeto) para recognize lay-user como persona oficial, OU criar PRD próprio que expande escopo? Implicação: comunicação externa (README, npm package description) muda em uma das duas direções.

10. `[research-able]` — Validação do persona com 3-5 entrevistas: existe na base potencial? Querem AIOSON ou Bubble? Estimativa: 2-3 semanas de outreach + entrevistas. Decisão de calendário fora deste briefing.

11. `[out-of-scope]` — Tradução do dicionário para `es` e `fr`. Follow-up MICRO sob demanda.

12. `[out-of-scope]` — Dashboard / live session UI para não-tech users. Escopo da app dashboard (repo separado).

13. `[out-of-scope]` — Onboarding de "absoluto iniciante que nunca abriu terminal". Problema de instalação/setup global, fora desta feature.
