'use strict';

/**
 * Where an improvement noticed while building goes once the owner decides.
 *
 * The hub (`observe`) keeps what an agent saw beside its work; this module
 * turns the owner's answer into the artifact the next agent reads, then
 * settles the observation against it — one step, never an outcome recorded
 * against nothing:
 *
 *   feature      → a row in `features/{slug}/scope-additions.md`; the PRD owns
 *                  scope, so @product amends it citing the OBS id and only
 *                  then does @dev build it (`pendingScopeAdditions` measures
 *                  which approved rows no PRD cites yet).
 *   simple-plan  → `simple-plans/{slug}.md` seeded `status: pending`, the lane
 *                  @dev already runs for bounded technical work.
 *   draft        → a `planning` row in features.md plus the feature-owned
 *                  source pack `plans/{slug}/idea.md` that @briefing reads.
 *
 * Advisory: nothing here creates scope by itself or satisfies a gate.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { listObservations, resolveObservation, refExists, closedFeatures, validateFeature } = require('./observations');
const { writeFeatureRow, today } = require('./feature-registry');
const { safeWrite } = require('./delivery-followups');
const { parseFrontmatter } = require('../preflight-engine');

const ROUTES = ['feature', 'simple-plan', 'draft'];
// A question needs an answer, a process gap becomes a rule or a learning:
// neither is work to schedule.
const ROUTABLE_KINDS = ['idea', 'defect', 'risk'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_WORDS = 5;
const SLUG_MAX = 48;
// Connectors that make a slug read like a cut sentence (pt-BR, en, es).
const SLUG_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos', 'em', 'um', 'uma', 'ao', 'as', 'os', 'com', 'sem', 'para', 'por', 'que', 'se',
  'the', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'with', 'without', 'is', 'it',
  'el', 'la', 'los', 'las', 'del', 'en', 'con', 'sin', 'para', 'por', 'una', 'un'
]);
const LIST_LIMIT = 5;

const ROUTE_HINT = {
  feature: 'add it to the feature being built (the PRD is amended, then it is built)',
  'simple-plan': 'a bounded technical plan @dev runs on its own',
  draft: 'a draft of a future feature that @briefing scopes later'
};

function fileOf(slug) {
  return `.aioson/context/features/${slug}/scope-additions.md`;
}

/**
 * `Listagem sem modal de detalhes: abrir o pedido` → `listagem-modal-detalhes`
 * (the first clause, accent-free, connectors dropped, bounded).
 */
function slugFromSummary(summary, id) {
  const clause = String(summary || '').split(/[:;.—–]| - /)[0];
  const words = (clause.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((word) => !SLUG_STOPWORDS.has(word));
  const slug = words.slice(0, SLUG_WORDS).join('-').slice(0, SLUG_MAX).replace(/-+$/, '');
  return slug.length >= 3 ? slug : `improvement-${String(id).replace(/^OBS-/i, '')}`;
}

function idSuffix(id) {
  return String(id).replace(/^OBS-/i, '').toLowerCase();
}

async function readText(absolute) {
  try { return await fs.readFile(absolute, 'utf8'); } catch { return ''; }
}

function cell(text) {
  return String(text == null ? '' : text).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}

async function findItem(targetDir, id) {
  const wanted = String(id || '').trim();
  if (!/^OBS-[0-9a-f]{6,}$/i.test(wanted)) throw new Error('--id=OBS-xxxxxx is required (aioson observation:list .)');
  const { items, error } = await listObservations(targetDir, { status: 'all' });
  if (error) throw new Error(`the observations store is unreadable (${error})`);
  const item = items.find((entry) => entry.id.toLowerCase() === wanted.toLowerCase());
  if (!item) throw new Error(`${wanted} is not on record (aioson observation:list . --all)`);
  if (item.status !== 'open') {
    const r = item.resolution || {};
    throw new Error(`${item.id} is already settled (${r.as || item.status}${r.ref ? ` ${r.ref}` : ''}) — record it again with --reopen only for new evidence`);
  }
  if (!ROUTABLE_KINDS.includes(item.kind)) {
    throw new Error(`${item.id} is a ${item.kind}: ${item.kind === 'question' ? 'answer it with observation:resolve --as=answered --why=…' : 'turn it into a rule, a learning or an operator decision, or dismiss it'}`);
  }
  return item;
}

async function ownedBy(targetDir, relative, id) {
  const text = await readText(path.join(targetDir, relative));
  if (!text) return { exists: false, same: false };
  return { exists: true, same: String(parseFrontmatter(text).source_observation || '').toLowerCase() === id.toLowerCase() };
}

/** A free file name for this observation: explicit slugs never move, derived ones add the id on a clash. */
async function freeSlug(targetDir, item, { explicit, relativeOf, taken }) {
  const base = explicit || slugFromSummary(item.summary, item.id);
  if (!SLUG.test(base)) throw new Error(`--slug=${base} must be kebab-case (letters, digits, hyphens)`);
  // The cut may land on a hyphen: `…-` + `-id` would be a slug no reader accepts.
  const candidates = explicit ? [base] : [base, `${base.slice(0, SLUG_MAX - 7).replace(/-+$/, '')}-${idSuffix(item.id)}`];
  for (const slug of candidates) {
    const owner = await ownedBy(targetDir, relativeOf(slug), item.id);
    if (owner.same) return { slug, reuse: true };
    if (!owner.exists && !(await taken(slug))) return { slug, reuse: false };
  }
  throw new Error(`${explicit ? `--slug=${base}` : base} is already taken by something else — pass another --slug=<kebab-case>`);
}

function originLine(item) {
  const where = item.feature ? `noticed while building \`${item.feature}\`` : 'noticed beside the work';
  return `${where}${item.agent ? ` by @${item.agent}` : ''} (${item.id}, seen ${item.seen}×)`;
}

function bulletPaths(item) {
  return (item.paths || []).map((entry) => `- ${entry}`).join('\n') || '- (none recorded — find them from the nearest existing pattern)';
}

async function routeSimplePlan(targetDir, item, { slug: explicit }) {
  const relativeOf = (slug) => `.aioson/context/simple-plans/${slug}.md`;
  // A plan named like a feature would share that feature's dev-state
  // (`features/{slug}/dev-state.md`) and read as its thread: the name is taken.
  const registered = async (slug) => (await refExists(targetDir, slug)).ok;
  const { slug, reuse } = await freeSlug(targetDir, item, { explicit, relativeOf, taken: registered });
  const relative = relativeOf(slug);
  if (!reuse) {
    const date = today();
    const body = `---
slug: ${slug}
status: pending
owner: dev
created_at: ${date}
updated_at: ${date}
source: observation
source_observation: ${item.id}${item.feature ? `\nsource_feature: ${item.feature}` : ''}
---

# Simple Plan — ${cell(item.summary)}

## Scope
${item.summary}${item.detail ? `\n\n${item.detail}` : ''}

Origin: ${originLine(item)}; the owner chose a Simple Plan.

## Done criteria
- [Write the observable behavior before editing — the plan is a seed, not a decision.]

## Expected files
${bulletPaths(item)}

## Verification
- [The smallest command that proves the changed behavior.]

## Session state
Next step: complete the implementation intelligence checkpoint of \`.aioson/docs/dev/simple-plan-lane.md\`, set \`status: in_progress\`, then build the smallest useful slice.
`;
    await safeWrite(targetDir, relative, body, { exclusive: true });
  }
  return {
    ref: relative, slug, created: !reuse, resolveAs: 'planned',
    next: `@dev runs the Simple Plan lane on ${relative} (complete its checkpoint first).`
  };
}

async function routeDraft(targetDir, item, { slug: explicit }) {
  const relativeOf = (slug) => `plans/${slug}/idea.md`;
  const registered = async (slug) => (await refExists(targetDir, slug)).ok;
  const { slug, reuse } = await freeSlug(targetDir, item, { explicit, relativeOf, taken: registered });
  const relative = relativeOf(slug);
  if (!reuse) {
    const body = `---
source_observation: ${item.id}${item.feature ? `\nsource_feature: ${item.feature}` : ''}
created_at: ${today()}
---

# ${cell(item.summary)}

## What was noticed
${item.summary}${item.detail ? `\n\n${item.detail}` : ''}

Origin: ${originLine(item)}.

## Where it showed up
${bulletPaths(item)}

## Why it is a draft
Outside the approved scope of the feature it was noticed in. \`@briefing\` turns this pack into a briefing (\`aioson briefing:sources . --slug=${slug}\`) before any PRD; nothing here is approved scope.
`;
    await safeWrite(targetDir, relative, body, { exclusive: true });
  }
  // Outside the `reuse` branch: a run that wrote the pack and failed on the
  // registry must be able to finish on the next one — the item settles against
  // the row, so a pack without it would refuse every retry.
  if (!(await registered(slug))) {
    await writeFeatureRow(targetDir, { slug, status: 'planning', completed: '—' }, { resolveStarted: (existing) => (existing && existing.started) || today() });
  }
  return {
    ref: slug, slug, created: !reuse, resolveAs: 'promoted', artifact: relative,
    next: `features.md lists ${slug} as planning; run @briefing on plans/${slug}/ when you decide to scope it.`
  };
}

async function routeFeature(targetDir, item, { feature }) {
  const slug = feature || item.feature;
  if (!slug) throw new Error(`${item.id} is bound to no feature — pass --feature=<slug> or choose --to=simple-plan / --to=draft`);
  try { validateFeature(slug); } catch (error) { throw new Error(`--feature: ${error.message}`, { cause: error }); }
  if (!(await refExists(targetDir, slug)).ok) throw new Error(`${slug} is not a feature this project knows (aioson feature:current .)`);
  if ((await closedFeatures(targetDir)).has(slug)) throw new Error(`${slug} is already closed — choose --to=simple-plan or --to=draft`);
  const relative = fileOf(slug);
  const absolute = path.join(targetDir, relative);
  const current = await readText(absolute);
  const known = current.toLowerCase().includes(`| ${item.id.toLowerCase()} |`);
  if (!known) {
    const header = `# Scope additions — ${slug}

Improvements noticed while the feature was built that the owner approved to join it. The PRD owns scope: \`@product\` amends \`prd-${slug}.md\` citing the OBS id on the capability it adds, \`@planner\` sequences it, and only then does \`@dev\` build it. This file alone is never authority to implement.

| OBS | Improvement | Paths | Approved |
|---|---|---|---|
`;
    const row = `| ${item.id} | ${cell(item.summary)} | ${cell((item.paths || []).join(', ')) || '—'} | ${today()} by owner |\n`;
    await safeWrite(targetDir, relative, (current || header) + (current && !current.endsWith('\n') ? '\n' : '') + row);
  }
  return {
    ref: relative, slug, created: !known, resolveAs: 'promoted',
    next: `@product amends prd-${slug}.md citing ${item.id}; @planner sequences it; @dev builds it only after the PRD carries it.`
  };
}

const HANDLERS = { 'simple-plan': routeSimplePlan, draft: routeDraft, feature: routeFeature };

/**
 * One Agent Trail line in the dossier of the feature the idea belongs to, so
 * the agents that read the dossier at session start see what the owner
 * decided. Best effort like every dossier write: after the item is settled,
 * never able to undo it, and the same line twice is a no-op (hash).
 */
async function noteInDossier(targetDir, feature, item, { route, ref, by }) {
  if (!feature) return 'skipped';
  try {
    const { isCanonicalAgent } = require('../dossier/schema');
    const agent = [by, item.agent, 'dev'].find((name) => name && isCanonicalAgent(String(name)));
    const tail = route === 'feature' ? ' (not scope until the PRD cites it)' : '';
    const { runDossierAddFinding } = require('../commands/dossier');
    const result = await runDossierAddFinding({
      args: [targetDir],
      options: { slug: feature, agent, section: 'Agent Trail', json: true, content: `Improvement ${item.id} "${cell(item.summary)}" routed to ${route}: ${ref}${tail}` }
    });
    if (!result.ok) return 'skipped';
    return result.added ? 'added' : 'existing';
  } catch {
    return 'skipped';
  }
}

/**
 * Route one open observation: write the destination, then settle the item
 * against it. Safe to run again — the same observation reuses its artifact.
 */
async function routeObservation(targetDir, { id, to, slug, feature, by } = {}, { now } = {}) {
  const route = String(to || '').trim().toLowerCase();
  if (!ROUTES.includes(route)) throw new Error(`--to=<${ROUTES.join('|')}> is required — ${ROUTES.map((name) => `${name}: ${ROUTE_HINT[name]}`).join('; ')}`);
  const item = await findItem(targetDir, id);
  const done = await HANDLERS[route](targetDir, item, { slug: slug ? String(slug).trim().toLowerCase() : null, feature: feature ? String(feature).trim().toLowerCase() : null });
  const settled = await resolveObservation(targetDir, { id: item.id, as: done.resolveAs, ref: done.ref, by }, { now });
  const dossier = await noteInDossier(targetDir, route === 'feature' ? done.slug : item.feature, item, { route, ref: done.artifact || done.ref, by });
  return { ok: true, id: item.id, kind: item.kind, route, as: done.resolveAs, ref: done.ref, slug: done.slug, artifact: done.artifact || done.ref, created: done.created, next: done.next, dossier, item: settled.item };
}

/**
 * Ideas still open that this feature's work put on record — what @dev relays
 * to the owner at the end of the task. Bounded; `total` carries the rest.
 */
async function improvementsFor(targetDir, feature, { limit = LIST_LIMIT } = {}) {
  const slug = String(feature || '').trim().toLowerCase();
  if (!slug) return { items: [], total: 0 };
  const { items } = await listObservations(targetDir, { status: 'open', kind: 'idea', feature: slug });
  const own = items.filter((item) => item.feature === slug);
  return {
    items: own.slice(0, limit).map((item) => ({ id: item.id, summary: item.summary, paths: item.paths || [], agent: item.agent || null })),
    total: own.length
  };
}

/** Approved scope additions of a feature that no PRD line cites yet. */
async function pendingScopeAdditions(targetDir, feature) {
  const slug = String(feature || '').trim().toLowerCase();
  if (!SLUG.test(slug)) return [];
  const rows = (await readText(path.join(targetDir, fileOf(slug)))).match(/^\|\s*(OBS-[0-9a-f]{6,})\s*\|(.*)$/gim) || [];
  if (rows.length === 0) return [];
  const prd = (await readText(path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`))).toLowerCase();
  return rows
    .map((row) => ({ id: row.match(/OBS-[0-9a-f]+/i)[0], summary: (row.split('|')[2] || '').trim() }))
    .filter((entry) => !prd.includes(entry.id.toLowerCase()));
}

function improvementLines(improvements, feature, pending = []) {
  const lines = [];
  if (improvements && improvements.items && improvements.items.length > 0) {
    const more = improvements.total > improvements.items.length ? [`  - +${improvements.total - improvements.items.length} more — aioson observation:list . --kind=idea`] : [];
    lines.push(
      `[Improvements] ${improvements.total} idea(s) noticed while @dev built ${feature} — relay each to the owner and ask where it goes; never build one in passing:`,
      ...improvements.items.map((item) => `  - ${item.id} ${item.summary}${item.paths.length > 0 ? ` (${item.paths.slice(0, 3).join(', ')})` : ''}`),
      ...more,
      '  route: aioson observation:route . --id=<OBS> --to=feature|simple-plan|draft   (feature = amend this feature · simple-plan = bounded plan for @dev · draft = future feature seed)',
      '  not wanted: aioson observation:resolve . --id=<OBS> --as=dismissed --why="<reason>"'
    );
  }
  if (pending.length > 0) {
    lines.push(`[Scope additions] ${pending.length} approved for ${feature}, not cited by its PRD yet — @product amends it before @dev builds: ${pending.map((entry) => entry.id).join(', ')}`);
  }
  return lines;
}

/**
 * What the completing @dev stage adds to its handoff payload — empty when
 * nothing was noticed. @dev completes through `workflow:next --complete=dev`
 * (agent:done never auto-advances it), so that is the one place it prints.
 */
async function improvementFields(targetDir, feature) {
  const improvements = await improvementsFor(targetDir, feature);
  const pending = await pendingScopeAdditions(targetDir, feature);
  if (improvements.items.length === 0 && pending.length === 0) return {};
  return { improvements_feature: feature, improvements, scope_additions_pending: pending };
}

function printImprovements(logger, payload) {
  if (!payload || !payload.improvements_feature) return;
  for (const line of improvementLines(payload.improvements, payload.improvements_feature, payload.scope_additions_pending)) logger.log(line);
}

module.exports = {
  ROUTES, ROUTABLE_KINDS, routeObservation, improvementsFor, pendingScopeAdditions, improvementLines, improvementFields, printImprovements,
  slugFromSummary, scopeAdditionsPath: fileOf
};
