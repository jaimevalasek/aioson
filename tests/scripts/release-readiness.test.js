'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  parseArgs,
  extractPackFiles,
  validatePackContents,
  filterUntrackedShippedFiles,
  collectLocalSpecifiers,
  findMissingLocalDependencies,
  resolveCommandInvocation,
  parseGithubRemote,
  summarizeCiRuns,
  readCiStatus,
  runReleaseReadiness
} = require('../../scripts/testing/release-readiness');

test('release readiness arguments keep the strict quick gate as the default', () => {
  assert.deepEqual(parseArgs([]), {
    full: false,
    allowUntracked: false,
    allowRedCi: false,
    json: false
  });
  assert.deepEqual(parseArgs(['--full', '--allow-untracked', '--allow-red-ci', '--json']), {
    full: true,
    allowUntracked: true,
    allowRedCi: true,
    json: true
  });
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
  assert.deepEqual(resolveCommandInvocation('npm', ['test'], { platform: 'linux' }), {
    command: 'npm',
    args: ['test']
  });
});

test('package inventory parsing requires the release-critical files', () => {
  const files = extractPackFiles([{
    files: [
      { path: 'package.json' },
      { path: 'bin\\aioson.js' },
      { path: 'src/cli.js' }
    ]
  }]);
  assert.deepEqual(files, ['package.json', 'bin/aioson.js', 'src/cli.js']);
  assert.deepEqual(
    validatePackContents(files, ['package.json', 'src/cli.js', 'template/AGENTS.md']),
    ['template/AGENTS.md']
  );
});

test('untracked package guard ignores tests but catches every shipped root', () => {
  const output = [
    'tests/new-test.test.js',
    'src/new-runtime.js',
    'scripts/testing/new-gate.js',
    'template/.aioson/new.md',
    'notes/local.md'
  ].join('\n');
  assert.deepEqual(filterUntrackedShippedFiles(output), [
    'scripts/testing/new-gate.js',
    'src/new-runtime.js',
    'template/.aioson/new.md'
  ]);
});

test('static dependency extraction covers CommonJS and ESM literals only', () => {
  const source = [
    "const a = require('./a');",
    "require.resolve('../b.json');",
    "const c = import('./c.js');",
    "export { d } from './d.js';",
    "require(variable);",
    "// require('./comment-only');",
    "const generated = `require('./generated-text')`;",
    "const quoted = \"require('./quoted-text')\";"
  ].join('\n');
  assert.deepEqual(
    collectLocalSpecifiers(source).sort(),
    ['./a', './c.js', './d.js', '../b.json'].sort()
  );
});

test('package closure reports a local runtime module excluded from the tarball', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-release-readiness-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'entry.js'), "require('./worker');\n", 'utf8');
  await fs.writeFile(path.join(root, 'src', 'worker.js'), 'module.exports = true;\n', 'utf8');

  assert.deepEqual(
    await findMissingLocalDependencies(root, ['src/entry.js']),
    [{
      source: 'src/entry.js',
      specifier: './worker',
      resolved: 'src/worker.js'
    }]
  );
  assert.deepEqual(
    await findMissingLocalDependencies(root, ['src/entry.js', 'src/worker.js']),
    []
  );
});

// ── CI verdict ───────────────────────────────────────────────────────────────
// Every CI and Release run failed from 2026-08-21 to 2026-09-10 while eight
// versions were cut on top of it: nothing read the verdict. These pin the read.
const run = (conclusion, sha, createdAt, extra = {}) => ({
  name: 'CI', path: '.github/workflows/ci.yml', status: 'completed', conclusion,
  head_sha: sha, created_at: createdAt, html_url: `https://github.example/runs/${sha}`, ...extra
});

test('the CI summary reads green, a red streak since its first failure, and unknown without runs', () => {
  assert.equal(summarizeCiRuns([run('success', 'a1', '2026-09-10')]).state, 'green');
  const red = summarizeCiRuns([
    { name: 'Release', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'failure', head_sha: 'r0' },
    { name: 'CI', path: '.github/workflows/ci.yml', status: 'in_progress', conclusion: null, head_sha: 'p0' },
    run('failure', 'c3', '2026-09-08'),
    run('failure', 'c2', '2026-09-03'),
    run('success', 'c1', '2026-08-20')
  ]);
  assert.equal(red.state, 'red');
  assert.equal(red.sha, 'c3');
  assert.equal(red.consecutive_failures, 2);
  assert.equal(red.since, '2026-09-03');
  assert.equal(red.no_green_in_window, false);
  assert.equal(summarizeCiRuns([run('failure', 'x', '2026-09-01')]).no_green_in_window, true);
  assert.equal(summarizeCiRuns([]).state, 'unknown');
});

test('only a GitHub origin is read — ssh and https forms', () => {
  assert.equal(parseGithubRemote('git@github.com:jaimevalasek/aioson.git'), 'jaimevalasek/aioson');
  assert.equal(parseGithubRemote('https://github.com/jaimevalasek/aioson.git\n'), 'jaimevalasek/aioson');
  assert.equal(parseGithubRemote('https://github.com/jaimevalasek/aioson'), 'jaimevalasek/aioson');
  assert.equal(parseGithubRemote('https://gitlab.example/team/repo.git'), null);
});

test('an unreachable API is unknown and never blocks; inside GitHub Actions the read is skipped', async () => {
  const runner = async (command, args) => (args[0] === 'remote'
    ? { code: 0, stdout: 'git@github.com:acme/tool.git\n' }
    : { code: 0, stdout: 'main\n' });
  const offline = await readCiStatus('.', { runner, env: {}, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  assert.equal(offline.state, 'unknown');
  assert.match(offline.reason, /ENOTFOUND/);
  const limited = await readCiStatus('.', { runner, env: {}, fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.equal(limited.state, 'unknown');
  const inActions = await readCiStatus('.', { runner, env: { GITHUB_ACTIONS: 'true' }, fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal(inActions.state, 'skipped');
  const red = await readCiStatus('.', {
    runner,
    env: {},
    fetchImpl: async (url) => {
      assert.match(url, /repos\/acme\/tool\/actions\/runs\?branch=main/);
      return { ok: true, json: async () => ({ workflow_runs: [run('failure', 'deadbeef1', '2026-09-08')] }) };
    }
  });
  assert.equal(red.state, 'red');
  assert.equal(red.repository, 'acme/tool');
  assert.equal(red.branch, 'main');
});

test('the release gate refuses a red CI unless --allow-red-ci names it, and records the verdict either way', async () => {
  const commands = [];
  const runner = async (command, args) => {
    commands.push(`${command} ${args.join(' ')}`);
    if (command === 'npm' && args[0] === 'pack') {
      return { code: 0, stdout: JSON.stringify([{ files: ['package.json', 'bin/aioson.js', 'src/cli.js', 'template/AGENTS.md', 'template/.aioson/config.md'].map((p) => ({ path: p })) }]) };
    }
    return { code: 0, stdout: '' };
  };
  const redCi = async () => ({ state: 'red', conclusion: 'failure', sha: 'deadbeef1', url: 'https://github.example/runs/1', consecutive_failures: 12, since: '2026-08-21', no_green_in_window: true, repository: 'acme/tool', branch: 'main' });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-release-ci-'));
  try {
    for (const file of ['bin/aioson.js', 'src/cli.js']) {
      await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
      await fs.writeFile(path.join(root, file), "'use strict';\n", 'utf8');
    }
    await assert.rejects(
      runReleaseReadiness({ projectRoot: root, runner, readCiStatus: redCi, json: true }),
      /CI is red on acme\/tool@main: every one of the last 12 completed CI run\(s\) failed \(no green run since at least 2026-08-21\)[\s\S]*--allow-red-ci/
    );
    assert.equal(commands.some((line) => line.startsWith('npm pack')), false, 'nothing past the CI read runs on a red verdict');
    const allowed = await runReleaseReadiness({ projectRoot: root, runner, readCiStatus: redCi, allowRedCi: true, json: true });
    const check = allowed.checks.find((entry) => entry.id === 'ci-status');
    assert.equal(allowed.ok, true);
    assert.equal(check.state, 'red');
    assert.equal(check.allowed, true);
    const green = await runReleaseReadiness({ projectRoot: root, runner, readCiStatus: async () => ({ state: 'green', sha: 'c0ffee' }), json: true });
    assert.equal(green.checks.find((entry) => entry.id === 'ci-status').ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
