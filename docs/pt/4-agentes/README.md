# Guia de Agentes AIOSON

> Índice dos agentes públicos, com situação de uso e saída esperada.
> Cada agente tem sua ficha — clique no nome para detalhes.
> `@pair` é alias de `@deyvin` e não possui ficha separada.

> **As colunas "Quando invocar" descrevem capacidades, não a ordem obrigatória.** A rota de feature é `[@briefing → @briefing-refiner] → @product → [@sheldon] → @planner → @dev → @qa`. Os colchetes indicam etapas opcionais. MICRO, SMALL e MEDIUM mudam profundidade e orçamento, não a cadeia. Especialistas entram somente sob pedido explícito ou por uma necessidade nomeada. Veja [Autopilot Handoff](../5-referencia/autopilot-handoff.md).

---

## Núcleo de desenvolvimento (neste diretório)

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@product](./product.md) | Define visão, PRD e escopo da feature | Início de projeto ou nova feature | `prd-{slug}.md` |
| [@analyst](./analyst.md) | Descobre domínio, entidades, fluxos | Consultoria explícita quando há dúvida de domínio | análise no PRD ou artefato consultivo |
| [@scope-check](./scope-check.md) | Confronta intenção, plano e entrega como parecer consultivo | Somente sob pedido explícito; checks determinísticos não ativam o agente | `scope-check.md` |
| [@architect](./architect.md) | Decide stack, estrutura, integração técnica | Consultoria explícita para uma decisão arquitetural aberta | registro da decisão ou parecer |
| [@ux-ui](./ux-ui.md) | Design system e specs de componentes | Detour opt-in para specs UI-heavy | `design-doc.md`, `discovery.md` |
| [@pm](./pm.md) | Consultoria de backlog e priorização | Sob pedido explícito; não substitui `@planner` | parecer ou backlog consultivo |
| [@sheldon](./sheldon.md) | Enriquece e revisa criticamente o PRD em vigor | Opcional após `@product` | o mesmo `prd-{slug}.md`, enriquecido |
| [@planner](./planner.md) | Transforma o PRD aprovado em etapas verticais executáveis | Sempre antes de implementação significativa | `implementation-plan-{slug}.md` |
| [@orchestrator](./orchestrator.md) | Coordena uma sessão ou especialistas quando solicitado | Somente sob pedido explícito | coordenação e handoffs |
| [@dev](./dev.md) | Implementa e integra a feature | Após o plano aprovado | código + `dev-state.md` |
| [@qa](./qa.md) | Revisão final proporcional e independente | Após `@dev` | `qa-report-{slug}.md` |
| [@validator](./validator.md) | Verifica contrato binário quando habilitado | Especialista opt-in após QA | veredicto do harness |
| [@forge-run](./forge-run.md) | Lane B opt-in: compila e roda o workflow de verificação executável de uma feature MEDIUM | MEDIUM com contrato `verification` + plano com Wave | `forge-run.workflow.js` |
| [@tester](./tester.md) | Engenharia de testes para apps já existentes | Especialista opt-in para cobertura adicional | `test-inventory.md` |
| [@pentester](./pentester.md) | Revisão adversarial de segurança | Especialista opt-in, por pedido ou risco concreto | `security-findings-*.json` |

---

## Boot e roteamento

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@setup](./setup.md) | Onboarding: detecta stack, classifica projeto | Sempre primeiro num projeto novo | `project.context.md` |
| [@neo](./neo.md) | Roteador: diz qual agente é o próximo | Quando você está perdido | Orientação verbal |
| [@briefing](./briefing.md) | Transforma anotações soltas em briefing pré-PRD | Antes de `@product`, quando ideia ainda vaga | `briefing.md` |
| [@briefing-refiner](./briefing-refiner.md) | Loop de refino de briefing: audita em achados estruturados, o CLI renderiza a revisão (`briefing:review`) e aplica o feedback confirmado (`briefing:apply-feedback`) | Após `@briefing`, antes de `@product` | `refinement-findings.json`, `review.html` (CLI), `refinement-feedback.json`, `refinement-report.md` |
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
| [@discovery-design-doc](./discovery-design-doc.md) | Consolida discovery e design quando isso é o objetivo | Consultoria explícita; não é gate canônico | `design-doc*.md` + `readiness*.md` |

---

## Como escolher o agente certo

Se você não sabe qual agente invocar, use `@neo` — ele lê o estado do projeto e te orienta.

Veja também:
- [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md) — diagrama visual do ciclo de vida
- [Decisões iniciais](../2-comecar/decisoes-iniciais.md) — MICRO, SMALL ou MEDIUM?
- [Glossário](../1-entender/glossario.md) — definições de termos como Dossier, Handoff, Constitution
