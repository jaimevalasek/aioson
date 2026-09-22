'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { loadJevConfig } = require('../lib/jev-config');
const { runJevJudgment } = require('../lib/jev-judgment');
const { resolveOperandPath, resolveTargetDir } = require('../lib/project-root');

function examples() {
  return {
    raw: {
      version: 1,
      id: 'inspect-ticket',
      state: { ticket: 'Checkout becomes blank after clicking Pay.', customer_tier: 'enterprise' },
      questions: {
        is_bug: { type: 'noul', instructions: 'Is `ticket` reporting broken software behavior?' },
        urgency: { type: 'score', instructions: 'How urgent is this ticket?', criteria: ['Can wait', 'Fix soon', 'Revenue blocking'] }
      },
      decision: { type: 'raw' }
    },
    gate: {
      version: 1,
      id: 'visual-quality-gate',
      state: {
        intent: 'A restrained luxury editorial landing page for a private members club.',
        measured: { craft_precision: 78, palette_origin: 'seed', browser_surfaces: '6/6' },
        review: 'Strong hierarchy and typography; the hero image is generic and weakens product specificity.'
      },
      questions: {
        premium_fit: {
          type: 'noul',
          instructions: 'Does the observed design execution meet the premium intent without reading like a generic template?',
          criteria: { true: 'Distinctive, coherent, domain-specific premium execution.', false: 'Generic, incoherent, or visibly under-finished execution.' }
        },
        craft: {
          type: 'score',
          instructions: 'Rate the overall visual craft using `intent`, deterministic `measured` evidence, and `review`.',
          criteria: ['Broken or generic', 'Usable but ordinary', 'Coherent and polished', 'Distinctive premium execution']
        }
      },
      decision: {
        type: 'gate',
        mode: 'all',
        rules: [
          { question: 'premium_fit', metric: 'noul', op: 'gte', value: 0.75 },
          { question: 'craft', metric: 'score', op: 'gte', value: 2.25 },
          { question: 'craft', metric: 'confidence', op: 'gte', value: 0.5 }
        ],
        on_pass: 'accept',
        on_fail: 'refine'
      }
    },
    select: {
      version: 1,
      id: 'agent-route',
      state: { request: 'Create three genuinely different visual directions before implementation.' },
      questions: {
        route: {
          type: 'choice',
          instructions: 'Which bounded AIOSON route best matches `request`?',
          criteria: {
            dev: 'Implement a specified technical change.',
            ux_ui: 'Resolve one visual or interaction decision.',
            exploration: 'Produce and compare multiple visual directions.'
          }
        }
      },
      decision: { type: 'select', question: 'route', min_confidence: 0.55, min_probability: 0.55, on_uncertain: 'human_review' }
    },
    rank: {
      version: 1,
      id: 'direction-ranking',
      state: {
        brief: 'Premium editorial commerce with quiet confidence; avoid generic SaaS composition.',
        candidates: {
          a: 'Dense typographic grid, asymmetric product crop, restrained oxblood accent.',
          b: 'Centered gradient hero, rounded cards, blue accent, standard feature rows.',
          c: 'Warm photographic field, serif-led hierarchy, framed product ritual and sparse navigation.'
        }
      },
      questions: {
        candidate_a: { type: 'score', instructions: 'How well does `candidates.a` satisfy `brief`?', criteria: ['Contradicts it', 'Weak fit', 'Good fit', 'Exceptional fit'] },
        candidate_b: { type: 'score', instructions: 'How well does `candidates.b` satisfy `brief`?', criteria: ['Contradicts it', 'Weak fit', 'Good fit', 'Exceptional fit'] },
        candidate_c: { type: 'score', instructions: 'How well does `candidates.c` satisfy `brief`?', criteria: ['Contradicts it', 'Weak fit', 'Good fit', 'Exceptional fit'] }
      },
      decision: { type: 'rank', questions: ['candidate_a', 'candidate_b', 'candidate_c'], metric: 'score', direction: 'desc' }
    }
  };
}

function buildExample(kind) {
  const all = examples();
  if (!kind || kind === true || kind === 'all') return all;
  return all[String(kind).toLowerCase()] || null;
}

async function writeOutput(targetDir, operand, value) {
  if (!operand) return null;
  const file = resolveOperandPath(targetDir, String(operand));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path.relative(targetDir, file).replace(/\\/g, '/');
}

function numberOption(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function logHuman(logger, result) {
  if (!logger) return;
  if (!result.ok) {
    logger.error(`Jev judgment failed: ${result.reason || result.status || 'unknown error'}`);
    for (const error of result.errors || []) logger.error(`- ${error}`);
    return;
  }
  if (result.status === 'dry_run') {
    logger.log(`Jev judgment is valid (${result.bytes} bytes). No API request was sent.`);
    return;
  }
  logger.log(`Jev judgment: ${result.judgment_id || '(unnamed)'}`);
  logger.log(`Route/model: ${result.route} / ${result.model}`);
  logger.log(`Decision: ${result.decision.type} -> ${result.decision.action}`);
  if (Object.hasOwn(result.decision, 'passed')) logger.log(`Passed: ${result.decision.passed ? 'yes' : 'no'}`);
  if (result.decision.ranking) {
    result.decision.ranking.forEach((item, index) => logger.log(`${index + 1}. ${item.question}: ${item.value}`));
  }
}

async function runJevJudge({ args = [], options = {}, logger, fetchImpl, env = process.env } = {}) {
  const targetDir = resolveTargetDir(args);
  const fail = (status, reason) => {
    const result = { ok: false, status, reason };
    if (!options.json && logger) logger.error(`Jev judgment failed: ${reason}`);
    return result;
  };
  const example = options.example ? buildExample(options.example) : null;
  if (options.example && !example) {
    return fail('invalid_example', 'example must be raw, gate, select, rank, or all');
  }
  if (example) {
    const out = await writeOutput(targetDir, options.out, example);
    if (!options.json) {
      logger.log(JSON.stringify(example, null, 2));
      if (out) logger.log(`Saved: ${out}`);
    }
    return { ok: true, status: 'example', example: options.example, out, spec: example };
  }

  const operand = options.file || options.input;
  if (!operand) {
    return fail('invalid_input', '--file=<judgment.json> is required; use --example=all to inspect the contract');
  }
  const file = resolveOperandPath(targetDir, String(operand));
  let spec;
  try {
    spec = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    return fail('invalid_input', `cannot read judgment JSON: ${error.message}`);
  }

  const timeoutMs = numberOption(options.timeout, undefined, 1000, 120000);
  const retries = numberOption(options.retries, undefined, 0, 4);
  if (options.timeout != null && timeoutMs == null) return fail('invalid_input', '--timeout must be between 1000 and 120000 ms');
  if (options.retries != null && retries == null) return fail('invalid_input', '--retries must be between 0 and 4');

  const config = loadJevConfig(targetDir, env);
  const result = await runJevJudgment({
    spec,
    projectDir: targetDir,
    config,
    fetchImpl,
    dryRun: Boolean(options['dry-run']),
    timeoutMs,
    retries
  });
  result.file = path.relative(targetDir, file).replace(/\\/g, '/');
  if (options['require-pass']) {
    const rejectedGate = result.ok && result.decision?.type === 'gate' && !result.decision.passed;
    const rejectedSelection = result.ok && result.decision?.type === 'select' && !result.decision.accepted;
    if (rejectedGate || rejectedSelection || result.status !== 'used' || !['gate', 'select'].includes(result.decision?.type)) result.exitCode = 2;
  }
  if (options.out) result.out = path.relative(targetDir, resolveOperandPath(targetDir, String(options.out))).replace(/\\/g, '/');
  await writeOutput(targetDir, options.out, result);
  if (!options.json) logHuman(logger, result);
  return result;
}

module.exports = {
  buildExample,
  examples,
  runJevJudge
};
