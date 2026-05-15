'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { checkParity, main } = require('../src/commands/sync-agents-preflight');
const { CHAIN_AGENTS } = require('../src/commands/dossier-audit');
const dossierTelemetry = require('../src/lib/dossier-telemetry');

async function makeProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sync-preflight-'));
  await fs.mkdir(path.join(tmp, '.aioson', 'agents'), { recursive: true });
  await fs.mkdir(path.join(tmp, 'template', '.aioson', 'agents'), { recursive: true });
  return tmp;
}

const FEATURE_DOSSIER_BLOCK = `## Feature dossier
- one
- two
- three

`;

function makeAgentMd(extra = '') {
  return `# Agent

## Mission
Do work.

${extra}## Position
After @setup.
`;
}

async function writeAgent(projectRoot, location, agent, body) {
  const dir = location === 'workspace'
    ? path.join(projectRoot, '.aioson', 'agents')
    : path.join(projectRoot, 'template', '.aioson', 'agents');
  await fs.writeFile(path.join(dir, `${agent}.md`), body, 'utf8');
}

describe('sync-agents-preflight', () => {
  it('returns no violations when workspace and template are identical', async () => {
    const tmp = await makeProject();
    try {
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }
      assert.deepEqual(checkParity(tmp), []);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns violations when workspace has more content than template', async () => {
    const tmp = await makeProject();
    try {
      const longer = `## Feature dossier
- one
- two
- three
- four
- five

`;
      const shorter = `## Feature dossier
- one

`;
      await writeAgent(tmp, 'workspace', 'product', makeAgentMd(longer));
      await writeAgent(tmp, 'template', 'product', makeAgentMd(shorter));
      // others identical
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        if (agent === 'product') continue;
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }
      const violations = checkParity(tmp);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].agent, 'product');
      assert.ok(violations[0].workspaceLen > violations[0].templateLen);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('does NOT flag when template is longer than workspace (template-ahead is safe for rsync)', async () => {
    const tmp = await makeProject();
    try {
      const longer = `## Feature dossier
- one
- two
- three
- four

`;
      const shorter = `## Feature dossier
- one

`;
      await writeAgent(tmp, 'workspace', 'qa', makeAgentMd(shorter));
      await writeAgent(tmp, 'template', 'qa', makeAgentMd(longer));
      // others identical
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        if (agent === 'qa') continue;
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }
      assert.deepEqual(checkParity(tmp), []);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('flags workspace_only as a violation (template missing the section)', async () => {
    const tmp = await makeProject();
    try {
      await writeAgent(tmp, 'workspace', 'sheldon', makeAgentMd(FEATURE_DOSSIER_BLOCK));
      await writeAgent(tmp, 'template', 'sheldon', makeAgentMd(''));
      const violations = checkParity(tmp);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].agent, 'sheldon');
      assert.equal(violations[0].templateLen, 0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('handles missing files gracefully (no crash, no false positive)', async () => {
    const tmp = await makeProject();
    try {
      // No files anywhere — all skipped
      assert.deepEqual(checkParity(tmp), []);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('emits sync_agents_parity_violation when main() aborts on violation', async () => {
    const tmp = await makeProject();
    const originalEmit = dossierTelemetry.emitDossierEvent;
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const calls = [];
    dossierTelemetry.emitDossierEvent = async (projectRoot, payload) => {
      calls.push({ projectRoot, payload });
    };
    process.stderr.write = () => true;
    try {
      const longer = `## Feature dossier
- one
- two
- three
- four
- five

`;
      const shorter = `## Feature dossier
- one

`;
      await writeAgent(tmp, 'workspace', 'product', makeAgentMd(longer));
      await writeAgent(tmp, 'template', 'product', makeAgentMd(shorter));
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        if (agent === 'product') continue;
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }

      const code = await main(tmp);
      assert.equal(code, 1);

      // Filter by the event type under test. main() also emits unrelated
      // template-parity events (e.g., learning_loop_template_parity_violation
      // when the active-learning-loop template artifacts are missing from
      // the synthetic tmpdir) and those would inflate the raw call count
      // without invalidating what this test is actually checking.
      const parityCalls = calls.filter(
        (c) => c.payload && c.payload.type === 'sync_agents_parity_violation'
      );
      assert.equal(parityCalls.length, 1);
      assert.equal(parityCalls[0].projectRoot, tmp);
      assert.equal(parityCalls[0].payload.agent, 'sync-agents-preflight');
      assert.match(parityCalls[0].payload.summary, /1 agent\(s\) ahead in workspace/);
      assert.ok(Array.isArray(parityCalls[0].payload.meta.violations));
      assert.equal(parityCalls[0].payload.meta.violations[0].agent, 'product');
    } finally {
      dossierTelemetry.emitDossierEvent = originalEmit;
      process.stderr.write = originalStderrWrite;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('main() does not emit sync_agents_parity_violation when agent-chain parity is clean', async () => {
    const tmp = await makeProject();
    const originalEmit = dossierTelemetry.emitDossierEvent;
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const calls = [];
    dossierTelemetry.emitDossierEvent = async (projectRoot, payload) => {
      calls.push({ projectRoot, payload });
    };
    // Silence stderr from unrelated parity checks (e.g., learning-loop template
    // artifacts that the synthetic tmpdir doesn't replicate) — they would
    // otherwise spam test output without affecting the assertion below.
    process.stderr.write = () => true;
    try {
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }
      await main(tmp);
      // main()'s exit code reflects ALL parity checks (agent-chain +
      // active-learning-loop template parity + future additions). This test
      // is specifically about the agent-chain path, so we filter by event
      // type instead of asserting on the global exit code. The negative
      // assertion ("no sync_agents_parity_violation when agent parity is
      // clean") is the invariant this test owns.
      const parityCalls = calls.filter(
        (c) => c.payload && c.payload.type === 'sync_agents_parity_violation'
      );
      assert.equal(parityCalls.length, 0);
    } finally {
      dossierTelemetry.emitDossierEvent = originalEmit;
      process.stderr.write = originalStderrWrite;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
