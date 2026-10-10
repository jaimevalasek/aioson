---
title: "Um lembrete sobre arquivo futuro parou o conserto do defeito real — e a run esperou uma pessoa"
scope: [agent-execution, execution-run, execution-contract-repair, execution-recovery, autopilot, until-complete]
paths:
  - src/agent-execution/execution-contract-repair.js
  - src/agent-execution/execution-recovery.js
  - src/agent-execution/execution-run.js
discovered_at: 2026-10-03
src: "Projeto consumidor (migração Supabase → MySQL/Prisma, 40 unidades / 15 ondas, autopilot until_complete): a run parou às 20:46 e o motor saiu às 22:23 com `decision_required`"
status: corrigido no framework
---

# Um lembrete sobre arquivo futuro parou o conserto do defeito real

## O que o consumidor sentiu

O QA da unidade `phase-6-outbound-gate` (onda 3) reprovou porque `server/src/entries/schema.ts`, de outra unidade da mesma onda, não importava a porta de saída antes dos outros imports. O mesmo relatório deixou notas `to: integration` sobre arquivos que só as ondas 13–14 criam (`worker.ts`, o teste do ciclo de jobs, o guia do VPS) e sobre documentar uma variável no `.env.example`. A run parou em `cross_unit_repair_unresolved (owner_missing)`, terminou o resto que conseguia e saiu. O `retry` manual reprovou de novo: agora era `sync.ts`, de uma unidade da onda 6 que já tinha rodado.

## Por que nada automático segurou

- `contractRepairResolution` era tudo-ou-nada: um único caminho sem dono elegível (dono só em onda posterior) devolvia `owner_missing` para o lote inteiro, inclusive o caminho com dono único.
- Notas de hand-off para `integration` contavam como pedido de conserto. Na segunda reprovação, um `contract_change` de severidade baixa sobre `.env.example` teria reaberto a unidade de fundação e todas as suas descendentes.
- Dono em onda posterior que **já rodou** (a run continua além de uma unidade pausada) nunca era considerado.
- `cross_unit_repair_unresolved` pulava recuperação contínua, supervisor e Jev: ia direto para uma pessoa, mesmo com `integration_dev` configurado e `until_complete: true`.
- Na retomada, `repairOutcomeFromState` lia primeiro as notas do DEV **aprovado**, não o relatório do QA que reprovou.
- O Jev não podia ajudar: triagem só julga quedas de ambiente (`crashed`/`timeout`/…), nunca veredito, e vê só metadados.

## O que agora impede em todo projeto

- Mensagens para `integration`/`orchestrator` só viram conserto quando um achado de defeito do mesmo relatório aponta o mesmo caminho (não contam `verification_not_run`, `manual_verification_deferred`, `note` nem severidade `low`/`info`). Mensagens para `unit:`/`lane:` seguem como antes.
- Caminho cujo dono é unidade posterior que ainda não começou é `future_paths` (a onda dela entrega), nunca `owner_missing`. Se só sobram caminhos futuros: `not_applicable` (`future_owners_only`).
- Em modo contínuo: dono posterior que já rodou é dono do defeito que escreveu; caminhos sem dono não bloqueiam os outros; com vários produtores, primeiro o que um achado de defeito prova, depois a onda mais cedo — um por vez, a próxima revisão do consumidor mostra o que restar.
- Falha de **QA** com DEV aprovado (`stage: 'qa'`): o consumidor não é reimplementado — só a revisão volta (`consumer_review_only`), esperando o produtor (`repair_dependencies`); unidades construídas sobre ele continuam válidas.
- Sem dono atribuível em run contínua → supervisor de integração assume a unidade (qualquer estágio) com autorização para **exatamente** aqueles caminhos (`supervisor_takeover.cross_unit_paths`, nota no prompt do DEV), esperando donos que estejam escrevendo. Uma tomada por unidade; a falha seguinte espera uma pessoa. Sem `integration_dev`, continua `decision_required`.
- Na retomada, uma decisão parada `cross_unit_repair_unresolved` é julgada de novo com essas regras (dono → supervisor) antes de qualquer outra coisa.

## Armadilhas para a próxima vez

- Testes de agendamento por tempo (`write lock…`, `jev review order…`, `explicit edges schedule by readiness…`) oscilam sob a carga da suíte completa e passam isolados; não tocam o reparo cruzado.
- Fixture de estado precisa de `owner: 'lane'` nas unidades: `applyContractRepair` ignora unidades sem dono de lane.
- O pacote global é symlink para este repo: o motor que já está rodando mantém o código antigo em memória; a correção vale a partir do próximo `execution:run --resume`.

Relacionado: [[the-engine-asked-the-adapter-did-not-deliver]], [[orchestrated-run-was-invisible-from-outside]]
