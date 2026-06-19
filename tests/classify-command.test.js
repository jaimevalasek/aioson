'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runClassify } = require('../src/commands/classify');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-classify-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

// ── Missing source ────────────────────────────────────────────────────────────

test('classify: returns ok=false when no source file and no --interactive', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_source');
});

// ── MICRO classification ──────────────────────────────────────────────────────

test('classify: scores MICRO for simple single-user PRD', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-simple.md',
    '# Simple Feature\nAs a user, I want to see my profile.\nNo external services required.\n');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'simple' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'MICRO');
});

// ── SMALL classification ──────────────────────────────────────────────────────

test('classify: scores SMALL for moderate complexity', async () => {
  const tmpDir = await makeTmpDir();
  const content = [
    '# Checkout Feature',
    'As an admin, manage orders.',
    'As a customer, complete purchase.',
    'Integrates with Stripe for payments.',
    'Validation rules apply to each step.'
  ].join('\n');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', content);
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'SMALL');
});

// ── MEDIUM classification ─────────────────────────────────────────────────────

test('classify: scores MEDIUM for high complexity', async () => {
  const tmpDir = await makeTmpDir();
  const content = [
    '# Complex Platform',
    'As an admin, configure rules.',
    'As a customer, purchase products.',
    'As a vendor, manage inventory.',
    'External integrations: Stripe, SendGrid, S3, OAuth, Twilio.',
    'State machine drives order transitions.',
    'Complex calculation logic for pricing engine.',
    'Concurrent processing required.'
  ].join('\n');
  await writeFile(tmpDir, '.aioson/context/prd-platform.md', content);
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'platform' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'MEDIUM');
});

// ── Source file fallback ──────────────────────────────────────────────────────

test('classify: reads requirements file when prd missing', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/requirements-feat.md',
    '# Requirements\nAs a user I want to login.\n');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'feat' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.ok(['MICRO', 'SMALL', 'MEDIUM'].includes(result.classification));
});

// ── JSON output fields ────────────────────────────────────────────────────────

test('classify: json includes scores and phase_depth', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-x.md', 'As a user, I want to view data.');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'x' },
    logger: makeLogger()
  });
  assert.ok('scores' in result);
  assert.ok('phase_depth' in result);
  assert.ok('inputs' in result);
  assert.ok(typeof result.scores.total === 'number');
});

// ── Human output ──────────────────────────────────────────────────────────────

test('classify: human output contains Score line', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-y.md', 'Simple feature for one user.');
  const logger = makeLogger();
  await runClassify({ args: [tmpDir], options: { feature: 'y' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Score')));
});

test('classify: human output contains Phase depth section', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-z.md', 'Simple feature for one user.');
  const logger = makeLogger();
  await runClassify({ args: [tmpDir], options: { feature: 'z' }, logger });
  assert.ok(logger.lines.some((l) => l.includes('Phase depth') || l.includes('specify') || l.includes('execute')));
});

// ── Sensitive-surface floor (Gap 3B) ────────────────────────────────────────────

test('classify: floors MICRO to SMALL when content touches money', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-refund.md',
    '# Refund button\nAs a user, I want to request a refund for my order.\n');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'refund' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'SMALL');
  assert.equal(result.floored, true);
  assert.ok(result.sensitive_surfaces.includes('money'));
});

test('classify: floors MICRO to SMALL when content touches auth', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-pwreset.md',
    '# Password reset\nAs a user, I want to reset my password.\n');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'pwreset' },
    logger: makeLogger()
  });
  assert.equal(result.classification, 'SMALL');
  assert.equal(result.floored, true);
  assert.ok(result.sensitive_surfaces.includes('auth'));
});

test('classify: non-sensitive MICRO stays MICRO (floored=false)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-profile.md',
    '# View profile\nAs a user, I want to see my profile.\nNo external services required.\n');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'profile' },
    logger: makeLogger()
  });
  assert.equal(result.classification, 'MICRO');
  assert.equal(result.floored, false);
  assert.deepEqual(result.sensitive_surfaces, []);
});

test('classify: frontmatter sensitive_surfaces override forces the floor', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/prd-theme.md',
    '---\nsensitive_surfaces: [auth]\n---\n# Theme toggle\nAs a user, I want to switch between light and dark mode.\n');
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'theme' },
    logger: makeLogger()
  });
  assert.equal(result.classification, 'SMALL');
  assert.equal(result.floored, true);
  assert.ok(result.sensitive_surfaces.includes('auth'));
});

test('classify: floor never lowers an already-MEDIUM classification', async () => {
  const tmpDir = await makeTmpDir();
  const content = [
    '# Complex Platform',
    'As an admin, configure rules.',
    'As a customer, purchase products.',
    'As a vendor, manage inventory.',
    'External integrations: Stripe, SendGrid, S3, OAuth, Twilio.',
    'State machine drives order transitions.',
    'Complex calculation logic for pricing engine.',
    'Concurrent processing required.'
  ].join('\n');
  await writeFile(tmpDir, '.aioson/context/prd-big.md', content);
  const result = await runClassify({
    args: [tmpDir],
    options: { json: true, feature: 'big' },
    logger: makeLogger()
  });
  assert.equal(result.classification, 'MEDIUM');
  assert.equal(result.floored, false);
});
