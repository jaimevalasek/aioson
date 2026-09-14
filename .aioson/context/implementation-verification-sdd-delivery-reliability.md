# Verificação — SDD delivery reliability

Data: 09/09/2026. Implementação autorizada pelo usuário; executada como manutenção isolada do workflow ativo. Plano: [implementation-plan-sdd-delivery-reliability.md](implementation-plan-sdd-delivery-reliability.md).

## Resultado implementado

| Recomendação | Resultado |
|---|---|
| F1 — impasse do harness no Gate C | Planner declara a obrigação verificável; Gate C permite o contrato ainda não criado. Dev/QA/close continuam exigindo contrato real na entrega. |
| F2 — rastreabilidade do plano | Contrato `plan_contract: 2` verifica ACs declarados, cobertura, fases existentes, comandos e condições observáveis. `spec:analyze` usa a tabela canônica de ACs do PRD. |
| F3 — origem desatualizada | `plan:bind` grava SHA-256 do PRD reconciliado. Mudanças de conteúdo invalidam o vínculo, mesmo preservando mtime. Revisão Sheldon continua independente e obrigatória. |
| F4 — parser e progresso | Fases canônicas/legadas, LF/CRLF e exclusão de exemplos cercados por fences; apêndices não contam como fase. Plano canônico tem prioridade sobre manifest legado; registro grava fases e preserva checkpoints na repetição sem alterações. |
| F5 — instruções contraditórias | Craft passa por Refiner e aprovação; specs legadas não viram documentos obrigatórios novos. Kernels, skill SDD e cópias locais foram alinhados, sem ampliar os limites de contexto. |
| F6 — avaliação documental | Oito casos mecânicos, duas avaliações de roteamento, seis cenários para comparação de modelos, rubrica independente e coletor de fatos/hashes. |
| Fechamento com pendências | Política versionada; `accepted_with_followups`; evidência ligada à entrega; planos persistidos atomicamente antes do fechamento; archive idempotente; fila consultável depois do archive. |

## Política local

Ativada em `.aioson/closure-policy.json`, com autorização do usuário registrada como `jaime`: `enabled`, `auto_close` e `allow_secondary_ac_deferral` habilitados. Instalações sem política continuam com o comportamento anterior. `--step` impede autoclose nessa ativação.

Depois do QA final, a política permite fechar uma entrega aprovada ou aceita com pendências elegíveis. A aceitação condicional preserva FAILs secundários explicitamente justificados, exige evidência do comportamento principal e rejeita risco material ou desconhecido, segurança bloqueante, testes técnicos falhos e evidência desatualizada. Não usa `--force`.

Simple Plans ficam em `.aioson/context/simple-plans/` e são consultados por `aioson feature:closure . --list --json`. O workflow mostra entrega aguardando fechamento, QA reprovado e pendências. Alterações nos bytes dos arquivos declarados, incluindo binários, invalidam a decisão. Erros de persistência impedem a conclusão; falha parcial de archive informa a retomada.

## Validação executada

Ambiente: Windows, Node v24.19.0. Logs em `.aioson/runtime/quality/sdd-cycle-2026-09-08/`.

| Verificação | Resultado | Evidência |
|---|---|---|
| Suíte completa `npm test` | 5.043 testes: 5.042 passaram, 0 falhas, 1 ignorado | `final-pass.log` |
| Verificação final após reforço de hash binário | 29 passaram, 0 falhas, 0 ignorados | `final-delivery-check.log` |
| Sintaxe | 610 arquivos JavaScript verificados | `syntax-pass.log` |
| ESLint | 1.119 arquivos; 0 achados novos; 536 achados do baseline anterior | `lint-pass.log` |
| Planos e corpus distribuído de roteamento | 22 passaram, incluindo novo doc selecionado quando aplicável | `plan-and-routing.log` |
| Instalação e orçamento dos gateways | Passou após preservar as diretivas originais | `installer-complete.log` |
| Contexto e whitespace | `context:validate` válido; `git diff --check` sem erros | Verificados pelo CLI |

A validação reproduziu e corrigiu falhas de registro de comandos/aliases, limites de kernels, visibilidade do documento no seletor, preservação de avisos de segurança e frases contratuais dos entrypoints. Os limites existentes não foram aumentados para fazer os testes passar.

Os testes de entrega exercitam Gate D → aprovação sem sobrescrever QA → workflow → fechamento → archive → fila; repetição após archive; conflito de escrita; caminhos externos; política ausente/alterada; risco desconhecido; segurança crítica; origem de outra feature; metadados/arquivos alterados; e integridade de bytes binários.

## Limites da evidência

Os testes verificam os contratos executáveis e a compatibilidade nesta árvore de trabalho. Não constituem garantia absoluta de ausência de regressão em toda aplicação consumidora. O snapshot de fechamento cobre os caminhos declarados e manifests de dependências; depende de um Implementation Delta completo e de julgamento independente do QA sobre impacto.

O ganho semântico dos agentes ainda não foi medido em uma comparação real de modelos. O protocolo documenta como fazê-la sem aceitar autoavaliação do autor como evidência. Não foram executadas novas sessões pagas de modelos, publicação ou commit.

A feature ativa `execution-roles-onboarding` e seu pulse foram preservados. Não foi feita varredura nem fechamento do estoque de features existentes. Alterações locais anteriores na área de qualidade foram mantidas.
