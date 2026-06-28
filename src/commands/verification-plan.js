'use strict';

// `aioson verification:plan` — deterministic bridge between verification.json and
// the agents. Given a slug + trigger + run context, it resolves WHICH verification
// sub-agents should run, on WHICH host/model, and the phase-loop settings — so
// @dev (per-phase) and the post-dev cycle (end-of-feature) follow a computed plan
// instead of re-interpreting the config in prose. Read-only; never mutates state.

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  readVerificationConfig,
  resolveHost,
  getAgentDispatch,
  shouldRunForTrigger,
  resolveAgentReportPath,
  getCrossCheck,
  getBudget,
  getPhaseLoop,
  VERIFICATION_AGENTS,
  TRIGGERS
} = require('../verification-policy');

const BAR = '─'.repeat(60);
const CLASSIFICATIONS = ['MICRO', 'SMALL', 'MEDIUM'];

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Best-effort classification: prd-{slug}.md frontmatter wins, then project.context.md.
async function detectClassification(targetDir, slug) {
  const dir = path.join(targetDir, '.aioson', 'context');
  const candidates = [];
  if (slug) candidates.push(path.join(dir, `prd-${slug}.md`));
  candidates.push(path.join(dir, 'project.context.md'));
  for (const file of candidates) {
    const text = await readFileSafe(file);
    if (!text) continue;
    const m = text.match(/^\s*classification:\s*["']?([A-Za-z]+)["']?\s*$/m);
    if (m && CLASSIFICATIONS.includes(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}

async function runVerificationPlan({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = (options.feature || options.slug || '').toString().trim() || null;

  const triggerRaw = (options.trigger || 'per-phase').toString().trim().toLowerCase();
  const trigger = TRIGGERS.includes(triggerRaw) ? triggerRaw : 'per-phase';

  const config = await readVerificationConfig(targetDir);
  const host = resolveHost(config, options.host);

  let classification = (options.classification || '').toString().trim().toUpperCase();
  if (!CLASSIFICATIONS.includes(classification)) {
    classification = (await detectClassification(targetDir, slug)) || 'SMALL';
  }
  const sensitiveSurface = Boolean(options.sensitive);

  const context = { trigger, classification, sensitiveSurface };
  const agents = [];
  for (const agentId of VERIFICATION_AGENTS) {
    const dispatch = getAgentDispatch(config, agentId, host);
    const entry = {
      agent: agentId,
      run: shouldRunForTrigger(config, agentId, context),
      mode: dispatch ? dispatch.mode : 'native',
      model: dispatch ? dispatch.model : 'configured-default',
      report: resolveAgentReportPath(config, agentId, slug || '{slug}')
    };
    if (agentId === 'validator') {
      const cc = getCrossCheck(config, agentId);
      if (cc) entry.cross_check = cc;
    }
    agents.push(entry);
  }

  const result = {
    ok: true,
    feature_slug: slug,
    host,
    trigger,
    classification,
    sensitive_surface: sensitiveSurface,
    agents,
    phase_loop: getPhaseLoop(config),
    budget: getBudget(config)
  };

  if (options.json) return result;

  logger.log('');
  logger.log(`Verification plan${slug ? ` — ${slug}` : ''}`);
  logger.log(BAR);
  logger.log(`Host: ${host}   Trigger: ${trigger}   Class: ${classification}${sensitiveSurface ? '   [sensitive]' : ''}`);
  logger.log(BAR);
  for (const a of agents) {
    const mark = a.run ? 'RUN ' : 'skip';
    const cc = a.cross_check && a.cross_check.enabled ? `  + cross_check(${a.cross_check.tool}/${a.cross_check.model})` : '';
    logger.log(`  [${mark}] ${a.agent.padEnd(10)} ${a.mode}/${a.model}${a.run ? `  → ${a.report}` : ''}${cc}`);
  }
  logger.log(BAR);
  const pl = result.phase_loop;
  logger.log(`Phase loop: auto_continue=${pl.auto_continue}  compact_between_phases=${pl.compact_between_phases}  max_fix_retries=${pl.max_fix_retries_per_phase}`);
  logger.log('');

  return result;
}

module.exports = { runVerificationPlan };
