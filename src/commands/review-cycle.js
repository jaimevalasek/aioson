'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ensureDir, exists } = require('../utils');
const { loadManifest } = require('../agent-execution/manifest');
const {
  SPECIALIST_AGENTS,
  inspectCorrectionPacket,
  captureCorrectionBaseline,
  verifyCorrectionChanges
} = require('../lib/specialist-correction');

const DEFAULT_MAX_CYCLES = 1;
const EXECUTION_STATE_RELATIVE_PATH = '.aioson/context/workflow-execute.json';

function resolveTargetDir(args) {
  return path.resolve(process.cwd(), args[0] || '.');
}

function normalizeAgent(value, fallback) {
  const normalized = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function stateFileName(source, target) {
  if (source === 'qa' && target === 'dev') return 'qa-dev-cycle.json';
  return `review-cycle-${source}-${target}.json`;
}

function resolveStatePath(targetDir, source, target) {
  return path.join(targetDir, '.aioson', 'runtime', stateFileName(source, target));
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseMax(value, fallback = DEFAULT_MAX_CYCLES) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(parsed, 10));
}

function parseCycleLimit(value, fallback = DEFAULT_MAX_CYCLES) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 10);
}

async function readAgentExecutionManifest(targetDir, feature) {
  if (!feature) return null;
  const loaded = await loadManifest(targetDir, feature);
  return loaded.exists && loaded.ok ? loaded.manifest : null;
}

async function readAgenticPolicy(targetDir) {
  const payload = await readJsonIfExists(path.join(targetDir, EXECUTION_STATE_RELATIVE_PATH));
  return payload && payload.agentic_policy && payload.agentic_policy.enabled
    ? payload.agentic_policy
    : null;
}

async function resolveMaxCycles(targetDir, source, options = {}) {
  const explicit = options['max-cycles'] || options.maxCycles;
  if (explicit) return parseMax(explicit);

  const feature = options.feature ? String(options.feature).trim() : null;
  const executionManifest = await readAgentExecutionManifest(targetDir, feature);
  if (executionManifest && executionManifest.cycle_limits) {
    const key = source === 'qa' ? 'dev_qa' : source;
    if (Object.hasOwn(executionManifest.cycle_limits, key)) {
      return parseCycleLimit(executionManifest.cycle_limits[key], DEFAULT_MAX_CYCLES);
    }
  }

  // Compatibility fallback for features created before agent-execution manifests
  // became the single editable execution/cycle authority.
  const policy = await readAgenticPolicy(targetDir);
  const review = policy && policy.review_cycle ? policy.review_cycle : null;
  if (!review) return DEFAULT_MAX_CYCLES;

  if (source === 'qa') return parseMax(review.max_dev_qa_cycles, DEFAULT_MAX_CYCLES);
  if (source === 'tester') return parseMax(review.max_tester_correction_cycles, DEFAULT_MAX_CYCLES);
  if (source === 'pentester') return parseMax(review.max_pentester_correction_cycles, DEFAULT_MAX_CYCLES);
  return DEFAULT_MAX_CYCLES;
}

function resolveSafeProjectPath(targetDir, filePath) {
  if (!filePath) return null;
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(targetDir, filePath);
  const relative = path.relative(targetDir, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

async function updatePlanStatus(targetDir, planPath, status) {
  const absolute = resolveSafeProjectPath(targetDir, planPath);
  if (!absolute || !(await exists(absolute))) {
    return { ok: false, reason: 'plan_not_found' };
  }

  const relativePath = path.relative(targetDir, absolute).replace(/\\/g, '/');
  const extension = path.extname(absolute).toLowerCase();
  if (extension && extension !== '.md' && extension !== '.markdown') {
    return {
      ok: true,
      skipped: true,
      reason: 'non_markdown_plan',
      path: relativePath,
      status
    };
  }

  const raw = await fs.readFile(absolute, 'utf8');
  let next;
  if (/^---\r?\n/.test(raw)) {
    const endMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (endMatch) {
      const frontmatter = endMatch[1];
      const rest = raw.slice(endMatch[0].length);
      const lines = frontmatter.split(/\r?\n/);
      let found = false;
      const updated = lines.map((line) => {
        if (/^status\s*:/i.test(line)) {
          found = true;
          return `status: ${status}`;
        }
        return line;
      });
      if (!found) updated.push(`status: ${status}`);
      next = `---\n${updated.join('\n')}\n---${rest}`;
    }
  }

  if (!next) {
    next = `---\nstatus: ${status}\n---\n\n${raw}`;
  }

  await fs.writeFile(absolute, next, 'utf8');
  return {
    ok: true,
    path: relativePath,
    status
  };
}

function buildNextTask({ source, planPath }) {
  if (source === 'qa') return `apply mandatory corrections from ${planPath}`;
  if (source === 'tester') return `apply test-engineering corrections from ${planPath}`;
  if (source === 'pentester') return `fix security findings from ${planPath}`;
  return `apply review corrections from ${planPath}`;
}

async function readStatus(targetDir, source, target, options = {}) {
  const statePath = resolveStatePath(targetDir, source, target);
  const state = await readJsonIfExists(statePath);
  const maxCycles = await resolveMaxCycles(targetDir, source, options);
  return {
    ok: true,
    source,
    target,
    path: path.relative(targetDir, statePath).replace(/\\/g, '/'),
    exists: Boolean(state),
    max_cycles: maxCycles,
    remaining_cycles: Math.max(0, maxCycles - Number(state?.cycle || 0)),
    state
  };
}

async function runAdvance(targetDir, source, target, options = {}) {
  const feature = options.feature ? String(options.feature).trim() : null;
  const planPath = options.plan ? String(options.plan).trim() : null;
  const criticalSecurity = Boolean(options['critical-security'] || options.criticalSecurity);
  const maxCycles = await resolveMaxCycles(targetDir, source, options);
  const statePath = resolveStatePath(targetDir, source, target);

  if (!feature) return { ok: false, reason: 'missing_feature' };
  if (!planPath) return { ok: false, reason: 'missing_plan' };

  const executionManifest = await readAgentExecutionManifest(targetDir, feature);
  const specialistSelfCorrection = source === target && SPECIALIST_AGENTS.has(source);
  const specialistTarget = SPECIALIST_AGENTS.has(target);
  const targetEnabled = executionManifest?.agents?.[target]?.enabled === true;
  const manualAuthorized = options.manual === true || options['manual-authorization'] === true;
  // Automatic specialist work always requires the developer-owned manifest.
  // A direct invocation is a one-pass override only when the caller states it
  // explicitly; it never mutates or permanently enables the manifest.
  if (
    specialistTarget
    && !targetEnabled
    && !(specialistSelfCorrection && manualAuthorized)
  ) {
    return {
      ok: true,
      action: 'stop_agent_disabled',
      reason: 'agent_disabled_in_execution_manifest',
      feature,
      source,
      target,
      next_agent: null,
      plan: planPath
    };
  }

  if (criticalSecurity) {
    return {
      ok: true,
      action: 'human_gate',
      reason: 'critical_security',
      feature,
      source,
      target,
      max_cycles: maxCycles,
      next_agent: null,
      plan: planPath
    };
  }

  const existing = await readJsonIfExists(statePath);
  const sameFeature = existing && existing.slug === feature;
  const currentCycle = sameFeature ? Number(existing.cycle || 0) : 0;

  if (currentCycle >= maxCycles) {
    try { await fs.unlink(statePath); } catch { /* absent is fine */ }
    return {
      ok: true,
      action: 'stop_cycle_limit',
      reason: 'cycle_limit_reached',
      feature,
      source,
      target,
      cycle: currentCycle,
      max_cycles: maxCycles,
      next_agent: null,
      plan: planPath
    };
  }

  let correctionScope = null;
  if (specialistSelfCorrection) {
    const packet = await inspectCorrectionPacket(targetDir, planPath, source);
    if (!packet.ok) {
      return {
        ok: true,
        action: 'stop_invalid_correction_scope',
        reason: packet.reason,
        feature,
        source,
        target,
        next_agent: 'dev',
        plan: planPath,
        scope: packet
      };
    }
    const captured = await captureCorrectionBaseline(targetDir);
    if (!captured.ok) {
      return {
        ok: true,
        action: 'stop_scope_guard_unavailable',
        reason: captured.reason,
        feature,
        source,
        target,
        next_agent: 'dev',
        plan: planPath
      };
    }
    correctionScope = {
      source,
      packet_path: packet.packet_path,
      packet_digest: packet.packet_digest,
      allowed_fix_paths: packet.allowed_fix_paths,
      total_paths: packet.total_paths,
      behavior_paths: packet.behavior_paths,
      manual_authorized: manualAuthorized,
      baseline: captured.baseline
    };
  }

  const now = new Date().toISOString();
  const nextCycle = currentCycle + 1;
  const state = {
    slug: feature,
    source,
    target,
    cycle: nextCycle,
    max_cycles: maxCycles,
    status: 'open',
    started_at: sameFeature && existing.started_at ? existing.started_at : now,
    updated_at: now,
    last_plan: planPath,
    last_summary: options.summary ? String(options.summary).trim() : null,
    ...(correctionScope ? { correction_scope: correctionScope } : {})
  };

  await writeJson(statePath, state);

  return {
    ok: true,
    action: source === target ? 'correct_locally' : `invoke_${target}`,
    feature,
    source,
    target,
    next_agent: target,
    cycle: nextCycle,
    max_cycles: maxCycles,
    remaining_cycles: Math.max(0, maxCycles - nextCycle),
    plan: planPath,
    ...(correctionScope ? {
      allowed_fix_paths: correctionScope.allowed_fix_paths,
      correction_packet_digest: correctionScope.packet_digest,
      manual_authorized: correctionScope.manual_authorized
    } : {}),
    task: source === target
      ? `${buildNextTask({ source, planPath })} as a bounded ${source} self-correction, then return to @qa for final verification`
      : buildNextTask({ source, planPath }),
    state_path: path.relative(targetDir, statePath).replace(/\\/g, '/'),
    state
  };
}

async function runResolve(targetDir, source, target, options = {}) {
  const feature = options.feature ? String(options.feature).trim() : null;
  const planPath = options.plan ? String(options.plan).trim() : null;
  const statePath = resolveStatePath(targetDir, source, target);
  const existing = await readJsonIfExists(statePath);

  if (!feature) return { ok: false, reason: 'missing_feature' };
  if (!existing || existing.slug !== feature) {
    return { ok: true, action: 'no_active_cycle', feature, source, target, next_agent: 'qa' };
  }

  let scopeVerification = null;
  if (source === target && SPECIALIST_AGENTS.has(source)) {
    scopeVerification = await verifyCorrectionChanges(
      targetDir,
      existing.correction_scope,
      path.relative(targetDir, statePath).replace(/\\/g, '/')
    );
    if (!scopeVerification.ok) {
      const now = new Date().toISOString();
      const violatedState = {
        ...existing,
        status: 'scope_violation',
        updated_at: now,
        scope_verification: scopeVerification
      };
      await writeJson(statePath, violatedState);
      return {
        ok: true,
        action: 'stop_scope_violation',
        reason: scopeVerification.reason,
        feature,
        source,
        target,
        next_agent: 'dev',
        plan: planPath || existing.last_plan || null,
        scope_verification: scopeVerification,
        state_path: path.relative(targetDir, statePath).replace(/\\/g, '/'),
        state: violatedState
      };
    }
  }

  let planUpdate = null;
  if (planPath) {
    planUpdate = source === target
      ? {
          ok: true,
          skipped: true,
          reason: 'awaiting_independent_qa',
          path: planPath,
          status: 'open'
        }
      : await updatePlanStatus(targetDir, planPath, 'resolved');
  }

  const now = new Date().toISOString();
  const state = {
    ...existing,
    status: 'resolved',
    resolved_at: now,
    updated_at: now,
    resolved_plan: planPath || existing.last_plan || null,
    ...(scopeVerification ? { scope_verification: scopeVerification } : {})
  };
  await writeJson(statePath, state);

  return {
    ok: true,
    action: 'invoke_qa',
    feature,
    source,
    target,
    next_agent: 'qa',
    state_path: path.relative(targetDir, statePath).replace(/\\/g, '/'),
    plan_update: planUpdate,
    ...(scopeVerification ? { scope_verification: scopeVerification } : {}),
    state
  };
}

async function runReset(targetDir, source, target, options = {}) {
  const statePath = resolveStatePath(targetDir, source, target);
  const existed = await exists(statePath);
  if (existed) {
    await fs.unlink(statePath);
  }
  return {
    ok: true,
    action: 'reset',
    source,
    target,
    feature: options.feature ? String(options.feature).trim() : null,
    removed: existed,
    path: path.relative(targetDir, statePath).replace(/\\/g, '/')
  };
}

async function runReviewCycle({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const action = normalizeAgent(options.sub || options.action || 'status', 'status');
  const source = normalizeAgent(options.source || options.agent, 'qa');
  const target = normalizeAgent(options.to || options.target, 'dev');
  let result;

  const feature = options.feature ? String(options.feature).trim() : null;
  if (feature) {
    const executionManifest = await loadManifest(targetDir, feature);
    if (executionManifest.exists && !executionManifest.ok) {
      result = {
        ok: false,
        reason: 'agent_execution_manifest_invalid',
        feature,
        errors: executionManifest.errors || []
      };
      if (options.json) return result;
      logger.error(`review-cycle:${action} failed: ${result.reason}`);
      return result;
    }
  }

  if (action === 'status') {
    result = await readStatus(targetDir, source, target, options);
  } else if (action === 'advance' || action === 'start') {
    result = await runAdvance(targetDir, source, target, options);
  } else if (action === 'resolve') {
    result = await runResolve(targetDir, source, target, options);
  } else if (action === 'reset') {
    result = await runReset(targetDir, source, target, options);
  } else {
    result = { ok: false, reason: 'unknown_review_cycle_action', action };
  }

  if (options.json) return result;

  if (!result.ok) {
    logger.error(`review-cycle:${action} failed: ${result.reason || 'unknown'}`);
    return result;
  }

  logger.log(`review-cycle:${action} — ${result.action || 'status'}`);
  if (result.feature) logger.log(`  feature: ${result.feature}`);
  logger.log(`  route: @${source} -> @${target}`);
  if (result.cycle !== undefined) logger.log(`  cycle: ${result.cycle}/${result.max_cycles}`);
  if (result.next_agent) logger.log(`  next: @${result.next_agent}`);
  if (result.task) logger.log(`  task: ${result.task}`);
  return result;
}

module.exports = {
  DEFAULT_MAX_CYCLES,
  resolveStatePath,
  runReviewCycle
};
