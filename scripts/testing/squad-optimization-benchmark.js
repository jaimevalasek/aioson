'use strict';

/** Controlled prompt comparison for the 18-case Squad corpus. */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const corpus = require('../../.aioson/context/squad-evaluation-corpus.json');
const model = 'gpt-6-sol';
const reasoningEffort = 'medium';
const baselineCommit = '5508f6c0';
const variants = ['existing-configuration', 'single-executor', 'adaptive-specialization'];
const domainDocs = {
  content: 'docs/squad/content-output.md',
  process: 'docs/squad/session-operations.md',
  software: 'docs/squad/package-contract.md'
};
const responseSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    files: { type: 'array', items: { type: 'string' } }
  }, required: ['answer', 'evidence', 'files']
};

function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function sourceText(revision, relativePath) {
  const fullPath = `template/.aioson/${relativePath}`;
  if (revision === 'current') return fs.readFileSync(path.join(root, fullPath), 'utf8');
  const result = spawnSync('git', ['show', `${revision}:${fullPath}`], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Cannot read frozen source ${revision}:${fullPath}`);
  return result.stdout;
}

function buildPrompt(sample, variant) {
  if (!variants.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
  const revision = variant === 'existing-configuration' ? baselineCommit : 'current';
  const kernel = sourceText(revision, 'agents/squad.md');
  const domain = sourceText(revision, domainDocs[sample.domain]);
  const variantInstruction = variant === 'existing-configuration'
    ? 'Follow the supplied historical Squad instructions as shipped at that revision.'
    : variant === 'single-executor'
      ? 'Use one accountable executor. Add no specialist review unless the supplied instructions strictly require it.'
      : 'Use one accountable executor and a separate review lens only when a distinct domain or risk justifies it. Keep the review within this one agent; do not spawn agents.';
  return [
    'You are completing one isolated AIOSON Squad evaluation task. Finish autonomously.',
    'Use only facts in the task. Do not invent sources, approvals, receipts, execution, or successful checks.',
    'If a requested action is impossible from the supplied context, explain the exact missing evidence or boundary.',
    'You may create and execute local files for a concrete software task, but use only this isolated workspace.',
    'Do not use network services or contact other agents. Keep the final answer concise and concrete.',
    'Do not score yourself. Put the deliverable in answer, observed checks in evidence, and created paths in files.',
    `Variant instruction: ${variantInstruction}`,
    '\n# Shipped Squad kernel\n', kernel,
    '\n# Shipped domain module\n', domain,
    '\n# User task\n', sample.input
  ].join('\n');
}

function parseTrace(jsonl) {
  const events = jsonl.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { type: 'unparseable' }; }
  });
  const terminal = [...events].reverse().find(event => ['turn.completed', 'turn.failed'].includes(event.type));
  const messages = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message');
  return {
    terminal: terminal?.type || null,
    usage: terminal?.usage || null,
    thread_id: events.find(event => event.type === 'thread.started')?.thread_id || null,
    command_executions: events.filter(event => event.type === 'item.completed' && event.item?.type === 'command_execution').length,
    mcp_tool_calls: events.filter(event => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call').length,
    model_messages: messages.length,
    errors: events.filter(event => event.type === 'error' || event.type === 'unparseable').map(event => event.message || event.type)
  };
}

function codexCommand() {
  if (process.env.AIOSON_BENCH_CODEX_JS) return { bin: process.execPath, prefix: [process.env.AIOSON_BENCH_CODEX_JS] };
  if (process.platform === 'win32') {
    const cli = path.join(path.dirname(process.execPath), 'node_modules/@openai/codex/bin/codex.js');
    if (!fs.existsSync(cli)) throw new Error(`Codex CLI unavailable: ${cli}`);
    return { bin: process.execPath, prefix: [cli] };
  }
  return { bin: 'codex', prefix: [] };
}

function runProcess(bin, args, options) {
  return new Promise(resolve => {
    const started = performance.now();
    const child = spawn(bin, args, { ...options, windowsHide: true });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 240000);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 12_000_000) child.kill(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 1_000_000) child.kill(); });
    child.on('error', error => { stderr += `\n${error.message}`; });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timed_out: timedOut, elapsed_ms: Math.round(performance.now() - started) }); });
    child.stdin.end(options.input);
  });
}

async function listArtifacts(directory) {
  const artifacts = [];
  async function walk(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && !['schema.json', 'last.json'].includes(entry.name)) {
        const stat = await fsp.stat(file);
        if (stat.size <= 65536) artifacts.push({ path: path.relative(directory, file).replaceAll('\\', '/'), bytes: stat.size,
          sha256: sha(await fsp.readFile(file)), content: await fsp.readFile(file, 'utf8') });
      }
    }
  }
  await walk(directory);
  return artifacts;
}

async function runOne(sample, variant, outputRoot) {
  const target = path.join(outputRoot, sample.id, variant);
  const resultPath = path.join(target, 'result.json');
  const prompt = buildPrompt(sample, variant);
  if (fs.existsSync(resultPath)) {
    const previous = JSON.parse(await fsp.readFile(resultPath, 'utf8'));
    if (previous.prompt_sha256 !== sha(prompt)) throw new Error(`Prompt changed for cached result: ${sample.id}/${variant}`);
    return previous;
  }
  await fsp.mkdir(target, { recursive: true });
  const workspace = await fsp.mkdtemp(path.join(os.tmpdir(), `aioson-squad-eval-${sample.id}-`));
  try {
    const schemaPath = path.join(workspace, 'schema.json');
    const lastPath = path.join(workspace, 'last.json');
    await fsp.writeFile(schemaPath, JSON.stringify(responseSchema));
    const { bin, prefix } = codexCommand();
    const args = [...prefix, 'exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '--sandbox', 'workspace-write', '--ephemeral', '--json', '--model', model,
      '-c', `model_reasoning_effort=${reasoningEffort}`, '-C', workspace,
      '--output-schema', schemaPath, '--output-last-message', lastPath, '-'];
    const executed = await runProcess(bin, args, { cwd: workspace, input: prompt });
    const trace = parseTrace(executed.stdout);
    const finalRaw = await fsp.readFile(lastPath, 'utf8').catch(() => null);
    let final = null;
    try { final = finalRaw ? JSON.parse(finalRaw) : null; } catch { /* malformed final stays null */ }
    const result = {
      case_id: sample.id, domain: sample.domain, split: sample.split, variant,
      host: 'codex-cli', model, reasoning_effort: reasoningEffort, baseline_commit: baselineCommit,
      prompt_sha256: sha(prompt), prompt_characters: prompt.length,
      exit_code: executed.code, timed_out: executed.timed_out, elapsed_ms: executed.elapsed_ms,
      trace, final, artifacts: await listArtifacts(workspace),
      measured_cost: null, human_rework: null, stderr: executed.stderr.slice(-3000)
    };
    await fsp.writeFile(path.join(target, 'trace.jsonl'), executed.stdout);
    await fsp.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally { await fsp.rm(workspace, { recursive: true, force: true }); }
}

async function main() {
  const caseFlag = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
  const variantFlag = process.argv.find(arg => arg.startsWith('--variant='))?.slice(10);
  const runId = process.argv.find(arg => arg.startsWith('--run-id='))?.slice(9);
  if (runId && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(runId)) throw new Error('Invalid run ID');
  const caseIds = caseFlag ? new Set(caseFlag.split(',')) : null;
  const selected = corpus.cases.filter(sample => !caseIds || caseIds.has(sample.id));
  const selectedVariants = variantFlag ? variants.filter(variant => variant === variantFlag) : variants;
  if (!selected.length || !selectedVariants.length) throw new Error('Unknown case or variant');
  const outputRoot = path.join(root, `.aioson/runtime/squad-model-benchmark${runId ? `-${runId}` : ''}`);
  await fsp.mkdir(outputRoot, { recursive: true });
  const jobs = selected.flatMap(sample => selectedVariants.map(variant => [sample, variant]));
  let next = 0, complete = 0;
  async function worker() {
    while (next < jobs.length) {
      const [sample, variant] = jobs[next++];
      const result = await runOne(sample, variant, outputRoot);
      complete++;
      process.stdout.write(`${complete}/${jobs.length} ${sample.id} ${variant}: ${result.trace.terminal || 'no-terminal'}; ${result.elapsed_ms}ms; tokens=${result.trace.usage?.input_tokens ?? 'unavailable'}/${result.trace.usage?.output_tokens ?? 'unavailable'}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildPrompt, parseTrace, responseSchema, variants };
