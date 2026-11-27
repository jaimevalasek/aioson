'use strict';

/**
 * Outcome records — the privacy promise the feedback screen makes is a
 * machine check, not a sentence. A record holds numbers, booleans and
 * enumerations; the only free text is the person's comment, scrubbed of every
 * shape that names or locates the project BEFORE it is stored. A record with
 * any other key, or a value of the wrong shape, is never written.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scrubComment, TEXT_MAX } = require('../src/lib/outcomes/scrub');
const { validateRecord } = require('../src/lib/outcomes/schema');
const { writeRecord, readRecord, readRecords } = require('../src/lib/outcomes/ledger');

function record(overrides = {}) {
  return {
    schema: 1,
    feature: 'checkout-flow',
    kind: 'feature',
    classification: 'SMALL',
    verdict: 'PASS',
    closed_at: '2026-11-27T12:00:00.000Z',
    aioson_version: '1.84.2',
    catalog_version: 1,
    shape: 'single-dev',
    autopilot: false,
    practices: { visual_inputs: true, prototype_approved: false, prd_reviewed: null },
    outcome: { first_pass: true, fail_cycles: 0, findings_high: 1, tokens: null, duration_hours: 5.5 },
    ...overrides
  };
}

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

// A credential-shaped assignment, assembled at run time so the source holds none.
const FAKE_CREDENTIAL = ['tok', 'en', '=', 'abc123', 'secretvalue'].join('');

test('a comment leaves without paths, links, e-mails, secrets, long numbers or the project name', () => {
  const text = 'O app Loja Bella ficou ótimo! Veja C:\\dev\\loja-bella\\src\\app.js e /home/ana/loja/routes/web.php, '
    + `https://loja-bella.com.br/admin, fale com ana@lojabella.com, ${FAKE_CREDENTIAL}, tel 11 98765-4321, `
    + 'arquivo UserController.php, servidor 10.0.0.12:8080 e o .env.local. lojabella e loja_bella também.';
  const out = scrubComment(text, { names: ['Loja Bella', 'loja-bella'] });
  for (const leak of ['Bella', 'bella', 'C:\\dev', '/home/ana', 'https://', 'ana@', 'abc123secretvalue', '98765', 'UserController', '10.0.0.12', '.env.local', 'loja_bella']) {
    assert.ok(!out.includes(leak), `"${leak}" leaked: ${out}`);
  }
  assert.match(out, /ficou ótimo/);
  assert.match(out, /\[removido\]/);
});

test('the scrub keeps ordinary sentences, stack names and slashes between words', () => {
  const out = scrubComment('O protótipo antes do código e/ou o QA com Next.js e Node.js ajudaram muito, sim/não.', { names: ['app'] });
  assert.equal(out, 'O protótipo antes do código e/ou o QA com Next.js e Node.js ajudaram muito, sim/não.');
});

test('dates and punctuation survive the scrub', () => {
  assert.equal(scrubComment('O deploy em 27/11/2026 demorou; veja C:\\dev\\x.js, depois.'), 'O deploy em 27/11/2026 demorou; veja [removido], depois.');
});

test('the scrub caps the comment and returns empty for nothing left', () => {
  assert.equal([...scrubComment('a'.repeat(TEXT_MAX * 2))].length, TEXT_MAX);
  assert.equal(scrubComment('https://x.com/a C:\\a\\b'), '');
  assert.equal(scrubComment(null), '');
});

test('the schema accepts a record of numbers and enumerations', () => {
  assert.deepEqual(validateRecord(record()), { ok: true, errors: [] });
});

test('the schema refuses any key or value that could carry project text', () => {
  const cases = [
    record({ project_name: 'Loja Bella' }),
    record({ practices: { 'Tela de login da Loja': true } }),
    record({ practices: { visual_inputs: 'yes, from Figma file loja.fig' } }),
    record({ outcome: { first_pass: true, notes: 'the PRD said...' } }),
    record({ outcome: { fail_cycles: 'two' } }),
    record({ classification: 'Projeto da Ana' }),
    record({ feedback: { rating: 4, good: 'ok', bad: '', answered_at: '2026-11-27T12:00:00.000Z', path: 'C:\\dev' } }),
    record({ feedback: { rating: 9, good: '', bad: '', answered_at: '2026-11-27T12:00:00.000Z' } }),
    record({ feedback: { rating: 4, good: 'x'.repeat(TEXT_MAX + 1), bad: '', answered_at: '2026-11-27T12:00:00.000Z' } })
  ];
  for (const bad of cases) assert.equal(validateRecord(bad).ok, false, JSON.stringify(bad).slice(0, 120));
});

test('the ledger never writes a record that fails the schema, and reads only valid ones', () => {
  const dir = tmpProject();
  assert.throws(() => writeRecord(dir, record({ secret_notes: 'x' })), (err) => err.code === 'OUTCOME_SCHEMA');
  assert.equal(readRecord(dir, 'checkout-flow'), null);
  writeRecord(dir, record());
  writeRecord(dir, record({ feature: 'search-page', closed_at: '2026-11-28T12:00:00.000Z' }));
  fs.writeFileSync(path.join(dir, '.aioson', 'outcomes', 'broken.json'), '{"schema":1,"feature":"broken","extra":"text"}');
  assert.deepEqual(readRecords(dir).map((r) => r.feature), ['checkout-flow', 'search-page']);
});
