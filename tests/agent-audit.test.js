'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runAgentAudit } = require('../src/commands/agent-audit');

const mockLogger = { log: () => {}, error: () => {}, warn: () => {} };

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

describe('agent-audit.js — scoped modes', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-audit-test-'));
    await writeFileEnsured(path.join(tmpDir, '.aioson', 'agents', 'dev.md'), '# Runtime Dev\n');
    await writeFileEnsured(path.join(tmpDir, 'template', '.aioson', 'agents', 'dev.md'), '# Template Dev\n');
    await writeFileEnsured(path.join(tmpDir, 'AGENTS.md'), '# Runtime Entrypoint\n');
    await writeFileEnsured(path.join(tmpDir, 'template', 'AGENTS.md'), '# Template Entrypoint\n');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scans only runtime surfaces with --runtime-only', async () => {
    const result = await runAgentAudit({
      args: [tmpDir],
      options: { json: true, 'runtime-only': true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.equal(result.within_budget, true);
    assert.equal(result.mode, 'runtime');
    assert.deepEqual(result.summary, {
      files: 2,
      over_hard: 0,
      over_target: 0,
      within_target: 2,
      total_tokens: 10,
      potential_savings_tokens: 0
    });
    assert.equal(result.activation_risk.largest_agent_file, '.aioson/agents/dev.md');
    assert.equal(result.activation_risk.largest_entrypoint_file, 'AGENTS.md');
    assert.equal(
      result.activation_risk.worst_case_activation_tokens,
      result.activation_risk.largest_agent_tokens + result.activation_risk.largest_entrypoint_tokens
    );
    assert.ok(result.roots.includes('.aioson/agents'));
    assert.ok(!result.roots.includes('template/.aioson/agents'));
    assert.ok(result.files.some((file) => file.file === '.aioson/agents/dev.md'));
    assert.ok(result.files.some((file) => file.file === 'AGENTS.md'));
    assert.ok(!result.files.some((file) => file.file.startsWith('template/')));
  });

  it('scans only template surfaces with --template-only', async () => {
    const result = await runAgentAudit({
      args: [tmpDir],
      options: { json: true, 'template-only': true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'template');
    assert.ok(result.roots.includes('template/.aioson/agents'));
    assert.ok(!result.roots.includes('.aioson/agents'));
    assert.ok(result.files.every((file) => file.file.startsWith('template/')));
  });

  it('defaults to inception-compatible scan and includes mode metadata', async () => {
    const result = await runAgentAudit({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'inception');
    assert.ok(Array.isArray(result.files));
    assert.ok(result.files.some((file) => file.category === 'workspace_agent'));
    assert.ok(result.files.some((file) => file.category === 'template_agent'));
    assert.ok(result.files.some((file) => file.category === 'auto_loaded'));
  });

  it('rejects conflicting scoped modes', async () => {
    const result = await runAgentAudit({
      args: [tmpDir],
      options: { json: true, 'runtime-only': true, 'template-only': true },
      logger: mockLogger
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'conflicting_modes');
  });

  it('separates command success from hard-budget health in JSON output', async () => {
    await writeFileEnsured(
      path.join(tmpDir, '.aioson', 'agents', 'qa.md'),
      `# Runtime QA\n${'x'.repeat(17000)}\n`
    );

    const result = await runAgentAudit({
      args: [tmpDir],
      options: { json: true, 'runtime-only': true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.equal(result.within_budget, false);
    assert.equal(result.summary.over_hard, 1);
    assert.equal(result.files.find((file) => file.slug === 'qa').status, 'over_hard');
  });
});
