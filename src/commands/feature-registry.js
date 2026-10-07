'use strict';

/**
 * aioson feature:register — the only sanctioned way for an agent to add or
 * move a feature row in features.md (closing stays with feature:close).
 *
 * aioson feature:tidy — one-shot migration for projects whose index grew
 * narrative: rewrites it canonically and moves every note, verbatim, into the
 * owning feature's folder (backup kept). `--dry-run` previews.
 *
 * Usage:
 *   aioson feature:register . --feature=checkout [--status=in_progress] [--started=YYYY-MM-DD] [--json]
 *   aioson feature:tidy . [--dry-run] [--json]
 */

const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');
const {
  KNOWN_STATUSES,
  SAFE_SLUG,
  parseFeatureRegistry,
  tidyFeatureRegistry,
  today,
  writeFeatureRow
} = require('../lib/feature-registry');
const { readFileSafe } = require('../preflight-engine');

const { runFeatureArchive } = require('./feature-archive');

const DEFAULT_STATUS = 'in_progress';

function fail(jsonOut, logger, reason, message, exitCode = 1) {
  if (!jsonOut && logger) logger.log(message);
  return { ok: false, reason, message, exitCode };
}

/** @returns {null | {reason: string, message: string}} */
function validateRegistration(slug, status) {
  if (!slug || !SAFE_SLUG.test(slug)) {
    return { reason: 'invalid_slug', message: 'feature:register requires --feature=<kebab-case-slug>.' };
  }
  if (!KNOWN_STATUSES.has(status)) {
    return { reason: 'invalid_status', message: `Unknown status "${status}". Use one of: ${[...KNOWN_STATUSES].join(', ')}.` };
  }
  if (status === 'done') {
    return {
      reason: 'use_feature_close',
      message: 'A feature becomes done only through `aioson feature:close . --feature=<slug> --verdict=PASS` (QA sign-off, archive, gates).'
    };
  }
  return null;
}

/** An explicit --started wins; otherwise an existing row keeps its date. */
function resolveStarted(optionStarted, existing, date) {
  if (optionStarted) return String(optionStarted);
  return existing && /^\d{4}-\d{2}-\d{2}$/.test(existing.started) ? existing.started : date;
}

function logRegistration(logger, output, existing) {
  logger.log(existing
    ? `features.md: ${output.slug} ${existing.status} → ${output.status}`
    : `features.md: registered ${output.slug} (${output.status}, started ${output.started})`);
  if (output.remainingNotes > 0) {
    logger.log(`features.md still carries ${output.remainingNotes} legacy note(s) — run \`aioson feature:tidy .\` to move them to their feature folders.`);
  }
}

async function runFeatureRegister({ args = [], options = {}, logger } = {}) {
  const targetDir = resolveTargetDir(args);
  const jsonOut = Boolean(options.json);
  const slug = String(options.feature || options.slug || '').trim();
  const status = String(options.status || DEFAULT_STATUS).trim().toLowerCase();

  const invalid = validateRegistration(slug, status);
  if (invalid) return fail(jsonOut, logger, invalid.reason, invalid.message);

  const date = today();
  const content = await readFileSafe(path.join(targetDir, '.aioson', 'context', 'features.md'));
  const existing = parseFeatureRegistry(content || '').rows.find((row) => row.slug === slug);
  const started = resolveStarted(options.started, existing, date);
  const completed = status === 'abandoned' ? date : '—';

  const result = await writeFeatureRow(targetDir, { slug, status, started, completed });
  if (!result.written) {
    return fail(jsonOut, logger, 'unrecognized_format',
      'features.md is not a pipe table this command can read; fix it by hand or run `aioson feature:tidy . --dry-run` to see why.');
  }

  const output = {
    ok: true,
    slug,
    status,
    started,
    created: !existing,
    previousStatus: existing ? existing.status : null,
    remainingNotes: result.remainingNotes
  };
  if (!jsonOut && logger) logRegistration(logger, output, existing);

  // An abandoned feature leaves the live context like a delivered one does:
  // its documents move to abandoned/{slug}/, its test and analysis output is
  // dropped. `--no-archive` keeps everything where it is.
  if (status === 'abandoned' && options.archive !== false && options['no-archive'] !== true) {
    const archive = await runFeatureArchive({ args: [targetDir], options: { feature: slug, json: true }, logger: null });
    output.archive = archive;
    if (!jsonOut && logger) {
      if (archive && archive.ok && !archive.noop) logger.log(`archived in ${archive.archiveDir}/ (documentation only)`);
      else if (archive && !archive.ok) logger.log(`archive incomplete — re-run: aioson feature:archive . --feature=${slug}`);
    }
  }
  return output;
}

function kb(bytes) {
  return (Number(bytes || 0) / 1024).toFixed(1);
}

async function runFeatureTidy({ args = [], options = {}, logger } = {}) {
  const targetDir = resolveTargetDir(args);
  const jsonOut = Boolean(options.json);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);

  const result = await tidyFeatureRegistry(targetDir, { dryRun });
  if (!result.ok) {
    return fail(jsonOut, logger, result.reason,
      'features.md has free text but no pipe-table rows — this command does not restructure a hand-made format.');
  }
  if (jsonOut) return result;
  if (!logger) return result;

  if (result.reason === 'no_registry') {
    logger.log('No .aioson/context/features.md — nothing to tidy.');
    return result;
  }
  if (!result.changed && result.moved.length === 0) {
    logger.log('features.md is already canonical (rows only).');
    return result;
  }
  const before = result.before;
  logger.log(`${dryRun ? '[dry-run] ' : ''}features.md: ${kb(before.bytes)} KB → ${kb(result.afterBytes)} KB, ${before.rows} row(s) kept`);
  if (before.headerlessRows > 0) logger.log(`  ${before.headerlessRows} row(s) sat outside a table header — rejoined`);
  if (before.unclosedComment) logger.log('  an unclosed <!-- comment hid the rest of the file — its text was moved like any note');
  if (before.duplicates > 0) logger.log(`  ${before.duplicates} duplicate row(s) — the last one wins, earlier ones kept as notes`);
  for (const moved of result.moved) {
    logger.log(`  ${moved.notes} note(s) ${dryRun ? '→' : 'moved to'} ${moved.path}`);
  }
  if (result.backup) logger.log(`  backup: ${result.backup}`);
  return result;
}

module.exports = { runFeatureRegister, runFeatureTidy };
