'use strict';

// Synthetic seed evaluation. No network without --live; no project artifacts
// enter the state. Results are evidence about these cases, not the whole SDLC.
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadJevConfig } = require('../../src/lib/jev-config');
const { runJevJudgment, validateJudgmentSpec } = require('../../src/lib/jev-judgment');
const { relationQuestions } = require('../../src/lib/jev-relations');

function specFor(row) {
  return { version: 1, id: row.id, state: { relations: [{ id: row.id, kind: row.kind, claim: { text: row.claim }, evidence: { text: row.evidence } }] },
    questions: relationQuestions([{ id: row.id }]), decision: { type: 'raw' } };
}

function metrics(cases, results, threshold = 0.7) {
  const rows = new Map(results.map((row) => [row.id, row]));
  let correct = 0, falseReady = 0, falseAlarm = 0, abstained = 0, defectDetected = 0;
  const durations = [];
  let inputTokens = 0;
  for (const item of cases) {
    const row = rows.get(item.id);
    const answer = row?.answers?.relation_0;
    const validChoice = ['supports', 'contradicts', 'insufficient_evidence', 'not_applicable'].includes(answer?.choice);
    const uncertain = !row?.ok || !validChoice || !Number.isFinite(answer?.confidence) || answer.confidence < threshold || answer.confidence > 1;
    if (uncertain) abstained++;
    else {
      if (answer.choice === item.expected) correct++;
      if (answer.choice === 'supports' && item.expected !== 'supports') falseReady++;
      if (answer.choice !== 'supports' && item.expected === 'supports') falseAlarm++;
      if (answer.choice !== 'supports' && item.expected !== 'supports') defectDetected++;
    }
    if (Number.isFinite(row?.duration_ms)) durations.push(row.duration_ms);
    inputTokens += Number.isFinite(row?.usage?.input_tokens) ? row.usage.input_tokens : 0;
  }
  durations.sort((a, b) => a - b);
  const percentile = (p) => durations.length ? durations[Math.ceil(durations.length * p) - 1] : null;
  const defects = cases.filter((row) => row.expected !== 'supports').length;
  return { total: cases.length, evaluated: cases.length - abstained, correct, false_ready: falseReady, false_alarm: falseAlarm, abstained,
    accuracy: cases.length ? correct / cases.length : null, defect_recall: defects ? defectDetected / defects : null,
    latency_p50_ms: percentile(0.5), latency_p95_ms: percentile(0.95), input_tokens: inputTokens };
}

async function main(argv = process.argv.slice(2)) {
  const opts = Object.fromEntries(argv.map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.length ? rest.join('=') : true]; }));
  if (opts.live && opts.results) throw new Error('Choose --live or --results, not both.');
  const corpus = JSON.parse(await fs.readFile(path.join(__dirname, 'fixtures/jev-relations.json'), 'utf8'));
  if (opts.split && !['calibration', 'validation'].includes(opts.split)) throw new Error('Invalid split');
  const cases = corpus.cases.filter((row) => !opts.split || row.split === opts.split);
  for (const row of cases) {
    const validation = validateJudgmentSpec(specFor(row));
    if (!validation.ok) throw new Error(`${row.id}: ${validation.errors.join(', ')}`);
  }
  let results = [];
  if (opts.live) {
    const project = path.resolve(typeof opts.project === 'string' ? opts.project : '.');
    const config = loadJevConfig(project);
    if (!config.enabled || config.status !== 'ready') throw new Error(`Jev must be explicitly enabled: ${config.reason || config.status}`);
    for (const row of cases) results.push({ id: row.id, ...await runJevJudgment({ spec: specFor(row), config: { ...config, cacheEnabled: false } }) });
  } else if (opts.results) {
    const replay = JSON.parse(await fs.readFile(String(opts.results), 'utf8'));
    results = replay.results;
    if (!Array.isArray(results) || new Set(results.map((row) => row.id)).size !== results.length) throw new Error('Invalid or duplicate result rows');
  }
  const measured = Boolean(opts.live || opts.results);
  const report = { version: 1, label: opts.label || 'located-relations', mode: measured ? opts.live ? 'live' : 'replay' : 'validate_only',
    split: opts.split || 'all', cases: cases.map(({ id, language, expected }) => ({ id, language, expected })),
    metrics: measured ? metrics(cases, results) : null,
    results, limitation: 'Small synthetic seed corpus; no measured production quality, cost saving or DEV/QA cycle improvement.' };
  if (opts.baseline) {
    const baseline = JSON.parse(await fs.readFile(String(opts.baseline), 'utf8'));
    if (!Array.isArray(baseline.results)) throw new Error('Baseline requires recorded per-case results');
    report.baseline = metrics(cases, baseline.results);
  }
  if (opts.out) await fs.writeFile(path.resolve(String(opts.out)), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { metrics, specFor, main };
