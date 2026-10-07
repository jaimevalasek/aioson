'use strict';

/**
 * Simple Plans have no close command: the plan flips to `status: done` and
 * stayed in `context/simple-plans/` for good, with its `features/{slug}/`
 * evidence folder beside the live features. The sweep moves each finished
 * plan to `context/done/simple-plans/` — the plan, its `{slug}.*.md`
 * companions (QA report, UI spec) and that folder. The sweep then prunes
 * `done/` to documentation like any archive.
 *
 * Left in place:
 *   - plans still open (any status other than done/abandoned/dismissed);
 *   - follow-up plans (`source_feature`), which delivery-followups reads;
 *   - slugs with an open row in features.md, whose folder belongs to that
 *     feature;
 *   - plans touched in the last GRACE_DAYS days: the session that just
 *     finished one may still be committing it.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseFrontmatter } = require('../preflight-engine');
const { moveFileResilient, moveDirResilient } = require('./fs-move');

const PLANS_DIR = 'simple-plans';
const ARCHIVE_DIR = path.join('done', 'simple-plans');
const CLOSED_STATUS = /^(done|abandoned|dismissed)\b/i;
const GRACE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

async function readDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function unquote(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

/** Slugs with an open row in features.md: their plan belongs to live work. */
async function openFeatureSlugs(ctxDir) {
  let content;
  try {
    content = await fs.readFile(path.join(ctxDir, 'features.md'), 'utf8');
  } catch {
    return new Set();
  }
  const slugs = new Set();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|\s*([a-z_]+)\s*\|/i);
    if (m && m[1].toLowerCase() !== 'slug' && !CLOSED_STATUS.test(m[2])) slugs.add(m[1].toLowerCase());
  }
  return slugs;
}

/**
 * The plan's fields: YAML frontmatter, or — in older plans written without
 * one — the `key: value` lines (also `- **key:** value`) between the title
 * and the first section.
 */
function planFields(content) {
  const meta = parseFrontmatter(content);
  if (meta.status) return meta;
  const fields = {};
  for (const line of content.split(/\r?\n/).slice(0, 20)) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^(?:[-*]\s+)?(?:\*\*)?([A-Za-z_]+)(?:\*\*)?:(?:\*\*)?\s*(.+)$/);
    if (m && !(m[1].toLowerCase() in fields)) fields[m[1].toLowerCase()] = m[2];
  }
  return fields;
}

async function lastTouched(file, meta) {
  const stamp = Date.parse(unquote(meta.updated_at || meta.updated || meta.created_at || meta.created));
  if (Number.isFinite(stamp)) return stamp;
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return Date.now();
  }
}

/**
 * The finished plans the sweep would archive.
 * @returns {Promise<Array<{slug:string, status:string, files:string[], folder:boolean}>>}
 */
async function listFinishedSimplePlans(ctxDir, { now = Date.now() } = {}) {
  const plansDir = path.join(ctxDir, PLANS_DIR);
  const names = (await readDirSafe(plansDir)).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  const open = await openFeatureSlugs(ctxDir);
  const finished = [];
  for (const name of names) {
    if (name.slice(0, -3).includes('.')) continue; // a companion, handled with its plan
    const slug = name.slice(0, -3);
    const file = path.join(plansDir, name);
    let meta;
    try {
      // eslint-disable-next-line no-await-in-loop
      meta = planFields(await fs.readFile(file, 'utf8'));
    } catch {
      continue;
    }
    const status = unquote(meta.status);
    if (!CLOSED_STATUS.test(status)) continue;
    if (meta.source_feature) continue;
    if (open.has(slug)) continue;
    // eslint-disable-next-line no-await-in-loop
    if (now - (await lastTouched(file, meta)) < GRACE_DAYS * DAY_MS) continue;
    const files = names.filter((n) => n === name || n.startsWith(`${slug}.`));
    // eslint-disable-next-line no-await-in-loop
    const folder = await exists(path.join(ctxDir, 'features', slug));
    finished.push({ slug, status, files, folder });
  }
  return finished;
}

async function sameContent(a, b) {
  try {
    const [x, y] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    return x.equals(y);
  } catch {
    return false;
  }
}

/**
 * Move finished Simple Plans to done/simple-plans/. A plan already archived
 * with the same content is removed from the live folder; with different
 * content it is a conflict, never overwritten.
 * @returns {Promise<{archived: Array<{slug:string, files:number, folder:boolean}>, failed: Array<{slug:string, reason:string}>}>}
 */
async function archiveFinishedSimplePlans(ctxDir, { now } = {}) {
  const archiveDir = path.join(ctxDir, ARCHIVE_DIR);
  const archived = [];
  const failed = [];
  for (const plan of await listFinishedSimplePlans(ctxDir, { now })) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.mkdir(archiveDir, { recursive: true });
      for (const name of plan.files) {
        const from = path.join(ctxDir, PLANS_DIR, name);
        const to = path.join(archiveDir, name);
        // eslint-disable-next-line no-await-in-loop
        if (await exists(to)) {
          // eslint-disable-next-line no-await-in-loop
          if (!(await sameContent(from, to))) throw new Error(`archive_merge_conflict: ${ARCHIVE_DIR}/${name} differs`);
          // eslint-disable-next-line no-await-in-loop
          await fs.rm(from, { force: true });
        } else {
          // eslint-disable-next-line no-await-in-loop
          await moveFileResilient(from, to);
        }
      }
      if (plan.folder) {
        const to = path.join(archiveDir, plan.slug);
        // eslint-disable-next-line no-await-in-loop
        if (await exists(to)) throw new Error(`archive_merge_conflict: ${ARCHIVE_DIR}/${plan.slug}/ exists`);
        // eslint-disable-next-line no-await-in-loop
        await moveDirResilient(path.join(ctxDir, 'features', plan.slug), to);
      }
      archived.push({ slug: plan.slug, files: plan.files.length, folder: plan.folder });
    } catch (error) {
      failed.push({ slug: plan.slug, reason: error.message || String(error) });
    }
  }
  return { archived, failed };
}

module.exports = { listFinishedSimplePlans, archiveFinishedSimplePlans, GRACE_DAYS };
