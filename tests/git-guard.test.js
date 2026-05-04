'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { runGitGuard } = require('../src/commands/git-guard');
const ROOT = path.resolve(__dirname, '..');

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-git-guard-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

async function writeFile(dir, relPath, content) {
  const target = path.join(dir, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function git(dir, args) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

function gitOutput(dir, args, options = {}) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options.env || process.env
  });
}

function makeLogger() {
  return {
    log() {},
    error() {}
  };
}

test('git:guard passes for a normal staged source file', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'src/index.js', 'console.log("ok");\n');
    git(dir, ['add', '--', 'src/index.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.stagedCount, 1);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard blocks .env files in the stage', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, '.env', 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n');
    git(dir, ['add', '--', '.env']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'env_file'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard blocks dependency directories like node_modules', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'node_modules/pkg/index.js', 'module.exports = 1;\n');
    git(dir, ['add', '--', 'node_modules/pkg/index.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'dependency_dir'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard blocks warning-class junk files in strict mode by default', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'notes.bak', 'temporary backup\n');
    git(dir, ['add', '--', 'notes.bak']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((item) => item.id === 'backup_suffix'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard can allow warnings explicitly but still blocks hard errors', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'notes.bak', 'temporary backup\n');
    git(dir, ['add', '--', 'notes.bak']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true, 'allow-warnings': true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((item) => item.id === 'backup_suffix'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard detects high-risk secret tokens in staged content', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'src/config.js',
      `export const token = "ghp_${'a'.repeat(36)}";\n`
    );
    git(dir, ['add', '--', 'src/config.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'github_token'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard allowPaths suppresses path-based findings but not content secret detection', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      '.aioson/git-guard.json',
      `${JSON.stringify({
        version: 1,
        allowPaths: ['fixtures/**/*.env'],
        blockPaths: [],
        allowExtensions: [],
        blockExtensions: []
      }, null, 2)}\n`
    );
    await writeFile(
      dir,
      'fixtures/local/dev.env',
      'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n'
    );
    git(dir, ['add', '--', '.aioson/git-guard.json', 'fixtures/local/dev.env']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some((item) => item.id === 'env_file'), false);
    assert.equal(result.errors.some((item) => item.id === 'openai_secret'), true);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard blockPaths can deny project-specific junk paths', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      '.aioson/git-guard.json',
      `${JSON.stringify({
        version: 1,
        allowPaths: [],
        blockPaths: ['notes/**', '*.scratch.md'],
        allowExtensions: [],
        blockExtensions: []
      }, null, 2)}\n`
    );
    await writeFile(dir, 'notes/meeting.md', 'internal notes\n');
    git(dir, ['add', '--', '.aioson/git-guard.json', 'notes/meeting.md']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.some((item) => item.id === 'config_block_path'), true);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard ignores function-call assignments to token/secret variables', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'src/cli.js',
      [
        "const token = requireToken(config, t);",
        "const apiSecret = readSecret('foo');",
        "const password = await prompts.password();",
        ''
      ].join('\n')
    );
    git(dir, ['add', '--', 'src/cli.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
    assert.equal(result.warnings.some((item) => item.id === 'generic_secret_assignment'), false);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard still warns on literal-string secret assignments', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'src/leaked.js',
      "const API_TOKEN = 'abcd1234efgh5678';\n"
    );
    git(dir, ['add', '--', 'src/leaked.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true, allowWarnings: false },
      logger: makeLogger()
    });

    assert.equal(result.warnings.some((item) => item.id === 'generic_secret_assignment'), true);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard --install-hook creates a managed pre-commit hook', async () => {
  const dir = await makeRepo();
  try {
    const result = await runGitGuard({
      args: [dir],
      options: { json: true, 'install-hook': true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true);
    const hookContent = await fs.readFile(result.hookPath, 'utf8');
    assert.equal(hookContent.includes('# aioson-git-guard-hook'), true);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard hook installation preserves and restores a pre-existing hook with --force', async () => {
  const dir = await makeRepo();
  try {
    const hookPath = path.join(dir, '.git/hooks/pre-commit');
    await writeFile(dir, '.git/hooks/pre-commit', '#!/bin/sh\necho legacy-hook\n');
    await fs.chmod(hookPath, 0o755);

    const install = await runGitGuard({
      args: [dir],
      options: { json: true, 'install-hook': true, force: true },
      logger: makeLogger()
    });

    assert.equal(install.ok, true);
    assert.equal(install.backedUpExistingHook, true);
    assert.equal(await fs.readFile(install.backupPath, 'utf8'), '#!/bin/sh\necho legacy-hook\n');

    const uninstall = await runGitGuard({
      args: [dir],
      options: { json: true, 'uninstall-hook': true },
      logger: makeLogger()
    });

    assert.equal(uninstall.ok, true);
    assert.equal(uninstall.restoredBackup, true);
    assert.equal(await fs.readFile(hookPath, 'utf8'), '#!/bin/sh\necho legacy-hook\n');
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('managed pre-commit hook blocks unsafe commits outside @committer', async () => {
  const dir = await makeRepo();
  const binDir = path.join(dir, '.test-bin');
  try {
    await writeFile(
      dir,
      `${path.relative(dir, path.join(binDir, 'aioson'))}`,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(ROOT, 'bin/aioson.js'))} "$@"\n`
    );
    await fs.chmod(path.join(binDir, 'aioson'), 0o755);

    const install = await runGitGuard({
      args: [dir],
      options: { json: true, 'install-hook': true },
      logger: makeLogger()
    });
    assert.equal(install.ok, true);

    await writeFile(dir, '.env', 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n');
    git(dir, ['add', '--', '.env']);

    assert.throws(() => {
      gitOutput(dir, ['commit', '-m', 'test'], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`
        }
      });
    }, /Command failed/);

    const staged = gitOutput(dir, ['diff', '--cached', '--name-only']);
    assert.equal(staged.includes('.env'), true);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
