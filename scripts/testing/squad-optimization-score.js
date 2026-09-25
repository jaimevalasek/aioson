'use strict';

/** Aggregates criterion reviews without trusting candidate self-assessments. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const corpus = require('../../.aioson/context/squad-evaluation-corpus.json');
const { variants, parseTrace } = require('./squad-optimization-benchmark');

const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, '.aioson/runtime/squad-model-benchmark');
const reportPath = path.join(root, '.aioson/context/squad-model-benchmark-report.md');
const resultsPath = path.join(root, '.aioson/context/squad-model-benchmark-results.json');

function label(caseId, variant) {
  return createHash('sha256').update(`${caseId}:${variant}:review-v1`).digest('hex').slice(0, 8);
}

function buildPackets() {
  const packets = [], key = {};
  for (const sample of corpus.cases) {
    const candidates = variants.map(variant => {
      const file = path.join(runtime, sample.id, variant, 'result.json');
      if (!fs.existsSync(file)) return null;
      const result = JSON.parse(fs.readFileSync(file, 'utf8'));
      const id = label(sample.id, variant);
      key[id] = { case_id: sample.id, variant };
      return { id, result };
    }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
    if (!candidates.length) continue;
    packets.push(`# ${sample.id} (${sample.domain}, ${sample.split})\n\n`);
    packets.push(`Task: ${sample.input}\n\n`);
    packets.push(`Criteria:\n${sample.criteria.map((criterion, i) => `${i + 1}. ${criterion.text}`).join('\n')}\n\n`);
    for (const { id, result } of candidates) {
      packets.push(`## Candidate ${id}\n\n`);
      packets.push(`Execution: ${result.trace.terminal}; exit ${result.exit_code}; tool commands ${result.trace.command_executions}.\n\n`);
      packets.push(`Answer: ${result.final?.answer || '(unavailable)'}\n\n`);
      packets.push(`Evidence: ${JSON.stringify(result.final?.evidence || [])}\n\n`);
      packets.push(`Files: ${JSON.stringify(result.final?.files || [])}\n\n`);
      if (result.artifacts.length) packets.push(`Artifact excerpts:\n${result.artifacts.map(artifact => `${artifact.path}: ${artifact.content.slice(0, 1200)}`).join('\n')}\n\n`);
    }
  }
  fs.writeFileSync(path.join(runtime, 'review-packet.md'), packets.join(''));
  fs.writeFileSync(path.join(runtime, 'review-key.json'), JSON.stringify(key, null, 2));
  console.log(`Prepared ${Object.keys(key).length} anonymized reviews.`);
}

function total(values) { return values.reduce((sum, value) => sum + value, 0); }
function average(values) { return values.length ? Math.round(total(values) / values.length) : null; }
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function collect(scores) {
  const results = [];
  for (const sample of corpus.cases) for (const variant of variants) {
    const id = label(sample.id, variant);
    const review = scores[id];
    if (!review || !Array.isArray(review.criteria) || review.criteria.length !== sample.criteria.length
      || review.criteria.some(value => typeof value !== 'boolean')) throw new Error(`Incomplete review: ${sample.id}/${id}`);
    const file = path.join(runtime, sample.id, variant, 'result.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const trace = parseTrace(fs.readFileSync(path.join(runtime, sample.id, variant, 'trace.jsonl'), 'utf8'));
    const executed = raw.exit_code === 0 && raw.trace.terminal === 'turn.completed' && raw.final !== null;
    results.push({
      case_id: sample.id, domain: sample.domain, split: sample.split, candidate_id: id, variant,
      criteria: sample.criteria.map((criterion, index) => ({ id: criterion.id, text: criterion.text,
        critical: criterion.critical, passed: review.criteria[index] })),
      accepted: executed && review.criteria.every(Boolean),
      reviewer_note: review.note || '',
      executed, host: raw.host, model: raw.model, reasoning_effort: raw.reasoning_effort,
      baseline_commit: raw.baseline_commit, prompt_sha256: raw.prompt_sha256,
      prompt_characters: raw.prompt_characters, elapsed_ms: raw.elapsed_ms,
      usage: trace.usage, tool_commands: trace.command_executions,
      mcp_tool_calls: trace.mcp_tool_calls,
      blocked_tool_attempts: (raw.stderr.match(/blocked by policy/g) || []).length,
      measured_cost: null, human_rework: null,
      final: raw.final, artifacts: raw.artifacts
    });
  }
  return results;
}

function aggregate(results, variant, domain = null) {
  const rows = results.filter(row => row.variant === variant && (!domain || row.domain === domain));
  return {
    cases: rows.length,
    accepted: rows.filter(row => row.accepted).length,
    criteria_passed: total(rows.map(row => row.criteria.filter(criterion => criterion.passed).length)),
    criteria_total: total(rows.map(row => row.criteria.length)),
    median_elapsed_ms: median(rows.map(row => row.elapsed_ms)),
    mean_elapsed_ms: average(rows.map(row => row.elapsed_ms)),
    input_tokens: total(rows.map(row => row.usage?.input_tokens || 0)),
    cached_input_tokens: total(rows.map(row => row.usage?.cached_input_tokens || 0)),
    output_tokens: total(rows.map(row => row.usage?.output_tokens || 0)),
    model_tool_calls: total(rows.map(row => row.tool_commands + (row.mcp_tool_calls || 0))),
    blocked_tool_attempts: total(rows.map(row => row.blocked_tool_attempts || 0))
  };
}

function collectFollowup() {
  const reviews = JSON.parse(fs.readFileSync(path.join(runtime, 'followup-scores.json'), 'utf8'));
  const directory = `${runtime}-contract-fix-v1`;
  const results = [];
  for (const caseId of ['process-partial-consumers', 'software-path-boundary']) {
    for (const variant of variants.slice(1)) {
      const raw = JSON.parse(fs.readFileSync(path.join(directory, caseId, variant, 'result.json'), 'utf8'));
      const review = reviews[caseId]?.[variant];
      if (!review || review.criteria.length !== 3 || review.criteria.some(value => typeof value !== 'boolean')) throw new Error(`Incomplete follow-up review: ${caseId}/${variant}`);
      results.push({ case_id: caseId, variant, criteria: review.criteria,
        accepted: raw.exit_code === 0 && raw.trace.terminal === 'turn.completed' && review.criteria.every(Boolean),
        reviewer_note: review.note, prompt_sha256: raw.prompt_sha256, elapsed_ms: raw.elapsed_ms,
        usage: raw.trace.usage, final: raw.final, artifacts: raw.artifacts });
    }
  }
  return results;
}

function renderReport(results, followup = []) {
  const lines = [
    '# Benchmark Squad: 18 casos × 3 variantes', '',
    'Data: 25/09/2026. Modelo fixo: Codex CLI 0.156.1 / gpt-6-sol / esforço medium. Uma tentativa por par caso/variante. Diretórios temporários separados, mesmo formato JSON e mesmas ferramentas. As instruções atuais medidas são as de `5146a8b0`; correções posteriores não entram nesta tabela.', '',
    '## Protocolo', '',
    '- Configuração anterior: kernel e módulo do domínio em `5508f6c0`, antes das otimizações de instruções.',
    '- Executor único: kernel e módulo atuais, com um responsável.',
    '- Especialização adaptativa: mesmas instruções atuais, com revisão por lentes somente quando há motivo. A revisão ocorre no mesmo agente; não mede o custo de agentes paralelos.',
    '- Os candidatos recebem apenas o enunciado, sem critérios. Cada resposta e artefato é examinado contra três critérios críticos; a revisão humana é de um avaliador, sem adjudicação independente. `accepted` exige os três critérios e execução concluída.',
    '- `codex exec --json` fornece tokens reais e eventos de ferramenta conforme a [documentação oficial OpenAI](https://learn.chatgpt.com/docs/non-interactive-mode). Custo monetário faturado e retrabalho humano externo não foram expostos: null. Os logs JSONL brutos e arquivos por caso ficam em `.aioson/runtime/squad-model-benchmark/` no workspace local.', '',
    '## Resultado geral', '',
    '| Variante | Aceitos / 18 | Critérios / 54 | Tempo mediano | Tokens de entrada | Entrada em cache | Tokens de saída | Chamadas de ferramenta | Tentativas bloqueadas |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for (const variant of variants) {
    const a = aggregate(results, variant);
    lines.push(`| ${variant} | ${a.accepted}/18 | ${a.criteria_passed}/54 | ${(a.median_elapsed_ms / 1000).toFixed(1)} s | ${a.input_tokens} | ${a.cached_input_tokens} | ${a.output_tokens} | ${a.model_tool_calls} | ${a.blocked_tool_attempts} |`);
  }
  lines.push('', '## Leitura dos resultados', '',
    'As três variantes empataram em aceite integral: 10/18. As instruções atuais satisfizeram dois critérios a mais (43/54 contra 41/54), mas isso não comprova ganho geral de qualidade com uma tentativa por caso. Em processos houve um caso aceito a mais; em software, um a menos. Conteúdo empatou. A especialização adaptativa não superou o executor único neste corpus.', '',
    'O executor único consumiu cerca de 7% menos tokens de entrada observados do que a configuração anterior e teve mediana de tempo menor em 1,2 s. A maior parte da entrada passou pelo cache, e tentativas de ferramenta/MCP variaram entre execuções; portanto essa diferença não isola custo de instruções. Não há dado de cobrança monetária.', '',
    'Regressões pontuais: `process-partial-consumers` deixou de exigir o recibo de Y antes de confirmar o evento; `software-path-boundary` deixou de pedir um controle positivo com sessão válida. Ganhos pontuais: `process-duplicate-event` e `process-budget-pause`. Esses quatro casos são de desenvolvimento, adequados para corrigir a instrução e retestar sem ajustar os seis casos reservados.', '');
  lines.push('', '## Por domínio', '', '| Domínio | Variante | Aceitos / 6 | Critérios / 18 |', '|---|---|---:|---:|');
  for (const domain of ['content', 'process', 'software']) for (const variant of variants) {
    const a = aggregate(results, variant, domain);
    lines.push(`| ${domain} | ${variant} | ${a.accepted}/6 | ${a.criteria_passed}/18 |`);
  }
  lines.push('', '## Pares de casos', '', '| Caso | Anterior | Executor único | Adaptativa |', '|---|:---:|:---:|:---:|');
  for (const sample of corpus.cases) {
    const cells = variants.map(variant => results.find(row => row.case_id === sample.id && row.variant === variant)?.accepted ? '✓' : '—');
    lines.push(`| ${sample.id} | ${cells.join(' | ')} |`);
  }
  if (followup.length) {
    lines.push('', '## Correção dirigida após o benchmark', '',
      'A partir das duas regressões de desenvolvimento, `session-operations.md` passou a exigir todos os recibos antes do ack e `package-contract.md` passou a exigir um teste de sessão válida junto à rejeição de travessia. Reexecutei somente esses dois casos, com o mesmo Codex/modelo/esforço/entrada/ferramentas, uma vez por variante atual. Os prompts têm hashes novos, registrados no resultado estruturado.', '',
      '| Caso | Executor único inicial → corrigido | Adaptativa inicial → corrigida |', '|---|:---:|:---:|');
    for (const caseId of ['process-partial-consumers', 'software-path-boundary']) {
      const cells = variants.slice(1).map(variant => {
        const before = results.find(row => row.case_id === caseId && row.variant === variant)?.accepted;
        const after = followup.find(row => row.case_id === caseId && row.variant === variant)?.accepted;
        return `${before ? '✓' : '—'} → ${after ? '✓' : '—'}`;
      });
      lines.push(`| ${caseId} | ${cells.join(' | ')} |`);
    }
    lines.push('', 'As quatro respostas corrigidas explicitaram o critério antes ausente. Isso valida a correção pontual nos dois casos de desenvolvimento; não recalcula o resultado dos 18 casos nem demonstra ganho geral em clientes.', '');
  }
  lines.push('', '## Limites de interpretação', '',
    'Este experimento mede as instruções congeladas aplicadas por um único host/modelo a 18 tarefas sintéticas. Não executa o roteador, eventos, clientes reais ou agentes paralelos do AIOSON. Uma execução por caso não estima variância. Ferramentas/MCP internos invocados de forma espontânea pelo Codex e comandos bloqueados pelo ambiente isolado afetam tokens e tempo; as contagens acima tornam essa variação visível. Em `software-entry-smoke`, nenhuma variante conseguiu criar ou executar o CLI: a correção sugerida não conta como execução observada. `process-approval-boundary` não fornece o conteúdo aceito necessário para preparar publicação; as três variantes ficaram sem artefato. `content-missing-source` não deu uma estrutura de rascunho rotulada em nenhuma variante. Erros de transporte, decisões sem serviço externo e qualidade editorial não são comprovados apenas por texto. Pequenas diferenças não justificam afirmar ganho geral; ver as notas de critério em `squad-model-benchmark-results.json`.', '');
  return lines.join('\n');
}

function main() {
  const scores = JSON.parse(fs.readFileSync(path.join(runtime, 'review-scores.json'), 'utf8'));
  const results = collect(scores);
  const followup = collectFollowup();
  fs.writeFileSync(resultsPath, `${JSON.stringify({ schema_version: 1, status: 'completed', cases: results, followup }, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${renderReport(results, followup).trimEnd()}\n`);
  console.log(`Scored ${results.length} runs, wrote report and evidence summary.`);
}

if (require.main === module) {
  if (process.argv.includes('--review')) buildPackets();
  else main();
}
module.exports = { buildPackets, label, collect, aggregate, collectFollowup, renderReport };
