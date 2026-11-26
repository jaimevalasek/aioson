'use strict';

/**
 * The project-level `.aioson/context/dev-state.md` — the file a reader that
 * names no feature opens (and the one `context:brief` binds for a bare @dev).
 *
 * Every front of work — a tracked feature or a Simple Plan — keeps its own
 * state in `features/<slug>/dev-state.md`. The project-level file used to be a
 * copy of whichever front was written last, so with two chats on one folder it
 * named the other chat's feature and next step every time that chat wrote:
 * an @dev that loaded it after a compaction or a re-activation read someone
 * else's work as its own.
 *
 * Now it follows how many fronts are open:
 *   - one (or none) written within OPEN_THREAD_WINDOW_DAYS: the copy of the
 *     front just written, exactly as before — a project with one chat sees no
 *     change;
 *   - two or more: the INDEX of the open fronts. It names no `active_feature`,
 *     so no reader can take one front for "the" feature; each row points to
 *     the front's own file, and a chat continues its own by name.
 *
 * Written whole and renamed into place: a chat reading it while the other
 * writes never sees half a file.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { listOpenDevThreads, OPEN_THREAD_WINDOW_DAYS } = require('./dev-resume');
const { featureDevStateRel, DEV_STATE_INDEX_KIND: INDEX_KIND } = require('../preflight-engine');
const { writeAtomically } = require('./feature-registry-storage');
const MAX_NEXT_CHARS = 160;

function projectDevStatePath(targetDir) {
  return path.join(path.resolve(targetDir || '.'), '.aioson', 'context', 'dev-state.md');
}

/** True when the text is the index of open fronts (not one front's state). */
function isDevStateIndex(raw) {
  const match = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return Boolean(match) && new RegExp(`^kind:\\s*["']?${INDEX_KIND}["']?\\s*$`, 'm').test(match[1]);
}

function tableCell(text, max = MAX_NEXT_CHARS) {
  const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
  if (!flat) return '—';
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The index text for the open fronts (fresh ones in the table, stale ones named below it). */
function renderDevStateIndex(threads, today) {
  const fresh = threads.filter((thread) => !thread.stale);
  const stale = threads.filter((thread) => thread.stale);
  const rows = fresh.map((thread) => `| ${thread.feature} | ${thread.kind} | ${tableCell(thread.phase, 12)} | ${thread.last_updated || '—'} | ${tableCell(thread.next_step)} | .aioson/context/${featureDevStateRel(thread.feature)} |`);
  return [
    '---',
    `last_updated: ${today}`,
    `kind: ${INDEX_KIND}`,
    `open_fronts: ${fresh.length}`,
    '---',
    '',
    '# Dev State — open fronts',
    '',
    `${fresh.length} fronts were written in this folder within ${OPEN_THREAD_WINDOW_DAYS} days, so this file is no chat's own state: it lists them. Each front keeps its own state in the file on its row.`,
    '',
    '- Continue YOUR front by name: `aioson dev:resume-data . --feature=<slug> --json`.',
    '- A chat that does not know which front is its own asks the owner before editing. The newest row is only the last chat to write.',
    '- Another front\'s files are the other chat\'s work: never take them over, revert them or "finish" them.',
    '',
    '| Front | Kind | Phase | Updated | Next step | Own state |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    ...(stale.length > 0 ? [`Older fronts still in progress (untouched for ${OPEN_THREAD_WINDOW_DAYS}+ days): ${stale.map((thread) => thread.feature).join(', ')}.`, ''] : []),
    'Rewritten by `aioson dev:state:write` at every checkpoint; never hand-edit.',
    ''
  ].join('\n');
}

async function writeWhole(target, text) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  // The rename retries a reader holding the file on Windows; past that, one small direct write.
  await writeAtomically(target, text).catch(() => fs.writeFile(target, text, 'utf8'));
}

async function openFronts(targetDir, now) {
  const threads = await listOpenDevThreads(targetDir, { now }).catch(() => []);
  return { threads, fresh: threads.filter((thread) => !thread.stale) };
}

/**
 * Rewrites the project-level file after a front's own state was written:
 * the index while two or more fronts are open, else the copy of `writtenText`.
 *
 * @returns {Promise<{ mode: 'copy'|'index', open_fronts: string[] }>}
 */
async function writeProjectDevState(targetDir, writtenText, { now = Date.now() } = {}) {
  const { threads, fresh } = await openFronts(targetDir, now);
  const target = projectDevStatePath(targetDir);
  if (fresh.length >= 2) {
    await writeWhole(target, renderDevStateIndex(threads, new Date(now).toISOString().slice(0, 10)));
    return { mode: 'index', open_fronts: fresh.map((thread) => thread.feature) };
  }
  await writeWhole(target, writtenText);
  return { mode: 'copy', open_fronts: fresh.map((thread) => thread.feature) };
}

/**
 * After a front's own state was removed (`state:reset --feature`), an index
 * is brought up to date: still the index with two or more fronts open, the
 * copy of the one left, or removed when none is. A file that is one front's
 * state is left as it is.
 *
 * @returns {Promise<{ mode: 'kept'|'index'|'copy'|'removed', open_fronts: string[] }>}
 */
async function refreshProjectDevStateIndex(targetDir, { now = Date.now() } = {}) {
  const target = projectDevStatePath(targetDir);
  const current = await fs.readFile(target, 'utf8').catch(() => null);
  if (!isDevStateIndex(current)) return { mode: 'kept', open_fronts: [] };
  const { threads, fresh } = await openFronts(targetDir, now);
  const names = fresh.map((thread) => thread.feature);
  if (fresh.length >= 2) {
    await writeWhole(target, renderDevStateIndex(threads, new Date(now).toISOString().slice(0, 10)));
    return { mode: 'index', open_fronts: names };
  }
  if (fresh.length === 1) {
    const own = await fs.readFile(path.join(path.dirname(target), featureDevStateRel(fresh[0].feature)), 'utf8').catch(() => null);
    if (own) {
      await writeWhole(target, own);
      return { mode: 'copy', open_fronts: names };
    }
  }
  await fs.rm(target, { force: true });
  return { mode: 'removed', open_fronts: names };
}

module.exports = {
  writeProjectDevState,
  refreshProjectDevStateIndex
};
