'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateHandoffContract } = require('../src/handoff-contract');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writePrd(tmpDir, slug, classification) {
  await ensureDir(path.join(tmpDir, '.aioson', 'context'));
  await fs.writeFile(
    path.join(tmpDir, '.aioson', 'context', `prd-${slug}.md`),
    `---\nslug: ${slug}\nclassification: ${classification}\nstatus: in_progress\n---\n\n# PRD ${slug}\n`
  );
}

async function writeProjectContext(tmpDir, classification) {
  await ensureDir(path.join(tmpDir, '.aioson', 'context'));
  await fs.writeFile(
    path.join(tmpDir, '.aioson', 'context', 'project.context.md'),
    `---\nclassification: "${classification}"\n---\n\n# Project\n`
  );
}

describe('handoff-contract — MICRO-aware gate validation', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-micro-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('dev stage with MICRO feature passes without spec-{slug}.md', async () => {
    await writePrd(tmpDir, 'tiny-fix', 'MICRO');
    await writeProjectContext(tmpDir, 'MEDIUM');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'dev-state.md'),
      'state'
    );

    const state = { mode: 'feature', featureSlug: 'tiny-fix' };
    const result = await validateHandoffContract(tmpDir, state, 'dev');
    assert.equal(
      result.ok,
      true,
      `MICRO feature should pass dev gate without spec; got missing: ${JSON.stringify(result.missing)}`
    );
  });

  it('dev stage with SMALL feature still blocks on missing spec', async () => {
    await writePrd(tmpDir, 'real-feature', 'SMALL');
    await writeProjectContext(tmpDir, 'SMALL');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'dev-state.md'),
      'state'
    );

    const state = { mode: 'feature', featureSlug: 'real-feature' };
    const result = await validateHandoffContract(tmpDir, state, 'dev');
    assert.equal(result.ok, false, 'SMALL feature without spec must still block dev gate');
    assert.ok(
      result.missing.some((m) => m.includes('gate C') && m.includes('spec_missing')),
      `expected gate C spec_missing blocker, got: ${JSON.stringify(result.missing)}`
    );
  });

  it('dev stage with MEDIUM feature still blocks on missing spec (regression)', async () => {
    await writePrd(tmpDir, 'big-feature', 'MEDIUM');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'dev-state.md'),
      'state'
    );

    const state = { mode: 'feature', featureSlug: 'big-feature' };
    const result = await validateHandoffContract(tmpDir, state, 'dev');
    assert.equal(result.ok, false, 'MEDIUM feature without spec must still block');
  });

  it('qa stage with MICRO feature passes without spec-{slug}.md', async () => {
    await writePrd(tmpDir, 'tiny-fix', 'MICRO');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );

    const state = { mode: 'feature', featureSlug: 'tiny-fix' };
    const result = await validateHandoffContract(tmpDir, state, 'qa');
    assert.equal(
      result.ok,
      true,
      `MICRO feature should pass qa gate without spec; got missing: ${JSON.stringify(result.missing)}`
    );
  });

  it('feature classification (MICRO) overrides project classification (MEDIUM)', async () => {
    await writePrd(tmpDir, 'micro-in-medium', 'MICRO');
    await writeProjectContext(tmpDir, 'MEDIUM');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'dev-state.md'),
      'state'
    );

    const state = { mode: 'feature', featureSlug: 'micro-in-medium' };
    const result = await validateHandoffContract(tmpDir, state, 'dev');
    assert.equal(
      result.ok,
      true,
      'MICRO feature inside a MEDIUM project must be treated as MICRO for gate enforcement'
    );
  });

  it('explicit state.classification still takes precedence over PRD frontmatter', async () => {
    await writePrd(tmpDir, 'mismatch', 'MICRO');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'dev-state.md'),
      'state'
    );

    const state = {
      mode: 'feature',
      featureSlug: 'mismatch',
      classification: 'MEDIUM'
    };
    const result = await validateHandoffContract(tmpDir, state, 'dev');
    assert.equal(
      result.ok,
      false,
      'explicit MEDIUM in state must override MICRO from PRD frontmatter'
    );
  });

  it('project mode (no slug) is unaffected by the MICRO short-circuit', async () => {
    await writeProjectContext(tmpDir, 'MICRO');
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      'pulse'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'dev-state.md'),
      'state'
    );

    const state = { mode: 'project', featureSlug: null };
    const result = await validateHandoffContract(tmpDir, state, 'dev');
    // Project mode without spec.md returns ok via 'project_mode_without_spec';
    // the MICRO short-circuit must not change that path.
    assert.equal(result.ok, true);
  });
});
