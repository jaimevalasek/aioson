'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { addCodemap, linkRule, validateFileEntry, VALID_ROLES, VALID_COUPLING, parseYamlCodeMap, serializeCodeMap } = require('../../src/dossier/codemap-store');

const VALID_FM = [
  '---',
  'feature_slug: test-feat',
  'schema_version: "1.0"',
  'created_by: dossier-init',
  'created_at: 2026-01-01T00:00:00Z',
  'status: active',
  'classification: MEDIUM',
  'last_updated_by: dossier-init',
  'last_updated_at: 2026-01-01T00:00:00Z',
  '---'
].join('\n');

const DOSSIER_BODY = [
  '',
  '## Why',
  '',
  'Test why.',
  '',
  '## What',
  '',
  'Test what.',
  '',
  '## Code Map',
  '',
  '```yaml',
  'files: []',
  'modules: []',
  'patterns: []',
  '```',
  '',
  '## Rules & Design-Docs aplicáveis',
  '',
  '_(vazio — populado a partir da Phase 2)_',
  '',
  '## Agent Trail',
  '',
  '_(vazio)_',
  '',
  '## Revision Requests',
  '',
  '_(vazio)_',
  ''
].join('\n');

async function makeCtxDir() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'codemap-test-'));
  const ctxDir = path.join(tmp, '.aioson', 'context');
  await fs.mkdir(ctxDir, { recursive: true });
  return { tmp, ctxDir };
}

async function createDossier(ctxDir, slug = 'test-feat') {
  const dir = path.join(ctxDir, 'features', slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'dossier.md'), VALID_FM + DOSSIER_BODY, 'utf8');
}

describe('codemap-store — validateFileEntry', () => {
  it('accepts valid entry', () => {
    const errs = validateFileEntry({ path: 'src/foo.js', lines: '1-100', role: 'core-module', coupling_risk: 'low' });
    assert.deepEqual(errs, []);
  });
  it('rejects missing path', () => {
    const errs = validateFileEntry({ lines: '1-10', role: 'cli' });
    assert.ok(errs.some(e => e.includes('path')));
  });
  it('rejects invalid lines format', () => {
    const errs = validateFileEntry({ path: 'src/x.js', lines: 'abc' });
    assert.ok(errs.some(e => e.includes('lines')));
  });
  it('rejects invalid role', () => {
    const errs = validateFileEntry({ path: 'src/x.js', role: 'unknown-role' });
    assert.ok(errs.some(e => e.includes('role')));
  });
  it('rejects invalid coupling_risk', () => {
    const errs = validateFileEntry({ path: 'src/x.js', coupling_risk: 'extreme' });
    assert.ok(errs.some(e => e.includes('coupling_risk')));
  });
});

describe('codemap-store — addCodemap', () => {
  let ctxDir, tmp;

  beforeEach(async () => {
    ({ tmp, ctxDir } = await makeCtxDir());
    await createDossier(ctxDir);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('adds a file entry to Code Map', async () => {
    const result = await addCodemap({
      slug: 'test-feat',
      contextDir: ctxDir,
      filePath: 'src/commands/dossier.js',
      lines: '1-180',
      role: 'command-entry',
      coupling: 'low',
      addedBy: 'dev'
    });
    assert.equal(result.added, true);
    const raw = await fs.readFile(path.join(ctxDir, 'features', 'test-feat', 'dossier.md'), 'utf8');
    assert.ok(raw.includes('src/commands/dossier.js'));
    assert.ok(raw.includes('1-180'));
    assert.ok(raw.includes('command-entry'));
  });

  it('is idempotent — same (path, lines) is a no-op', async () => {
    await addCodemap({ slug: 'test-feat', contextDir: ctxDir, filePath: 'src/x.js', lines: '1-50' });
    const result = await addCodemap({ slug: 'test-feat', contextDir: ctxDir, filePath: 'src/x.js', lines: '1-50' });
    assert.equal(result.added, false);
    const raw = await fs.readFile(path.join(ctxDir, 'features', 'test-feat', 'dossier.md'), 'utf8');
    const count = (raw.match(/src\/x\.js/g) || []).length;
    assert.equal(count, 1);
  });

  it('appends multiple distinct files', async () => {
    await addCodemap({ slug: 'test-feat', contextDir: ctxDir, filePath: 'src/a.js' });
    await addCodemap({ slug: 'test-feat', contextDir: ctxDir, filePath: 'src/b.js' });
    const raw = await fs.readFile(path.join(ctxDir, 'features', 'test-feat', 'dossier.md'), 'utf8');
    assert.ok(raw.includes('src/a.js'));
    assert.ok(raw.includes('src/b.js'));
  });

  it('throws EDOSSIERMISSING for unknown slug', async () => {
    await assert.rejects(
      () => addCodemap({ slug: 'no-such', contextDir: ctxDir, filePath: 'src/x.js' }),
      { code: 'EDOSSIERMISSING' }
    );
  });

  it('throws ECODEMAPVALIDATION for bad lines format', async () => {
    await assert.rejects(
      () => addCodemap({ slug: 'test-feat', contextDir: ctxDir, filePath: 'src/x.js', lines: 'bad' }),
      { code: 'ECODEMAPVALIDATION' }
    );
  });

  it('throws EDOSSIERSLUG for invalid slug', async () => {
    await assert.rejects(
      () => addCodemap({ slug: 'Bad Slug!', contextDir: ctxDir, filePath: 'src/x.js' }),
      { code: 'EDOSSIERSLUG' }
    );
  });

  it('O-02: returns warn=file_not_found for non-existent path — still registers', async () => {
    const result = await addCodemap({
      slug: 'test-feat', contextDir: ctxDir,
      filePath: 'src/planned-future-module.js'
    });
    assert.equal(result.added, true);
    assert.equal(result.warn, 'file_not_found');
    const raw = await fs.readFile(path.join(ctxDir, 'features', 'test-feat', 'dossier.md'), 'utf8');
    assert.ok(raw.includes('src/planned-future-module.js'));
  });

  it('O-02: warn is null when file exists on disk', async () => {
    // Create the file relative to the project root (contextDir/../..)
    const projectRoot = path.resolve(ctxDir, '..', '..');
    await fs.writeFile(path.join(projectRoot, 'real-file.js'), '// real', 'utf8');
    const result = await addCodemap({
      slug: 'test-feat', contextDir: ctxDir,
      filePath: 'real-file.js'
    });
    assert.equal(result.added, true);
    assert.equal(result.warn, null);
  });
});

describe('codemap-store — linkRule', () => {
  let ctxDir, tmp, rulesDir;

  beforeEach(async () => {
    ({ tmp, ctxDir } = await makeCtxDir());
    await createDossier(ctxDir);
    rulesDir = path.join(tmp, '.aioson', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, 'disk-first.md'), '# Disk First Rule\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('links an existing rule', async () => {
    const result = await linkRule({
      slug: 'test-feat',
      contextDir: ctxDir,
      rulePath: '.aioson/rules/disk-first.md',
      reason: 'dossier must be file-first',
      targetDir: tmp
    });
    assert.equal(result.added, true);
    const raw = await fs.readFile(path.join(ctxDir, 'features', 'test-feat', 'dossier.md'), 'utf8');
    assert.ok(raw.includes('.aioson/rules/disk-first.md'));
    assert.ok(raw.includes('dossier must be file-first'));
  });

  it('is idempotent — linking same rule twice is a no-op', async () => {
    await linkRule({ slug: 'test-feat', contextDir: ctxDir, rulePath: '.aioson/rules/disk-first.md', targetDir: tmp });
    const result = await linkRule({ slug: 'test-feat', contextDir: ctxDir, rulePath: '.aioson/rules/disk-first.md', targetDir: tmp });
    assert.equal(result.added, false);
    const raw = await fs.readFile(path.join(ctxDir, 'features', 'test-feat', 'dossier.md'), 'utf8');
    // Markdown link format is [text](url) — disk-first.md appears twice per link entry
    // So we count the opening bracket patterns to get the number of link entries
    const count = (raw.match(/\[\.aioson\/rules\/disk-first\.md\]/g) || []).length;
    assert.equal(count, 1);
  });

  it('rejects rule path outside .aioson/rules/ or .aioson/design-docs/', async () => {
    await assert.rejects(
      () => linkRule({ slug: 'test-feat', contextDir: ctxDir, rulePath: 'src/commands/dossier.js', targetDir: tmp }),
      { code: 'ELINKREULEPATH' }
    );
  });

  it('rejects non-existent rule file', async () => {
    await assert.rejects(
      () => linkRule({ slug: 'test-feat', contextDir: ctxDir, rulePath: '.aioson/rules/no-such.md', targetDir: tmp }),
      { code: 'ELINKREULENOTFOUND' }
    );
  });

  it('throws EDOSSIERMISSING for unknown slug', async () => {
    await assert.rejects(
      () => linkRule({ slug: 'no-slug', contextDir: ctxDir, rulePath: '.aioson/rules/disk-first.md', targetDir: tmp }),
      { code: 'EDOSSIERMISSING' }
    );
  });
});

describe('codemap-store — parseYamlCodeMap / serializeCodeMap roundtrip', () => {
  it('parses and serializes empty map', () => {
    const yaml = 'files: []\nmodules: []\npatterns: []';
    const map = parseYamlCodeMap(yaml);
    assert.deepEqual(map.files, []);
    const out = serializeCodeMap(map);
    assert.ok(out.includes('files: []'));
  });

  it('parses file entries', () => {
    const yaml = 'files:\n- path: src/a.js\n  lines: 1-100\n  role: cli\nmodules: []\npatterns: []';
    const map = parseYamlCodeMap(yaml);
    assert.equal(map.files.length, 1);
    assert.equal(map.files[0].path, 'src/a.js');
    assert.equal(map.files[0].lines, '1-100');
    assert.equal(map.files[0].role, 'cli');
  });
});
