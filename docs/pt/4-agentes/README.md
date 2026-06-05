# Guia de Agentes AIOSON

> Índice completo dos 29 agentes, com situação de uso e saída esperada.
> Cada agente tem sua ficha — clique no nome para detalhes.

---

## Núcleo de desenvolvimento (neste diretório)

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@product](./product.md) | Define visão, PRD e escopo da feature | Início de projeto ou nova feature | `prd.md`, `spec.md` |
| [@analyst](./analyst.md) | Descobre domínio, entidades, fluxos | Após `@product`, antes de `@architect` | `architecture.md` (domínio) |
| [@scope-check](./scope-check.md) | Confronta intenção, plano e artefatos antes do código | Antes de `@dev` e após fixes relevantes | `scope-check.md` |
| [@architect](./architect.md) | Decide stack, estrutura, integração técnica | Após `@analyst` | `architecture.md` (técnico) |
| [@ux-ui](./ux-ui.md) | Design system e specs de componentes | MEDIUM, após `@architect` | `design-doc.md`, `discovery.md` |
| [@pm](./pm.md) | Backlog, user stories, ACs detalhados | MEDIUM, após `@ux-ui` | `tasks.md` |
| [@orchestrator](./orchestrator.md) | Coordena lanes paralelas de implementação | MEDIUM, após `@pm` | `.aioson/context/parallel/` |
| [@dev](./dev.md) | Implementa a feature | Após planning completo | código + `dev-state.md` |
| [@qa](./qa.md) | Testa, valida ACs, ciclo autônomo com `@dev` | Após `@dev` | `test-plan.md`, `qa-report-*.md` |
| [@validator](./validator.md) | Gate final: valida contrato binário de sucesso | Após `@qa`, antes de fechar feature | veredicto em `last-handoff.json` |
| [@tester](./tester.md) | Engenharia de testes para apps já existentes | Legacy/brownfield ou lacunas graves | `test-inventory.md` |
| [@pentester](./pentester.md) | Revisão adversarial de segurança | Antes de publicar ou por demanda | `security-findings-*.json` |

---

## Boot e roteamento

| Agente | Para que serve | Quando invocar | Saída principal |
|---|---|---|---|
| [@setup](./setup.md) | Onboarding: detecta stack, classifica projeto | Sempre primeiro num projeto novo | `project.context.md` |
| [@neo](./neo.md) | Roteador: diz qual agente é o próximo | Quando você está perdido | Orientação verbal |
| [@briefing](./briefing.md) | Transforma anotações soltas em briefing pré-PRD | Antes de `@product`, quando ideia ainda vaga | `briefing.md` |
| [@deyvin](./deyvin.md) | Pair-programming e continuidade de sessão | Retomar feature interrompida | continuação do trabalho |
| [@pair](./deyvin.md) | Alias de `@deyvin` | — | — |
| [@sheldon](./sheldon.md) | Análise técnica profunda, revisão de arquitetura | Decisões grandes, código legado | relatório de revisão |
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
| [@discovery-design-doc](./discovery-design-doc.md) | Discovery + design doc combinados | Projetos que precisam dos dois de uma vez | `discovery.md` + `design-doc.md` |

---

## Como escolher o agente certo

Se você não sabe qual agente invocar, use `@neo` — ele lê o estado do projeto e te orienta.

Veja também:
- [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md) — diagrama visual do ciclo de vida
- [Decisões iniciais](../2-comecar/decisoes-iniciais.md) — MICRO, SMALL ou MEDIUM?
- [Glossário](../1-entender/glossario.md) — definições de termos como Dossier, Handoff, Constitution
