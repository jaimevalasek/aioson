'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  readBriefingRegistry,
  writeBriefingRegistry
} = require('../src/lib/briefing-refiner/briefing-registry');

const ROOT = path.resolve(__dirname, '..');

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'bin/aioson.js'), ...args], {
      cwd: ROOT
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('briefing:approve dispatches through the CLI and approves a draft registry entry', async (t) => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-briefing-cli-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(projectDir, '.aioson', 'briefings'), { recursive: true });

  await writeBriefingRegistry(projectDir, {
    updated_at: '2026-07-15',
    briefings: [
      {
        slug: 'cli-dispatch',
        status: 'draft',
        source_plans: [],
        created_at: '2026-07-15',
        approved_at: null,
        prd_generated: null
      }
    ]
  });

  const cli = await runCli([
    'briefing:approve',
    projectDir,
    '--slug=cli-dispatch',
    '--locale=en'
  ]);

  assert.equal(cli.code, 0, cli.stderr);
  const registry = await readBriefingRegistry(projectDir);
  assert.equal(registry.briefings[0].status, 'approved');
  assert.match(registry.briefings[0].approved_at, /^\d{4}-\d{2}-\d{2}$/);
});
