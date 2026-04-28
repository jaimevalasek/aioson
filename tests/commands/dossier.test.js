'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runDossierInit, runDossierShow } = require('../../src/commands/dossier');

let root;
let prevCwd;

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

beforeEach(async () => {
  prevCwd = process.cwd();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cmd-dossier-'));
  await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.rm(root, { recursive: true, force: true });
});

describe('runDossierInit', () => {
  beforeEach(async () => {
    prevCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cmd-dossier-'));
    await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('AC1: creates dossier at .aioson/context/features/{slug}/dossier.md', async () => {
    const result = await runDossierInit({
      args: ['.'],
      options: { slug: 'feature-x', json: true, classification: 'MEDIUM' },
      logger: silentLogger()
    });
    assert.equal(result.ok, true);
    const expected = path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md');
    assert.equal(result.path, expected);
    assert.equal(fssync.existsSync(expected), true);
  });

  it('AC2: fails with already_exists when dossier already exists', async () => {
    await runDossierInit({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    const result = await runDossierInit({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'already_exists');
  });

  it('AC3: extracts Why/What from prd-{slug}.md when present', async () => {
    const prd = [
      '---', 'feature_slug: feature-x', '---',
      '',
      '## Problem', 'A real pain.', '',
      '## Escopo do MVP', 'Ship it.', ''
    ].join('\n');
    await fs.writeFile(
      path.join(root, '.aioson', 'context', 'prd-feature-x.md'),
      prd
    );
    await runDossierInit({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    const dossier = await fs.readFile(
      path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    assert.match(dossier, /A real pain\./);
    assert.match(dossier, /Ship it\./);
  });

  it('rejects missing slug', async () => {
    const result = await runDossierInit({
      args: ['.'], options: { json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_slug');
  });

  it('rejects invalid slug', async () => {
    const result = await runDossierInit({
      args: ['.'], options: { slug: 'Bad_Slug', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_slug');
  });

  it('rejects invalid classification', async () => {
    const result = await runDossierInit({
      args: ['.'], options: { slug: 'feature-x', classification: 'BIG', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_classification');
  });

  it('reads classification from project.context.md when --classification is omitted', async () => {
    await fs.writeFile(
      path.join(root, '.aioson', 'context', 'project.context.md'),
      '---\nproject_name: x\nclassification: SMALL\n---\n# x\n'
    );
    const result = await runDossierInit({
      args: ['.'], options: { slug: 'feature-y', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.classification, 'SMALL');
  });

  it('accepts --feature as a synonym for --slug', async () => {
    const result = await runDossierInit({
      args: ['.'], options: { feature: 'feature-z', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.slug, 'feature-z');
  });

  it('HIGH-01: prompts for Why/What when PRD is absent (AC-F1-04 / EC-1)', async () => {
    // No prd-feature-x.md exists in this temp dir
    const result = await runDossierInit({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    const dossier = await fs.readFile(
      path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    // Expected: interactive prompt sets created_by to 'dossier-init-prompt'
    // Actual: fallback text with created_by 'dossier-init'
    assert.match(dossier, /created_by: dossier-init-prompt/);
  });
});

describe('runDossierShow', () => {
  it('AC4: renders dossier without error when code-map is empty', async () => {
    await runDossierInit({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    const result = await runDossierShow({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.ok(result.sections.includes('Code Map'));
    assert.equal(result.frontmatter.feature_slug, 'feature-x');
  });

  it('Edge: not_found when slug does not exist', async () => {
    const result = await runDossierShow({
      args: ['.'], options: { slug: 'never', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_found');
  });

  it('rejects missing slug', async () => {
    const result = await runDossierShow({
      args: ['.'], options: { json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_slug');
  });

  it('returns EDOSSIERPARSE for malformed frontmatter', async () => {
    const dir = path.join(root, '.aioson', 'context', 'features', 'broken-fm');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'dossier.md'), 'no frontmatter here');

    const result = await runDossierShow({
      args: ['.'], options: { slug: 'broken-fm', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EDOSSIERPARSE');
  });

  it('returns EDOSSIERSCHEMA for schema-violating frontmatter', async () => {
    const dir = path.join(root, '.aioson', 'context', 'features', 'bad-schema');
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

    const result = await runDossierShow({
      args: ['.'], options: { slug: 'bad-schema', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'EDOSSIERSCHEMA');
    assert.ok(Array.isArray(result.errors));
  });
});
