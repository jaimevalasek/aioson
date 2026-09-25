---
slug: squad-state-and-dependencies
status: done
owner: dev
created_at: 2026-09-24
classification: MICRO
risk: medium
source: direct-user-request
---

# Squad — estado preservado e dependências respeitadas

## Scope
Executar e retomar o autorun com estado persistido íntegro e tarefas liberadas somente após dependências concluídas (itens 1.1 e 1.2 do plano de confiabilidade).

## Context selected
Contexto validado; context:brief dev/executing, regras disk-first, output-brevity, source-code-language e squad-driver-pattern; revisão do Squad e plano de confiabilidade. Feature onboarding preservada.

## Implementation intelligence
Node fs para substituição atômica; better-sqlite3 existente para exclusão entre processos. src/dossier/lock.js foi inspecionado, mas seu TTL pode tomar lock de processo vivo. Sidecar SQLite coordena gravações e posse de execução; plan.json permanece autoridade portátil. Não manter transação aberta durante worker. Reutilizar getReadyTasks e o autorun existente.

## Expected files
- behavior: src/squad/plan-store.js (novo)
- behavior: src/squad/task-decomposer.js
- behavior: src/commands/squad-autorun.js
- support: tests/squad-task-decomposition.test.js
- support: tests/squad-autorun.test.js
- support: este plano e dev-state.md

## Done criteria
Atualizações concorrentes preservadas entre processos; snapshot obsoleto recusado; corrupção explícita; sessão com um executor ativo; tarefas órfãs exigem reconciliação; IDs/dependências/ciclos validados antes de efeitos; falha upstream bloqueia downstream, ramo independente continua, retomada preserva concluídas.

## Useful options considered
- Include now: revisão de snapshot, escrita atômica, posse por processo, agendamento por readiness, resumo de pendências.
- Defer: reflexão, orçamento, eventos do daemon, novo CLI e alterações de produto (demais incrementos do plano).
- Escalate: nenhuma decisão de produto pendente neste incremento.

## Verification
node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=4 tests/squad-task-decomposition.test.js tests/squad-autorun.test.js
Testes incluem processos filhos e CLI real bin/aioson.js, workers locais e evidências em disco. Rodar check:syntax e lint; ampliar somente para os consumidores afetados.

## Session state
Concluídos persistência, exclusão da sessão e scheduler. Compatibilidade: CLI antigo não conhece o protocolo de coordenação; não executar versões mistas sobre a mesma sessão. Arquivo ilegível não é recriado silenciosamente. Posse registrada em outro host fica bloqueada até reconciliação naquele host; nenhuma tomada por TTL.

## Evidência de entrega
- 49 testes passaram em seis arquivos: os dois previstos mais recovery-command, recovery-context, status-command e review-loops, leitores/vizinhos do estado alterado. Log: `.aioson/runtime/squad-state-tests.log`.
- 12 atualizações concorrentes dentro do processo e 12 em processos filhos preservadas; revisão chegou a 25 como esperado. Snapshot obsoleto recusado e JSON corrompido mantido com erro explícito.
- Interrupção antes/depois da substituição preservou plano válido; processo encerrado liberou exclusão SQLite; posse de sessão excluiu outro processo e pôde ser retomada após morte do dono.
- CLI real executou task-1 antes de task-2 mesmo com grupos invertidos; segunda execução não acrescentou efeitos. Falha upstream deixou downstream pendente, ramo independente produziu efeito; correção explícita e retomada produziram somente os efeitos restantes.
- Resumo agora considera o estado persistido completo, inclui dependências bloqueadoras e não sinaliza sucesso com tarefas incompletas. Tarefas interrompidas exigem reconciliação; retentativa de tarefa falha continua sendo decisão explícita no plano.
- Promise.allSettled mantém posse até todos os workers da onda terminarem, inclusive quando um deles lança erro.
- check:syntax: 659 arquivos; lint: 1196 arquivos, 532 apontamentos de baseline, zero novos. git diff --check sem erros.
- Ambiente validado: Windows/Node 24. Linux ainda não executado. Testes de interrupção verificam queda de processo, não falha física de disco/energia. Não há ensaio com APIs externas nem modelos pagos neste incremento.

Próximo incremento do plano geral: 1.3, conclusão vinculada a avaliação e evidência. Nenhuma publicação ou migração de projetos consumidores foi realizada.
