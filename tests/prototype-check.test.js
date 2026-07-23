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
const PRD_WITH_REF = `---
feature: ${SLUG}
prototype: .aioson/briefings/${SLUG}/prototype.html
prototype_status: current
prototype_feature: ${SLUG}
---

# Kanban

## Prototype reference
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md

## MVP scope
Stuff.
`;
const MANIFEST = `---\nfeature: ${SLUG}\nstatus: draft\n---\n\n# Prototype manifest\n\n## Core interactions\n- \`add card\` — adds a card to a list\n- \`create board\` — creates a board\n- \`archive workspace\` — archives a workspace\n`;

function prdWithAcceptance(criteria) {
  return `${PRD_WITH_REF}\n## Acceptance Criteria\n${criteria}\n`;
}

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

test('prototype:check — strict requires an explicit current or none declaration', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# Kanban\n## MVP scope\nNo prototype declaration.\n');
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'fail');
  assert.equal(r.reason, 'prototype_status_missing');
});

test('prototype:check — explicit none ignores historical references and stays not_applicable', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---
feature: ${SLUG}
prototype: null
prototype_status: none
prototype_feature: null
---

# Kanban

## Prototype contract
- status: none
- feature: ${SLUG}
- prototype: none
- manifest: none
- excluded historical references: .aioson/briefings/old-feature/prototype.html — owned by closed feature old-feature

## MVP scope
No binding prototype.
`);
  await writeFile(dir, '.aioson/briefings/old-feature/prototype.html', '<html>legacy</html>');
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'not_applicable');
  assert.equal(r.reason, 'explicit_none');
  assert.equal(r.binding.status, 'none');
});

test('prototype:check — strict rejects conflicting frontmatter and section status', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---
feature: ${SLUG}
prototype: null
prototype_status: none
prototype_feature: null
---

# Kanban

## Prototype contract
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md
`);
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'fail');
  assert.equal(r.reason, 'prototype_status_conflict');
  assert.match(r.message, /frontmatter declares prototype_status `none`/);
});

test('prototype:check — rejects a prototype owned by another feature folder', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---
feature: ${SLUG}
prototype: .aioson/briefings/old-feature/prototype.html
prototype_status: current
prototype_feature: ${SLUG}
---

# Kanban

## Prototype contract
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/old-feature/prototype.html
- manifest: .aioson/briefings/old-feature/prototype-manifest.md

## Acceptance Criteria
AC-01: legacy action.
`);
  await writeFile(dir, '.aioson/briefings/old-feature/prototype.html', '<html>legacy</html>');
  await writeFile(dir, '.aioson/briefings/old-feature/prototype-manifest.md',
    '---\nfeature: old-feature\n---\n\n## Core interactions\n- `legacy action`\n');
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'fail');
  assert.equal(r.reason, 'prototype_feature_mismatch');
  assert.match(r.message, /not owned by feature `kanban`/);
});

test('prototype:check — strict rejects a manifest without an explicit feature owner', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---
feature: ${SLUG}
prototype: .aioson/briefings/${SLUG}/prototype.html
prototype_status: current
prototype_feature: ${SLUG}
---

# Kanban

## Prototype contract
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md

## Acceptance Criteria
AC-01: add card.
`);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`,
    '# Prototype manifest\n\n## Core interactions\n- `add card`\n');
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'manifest_feature_missing');
});

test('prototype:check — strict rejects a current binding without a PRD owner', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---
feature: ${SLUG}
prototype: .aioson/briefings/${SLUG}/prototype.html
prototype_status: current
prototype_feature: null
---

# Kanban

## Prototype contract
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md

## Acceptance Criteria
AC-01: add card.
`);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'prototype_feature_missing');
});

test('prototype:check — rejects a manifest that names another feature owner', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---
feature: ${SLUG}
prototype: .aioson/briefings/${SLUG}/prototype.html
prototype_status: current
prototype_feature: ${SLUG}
---

# Kanban

## Prototype contract
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md

## Acceptance Criteria
AC-01: add card.
`);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`,
    '---\nfeature: other-feature\n---\n\n## Core interactions\n- `add card`\n');
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'prototype_feature_mismatch');
  assert.match(r.message, /belongs to feature `other-feature`/);
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

test('prototype:check — fail when the Product PRD has no acceptance criteria', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD_WITH_REF);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing_acceptance_criteria');
});

test('prototype:check — ok when every interaction is echoed in the ACs', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, prdWithAcceptance(
    'AC-01: add card persists and re-renders.\nAC-02: create board seeds default lists.\nAC-03: archive workspace hides it.'
  ));
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.interactions.total, 3);
  assert.equal(r.interactions.covered, 3);
});

test('prototype:check — warn on partial coverage and lists the gap', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, prdWithAcceptance(
    'AC-01: add card persists and re-renders.\nAC-02: create board seeds default lists.'
  ));
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'warn');
  assert.deepEqual(r.interactions.uncovered, ['archive workspace']);
});

test('prototype:check — strict fails on partial coverage', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, prdWithAcceptance(
    'AC-01: add card persists and re-renders.\nAC-02: create board seeds default lists.'
  ));
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir, { strict: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'fail');
  assert.equal(r.reason, 'partial_ac_coverage');
  assert.deepEqual(r.interactions.uncovered, ['archive workspace']);
});

test('prototype:check — fail when no interaction reaches the ACs', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, prdWithAcceptance(
    'AC-01: the user can view a list of items.'
  ));
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  const r = await run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_ac_coverage');
});

test('prototype:check — ok when manifest lists no machine-readable interactions', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, prdWithAcceptance('AC-01: something.'));
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`,
    `---\nfeature: ${SLUG}\n---\n\n# Manifest\nFree prose, no backtick tokens.\n`);
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.interactions.total, 0);
});

test('prototype:check — pt-BR interactions match folded ACs (accents ignored)', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, prdWithAcceptance(
    'AC-01: adicionar cartao persiste e re-renderiza.\nAC-02: arquivar quadro oculta o quadro.'
  ));
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<html></html>');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`,
    `---\nfeature: ${SLUG}\n---\n\n# Manifesto\n\n## Core interactions\n- \`adicionar cartão\` — adiciona um cartão\n- \`arquivar quadro\` — arquiva o quadro\n`);
  const r = await run(dir);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');
  assert.equal(r.interactions.covered, 2);
});
