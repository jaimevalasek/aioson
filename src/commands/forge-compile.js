'use strict';

/**
 * aioson forge:compile — compila os artefatos SDD de uma feature MEDIUM num
 * workflow script determinístico (Lane B / Fase 5 do plano de verificação
 * executável).
 *
 * Entradas (todas produzidas pelas fases 1-4):
 * - `.aioson/plans/{slug}/harness-contract.json` — critérios binários com
 *   `verification` (convergência) + governor (bounds do loop)
 * - `.aioson/context/implementation-plan-{slug}.md` — Execution Sequence com
 *   coluna Wave (fases disjuntas em arquivos = estágios paralelos)
 * - `spec:analyze` limpo — erros bloqueiam a compilação; `wave_file_overlap`
 *   (warning no analyze) é ERRO aqui: compilar paralelismo sobre arquivos
 *   sobrepostos é pedir merge conflict.
 *
 * Saída: `.aioson/plans/{slug}/forge-run.workflow.js` — script auditável e
 * versionável (commita junto da spec) para o runtime de dynamic workflows do
 * Claude Code. O script NUNCA roda feature:close — o fechamento é gate humano.
 *
 * Restrições do runtime respeitadas no código gerado: `export const meta`
 * literal puro, JS plano (sem TS), sem Date.now()/Math.random()/new Date(),
 * fix-loop limitado pelo governor, fixes sequenciais (criterios podem
 * compartilhar arquivos — paralelo só onde as waves provam disjunção).
 * Texto vindo de artefatos entra no script via JSON.stringify (nunca
 * interpolação crua — neutraliza injeção de template/backtick).
 */

const fs = require('node:fs');
const path = require('node:path');

const { validateContract, resolveContract } = require('../harness/contract-schema');
const { parseExecutionWaves, groupByWave } = require('../harness/plan-waves');

const ADVERSARIAL_VOTES = 3;
const DEFAULT_MAX_FIX_ROUNDS = 5;

/** String JS segura (literal via JSON.stringify — nunca interpolar cru). */
function js(value) {
  return JSON.stringify(value);
}

function buildDevPrompt(slug, row) {
  return [
    `You are @dev executing ONLY phase ${row.phase} of feature ${slug} (AIOSON Lane B).`,
    `Read .aioson/context/implementation-plan-${slug}.md (Required Context Package + Pre-Taken Decisions) and follow .aioson/agents/dev.md conventions.`,
    `Phase scope: ${row.scope || '(see plan)'}.`,
    `You may ONLY create/modify these files and their tests: ${row.files.length ? row.files.join(', ') : '(see plan phase row)'}. Other phases run concurrently on disjoint files — never touch files outside your list.`,
    `Done criteria for this phase: ${row.done || '(see plan)'}.`,
    'Implement, run the project tests for your scope, and report. Your final message is machine-consumed.'
  ].join('\n');
}

function buildScript({ slug, waves, execCriteria, judgedCriteria, maxFixRounds }) {
  const metaPhases = [
    ...waves.map((w) => ({
      title: `Wave ${w.wave}`,
      detail: w.phases.map((p) => `phase ${p.phase}`).join(' + ')
    })),
    { title: 'Verify', detail: 'deterministic harness:check + bounded fix loop + adversarial review' },
    { title: 'Validate', detail: 'fresh-context validator verdict through the harness:validate cycle' }
  ];

  const meta = {
    name: `forge-run-${slug}`,
    description: `AIOSON Lane B compiled harness for feature ${slug}`,
    phases: metaPhases
  };

  const lines = [];
  lines.push(`export const meta = ${JSON.stringify(meta, null, 2)}`);
  lines.push('');
  lines.push(`// Compiled by \`aioson forge:compile\` from harness-contract.json +`);
  lines.push(`// implementation-plan-${slug}.md. Regenerate instead of hand-editing.`);
  lines.push(`// HUMAN GATE: this script never runs feature:close/publish.`);
  lines.push('');
  lines.push(`const SLUG = ${js(slug)}`);
  lines.push(`const MAX_FIX_ROUNDS = ${maxFixRounds}`);
  lines.push(`const EXEC_CRITERIA = ${JSON.stringify(execCriteria, null, 2)}`);
  lines.push(`const JUDGED_CRITERIA = ${JSON.stringify(judgedCriteria, null, 2)}`);
  lines.push('');
  lines.push(`const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    phase: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked'] },
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    blockers: { type: ['string', 'null'] }
  },
  required: ['phase', 'status', 'summary']
}`);
    lines.push(`const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    passed: { type: 'number' },
    failed: { type: 'number' },
    skipped_no_verification: { type: 'number' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          command: { type: 'string' },
          exitCode: { type: ['number', 'null'] },
          ok: { type: 'boolean' }
        },
        required: ['id', 'ok']
      }
    }
  },
  required: ['ok', 'checks']
}`);
  lines.push(`const REFUTE_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' }
  },
  required: ['refuted', 'reason']
}`);
  lines.push(`const APPLY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    ready_for_done_gate: { type: 'boolean' },
    last_error: { type: ['string', 'null'] }
  },
  required: ['verdict']
}`);
  lines.push('');
  lines.push('const waveResults = []');

  for (const wave of waves) {
    lines.push('');
    lines.push(`phase(${js(`Wave ${wave.wave}`)})`);
    lines.push(`const wave${wave.wave} = await parallel([`);
    for (const row of wave.phases) {
      lines.push(`  () => agent(${js(buildDevPrompt(slug, row))}, { label: ${js(`dev:phase-${row.phase}`)}, phase: ${js(`Wave ${wave.wave}`)}, schema: SUMMARY_SCHEMA }),`);
    }
    lines.push('])');
    lines.push(`waveResults.push(...wave${wave.wave}.filter(Boolean))`);
    lines.push(`const blocked${wave.wave} = wave${wave.wave}.filter(Boolean).filter(r => r.status === 'blocked')`);
    lines.push(`if (blocked${wave.wave}.length > 0) {`);
    lines.push(`  log('wave ${wave.wave} blocked: ' + blocked${wave.wave}.map(r => r.phase).join(', ') + ' — stopping before downstream waves')`);
    lines.push(`  return { slug: SLUG, stopped_at: 'Wave ${wave.wave}', waves: waveResults, blocked: blocked${wave.wave} }`);
    lines.push('}');
  }

  lines.push('');
  lines.push(`phase('Verify')`);
  lines.push(`const checkPrompt = 'Run exactly: aioson harness:check . --slug=' + SLUG + ' --json — and return that JSON object as your structured output, unmodified. Do not fix anything in this step.'`);
  lines.push('let checkReport = null');
  lines.push('let fixRound = 0');
  lines.push('while (true) {');
  lines.push(`  checkReport = await agent(checkPrompt, { label: 'check:run', phase: 'Verify', schema: CHECK_SCHEMA })`);
  lines.push('  const failed = (checkReport && checkReport.checks ? checkReport.checks : []).filter(c => !c.ok)');
  lines.push('  if (failed.length === 0) break');
  lines.push('  if (fixRound >= MAX_FIX_ROUNDS) {');
  lines.push(`    log('governor: error_streak_limit (' + MAX_FIX_ROUNDS + ') reached with ' + failed.length + ' criteria still failing — human review required')`);
  lines.push('    break');
  lines.push('  }');
  lines.push('  if (budget.total && budget.remaining() < 30000) {');
  lines.push(`    log('governor: token budget nearly exhausted — stopping fix loop')`);
  lines.push('    break');
  lines.push('  }');
  lines.push('  fixRound += 1');
  lines.push(`  log('fix round ' + fixRound + '/' + MAX_FIX_ROUNDS + ': ' + failed.map(c => c.id).join(', '))`);
  lines.push('  // Fixes são SEQUENCIAIS de propósito: criterios não provam disjunção de');
  lines.push('  // arquivos entre si (só as waves provam) — paralelizar aqui convida conflito.');
  lines.push('  for (const failure of failed) {');
  lines.push(`    await agent('Criterion ' + failure.id + ' of feature ' + SLUG + ' is failing. Its verification command is: ' + (failure.command || '(see contract)') + ' (exit ' + failure.exitCode + '). Read .aioson/plans/' + SLUG + '/harness-contract.json and .aioson/plans/' + SLUG + '/last-check-output.json for the failure detail, fix the UNDERLYING issue in the implementation (never weaken or delete the check/test), run the verification command locally until it passes, and report what changed.', { label: 'fix:' + failure.id, phase: 'Verify' })`);
  lines.push('  }');
  lines.push('}');

  lines.push('');
  lines.push('// Critérios binários SEM verification: revisão adversarial (3 lentes que');
  lines.push('// tentam REFUTAR; sobrevive com maioria). Filtra ruído antes do @validator.');
  lines.push('const adversarial = JUDGED_CRITERIA.length === 0 ? [] : await parallel(JUDGED_CRITERIA.map(criterion => () =>');
  lines.push(`  parallel(['correctness', 'completeness', 'regression-risk'].map(lens => () =>`);
  lines.push(`    agent('Adversarial reviewer (' + lens + ' lens) for feature ' + SLUG + '. Try to REFUTE that this criterion holds in the current working tree: "' + criterion.description + '" (assertion: ' + criterion.assertion + '). Inspect the actual code/files. Default refuted=true if uncertain.', { label: 'refute:' + criterion.id + ':' + lens, phase: 'Verify', schema: REFUTE_SCHEMA })`);
  lines.push('  )).then(votes => ({');
  lines.push('    id: criterion.id,');
  lines.push('    survives: votes.filter(Boolean).filter(v => !v.refuted).length >= 2,');
  lines.push('    reasons: votes.filter(Boolean).map(v => v.reason)');
  lines.push('  }))');
  lines.push('))');
  lines.push('const refutedCriteria = adversarial.filter(Boolean).filter(a => !a.survives)');
  lines.push('if (refutedCriteria.length > 0) {');
  lines.push(`  log('adversarial review refuted: ' + refutedCriteria.map(a => a.id).join(', ') + ' — fixing before validation')`);
  lines.push('  for (const refuted of refutedCriteria) {');
  lines.push(`    await agent('Adversarial review refuted criterion ' + refuted.id + ' of feature ' + SLUG + '. Reviewer reasons: ' + refuted.reasons.join(' | ') + '. Address the gaps in the implementation (never argue with the reviewers in prose — fix code) and report what changed.', { label: 'fix:' + refuted.id, phase: 'Verify' })`);
  lines.push('  }');
  lines.push('}');

  lines.push('');
  lines.push(`phase('Validate')`);
  lines.push(`const verdict = await agent('You are the AIOSON fresh-context @validator for feature ' + SLUG + '. Steps, in order: (1) run aioson harness:validate . --slug=' + SLUG + ' to generate the self-contained prompt; (2) read .aioson/plans/' + SLUG + '/validator-prompt.txt and follow it EXACTLY — criteria with executable verification take their verdict from the harness:check exit codes verbatim, you only judge the rest; (3) write your verdict JSON to .aioson/plans/' + SLUG + '/last-validator-output.json; (4) run aioson harness:apply-validation . --slug=' + SLUG + ' --json and return ITS JSON as your structured output.', { label: 'validator:fresh', phase: 'Validate', schema: APPLY_SCHEMA })`);
  lines.push('');
  lines.push('return {');
  lines.push('  slug: SLUG,');
  lines.push('  waves: waveResults,');
  lines.push('  fix_rounds: fixRound,');
  lines.push('  deterministic_checks: checkReport,');
  lines.push('  adversarial,');
  lines.push('  verdict,');
  lines.push(`  human_gate: 'feature:close is yours to run: aioson feature:close . --feature=' + SLUG`);
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

async function runForgeCompile({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = String(options.feature || options.slug || '').trim();

  if (!slug) {
    logger.error('--feature=<slug> is required.');
    return { ok: false, error: 'missing_feature' };
  }

  // ── Preflight 1: contrato válido com critérios ───────────────────────────
  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  if (!fs.existsSync(contractPath)) {
    logger.error(`Contract not found: ${path.relative(targetDir, contractPath)} — @sheldon RF-05 produces it for MEDIUM features.`);
    return { ok: false, error: 'contract_not_found', slug };
  }
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  } catch (err) {
    logger.error(`Invalid JSON in contract: ${err.message}`);
    return { ok: false, error: 'invalid_json', slug };
  }
  const schema = validateContract(contract);
  if (!schema.ok) {
    const first = schema.errors[0];
    logger.error(`Contract schema invalid: ${first.field} — ${first.reason}`);
    return { ok: false, error: 'contract_schema_invalid', slug, errors: schema.errors };
  }
  const resolved = resolveContract(contract);
  const binaryCriteria = resolved.criteria.filter((c) => c && c.binary === true);
  if (binaryCriteria.length === 0) {
    logger.error('Contract has no binary criteria — nothing to converge on. Lane B needs a machine-checkable definition of done.');
    return { ok: false, error: 'no_binary_criteria', slug };
  }
  const execCriteria = binaryCriteria
    .filter((c) => typeof c.verification === 'string' && c.verification.trim())
    .map((c) => ({ id: c.id, description: c.description || '', verification: c.verification }));
  const judgedCriteria = binaryCriteria
    .filter((c) => !(typeof c.verification === 'string' && c.verification.trim()))
    .map((c) => ({ id: c.id, description: c.description || '', assertion: c.assertion || '' }));
  if (execCriteria.length === 0) {
    logger.error('No criterion has an executable `verification` command — the fix loop would have no deterministic convergence signal. Author verification commands first (see .aioson/docs/sheldon/harness-contract.md §2b).');
    return { ok: false, error: 'no_executable_criteria', slug };
  }

  // ── Preflight 2: plano com coluna Wave ───────────────────────────────────
  const planPath = path.join(targetDir, '.aioson', 'context', `implementation-plan-${slug}.md`);
  if (!fs.existsSync(planPath)) {
    logger.error(`Implementation plan not found: ${path.relative(targetDir, planPath)} — @pm produces it (Gate C).`);
    return { ok: false, error: 'plan_not_found', slug };
  }
  const rows = parseExecutionWaves(fs.readFileSync(planPath, 'utf8'));
  if (!rows || rows.length === 0) {
    logger.error('Execution Sequence has no Wave column (or no parseable rows) — re-run @pm to annotate waves (pm.md Wave column rules).');
    return { ok: false, error: 'no_wave_column', slug };
  }
  const waves = groupByWave(rows);

  // ── Preflight 3: spec:analyze limpo (wave overlap promovido a erro) ──────
  const { runSpecAnalyze } = require('./spec-analyze');
  const silentLogger = { log: () => {}, error: () => {} };
  const analysis = await runSpecAnalyze({ args: [targetDir], options: { feature: slug }, logger: silentLogger });
  const blockers = [
    ...(analysis.findings || []).filter((f) => f.severity === 'error'),
    ...(analysis.findings || []).filter((f) => f.check === 'wave_file_overlap')
  ];
  if (blockers.length > 0) {
    logger.error(`spec:analyze blockers (${blockers.length}) — compilation refused:`);
    for (const finding of blockers) {
      logger.error(`  - [${finding.check}] ${finding.message}`);
    }
    return { ok: false, error: 'spec_analyze_blockers', slug, blockers };
  }

  // ── Compilação ────────────────────────────────────────────────────────────
  const maxFixRounds = Number.isInteger(resolved.governor.error_streak_limit) && resolved.governor.error_streak_limit > 0
    ? resolved.governor.error_streak_limit
    : DEFAULT_MAX_FIX_ROUNDS;

  const script = buildScript({ slug, waves, execCriteria, judgedCriteria, maxFixRounds });
  const scriptPath = path.join(planDir, 'forge-run.workflow.js');
  fs.writeFileSync(scriptPath, script, 'utf8');

  const report = {
    ok: true,
    slug,
    scriptPath: path.relative(targetDir, scriptPath),
    waves: waves.map((w) => ({ wave: w.wave, phases: w.phases.map((p) => p.phase) })),
    executable_criteria: execCriteria.length,
    judged_criteria: judgedCriteria.length,
    max_fix_rounds: maxFixRounds,
    adversarial_votes: ADVERSARIAL_VOTES
  };

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log(`Forge compile — ${slug}`);
  logger.log(`  Script: ${report.scriptPath}`);
  logger.log(`  Waves: ${waves.map((w) => `W${w.wave}[${w.phases.length}]`).join(' → ')} (${rows.length} phases)`);
  logger.log(`  Criteria: ${execCriteria.length} executable + ${judgedCriteria.length} adversarially judged`);
  logger.log(`  Governor: fix loop capped at ${maxFixRounds} rounds`);
  logger.log('');
  logger.log('Next steps:');
  logger.log('  1. Review the script and commit it with the spec (it is the execution plan as code).');
  logger.log('  2. In a Claude Code session, activate /forge-run (or ask: "run the workflow at ' + report.scriptPath + '").');
  logger.log('  3. The run ends BEFORE feature:close — closing the feature is always yours.');

  return report;
}

module.exports = { runForgeCompile, buildScript };
