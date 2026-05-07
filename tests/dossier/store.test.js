'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const store = require('../../src/dossier/store');
const { REQUIRED_SECTIONS } = require('../../src/dossier/schema');

let root;
let contextDir;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dossier-store-'));
  contextDir = path.join(root, '.aioson', 'context');
  await fs.mkdir(contextDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const FIXED_NOW = () => new Date('2026-04-28T10:00:00Z');

describe('dossier/store — init', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dossier-store-'));
    contextDir = path.join(root, '.aioson', 'context');
    await fs.mkdir(contextDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates dossier.md at .aioson/context/features/{slug}/dossier.md', async () => {
    const result = await store.init({
      slug: 'feature-x',
      contextDir,
      classification: 'MEDIUM',
      now: FIXED_NOW
    });

    assert.equal(
      result.path,
      path.join(contextDir, 'features', 'feature-x', 'dossier.md')
    );
    assert.equal(fssync.existsSync(result.path), true);
  });

  it('writes valid frontmatter (current schema_version, status active)', async () => {
    const { SCHEMA_VERSION } = require('../../src/dossier/schema');
    await store.init({ slug: 'feature-x', contextDir, classification: 'MEDIUM', now: FIXED_NOW });
    const { frontmatter } = await store.read({ slug: 'feature-x', contextDir });
    assert.equal(frontmatter.feature_slug, 'feature-x');
    assert.equal(frontmatter.schema_version, SCHEMA_VERSION);
    assert.equal(frontmatter.status, 'active');
    assert.equal(frontmatter.classification, 'MEDIUM');
    assert.equal(frontmatter.created_by, 'dossier-init');
    assert.equal(frontmatter.last_updated_by, 'dossier-init');
    assert.equal(frontmatter.created_at, '2026-04-28T10:00:00.000Z');
    assert.equal(frontmatter.last_updated_at, '2026-04-28T10:00:00.000Z');
  });

  it('contains all 6 required sections', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const { sections } = await store.read({ slug: 'feature-x', contextDir });
    for (const name of REQUIRED_SECTIONS) {
      assert.ok(name in sections, `missing section: ${name}`);
    }
  });

  it('extracts Why from PRD § Problem and What from § Escopo do MVP when PRD exists', async () => {
    const prd = [
      '---',
      'feature_slug: feature-x',
      '---',
      '',
      '## Vision',
      'A vision line.',
      '',
      '## Problem',
      'Today users struggle with X.',
      '',
      '## Escopo do MVP',
      'Build A, B and C.',
      ''
    ].join('\n');
    await fs.writeFile(path.join(contextDir, 'prd-feature-x.md'), prd);

    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const { sections } = await store.read({ slug: 'feature-x', contextDir });
    assert.match(sections['Why'], /Today users struggle with X\./);
    assert.match(sections['What'], /Build A, B and C\./);
  });

  it('falls back to placeholder text when PRD is absent', async () => {
    await store.init({ slug: 'feature-y', contextDir, now: FIXED_NOW });
    const { sections } = await store.read({ slug: 'feature-y', contextDir });
    assert.match(sections['Why'], /preencher manualmente/);
    assert.match(sections['What'], /preencher manualmente/);
  });

  it('throws EDOSSIEREXISTS when dossier already exists (atomic wx)', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    await assert.rejects(
      store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW }),
      (err) => err.code === 'EDOSSIEREXISTS'
    );
  });

  it('rejects invalid slug', async () => {
    await assert.rejects(
      store.init({ slug: 'Feature_X', contextDir, now: FIXED_NOW }),
      (err) => err.code === 'EDOSSIERSLUG'
    );
  });

  it('rejects invalid classification (schema validation)', async () => {
    await assert.rejects(
      store.init({ slug: 'feature-x', contextDir, classification: 'BIG', now: FIXED_NOW }),
      (err) => err.code === 'EDOSSIERSCHEMA'
    );
  });
});

describe('dossier/store — read', () => {
  it('throws EDOSSIERMISSING when dossier does not exist', async () => {
    await assert.rejects(
      store.read({ slug: 'never-created', contextDir }),
      (err) => err.code === 'EDOSSIERMISSING'
    );
  });

  it('throws EDOSSIERPARSE on malformed frontmatter', async () => {
    const dir = path.join(contextDir, 'features', 'broken');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'dossier.md'), 'no frontmatter here');
    await assert.rejects(
      store.read({ slug: 'broken', contextDir }),
      (err) => err.code === 'EDOSSIERPARSE'
    );
  });

  it('throws EDOSSIERSCHEMA when frontmatter violates schema', async () => {
    const dir = path.join(contextDir, 'features', 'bad-schema');
    await fs.mkdir(dir, { recursive: true });
    const bad = [
      '---',
      'feature_slug: bad-schema',
      'schema_version: "9.9"',
      'created_by: dossier-init',
      'created_at: 2026-04-28T10:00:00Z',
      'status: active',
      'classification: MEDIUM',
      'last_updated_by: dossier-init',
      'last_updated_at: 2026-04-28T10:00:00Z',
      '---',
      '',
      '## Why',
      'x',
      ''
    ].join('\n');
    await fs.writeFile(path.join(dir, 'dossier.md'), bad);
    await assert.rejects(
      store.read({ slug: 'bad-schema', contextDir }),
      (err) => err.code === 'EDOSSIERSCHEMA'
    );
  });

  it('returns frontmatter, sections and raw on a healthy dossier', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const result = await store.read({ slug: 'feature-x', contextDir });
    assert.ok(result.raw.startsWith('---\n'));
    assert.equal(result.frontmatter.feature_slug, 'feature-x');
    assert.ok('Code Map' in result.sections);
  });
});

describe('dossier/store — show', () => {
  it('renders header + raw + frontmatter for a valid dossier', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const result = await store.show({ slug: 'feature-x', contextDir });
    assert.match(result.header, /Dossier — feature-x \(MEDIUM\)/);
    assert.match(result.header, /status=active/);
    assert.equal(result.frontmatter.feature_slug, 'feature-x');
  });

  it('O-03: warn is null when dossier-history.md is absent', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const result = await store.show({ slug: 'feature-x', contextDir });
    assert.equal(result.warn, null);
  });

  it('O-03: warn=history_corrupted when dossier-history.md has read error', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const histPath = path.join(contextDir, 'features', 'feature-x', 'dossier-history.md');
    // Write a valid file then make it a directory (causes read error)
    await fs.mkdir(histPath, { recursive: true });
    const result = await store.show({ slug: 'feature-x', contextDir });
    assert.equal(result.warn, 'history_corrupted');
    // Cleanup the directory we created
    await fs.rmdir(histPath);
  });

  it('O-03: warn is null when dossier-history.md is valid', async () => {
    await store.init({ slug: 'feature-x', contextDir, now: FIXED_NOW });
    const histPath = path.join(contextDir, 'features', 'feature-x', 'dossier-history.md');
    await fs.writeFile(histPath, '# History\n\nSome content.\n', 'utf8');
    const result = await store.show({ slug: 'feature-x', contextDir });
    assert.equal(result.warn, null);
  });
});

describe('dossier/store — parseSections', () => {
  it('splits H2 headings into a map', () => {
    const md = [
      '---', 'k: v', '---',
      '## A', 'a content', '## B', 'b content'
    ].join('\n');
    const out = store.parseSections(md);
    assert.equal(out.A.trim(), 'a content');
    assert.equal(out.B.trim(), 'b content');
  });

  it('returns empty object when there are no H2 headings', () => {
    assert.deepEqual(store.parseSections('just some text'), Object.create(null));
  });
});

describe('dossier/store — parseFrontmatter', () => {
  it('rejects missing frontmatter', () => {
    const result = store.parseFrontmatter('just some text');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_frontmatter');
  });

  it('rejects unclosed frontmatter', () => {
    const result = store.parseFrontmatter('---\nkey: value\n');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unclosed_frontmatter');
  });

  it('rejects invalid frontmatter line', () => {
    const result = store.parseFrontmatter('---\nnot a valid line\n---\n');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_frontmatter_line');
    assert.equal(result.line, 'not a valid line');
  });

  it('accepts valid frontmatter', () => {
    const result = store.parseFrontmatter('---\nfeature_slug: x\n---\n# Body\n');
    assert.equal(result.ok, true);
    assert.equal(result.data.feature_slug, 'x');
    assert.equal(result.body, '# Body\n');
  });

  it('strips surrounding quotes from values', () => {
    const result = store.parseFrontmatter('---\nfeature_slug: "x"\n---\n');
    assert.equal(result.data.feature_slug, 'x');
  });
});
