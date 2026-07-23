# Autopilot simplificado de features

O autopilot remove confirmações mecânicas de handoff, mas preserva decisões humanas reais e o gate humano de fechamento/publicação.

## Rota canônica

```text
[Briefing opcional → Briefing Refiner opcional] → Product → Sheldon opcional → Planner → DEV → QA → fechamento humano
```

Briefing e Briefing Refiner são opcionais quando o usuário já possui direção de produto aprovada. Sheldon é enriquecimento opcional do PRD. Analyst, Architect, Discovery Design Doc, PM, Scope Check e UX/UI continuam disponíveis como consultores, mas a classificação não os insere na rota e eles não criam pacotes obrigatórios de artefatos.

MICRO, SMALL e MEDIUM usam a mesma rota. A classificação altera profundidade, cobertura de risco e orçamento de implementação — não a quantidade de agentes de especificação.

## Execução do DEV

DEV lê o PRD aprovado, o único plano de implementação, evidência do repositório, rules/docs selecionados e o dossier não bloqueante.

Se `agent-execution-{slug}.json` habilitar explicitamente faixas de desenvolvimento, DEV pode despachar hosts/modelos diferentes para escopos separados:

```text
DEV → faixa backend → faixa frontend → integração pelo DEV → QA
```

As faixas rodam sequencialmente no worktree compartilhado. Elas são workers de runtime, não estágios do workflow nem agentes canônicos. Host/modelo ausente pausa, salvo quando a própria faixa declara fallback aplicável. O cliente atual nunca substitui silenciosamente o host indisponível por si mesmo.

## Revisão

QA é o único revisor padrão e recebe orçamento proporcional:

- MICRO/Simple Plan: ACs alterados, testes focados e um smoke pelo caminho real;
- SMALL: todos os ACs da feature, regressão focada e um smoke pelo caminho real;
- MEDIUM: negativos/integrações mais profundos somente nos riscos nomeados.

Nenhum QA roda entre fases do DEV. Ao encontrar um defeito reproduzível, QA para de ampliar a investigação e devolve o menor pacote de correção. O mesmo diagnóstico sem evidência nova não é repetido mais de duas vezes.

Tester, Pentester e Validator começam desligados. Só rodam quando estão habilitados em `agent-execution-{slug}.json` e possuem gatilho por escolha explícita do usuário, necessidade do plano aprovado ou finding concreto do QA. Classificação sozinha nunca os ativa.

## Condições de parada

O autopilot pausa por:

- decisão real de produto/segurança;
- host/modelo solicitado indisponível sem fallback explícito;
- finding bloqueante de QA ou limite de correção esgotado;
- falta de autorização para ação externa, destrutiva, deploy, publish ou release.

O autopilot nunca roda `feature:close`, commit, publish, deploy ou release sem aprovação explícita do usuário.
