'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runPrototypeCheck } = require('../src/commands/prototype-check');
const BIN = path.join(__dirname, '..', 'bin', 'aioson.js');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-protocheck-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: () => {}, lines };
}

const SLUG = 'kanban';
const PRD_WITH_REF = `# Kanban\n\n## Prototype reference\n- prototype: .aioson/briefings/${SLUG}/prototype.html\n- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md\n- status: draft\n\n## MVP scope\nStuff.\n`;
const MANIFEST = `# Prototype manifest\n\n## Core interactions\n- \`add card\` — adds a card to a list\n- \`create board\` — creates a board\n- \`archive workspace\` — archives a workspace\n`;

async function run(dir, options = {}) {
  return runPrototypeCheck({ args: [dir], options: { json: true, feature: SLUG, ...options }, logger: makeLogger() });
}

test('prototype:check — skipped when no PRD', async () => {
  const dir = await makeTmpDir();
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'skipped');
});

test('prototype:check CLI — dispatches through bin/aioson.js and emits JSON', async () => {
  const dir = await makeTmpDir();
  const result = spawnSync(process.execPath, [
    BIN,
    'prototype:check',
    dir,
    `--feature=${SLUG}`,
    '--json'
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'skipped');
});

test('prototype:check — not_applicable when PRD has no Prototype reference', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# Kanban\n## MVP scope\nNo prototype here.\n');
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'not_applicable');
});

test('prototype:check — fail on dangling prototype reference', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.status, 'fail');
  assert.equal(r.reason, 'dangling_prototype');
});

test('prototype:check — rejects prototype path outside project root', async () => {
  const dir = await makeTmpDir();
  const outsidePrototype = path.join(os.tmpdir(), `aioson-outside-proto-${Date.now()}.html`);
  await fs.writeFile(outsidePrototype, '<html></html>', 'utf8');
  try {
    await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `# Kanban

## Prototype reference
- prototype: ${outsidePrototype}
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md
- status: draft
`);
    const r = await run(dir);
    assert.equal(r.ok, false);
    assert.equal(r.status, 'fail');
    assert.equal(r.reason, 'path_outside_root');
    assert.equal(r.field, 'prototype');
  } finally {
    await fs.rm(outsidePrototype, { force: true });
  }
});

test('prototype:check — rejects manifest path outside project root without reading it', async () => {
  const dir = await makeTmpDir();
  const outsideManifest = path.join(os.tmpdir(), `aioson-outside-manifest-${Date.now()}.md`);
  await fs.writeFile(outsideManifest, '# Manifest\n\n## Core interactions\n- `outside secret token` — should not be read\n', 'utf8');
  try {
    await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `# Kanban

## Prototype reference
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: ${outsideManifest}
- status: draft
`);
    await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
    await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`, '# Requirements\nAC-01: nothing.\n');
    const r = await run(dir);
    assert.equal(r.ok, false);
    assert.equal(r.status, 'fail');
    assert.equal(r.reason, 'path_outside_root');
    assert.equal(r.field, 'manifest');
    assert.doesNotMatch(JSON.stringify(r), /outside secret token/);
  } finally {
    await fs.rm(outsideManifest, { force: true });
  }
});

test('prototype:check — fail when manifest missing', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing_manifest');
});

test('prototype:check — fail when requirements (analyst bridge) missing', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing_requirements');
});

test('prototype:check — ok when every interaction is echoed in the ACs', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`,
    '# Requirements\nAC-01: add card persists and re-renders.\nAC-02: create board seeds default lists.\nAC-03: archive workspace hides it.\n');
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.interactions.total, 3);
  assert.equal(r.interactions.covered, 3);
});

test('prototype:check — warn on partial coverage and lists the gap', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`,
    '# Requirements\nAC-01: add card persists and re-renders.\nAC-02: create board seeds default lists.\n');
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'warn');
  assert.deepEqual(r.interactions.uncovered, ['archive workspace']);
});

test('prototype:check — strict fails on partial coverage', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`,
    '# Requirements\nAC-01: add card persists and re-renders.\nAC-02: create board seeds default lists.\n');
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'fail');
  assert.equal(r.reason, 'partial_ac_coverage');
  assert.deepEqual(r.interactions.uncovered, ['archive workspace']);
});

test('prototype:check — fail when no interaction reaches the ACs', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`,
    '# Requirements\nAC-01: the user can view a list of items.\n');
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_ac_coverage');
});

test('prototype:check — ok when manifest lists no machine-readable interactions', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, '# Manifest\nFree prose, no backtick tokens.\n');
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`, '# Requirements\nAC-01: something.\n');
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.interactions.total, 0);
});

test('prototype:check — pt-BR interactions match folded ACs (accents ignored)', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`,
    '# Manifesto\n\n## Core interactions\n- `adicionar cartão` — adiciona um cartão\n- `arquivar quadro` — arquiva o quadro\n');
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`,
    '# Requisitos\nAC-01: adicionar cartao persiste e re-renderiza.\nAC-02: arquivar quadro oculta o quadro.\n');
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.interactions.covered, 2);
});
