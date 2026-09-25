# Squad — implementação, evidências e limites

Data: 25/09/2026. Escopo: continuidade autorizada do plano de confiabilidade e otimização, com commits locais.

## Entregue nesta rodada

| Commit | Entrega verificável |
|---|---|
| f7597637 | Pipeline guiado não confirma handoffs nem conclui por transporte; conexões completas e dependências verificadas |
| 954102eb | Agent Teams persiste prepared; preparação não conclui sessão nem roda hooks; hooks usam shell nativo e interrupção bloqueia despacho; exemplos learning corrigidos |
| 96584bb8 | squad run/status/resume compartilham sessão autorun; consulta expõe evidências, bloqueios e propriedade do processo sem mutação |
| 7212c680 | Um responsável inicial, especialistas por necessidade, perfis opcionais, sem cotas de frameworks nem biografias inventadas |
| 1e90376c | Resposta integral do worker preservada por hash e referenciada no plano/status; erro de gravação impede conclusão |
| fc427eca | squad revise prepara sessão derivada; tarefas escolhidas e dependentes ficam pendentes; original e ramos aceitos são preservados |
| 82b16335 | Plano vazio não recebe completed; preparação estruturada expõe prepared e session_id |
| 393004cd | Pipeline com run-id vincula nós a sessões estáveis, verifica entradas e conclusão; consulta não prepara nem consome handoffs |
| 3952a4c8 | Programa quebrado falha pelo entry point real; correção e rearme explícito do verificador permitem retomar sem repetir construção |
| cffb9861 | HTML proporcional ao contrato da entrega, com reuso da apresentação existente e alinhamento do kernel/contrato/módulo |
| 2cbc3775 | Lockfile sincronizado com SDK opcional e binário Cursor já declarados; instalação limpa Linux voltou a funcionar |

Correção adicional do preflight: squad:plan gerencia o plano documentado; decomposição de objetivo pertence ao autorun. Essa distinção foi conferida no handler real.

## Uso

```sh
aioson squad run . --squad=meu-squad --goal="Produzir a entrega"
aioson squad status . --squad=meu-squad --session=ID --json
aioson squad resume . --squad=meu-squad --session=ID
aioson squad revise . --squad=meu-squad --session=ID --tasks=abertura --feedback="Encurtar a abertura preservando o restante"
aioson squad:pipeline . --sub=run --pipeline=meu-pipeline --run-id=entrega-1 --goal="Produzir a entrega"
aioson squad:pipeline . --sub=status --pipeline=meu-pipeline --run-id=entrega-1 --json
```

Revisão prepara uma nova sessão e informa quais tarefas serão refeitas. O worker deve implementar o feedback; o framework controla escopo de tarefas, dependências, versões de respostas e retomada. Não há edição semântica automática de qualquer arquivo arbitrário.

Pipeline retorna o comando para executar o próximo nó; repetir o mesmo run-id consulta/reutiliza o vínculo. Nó pode fornecer `config.task_plan`; plano heurístico marca revisão de contrato necessária. Transformações arbitrárias de payload não são suportadas. Alterar objetivo ou DAG exige outro run-id.

## Auditoria de catálogo

Inventário: `squad-surface-inventory.json`.

- 80 entradas e aliases Squad, cinco agentes diretamente ligados ao fluxo, 50 skills e 15 scripts inventariados com referências estáticas.
- Auditoria existente de skills: zero órfãs, zero não registradas, 15 referências diretas, 31 somente contextuais, três observadas no runtime e uma depreciada. As categorias são as emitidas pelo auditor; uso local não equivale a uso dos clientes.
- `simplify` já está depreciada; substituição declarada: `quality:audit` e review-intelligence proporcional. Preservada a migração existente.
- 31 skills não têm frontmatter específico; são selecionadas por catálogo/framework. Isso merece enriquecimento de roteamento somente quando a seleção demonstrar uma falha, não exclusão automática.
- Nenhum componente físico removido por ausência de telemetria, idade ou volume de texto. A simplificação implementada remove obrigações sem evidência e concentra a entrada de sessões.

## Situação do plano maior

| Ciclo | Situação |
|---|---|
| 1 — confiabilidade | Pendências apresentadas de preflight, pipeline guiado, Agent Teams e exemplos CLI corrigidas; regressões de estado, concorrência, eventos e retomada mantidas. Windows e Linux exercitados; ver resultados e ressalva de paleta abaixo |
| 2 — execução coerente | run/status/resume unificados; pipeline com run-id compartilha sessões e deriva conclusão de evidências verificadas. Despacho dos nós permanece explícito. Heartbeat do status é null; a posse local do processo é consultada |
| 3 — domínios | Conteúdo com revisão e derivados, processos com recibos/recuperação e construção com entry point executado têm regressões reais. Contratos por domínio documentados. Isso não demonstra qualidade semântica geral dos modelos. Failed exige rearme explícito após verificar/corrigir a falha; não há retry automático de efeitos |
| 4 — contexto/inteligência | Instruções proporcionais implementadas. Corpus de 18 casos preparado; comparação com modelos não executada |
| 5 — revisão/reutilização | Revisão por tarefa e derivados implementada. Snapshots protegem respostas retornadas; arquivos externos apontados não são automaticamente versionados. Exemplos aprovados continuam no mecanismo existente de playbook |
| 6 — catálogo | Inventário e classificação conservadora concluídos; nenhuma remoção física possui evidência suficiente nesta auditoria |

Este relatório não declara os seis ciclos integralmente concluídos.

## Benchmark preparado

`squad-evaluation-corpus.json`: seis casos por domínio, quatro de desenvolvimento e dois reservados. Comparar configuração existente, executor único e especialização adaptativa com as mesmas entradas, ferramentas e critérios. Registrar host/modelo/versão, tentativas, aceite, retrabalho, tempo, tokens/custo medidos e falhas de recuperação. Métricas indisponíveis permanecem null.

Claude e Codex estão instalados. Foi solicitada ao operador a definição de hosts/modelos e limite de consumo antes de executar a comparação. Nenhuma chamada de modelo foi feita para esse benchmark nesta rodada.

## Verificação

- Pipeline: 14 testes, incluindo CLI real e SQLite.
- Preparação/learning/hooks: 46 testes.
- Entradas de sessão/status: sete testes.
- Instruções: 29 testes existentes.
- Artefatos completos: 46 testes com regressões autorun.
- Revisão: 45 testes; regressão posterior confirmou reutilização do snapshot de dependências já consumidas.
- Plano vazio e preparação estruturada: duas regressões.
- Preflight final: 17 testes.
- Pipeline vinculado: 61 regressões passaram, seguidas de quatro testes próprios após revisão de identidade/status.
- Entregas por domínio e prompts: 19 testes passaram.
- context:evals: OK após alinhamento final do kernel/saídas.
- Sintaxe: 665 arquivos JavaScript; lint: 1.208 arquivos, 530 achados de baseline, zero novos.
- Suíte completa intermediária: 5.452 passaram, quatro ignorados, zero falhas.
- Integração Windows final (Node 24): 5.472 testes, 5.467 aprovados, quatro ignorados e uma falha em `tests/design-seed-provenance.test.js:377` (origem de paleta undefined em vez de seed). O módulo não foi alterado nesta rodada; os 15 testes dele passaram isolados. Causa não confirmada; não declarar a suíte final inteiramente verde.
- Linux Ubuntu/WSL (Node 22.23.2): cópia isolada, instalação limpa `npm ci --omit=optional --no-audit --no-fund`, 173 testes selecionados passaram, zero falhas/ignorados. Inclui decomposição, autorun, worker, daemon, eventos, status, preflight/prompts, pipeline, sessões, revisão e construção. Não equivale à suíte inteira Linux nem a teste do SDK opcional omitido.
- Instalação limpa identificou lockfile fora de sincronia; corrigido em 2cbc3775. Logs locais: `.aioson/runtime/squad-final-integration.log`, `squad-design-regression-check.log`, `squad-linux-validation.log`, `squad-final-syntax.log` e `squad-final-lint.log`.

## Próximos incrementos necessários para encerrar o plano maior

1. Executar comparação controlada do corpus após a definição de modelos/hosts e limite de consumo solicitada ao operador. Somente essa comparação permite afirmar ganho de qualidade/custo dos modelos.
2. Investigar a falha intermitente de proveniência visual se reaparecer; a execução isolada não confirmou regressão e nenhum código de paleta foi alterado.
3. Validar uso real de clientes antes de eventual remoção física. Nenhuma remoção é recomendada com a evidência atual; essa decisão conservadora encerra o inventário, sem criar exclusões artificiais.

Evoluções não necessárias para corrigir os defeitos identificados: heartbeat persistido, despacho autônomo do pipeline, transformações de payload e comando de rearme seletivo para tarefas failed com evidência de reconciliação. Não são capacidades anunciadas como prontas.
