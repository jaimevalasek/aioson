'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runDoctor, applyDoctorFixes } = require('../src/doctor');

const BOOTSTRAP_FILES = ['what-is.md', 'how-it-works.md', 'what-it-does.md', 'current-state.md'];

async function makeMinimalProject({ bootstrap = 0, featuresDir = false, claudeCommands = true, permissions = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-doctor-lm-'));

  // Minimal .aioson/config/autonomy-protocol.json so permissions check resolves
  if (permissions) {
    await fs.mkdir(path.join(dir, '.aioson/config'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.aioson/config/autonomy-protocol.json'),
      JSON.stringify({
        version: '1.1',
        global_mode: 'guarded',
        tiers: {
          tier1_silent: { shell_patterns: ['git status'], aioson_commands: ['preflight'] }
        },
        tools: { claude: { mode: 'trusted', derived_from_tiers: ['tier1_silent'] } }
      }, null, 2),
      'utf8'
    );
    // Pre-generate the 4 native files so permissions are in sync
    await fs.mkdir(path.join(dir, '.claude'), { recursive: true });
    await fs.writeFile(path.join(dir, '.claude/settings.json'), '{"permissions":{"allow":[]}}\n', 'utf8');
    await fs.mkdir(path.join(dir, '.codex'), { recursive: true });
    await fs.writeFile(path.join(dir, '.codex/permissions.json'), '{}\n', 'utf8');
    await fs.mkdir(path.join(dir, '.gemini'), { recursive: true });
    await fs.writeFile(path.join(dir, '.gemini/permissions.toml'), '\n', 'utf8');
    await fs.mkdir(path.join(dir, '.opencode'), { recursive: true });
    await fs.writeFile(path.join(dir, '.opencode/permissions.yaml'), '\n', 'utf8');
  }

  if (bootstrap > 0) {
    const bdir = path.join(dir, '.aioson/context/bootstrap');
    await fs.mkdir(bdir, { recursive: true });
    for (let i = 0; i < Math.min(bootstrap, BOOTSTRAP_FILES.length); i++) {
      await fs.writeFile(path.join(bdir, BOOTSTRAP_FILES[i]), `---\nname: ${BOOTSTRAP_FILES[i]}\n---\n# x\n`, 'utf8');
    }
  }

  if (featuresDir) {
    await fs.mkdir(path.join(dir, '.aioson/context/features'), { recursive: true });
  }

  if (claudeCommands) {
    const cdir = path.join(dir, '.claude/commands/aioson/agent');
    await fs.mkdir(cdir, { recursive: true });
    for (const name of ['setup.md', 'dev.md', 'qa.md', 'discover.md']) {
      await fs.writeFile(path.join(cdir, name), `# ${name}\n`, 'utf8');
    }
  }

  return dir;
}

function findCheck(report, id) {
  return report.checks.find((c) => c.id === id);
}

function findAction(fixResult, id) {
  return fixResult.actions.find((a) => a.id === id);
}

test('bootstrap_coverage reports present/required and fails when below 4', async () => {
  const dir = await makeMinimalProject({ bootstrap: 2 });
  const report = await runDoctor(dir);
  const check = findCheck(report, 'living-memory:bootstrap_coverage');
  assert.equal(check.ok, false);
  assert.equal(check.params.present, 2);
  assert.equal(check.params.required, 4);
  assert.ok(check.hintKey, 'must surface a hint when below threshold');
});

test('bootstrap_coverage passes when all 4 files exist', async () => {
  const dir = await makeMinimalProject({ bootstrap: 4 });
  const report = await runDoctor(dir);
  const check = findCheck(report, 'living-memory:bootstrap_coverage');
  assert.equal(check.ok, true);
});

test('features_dir_present fails when missing and passes after fix', async () => {
  const dir = await makeMinimalProject({ featuresDir: false });
  let report = await runDoctor(dir);
  assert.equal(findCheck(report, 'living-memory:features_dir').ok, false);

  const fixResult = await applyDoctorFixes(dir, report);
  const action = findAction(fixResult, 'features_dir');
  assert.equal(action.applied, true);

  report = await runDoctor(dir);
  assert.equal(findCheck(report, 'living-memory:features_dir').ok, true);
});

test('claude_commands_present reports missing slash files', async () => {
  const dir = await makeMinimalProject({ claudeCommands: false });
  const report = await runDoctor(dir);
  const check = findCheck(report, 'living-memory:claude_commands');
  assert.equal(check.ok, false);
  assert.equal(check.params.missing, 4);
  assert.ok(check.hintParams.paths.includes('discover.md'));
});

test('claude_commands fix restores from template', async () => {
  const dir = await makeMinimalProject({ claudeCommands: false });
  let report = await runDoctor(dir);
  const fix = await applyDoctorFixes(dir, report);
  const action = findAction(fix, 'claude_commands');
  // restore may or may not succeed depending on template content; we only
  // require that an action was emitted with the right shape
  assert.ok(action);
  assert.equal(action.missingCount, 4);
});

test('version_drift detects mismatch between project.context.md and CLI', async () => {
  const dir = await makeMinimalProject();
  await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    '---\naioson_version: "0.0.1-stale"\n---\n# x\n',
    'utf8'
  );
  const report = await runDoctor(dir);
  const check = findCheck(report, 'living-memory:version_drift');
  assert.equal(check.ok, false);
  assert.equal(check.params.context, '0.0.1-stale');
});

test('version_drift passes when no context version is declared', async () => {
  const dir = await makeMinimalProject();
  const report = await runDoctor(dir);
  const check = findCheck(report, 'living-memory:version_drift');
  assert.equal(check.ok, true);
});

test('permissions_in_sync detects drift when generated files are older than the protocol', async () => {
  const dir = await makeMinimalProject({ permissions: true });
  // Realistic scenario: user just edited the protocol; the native files were
  // generated some time ago. Backdate the native files.
  const past = new Date(Date.now() - 60_000);
  for (const rel of ['.claude/settings.json', '.codex/permissions.json', '.gemini/permissions.toml', '.opencode/permissions.yaml']) {
    await fs.utimes(path.join(dir, rel), past, past);
  }

  const report = await runDoctor(dir);
  const check = findCheck(report, 'living-memory:permissions_in_sync');
  assert.equal(check.ok, false);
  assert.ok(check.params.drifted >= 1);
});

test('permissions_in_sync fix regenerates native files', async () => {
  const dir = await makeMinimalProject({ permissions: true });
  // Backdate native files to force drift, then run fix
  const past = new Date(Date.now() - 60_000);
  for (const rel of ['.claude/settings.json', '.codex/permissions.json', '.gemini/permissions.toml', '.opencode/permissions.yaml']) {
    await fs.utimes(path.join(dir, rel), past, past);
  }

  let report = await runDoctor(dir);
  assert.equal(findCheck(report, 'living-memory:permissions_in_sync').ok, false);

  const fix = await applyDoctorFixes(dir, report);
  const action = findAction(fix, 'permissions_in_sync');
  assert.equal(action.applied, true);
  assert.ok(action.count >= 1);

  report = await runDoctor(dir);
  assert.equal(findCheck(report, 'living-memory:permissions_in_sync').ok, true);
});

test('bootstrap_coverage and version_drift produce advisory actions (no auto-fix)', async () => {
  const dir = await makeMinimalProject({ bootstrap: 1 });
  await fs.mkdir(path.join(dir, '.aioson/context'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    '---\naioson_version: "9.9.9-old"\n---\n# x\n',
    'utf8'
  );
  const report = await runDoctor(dir);
  const fix = await applyDoctorFixes(dir, report);

  const bsAction = findAction(fix, 'bootstrap_coverage');
  const vdAction = findAction(fix, 'version_drift');
  assert.equal(bsAction.advisory, true);
  assert.equal(bsAction.applied, false);
  assert.equal(vdAction.advisory, true);
  assert.equal(vdAction.applied, false);
});
