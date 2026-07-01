# Guia de Agentes AIOSON

> Índice com 30 agentes e 1 alias, com situação de uso e saída esperada.
> Cada agente tem sua ficha — clique no nome para detalhes.
> `@pair` é alias de `@deyvin` e não possui ficha separada.

> **As colunas "Quando invocar" abaixo descrevem a capacidade de cada agente, não a ordem obrigatória do fluxo padrão.** Desde a lane lean/maestro (v1.35.0), o fluxo padrão é `@product → @sheldon → @dev → @qa` (SMALL) ou `@product → @orchestrator → @dev → @pentester → @qa` (MEDIUM) — `@analyst`, `@architect`, `@ux-ui` e `@pm` são detours opt-in ou sub-agentes do fan-out do `@orchestrator`, não hops obrigatórios. Construir a feature assim também pode rodar sozinho até a recomendação de `feature:close` — veja [Autopilot Handoff](../5-referencia/autopilot-handoff.md).

---

## Núcleo de desenvolvimento (neste diretório)

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@product](./product.md) | Define visão, PRD e escopo da feature | Início de projeto ou nova feature | `prd.md`, `spec.md` |
| [@analyst](./analyst.md) | Descobre domínio, entidades, fluxos | Detour opt-in / sub-agente do `@orchestrator` (MEDIUM) | `architecture.md` (domínio) |
| [@scope-check](./scope-check.md) | Confronta intenção, plano e artefatos antes do código | `spec:analyze` roda automático no gate `@dev`/`@qa`; detour explícito também disponível | `scope-check.md` |
| [@architect](./architect.md) | Decide stack, estrutura, integração técnica | Detour opt-in / sub-agente do `@orchestrator` (MEDIUM) | `architecture.md` (técnico) |
| [@ux-ui](./ux-ui.md) | Design system e specs de componentes | Detour opt-in para specs UI-heavy | `design-doc.md`, `discovery.md` |
| [@pm](./pm.md) | Backlog, user stories, ACs detalhados | Sub-agente do `@orchestrator` (MEDIUM) ou detour opt-in | `tasks.md` |
| [@sheldon](./sheldon.md) | **Autoridade única de spec (SMALL)** — requirements + decisões técnicas + plano faseado + harness-contract numa passada | Após `@product`, padrão do SMALL | `requirements-*.md`, `implementation-plan-*.md`, `harness-contract.json` |
| [@orchestrator](./orchestrator.md) | **Maestro de spec (MEDIUM)** — fan-out para `@analyst`/`@architect`/`@pm` (+`@ux-ui`), consolida o pacote de spec com Gates A/B/C; secundário: coordena lanes paralelas pós-spec | Após `@product`, padrão do MEDIUM | `.aioson/context/parallel/`, pacote de spec consolidado |
| [@dev](./dev.md) | Implementa a feature | Após o pacote de spec (`@sheldon`/`@orchestrator`) ou direto após `@product` (MICRO) | código + `dev-state.md` |
| [@qa](./qa.md) | Testa, valida ACs, ciclo autônomo com `@dev` (cap 3), hub do autopilot pós-dev | Após `@dev` | `test-plan.md`, `qa-report-*.md` |
| [@validator](./validator.md) | Gate final: valida contrato binário de sucesso | Após `@qa`, antes de fechar feature | veredicto em `last-handoff.json` |
| [@forge-run](./forge-run.md) | Lane B opt-in: compila e roda o workflow de verificação executável de uma feature MEDIUM | MEDIUM com contrato `verification` + plano com Wave | `forge-run.workflow.js` |
| [@tester](./tester.md) | Engenharia de testes para apps já existentes | Legacy/brownfield ou lacunas graves | `test-inventory.md` |
| [@pentester](./pentester.md) | Revisão adversarial de segurança | Antes de publicar ou por demanda | `security-findings-*.json` |

---

## Boot e roteamento

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@setup](./setup.md) | Onboarding: detecta stack, classifica projeto | Sempre primeiro num projeto novo | `project.context.md` |
| [@neo](./neo.md) | Roteador: diz qual agente é o próximo | Quando você está perdido | Orientação verbal |
| [@briefing](./briefing.md) | Transforma anotações soltas em briefing pré-PRD | Antes de `@product`, quando ideia ainda vaga | `briefing.md` |
| [@briefing-refiner](./briefing-refiner.md) | Revisa e refina um briefing existente via superfície HTML local | Após `@briefing`, antes de `@product` | `review.html`, `refinement-report.md` |
| [@deyvin](./deyvin.md) | Pair-programming e continuidade de sessão | Retomar feature interrompida | continuação do trabalho |
| [@pair](./deyvin.md) | Alias de `@deyvin` | — | — |
| [@committer](./committer.md) | Gera mensagem de commit profissional | Após implementar, antes de commitar | mensagem de commit |
| [@discover](./discover.md) | Constrói cache semântico do projeto | Onboarding em codebase grande | `.aioson/context/bootstrap/` |

---

## Especializações

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@squad](./squad.md) | Cria e gerencia squads customizados de agentes | Domínio fora do padrão AIOSON | squad em `.aioson/squads/` |
| [@genome](./genome.md) | Cria DNA cognitivo de uma persona (Genome 4.0) | Antes de forjar um advisor | `genome.yaml` |
| [@profiler-researcher](./profiler-researcher.md) | Coleta material bruto sobre pessoa pública | Passo 1 do pipeline Profiler | notas de pesquisa |
| [@profiler-enricher](./profiler-enricher.md) | Analisa cognitivamente o material | Passo 2 do pipeline Profiler | análise DISC/Enneagram/MBTI |
| [@profiler-forge](./profiler-forge.md) | Gera Genome 4.0 e advisor | Passo 3 do pipeline Profiler | `genome.yaml`, advisor |
| [@site-forge](./site-forge.md) | Clona, reconstrói ou extrai design de URL | Quando quer replicar ou inspirar-se num site | arquivos clonados, design skill |
| [@design-hybrid-forge](./design-hybrid-forge.md) | Combina dois design skills num híbrido | Quer visual que não existe nos padrões | novo design skill |
| [@orache](./orache.md) | Investigação de domínio e pesquisa estratégica | Antes de entrar num mercado novo | relatório de domínio |
| [@copywriter](./copywriter.md) | Copy de conversão: landing pages, emails | Quando precisa de texto que converte | copy entregável |
| [@discovery-design-doc](./discovery-design-doc.md) | Consolida discovery, readiness e design doc | Escopo vago ou etapa pré-dev SMALL/MEDIUM | `design-doc*.md` + `readiness*.md` |

---

## Como escolher o agente certo

Se você não sabe qual agente invocar, use `@neo` — ele lê o estado do projeto e te orienta.

Veja também:
- [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md) — diagrama visual do ciclo de vida
- [Decisões iniciais](../2-comecar/decisoes-iniciais.md) — MICRO, SMALL ou MEDIUM?
- [Glossário](../1-entender/glossario.md) — definições de termos como Dossier, Handoff, Constitution
