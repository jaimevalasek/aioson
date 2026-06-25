'use strict';

/**
 * `aioson harness:retro-promote [path] --feature=<slug> [--to=learnings|rules]`
 *
 * Human-approved promotion path for candidates mined by `harness:retro`.
 * Default is dry-run. `--apply --select=<candidate-key|all>` is required before
 * writing `.aioson/learnings/` or `.aioson/rules/`.
 */

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const {
  collectSources,
  resolveFeatureExists
} = require('../lib/retro/retro-sources');
const { aggregate } = require('../lib/retro/retro-aggregate');
const { openRuntimeDb, promoteProjectLearning } = require('../runtime-store');
const { upsertProjectLearning } = require('./devlog-process');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TARGETS = new Set(['learnings', 'rules']);
const EXIT_OK = 0;
const EXIT_IO = 1;
const EXIT_INPUT = 12;
const BAR = '-'.repeat(42);

function relPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function nowIso() {
  return new Date().toISOString();
}

function inputError(logger, message, reason) {
  if (logger && typeof logger.error === 'function') logger.error(message);
  process.exitCode = EXIT_INPUT;
  return { ok: false, exitCode: EXIT_INPUT, reason, message };
}

function ioError(logger, message, err) {
  if (logger && typeof logger.error === 'function') logger.error(message);
  process.exitCode = EXIT_IO;
  return { ok: false, exitCode: EXIT_IO, reason: 'io_error', message: err && err.message ? err.message : String(err) };
}

function sanitizeInline(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function yamlString(value) {
  return JSON.stringify(sanitizeInline(value));
}

function slugify(value, fallback = 'retro-finding') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return slug || fallback;
}

function candidateTitle(candidate) {
  const first = candidate.occurrences && candidate.occurrences[0] ? candidate.occurrences[0] : null;
  const title = first && first.title ? sanitizeInline(first.title) : null;
  const anchor = candidate.finding_id || (candidate.signature ? `sig:${candidate.signature.slice(0, 12)}` : candidate.key);
  return title
    ? `Retro check: ${title}`
    : `Retro check: ${candidate.feature_slug} ${anchor}`;
}

function candidateSummary(candidate) {
  const reasons = Array.isArray(candidate.reasons) ? candidate.reasons.join(', ') : 'unknown';
  return [
    `key=${candidate.key}`,
    `severity=${candidate.max_severity || 'unknown'}`,
    `reasons=${reasons}`,
    `occurrences=${candidate.cost ? candidate.cost.occurrences : (candidate.occurrences || []).length}`,
    `fail_pass_cycles=${candidate.cost ? candidate.cost.fail_pass_cycles : 0}`
  ].join('; ');
}

function occurrenceLines(candidate) {
  const occurrences = Array.isArray(candidate.occurrences) ? candidate.occurrences : [];
  if (occurrences.length === 0) {
    return ['- No single finding occurrence; candidate came from repeated FAIL/PASS cycles.'];
  }
  return occurrences.map((o) => {
    const id = o.finding_id || (o.signature ? `sig:${String(o.signature).slice(0, 12)}` : 'n/a');
    return `- ${relPosix(o.source_path)} | id=${sanitizeInline(id)} | severity=${sanitizeInline(o.severity || 'unknown')} | status=${sanitizeInline(o.status || 'unknown')} | date=${sanitizeInline(o.date || 'unknown')}`;
  });
}

function buildLearningContent(candidate, { dossierRelPath, generatedAt }) {
  const title = candidateTitle(candidate);
  const lines = [
    '---',
    `title: ${yamlString(title)}`,
    `feature: ${candidate.feature_slug}`,
    'signal_type: retro-verification',
    'source: harness-retro-promote',
    `source_dossier: ${dossierRelPath}`,
    'status: active',
    `promoted_at: ${generatedAt}`,
    '---',
    '',
    `# ${sanitizeInline(title)}`,
    '',
    '## Rule of Thumb',
    '',
    'Before closing a similar implementation, check that this recurring verification issue is explicitly covered by code evidence and tests.',
    '',
    '## Retro Candidate',
    '',
    `- key: ${candidate.key}`,
    `- severity: ${candidate.max_severity || 'unknown'}`,
    `- reasons: ${(candidate.reasons || []).join(', ') || 'unknown'}`,
    `- source dossier: ${dossierRelPath}`,
    '',
    '## Bounded Evidence',
    '',
    ...occurrenceLines(candidate),
    '',
    'No raw auditor output, stderr, prompt package, or finding evidence text is stored in this learning.',
    ''
  ];
  return lines.join('\n');
}

function buildRuleContent(candidate, { dossierRelPath, generatedAt, ruleName }) {
  const title = candidateTitle(candidate);
  const lines = [
    '---',
    `name: ${ruleName}`,
    `description: ${yamlString(`Prevent recurring implementation verification issue: ${title}`)}`,
    'agents: [dev, deyvin, scope-check, qa]',
    'priority: 6',
    'version: 1.0.0',
    'modes: [planning, executing, reviewing]',
    'task_types: [implementation, verification, testing]',
    'load_tier: trigger',
    `triggers: [${candidate.feature_slug}, implementation verification, retro candidate, recurring miss]`,
    'retrieval_intents: [implementation, testing, memory]',
    'paths: [src/**, tests/**, .aioson/context/features/**]',
    '---',
    '',
    `# ${sanitizeInline(title)}`,
    '',
    'When implementing or verifying similar behavior, explicitly check this recurring retro issue before claiming the feature is done.',
    '',
    '## Candidate Metadata',
    '',
    `- key: ${candidate.key}`,
    `- feature: ${candidate.feature_slug}`,
    `- severity: ${candidate.max_severity || 'unknown'}`,
    `- reasons: ${(candidate.reasons || []).join(', ') || 'unknown'}`,
    `- source dossier: ${dossierRelPath}`,
    `- promoted at: ${generatedAt}`,
    '',
    '## Bounded Evidence',
    '',
    ...occurrenceLines(candidate),
    '',
    'This rule intentionally excludes raw auditor output, stderr, prompt packages, and finding evidence text.',
    ''
  ];
  return lines.join('\n');
}

function selectCandidates(candidates, selectValue) {
  if (!selectValue || selectValue === true) return { ok: true, selected: candidates, selection: 'preview_all' };
  const raw = String(selectValue).trim();
  if (raw === 'all') return { ok: true, selected: candidates, selection: 'all' };
  const wanted = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
  const selected = candidates.filter((candidate) => wanted.has(candidate.key));
  const missing = [...wanted].filter((key) => !candidates.some((candidate) => candidate.key === key));
  if (missing.length > 0) return { ok: false, reason: 'unknown_selection', missing };
  return { ok: true, selected, selection: raw };
}

function promotionItems(candidates, to) {
  return candidates.map((candidate) => {
    const fileSlug = slugify(`${candidate.feature_slug}-${candidate.key}`);
    const fileName = to === 'rules' ? `retro-${fileSlug}.md` : `${fileSlug}.md`;
    const targetPath = to === 'rules'
      ? path.join('.aioson', 'rules', fileName)
      : path.join('.aioson', 'learnings', 'gotchas', fileName);
    return {
      key: candidate.key,
      feature_slug: candidate.feature_slug,
      title: candidateTitle(candidate),
      severity: candidate.max_severity || 'unknown',
      reasons: candidate.reasons || [],
      occurrences: candidate.cost ? candidate.cost.occurrences : (candidate.occurrences || []).length,
      target: to,
      target_path: relPosix(targetPath)
    };
  });
}

async function ensureLearningIndex(rootDir, item) {
  const indexRel = path.join('.aioson', 'learnings', 'INDEX.md');
  const indexAbs = path.join(rootDir, indexRel);
  let content = '# Project Learnings\n\n';
  try {
    content = await fs.readFile(indexAbs, 'utf8');
  } catch {
    // create below
  }

  const targetRel = relPosix(path.relative(path.join(rootDir, '.aioson', 'learnings'), path.join(rootDir, item.target_path)));
  if (content.includes(`](${targetRel})`)) return false;

  const entry = `- [${sanitizeInline(item.title)}](${targetRel}) - retro candidate ${item.key}\n`;
  const next = content
    .replace(/\r\n/g, '\n')
    .replace(/\n?_No project learnings yet\._\n?/i, '\n')
    .replace(/\s*$/, '\n');
  await fs.mkdir(path.dirname(indexAbs), { recursive: true });
  await fs.writeFile(indexAbs, `${next}${entry}`, 'utf8');
  return true;
}

async function writePromotionFile(rootDir, candidate, item, { dossierRelPath, generatedAt }) {
  const abs = path.join(rootDir, item.target_path);
  if (fsSync.existsSync(abs)) return { action: 'skipped', reason: 'already_exists', path: item.target_path };
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const content = item.target === 'rules'
    ? buildRuleContent(candidate, {
      dossierRelPath,
      generatedAt,
      ruleName: path.basename(item.target_path, '.md')
    })
    : buildLearningContent(candidate, { dossierRelPath, generatedAt });
  await fs.writeFile(abs, content, 'utf8');
  return { action: 'written', path: item.target_path };
}

async function recordRuntimeLearning(rootDir, candidate, item) {
  const handle = await openRuntimeDb(rootDir);
  try {
    const result = upsertProjectLearning(handle.db, {
      title: item.title,
      type: 'quality',
      kind: 'gotcha',
      featureSlug: item.feature_slug,
      evidence: candidateSummary(candidate),
      sourceSession: `harness-retro-promote:${candidate.key}`
    });
    if (item.target === 'rules') {
      promoteProjectLearning(handle.db, result.learningId, item.target_path);
    }
    return result;
  } finally {
    handle.db.close();
  }
}

async function applyPromotions(rootDir, selectedCandidates, items, { dossierRelPath, generatedAt, target }) {
  const written = [];
  const skipped = [];
  const runtime = [];

  for (let index = 0; index < selectedCandidates.length; index += 1) {
    const candidate = selectedCandidates[index];
    const item = items[index];
    const fileResult = await writePromotionFile(rootDir, candidate, item, { dossierRelPath, generatedAt });
    if (fileResult.action === 'written') written.push(fileResult);
    else skipped.push(fileResult);

    if (target === 'learnings') {
      await ensureLearningIndex(rootDir, item);
    }

    runtime.push({
      key: item.key,
      ...(await recordRuntimeLearning(rootDir, candidate, item))
    });
  }

  return { written, skipped, runtime };
}

async function runHarnessRetroPromote({ args, options = {}, logger } = {}) {
  const log = logger || { log() {}, error() {} };
  const rootDir = path.resolve(process.cwd(), (args && args[0]) || '.');
  const slug = options.feature !== undefined && options.feature !== true
    ? String(options.feature || '').trim()
    : '';
  const target = options.to === undefined || options.to === true
    ? 'learnings'
    : String(options.to).trim();
  const apply = Boolean(options.apply);

  if (!slug) return inputError(log, 'harness:retro-promote requires --feature=<slug>', 'missing_feature');
  if (!SLUG_RE.test(slug)) return inputError(log, `Invalid feature slug: ${slug}`, 'invalid_slug');
  if (!TARGETS.has(target)) return inputError(log, `Invalid --to target: ${target} (use learnings or rules)`, 'invalid_target');
  if (!resolveFeatureExists(rootDir, slug)) return inputError(log, `Feature not found: ${slug}`, 'feature_not_found');

  const dossierRelPath = relPosix(path.join('.aioson', 'context', 'retro', `${slug}.md`));
  if (!fsSync.existsSync(path.join(rootDir, dossierRelPath))) {
    return inputError(log, `Retro dossier not found: ${dossierRelPath}. Run harness:retro first.`, 'dossier_missing');
  }

  const sources = collectSources(rootDir, [slug]);
  const { candidates } = aggregate(sources);
  const selection = selectCandidates(candidates, options.select);
  if (!selection.ok) {
    return inputError(log, `Unknown candidate key(s): ${selection.missing.join(', ')}`, selection.reason);
  }

  if (apply && (options.select === undefined || options.select === true || String(options.select).trim() === '')) {
    return inputError(log, 'Applying retro promotion requires --select=<candidate-key|all>', 'selection_required');
  }

  const items = promotionItems(selection.selected, target);
  const result = {
    ok: true,
    exitCode: EXIT_OK,
    dry_run: !apply,
    applied: apply,
    target,
    feature: slug,
    dossier: dossierRelPath,
    candidates: candidates.length,
    selected: selection.selected.length,
    selection: selection.selection,
    items,
    written: [],
    skipped: [],
    runtime: []
  };

  if (apply && selection.selected.length > 0) {
    try {
      const applied = await applyPromotions(rootDir, selection.selected, items, {
        dossierRelPath,
        generatedAt: nowIso(),
        target
      });
      result.written = applied.written;
      result.skipped = applied.skipped;
      result.runtime = applied.runtime;
    } catch (err) {
      return ioError(log, `Failed to apply retro promotion: ${err.message}`, err);
    }
  }

  if (options.json) return result;

  log.log('');
  log.log('Retro Promotion');
  log.log(BAR);
  log.log(`Feature: ${slug}`);
  log.log(`Target: ${target}`);
  log.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
  log.log(`Candidates: ${candidates.length}; selected: ${selection.selected.length}`);
  for (const item of items) {
    log.log(`- ${item.key} -> ${item.target_path}`);
  }
  if (!apply && items.length > 0) {
    log.log('');
    log.log('Apply explicitly with: --apply --select=<candidate-key|all>');
  }
  log.log('');

  return result;
}

module.exports = {
  runHarnessRetroPromote,
  _internal: {
    buildLearningContent,
    buildRuleContent,
    candidateTitle,
    selectCandidates,
    promotionItems
  }
};

