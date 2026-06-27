'use strict';

const path = require('node:path');
const { runPulseUpdate } = require('./pulse-update');
const { runDossierAddFinding } = require('./dossier');
const { runGateApprove } = require('./gate-approve');
const { runAgentDone } = require('./runtime');

function resolveTargetDir(args) {
  return path.resolve(process.cwd(), args[0] || '.');
}

function normalizeAgent(value) {
  return String(value || '').trim().replace(/^@/, '');
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function makeSilentLogger() {
  return { log() {}, error() {}, warn() {} };
}

function pushStep(steps, name, result) {
  steps.push({
    name,
    ok: Boolean(result && result.ok),
    skipped: Boolean(result && result.skipped),
    reason: result && (result.reason || result.error || null)
  });
}

function formatAutoAdvance(autoAdvance) {
  if (!autoAdvance) return null;
  if (autoAdvance.advanced) {
    const nextStage = autoAdvance.result && (autoAdvance.result.next || autoAdvance.result.nextStage);
    return `workflow auto-advanced${nextStage ? ` -> ${nextStage}` : ''}`;
  }
  return `workflow skip: ${autoAdvance.skipped || 'not_advanced'}`;
}

async function runAgentEpilogue({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const agent = normalizeAgent(options.agent);
  const summary = String(options.summary || options.message || '').trim();
  const feature = options.feature ? String(options.feature).trim() : null;
  const action = options.action ? String(options.action).trim() : summary;
  const next = options.next ? String(options.next).trim() : null;
  const gate = options.gate ? String(options.gate).trim() : null;
  const approveGate = options['approve-gate'] || options.approveGate
    ? String(options['approve-gate'] || options.approveGate).trim().toUpperCase()
    : null;
  const verdict = options.verdict ? String(options.verdict).trim().toUpperCase() : null;
  const artifacts = normalizeList(options.artifacts);
  const strict = Boolean(options.strict);
  const steps = [];
  const errors = [];
  const silentLogger = makeSilentLogger();

  if (!agent) {
    const failure = { ok: false, reason: 'missing_agent' };
    if (options.json) return failure;
    logger.error('--agent=<agent> is required.');
    return failure;
  }

  if (!summary) {
    const failure = { ok: false, reason: 'missing_summary' };
    if (options.json) return failure;
    logger.error('--summary="<summary>" is required.');
    return failure;
  }

  if (approveGate) {
    const gateResult = await runGateApprove({
      args: [targetDir],
      options: {
        feature,
        gate: approveGate,
        agent,
        json: true
      },
      logger: silentLogger
    });
    pushStep(steps, 'gate:approve', gateResult);
    if (!gateResult.ok) {
      errors.push({ step: 'gate:approve', reason: gateResult.reason || 'gate_failed', result: gateResult });
      if (strict) {
        const failure = { ok: false, reason: 'gate_approve_failed', steps, errors };
        if (options.json) return failure;
        logger.error(`agent:epilogue blocked: gate ${approveGate} approval failed.`);
        return failure;
      }
    }
  }

  if (!options['no-pulse'] && !options.noPulse) {
    const pulseResult = await runPulseUpdate({
      args: [targetDir],
      options: {
        agent,
        ...(feature ? { feature } : {}),
        ...(gate || approveGate ? { gate: gate || `Gate ${approveGate}: approved` } : {}),
        ...(action ? { action } : {}),
        ...(next ? { next } : {}),
        ...(verdict ? { verdict } : {}),
        json: true
      },
      logger: silentLogger
    });
    pushStep(steps, 'pulse:update', pulseResult);
    if (!pulseResult.ok) {
      errors.push({ step: 'pulse:update', reason: pulseResult.reason || 'pulse_failed', result: pulseResult });
    }
  } else {
    pushStep(steps, 'pulse:update', { ok: true, skipped: true, reason: 'disabled' });
  }

  if (feature && !options['no-dossier'] && !options.noDossier) {
    const dossierResult = await runDossierAddFinding({
      args: [targetDir],
      options: {
        slug: feature,
        agent,
        section: options.section ? String(options.section) : 'Agent Trail',
        content: options.content ? String(options.content) : summary,
        json: true
      },
      logger: silentLogger
    });
    pushStep(steps, 'dossier:add-finding', dossierResult);
    if (!dossierResult.ok) {
      errors.push({ step: 'dossier:add-finding', reason: dossierResult.reason || 'dossier_failed', result: dossierResult });
    }
  } else {
    pushStep(steps, 'dossier:add-finding', { ok: true, skipped: true, reason: feature ? 'disabled' : 'missing_feature' });
  }

  const doneResult = await runAgentDone({
    args: [targetDir],
    options: {
      agent,
      summary,
      ...(feature ? { feature } : {}),
      ...(verdict ? { verdict } : {}),
      ...(artifacts.length > 0 ? { artifacts: artifacts.join(',') } : {}),
      json: true
    },
    logger: silentLogger,
    t
  });
  pushStep(steps, 'agent:done', doneResult);
  if (!doneResult.ok) {
    errors.push({ step: 'agent:done', reason: doneResult.reason || doneResult.error || 'agent_done_failed', result: doneResult });
  }

  // Advisory contract-integrity signal for untracked (prompt-only) dev/qa
  // completions. The tracked `workflow:next --complete` / `feature:close` paths
  // enforce this as a HARD gate; a direct Claude Code session never calls them,
  // so we surface the same signal here without blocking the best-effort
  // epilogue (never added to `errors`, so it cannot flip `ok`).
  if ((agent === 'dev' || agent === 'qa') && feature) {
    let advisory = null;
    try {
      const { evaluateContractIntegrityGate } = require('../harness/contract-integrity-gate');
      advisory = await evaluateContractIntegrityGate(targetDir, feature, { runChecks: false });
    } catch {
      advisory = null;
    }
    if (advisory && advisory.ok === false) {
      pushStep(steps, 'contract:integrity', {
        ok: false,
        reason: `${advisory.errors.map((e) => e.code).join(', ')} — advisory only; the tracked workflow blocks on this. Run: aioson harness:check . --slug=${feature} --json`
      });
    } else if (advisory) {
      pushStep(steps, 'contract:integrity', { ok: true });
    }
  }

  const ok = doneResult.ok && (strict ? errors.length === 0 : !errors.some((error) => error.step === 'agent:done'));
  const result = {
    ok,
    targetDir,
    agent: `@${agent}`,
    feature,
    summary,
    steps,
    errors,
    agent_done: doneResult
  };

  if (options.json) return result;

  logger.log(`agent:epilogue — @${agent} (${ok ? 'ok' : 'issues'})`);
  for (const step of steps) {
    const marker = step.skipped ? 'skip' : step.ok ? 'ok' : 'fail';
    logger.log(`  ${marker} ${step.name}${step.reason ? ` (${step.reason})` : ''}`);
  }
  const autoAdvanceMessage = formatAutoAdvance(doneResult.auto_advance);
  if (autoAdvanceMessage) logger.log(`  ${autoAdvanceMessage}`);
  return result;
}

module.exports = {
  runAgentEpilogue
};
