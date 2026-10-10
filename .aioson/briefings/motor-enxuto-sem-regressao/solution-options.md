---
slug: motor-enxuto-sem-regressao
created_at: 2026-10-06
recommended: B
---

# Opções para simplificar o AIOSON

Exploratórias. O dono autorizou registrar a análise; nenhuma opção foi implementada ou aprovada nesta sessão.

| Opção | Forma | Ganho esperado | Risco e esforço | Avaliação |
|---|---|---|---|---|
| A — Enxugar somente a redação | Remover repetição e encurtar frases nos kernels atuais. | Manutenção mais simples; ganho de consumo possivelmente pequeno. | Esforço baixo; pode esconder instruções numa redação densa. O compressor estrutural atual já não atinge seu limiar nos sete prompts. | Útil como parte do piloto, insuficiente como estratégia isolada. |
| B — Contexto seletivo e responsabilidades claras | Kernel curto por papel, módulos por necessidade, memória relevante e reaproveitamento de prova mecânica vinculada aos mesmos inputs. | Redução de releitura e custo mantendo rastreabilidade e revisão independente. | Esforço moderado; risco de omitir contexto necessário, controlado por evals e rollback. | Recomendada para o primeiro piloto. |
| C — Fundir etapas em um planejador geral | Um agente acumula descoberta, escopo, crítica e plano, seguido de Dev/QA. | Menos handoffs; potencial redução de latência. | Risco maior de perder crítica independente e criar um prompt monolítico. Benefício ainda não medido. | Experimento posterior, separado da simplificação dos prompts. |

## Recommendation

Adotar B como hipótese de trabalho, começando por Product e seleção de contexto, após corrigir a baseline nas áreas afetadas. Conservar o fluxo atual como controle experimental. Adotar somente o que preserve resultado com menor custo medido.

Não recriar os quatro especialistas aposentados para dar a eles uma função. Suas competências já têm donos. Um modo de análise focada ou uma referência acionada por evidência pode preservar a competência sem ampliar o catálogo de agentes.

## Operational surface

Não há interface visual nova. O operador inspeciona contexto e evidências pelos comandos existentes. Uma proposta de contexto deve explicar inclusões e omissões; ausência de memória relevante é estado válido. Indisponibilidade do seletor preserva um conjunto mínimo seguro e explícito. Candidato reprovado volta ao prompt anterior, sem reescrever PRDs, aprovações ou features em andamento.
