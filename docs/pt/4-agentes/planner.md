# @planner — Um plano vertical para a feature

> **Para quem é:** quem possui um PRD aprovado e precisa transformar capacidades e ACs em etapas implementáveis.

## Para que serve

`@planner` é o dono do único plano de implementação da feature:

```text
.aioson/context/implementation-plan-{slug}.md
```

O plano conecta `CAP → AC → fase vertical → arquivos esperados → check executável → evidência pelo caminho de produção`.

Ele não reescreve o PRD e não cria requisitos, arquitetura ou readiness paralelos. Quando falta uma decisão de produto, devolve ao dono do PRD; quando uma decisão técnica exige consultoria, pode recomendar `@architect` explicitamente.

## Profundidade proporcional

- **MICRO:** poucas fases, paths delimitados e checks focados.
- **SMALL:** fases verticais completas, regressão relevante e smoke.
- **MEDIUM:** mesmos artefatos, com integrações, riscos e fronteiras compartilhadas mais detalhados.

A classificação não insere outros agentes na cadeia.

## Faixas de desenvolvimento

Se o plano ou o usuário exigir hosts/modelos diferentes para backend, frontend ou outra frente, o plano delimita as fronteiras. O manifesto `agent-execution-{slug}.json` declara, por faixa:

- `host` e `model`;
- `prompt`;
- `write_paths`;
- fallback explícito, quando permitido.

As faixas continuam internas ao DEV, rodam sequencialmente no worktree compartilhado e são integradas pelo DEV.

## Gate C

Antes de implementação significativa, o plano precisa estar aprovado e:

- cobrir cada capacidade/AC relevante;
- nomear arquivos ou áreas esperadas;
- incluir checks executáveis;
- identificar riscos e dependências;
- respeitar o orçamento da classificação.

## Handoff típico

- **Vem de:** `@product` ou `@sheldon`.
- **Vai para:** `@dev`.

## Veja também

- [Ficha do @product](./product.md)
- [Ficha do @dev](./dev.md)
- [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md)
