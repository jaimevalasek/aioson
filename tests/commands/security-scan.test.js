'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { runSecurityScan } = require('../../src/commands/security-scan');
const { EXIT_CODES } = require('../../src/lib/security/exit-codes');
const { openRuntimeDb } = require('../../src/runtime-store');

const FAKE_STRIPE_KEY = 'sk_live_' + 'abcdefghijklmnopqrstuvwxyz1234567890';

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

let prevCwd;
let prevExitCode;
let root;

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-secscan-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

function runCli(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [path.join(process.cwd(), 'bin/aioson.js'), ...args], {
    cwd,
    encoding: 'utf8'
  });
}

describe('security:scan', () => {
  beforeEach(() => {
    prevCwd = process.cwd();
    prevExitCode = process.exitCode;
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    process.exitCode = prevExitCode;
    if (root) {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      root = null;
    }
  });

  it('returns BAD_INPUT for invalid stage', async () => {
    root = await makeProject();
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'bogus', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BAD_INPUT);
    assert.equal(r.reason, 'invalid_stage');
  });

  it('returns BAD_INPUT for missing project path', async () => {
    const fake = path.join(os.tmpdir(), `does-not-exist-${Date.now()}`);
    const r = await runSecurityScan({
      args: [fake],
      options: { stage: 'analyst', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BAD_INPUT);
    assert.equal(r.reason, 'project_not_found');
  });

  it('passes (exit 0) on a clean project at MEDIUM', async () => {
    root = await makeProject();
    await fs.writeFile(path.join(root, 'README.md'), '# hello world\n');
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS);
    assert.equal(r.summary.critical, 0);
    assert.equal(r.summary.high, 0);
  });

  it('detects a real Stripe live key at MEDIUM and blocks (exit 10)', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`
    );
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BLOCKING);
    assert.ok(r.summary.critical >= 1, 'expected at least one critical finding');
    const written = JSON.parse(await fs.readFile(r.artifactPath, 'utf8'));
    assert.equal(written.schema_version, '1.0.0');
    assert.equal(written.review_contract.scope_mode, 'project');
    assert.ok(written.findings.length >= 1);
  });

  it('does NOT block on MICRO even with high-severity finding', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`
    );
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MICRO', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS, 'MICRO must not block');
  });

  it('honors allowlist marker (EXAMPLE) and ignores dummy match', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'docs.md'),
      `# Example secret EXAMPLE ${FAKE_STRIPE_KEY}\n`
    );
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS);
    assert.equal(r.summary.critical, 0);
  });

  it('honors path allowlist (.env.example) and ignores match in that file', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, '.env.example'),
      `STRIPE_KEY=${FAKE_STRIPE_KEY}\n`
    );
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS);
  });

  it('flags forbidden file .env.local with high finding (blocks at MEDIUM)', async () => {
    root = await makeProject();
    await fs.writeFile(path.join(root, '.env.local'), 'API_TOKEN=anything\n');
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'dev', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BLOCKING);
    assert.ok(r.summary.high >= 1 || r.summary.critical >= 1);
  });

  it('append-or-replace: re-running on the same project does not duplicate findings', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`
    );
    const opts = { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' };
    const r1 = await runSecurityScan({ args: [root], options: opts, logger: silentLogger() });
    const r2 = await runSecurityScan({ args: [root], options: { ...opts, now: '2026-04-28T01:00:00.000Z' }, logger: silentLogger() });
    const a1 = JSON.parse(await fs.readFile(r1.artifactPath, 'utf8'));
    const a2 = JSON.parse(await fs.readFile(r2.artifactPath, 'utf8'));
    assert.equal(a1.findings.length, a2.findings.length, 'finding count must be stable across runs');
    assert.deepEqual(
      a1.findings.map((f) => f.finding_id).sort(),
      a2.findings.map((f) => f.finding_id).sort()
    );
  });

  it('determinism: byte-identical output modulo generated_at', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`
    );
    const opts = { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' };
    const r1 = await runSecurityScan({ args: [root], options: opts, logger: silentLogger() });
    const c1 = await fs.readFile(r1.artifactPath, 'utf8');
    const r2 = await runSecurityScan({ args: [root], options: opts, logger: silentLogger() });
    const c2 = await fs.readFile(r2.artifactPath, 'utf8');
    assert.equal(c1, c2);
  });

  it('marks vanished finding as fixed on next run (not deleted)', async () => {
    root = await makeProject();
    const f = path.join(root, 'config.js');
    await fs.writeFile(f, `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`);
    const opts = { stage: 'analyst', classification: 'MEDIUM', json: true, now: '2026-04-28T00:00:00.000Z' };
    const r1 = await runSecurityScan({ args: [root], options: opts, logger: silentLogger() });
    const beforeCount = JSON.parse(await fs.readFile(r1.artifactPath, 'utf8')).findings.length;
    assert.ok(beforeCount >= 1);
    await fs.writeFile(f, "module.exports = {};\n");
    const r2 = await runSecurityScan({ args: [root], options: opts, logger: silentLogger() });
    const after = JSON.parse(await fs.readFile(r2.artifactPath, 'utf8'));
    const fixed = after.findings.filter((x) => x.status === 'fixed');
    assert.ok(fixed.length >= 1, 'previously open finding should be marked fixed');
  });

  it('strict flag elevates non-blocking findings to BLOCKING', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      "const password = 'longenoughpassword123';\n"
    );
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MICRO', strict: true, json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BLOCKING);
  });

  it('writes findings under feature slug when --feature is provided', async () => {
    root = await makeProject();
    await fs.writeFile(path.join(root, 'README.md'), '# clean\n');
    const r = await runSecurityScan({
      args: [root],
      options: { stage: 'analyst', classification: 'MEDIUM', feature: 'my-feature', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.ok(r.artifactPath.endsWith(`security-findings-my-feature.json`));
    const written = JSON.parse(await fs.readFile(r.artifactPath, 'utf8'));
    assert.equal(written.review_contract.scope_mode, 'feature');
    assert.equal(written.slug, 'my-feature');
  });

  it('preserves BLOCKING exit code through CLI with --json', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`
    );
    const cli = runCli(['security:scan', root, '--stage=analyst', '--classification=MEDIUM', '--json']);
    assert.equal(cli.status, EXIT_CODES.BLOCKING);
    const parsed = JSON.parse(cli.stdout);
    assert.equal(parsed.exitCode, EXIT_CODES.BLOCKING);
  });

  it('preserves BLOCKING exit code through CLI without --json', async () => {
    root = await makeProject();
    await fs.writeFile(
      path.join(root, 'config.js'),
      `module.exports = { stripeKey: '${FAKE_STRIPE_KEY}' };\n`
    );
    const cli = runCli(['security:scan', root, '--stage=analyst', '--classification=MEDIUM']);
    assert.equal(cli.status, EXIT_CODES.BLOCKING);
  });

  it('preserves BAD_INPUT exit code through CLI with --json', async () => {
    const fake = path.join(os.tmpdir(), `does-not-exist-${Date.now()}`);
    const cli = runCli(['security:scan', fake, '--stage=analyst', '--json']);
    assert.equal(cli.status, EXIT_CODES.BAD_INPUT);
    const parsed = JSON.parse(cli.stdout);
    assert.equal(parsed.exitCode, EXIT_CODES.BAD_INPUT);
    assert.equal(parsed.reason, 'project_not_found');
  });

  it('emits security_scan_completed runtime event with scan metadata', async () => {
    root = await makeProject();
    await fs.writeFile(path.join(root, 'README.md'), '# clean\n');

    const r = await runSecurityScan({
      args: [root],
      options: {
        stage: 'analyst',
        classification: 'MEDIUM',
        feature: 'my-feature',
        json: true,
        now: '2026-04-28T00:00:00.000Z'
      },
      logger: silentLogger()
    });

    const runtime = await openRuntimeDb(root, { mustExist: true });
    try {
      const event = runtime.db.prepare(`
        SELECT event_type, status, payload_json
        FROM execution_events
        WHERE event_type = 'security_scan_completed'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get();

      assert.equal(event.event_type, 'security_scan_completed');
      assert.equal(event.status, 'completed');
      const payload = JSON.parse(event.payload_json);
      assert.equal(payload.slug, 'my-feature');
      assert.equal(payload.stage, 'analyst');
      assert.equal(payload.exitCode, r.exitCode);
    } finally {
      runtime.db.close();
    }
  });
});
