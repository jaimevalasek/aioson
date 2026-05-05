'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {
  runWorkflowNext,
  loadOrCreateState,
  buildDefaultWorkflowConfig
} = require('../src/commands/workflow-next');
const { runTechnicalGate } = require('../src/workflow-gates');
const { validateHandoffContract } = require('../src/handoff-contract');
const { buildTestBriefing } = require('../src/test-briefing');
const { buildPathGuardBlock } = require('../src/path-guard');
const { openRuntimeDb } = require('../src/runtime-store');

describe('workflow engine hardening', () => {
  let tmpDir;

  async function setupProject({ classification = 'MICRO', withTs = false, withGit = false } = {}) {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-harden-'));
    await fs.mkdir(path.join(tmpDir, '.aioson', 'context'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project.context.md'),
      `---\nproject_name: "test"\nproject_type: "api"\nprofile: "developer"\nframework: "Node.js"\nframework_installed: true\nclassification: "${classification}"\ninteraction_language: "en"\naioson_version: "1.7.3"\n---\n`
    );
    if (withTs) {
      await fs.writeFile(
        path.join(tmpDir, 'tsconfig.json'),
        '{"compilerOptions": {"strict": true}}'
      );
      await fs.writeFile(
        path.join(tmpDir, 'package.json'),
        '{"name":"test","scripts":{"test":"node --test"}}'
      );
    }
    if (withGit) {
      const { execSync } = require('node:child_process');
      execSync('git init', { cwd: tmpDir });
    }
    return tmpDir;
  }

  it('technical gate detects TypeScript errors and blocks dev completion', async () => {
    const dir = await setupProject({ classification: 'SMALL', withTs: true });
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'const x: number = "string";');

    const gate = await runTechnicalGate(dir, 'dev');
    assert.strictEqual(gate.ok, false);
    assert.ok(gate.blocked);
    assert.ok(gate.reasons.some((r) => r.includes('TypeScript')));
  });

  it('technical gate passes when TypeScript is clean', async () => {
    const dir = await setupProject({ classification: 'SMALL', withTs: true });
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), 'const x: number = 1;');
    // Ensure tsconfig includes src files
    await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true },
      include: ['src/**/*']
    }));
    // Install typescript so npx tsc works
    const { execSync } = require('node:child_process');
    execSync('npm install typescript --save-dev', { cwd: dir, stdio: 'ignore' });

    const gate = await runTechnicalGate(dir, 'dev');
    assert.strictEqual(gate.ok, true);
    assert.ok(gate.results.some((r) => r.check === 'tsc' && r.ok));
  });

  it('committer gate blocks when no files are staged', async () => {
    const dir = await setupProject({ classification: 'SMALL', withGit: true });
    // Initialize workflow state at committer
    const statePath = path.join(dir, '.aioson', 'context', 'workflow.state.json');
    await fs.writeFile(statePath, JSON.stringify({
      version: 1, mode: 'project', classification: 'SMALL',
      sequence: ['product', 'dev', 'qa', 'committer'],
      current: null, next: 'committer', completed: ['product', 'dev', 'qa'],
      skipped: [], featureSlug: null, detour: null, updatedAt: new Date().toISOString()
    }));

    const logger = { log: () => {} };
    await assert.rejects(
      async () => runWorkflowNext({
        args: [dir],
        options: { agent: 'committer', tool: 'claude' },
        logger,
        t: (k, p) => p?.agent || k
      }),
      /Committer Gate BLOCKED/
    );
  });

  it('handoff contract blocks dev when Gate C is not approved', async () => {
    const dir = await setupProject({ classification: 'SMALL' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-test.md'),
      '---\ngate_plan: pending\n---\n'
    );

    const check = await validateHandoffContract(dir, { mode: 'feature', featureSlug: 'test', sequence: ['dev'] }, 'dev');
    assert.strictEqual(check.ok, false);
    assert.ok(check.missing.some((m) => m.includes('gate C')));
  });

  it('handoff contract passes dev when Gate C is approved', async () => {
    const dir = await setupProject({ classification: 'SMALL' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-test.md'),
      '---\ngate_plan: approved\n---\n'
    );

    const check = await validateHandoffContract(dir, { mode: 'feature', featureSlug: 'test', sequence: ['dev'] }, 'dev');
    assert.strictEqual(check.ok, true);
  });

  it('test briefing extracts mock helpers and ui strings', async () => {
    const dir = await setupProject({ classification: 'SMALL', withTs: true });
    await fs.mkdir(path.join(dir, 'tests', 'helpers'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests', 'helpers', 'mocks.ts'), 'export const mock = vi.fn();');
    await fs.mkdir(path.join(dir, 'src', 'components'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'src', 'components', 'Button.tsx'),
      'export const Button = () => <button>Click me</button>;'
    );

    const briefing = await buildTestBriefing(dir);
    assert.ok(briefing.includes('Shared mock helpers found'));
    assert.ok(briefing.includes('mocks.ts'));
    assert.ok(briefing.includes('Click me'));
  });

  it('path guard block references project-map', async () => {
    const dir = await setupProject({ classification: 'SMALL' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'project-map.md'),
      '---\nagents: [dev]\n---\n# Map\n- docs/ → project root docs/'
    );

    const block = await buildPathGuardBlock(dir);
    assert.ok(block.includes('Canonical Path Rules'));
    assert.ok(block.includes('docs/'));
  });

  it('pentester contract requires security-findings artifact in feature mode', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'my-feature', sequence: ['pentester'] },
      'pentester'
    );
    assert.strictEqual(check.ok, false);
    assert.ok(check.missing.some((m) => m.includes('security-findings-my-feature.json')));
  });

  it('pentester contract passes when security-findings artifact exists', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    const findingsPath = path.join(dir, '.aioson', 'context', 'security-findings-my-feature.json');
    await fs.writeFile(findingsPath, JSON.stringify({ findings: [] }));

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'my-feature', sequence: ['pentester'] },
      'pentester'
    );
    assert.strictEqual(check.ok, true);
  });

  it('qa contract blocks when high/critical open findings with block status exist', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-feat.md'),
      '---\ngate_execution: approved\n---\n## QA Sign-off\n\n**Verdict:** PASS\n'
    );
    const findings = {
      review_contract: {
        scope_mode: 'feature',
        evidence_policy: 'high_critical_require_reproduction',
        findings_artifact_path: '.aioson/context/security-findings-feat.json'
      },
      findings: [
        {
          id: 'SF-feat-01',
          severity: 'high',
          status: 'open',
          recommended_gate_status: 'block'
        }
      ]
    };
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'security-findings-feat.json'),
      JSON.stringify(findings)
    );

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'feat', sequence: ['qa'] },
      'qa'
    );
    assert.strictEqual(check.ok, false);
    assert.ok(check.missing.some((m) => m.includes('SF-feat-01')));
  });

  it('qa contract passes when high findings are fixed or not blocking', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-feat.md'),
      '---\ngate_execution: approved\n---\n## QA Sign-off\n\n**Verdict:** PASS\n'
    );
    const findings = {
      review_contract: {
        scope_mode: 'feature',
        evidence_policy: 'high_critical_require_reproduction',
        findings_artifact_path: '.aioson/context/security-findings-feat.json'
      },
      findings: [
        { id: 'SF-feat-01', severity: 'high', status: 'fixed', recommended_gate_status: 'block' },
        { id: 'SF-feat-02', severity: 'medium', status: 'open', recommended_gate_status: 'review' }
      ]
    };
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'security-findings-feat.json'),
      JSON.stringify(findings)
    );

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'feat', sequence: ['qa'] },
      'qa'
    );
    assert.strictEqual(check.ok, true);
  });

  it('qa activation auto-runs security:audit for MEDIUM feature workflow and records runtime event', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'prd-feat.md'), '# PRD feat\n');
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'requirements-feat.md'),
      '---\nclassification: "MEDIUM"\n---\n# Requirements feat\n\n## Attack Surface Map\n\n- authenticated_endpoints\n'
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-feat.md'),
      '---\ngate_execution: approved\n---\n# Spec feat\n\n- SEC-SBD-03: covered\n- SEC-SBD-08: covered\n'
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'workflow.state.json'),
      JSON.stringify({
        version: 1,
        mode: 'feature',
        classification: 'MEDIUM',
        sequence: ['product', 'analyst', 'dev', 'pentester', 'qa'],
        current: null,
        next: 'qa',
        completed: ['product', 'analyst', 'dev', 'pentester'],
        skipped: [],
        featureSlug: 'feat',
        detour: null,
        updatedAt: new Date().toISOString()
      })
    );

    const result = await runWorkflowNext({
      args: [dir],
      options: { tool: 'codex' },
      logger: { log: () => {}, error: () => {} },
      t: (key, params) => params?.agent || key
    });

    assert.equal(result.agent, 'qa');
    assert.match(result.prompt, /Auto-ran `security:audit` for feature `feat`/);

    const findingsPath = path.join(dir, '.aioson', 'context', 'security-findings-feat.json');
    await assert.doesNotReject(() => fs.access(findingsPath));

    const runtime = await openRuntimeDb(dir, { mustExist: true });
    try {
      const event = runtime.db.prepare(`
        SELECT event_type, source, workflow_stage
        FROM execution_events
        WHERE event_type = 'security_audit_completed'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get();

      assert.equal(event.event_type, 'security_audit_completed');
      assert.equal(event.source, 'workflow');
      assert.equal(event.workflow_stage, 'qa');
    } finally {
      runtime.db.close();
    }
  });

  it('qa completion records security_gate_blocked when MEDIUM audit artifact is missing', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-feat.md'),
      '---\ngate_execution: approved\n---\n## QA Sign-off\n\n**Verdict:** PASS\n'
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'workflow.state.json'),
      JSON.stringify({
        version: 1,
        mode: 'feature',
        classification: 'MEDIUM',
        sequence: ['product', 'analyst', 'dev', 'pentester', 'qa'],
        current: 'qa',
        next: null,
        completed: ['product', 'analyst', 'dev', 'pentester'],
        skipped: [],
        featureSlug: 'feat',
        detour: null,
        updatedAt: new Date().toISOString()
      })
    );

    await assert.rejects(
      async () => runWorkflowNext({
        args: [dir],
        options: { complete: 'qa', tool: 'codex' },
        logger: { log: () => {}, error: () => {} },
        t: (key, params) => params?.agent || key
      }),
      /security-findings-feat\.json/
    );

    const runtime = await openRuntimeDb(dir, { mustExist: true });
    try {
      const event = runtime.db.prepare(`
        SELECT event_type, status, payload_json
        FROM execution_events
        WHERE event_type = 'security_gate_blocked'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get();

      assert.equal(event.event_type, 'security_gate_blocked');
      assert.equal(event.status, 'failed');
      const payload = JSON.parse(event.payload_json);
      assert.equal(payload.feature_slug, 'feat');
      assert.ok(payload.blockers.some((line) => line.includes('security-findings-feat.json')));
    } finally {
      runtime.db.close();
    }
  });

  it('MEDIUM feature workflow sequence includes pentester between dev and qa', () => {
    const config = buildDefaultWorkflowConfig();
    const seq = config.feature.MEDIUM;
    const devIdx = seq.indexOf('dev');
    const pentesterIdx = seq.indexOf('pentester');
    const qaIdx = seq.indexOf('qa');
    assert.ok(pentesterIdx !== -1, 'pentester must be in MEDIUM feature sequence');
    assert.ok(devIdx < pentesterIdx, 'dev must come before pentester');
    assert.ok(pentesterIdx < qaIdx, 'pentester must come before qa');
  });

  it('auto-heal returns healing prompt when technical gate fails', async () => {
    const dir = await setupProject({ classification: 'SMALL', withTs: true });
    // Create a broken TS file
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'bad.ts'), 'const x: number = "oops";');

    // Set workflow to dev stage ready to complete
    const statePath = path.join(dir, '.aioson', 'context', 'workflow.state.json');
    await fs.writeFile(statePath, JSON.stringify({
      version: 1, mode: 'project', classification: 'SMALL',
      sequence: ['product', 'dev', 'qa'],
      current: 'dev', next: 'qa', completed: ['product'],
      skipped: [], featureSlug: null, detour: null, updatedAt: new Date().toISOString()
    }));

    const logger = { log: () => {} };
    const result = await runWorkflowNext({
      args: [dir],
      options: { complete: true, tool: 'claude', 'auto-heal': true },
      logger,
      t: (k, p) => p?.stage || p?.agent || k
    });

    assert.strictEqual(result.autoHealed, true);
    assert.strictEqual(result.agent, 'dev');
    assert.ok(result.prompt.includes('Self-Healing Context'));
  });
});
