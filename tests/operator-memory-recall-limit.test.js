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

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-recall-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

const { serializeDecision, decisionPath, readDecision } = require('../src/operator-memory/decision');
const { ensureStorageTree } = require('../src/operator-memory/storage');
const { regenerateIndex } = require('../src/operator-memory/index-md');
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

function seed(identity, slug, { daysAgo = 0, category = 'default', reinforced = 0, body = `decision ${slug}` } = {}) {
  const at = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  fs.writeFileSync(decisionPath(identity, slug), serializeDecision({
    slug, signal_type: 'authorization', promoted_at: at, last_reinforced: at, reinforcement_count: reinforced,
    category, source_agent: 'dev', quotes: ['q'], body, title: body
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
  assert.match(refused.error, /--limit must be a whole number/);
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
  assert.equal(found.omitted, undefined);
});
