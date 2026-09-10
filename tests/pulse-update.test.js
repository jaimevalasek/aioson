'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runPulseUpdate } = require('../src/commands/pulse-update');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-pulse-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

test('pulse:update: requires --agent', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPulseUpdate({
    args: [tmpDir],
    options: { json: true },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_agent');
});

test('pulse:update: creates project-pulse.md when missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPulseUpdate({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'checkout', action: 'Implemented webhook' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  const pulsePath = path.join(tmpDir, '.aioson', 'context', 'project-pulse.md');
  const content = await fs.readFile(pulsePath, 'utf8');
  assert.ok(content.includes('last_agent: dev'));
  assert.ok(content.includes('checkout'));
});

test('pulse:update: returns correct fields in json mode', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPulseUpdate({
    args: [tmpDir],
    options: {
      json: true,
      agent: 'qa',
      feature: 'checkout',
      gate: 'Gate D: approved',
      action: 'QA passed',
      next: 'Feature closed'
    },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.last_agent, 'qa');
  assert.equal(result.last_gate, 'Gate D: approved');
  assert.equal(result.active_feature, 'checkout');
  assert.equal(result.next_recommendation, 'Feature closed');
});

test('pulse:update: appends to existing pulse keeping last 3 activity entries', async () => {
  const tmpDir = await makeTmpDir();

  // Write initial pulse with 2 activities
  await writeFile(tmpDir, '.aioson/context/project-pulse.md',
    '---\nlast_agent: analyst\n---\n## Recent Activity\n\n- 2026-01-01 @analyst: did analysis\n- 2026-01-02 @architect: did design\n');

  await runPulseUpdate({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'feat', action: 'Implemented feature' },
    logger: makeLogger()
  });

  const pulsePath = path.join(tmpDir, '.aioson', 'context', 'project-pulse.md');
  const content = await fs.readFile(pulsePath, 'utf8');
  // Should have recent activity entries AND preserve prior history (keep last 3).
  assert.ok(content.includes('dev'));
  assert.ok(content.includes('Recent Activity'));
  assert.ok(content.includes('@architect: did design'), 'prior LF entry preserved');
});

test('pulse:update: preserves prior history when the existing pulse uses CRLF line endings', async () => {
  const tmpDir = await makeTmpDir();

  // Existing pulse with CRLF endings (as produced by git core.autocrlf on Windows).
  const crlf = '---\r\nlast_agent: analyst\r\n---\r\n## Recent Activity\r\n\r\n'
    + '- 2026-01-01 @analyst: did analysis\r\n- 2026-01-02 @architect: did design\r\n';
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', crlf);

  await runPulseUpdate({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'feat', action: 'Implemented feature' },
    logger: makeLogger()
  });

  const pulsePath = path.join(tmpDir, '.aioson', 'context', 'project-pulse.md');
  const content = await fs.readFile(pulsePath, 'utf8');
  // Before the fix, the LF-only regex failed to match CRLF and the two prior
  // entries were silently dropped, leaving only the new line.
  assert.ok(content.includes('@analyst: did analysis'), 'oldest entry preserved (keep last 3)');
  assert.ok(content.includes('@architect: did design'), 'prior entry preserved');
  assert.ok(content.includes('@dev'), 'new entry appended');
  // No stray carriage returns should leak into the rewritten (LF) entries.
  assert.ok(!content.includes('did design\r'), 'no trailing CR on captured entries');
});

test('pulse:update: human output confirms update', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runPulseUpdate({
    args: [tmpDir],
    options: { agent: 'dev', feature: 'checkout', action: 'Done' },
    logger
  });
  assert.ok(logger.lines.some((l) => l.includes('pulse updated') || l.includes('last_agent')));
});

const FEATURES = '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| alpha | in_progress | 2026-09-01 | |\n| beta | in_progress | 2026-09-02 | |\n| gamma | paused | 2026-09-03 | |\n';
const PULSE = '---\nlast_updated: 2026-09-01\nlast_agent: dev\nactive_feature: alpha\nactive_work: "alpha → @dev → in_progress"\n---\n\n# Project Pulse\n\n## Status\n\n- **Last agent:** @dev\n- **Active feature:** alpha\n\n## Recent Activity\n\n- 2026-09-01 @dev → alpha: built the form\n';

test('pulse:update --feature alone moves only active_feature — the remediation the workflow binding mismatch prints no longer dies on --agent', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/features.md', FEATURES);
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', PULSE);

  const result = await runPulseUpdate({ args: [tmpDir], options: { json: true, feature: 'beta' }, logger: makeLogger() });

  assert.equal(result.ok, true);
  assert.equal(result.active_feature, 'beta');
  assert.equal(result.previous_active_feature, 'alpha');
  assert.deepEqual(result.workflow_binding, { follows: true, feature_status: 'in_progress' });
  const content = await fs.readFile(path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'), 'utf8');
  assert.equal(content, PULSE.replace('active_feature: alpha', 'active_feature: beta').replace('- **Active feature:** alpha', '- **Active feature:** beta'), 'everything but active_feature is kept as it was');
  const { resolveActiveFeature } = require('../src/commands/feature-current');
  assert.equal((await resolveActiveFeature(tmpDir)).slug, 'beta');

  // No pulse yet: a minimal one naming the feature.
  const fresh = await makeTmpDir();
  const created = await runPulseUpdate({ args: [fresh], options: { json: true, feature: 'beta' }, logger: makeLogger() });
  assert.equal(created.ok, true);
  assert.match(await fs.readFile(path.join(fresh, '.aioson', 'context', 'project-pulse.md'), 'utf8'), /^active_feature: beta$/m);
});

test('pulse:update says explicitly when the target is not in_progress in features.md — the workflow binding does not follow it', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/features.md', FEATURES);
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', PULSE);

  const logger = makeLogger();
  const paused = await runPulseUpdate({ args: [tmpDir], options: { feature: 'gamma' }, logger });
  assert.equal(paused.ok, true);
  assert.equal(paused.workflow_binding.follows, false);
  assert.equal(paused.workflow_binding.feature_status, 'paused');
  assert.ok(logger.lines.some((line) => /warning: gamma is "paused" in features\.md, not in_progress/.test(line)), logger.lines.join('\n'));

  const unlisted = await runPulseUpdate({ args: [tmpDir], options: { json: true, feature: 'delta' }, logger: makeLogger() });
  assert.equal(unlisted.workflow_binding.feature_status, null);
  assert.match(unlisted.workflow_binding.warning, /delta is not listed in features\.md/);

  // The session form says the same.
  const session = await runPulseUpdate({ args: [tmpDir], options: { json: true, agent: 'dev', feature: 'gamma', action: 'resumed' }, logger: makeLogger() });
  assert.equal(session.workflow_binding.follows, false);
});

test('pulse:update still requires --agent to record a session', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPulseUpdate({ args: [tmpDir], options: { json: true, feature: 'beta', action: 'Implemented' }, logger: makeLogger() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_agent');
});

test('pulse:update . --feature=<slug> exits 0 through the CLI (it exited 1 on --agent is required)', async () => {
  const { spawnSync } = require('node:child_process');
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/features.md', FEATURES);
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'aioson.js'), 'pulse:update', tmpDir, '--feature=beta'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(await fs.readFile(path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'), 'utf8'), /^active_feature: beta$/m);
});

test('pulse:update: includes phase in active work when provided', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runPulseUpdate({
    args: [tmpDir],
    options: { json: true, agent: 'dev', feature: 'cart', phase: '3', action: 'Phase 3 done' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.ok(result.active_work.includes('phase 3') || result.active_work.includes('cart'));
});
