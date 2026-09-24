'use strict';

// reference-image-driven visual identity — the reference-identity-extract skill,
// its identity.md gate wiring, and the agent/skill edits that consume the record.
// Convention: skill content is read from template/ (the source of truth; the
// .aioson/skills mirror is gitignored/generated). Tracked mirrors (.aioson/agents,
// .aioson/docs) additionally assert template <-> .aioson byte-parity.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { MANAGED_FILES } = require('../src/constants');
const { availableKinds } = require('../src/commands/verify-artifact');

const ROOT = path.resolve(__dirname, '..');

// Source of truth for any managed file (skills included): template/<rel>.
function readTemplate(rel) {
  return fs.readFile(path.join(ROOT, 'template', rel), 'utf8');
}

// Tracked mirrors (.aioson/agents/**, .aioson/docs/**) are committed on both sides,
// so assert byte-parity and return the (identical) content for token checks.
async function parityTracked(rel) {
  const tmpl = await readTemplate(rel);
  const work = await fs.readFile(path.join(ROOT, rel), 'utf8');
  assert.equal(tmpl, work, `template/${rel} and ${rel} must be byte-identical`);
  return tmpl;
}

test('reference-identity-extract skill is shipped, managed, and carries its contract', async () => {
  const skillFile = '.aioson/skills/process/reference-identity-extract/SKILL.md';
  assert.equal(MANAGED_FILES.includes(skillFile), true, 'extraction skill must be a managed file');
  await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', skillFile)));

  const skill = await readTemplate(skillFile);
  for (const token of [
    'name: reference-identity-extract',
    'references/identity',
    'references/structure',
    '.aioson/explorations/{slug}/identity.md',
    'scope: exploration|briefing|brand',
    '## Component structure notes',
    'generated_by: reference-identity-extract',
    '--kind=identity',
    'source: references',
    'source: intent'                // the image-less fallback must stay documented
  ]) {
    assert.equal(skill.includes(token), true, `skill missing contract token: ${token}`);
  }
});

test('reference-identity doc is shipped, managed, and byte-parity', async () => {
  const docFile = '.aioson/docs/reference-identity.md';
  assert.equal(MANAGED_FILES.includes(docFile), true, 'reference-identity doc must be a managed file');
  const doc = await parityTracked(docFile);
  for (const token of ['identity.md', 'reference-identity-extract', 'kind=identity']) {
    assert.equal(doc.includes(token), true, `doc missing token: ${token}`);
  }
});

test('verify:artifact registers the identity kind', () => {
  assert.equal(availableKinds().includes('identity'), true);
});

test('refiner wires the reference-image intake (byte-parity)', async () => {
  const agent = await parityTracked('.aioson/agents/refiner.md');
  for (const token of ['references/identity', 'reference-identity-extract', '--kind=identity', 'identity.md']) {
    assert.equal(agent.includes(token), true, `refiner missing wiring token: ${token}`);
  }
});

test('identity.md is framed as an INPUT to the one design engine without weakening ONE SKILL ONLY (byte-parity)', async () => {
  // ux-ui (which used to carry this framing in its Step 0) was retired into
  // product; the framing now lives once, in the shared reference-identity doc.
  await assert.rejects(fs.access(path.join(ROOT, 'template', '.aioson', 'agents', 'ux-ui.md')));
  const doc = await parityTracked('.aioson/docs/reference-identity.md');
  assert.equal(doc.includes('identity input'), true);
  assert.equal(doc.includes('not** a second design skill'), true);
  assert.equal(doc.includes('parameterizes it'), true);
  assert.equal(doc.includes('ONE-SKILL-ONLY rule'), true);
});

test('setup names the interface-design default and the reference-images route without asking (byte-parity)', async () => {
  const agent = await parityTracked('.aioson/agents/setup.md');
  assert.equal(agent.includes('identity.md'), true);
  assert.equal(agent.includes('reference images'), true);
  assert.equal(agent.includes('design_skill: "interface-design"'), true);
});

test('prototype-forge consumes identity.md as the engine overlay', async () => {
  const skill = await readTemplate('.aioson/skills/process/prototype-forge/SKILL.md');
  assert.equal(skill.includes('identity.md'), true);
  assert.equal(skill.includes('## Component structure notes'), true);
  assert.equal(skill.includes('overlays the one engine'), true);
  assert.equal(skill.includes('second visual system'), true);
  assert.equal(skill.includes('visual-exploration'), true);
  assert.equal(skill.includes('inputs/source-map.md'), true);
  assert.equal(skill.includes('aioson:reusable-prompts'), true);
});

test('interface-design continuity reuses identity.md (not a parallel system)', async () => {
  const ref = await readTemplate('.aioson/skills/design/interface-design/references/intent-and-domain.md');
  assert.equal(ref.includes('identity.md'), true);
  assert.equal(ref.includes('source: references'), true);
  assert.equal(ref.includes('source: intent'), true);
  assert.equal(ref.includes('.aioson/explorations/{slug}/identity.md'), true);
});
