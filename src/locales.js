'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS } = require('./constants');
const { TEMPLATE_DIR, readInstallProfile, shouldSkipTemplatePath } = require('./installer');
const { exists, copyFileWithDir, nowStamp, toRelativeSafe } = require('./utils');
const { normalizeLanguageTag } = require('./context');

const SUPPORTED_AGENT_LOCALES = ['en', 'pt-BR', 'es', 'fr'];

function localeForPath(value) {
  return String(value || '').replace(/_/g, '-');
}

function normalizeInteractionLanguage(languageTag, fallback = 'en') {
  return normalizeLanguageTag(languageTag, fallback);
}

function resolveAgentLocale(languageTag) {
  const tag = normalizeLanguageTag(languageTag);
  if (!tag) return 'en';
  const canonical = tag.replace(/_/g, '-');

  const exact = SUPPORTED_AGENT_LOCALES.find(
    (locale) => locale.toLowerCase() === canonical.toLowerCase()
  );
  if (exact) return exact;

  const base = canonical.split('-')[0].toLowerCase();
  if (base === 'pt') return 'pt-BR';
  if (base === 'en') return 'en';
  if (base === 'es') return 'es';
  if (base === 'fr') return 'fr';

  return 'en';
}

/**
 * @deprecated Legacy locale-pack path shape kept only for backward
 * compatibility (see tests/locales.test.js). The `.aioson/locales/` pack
 * system was removed in v1.7.3+ — agent prompts are canonical English with a
 * runtime language boundary; no caller should build this path for new work.
 */
function getLocalizedAgentPath(agentId, locale) {
  return `.aioson/locales/${localeForPath(locale)}/agents/${agentId}.md`;
}

function getActiveAgentPath(agentId) {
  return `.aioson/agents/${agentId}.md`;
}

async function readOrNull(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

// One agent's prompt: what the sync does with it and, when it overwrites an
// edited prompt, where the edit was kept. `ctx.backupRoot` is opened on the
// first backup, so a run that overwrites nothing leaves no backup folder.
async function syncAgentPrompt(ctx, agentId) {
  const rel = getActiveAgentPath(agentId);
  const sourceAbs = path.join(TEMPLATE_DIR, rel);
  const destAbs = path.join(ctx.targetDir, rel);
  if (!(await exists(sourceAbs))) return { outcome: 'missing', rel };

  const profileSkip = shouldSkipTemplatePath(rel, ctx.installProfile);
  if (profileSkip) return { outcome: 'skipped', rel, reason: profileSkip };

  const current = await readOrNull(destAbs);
  if (ctx.selectiveUpdate && current === null) return { outcome: 'skipped', rel, reason: 'not-installed' };
  if (current !== null && current.equals(await fs.readFile(sourceAbs))) return { outcome: 'unchanged', rel };

  let backupPath = null;
  if (current !== null) {
    if (!ctx.backupRoot) ctx.backupRoot = path.join(ctx.targetDir, '.aioson', 'backups', nowStamp());
    const backupAbs = path.join(ctx.backupRoot, rel);
    if (!ctx.dryRun) {
      try {
        await copyFileWithDir(destAbs, backupAbs);
      } catch (err) {
        // Without a copy, overwriting would destroy the user's edit: the
        // prompt stays as it is and the failure is reported instead.
        return { outcome: 'backup-failed', rel, error: err && err.message ? err.message : String(err) };
      }
    }
    backupPath = toRelativeSafe(ctx.targetDir, backupAbs);
  }

  if (!ctx.dryRun) await copyFileWithDir(sourceAbs, destAbs);
  return { outcome: 'written', rel, backupPath };
}

/**
 * Restore every active agent prompt to its canonical template copy.
 *
 * Two things a project chose survive it. The saved install profile
 * (`.aioson/install.json`) filters agents with the very predicate the template
 * copy uses, so a profile that left out squads does not get squad, orache or
 * genome written back. And a prompt the user edited is copied to
 * `.aioson/backups/<stamp>/.aioson/agents/<id>.md` before it is overwritten,
 * while one that already matches is neither rewritten nor backed up.
 *
 * Result lists: `copied` holds every prompt the call leaves canonical (the
 * count callers report as synchronized); `written` the ones it actually wrote
 * (in dry-run, would write); `unchanged` the ones already canonical;
 * `backedUp` the project-relative backups of edited prompts; `skipped` the
 * agents left alone, with the reason.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.selectiveUpdate] only touch prompts already installed
 * @param {object|null} [options.installProfile] profile to honor; when omitted
 *   the saved one is read (null = no profile, every agent)
 * @param {string} [options.backupRoot] stamped backup folder to share with the
 *   caller's other backups; opened lazily otherwise
 */
async function applyAgentLocale(targetDir, locale, options = {}) {
  const interactionLanguage = normalizeInteractionLanguage(locale || 'en');
  const dryRun = Boolean(options.dryRun);
  const ctx = {
    targetDir,
    dryRun,
    selectiveUpdate: Boolean(options.selectiveUpdate),
    installProfile: Object.prototype.hasOwnProperty.call(options, 'installProfile')
      ? options.installProfile
      : await readInstallProfile(targetDir),
    backupRoot: options.backupRoot || null
  };
  const copied = [];
  const written = [];
  const unchanged = [];
  const backedUp = [];
  const failedBackups = [];
  const missing = [];
  const skipped = [];

  for (const agent of AGENT_DEFINITIONS) {
    const step = await syncAgentPrompt(ctx, agent.id);
    const entry = { source: step.rel, target: step.rel };
    if (step.outcome === 'missing') {
      missing.push(step.rel);
    } else if (step.outcome === 'skipped') {
      skipped.push({ ...entry, reason: step.reason });
    } else if (step.outcome === 'backup-failed') {
      failedBackups.push({ path: step.rel, error: step.error });
      skipped.push({ ...entry, reason: 'backup-failed' });
    } else {
      copied.push(entry);
      (step.outcome === 'unchanged' ? unchanged : written).push(entry);
      if (step.backupPath) backedUp.push(step.backupPath);
    }
  }

  return {
    locale: interactionLanguage,
    promptLocale: 'en',
    copied,
    written,
    unchanged,
    backedUp,
    failedBackups,
    missing,
    skipped,
    dryRun
  };
}

module.exports = {
  SUPPORTED_AGENT_LOCALES,
  normalizeLanguageTag,
  normalizeInteractionLanguage,
  resolveAgentLocale,
  getLocalizedAgentPath,
  getActiveAgentPath,
  applyAgentLocale
};
