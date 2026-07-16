'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runDoctor, applyDoctorFixes } = require('../src/doctor');
const { installTemplate } = require('../src/installer');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-doctor-'));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeValidContext(dir, language = 'en') {
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Node"\nframework_installed: true\nclassification: "MICRO"\nconversation_language: "${language}"\naioson_version: "0.1.9"\n---\n\n# Project Context\n`,
    'utf8'
  );
}

test('doctor reports issues in empty folder', async () => {
  const dir = await makeTempDir();
  const report = await runDoctor(dir);
  assert.equal(report.ok, false);
  assert.equal(report.failedCount > 0, true);
});

test('doctor passes after install and context generation', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');

  const report = await runDoctor(dir);
  assert.equal(report.ok, true);
});

test('doctor fails when context exists but misses required frontmatter fields', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nframework_installed: true\n---\n\n# Project Context\n`,
    'utf8'
  );

  const report = await runDoctor(dir);
  assert.equal(report.ok, false);
  assert.equal(report.checks.some((c) => c.id === 'context:missing:interaction_language'), true);
});

test('doctor --fix restores missing required files safely', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'pt-BR');
  await fs.unlink(path.join(dir, 'AGENTS.md'));

  const before = await runDoctor(dir);
  assert.equal(before.ok, false);
  assert.equal(before.checks.some((c) => c.id === 'file:AGENTS.md' && !c.ok), true);

  const fixResult = await applyDoctorFixes(dir, before);
  assert.equal(fixResult.actions.some((action) => action.id === 'required_files'), true);

  const after = await runDoctor(dir);
  assert.equal(after.ok, true);
});

test('doctor detects and fixes missing design governance docs', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');

  const governancePath = path.join(dir, '.aioson/design-docs/file-size.md');
  await fs.unlink(governancePath);

  const before = await runDoctor(dir);
  assert.equal(before.ok, false);
  assert.equal(
    before.checks.some((c) => c.id === 'design-governance:.aioson/design-docs/file-size.md' && !c.ok),
    true
  );

  const fixResult = await applyDoctorFixes(dir, before);
  assert.equal(
    fixResult.actions.some((action) => action.id === 'design_governance' && action.applied),
    true
  );

  const after = await runDoctor(dir);
  assert.equal(after.ok, true);
  assert.equal(await fileExists(governancePath), true);
});

test('doctor --fix dry-run does not change files', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');
  await fs.unlink(path.join(dir, 'CLAUDE.md'));

  const before = await runDoctor(dir);
  assert.equal(before.ok, false);

  await applyDoctorFixes(dir, before, { dryRun: true });
  const after = await runDoctor(dir);
  assert.equal(after.ok, false);
  assert.equal(after.checks.some((c) => c.id === 'file:CLAUDE.md' && !c.ok), true);
});

test('doctor detects missing OpenCode required file', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');

  await fs.unlink(path.join(dir, 'OPENCODE.md'));

  const report = await runDoctor(dir);
  assert.equal(report.ok, false);
  assert.equal(report.checks.some((c) => c.id === 'file:OPENCODE.md' && !c.ok), true);
});

test('doctor validates Codex gateway contract markers', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');

  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# custom without pointers\n', 'utf8');

  const report = await runDoctor(dir);
  assert.equal(report.ok, false);
  assert.equal(report.checks.some((c) => c.id === 'gateway:codex:contract' && !c.ok), true);
});

test('doctor --fix restores broken gateway contract files safely', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');

  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# broken gateway\n', 'utf8');

  const before = await runDoctor(dir);
  assert.equal(before.ok, false);
  assert.equal(before.checks.some((c) => c.id === 'gateway:codex:contract' && !c.ok), true);

  const fixResult = await applyDoctorFixes(dir, before);
  assert.equal(
    fixResult.actions.some((action) => action.id === 'gateway_contracts' && action.applied),
    true
  );

  const after = await runDoctor(dir);
  assert.equal(after.checks.some((c) => c.id === 'gateway:codex:contract' && !c.ok), false);
  assert.equal(after.ok, true);
});

test('doctor --fix dry-run does not rewrite broken gateway files', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await writeValidContext(dir, 'en');

  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# broken gateway\n', 'utf8');

  const before = await runDoctor(dir);
  assert.equal(before.ok, false);

  const fixResult = await applyDoctorFixes(dir, before, { dryRun: true });
  assert.equal(
    fixResult.actions.some((action) => action.id === 'gateway_contracts' && action.applied),
    true
  );

  const after = await runDoctor(dir);
  assert.equal(after.checks.some((c) => c.id === 'gateway:codex:contract' && !c.ok), true);
});
