'use strict';

const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');
const {
  parseUrlList,
  sanitizeSlug,
  collectNews,
  readCandidatesFile
} = require('../web-news');

async function runWebCollect({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const slug = sanitizeSlug(options.slug || '');
  if (!slug) {
    logger.error(t('web_collect.slug_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'slug_missing' };
  }

  let metadata = [];
  let query = String(options.query || '').trim();
  let urls = parseUrlList(options.url, options.urls);
  if (options.candidates) {
    try {
      const loaded = await readCandidatesFile(targetDir, options.candidates);
      metadata = loaded.candidates;
      if (!query) query = String(loaded.query || '').trim();
      if (urls.length === 0) urls = loaded.candidates.map((item) => item.url);
    } catch (error) {
      logger.error(t('web_collect.failed', { error: error.message }));
      process.exitCode = 1;
      return { ok: false, error: 'candidates_unreadable', detail: error.message };
    }
  }
  if (urls.length === 0) {
    logger.error(t('web_collect.url_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'url_missing' };
  }

  logger.log(t('web_collect.fetching', { count: urls.length, slug }));
  let result;
  try {
    result = await collectNews({ projectDir: targetDir, slug, query, urls, metadata });
  } catch (error) {
    logger.error(t('web_collect.failed', { error: error.message }));
    process.exitCode = 1;
    return { ok: false, error: 'collect_failed', detail: error.message };
  }

  if (!result.ok) {
    const key = result.error === 'url_missing' ? 'web_collect.url_missing' : 'web_collect.failed';
    const detail = result.failures?.[0]?.error || result.error;
    logger.error(t(key, { error: detail }));
    process.exitCode = 1;
    return {
      ok: false,
      error: result.error,
      slug,
      failures: result.failures || [],
      detail
    };
  }

  const output = {
    ok: true,
    targetDir,
    slug: result.slug,
    query: result.query,
    verdict: result.verdict,
    summary: path.relative(targetDir, result.summary).split(path.sep).join('/'),
    links: path.relative(targetDir, result.linksPath).split(path.sep).join('/'),
    saved: result.links,
    failures: result.failures,
    injection_findings: result.injection_findings,
    read: `researchs/${result.slug}/summary.md`
  };

  if (options.json) return output;

  logger.log(t('web_collect.saved', { count: result.links.length, dir: `researchs/${result.slug}` }));
  if (result.failures.length) logger.log(t('web_collect.partial', { count: result.failures.length }));
  if (result.injection_findings > 0) {
    logger.log(t('web_collect.injection_flagged', { count: result.injection_findings }));
  }
  logger.log(t('web_collect.done', { file: output.read }));
  return output;
}

module.exports = {
  runWebCollect
};
