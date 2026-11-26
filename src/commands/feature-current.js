'use strict';

/**
 * aioson feature:current — resolve the active feature slug deterministically.
 *
 * Single source of truth for "which feature is active right now", so every spec
 * agent (product, sheldon, planner, and any optional specialist)
 * resolves the SAME {slug} instead of re-guessing and colliding on bare paths
 * (design-doc.md, readiness.md, scope-check.md, ui-spec.md, sheldon-enrichment.md).
 *
 * Resolution order:
 *   0. inside a live session (`live:start` exported its key to this process):
 *      the feature that session works on (src/lib/session-feature.js). Another
 *      session registering or advancing another feature never changes it.
 *      Without one, the feature this host chat named (src/lib/chat-session.js).
 *   1. project-pulse.md `active_feature` (when set and not the `(none)` sentinel)
 *      — unless this chat named none and another chat of the folder is on that
 *      feature: then `ambiguous`, with `held_by_other_chat`.
 *   2. the single `in_progress` row in features.md (unambiguous fallback)
 *   3. empty — genuine project-level work, no active feature
 *
 * When more than one feature is `in_progress`, the result is `ambiguous`: no slug
 * is guessed, and the caller must disambiguate (ask the user) rather than
 * silently overwrite another feature's artifact. Inside a live session that
 * has named no feature this holds BEFORE the pulse is read: the pulse is one
 * per project and may be another session's.
 *
 * Usage:
 *   aioson feature:current .            # prints the slug (or nothing) to stdout
 *   aioson feature:current . --json     # { ok, slug, source, ambiguous, candidates }
 */

const path = require('node:path');
const { readProjectPulse, parseFeaturesMap, readFileSafe, contextDir } = require('../preflight-engine');
const { readSessionFeature } = require('../lib/session-feature');
const { otherActiveChats, describeChat } = require('../lib/chat-session');

// Values that mean "no active feature" rather than a real slug.
const NONE_SENTINELS = new Set(['', '(none)', 'none', 'null', '-', 'n/a']);

function normalizeSlug(value) {
  return String(value == null ? '' : value).trim();
}

function isNone(value) {
  return NONE_SENTINELS.has(normalizeSlug(value).toLowerCase());
}

// A feature the registry already closed is nobody's current work.
const CLOSED_STATUSES = new Set(['done', 'abandoned']);

// The newest other chat of this folder on `slug`, or null.
async function chatHolding(targetDir, ownKey, slug) {
  const others = await otherActiveChats(targetDir, ownKey).catch(() => []);
  return others.find((chat) => chat.feature === slug) || null;
}

async function resolveActiveFeature(targetDir, { env = process.env } = {}) {
  const featuresContent = await readFileSafe(path.join(contextDir(targetDir), 'features.md'));
  const map = parseFeaturesMap(featuresContent);
  const inProgress = [];
  for (const [slug, status] of map.entries()) {
    if (normalizeSlug(status).toLowerCase() === 'in_progress' && !inProgress.includes(slug)) {
      inProgress.push(slug);
    }
  }

  // 0. The live session — or, without one, the host chat — that owns this
  //    process answers for itself. A feature closed since is back to none.
  const session = await readSessionFeature(targetDir, env).catch(() => null);
  if (session) {
    const status = session.feature ? normalizeSlug(map.get(session.feature)).toLowerCase() : '';
    if (session.feature && !CLOSED_STATUSES.has(status)) {
      return { slug: session.feature, source: session.chat ? 'chat' : 'session', ambiguous: false, candidates: [] };
    }
    // A live session with no feature of its own and more than one in
    // progress: the pulse may be another session's, so nothing is guessed.
    if (!session.chat && inProgress.length > 1) {
      return { slug: '', source: 'session', ambiguous: true, candidates: inProgress };
    }
  }

  // 1. project-pulse.md active_feature — the single source of truth maintained
  //    by pulse:update and reset by feature:close.
  const pulse = await readProjectPulse(targetDir);
  if (pulse && pulse.exists && !isNone(pulse.active_feature)) {
    const slug = normalizeSlug(pulse.active_feature);
    // A chat that named no feature here: the pulse is one per project, and a
    // feature another chat of this folder named in the last hours is that
    // chat's front. Handing it over is how one chat dropped its own work to
    // continue the other's — so nothing is guessed, and the holder is named.
    const holder = session && session.chat ? await chatHolding(targetDir, session.chat.key, slug) : null;
    if (holder) {
      return { slug: '', source: 'chat', ambiguous: true, candidates: inProgress, held_by_other_chat: holder };
    }
    return { slug, source: 'pulse', ambiguous: false, candidates: [] };
  }

  // 2. features.md — fall back to the unique in_progress row.
  if (inProgress.length === 1) {
    return { slug: inProgress[0], source: 'features.md', ambiguous: false, candidates: [] };
  }
  if (inProgress.length > 1) {
    // Ambiguous: more than one feature is open. The caller must disambiguate
    // (ask the user) rather than silently colliding on a guessed slug.
    return { slug: '', source: 'features.md', ambiguous: true, candidates: inProgress };
  }

  // 3. No active feature — genuine project-level work.
  return { slug: '', source: 'none', ambiguous: false, candidates: [] };
}

const SUMMARY_GOAL_HEADINGS = ['Goal', 'Objetivo', 'Objective'];

/**
 * --with-summary: the routing-relevance inputs, pre-extracted — PRD H1 title,
 * first line under ## Goal/Objetivo/Objective, and which canonical artifacts
 * exist. The workflow-relevance gate compares "is this request the same work?"
 * against title+goal without opening the PRD; a malformed PRD yields nulls, and
 * a null title means "open the PRD" — never decide on a blank field.
 */
async function buildFeatureSummary(targetDir, slug) {
  const prdRel = `prd-${slug}.md`;
  const planRel = `implementation-plan-${slug}.md`;
  const qaRel = `qa-report-${slug}.md`;
  const prd = await readFileSafe(path.join(contextDir(targetDir), prdRel));
  let title = null;
  let goal = null;
  if (prd) {
    const h1 = prd.match(/^#\s+(.+?)\s*$/m);
    title = h1 ? h1[1].trim() : null;
    for (const heading of SUMMARY_GOAL_HEADINGS) {
      const re = new RegExp(`^##\\s+${heading}\\s*\\r?\\n+\\s*([^#\\s][^\\r\\n]*)`, 'm');
      const match = prd.match(re);
      if (match) { goal = match[1].trim(); break; }
    }
  }
  const existsRel = async (rel) => Boolean(await readFileSafe(path.join(contextDir(targetDir), rel)));
  return {
    title,
    goal,
    artifact_paths: {
      prd: prd ? `.aioson/context/${prdRel}` : null,
      implementation_plan: (await existsRel(planRel)) ? `.aioson/context/${planRel}` : null,
      qa_report: (await existsRel(qaRel)) ? `.aioson/context/${qaRel}` : null
    }
  };
}

async function runFeatureCurrent({ args = [], options = {}, logger = console } = {}) {
  const targetDir = args[0] || options.dir || '.';
  const resolved = await resolveActiveFeature(targetDir);
  const payload = { ok: true, ...resolved };

  if ((options['with-summary'] || options.withSummary) && resolved.slug) {
    payload.summary = await buildFeatureSummary(targetDir, resolved.slug);
  }

  if (!options.json) {
    // Plain mode prints ONLY the slug so `$(aioson feature:current .)` is
    // directly usable in shell substitution; ambiguous/none print nothing.
    if (resolved.slug) logger.log(resolved.slug);
    // stderr: stdout stays empty for `$(aioson feature:current .)`.
    if (resolved.held_by_other_chat && typeof logger.error === 'function') {
      const holder = resolved.held_by_other_chat;
      logger.error(`project-pulse.md names ${holder.feature}, the front of ${describeChat(holder)} on this folder; this chat named none — ask which feature it continues, then name it (--feature=<slug>).`);
    }
    if (payload.summary && resolved.slug) {
      if (payload.summary.title) logger.log(`title: ${payload.summary.title}`);
      if (payload.summary.goal) logger.log(`goal: ${payload.summary.goal}`);
    }
  }
  return payload;
}

module.exports = { runFeatureCurrent, resolveActiveFeature, isNone };
