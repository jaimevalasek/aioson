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

test('git:guard blocks modern OpenAI project keys (sk-proj-)', async () => {
  const dir = await makeRepo();
  try {
    const modernKey = ['sk', 'proj', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd'].join('-');
    await writeFile(dir, 'src/provider.js', `const apiKey = "${modernKey}";\n`);
    git(dir, ['add', '--', 'src/provider.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'openai_secret'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard blocks Anthropic keys (sk-ant-)', async () => {
  const dir = await makeRepo();
  try {
    const anthropicKey = ['sk', 'ant', 'api03', 'xK9mP2vL8qR5tY7uW3zA1b2C4d'].join('-');
    await writeFile(dir, 'src/provider.js', `const apiKey = "${anthropicKey}";\n`);
    git(dir, ['add', '--', 'src/provider.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'openai_secret'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard ignores lowercase kebab-case sk- lookalikes without upper/digit', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'src/theme.js', "const cssClass = 'sk-this-is-not-an-actual-key-here';\n");
    git(dir, ['add', '--', 'src/theme.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
    assert.equal(result.errors.some((item) => item.id === 'openai_secret'), false);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard blocks single-line PEM flattened with escaped newlines (.env style)', async () => {
  const dir = await makeRepo();
  try {
    const payload = `MIIE${'A1b2C3d4E5f6G7h8'.repeat(5)}`;
    const flattenedPem = ['-----BEGIN PRIVATE KEY-----', payload, '-----END PRIVATE KEY-----'].join('\\n');
    await writeFile(dir, 'config/secrets.env', `CREDENTIAL="${flattenedPem}"\n`);
    git(dir, ['add', '--', 'config/secrets.env']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'private_key_block'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard still ignores flattened PEM markers without cryptographic payload', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'src/sample.js', 'const sample = "-----BEGIN PRIVATE KEY-----\\nredacted";\n');
    git(dir, ['add', '--', 'src/sample.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
    assert.equal(result.errors.some((item) => item.id === 'private_key_block'), false);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard warns on JSON/dict quoted secret keys', async () => {
  const dir = await makeRepo();
  try {
    const realistic = ['xK9mP2vL8', 'qR5tY7u'].join('');
    await writeFile(dir, 'src/config.json', `${JSON.stringify({ password: realistic })}\n`);
    git(dir, ['add', '--', 'src/config.json']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true, allowWarnings: false },
      logger: makeLogger()
    });

    assert.ok(result.warnings.some((item) => item.id === 'generic_secret_assignment'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard warns on unquoted shell-style secret assignments', async () => {
  const dir = await makeRepo();
  try {
    const realistic = ['xK9mP2vL8', 'qR5tY7u'].join('');
    await writeFile(dir, 'deploy.sh', `export SECRET_TOKEN=${realistic}\n`);
    git(dir, ['add', '--', 'deploy.sh']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true, allowWarnings: false },
      logger: makeLogger()
    });

    assert.ok(result.warnings.some((item) => item.id === 'generic_secret_assignment'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard ignores unquoted non-literal right-hand sides', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'src/cli.js',
      [
        'const token = requireToken(config, t);',
        'const apiSecret = process.env.API_SECRET_123;',
        'if (token === storedToken123456) { noop(); }',
        'const RETRY_TOKEN_COUNT = 300012;',
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
    const realisticToken = ['sk', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6'].join('-');
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
      `OPENAI_API_KEY=${realisticToken}\n`
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
      // aioson-secret: fixture
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

test('git:guard ignores private-key marker references without cryptographic payload', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'src/package-validator.js',
      [
        'const markers = [',
        '  "-----BEGIN PRIVATE KEY-----",',
        '  "-----BEGIN ENCRYPTED PRIVATE KEY-----",',
        '  "-----BEGIN RSA PRIVATE KEY-----",',
        '  "-----BEGIN EC PRIVATE KEY-----",',
        '  "-----BEGIN DSA PRIVATE KEY-----",',
        '  "-----BEGIN OPENSSH PRIVATE KEY-----"',
        '];',
        ''
      ].join('\n')
    );
    await writeFile(
      dir,
      'tests/package-validator.test.js',
      'const redactedSample = "-----BEGIN OPENSSH PRIVATE KEY-----\\nredacted";\n'
    );
    git(dir, ['add', '--', 'src/package-validator.js', 'tests/package-validator.test.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
    assert.equal(result.errors.some((item) => item.id === 'private_key_block'), false);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard still blocks plausible private-key payload', async () => {
  const dir = await makeRepo();
  try {
    const payload = `MIIE${'A1b2C3d4E5f6G7h8'.repeat(5)}`;
    await writeFile(
      dir,
      'src/private-key.txt',
      `-----BEGIN PRIVATE KEY-----\n${payload}\n-----END PRIVATE KEY-----\n`
    );
    git(dir, ['add', '--', 'src/private-key.txt']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.id === 'private_key_block'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard ignores natural-language i18n values whose keys mention token', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'src/i18n/messages/en.js',
      // aioson-secret: fixture
      'module.exports = { login_no_token: "No token provided. Please sign in again." };\n'
    );
    git(dir, ['add', '--', 'src/i18n/messages/en.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings, null, 2));
    assert.equal(result.warnings.some((item) => item.id === 'generic_secret_assignment'), false);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard does not treat whitespace as safe for runtime password assignments', async () => {
  const dir = await makeRepo();
  try {
    // aioson-secret: fixture
    await writeFile(dir, 'src/config.js', "const PASSWORD = 'correct horse battery staple';\n");
    git(dir, ['add', '--', 'src/config.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((item) => item.id === 'generic_secret_assignment'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard suppresses explicitly fake generic credentials in test fixtures', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'tests/auth.test.js', "const FAKE_API_TOKEN = 'test-secret-abc123';\n");
    git(dir, ['add', '--', 'tests/auth.test.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
    assert.ok(result.suppressed.some((item) => item.id === 'generic_secret_assignment'));
    assert.equal(result.summary.suppressedCount > 0, true);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard suppresses deterministic owner identifiers in tests and smoke scripts', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'tests/operation-lock.test.js',
      'const row = { ownerToken: "another-owner" };\n'
    );
    await writeFile(
      dir,
      'scripts/smoke-operation-lock.mjs',
      'const data = { ownerToken: "00000000-0000-4000-8000-000000000001" };\n'
    );
    git(dir, ['add', '--', 'tests/operation-lock.test.js', 'scripts/smoke-operation-lock.mjs']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
    assert.equal(
      result.suppressed.filter((item) => item.id === 'generic_secret_assignment').length,
      2
    );
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard still warns on realistic generic secrets in smoke scripts', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'scripts/smoke-provider.mjs',
      // aioson-secret: fixture
      "const ownerToken = 'A1b2C3d4E5f6G7h8';\n"
    );
    git(dir, ['add', '--', 'scripts/smoke-provider.mjs']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((item) => item.id === 'generic_secret_assignment'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard recognizes obviously synthetic provider literals in test fixtures', async () => {
  const dir = await makeRepo();
  try {
    const syntheticToken = ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
    await writeFile(dir, 'fixtures/redactor.js', `const token = '${syntheticToken}';\n`);
    git(dir, ['add', '--', 'fixtures/redactor.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
    assert.ok(result.suppressed.some((item) => item.id === 'openai_secret'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard ignores template interpolation used to build detector fixtures', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      'tests/writer.test.js',
      "const snippet = `const API_TOKEN = '${realisticToken}'`;\n"
    );
    git(dir, ['add', '--', 'tests/writer.test.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard recognizes explicit custom keys as synthetic in test fixtures', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(dir, 'tests/config.test.js', "const config = { api_key: 'sk-custom' };\n");
    git(dir, ['add', '--', 'tests/config.test.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
    assert.ok(result.suppressed.some((item) => item.id === 'generic_secret_assignment'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard suppresses synthetic provider tokens only with fixture evidence', async () => {
  const dir = await makeRepo();
  try {
    const syntheticToken = ['ghp', 'fakefakefakefakefakefakefakefake'].join('_');
    await writeFile(
      dir,
      'tests/github.fixture.js',
      `const FAKE_GITHUB_TOKEN = '${syntheticToken}';\n`
    );
    git(dir, ['add', '--', 'tests/github.fixture.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, true, JSON.stringify(result.warnings.concat(result.errors), null, 2));
    assert.ok(result.suppressed.some((item) => item.id === 'github_token'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard still blocks realistic provider secrets placed in tests', async () => {
  const dir = await makeRepo();
  try {
    const realisticToken = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6'].join('_');
    await writeFile(dir, 'tests/unsafe.test.js', `const token = '${realisticToken}';\n`);
    git(dir, ['add', '--', 'tests/unsafe.test.js']);

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

test('git:guard does not trust fixture identifiers without synthetic value evidence', async () => {
  const dir = await makeRepo();
  try {
    const realisticGenericSecret = ['A1b2C3d4', 'E5f6G7h8'].join('');
    await writeFile(
      dir,
      'tests/unsafe-generic.test.js',
      `const FAKE_API_TOKEN = '${realisticGenericSecret}';\n`
    );
    git(dir, ['add', '--', 'tests/unsafe-generic.test.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((item) => item.id === 'generic_secret_assignment'));
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard fixture sentinel is effective only inside test or fixture paths', async () => {
  const fixtureDir = await makeRepo();
  const runtimeDir = await makeRepo();
  const realisticToken = ['ghp', 'Q7w8E9r0T1y2U3i4O5p6A7s8D9f0G1h2'].join('_');
  const content = `// aioson-secret: fixture\nconst TOKEN = '${realisticToken}';\n`;
  try {
    await writeFile(fixtureDir, 'fixtures/provider.js', content);
    git(fixtureDir, ['add', '--', 'fixtures/provider.js']);
    const fixtureResult = await runGitGuard({
      args: [fixtureDir],
      options: { json: true },
      logger: makeLogger()
    });
    assert.equal(fixtureResult.ok, true, JSON.stringify(fixtureResult.errors, null, 2));
    assert.ok(fixtureResult.suppressed.some((item) => item.id === 'github_token'));

    process.exitCode = 0;
    await writeFile(runtimeDir, 'src/provider.js', content);
    git(runtimeDir, ['add', '--', 'src/provider.js']);
    const runtimeResult = await runGitGuard({
      args: [runtimeDir],
      options: { json: true },
      logger: makeLogger()
    });
    assert.equal(runtimeResult.ok, false);
    assert.ok(runtimeResult.errors.some((item) => item.id === 'github_token'));
  } finally {
    process.exitCode = 0;
    await fs.rm(fixtureDir, { recursive: true, force: true });
    await fs.rm(runtimeDir, { recursive: true, force: true });
  }
});

test('git:guard contentAllowRules suppresses only the named detector rule', async () => {
  const dir = await makeRepo();
  try {
    const realisticToken = ['ghp', 'Z1x2C3v4B5n6M7a8S9d0F1g2H3j4K5l6'].join('_');
    await writeFile(
      dir,
      '.aioson/git-guard.json',
      `${JSON.stringify({
        version: 1,
        allowPaths: [],
        contentAllowPaths: [],
        contentAllowRules: [{
          path: 'src/provider.js',
          rules: ['github_token'],
          reason: 'intentional detector fixture'
        }],
        blockPaths: [],
        allowExtensions: [],
        blockExtensions: []
      }, null, 2)}\n`
    );
    await writeFile(dir, 'src/provider.js', `const API_TOKEN = '${realisticToken}';\n`);
    git(dir, ['add', '--', '.aioson/git-guard.json', 'src/provider.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.errors.some((item) => item.id === 'github_token'), false);
    assert.ok(result.suppressed.some((item) => item.id === 'github_token'));
    assert.ok(result.warnings.some((item) => item.id === 'generic_secret_assignment'));
    assert.equal(result.ok, false, 'the unrelated generic warning must remain blocking');
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('SF-aioson-01: git:guard ignores unstaged contentAllowRules while scanning staged source', async () => {
  const dir = await makeRepo();
  try {
    const realisticToken = ['ghp', 'H1j2K3l4M5n6P7q8R9s0T1u2V3w4X5y6'].join('_');
    await writeFile(
      dir,
      '.aioson/git-guard.json',
      `${JSON.stringify({
        version: 1,
        contentAllowRules: [{
          path: 'src/provider.js',
          rules: ['github_token'],
          reason: 'must be staged with the source change'
        }]
      }, null, 2)}\n`
    );
    await writeFile(dir, 'src/provider.js', `const API_TOKEN = '${realisticToken}';\n`);
    git(dir, ['add', '--', 'src/provider.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.equal(result.policy.source, 'index');
    assert.equal(result.policy.loaded, false);
    assert.ok(result.errors.some((item) => item.id === 'github_token'));
    assert.equal(result.suppressed.some((item) => item.id === 'github_token'), false);
  } finally {
    process.exitCode = 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('git:guard rejects malformed contentAllowRules configuration', async () => {
  const dir = await makeRepo();
  try {
    await writeFile(
      dir,
      '.aioson/git-guard.json',
      `${JSON.stringify({ version: 1, contentAllowRules: [{ path: 'src/index.js', rules: [], reason: 'bad' }] })}\n`
    );
    await writeFile(dir, 'src/index.js', 'module.exports = true;\n');
    git(dir, ['add', '--', '.aioson/git-guard.json', 'src/index.js']);

    const result = await runGitGuard({
      args: [dir],
      options: { json: true },
      logger: makeLogger()
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, 'git_guard_failed');
    assert.match(result.message, /contentAllowRules/);
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
