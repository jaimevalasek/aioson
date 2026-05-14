'use strict';

/**
 * QA Phase 2 — memory-search-fts5 negative-path coverage.
 *
 * Written by @qa during Gate D review on 2026-05-14. These tests pin the
 * desired behavior for edge cases not covered by the dev-supplied Phase 2
 * acceptance tests. Expected outcome: structured `{ ok: false, reason: ... }`
 * for every degenerate query, with no uncaught exception reaching the caller.
 *
 * Findings tracked against `.aioson/plans/active-learning-loop/corrections-2026-05-14-phase2.md`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb, insertProjectLearning } = require('../src/runtime-store');
const { runMemorySearch } = require('../src/commands/memory-search');
const { sanitizeFtsQuery } = require('../src/learning-loop-fts5');

const SILENT_LOGGER = () => ({ log: () => {}, error: () => {} });

async function makeSeedDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-qa-ms-'));
  const { db } = await openRuntimeDb(dir);
  try {
    insertProjectLearning(db, {
      learningId: 'pl-seed-only',
      projectName: 'aioson',
      featureSlug: 'qa-fixture',
      type: 'process',
      title: 'Seed entry for QA negative tests',
      evidence: 'present so the search path actually runs against FTS5',
      status: 'active'
    });
  } finally {
    db.close();
  }
  return dir;
}

// QA-H-01 — operator-only queries (or queries that reduce to empty after
// sanitization) must NOT throw. Today they leak `fts5: syntax error near ""`
// up to the caller because `sanitizeFtsQuery` can return '' for non-empty
// inputs and `searchProjectLearnings` binds that empty string to MATCH.

test('QA-H-01: operator-only query returns structured error (no uncaught SQL exception)', async () => {
  const dir = await makeSeedDir();
  const sanitized = sanitizeFtsQuery('+ - * ( ) ^ :');
  assert.equal(sanitized, '', 'precondition: this input must sanitize to empty');

  const result = await runMemorySearch({
    args: ['+ - * ( ) ^ :', dir],
    options: { json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  assert.equal(result.ok, false, 'operator-only query must not return ok=true');
  assert.ok(
    typeof result.reason === 'string' && result.reason.length > 0,
    'failure must carry a structured reason (e.g. query_unparseable / query_empty)'
  );
});

test('QA-H-01 cont: quote-only query returns structured error', async () => {
  const dir = await makeSeedDir();
  const sanitized = sanitizeFtsQuery('" " "');
  assert.equal(sanitized, '', 'precondition: quote-only must sanitize to empty');

  const result = await runMemorySearch({
    args: ['" " "', dir],
    options: { json: true },
    logger: SILENT_LOGGER(),
    t: () => null
  });

  assert.equal(result.ok, false);
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

test('QA-H-01 cont: text-mode (non-JSON) operator-only query also returns ok=false without throwing', async () => {
  const dir = await makeSeedDir();
  const out = [];
  const logger = { log: (m) => out.push(String(m)), error: () => {} };

  const result = await runMemorySearch({
    args: ['*** ((( )))', dir],
    options: {},
    logger,
    t: () => null
  });

  assert.equal(result.ok, false);
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});
