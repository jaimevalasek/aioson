'use strict';

/**
 * operator-memory — the store's daily upkeep, run by the write path.
 *
 * A proposal is a signal seen once, waiting for its repeat. One that waited
 * longer than PROPOSAL_TTL_DAYS was a moment, not a habit: it moves to
 * history/ (recoverable there for a year, like a forgotten decision), so the
 * queue every capture compares against stays the live one. Then history/
 * entries older than a year go, and the index is rewritten so the archive
 * tier (archive.js) holds what aged since the last write. At most once a day:
 * the state file remembers the last sweep. Decisions are never deleted here.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot } = require('./storage');
const { parseProposalFrontmatter, deleteProposal } = require('./proposal');
const { historyPath } = require('./decision');
const { isValidDecisionSlug } = require('./slug');

const PROPOSAL_TTL_DAYS = 90;
const HISTORY_MAX_AGE_DAYS = 365;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATE_FILE = '_housekeeping.json';

function readState(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8')); } catch { return {}; }
}

function writeState(root, state) {
  const file = path.join(root, STATE_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Proposals not detected again within the TTL move to history/; their slugs.
 * Only the generation judged old leaves: the file is read again right before
 * it goes, and one a capture renewed in between stays (op:capture also holds
 * the store lock around the sweep, store-lock.js). What history/ keeps is the
 * text that was judged.
 */
function expireProposals(identity, now = Date.now(), ttlDays = PROPOSAL_TTL_DAYS) {
  const dir = path.join(getStorageRoot(identity), 'proposals');
  if (!fs.existsSync(dir)) return [];
  const expired = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.slice(0, -3);
    if (!isValidDecisionSlug(slug)) continue;
    const full = path.join(dir, file);
    let judged;
    let proposal;
    try {
      judged = fs.readFileSync(full, 'utf8');
      proposal = parseProposalFrontmatter(judged.replace(/\r\n/g, '\n'));
    } catch { continue; }
    const seen = new Date((proposal && (proposal.last_detected || proposal.first_detected)) || 0).getTime();
    if (!seen || now - seen < ttlDays * DAY_MS) continue;
    try {
      if (fs.readFileSync(full, 'utf8') !== judged) continue;
      fs.mkdirSync(path.join(getStorageRoot(identity), 'history'), { recursive: true });
      fs.writeFileSync(historyPath(identity, slug, new Date(now).toISOString()), judged, 'utf8');
      deleteProposal(identity, slug);
      expired.push(slug);
    } catch { /* one unreadable proposal never stops the sweep */ }
  }
  return expired;
}

/**
 * The daily sweep; null when one already ran within the interval (unless
 * `force`). Best-effort by contract: the capture that triggers it never fails
 * because of it.
 */
function sweepStore(identity, { now = Date.now(), force = false } = {}) {
  const root = getStorageRoot(identity);
  if (!fs.existsSync(root)) return null;
  const state = readState(root);
  const last = new Date(state.last_sweep || 0).getTime();
  if (!force && last && now - last < SWEEP_INTERVAL_MS) return null;
  const expired = expireProposals(identity, now);
  const { cleanupHistory } = require('./decay');
  const removed = cleanupHistory(identity, { maxAgeDays: HISTORY_MAX_AGE_DAYS, now });
  try { require('./index-md').regenerateIndex(identity, now); } catch { /* the index is regenerable */ }
  writeState(root, { ...state, last_sweep: new Date(now).toISOString() });
  return { expired, history_removed: removed.length };
}

module.exports = { sweepStore, expireProposals, PROPOSAL_TTL_DAYS, HISTORY_MAX_AGE_DAYS, STATE_FILE };
