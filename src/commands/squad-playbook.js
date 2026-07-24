'use strict';

// squad:playbook — evidence-gated "what works" memory. Eval failures create
// candidates; only a later held-out PASS promotes them into generation guidance.
//
//   capture --rule="<generation rule>" --lesson="<what works instead>" [--from=<slug>/<claim>]
//   promote --id=<candidate-id> --squad=<slug>
//   list [--include-candidates] [--json]
//
// File-backed (no SQLite schema change): .aioson/squads/.playbook/generation-playbook.json

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isContainedPath } = require('../squad/manifest-validator');
const { validateEvalReport } = require('../squad/eval-contract');
const { isValidSlug } = require('../dossier/schema');

function playbookPath(projectDir) {
  return path.join(projectDir, '.aioson', 'squads', '.playbook', 'generation-playbook.json');
}

async function loadPlaybook(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(data.entries) ? data : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

async function savePlaybook(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, file);
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function entryId(key) {
  return `rule-${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16)}`;
}

// Playbook entries are agent-loaded later, so neutralize injection framing on capture:
// collapse to one bounded line (no fake multi-line <system> blocks) and strip role/control
// tags. SF-squad-self-improving-02 (persistent indirect prompt injection).
function sanitizeText(s, max = 280) {
  return String(s || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/<\|[^|]*\|>/g, ' ')                          // <|im_start|> / <|im_end|>
    .replace(/<\/?(system|assistant|user|tool)\b[^>]*>/gi, ' ') // fake role tags
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function runSquadPlaybook({ args = [], options = {}, logger = console } = {}) {
  const sub = args[0] || 'list';
  const projectDir = path.resolve(process.cwd(), options.dir || options.path || '.');
  const file = playbookPath(projectDir);

  if (sub === 'capture') {
    const rule = sanitizeText(options.rule);
    const lesson = sanitizeText(options.lesson);
    if (!rule || !lesson) {
      logger.error('Usage: aioson squad:playbook capture --rule="<generation rule>" --lesson="<what works>" [--from=<slug>/<claim>]');
      return { ok: false, error: 'missing_fields' };
    }
    const data = await loadPlaybook(file);
    const key = `${norm(rule)} => ${norm(lesson)}`;
    let entry = data.entries.find((e) => e._key === key);
    if (entry) {
      entry.count += 1;
      if (options.from) {
        const observation = sanitizeText(options.from, 160);
        entry.observations = Array.isArray(entry.observations) ? entry.observations : [];
        if (observation && observation !== entry.from && !entry.observations.includes(observation)) {
          entry.observations.push(observation);
        }
        entry.lastSeenFrom = observation || entry.lastSeenFrom || null;
      }
    } else {
      const capturedAt = new Date().toISOString();
      entry = {
        id: entryId(key),
        _key: key,
        rule,
        lesson,
        from: sanitizeText(options.from, 160) || null,
        observations: [],
        count: 1,
        status: 'candidate',
        capturedAt
      };
      data.entries.push(entry);
    }
    await savePlaybook(file, data);
    if (options.json) return { ok: true, captured: entry, total: data.entries.length };
    logger.log(`Playbook ${entry.count > 1 ? 'reinforced' : 'captured'} (x${entry.count}): ${rule} -> ${lesson}`);
    return { ok: true, captured: entry, total: data.entries.length };
  }

  if (sub === 'list') {
    const data = await loadPlaybook(file);
    const includeCandidates = options['include-candidates'] === true
      || options['include-candidates'] === 'true';
    const active = data.entries
      .filter((e) => {
        const status = e.status || 'active';
        return ['active', 'promoted'].includes(status) || (includeCandidates && status === 'candidate');
      })
      .sort((a, b) => b.count - a.count || String(a.rule).localeCompare(String(b.rule)));
    if (options.json) return { ok: true, entries: active };
    if (active.length === 0) {
      logger.log('Generation playbook is empty.');
      return { ok: true, entries: [] };
    }
    logger.log('== Generation Playbook (apply before writing executors) ==');
    for (const e of active) {
      logger.log(`  (x${e.count}) ${e.rule} -> ${e.lesson}${e.from ? `  [${e.from}]` : ''}`);
    }
    return { ok: true, entries: active };
  }

  if (sub === 'promote') {
    const data = await loadPlaybook(file);
    const id = options.id || args[1];
    const entry = data.entries.find((candidate) => candidate.id === id || candidate._key === id);
    if (!entry) {
      logger.error('Playbook candidate not found. Use --id=<candidate-id>.');
      return { ok: false, error: 'candidate_not_found' };
    }
    if ((entry.status || 'active') !== 'candidate') {
      return { ok: true, promoted: entry, unchanged: true };
    }

    if (options.squad && !isValidSlug(String(options.squad))) {
      logger.error('Promotion requires a valid squad slug.');
      return { ok: false, error: 'invalid_squad' };
    }
    const evalPath = options.eval
      ? path.resolve(projectDir, String(options.eval))
      : options.squad
        ? path.resolve(projectDir, '.aioson', 'squads', String(options.squad), 'evals', 'latest.json')
        : null;
    const squadsRoot = path.resolve(projectDir, '.aioson', 'squads');
    if (!evalPath || !isContainedPath(squadsRoot, evalPath)) {
      logger.error('Promotion requires a contained --eval=<report.json> or --squad=<slug>.');
      return { ok: false, error: 'eval_required' };
    }
    let report;
    try {
      report = JSON.parse(await fs.readFile(evalPath, 'utf8'));
    } catch {
      return { ok: false, error: 'eval_not_found' };
    }
    const schema = await validateEvalReport(projectDir, report);
    if (!schema.valid) {
      return {
        ok: false,
        error: 'invalid_eval_report',
        details: schema.errors
      };
    }
    if (options.squad && report.squad !== String(options.squad)) {
      return {
        ok: false,
        error: 'eval_squad_mismatch',
        expected: String(options.squad),
        actual: report.squad || null
      };
    }
    const candidateTime = Date.parse(entry.capturedAt || entry.candidateAt || 0);
    const evalTime = Date.parse(report.generated_at || 0);
    const heldOutPass = report.held_out?.status === 'pass'
      && Array.isArray(report.held_out?.cases)
      && report.held_out.cases.length > 0;
    const qualifies = report.verdict === 'PASS'
      && Number(report.critical_failures || 0) === 0
      && heldOutPass
      && Number.isFinite(evalTime)
      && evalTime > candidateTime;
    if (!qualifies) {
      return {
        ok: false,
        error: 'held_out_proof_rejected',
        reason: 'Promotion requires a later PASS eval with held-out cases and zero critical failures',
        candidate: entry.id,
        evalVerdict: report.verdict || null
      };
    }
    entry.status = 'promoted';
    entry.promotedAt = new Date().toISOString();
    entry.promotionEvidence = {
      report: path.relative(projectDir, evalPath).replace(/\\/g, '/'),
      squad: report.squad || null,
      generatedAt: report.generated_at,
      manifestHash: report.inputs?.manifest_hash || null,
      origin: entry.from || null
    };
    await savePlaybook(file, data);
    if (!options.json) {
      logger.log(`Playbook promoted after held-out PASS: ${entry.rule} -> ${entry.lesson}`);
    }
    return { ok: true, promoted: entry };
  }

  logger.error(`Unknown subcommand "${sub}". Use: capture | list | promote`);
  return { ok: false, error: 'unknown_subcommand' };
}

module.exports = {
  playbookPath,
  loadPlaybook,
  savePlaybook,
  entryId,
  sanitizeText,
  runSquadPlaybook
};
