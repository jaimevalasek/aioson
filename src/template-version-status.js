'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getCliVersionSync } = require('./version');

const INSTALL_RELATIVE_PATH = '.aioson/install.json';
// Where this copy of the CLI lives. Several copies coexist on one machine (a
// global install, an `npm link`, the one a desktop host ships in its installer),
// and the path is what tells a stale copy apart.
const CLI_ROOT = path.join(__dirname, '..');

function parseSemver(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

async function inspectTemplateVersion(targetDir, options = {}) {
  const cliVersion = String(options.cliVersion || getCliVersionSync()).trim();
  const installPath = path.join(targetDir, INSTALL_RELATIVE_PATH);
  let install;
  try {
    install = JSON.parse(await fs.readFile(installPath, 'utf8'));
  } catch (error) {
    const missing = error && error.code === 'ENOENT';
    return {
      status: missing ? 'missing' : 'invalid',
      outdated: false,
      cli_version: cliVersion,
      template_version: null,
      path: INSTALL_RELATIVE_PATH,
      warning: missing
        ? null
        : `[AIOSON template warning] ${INSTALL_RELATIVE_PATH} is invalid; run \`aioson update .\` before relying on workflow routing.`
    };
  }

  const templateVersion = String(install.template_version || '').trim() || null;
  const comparison = compareSemver(templateVersion, cliVersion);
  if (comparison === null) {
    return {
      status: 'unknown',
      outdated: false,
      cli_version: cliVersion,
      template_version: templateVersion,
      path: INSTALL_RELATIVE_PATH,
      warning: `[AIOSON template warning] Cannot compare installed template ${templateVersion || '(missing)'} with CLI ${cliVersion}; run \`aioson update .\` before relying on workflow routing.`
    };
  }

  const outdated = comparison < 0;
  const ahead = comparison > 0;
  return {
    status: outdated ? 'outdated' : ahead ? 'ahead' : 'current',
    outdated,
    cli_version: cliVersion,
    template_version: templateVersion,
    path: INSTALL_RELATIVE_PATH,
    warning: outdated
      ? `[AIOSON template warning] Project routing template ${templateVersion} is older than CLI ${cliVersion}. Run \`aioson update .\`; until then, do not bind a new request to the active workflow without \`--expect-feature=<slug>\`.`
      : ahead
        ? aheadWarning(templateVersion, cliVersion, options.cliRoot || CLI_ROOT)
        : null
  };
}

// A newer CLI updated the project and an older copy is running now: the
// project's agents name commands this copy may not have, and `aioson update`
// from it is refused as a downgrade. Silent before, so the skew surfaced only
// as an "unknown command" mid-session.
function aheadWarning(templateVersion, cliVersion, cliRoot) {
  return `[AIOSON template warning] Project template ${templateVersion} is newer than this CLI ${cliVersion} (${cliRoot}); commands the project's agents name may not exist in it. Update this copy (\`npm install -g @jaimevalasek/aioson@latest\`, or the app that ships it) or run the CLI that updated the project.`;
}

module.exports = {
  INSTALL_RELATIVE_PATH,
  CLI_ROOT,
  parseSemver,
  compareSemver,
  inspectTemplateVersion
};
