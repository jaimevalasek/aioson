# @scope-check

## Para que serve

O `@scope-check` valida se intenção, plano e artefatos estão alinhados antes de continuar para a implementação.  
Ele evita drift de escopo: antes de codar, confere se tudo que foi decidido está presente no PRD/especificações e no plano aprovado; após mudanças relevantes, confirma se as correções alteraram contrato, comportamento ou escopo.

## Quando usar

- Antes de `@dev` em fluxos **SMALL** e **MEDIUM** (pré-dev).  
- Após `@dev` e/ou correções de `@qa`/`@tester`/`@pentester`, quando houve mudança material de código ou comportamento.
- Em reaberturas de feature com risco de quebra de contrato entre o que foi planejado e o que está sendo entregue.

## Modos

- `pre-dev` (padrão): valida intenção e plano antes da primeira implementação.
- `post-dev` (opcional): valida se o diff entregue bate com o plano aprovado.
- `post-fix` (opcional): valida se correções mantiveram o escopo e contrato.
- `final` (opcional): reconcilia intenção, plano e resultado de fechamento.

## Arquivos de entrada

- `project.context.md`
- `prd.md` ou `prd-{slug}.md`
- `requirements-{slug}.md`
- `spec-{slug}.md`
- `architecture.md`
- `design-doc.md`, `implementation-plan-{slug}.md`, `dev-state.md` (quando existirem)
- `security-findings-{slug}.json` e outros artefatos de revisão (quando aplicável)

## Saída esperada

Cria/atualiza:

- `.aioson/context/scope-check.md` (modo projeto)
- `.aioson/context/scope-check-{slug}.md` (modo feature)

O relatório deve indicar:

- `status`: `approved | patched | needs-product | needs-analyst-redo | needs-architecture | needs-dev-fix | needs-qa-recheck | blocked`
- `next_agent`
- principais divergências encontradas e impacto
- decisão objetiva de continuação ou bloqueio

## Regras duras

- Não aprova entrega quando o que foi implementado diverge de requisito, AC ou decisão já aprovada.
- Não inventa arquivos ou comportamentos não rastreados por artefatos.
- Não aprova por “o código funciona” se houver divergência funcional relevante.
- Em MICRO, mantém o relatório mais leve; em SMALL/MEDIUM pode ser mais detalhado.

## Handoff padrão

- `approved` ou `patched`: segue para o próximo agente do fluxo.
- `needs-*`: interrompe o fluxo e encaminha com pedido explícito de correção no dono do estágio anterior.
- `blocked`: pede uma pergunta objetiva de decisão ao usuário/owner.

## Comando de ativação

```
/aioson:agent:scope-check
```

No modo CLI, use também o contexto/artefatos corretos para fechar o contrato antes de avançar para `@dev`/`@qa`.

