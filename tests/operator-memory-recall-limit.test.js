'use strict';

/**
 * The session-start recall — `op:list --json --titles-only`, which every agent
 * runs at activation — is the head of the operator store, not all of it. A
 * store kept for months held 522 decisions (126 KB, ~32k tokens) and every
 * activation paid for all of them. The head is ranked: this project's
 * decisions first, then the decay model's own freshness; what it leaves out is
 * counted and reachable by --match.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-recall-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

const { serializeDecision, decisionPath, readDecision } = require('../src/operator-memory/decision');
const { ensureStorageTree } = require('../src/operator-memory/storage');
const { regenerateIndex } = require('../src/operator-memory/index-md');
const { writeProposal } = require('../src/operator-memory/proposal');
const { createTranslator } = require('../src/i18n');
const { runOpCapture } = require('../src/commands/op-capture');
const { runOpList, DEFAULT_RECALL_LIMIT } = require('../src/commands/op-list');

const DAY_MS = 24 * 60 * 60 * 1000;

function silent() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

// One operator store per test: the identity override names it.
function useIdentity(identity) {
  process.env.AIOSON_OPERATOR_ID = identity;
  ensureStorageTree(identity);
  return identity;
}

function seed(identity, slug, { daysAgo = 0, category = 'default', reinforced = 0, body = `decision ${slug}`, signal = 'authorization', feature = null } = {}) {
  const at = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  fs.writeFileSync(decisionPath(identity, slug), serializeDecision({
    slug, signal_type: signal, promoted_at: at, last_reinforced: at, reinforcement_count: reinforced,
    category, source_agent: 'dev', quotes: ['q'], body, title: body, feature_slug: feature
  }));
}

function makeCheckout(name, remote) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aioson-recall-${name}-`));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n`);
  return dir;
}

async function inDir(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

const list = (options, dir = TEST_HOME) => inDir(dir, () => runOpList({ args: [], options: { json: true, ...options }, logger: silent() }));
const slugs = (result) => result.items.map((item) => item.slug);

test('the session-start recall lists the decisions ranked first and counts the rest', async () => {
  const identity = useIdentity('recall-cap-bot');
  for (let i = 0; i < DEFAULT_RECALL_LIMIT + 5; i += 1) seed(identity, `decision-${String(i).padStart(2, '0')}`, { daysAgo: i });
  regenerateIndex(identity);

  const recall = await list({ 'titles-only': true });
  assert.equal(recall.count, DEFAULT_RECALL_LIMIT);
  assert.equal(recall.total, DEFAULT_RECALL_LIMIT + 5);
  assert.equal(recall.omitted, 5);
  assert.match(recall.more, /5 more decision\(s\).*--match="<task words>".*--limit=0/);
  assert.deepEqual(slugs(recall).slice(0, 3), ['decision-00', 'decision-01', 'decision-02'], 'freshest first');
  assert.ok(!slugs(recall).includes('decision-44'), 'the oldest are the ones left out');

  const all = await list({ 'titles-only': true, limit: '0' });
  assert.equal(all.count, DEFAULT_RECALL_LIMIT + 5);
  assert.equal(all.omitted, undefined, 'nothing left out, nothing to announce');

  const full = await list({});
  assert.equal(full.count, DEFAULT_RECALL_LIMIT + 5, 'only the recall shape has a default head');

  const refused = await list({ 'titles-only': true, limit: '-3' });
  assert.equal(refused.ok, false, 'the CLI exits 1 on ok:false');
  assert.equal(refused.error, 'limit_invalid');
  assert.match(refused.message, /--limit must be a whole number/);
});

test('--limit with no value, a fraction or a negative number is a usage error in every shape', async () => {
  useIdentity('recall-limit-usage-bot');
  for (const limit of [true, '', '1.5', '-1']) {
    const json = await list({ 'titles-only': true, limit });
    assert.deepEqual([json.ok, json.error], [false, 'limit_invalid'], JSON.stringify(limit));
    const errors = [];
    const text = await inDir(TEST_HOME, () => runOpList({ args: [], options: { 'titles-only': true, limit }, logger: { log() {}, error: (line) => errors.push(line), warn() {} } }));
    assert.equal(text.exitCode, 1, JSON.stringify(limit));
    assert.equal(errors.length, 1, 'one line');
  }
  const cli = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'aioson.js'), 'op:list', '--json', '--titles-only', '--limit'], { cwd: TEST_HOME, env: process.env, encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).error, 'limit_invalid');
});

test('the recall ranks by the decay model: reinforcements and a long half-life outrank a fresh one-off', async () => {
  const identity = useIdentity('recall-rank-bot');
  seed(identity, 'default-four-months', { daysAgo: 120 }); // 0.5^(120/90) = 0.40
  seed(identity, 'identity-four-months', { daysAgo: 120, category: 'identity' }); // 0.5^(120/365) = 0.80
  seed(identity, 'one-off-yesterday', { daysAgo: 1 }); // 0.5^(1/90) = 0.99
  seed(identity, 'reinforced-two-months', { daysAgo: 60, reinforced: 2 }); // 3 × 0.5^(60/90) = 1.89
  regenerateIndex(identity);

  const recall = await list({ 'titles-only': true });
  assert.deepEqual(slugs(recall), ['reinforced-two-months', 'one-off-yesterday', 'identity-four-months', 'default-four-months']);
  const head = await list({ 'titles-only': true, limit: '2' });
  assert.deepEqual(slugs(head), ['reinforced-two-months', 'one-off-yesterday']);
  assert.equal(head.omitted, 2);
});

test('a decision said in this project heads the recall, however old', async () => {
  const identity = useIdentity('recall-project-bot');
  const api = makeCheckout('api', 'https://github.com/acme/recall-api.git');
  const captured = await inDir(api, () => runOpCapture({
    args: [], options: { json: true, 'source-agent': 'dev', signal: 'correction', quote: 'aqui use pnpm', proposal: 'usar pnpm neste repositorio' }, logger: silent()
  }));
  assert.equal(captured.scope, 'project');
  const old = new Date(Date.now() - 400 * DAY_MS).toISOString();
  const decision = readDecision(identity, captured.slug);
  fs.writeFileSync(decisionPath(identity, captured.slug), serializeDecision({ ...decision, slug: captured.slug, promoted_at: old, last_reinforced: old }));
  for (let i = 0; i < DEFAULT_RECALL_LIMIT; i += 1) seed(identity, `fresh-${String(i).padStart(2, '0')}`, { daysAgo: 0 });
  regenerateIndex(identity);

  const recall = await list({ 'titles-only': true }, api);
  assert.equal(slugs(recall)[0], captured.slug);
  assert.equal(recall.items[0].scope, 'project');
  assert.equal(recall.omitted, 1, 'one fresh unscoped decision gave way');
});

test('--match finds a decision the head leaves out, ranked by the words it shares', async () => {
  const identity = useIdentity('recall-match-bot');
  for (let i = 0; i < DEFAULT_RECALL_LIMIT + 5; i += 1) seed(identity, `filler-${String(i).padStart(2, '0')}`, { daysAgo: i, body: `rotina generica numero ${i}` });
  seed(identity, 'old-deploy-rule', { daysAgo: 400, body: 'Deploy only through the Dokploy panel, never over ssh' });
  regenerateIndex(identity);

  assert.ok(!slugs(await list({ 'titles-only': true })).includes('old-deploy-rule'), 'out of the head');
  const found = await list({ 'titles-only': true, match: 'how do I deploy with dokploy' });
  assert.deepEqual(slugs(found), ['old-deploy-rule']);
  assert.equal(found.total, 1);
  assert.equal(found.omitted, 0, 'a head applied: total and omitted always come with it');
  assert.equal(found.match_ignored, undefined);
});

// ─── 2026-10-20 review: what the head keeps ───

test('prohibitions head the recall: sixty fresh permissions never push an exclusion or a correction out', async () => {
  const identity = useIdentity('recall-prohibitive-bot');
  for (let i = 0; i < 60; i += 1) seed(identity, `allow-${String(i).padStart(2, '0')}`, { daysAgo: 0, reinforced: 2 });
  for (let i = 0; i < 5; i += 1) seed(identity, `never-${i}`, { daysAgo: 80 + i, signal: 'exclusion' });
  for (let i = 0; i < 5; i += 1) seed(identity, `fix-${i}`, { daysAgo: 60 + i, signal: 'correction' });
  regenerateIndex(identity);

  const recall = await list({ 'titles-only': true });
  assert.equal(recall.count, DEFAULT_RECALL_LIMIT);
  assert.equal(recall.total, 70);
  assert.equal(recall.omitted, 30);
  const head = slugs(recall);
  assert.deepEqual(head.slice(0, 10).map((slug) => slug.split('-')[0]).sort(), ['fix', 'fix', 'fix', 'fix', 'fix', 'never', 'never', 'never', 'never', 'never']);
  assert.ok(head.slice(10).every((slug) => slug.startsWith('allow-')), 'permissions follow');
});

test('a head always reports total and omitted, 0 when nothing is left out', async () => {
  const identity = useIdentity('recall-exact-bot');
  for (let i = 0; i < DEFAULT_RECALL_LIMIT; i += 1) seed(identity, `exact-${String(i).padStart(2, '0')}`, { daysAgo: i });
  regenerateIndex(identity);
  const recall = await list({ 'titles-only': true });
  assert.equal(recall.count, DEFAULT_RECALL_LIMIT);
  assert.equal(recall.total, DEFAULT_RECALL_LIMIT);
  assert.equal(recall.omitted, 0);
  assert.equal(recall.more, undefined);
});

test('--match reads two-letter task words and reports a query with no usable word', async () => {
  const identity = useIdentity('recall-short-words-bot');
  seed(identity, 'pr-review', { body: 'Abra um PR e peça review no CI' });
  seed(identity, 'ui-kit', { body: 'Use o kit de UI da casa' });
  for (let i = 0; i < 5; i += 1) seed(identity, `filler-${i}`, { body: `rotina generica numero ${i}` });
  regenerateIndex(identity);

  assert.deepEqual(slugs(await list({ 'titles-only': true, match: 'CI PR' })), ['pr-review']);
  assert.deepEqual(slugs(await list({ 'titles-only': true, match: 'ui' })), ['ui-kit']);
  const ignored = await list({ 'titles-only': true, match: 'às' });
  assert.equal(ignored.match_ignored, true);
  assert.equal(ignored.count, 7, 'the normal head, unfiltered');
  assert.equal(ignored.omitted, 0);

  const lines = [];
  await inDir(TEST_HOME, () => runOpList({ args: [], options: { 'titles-only': true, match: 'às' }, logger: { log: (line) => lines.push(line), error() {}, warn() {} } }));
  assert.equal(lines[0], createTranslator('en').t('cli.operator_memory.match_ignored', { match: 'às' }), 'one line says the filter was not applied');
});

test('--all keeps "this project\'s" for decisions said here, not for every scoped one', async () => {
  const identity = useIdentity('recall-all-bot');
  const here = makeCheckout('all-here', 'https://github.com/acme/recall-all-here.git');
  const other = makeCheckout('all-other', 'https://github.com/acme/recall-all-other.git');
  const captured = await inDir(other, () => runOpCapture({
    args: [], options: { json: true, 'source-agent': 'dev', signal: 'authorization', quote: 'aqui pode usar yarn', proposal: 'usar yarn no outro repositorio' }, logger: silent()
  }));
  assert.equal(captured.scope, 'project');
  const old = new Date(Date.now() - 300 * DAY_MS).toISOString();
  const decision = readDecision(identity, captured.slug);
  fs.writeFileSync(decisionPath(identity, captured.slug), serializeDecision({ ...decision, slug: captured.slug, promoted_at: old, last_reinforced: old }));
  for (let i = 0; i < DEFAULT_RECALL_LIMIT; i += 1) seed(identity, `fresh-all-${String(i).padStart(2, '0')}`, { daysAgo: 0 });
  regenerateIndex(identity);

  const fromHere = await list({ 'titles-only': true, all: true }, here);
  assert.ok(!slugs(fromHere).includes(captured.slug), 'a 300-day-old decision of another project is not this project\'s');
  assert.equal(fromHere.total, DEFAULT_RECALL_LIMIT + 1);
  assert.equal(fromHere.omitted, 1);
  const fromOther = await list({ 'titles-only': true, all: true }, other);
  assert.equal(slugs(fromOther)[0], captured.slug, 'where it was said, it heads the recall');
});

test('the default head is the activation recall only; an explicit --limit applies to every shape, with its counts', async () => {
  const identity = useIdentity('recall-shapes-bot');
  for (let i = 0; i < DEFAULT_RECALL_LIMIT + 7; i += 1) seed(identity, `feat-${String(i).padStart(2, '0')}`, { daysAgo: i, feature: 'checkout' });
  regenerateIndex(identity);
  const feature = await list({ 'titles-only': true, feature: 'checkout' });
  assert.equal(feature.decisions.length, DEFAULT_RECALL_LIMIT + 7, 'a feature\'s record is listed whole');
  assert.equal(feature.total, DEFAULT_RECALL_LIMIT + 7);
  assert.equal(feature.omitted, undefined);
  const limited = await list({ 'titles-only': true, feature: 'checkout', limit: '5' });
  assert.equal(limited.decisions.length, 5);
  assert.equal(limited.total, DEFAULT_RECALL_LIMIT + 7);
  assert.equal(limited.omitted, DEFAULT_RECALL_LIMIT + 2);

  const now = Date.now();
  for (const [slug, daysAgo] of [['a-oldest', 2], ['b-middle', 1], ['c-newest', 0]]) {
    const at = new Date(now - daysAgo * DAY_MS).toISOString();
    writeProposal(identity, { slug, signal_type: 'confirmation', detected_count: 1, first_detected: at, last_detected: at, quotes: ['q'], proposal: slug, source_agent: 'dev', proposal_fingerprint: 'f' });
  }
  const queue = await list({ 'titles-only': true, proposals: true });
  assert.equal(queue.count, 3, 'the proposals queue has no default head');
  assert.equal(queue.omitted, undefined);
  const newest = await list({ 'titles-only': true, proposals: true, limit: '2' });
  assert.deepEqual(slugs(newest), ['c-newest', 'b-middle'], 'a limited queue keeps the latest detections');
  assert.equal(newest.total, 3);
  assert.equal(newest.omitted, 1);
});
