'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS } = require('./constants');
const { TEMPLATE_DIR } = require('./installer');
const { exists, ensureDir } = require('./utils');
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

function getLocalizedAgentPath(agentId, locale) {
  return `.aioson/locales/${localeForPath(locale)}/agents/${agentId}.md`;
}

function getActiveAgentPath(agentId) {
  return `.aioson/agents/${agentId}.md`;
}

async function applyAgentLocale(targetDir, locale, options = {}) {
  const interactionLanguage = normalizeInteractionLanguage(locale || 'en');
  const dryRun = Boolean(options.dryRun);
  const selectiveUpdate = Boolean(options.selectiveUpdate);
  const copied = [];
  const missing = [];
  const skipped = [];

  for (const agent of AGENT_DEFINITIONS) {
    const sourceRel = getActiveAgentPath(agent.id);
    const sourceAbs = path.join(TEMPLATE_DIR, sourceRel);
    const destRel = getActiveAgentPath(agent.id);
    const destAbs = path.join(targetDir, destRel);

    if (!(await exists(sourceAbs))) {
      missing.push(sourceRel);
      continue;
    }

    if (selectiveUpdate && !(await exists(destAbs))) {
      skipped.push({ source: sourceRel, target: destRel, reason: 'not-installed' });
      continue;
    }

    if (!dryRun) {
      await ensureDir(path.dirname(destAbs));
      await fs.copyFile(sourceAbs, destAbs);
    }
    copied.push({ source: sourceRel, target: destRel });
  }

  return {
    locale: interactionLanguage,
    promptLocale: 'en',
    copied,
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
