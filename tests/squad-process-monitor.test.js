'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  getActiveProcesses,
  stopProcess,
  isProcessAlive
} = require('../src/squad-dashboard/process-monitor');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-proc-monitor-'));
}

async function setupProcessesDir(tmpDir, squadSlug) {
  const dir = path.join(tmpDir, '.aioson', 'squads', squadSlug, 'processes');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeProcessFile(processesDir, filename, data) {
  await fs.writeFile(path.join(processesDir, filename), JSON.stringify(data, null, 2));
}

// --- getActiveProcesses ---

test('getActiveProcesses returns empty array when no squads directory exists', async () => {
  const tmpDir = await makeTempDir();
  try {
    const result = await getActiveProcesses(tmpDir);
    assert.deepEqual(result, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('getActiveProcesses returns empty array when processes dir is empty', async () => {
  const tmpDir = await makeTempDir();
  try {
    await setupProcessesDir(tmpDir, 'test-squad');
    const result = await getActiveProcesses(tmpDir);
    assert.deepEqual(result, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('getActiveProcesses returns process entry from valid JSON file', async () => {
  const tmpDir = await makeTempDir();
  try {
    const dir = await setupProcessesDir(tmpDir, 'test-squad');
    await writeProcessFile(dir, 'writer.json', {
      pid: 12345,
      squadSlug: 'test-squad',
      agentSlug: 'writer',
      startedAt: '2026-03-24T10:00:00Z',
      url: null,
      lastActivity: null,
      contextPct: 50
    });
    const result = await getActiveProcesses(tmpDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].pid, 12345);
    assert.equal(result[0].squadSlug, 'test-squad');
    assert.equal(result[0].agentSlug, 'writer');
    assert.equal(result[0].contextPct, 50);
    assert.equal(typeof result[0].alive, 'boolean');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('getActiveProcesses ignores files with invalid JSON', async () => {
  const tmpDir = await makeTempDir();
  try {
    const dir = await setupProcessesDir(tmpDir, 'test-squad');
    await fs.writeFile(path.join(dir, 'broken.json'), '{ not valid json ]]');
    const result = await getActiveProcesses(tmpDir);
    assert.deepEqual(result, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('getActiveProcesses ignores non-json files', async () => {
  const tmpDir = await makeTempDir();
  try {
    const dir = await setupProcessesDir(tmpDir, 'test-squad');
    await fs.writeFile(path.join(dir, 'readme.txt'), 'not a process file');
    const result = await getActiveProcesses(tmpDir);
    assert.deepEqual(result, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('getActiveProcesses filters by squadSlug when provided', async () => {
  const tmpDir = await makeTempDir();
  try {
    const dirA = await setupProcessesDir(tmpDir, 'squad-a');
    const dirB = await setupProcessesDir(tmpDir, 'squad-b');
    await writeProcessFile(dirA, 'agent1.json', { pid: 1001, squadSlug: 'squad-a', agentSlug: 'agent1', startedAt: null });
    await writeProcessFile(dirB, 'agent2.json', { pid: 1002, squadSlug: 'squad-b', agentSlug: 'agent2', startedAt: null });

    const onlyA = await getActiveProcesses(tmpDir, 'squad-a');
    assert.equal(onlyA.length, 1);
    assert.equal(onlyA[0].squadSlug, 'squad-a');

    const onlyB = await getActiveProcesses(tmpDir, 'squad-b');
    assert.equal(onlyB.length, 1);
    assert.equal(onlyB[0].squadSlug, 'squad-b');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('getActiveProcesses computes elapsedSeconds from startedAt', async () => {
  const tmpDir = await makeTempDir();
  try {
    const dir = await setupProcessesDir(tmpDir, 'test-squad');
    // startedAt 1 hour ago
    const startedAt = new Date(Date.now() - 3600 * 1000).toISOString();
    await writeProcessFile(dir, 'writer.json', {
      pid: 99999,
      squadSlug: 'test-squad',
      agentSlug: 'writer',
      startedAt
    });
    const result = await getActiveProcesses(tmpDir);
    assert.equal(result.length, 1);
    assert.ok(result[0].elapsedSeconds >= 3590, `Expected ~3600s, got ${result[0].elapsedSeconds}`);
    assert.ok(result[0].elapsedSeconds <= 3700);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

// --- stopProcess ---

test('stopProcess returns not found when no process file exists', async () => {
  const tmpDir = await makeTempDir();
  try {
    const result = await stopProcess(tmpDir, 999999);
    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('stopProcess removes stale process file (dead PID)', async () => {
  const tmpDir = await makeTempDir();
  try {
    const dir = await setupProcessesDir(tmpDir, 'test-squad');
    // Use a PID that should not be running (very high number)
    const deadPid = 9999999;
    await writeProcessFile(dir, 'writer.json', {
      pid: deadPid,
      squadSlug: 'test-squad',
      agentSlug: 'writer',
      startedAt: null
    });

    const result = await stopProcess(tmpDir, deadPid);
    // alive=false → returns error about process not running, but cleans up file
    assert.equal(result.ok, false);
    assert.ok(result.error);

    // File should be removed
    const files = await fs.readdir(dir);
    assert.equal(files.length, 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('stopProcess sends SIGTERM and removes file for live process', async () => {
  const tmpDir = await makeTempDir();
  let child;
  try {
    // Spawn a long-running process portably.
    child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    const pid = child.pid;
    assert.ok(pid, 'child process should have a PID');

    const dir = await setupProcessesDir(tmpDir, 'test-squad');
    await writeProcessFile(dir, 'agent.json', {
      pid,
      squadSlug: 'test-squad',
      agentSlug: 'agent',
      startedAt: null
    });

    const result = await stopProcess(tmpDir, pid);
    assert.equal(result.ok, true);
    assert.equal(result.pid, pid);

    // File should be removed
    const files = await fs.readdir(dir);
    assert.equal(files.length, 0);
  } finally {
    if (child && !child.killed) child.kill('SIGKILL');
    await fs.rm(tmpDir, { recursive: true });
  }
});

// --- isProcessAlive ---

test('isProcessAlive returns false for non-existent PID', () => {
  assert.equal(isProcessAlive(9999999), false);
});

test('isProcessAlive returns false for null or zero PID', () => {
  assert.equal(isProcessAlive(null), false);
  assert.equal(isProcessAlive(0), false);
});

test('isProcessAlive returns true for the current process', () => {
  assert.equal(isProcessAlive(process.pid), true);
});
