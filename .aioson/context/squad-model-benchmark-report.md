# Benchmark Squad: 18 casos × 3 variantes

Data: 25/09/2026. Modelo fixo: Codex CLI 0.156.1 / gpt-6-sol / esforço medium. Uma tentativa por par caso/variante. Diretórios temporários separados, mesmo formato JSON e mesmas ferramentas. As instruções atuais medidas são as de `5146a8b0`; correções posteriores não entram nesta tabela.

## Protocolo

- Configuração anterior: kernel e módulo do domínio em `5508f6c0`, antes das otimizações de instruções.
- Executor único: kernel e módulo atuais, com um responsável.
- Especialização adaptativa: mesmas instruções atuais, com revisão por lentes somente quando há motivo. A revisão ocorre no mesmo agente; não mede o custo de agentes paralelos.
- Os candidatos recebem apenas o enunciado, sem critérios. Cada resposta e artefato é examinado contra três critérios críticos; a revisão humana é de um avaliador, sem adjudicação independente. `accepted` exige os três critérios e execução concluída.
- `codex exec --json` fornece tokens reais e eventos de ferramenta conforme a [documentação oficial OpenAI](https://learn.chatgpt.com/docs/non-interactive-mode). Custo monetário faturado e retrabalho humano externo não foram expostos: null. Os logs JSONL brutos e arquivos por caso ficam em `.aioson/runtime/squad-model-benchmark/` no workspace local.

## Resultado geral

| Variante | Aceitos / 18 | Critérios / 54 | Tempo mediano | Tokens de entrada | Entrada em cache | Tokens de saída | Chamadas de ferramenta | Tentativas bloqueadas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| existing-configuration | 10/18 | 41/54 | 22.3 s | 1063091 | 863360 | 11847 | 2 | 23 |
| single-executor | 10/18 | 43/54 | 21.1 s | 989018 | 787200 | 10847 | 0 | 21 |
| adaptive-specialization | 10/18 | 43/54 | 21.5 s | 987613 | 804224 | 11418 | 0 | 21 |

## Leitura dos resultados

As três variantes empataram em aceite integral: 10/18. As instruções atuais satisfizeram dois critérios a mais (43/54 contra 41/54), mas isso não comprova ganho geral de qualidade com uma tentativa por caso. Em processos houve um caso aceito a mais; em software, um a menos. Conteúdo empatou. A especialização adaptativa não superou o executor único neste corpus.

O executor único consumiu cerca de 7% menos tokens de entrada observados do que a configuração anterior e teve mediana de tempo menor em 1,2 s. A maior parte da entrada passou pelo cache, e tentativas de ferramenta/MCP variaram entre execuções; portanto essa diferença não isola custo de instruções. Não há dado de cobrança monetária.

Regressões pontuais: `process-partial-consumers` deixou de exigir o recibo de Y antes de confirmar o evento; `software-path-boundary` deixou de pedir um controle positivo com sessão válida. Ganhos pontuais: `process-duplicate-event` e `process-budget-pause`. Esses quatro casos são de desenvolvimento, adequados para corrigir a instrução e retestar sem ajustar os seis casos reservados.


## Por domínio

| Domínio | Variante | Aceitos / 6 | Critérios / 18 |
|---|---|---:|---:|
| content | existing-configuration | 5/6 | 17/18 |
| content | single-executor | 5/6 | 17/18 |
| content | adaptive-specialization | 5/6 | 17/18 |
| process | existing-configuration | 2/6 | 11/18 |
| process | single-executor | 3/6 | 14/18 |
| process | adaptive-specialization | 3/6 | 14/18 |
| software | existing-configuration | 3/6 | 13/18 |
| software | single-executor | 2/6 | 12/18 |
| software | adaptive-specialization | 2/6 | 12/18 |

## Pares de casos

| Caso | Anterior | Executor único | Adaptativa |
|---|:---:|:---:|:---:|
| content-source-summary | ✓ | ✓ | ✓ |
| content-conflicting-sources | ✓ | ✓ | ✓ |
| content-localized-opening | ✓ | ✓ | ✓ |
| content-multi-channel | ✓ | ✓ | ✓ |
| content-missing-source | — | — | — |
| content-literal-quote | ✓ | ✓ | ✓ |
| process-duplicate-event | — | ✓ | ✓ |
| process-partial-consumers | ✓ | — | — |
| process-unknown-effect | ✓ | ✓ | ✓ |
| process-budget-pause | — | ✓ | ✓ |
| process-late-event | — | — | — |
| process-approval-boundary | — | — | — |
| software-dependency-failure | ✓ | ✓ | ✓ |
| software-json-exit | — | — | — |
| software-path-boundary | ✓ | — | — |
| software-entry-smoke | — | — | — |
| software-stale-plan | ✓ | ✓ | ✓ |
| software-scaffold | — | — | — |

## Correção dirigida após o benchmark

A partir das duas regressões de desenvolvimento, `session-operations.md` passou a exigir todos os recibos antes do ack e `package-contract.md` passou a exigir um teste de sessão válida junto à rejeição de travessia. Reexecutei somente esses dois casos, com o mesmo Codex/modelo/esforço/entrada/ferramentas, uma vez por variante atual. Os prompts têm hashes novos, registrados no resultado estruturado.

| Caso | Executor único inicial → corrigido | Adaptativa inicial → corrigida |
|---|:---:|:---:|
| process-partial-consumers | — → ✓ | — → ✓ |
| software-path-boundary | — → ✓ | — → ✓ |

As quatro respostas corrigidas explicitaram o critério antes ausente. Isso valida a correção pontual nos dois casos de desenvolvimento; não recalcula o resultado dos 18 casos nem demonstra ganho geral em clientes.


## Limites de interpretação

Este experimento mede as instruções congeladas aplicadas por um único host/modelo a 18 tarefas sintéticas. Não executa o roteador, eventos, clientes reais ou agentes paralelos do AIOSON. Uma execução por caso não estima variância. Ferramentas/MCP internos invocados de forma espontânea pelo Codex e comandos bloqueados pelo ambiente isolado afetam tokens e tempo; as contagens acima tornam essa variação visível. Em `software-entry-smoke`, nenhuma variante conseguiu criar ou executar o CLI: a correção sugerida não conta como execução observada. `process-approval-boundary` não fornece o conteúdo aceito necessário para preparar publicação; as três variantes ficaram sem artefato. `content-missing-source` não deu uma estrutura de rascunho rotulada em nenhuma variante. Erros de transporte, decisões sem serviço externo e qualidade editorial não são comprovados apenas por texto. Pequenas diferenças não justificam afirmar ganho geral; ver as notas de critério em `squad-model-benchmark-results.json`.
