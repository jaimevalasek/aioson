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
const { createTranslator } = require('../i18n');

function positionalArgs(args) {
  return (args || []).filter((arg) => typeof arg === 'string' && !arg.startsWith('-'));
}

/**
 * The project directory for `rawPath` (the working directory when absent): the
 * AIOSON root holding it, else the directory itself. A path that is not a
 * directory is an `error`, never a silent fall back to somewhere else.
 */
function commandProject(rawPath) {
  const dir = resolveTargetDir(rawPath ? [rawPath] : []);
  if (rawPath) {
    let stat;
    try { stat = fs.statSync(dir); } catch { stat = null; }
    if (!stat || !stat.isDirectory()) return { dir, error: `${rawPath} is not a directory` };
  }
  return { dir: resolveProjectRootOrSelf(dir) };
}

/** `[path] <slug>`: two positionals are the path and the slug; one is the slug. */
function pathAndSlug(args) {
  const positional = positionalArgs(args);
  if (positional.length >= 2) return { rawPath: positional[0], slug: positional[1] };
  return { rawPath: null, slug: positional[0] === '.' ? undefined : positional[0] };
}

/** The operator identity as the project's own git config resolves it. */
function identityFor(projectDir) {
  return resolveIdentity({ emailReader: () => readGitEmail(projectDir) });
}

/** The translator for the project's interaction_language (English without one). */
function projectTranslator(projectDir) {
  let language = 'en';
  try {
    const { parseYamlFrontmatter, getInteractionLanguage } = require('../context');
    const raw = fs.readFileSync(path.join(projectDir, '.aioson', 'context', 'project.context.md'), 'utf8');
    language = getInteractionLanguage(parseYamlFrontmatter(raw).data, 'en');
  } catch { /* no project context: English */ }
  return createTranslator(language).t;
}

module.exports = {
  commandProject,
  pathAndSlug,
  positionalArgs,
  identityFor,
  projectTranslator
};
