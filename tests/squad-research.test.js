'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { classifyResearchPolicy } = require('../src/squad/research-policy');
const { validateEvidencePack } = require('../src/squad/evidence-pack');
const { runResearchWorker } = require('../src/worker-runner');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-research-'));
}

test('AC-premium-04 classifies volatile/current and stable work with proportional freshness', () => {
  assert.equal(classifyResearchPolicy({ query: 'latest API pricing today' }).type, 'live-required');
  assert.equal(classifyResearchPolicy({ external: true, query: 'specialized workflow' }).type, 'live-check');
  assert.equal(classifyResearchPolicy({ query: 'stable writing method' }).type, 'cache-eligible');
  const closed = classifyResearchPolicy({ query: 'private user-provided documents' });
  assert.equal(closed.type, 'closed-world');
  assert.equal(closed.networkAllowed, false);
});

test('AC-premium-03 closed-world persists not-applicable without touching a provider', async () => {
  const projectDir = await makeTempDir();
  let providerCalls = 0;
  const provider = {
    async discover() { providerCalls += 1; throw new Error('network must not be used'); },
    async fetch() { providerCalls += 1; throw new Error('network must not be used'); }
  };
  const result = await runResearchWorker(
    projectDir,
    { slug: 'private-research', research: { topic: 'private-docs', policy: 'closed-world' } },
    { session_id: 'session-1', claims: ['Summarize supplied material'] },
    { squadSlug: 'premium-squad', researchProvider: provider }
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.status, 'not-applicable');
  assert.equal(result.output.network_accessed, false);
  assert.equal(providerCalls, 0);
  const pack = JSON.parse(await fs.readFile(path.join(projectDir, result.output.evidence_pack), 'utf8'));
  assert.equal(pack.status, 'not-applicable');
  assert.equal(pack.policy.type, 'closed-world');
});

test('AC-premium-01 AC-premium-02 live research persists claim provenance, timestamps and hashes', async () => {
  const projectDir = await makeTempDir();
  const calls = [];
  const provider = {
    async discover(query) {
      calls.push(['discover', query]);
      return {
        available: true,
        source: 'fixture',
        candidates: [
          { url: 'https://official.example/spec', primary: true },
          { url: 'https://independent.example/review', independent: true }
        ]
      };
    },
    async fetch(candidate) {
      calls.push(['fetch', candidate.url]);
      return {
        ok: true,
        url: candidate.url,
        title: candidate.url.includes('official') ? 'Official spec' : 'Independent review',
        html: `<main>Grounded content from ${candidate.url}</main>`
      };
    }
  };
  const result = await runResearchWorker(
    projectDir,
    {
      slug: 'current-research',
      research: {
        topic: 'current-api',
        query: 'current API contract',
        policy: 'live-required',
        material_claims: true
      }
    },
    {
      session_id: 'session-2',
      claims: [{
        text: 'The current contract is supported',
        status: 'supported',
        source_ids: ['source-1', 'source-2']
      }]
    },
    { squadSlug: 'premium-squad', researchProvider: provider }
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.cached, false);
  assert.equal(result.output.status, 'pass');
  assert.deepEqual(calls.map((entry) => entry[0]), ['discover', 'fetch', 'fetch']);
  const pack = JSON.parse(await fs.readFile(path.join(projectDir, result.output.evidence_pack), 'utf8'));
  assert.equal(pack.sources.length, 2);
  assert.equal(pack.claims[0].status, 'supported');
  assert.equal(pack.claims[0].citations.length, 2);
  assert.ok(pack.sources.every((source) => source.collected_at));
  assert.match(pack.sources[0].content_hash, /^[a-f0-9]{64}$/);
});

test('AC-premium-02 material claims without explicit source mapping cannot produce PASS', async () => {
  const projectDir = await makeTempDir();
  const provider = {
    async discover() {
      return {
        available: true,
        source: 'fixture',
        candidates: [
          { url: 'https://official.example/spec', primary: true },
          { url: 'https://independent.example/review', independent: true }
        ]
      };
    },
    async fetch(candidate) {
      return { ok: true, url: candidate.url, html: 'Grounded source content' };
    }
  };
  const result = await runResearchWorker(
    projectDir,
    {
      slug: 'unmapped-research',
      research: {
        topic: 'unmapped-claims',
        policy: 'live-required',
        material_claims: true
      }
    },
    { session_id: 'session-unmapped', claims: ['A claim that was never mapped'] },
    { squadSlug: 'premium-squad', researchProvider: provider }
  );

  assert.equal(result.ok, false);
  assert.equal(result.output.status, 'unverified');
  assert.ok(result.output.gaps.some((gap) => gap.code === 'material-claim-grounding-missing'));
  const pack = JSON.parse(await fs.readFile(path.join(projectDir, result.output.evidence_pack), 'utf8'));
  assert.equal(pack.claims[0].status, 'unverified');
  assert.deepEqual(pack.claims[0].source_ids, []);
});

test('AC-premium-02 live Evidence Pack with sources but zero claims remains unverified', async () => {
  const projectDir = await makeTempDir();
  const provider = {
    async discover() {
      return {
        available: true,
        source: 'fixture',
        candidates: [{ url: 'https://official.example/spec', primary: true }]
      };
    },
    async fetch(candidate) {
      return { ok: true, url: candidate.url, html: 'Current source content' };
    }
  };
  const result = await runResearchWorker(
    projectDir,
    {
      slug: 'claimless-research',
      research: { topic: 'claimless', policy: 'live-check' }
    },
    { session_id: 'session-claimless', claims: [] },
    { squadSlug: 'premium-squad', researchProvider: provider }
  );

  assert.equal(result.ok, false);
  assert.equal(result.output.status, 'unverified');
  assert.ok(result.output.gaps.some((gap) => gap.code === 'material-claim-grounding-missing'));
});

test('AC-premium-02 Evidence Pack rejects citations outside the explicit source mapping', () => {
  const result = validateEvidencePack({
    schemaVersion: '1.0.0',
    topic: 'mapping',
    policy: { type: 'live-required' },
    status: 'pass',
    sources: [{
      id: 'source-1',
      url: 'https://source.example/fact',
      content_hash: 'a'.repeat(64)
    }],
    claims: [{
      id: 'claim-1',
      text: 'Mapped claim',
      status: 'supported',
      source_ids: ['source-1'],
      citations: ['https://unmapped.example/fact']
    }]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('outside its source mapping')));
});

test('AC-premium-01 AC-premium-02 unavailable live source remains visibly unverified', async () => {
  const projectDir = await makeTempDir();
  const cacheDir = path.join(projectDir, 'researchs', 'current-law');
  await fs.mkdir(cacheDir, { recursive: true });
  const cached = '# Previously cached law';
  await fs.writeFile(path.join(cacheDir, 'summary.md'), cached);
  const provider = {
    async discover() {
      return { available: false, source: 'fixture', reason: 'offline', candidates: [] };
    },
    async fetch() { throw new Error('no candidates expected'); }
  };
  const result = await runResearchWorker(
    projectDir,
    { slug: 'law-research', research: { topic: 'current-law', policy: 'live-required' } },
    { session_id: 'session-3', claims: ['Current law is still effective'] },
    { squadSlug: 'premium-squad', researchProvider: provider }
  );

  assert.equal(result.ok, false);
  assert.equal(result.output.status, 'unverified');
  assert.ok(result.output.gaps.some((gap) => gap.code === 'provider-unavailable'));
  const pack = JSON.parse(await fs.readFile(path.join(projectDir, result.output.evidence_pack), 'utf8'));
  assert.equal(pack.claims[0].status, 'unverified');
  assert.equal(pack.claims[0].source_ids.length, 0);
  assert.equal(await fs.readFile(path.join(cacheDir, 'summary.md'), 'utf8'), cached);
});

test('cache-eligible work reuses fresh cache and still creates execution provenance', async () => {
  const projectDir = await makeTempDir();
  const cacheDir = path.join(projectDir, 'researchs', 'stable-method');
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, 'summary.md'), '# Stable method');
  const result = await runResearchWorker(
    projectDir,
    { slug: 'method-research', research: { topic: 'stable-method', policy: 'cache-eligible' } },
    { session_id: 'session-4' },
    { squadSlug: 'premium-squad' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.output.cached, true);
  const pack = JSON.parse(await fs.readFile(path.join(projectDir, result.output.evidence_pack), 'utf8'));
  assert.equal(pack.provider.source, 'cache');
  assert.equal(pack.provenance.run_id, 'session-4');
});
