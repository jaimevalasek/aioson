---
slug: squad-model-benchmark
status: done
owner: dev
created_at: 2026-09-25
---

# Benchmark comparável do Squad

## Scope
Executar os 18 casos preparados com Codex em três variantes de instrução, com mesmo modelo, entrada, ferramentas e formato de resposta; registrar uso real e avaliar os critérios sem mostrar respostas esperadas ao candidato.

## Context selected
Corpus `squad-evaluation-corpus.json`, instruções atuais do template, snapshot pré-otimização `5508f6c0`, CLI `codex exec --json`, autorização atual e preferência registrada de uso real somente Codex.

## Implementation intelligence
Cada execução usa diretório temporário isolado e saída JSONL da CLI. Variante antiga e atual carregam o mesmo par de superfícies aplicáveis do respectivo snapshot; flags de modelo/esforço são iguais. A variante adaptativa usa lentes de revisão no mesmo agente, pois agentes paralelos não são autorizados nesta execução. O relatório separa efeito de prompt de desempenho integral do produto.

## Expected paths
- behavior: scripts/testing/squad-optimization-benchmark.js
- behavior: scripts/testing/squad-optimization-score.js
- support: tests/squad-optimization-benchmark.test.js
- support: .aioson/context/squad-model-benchmark-report.md
- support: .aioson/context/squad-model-benchmark-results.json
- support: .aioson/context/squad-optimization-progress.md
- support: este plano, bootstrap/current-state.md

## Useful options considered
- Include now: 18×3 casos, resultados brutos locais, telemetria real da CLI, análise por domínio e exemplos de falha.
- Defer: benchmark de outro host; preferência do operador restringe uso real a Codex.
- Escalate: nenhuma publicação externa; custo monetário faturado indisponível pela CLI, registrar null.

## Verification
Teste do parser/snapshot/isolamento, execução controlada real, relatório com cobertura e limites explícitos.

Resultado: 54 execuções concluídas e revistas nos três critérios por caso; três testes do harness passaram. Todas as variantes tiveram 10/18 aceites completos na primeira rodada; detalhes, telemetria e limites no relatório e JSON estruturado. Duas regressões de desenvolvimento geraram correção separada e repetição dirigida; não alterar a pontuação inicial retroativamente.
