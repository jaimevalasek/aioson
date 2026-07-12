---
slug: agent-execution-dispatcher
status: approved
classification: MEDIUM
gate: A
---

# Requirements — Agent Execution Dispatcher

## Objective

Converter o autopilot hoje orientado por prompts em um contrato executável, portátil e retomável, sem misturar seleção de execução, política de verificação e estado do workflow.

## Requirements

- **REQ-AED-01 — Manifesto por feature.** Ao aprovar um PRD, o AIOSON deve materializar `.aioson/context/agent-execution-{slug}.json`, editável, versionado e associado ao slug, contendo host e configuração de `dev`, `qa`, `tester`, `pentester` e `validator`.
- **REQ-AED-02 — Defaults honestos.** O host atual e seu modelo configurado devem ser usados como defaults. Quando o harness não expuser catálogo, o valor deve permanecer `configured-default`; aliases não mapeados não são aceitos como IDs reais.
- **REQ-AED-03 — Validação antes do código.** Schema, slug, host, agentes obrigatórios, modos, modelos, relatórios, limites e fallback devem ser validados antes de despachar `dev`, com erros apontando JSON path e correção. Validade de configuração não implica capacidade em tempo real.
- **REQ-AED-04 — Autoridades separadas.** `workflow-execute.json` continua sendo checkpoint/progresso; `verification.json` continua decidindo habilitação e triggers; o manifesto resolve host/modelo/modo/capacidade. Conflitos devem ter precedência determinística documentada.
- **REQ-AED-05 — Dev isolado e retomável.** `dev` deve iniciar em fresh session quando suportado, receber cold-start packet canônico e retomar idempotentemente da fase pendente sem repetir uma fase concluída.
- **REQ-AED-06 — Dispatch portátil.** Adapters para `claude`, `codex` e `opencode` devem expor capabilities reais (`native_subagent`, `fresh_session`, `external_process`, `model_catalog`). Capability ausente deve pausar com orientação, não ser simulada.
- **REQ-AED-07 — Verificadores e relatórios.** O plano resolvido deve despachar somente verificadores exigidos, aguardar conclusão e persistir relatório estruturado com feature, run, agente, host, modelo solicitado/resolvido, tentativa, verdict e achados.
- **REQ-AED-08 — Ciclo de correção limitado.** Falha verificável deve retornar ao `dev`, invalidar apenas verificações afetadas e repetir até PASS ou limite por agente/ciclo; limite atingido pausa para humano.
- **REQ-AED-09 — Capacidade explícita.** Erro de capacidade deve executar somente ações autorizadas (`retry`, `wait`, `fallback`, `pause`), com limites e histórico; nenhuma troca silenciosa de host/modelo é permitida.
- **REQ-AED-10 — Observabilidade e segurança.** Tentativas, transições e decisões devem ser atômicas/auditáveis; argumentos de processo não podem ser construídos por shell interpolation; manifesto não pode guardar secrets.
- **REQ-AED-11 — Compatibilidade.** Projetos sem manifesto continuam no fluxo legado `configured-default`; `setup/update` faz merge aditivo e nunca sobrescreve escolhas do operador.
- **REQ-AED-12 — UX CLI.** Após o PRD, o usuário recebe caminho do manifesto, resumo do pipeline e comandos para validar/explicar/executar; JSON humano deve continuar legível e JSON de máquina não deve ser contaminado por prose.

## Acceptance criteria

- **AC-AED-01:** criar/registrar PRD gera um manifesto válido para o slug com os cinco agentes e defaults do host ativo.
- **AC-AED-02:** `terra`, campo desconhecido, host inválido ou modelo vazio produz falha pré-dispatch com JSON path; nenhum arquivo de source é alterado.
- **AC-AED-03:** `configured-default` é aceito quando catálogo não existe; o resumo declara que a disponibilidade só será conhecida no despacho.
- **AC-AED-04:** `verification:plan` mantém seus triggers/enabled, mas cada item executável recebe a resolução do manifesto sem modificar `verification.json`.
- **AC-AED-05:** o checkpoint referencia manifesto por path + digest; alteração incompatível durante run bloqueia retomada, alteração compatível exige revalidação registrada.
- **AC-AED-06:** um adapter sem `fresh_session` ou `native_subagent` retorna `unsupported_capability`, persiste diagnóstico e não finge execução.
- **AC-AED-07:** o dev fresh-session recebe somente feature, dev-state e pacote canônico; retomada após interrupção não repete checkpoint concluído.
- **AC-AED-08:** cada verificador selecionado produz relatório schema-valid; relatório ausente/malformado não pode virar PASS.
- **AC-AED-09:** dev aguarda relatórios pendentes e não avança para fechamento enquanto existir verificação requerida sem verdict terminal.
- **AC-AED-10:** FAIL do QA retorna ao dev e reexecuta a verificação afetada; o contador persiste entre processos.
- **AC-AED-11:** ao atingir o limite, o run termina `paused_cycle_limit` com resume command e histórico íntegro.
- **AC-AED-12:** erro de capacidade com `pause` não tenta fallback; com fallback autorizado tenta exatamente a lista/ordem configurada e registra solicitado versus resolvido.
- **AC-AED-13:** uma troca de modelo não listada no manifesto falha em teste; nenhuma mensagem pode apresentá-la como automática.
- **AC-AED-14:** projeto legado sem manifesto continua produzindo o mesmo `verification:plan` e execução existente.
- **AC-AED-15:** setup/update preserva modelos editados e adiciona apenas novos campos/defaults.
- **AC-AED-16:** testes cobrem Claude, Codex e OpenCode por adapters simulados, incluindo capacidade, timeout, cancelamento e relatório inválido.
- **AC-AED-17:** execução de processo usa argv estruturado e redige valores sensíveis em logs/relatórios.
- **AC-AED-18:** CLI oferece criação/validação/resumo/dispatch/resume com saída `--json` estável e exit code não-zero em bloqueios.

## Edge cases and migration

- Manifesto ausente: modo legado com warning e comando de materialização; manifesto inválido nunca cai silenciosamente no legado.
- Modelo removido ou sem capacidade: runtime policy, não erro de schema.
- Processo morto após spawn e antes do report: tentativa fica interrompida e pode ser reconciliada idempotentemente.
- Dois dispatchers para o mesmo run: lock/lease impede dupla execução; relatório duplicado é rejeitado por `attempt_id`.
- O manifesto v1 é adicionado sem converter `verification.json`; migrações futuras usam `version` e merge aditivo.

## Out of scope

Aliases universais, descoberta garantida de disponibilidade, fallback cross-provider implícito, substituição dos artefatos SDD ou publicação automática.

