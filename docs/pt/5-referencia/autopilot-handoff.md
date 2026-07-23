# Autopilot simplificado de features

O autopilot remove confirmações mecânicas de handoff, mas preserva decisões humanas reais e o gate humano de fechamento/publicação.

## Rota canônica

```text
[Briefing opcional → Briefing Refiner opcional] → Product → Sheldon opcional → Planner → DEV → QA → fechamento humano
```

Briefing e Briefing Refiner são opcionais quando o usuário já possui direção de produto aprovada. Sheldon é enriquecimento opcional do PRD. Analyst, Architect, Discovery Design Doc, PM, Scope Check e UX/UI continuam disponíveis como consultores, mas a classificação não os insere na rota e eles não criam pacotes obrigatórios de artefatos.

MICRO, SMALL e MEDIUM usam a mesma rota. A classificação altera profundidade, cobertura de risco e orçamento de implementação — não a quantidade de agentes de especificação.

`@dev --auto` (ou `aioson agent:prompt dev . --auto`) ativa o Autopilot apenas para essa ativação, mesmo quando o padrão do projeto está desligado. `--step` faz o inverso e vence em caso de conflito. Esses flags não reescrevem a preferência persistente da feature. Em qualquer modo, a cadeia termina no veredito do QA e aguarda autorização humana para `feature:close`/publicação.

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

Quando Tester/Pentester encontra um defeito determinístico que preserva comportamento, contratos, dados e arquitetura e cabe no orçamento limitado do especialista, ele persiste os paths permitidos, implementa a correção em um ciclo finito e devolve ao QA como `needs_validation`. O CLI limita o pacote a 3 paths de comportamento/5 totais, captura o baseline Git e impede o retorno ao QA quando o diff sai do escopo. Um passe direto sobre especialista desligado exige `--manual` no `review-cycle:advance` e não altera o manifesto. Correções transversais são consolidadas uma única vez para o DEV. QA sempre reinspeciona o diff e é o único dono do PASS/Gate D.

Essas correções baseadas em evidência não abrem confirmação mecânica no Autopilot. O fluxo pausa apenas para decisão material, limite esgotado ou ação externa/destrutiva sem autorização.

O vínculo de protótipo também é resolvido sem confirmação mecânica: somente o protótipo e manifesto da pasta do slug ativo podem ser `current`; um artefato ausente, cruzado ou pertencente a uma feature fechada vira `none`, é citado como referência histórica excluída e o repositório passa a ser o baseline. Product, Sheldon, Planner, DEV/Deyvin e QA mostram essa resolução no chat. O Autopilot só pausa se o usuário quiser promover o protótipo histórico a nova autoridade de produto.

## Condições de parada

O autopilot pausa por:

- decisão real de produto/segurança;
- host/modelo solicitado indisponível sem fallback explícito;
- finding bloqueante de QA ou limite de correção esgotado;
- falta de autorização para ação externa, destrutiva, deploy, publish ou release.

O autopilot nunca roda `feature:close`, commit, publish, deploy ou release sem aprovação explícita do usuário.
