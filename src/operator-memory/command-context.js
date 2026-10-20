'use strict';

/**
 * operator-memory — where an op:* command runs. The project is the one its
 * `[path]` argument names (the AIOSON root that holds it), the working
 * directory only when no path is given; the operator identity is read from
 * that project's git config, exactly as if the command ran inside it; and the
 * lines a person reads come in the project's interaction_language.
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveTargetDir, resolveProjectRootOrSelf } = require('../lib/project-root');
const { resolveIdentity, readGitEmail } = require('./identity');
const { ensureStorageTree } = require('./storage');
const { createTranslator } = require('../i18n');

function positionalArgs(args) {
  return (args || []).filter((arg) => typeof arg === 'string' && !arg.startsWith('-'));
}

/** What an op:* command returns on failure: printed unless --json, exit code 1. */
function commandFailure(options, logger, error) {
  if (options && options.json) return { ok: false, error };
  if (logger && logger.error) logger.error(error);
  return { ok: false, exitCode: 1, error };
}

/**
 * The project directory for `rawPath` (the working directory when absent): the
 * AIOSON root holding it, else the directory itself. A path that is not a
 * directory is the command's `failure`, never a silent fall back elsewhere.
 */
function openCommand(name, rawPath, options, logger) {
  const dir = resolveTargetDir(rawPath ? [rawPath] : []);
  if (rawPath) {
    let stat;
    try { stat = fs.statSync(dir); } catch { stat = null; }
    if (!stat || !stat.isDirectory()) return { failure: commandFailure(options, logger, `${name} — ${rawPath} is not a directory.`) };
  }
  return { dir: resolveProjectRootOrSelf(dir) };
}

/** The operator identity as the project's own git config resolves it, its storage ready. */
function commandIdentity(projectDir) {
  const resolved = resolveIdentity({ emailReader: () => readGitEmail(projectDir) });
  ensureStorageTree(resolved.identity);
  return resolved;
}

function isDirectory(rawPath) {
  try { return fs.statSync(resolveTargetDir([rawPath])).isDirectory(); } catch { return false; }
}

/**
 * `[path] <slug>` from the positionals — or `<slug> [path]` when only the second
 * names a directory (`op:show <slug> .`, the order 1.73.0 accepted); a lone
 * positional is the slug, a lone `.` none.
 */
function pathAndSlug(positional) {
  if (positional.length < 2) return [null, positional[0] === '.' ? undefined : positional[0]];
  const [first, second] = positional;
  return !isDirectory(first) && isDirectory(second) ? [second, first] : [first, second];
}

/**
 * The prologue of a `[path] <slug>` command: its slug, project and identity, or
 * its `failure` when the slug is missing or the path is not a directory.
 */
function openSlugCommand(name, args, options, logger) {
  const [rawPath, slug] = pathAndSlug(positionalArgs(args));
  if (!slug) return { failure: commandFailure(options, logger, `${name} — required argument: <slug>. Usage: aioson ${name} [path] <slug>`) };
  const opened = openCommand(name, rawPath, options, logger);
  if (opened.failure) return opened;
  return { slug, dir: opened.dir, resolved: commandIdentity(opened.dir) };
}

/**
 * The translator for the lines a person reads: an explicit --locale first, as
 * across the CLI, else the project's interaction_language, else English.
 */
function projectTranslator(projectDir, options = {}) {
  if (options && options.locale) return createTranslator(String(options.locale)).t;
  let language = 'en';
  try {
    const { parseYamlFrontmatter, getInteractionLanguage } = require('../context');
    const raw = fs.readFileSync(path.join(projectDir, '.aioson', 'context', 'project.context.md'), 'utf8');
    language = getInteractionLanguage(parseYamlFrontmatter(raw).data, 'en');
  } catch { /* no project context: English */ }
  return createTranslator(language).t;
}

module.exports = {
  positionalArgs,
  commandFailure,
  openCommand,
  commandIdentity,
  openSlugCommand,
  projectTranslator
};
