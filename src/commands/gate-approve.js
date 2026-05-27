'use strict';

/**
 * aioson gate:approve — approve a phase gate for a feature.
 *
 * Validates with gate:check before writing. If gate:check fails, blocks approval.
 * Writes flat frontmatter fields to spec-{slug}.md:
 *   gate_requirements, gate_design, gate_plan, gate_execution
 *
 * Usage:
 *   aioson gate:approve . --feature=checkout --gate=C
 *   aioson gate:approve . --feature=checkout --gate=C --json
 *
 * If gate:check fails, shows exact manual fallback: file, field, and value to set.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const {
  contextDir,
  readFileSafe,
  fileExists,
  fileStat,
  parseFrontmatter,
  parseGatesFromSpec,
  GATE_NAMES,
  GATE_ALIASES
} = require('../preflight-engine');
const { ensureDir } = require('../utils');
const { runGateCheck } = require('./gate-check');

const CHECKPOINTS_DIR = '.aioson/runtime/checkpoints';
const CHECKPOINT_MAX_BYTES = 5120;

const BAR = '━'.repeat(45);

const GATE_FLAT_FIELDS = {
  A: 'gate_requirements',
  B: 'gate_design',
  C: 'gate_plan',
  D: 'gate_execution'
};

const GATE_NEXT_AGENTS = {
  A: { agent: '@architect', action: '/architect', why: 'Gate A (requirements) approved — architecture can proceed' },
  B: { agent: '@pm', action: '/pm', why: 'Gate B (design) approved — implementation plan can be written' },
  C: { agent: '@orchestrator or @dev', action: '/orchestrator (MEDIUM) or /dev (MICRO/SMALL)', why: 'Gate C (plan) approved — implementation can proceed' },
  D: { agent: 'feature complete', action: 'mark feature done in features.md', why: 'Gate D (execution) approved — feature is complete' }
};

/**
 * Update or insert a flat frontmatter field in a markdown file.
 * Preserves all other frontmatter fields. Uses flat key: value format.
 */
function updateFrontmatterField(content, field, value) {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) {
    // No frontmatter — prepend it
    return `---\n${field}: ${value}\n---\n\n${content}`;
  }

  const prefix = fmMatch[1];
  const fmBody = fmMatch[2];
  const suffix = fmMatch[3];
  const rest = content.slice(fmMatch[0].length);

  const lines = fmBody.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return line;
    const key = line.slice(0, colonIdx).trim();
    if (key === field) {
      found = true;
      return `${field}: ${value}`;
    }
    return line;
  });

  if (!found) updated.push(`${field}: ${value}`);

  return `${prefix}${updated.join('\n')}${suffix}${rest}`;
}

async function runGateApprove({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  let gateLetter = options.gate ? String(options.gate).toUpperCase() : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
    return { ok: false };
  }

  // SF-AO-01: reject slugs with path traversal characters
  if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    if (options.json) return { ok: false, reason: 'invalid_feature_slug' };
    logger.log('--feature slug must not contain path separators (/ \\) or .. segments.');
    return { ok: false };
  }

  if (!gateLetter) {
    if (options.json) return { ok: false, reason: 'missing_gate' };
    logger.log('--gate=<A|B|C|D> is required.');
    return { ok: false };
  }

  // Resolve aliases
  if (GATE_ALIASES[gateLetter.toLowerCase()]) {
    gateLetter = GATE_ALIASES[gateLetter.toLowerCase()];
  }

  if (!GATE_NAMES[gateLetter]) {
    if (options.json) return { ok: false, reason: 'invalid_gate', gate: gateLetter };
    logger.log(`Invalid gate: ${gateLetter}. Use A, B, C, or D.`);
    return { ok: false };
  }

  // Step 1: run gate:check first (AC-SDLC-06 — gate:approve fails if gate:check fails)
  const silentLogger = { log: () => {} };
  const check = await runGateCheck({
    args: [targetDir],
    options: { feature: slug, gate: gateLetter, json: true },
    logger: silentLogger
  });

  const specFile = path.join(contextDir(targetDir), `spec-${slug}.md`);
  const specExists = await fileExists(specFile);
  const specFieldName = GATE_FLAT_FIELDS[gateLetter];
  const gateName = GATE_NAMES[gateLetter];

  if (!check.ok) {
    // Gate check failed — block approval and show manual fallback (AC-SDLC-08)
    const result = {
      ok: false,
      blocked: true,
      gate: gateLetter,
      gate_name: gateName,
      feature: slug,
      reason: 'gate_check_failed',
      missing: check.missing || [],
      manual_fallback: specExists
        ? `To manually approve when prerequisites are met:\n  File: .aioson/context/spec-${slug}.md\n  Field: ${specFieldName}\n  Value: approved`
        : `spec-${slug}.md does not exist. Create it with ${specFieldName}: approved in frontmatter after prerequisites are satisfied.`
    };

    if (options.json) return result;

    logger.log('');
    logger.log(`Gate ${gateLetter} (${gateName}) — ${slug}`);
    logger.log(BAR);
    logger.log(`Result: ✗ BLOCKED — gate:check did not pass`);
    logger.log('');
    logger.log('Missing prerequisites:');
    for (const m of check.missing || []) logger.log(`  ✗ ${m}`);
    logger.log('');
    logger.log('Manual fallback (use only after all prerequisites are satisfied):');
    logger.log(`  File:  .aioson/context/spec-${slug}.md`);
    logger.log(`  Field: ${specFieldName}`);
    logger.log(`  Value: approved`);
    logger.log('');
    logger.log('Tip: re-run gate:check after satisfying prerequisites, then gate:approve again.');
    logger.log('');
    return result;
  }

  // Step 2: write flat frontmatter field (AC-SDLC-07 — flat format, not nested phase_gates)
  let content = specExists ? await readFileSafe(specFile) : null;

  if (!content) {
    // Create minimal spec with gate field
    content = `---\nfeature: ${slug}\n${specFieldName}: approved\n---\n\n# Spec — ${slug}\n\nCreated by gate:approve.\n`;
  } else {
    content = updateFrontmatterField(content, specFieldName, 'approved');
  }

  await fs.writeFile(specFile, content, 'utf8');

  // M1 checkpoint-at-gate: best-effort checkpoint write (BR-AO-01)
  let checkpointWritten = false;
  try {
    const checkpointDir = path.join(targetDir, CHECKPOINTS_DIR);
    await ensureDir(checkpointDir);

    const artifactEvidence = (check.evidence || []).filter((e) => e.type === 'artifact' && e.ok);
    const snapshot = [];
    for (const ev of artifactEvidence) {
      const filePath = path.join(contextDir(targetDir), ev.file);
      const stat = await fileStat(filePath);
      if (stat) {
        snapshot.push({ file: ev.file, mtime: stat.mtime.toISOString() });
      }
    }

    const checkpoint = {
      gate: gateLetter,
      slug,
      agent: options.agent ? String(options.agent) : 'unknown',
      timestamp: new Date().toISOString(),
      prerequisites_snapshot: snapshot,
      gate_check_result: check,
      decision_log: []
    };

    // BR-AO-03: size cap — truncate decision_log if > 5KB
    let payload = JSON.stringify(checkpoint, null, 2);
    if (Buffer.byteLength(payload, 'utf8') > CHECKPOINT_MAX_BYTES) {
      checkpoint.decision_log = checkpoint.decision_log.slice(-3);
      checkpoint.decision_log.unshift('[truncated]');
      payload = JSON.stringify(checkpoint, null, 2);
    }

    const checkpointFile = path.join(checkpointDir, `gate-${gateLetter}-${slug}.json`);
    await fs.writeFile(checkpointFile, payload + '\n', 'utf8');
    checkpointWritten = true;
  } catch (err) {
    // EC-AO-01: checkpoint failure never blocks gate:approve
    process.stderr.write(`[gate:approve] checkpoint write failed: ${err.message}\n`);
  }

  const nextInfo = GATE_NEXT_AGENTS[gateLetter];
  const result = {
    ok: true,
    gate: gateLetter,
    gate_name: gateName,
    feature: slug,
    field_written: specFieldName,
    spec_file: `.aioson/context/spec-${slug}.md`,
    checkpoint_written: checkpointWritten,
    next_agent: nextInfo.agent,
    next_action: nextInfo.action,
    why: nextInfo.why
  };

  if (options.json) return result;

  logger.log('');
  logger.log(`Gate ${gateLetter} (${gateName}) — ${slug}`);
  logger.log(BAR);
  logger.log(`Result: ✓ APPROVED`);
  logger.log('');
  logger.log(`Written: ${specFieldName}: approved → .aioson/context/spec-${slug}.md`);
  logger.log('');
  logger.log(`Next agent: ${nextInfo.agent}`);
  logger.log(`Why: ${nextInfo.why}`);
  logger.log(`Action: ${nextInfo.action}`);
  logger.log('');

  return result;
}

module.exports = { runGateApprove, CHECKPOINTS_DIR };
