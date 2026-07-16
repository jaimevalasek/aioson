'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { applyAgentLocale, normalizeInteractionLanguage } = require('../locales');
const {
  parseYamlFrontmatter,
  validateProjectContextFile,
  getInteractionLanguage
} = require('../context');

function yamlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function synchronizeLanguageFrontmatter(markdown, language) {
  const parsed = parseYamlFrontmatter(markdown);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, content: markdown, changed: false };
  }

  const eol = String(markdown).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(markdown).split(/\r?\n/);
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingIndex === -1) {
    return { ok: false, reason: 'unclosed_frontmatter', content: markdown, changed: false };
  }

  const fields = ['interaction_language', 'conversation_language'];
  let insertAt = closingIndex;
  for (const field of fields) {
    const fieldPattern = new RegExp(`^${field}\\s*:`);
    const existingIndex = lines.slice(1, insertAt).findIndex((line) => fieldPattern.test(line.trim()));
    const nextLine = `${field}: ${yamlString(language)}`;
    if (existingIndex === -1) {
      lines.splice(insertAt, 0, nextLine);
      insertAt += 1;
    } else {
      lines[existingIndex + 1] = nextLine;
    }
  }

  const content = lines.join(eol);
  return { ok: true, reason: null, content, changed: content !== markdown };
}

async function synchronizeProjectContextLanguage(targetDir, language, options = {}) {
  const filePath = path.join(targetDir, '.aioson', 'context', 'project.context.md');
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { status: 'missing', filePath, changed: false, updated: false };
    }
    throw error;
  }

  const synchronized = synchronizeLanguageFrontmatter(content, language);
  if (!synchronized.ok) {
    return {
      status: 'invalid_frontmatter',
      reason: synchronized.reason,
      filePath,
      changed: false,
      updated: false
    };
  }

  if (!synchronized.changed) {
    return { status: 'unchanged', filePath, changed: false, updated: false };
  }

  if (options.dryRun) {
    return { status: 'would_update', filePath, changed: true, updated: false };
  }

  await fs.writeFile(filePath, synchronized.content, 'utf8');
  return { status: 'updated', filePath, changed: true, updated: true };
}

async function runLocaleApply({ args, options, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const dryRun = Boolean(options['dry-run']);

  let requestedLanguage = options.language || options.lang || '';
  if (!requestedLanguage) {
    const context = await validateProjectContextFile(targetDir);
    if (context.parsed && context.data) {
      requestedLanguage = getInteractionLanguage(context.data, 'en');
    }
  }

  const result = await applyAgentLocale(
    targetDir,
    normalizeInteractionLanguage(requestedLanguage || 'en'),
    { dryRun }
  );
  const contextSync = await synchronizeProjectContextLanguage(targetDir, result.locale, { dryRun });

  logger.log(
    dryRun
      ? t('locale_apply.dry_run_applied', { locale: result.locale })
      : t('locale_apply.applied', { locale: result.locale })
  );
  logger.log(t('locale_apply.copied_count', { count: result.copied.length }));

  if (contextSync.status === 'updated') {
    logger.log(t('locale_apply.context_updated', { locale: result.locale }));
  } else if (contextSync.status === 'would_update') {
    logger.log(t('locale_apply.context_would_update', { locale: result.locale }));
  } else if (contextSync.status === 'unchanged') {
    logger.log(t('locale_apply.context_unchanged', { locale: result.locale }));
  } else if (contextSync.status === 'missing') {
    logger.log(t('locale_apply.context_missing'));
  } else if (contextSync.status === 'invalid_frontmatter') {
    logger.log(t('locale_apply.context_invalid'));
  }

  if (result.missing.length > 0) {
    logger.log(t('locale_apply.missing_count', { count: result.missing.length }));
  }

  for (const item of result.copied) {
    logger.log(
      t('locale_apply.copy_line', {
        source: item.source,
        target: item.target
      })
    );
  }

  return {
    ok: true,
    targetDir,
    ...result,
    contextSync
  };
}

module.exports = {
  runLocaleApply,
  synchronizeLanguageFrontmatter,
  synchronizeProjectContextLanguage
};
