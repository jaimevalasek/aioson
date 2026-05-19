'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');

async function read(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

test('ux-ui prompt documents the runtime-backed Gate B completion path', async () => {
  const prompt = await read('template/.aioson/agents/ux-ui.md');

  const checks = [
    '## Step 0 — Design skill gate',
    'stop and ask the user which installed design skill to use.',
    '## Gate B completion contract',
    '.aioson/context/spec.md',
    'If the PRD does not yet contain `## Visual identity`',
    'pending-selection'
  ];

  for (const token of checks) {
    assert.equal(prompt.includes(token), true, `missing ux-ui runtime-alignment token: ${token}`);
  }
});

test('pm prompt and manifest align with the living PRD workflow stage', async () => {
  const prompt = await read('template/.aioson/agents/pm.md');
  const manifest = JSON.parse(await read('template/.aioson/agents/manifests/pm.manifest.json'));
  const pm = AGENT_DEFINITIONS.find((agent) => agent.id === 'pm');

  const promptChecks = [
    '## Workflow position reality',
    'The default feature workflow does **not** route through `@pm`.',
    '## MEDIUM implementation plan (mandatory output for MEDIUM)',
    'For MEDIUM features, `@pm` MUST produce `implementation-plan-{slug}.md`',
    '## Non-MEDIUM handoff reality',
    'aioson gate:approve . --feature={slug} --gate=C'
  ];

  for (const token of promptChecks) {
    assert.equal(prompt.includes(token), true, `missing pm runtime-alignment token: ${token}`);
  }

  assert.equal(pm.dependsOn.some((dep) => dep.includes('ui-spec.md')), true);
  assert.equal(manifest.capabilities[0].outputs.some((item) => item.path_pattern === '.aioson/context/prd.md'), true);
  assert.equal(manifest.capabilities[0].outputs.some((item) => item.path_pattern === '.aioson/context/prd-{slug}.md'), true);
  assert.equal(manifest.capabilities[0].outputs.some((item) => item.path_pattern === '.aioson/context/implementation-plan-{slug}.md'), true);
});

test('orchestrator prompt and manifest align with the existing parallel CLI runtime', async () => {
  const prompt = await read('template/.aioson/agents/orchestrator.md');
  const manifest = JSON.parse(await read('template/.aioson/agents/manifests/orchestrator.manifest.json'));
  const orchestrator = AGENT_DEFINITIONS.find((agent) => agent.id === 'orchestrator');

  const promptChecks = [
    '## Runtime reality',
    'aioson parallel:init .',
    'aioson parallel:assign .',
    'aioson parallel:status .',
    'aioson parallel:guard . --lane=<n> --paths=<path[,path2]>',
    'aioson parallel:merge . --apply',
    'aioson parallel:doctor . --fix',
    'Do not reference `.aioson/tasks/implementation-plan.md` as if it were an executable runtime primitive.',
    'If the current client does not expose native task tools',
    'If Cron tools are unavailable, do not simulate them in prose.'
  ];

  for (const token of promptChecks) {
    assert.equal(prompt.includes(token), true, `missing orchestrator runtime-alignment token: ${token}`);
  }

  assert.equal(orchestrator.dependsOn.some((dep) => dep.includes('project.context.md')), true);
  assert.equal(orchestrator.dependsOn.some((dep) => dep.includes('ui-spec.md')), true);
  assert.equal(
    manifest.capabilities[0].outputs.some((item) => item.path_pattern === '.aioson/context/parallel/shared-decisions.md'),
    true
  );
});
