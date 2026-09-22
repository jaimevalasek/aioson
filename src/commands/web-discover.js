'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');
const { createResearchProvider } = require('../squad/research-provider');
const {
  clampLimit,
  parseUrlList,
  suggestSlug,
  resolveInsideProject,
  discoverNews,
  collectExample
} = require('../web-news');

async function runWebDiscover({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const query = String(options.query || '').trim();
  const urls = parseUrlList(options.url, options.urls);
  if (!query) {
    logger.error(t('web_discover.query_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'query_missing' };
  }

  const provider = urls.length === 0 ? createResearchProvider() : null;
  logger.log(t('web_discover.fetching', { query }));
  let result;
  try {
    result = await discoverNews({
      urls,
      query,
      limit: clampLimit(options.limit),
      provider,
      projectDir: targetDir
    });
  } catch (error) {
    logger.error(t('web_discover.failed', { error: error.message }));
    process.exitCode = 1;
    return { ok: false, error: 'discover_failed', detail: error.message };
  }

  if (!result.ok) {
    const key = result.error === 'source_missing' ? 'web_discover.source_missing' : 'web_discover.failed';
    const detail = result.errors?.[0]?.error || result.detail || result.error;
    logger.error(t(key, { error: detail }));
    process.exitCode = 1;
    return {
      ok: false,
      error: result.error,
      query,
      detail,
      errors: result.errors || []
    };
  }

  const slug = suggestSlug(query);
  let candidatesFile = null;
  if (options.out) {
    try {
      const outPath = resolveInsideProject(targetDir, options.out);
      await fsp.mkdir(path.dirname(outPath), { recursive: true });
      candidatesFile = path.relative(targetDir, outPath).split(path.sep).join('/');
      await fsp.writeFile(outPath, `${JSON.stringify({
        query,
        candidates: result.candidates,
        relevance: result.relevance
      }, null, 2)}\n`);
    } catch (error) {
      logger.error(t('web_discover.failed', { error: error.message }));
      process.exitCode = 1;
      return { ok: false, error: 'out_failed', detail: error.message };
    }
  }

  const example = result.candidates.length
    ? collectExample(slug, result.candidates, candidatesFile)
    : null;
  const output = {
    ok: true,
    targetDir,
    query,
    sources: result.sources,
    errors: result.errors,
    candidates: result.candidates,
    relevance: result.relevance,
    collect: example
      ? {
        command: 'web:collect',
        slug,
        example,
        selection: result.relevance?.trust_candidates
          ? 'Pass --urls with a subset, or --candidates to save every candidate in that file.'
          : 'Keyword matches only. Judge each URL before collect; a shared word is not enough.'
      }
      : null
  };

  if (options.json) return output;

  if (result.candidates.length === 0) {
    logger.log(t(result.relevance?.status === 'used' ? 'web_discover.jev_none' : 'web_discover.none', { query }));
  } else {
    logger.log(t('web_discover.found', { count: result.candidates.length, query }));
    for (const candidate of result.candidates) {
      logger.log(t('web_discover.candidate_line', {
        score: candidate.score,
        matched: candidate.matched_in.join(','),
        title: candidate.title || '-',
        url: candidate.url
      }));
    }
    logger.log(t('web_discover.next', { command: example }));
  }
  if (result.relevance?.status === 'used' && result.candidates.length > 0) {
    logger.log(t('web_discover.jev_kept', {
      kept: result.relevance.kept,
      judged: result.relevance.judged
    }));
  } else if (result.relevance?.status === 'unavailable' || result.relevance?.status === 'invalid') {
    logger.log(t('web_discover.jev_unavailable', { reason: result.relevance.reason || result.relevance.status }));
  }
  logger.log(t('web_discover.done'));
  return output;
}

module.exports = {
  runWebDiscover
};
