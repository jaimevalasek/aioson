# @planner — Um plano vertical para a feature

> **Para quem é:** quem possui um PRD aprovado e precisa transformar capacidades e ACs em etapas implementáveis.

## Para que serve

`@planner` é o dono do único plano de implementação da feature:

```text
.aioson/context/implementation-plan-{slug}.md
```

O plano conecta `CAP → encaixe no sistema atual → AC → delta de implementação → fase vertical → arquivos esperados → check executável → evidência pelo caminho de produção`.

Ele não reescreve o PRD e não cria requisitos, arquitetura ou readiness paralelos. Quando falta uma decisão de produto, devolve ao dono do PRD. As decisões técnicas são dele: absorveu o antigo `@architect` (decisões de arquitetura no plano), o `@discovery-design-doc` (descoberta do repositório e mapa de código) e o `@pm` (sequenciamento e rollout).

Além do delta por arquivo, o Planner registra em `## Engineering Controls` somente controles acionados por evidência: compatibilidade, mudança/recuperação de dados, autorização, validação, concorrência/idempotência, falhas/retry, observabilidade, desempenho, acessibilidade/localização ou dependências. Conhecimento do modelo gera hipóteses; o PRD e o código decidem o que entra no plano.

## Profundidade proporcional

- **MICRO:** poucas fases, paths delimitados e checks focados.
- **SMALL:** fases verticais completas, regressão relevante e smoke.
- **MEDIUM:** mesmos artefatos, com integrações, riscos e fronteiras compartilhadas mais detalhados.

A classificação não insere outros agentes na cadeia.

## Faixas de desenvolvimento

Depois de escrever o plano, o Planner roda `aioson execution:offer . --feature={slug} --json`. A resposta **mede** o plano (`plan.scale`: arquivos distintos, fases, ondas, fases em paralelo e as áreas de escrita em que os arquivos caem) e nomeia o passo de destravamento (`onboarding.next`). Quando `plan.scale.split_candidate` é verdadeiro (12+ arquivos para um único contexto — `AIOSON_EXECUTION_SPLIT_MIN_FILES` move o piso) ou o usuário pediu execução dividida, o Planner pergunta **uma vez**: DEV único ou faixas orquestradas — esteja o caminho destravado ou não, recomendando o que `plan.recommendation` mediu (uma trava nomeia o passo de destravamento; ela nunca inverte a recomendação). A resposta fica registrada no plano: `execution: single` no frontmatter, ou a tabela `## Development execution lanes` (`Lane | Exact write paths | Integration owner` — host e modelo vêm do arquivo de papéis, nunca do plano). Um plano acima do piso sem resposta registrada gera o aviso `[Execution Scale]` ao concluir o estágio.

As faixas são o **eixo de modelo** — cada papel `{lane}_dev` tem seu próprio host/modelo — então o Planner declara uma por superfície quando `plan.scale.surfaces` mostra backend e frontend (`plan.split_proposal` é a matéria-prima: caminhos de escrita derivados, linhas cortadas por superfície, arquivos que ninguém aloca nomeados). A `## Execution Sequence` tem **uma linha por unidade** (um processo, um contexto), nunca por fase: a fase é cortada por faixa dentro da própria onda (`1-backend`, `1-frontend`) com uma linha `IF-*` no `## Interface Contract` por fronteira; linha acima do teto (`plan.scale.units[].over_budget`: 10 arquivos ou 6 ACs) é cortada de novo em arquivos disjuntos; linhas pequenas e seriais da mesma faixa podem se fundir; um número de fase puro em `Depends on` significa todas as linhas daquela fase. Uma faixa só com uma linha por onda é serial por construção (`orchestration_serial`) — foi assim que um plano de 28 arquivos rodou 15 deles num contexto só, e o `[Execution Scale]` agora avisa mesmo com tudo verde.

Com faixas declaradas, `aioson execution:seed . --feature={slug}` grava `.aioson/config/execution-roles.json` **desligado**: um `{lane}_dev` por faixa mais `qa`, cada um numa CLI de execução instalada na máquina, no modelo padrão do harness; o revisor nasce em outra CLI quando há mais de uma. Escolher modelo, ligar o arquivo e assinar os hosts são atos do dono — o framework semeia, nunca destrava. Com a oferta respondendo `available`, `aioson execution:compile` deriva as faixas do manifesto e os prompts por unidade das tabelas.

A classificação nunca decide execução multi-modelo: a escala medida do plano ganha a pergunta; a resposta é do usuário ou do PRD aprovado.

## Gate C

Antes de implementação significativa, o plano precisa estar aprovado e:

- cobrir cada capacidade/AC relevante;
- classificar cada caminho exato como `reuse`, `modify`, `create` ou `retire` com evidência do repositório;
- incluir checks executáveis;
- identificar riscos e dependências materiais, com verificação e recuperação quando o estado persistente/externo puder mudar;
- respeitar o orçamento da classificação.

Controles genéricos sem gatilho não são adicionados “por boas práticas”. As escolhas técnicas rotineiras baseadas no repositório seguem automaticamente no Autopilot.

Antes de planejar por um protótipo, Planner executa a validação estrita de propriedade. Com `prototype_status: current`, usa apenas o protótipo da pasta da própria feature. Com `none`, ignora referências históricas e planeja a partir do PRD e do código/caminho de produção inspecionado.

## Handoff típico

- **Vem de:** `@product` ou `@sheldon`.
- **Vai para:** `@dev`.

## Veja também

- [Ficha do @product](./product.md)
- [Ficha do @dev](./dev.md)
- [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md)
