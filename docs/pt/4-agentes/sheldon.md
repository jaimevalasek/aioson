# @sheldon — Enriquecimento opcional do PRD

> **Para quem é:** quem já tem um PRD e quer uma revisão crítica antes do plano de implementação.

## Para que serve

`@sheldon` procura lacunas, premissas implícitas, edge cases, inconsistências e riscos que poderiam tornar o plano frágil. Quando necessário, usa pesquisa ou evidência do repositório para fortalecer decisões.

Ele trabalha **no mesmo** `.aioson/context/prd-{slug}.md` criado por Product. Não abre uma segunda autoridade de requisitos, arquitetura, readiness ou planejamento.

## Quando invocar

- O domínio tem decisões difíceis ou premissas ainda frágeis.
- Billing, tenancy, autorização, integrações ou migração precisam de edge cases explícitos.
- O usuário quer uma revisão adversarial do PRD antes de aprová-lo para planejamento.
- Uma pesquisa externa pode melhorar materialmente os ACs ou exclusões.

Não invoque por classificação. MICRO, SMALL e MEDIUM podem usar Sheldon ou seguir diretamente para Planner.

## O que muda no PRD

Sheldon pode acrescentar:

- perguntas bloqueantes e decisões confirmadas;
- cenários de falha e limites;
- ACs ausentes ou ambíguos;
- referências e evidência relevante;
- riscos que o Planner deve refletir nas fases.

O enriquecimento termina quando `product_scope` e `prd_ready` podem permanecer aprovados com o conteúdo revisado. Se uma decisão de produto ainda depende do usuário, Sheldon pausa.

## Relação com especialistas

Analyst, Architect, PM, UX/UI e Discovery Design Doc podem ser chamados explicitamente para uma dúvida delimitada. O parecer volta ao PRD ou ao plano pertinente e não cria um gate adicional.

## Saída principal

| Artefato | Tratamento |
|---|---|
| `.aioson/context/prd-{slug}.md` | enriquecido in-place, preservando Product como dono |
| pesquisa/dossiê | memória auxiliar não bloqueante, quando necessário |

## Handoff típico

- **Vem de:** `@product`.
- **Vai para:** `@planner`.

Sob autopilot, esse handoff é automático quando não existe decisão humana aberta.

## Veja também

- [Ficha do @product](./product.md)
- [Ficha do @planner](./planner.md)
- [Feature completa com Sheldon opcional](../3-receitas/feature-completa-com-sheldon.md)
