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
const {
  validateHandoffContract,
  getCanonicalArtifactsForAgent
} = require('../src/handoff-contract');
const { buildTestBriefing } = require('../src/test-briefing');
const { buildPathGuardBlock } = require('../src/path-guard');
const { openRuntimeDb } = require('../src/runtime-store');
const { CANONICAL_LENSES } = require('../src/lib/feature-completeness');
const { runHarnessCheck } = require('../src/commands/harness-check');

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
      path.join(dir, '.aioson', 'context', 'implementation-plan-test.md'),
      '---\nstatus: approved\n---\n'
    );

    const check = await validateHandoffContract(dir, { mode: 'feature', featureSlug: 'test', sequence: ['dev'] }, 'dev');
    assert.strictEqual(check.ok, true);
  });

  it('optional repository discovery does not require a design-doc artifact', async () => {
    const dir = await setupProject({ classification: 'SMALL' });
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'design-doc-checkout.md'), '# Design Doc\n');
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'readiness-checkout.md'), '# Readiness\n');

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'checkout', sequence: ['discovery-design-doc'] },
      'discovery-design-doc'
    );

    assert.strictEqual(check.ok, true);
  });

  it('optional repository discovery remains non-blocking when legacy artifacts are absent', async () => {
    const dir = await setupProject({ classification: 'SMALL' });

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'checkout', sequence: ['discovery-design-doc'] },
      'discovery-design-doc'
    );

    assert.strictEqual(check.ok, true);
    assert.equal(check.missing.some((m) => /design-doc|readiness/.test(m)), false);
  });

  it('optional repository discovery owns no canonical feature artifact', async () => {
    const dir = await setupProject({ classification: 'SMALL' });

    const artifacts = await getCanonicalArtifactsForAgent(
      '@discovery-design-doc',
      dir,
      { mode: 'feature', featureSlug: 'checkout', classification: 'SMALL' }
    );

    assert.deepEqual(artifacts, []);
  });

  it('optional repository discovery owns no global fallback artifacts', async () => {
    const dir = await setupProject({ classification: 'SMALL' });

    const artifacts = await getCanonicalArtifactsForAgent(
      '@discovery-design-doc',
      dir,
      { mode: 'feature', featureSlug: 'checkout', classification: 'SMALL' }
    );

    assert.deepEqual(artifacts, []);
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

  it('qa contract blocks Gate D when an AC has no test evidence', async () => {
    const dir = await setupProject({ classification: 'SMALL' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'requirements-feat.md'),
      'AC-feat-01: user-visible behavior is verified.'
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-feat.md'),
      '---\ngate_execution: approved\n---\n## QA Sign-off\n\n**Verdict:** PASS\n'
    );
    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'feat', classification: 'SMALL', sequence: ['qa'] },
      'qa'
    );

    assert.strictEqual(check.ok, false);
    assert.ok(check.missing.some((m) => m.includes('AC test audit failed')));
  });

  it('qa contract passes Gate D when QA passes and AC has test evidence', async () => {
    const dir = await setupProject({ classification: 'SMALL' });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'prd-feat.md'),
      [
        '---',
        'classification: SMALL',
        'feature_completeness: required',
        '---',
        '# PRD feat',
        '## Feature Capability Map',
        '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
        '|---|---|---|---|---|',
        '| CAP-feat-verify | The user observes the verified behavior | User invokes the feature | required | Primary approved outcome |',
        '## Acceptance Criteria',
        '| AC | CAP | Observable behavior | Evidence |',
        '|---|---|---|---|',
        '| AC-feat-01 | CAP-feat-verify | Return the verified behavior | node test |'
      ].join('\n')
    );
    const capabilityRows = CANONICAL_LENSES.map((lens) => {
      if (lens === 'primary-outcome') {
        return '| CAP-feat-verify | primary-outcome | required | Return the verified behavior | REQ-feat-01 | AC-feat-01 |';
      }
      return `| feature-wide | ${lens} | not_applicable | ${lens} has no surface in this bounded fixture | — | — |`;
    });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'requirements-feat.md'),
      [
        '# Requirements feat',
        'REQ-feat-01 defines the user-visible behavior verified by AC-feat-01.',
        '## Feature Capability Matrix',
        '| CAP | Lens | Decision | Behavior / rationale | REQ | AC |',
        '|---|---|---|---|---|---|',
        ...capabilityRows
      ].join('\n')
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'design-doc-feat.md'),
      [
        '# Design feat',
        '## Implementation Leverage Matrix',
        '| CAP | Concern | Decision | Evidence | Target |',
        '|---|---|---|---|---|',
        '| CAP-feat-verify | behavior verification | reuse | Existing Node test harness was inspected | tests/feat.test.js |'
      ].join('\n')
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'implementation-plan-feat.md'),
      [
        '---', 'status: approved', '---',
        '# Plan feat',
        '## Capability Delivery Plan',
        '| CAP | Phase | Files | Verification |',
        '|---|---|---|---|',
        '| CAP-feat-verify | 1 | tests/feat.test.js | node --test tests/feat.test.js |'
      ].join('\n')
    );
    await fs.writeFile(
      path.join(dir, 'tests', 'feat.test.js'),
      "const test = require('node:test');\nconst assert = require('node:assert/strict');\n\ntest('AC-feat-01 behavior', () => {\n  const visibleBehavior = true;\n  assert.strictEqual(visibleBehavior, true);\n});\n"
    );
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'spec-feat.md'),
      '---\ngate_execution: approved\n---\n## QA Sign-off\n\n**Verdict:** PASS\n'
    );
    const ledgerDir = path.join(dir, '.aioson', 'context', 'features', 'feat');
    await fs.mkdir(ledgerDir, { recursive: true });
    const ledger = {
      schema_version: 'implementation-ledger/v1',
      feature_slug: 'feat',
      source_artifacts: [{ type: 'prd', path: '.aioson/context/prd-feat.md', role: 'product_authority' }],
      claims: [{
        id: 'CLAIM-feat-verify',
        capability_ids: ['CAP-feat-verify'],
        kind: 'required_behavior',
        summary: 'The user observes the verified behavior.',
        owner: 'dev',
        status: 'implemented',
        evidence: [
          { type: 'file', path: 'tests/feat.test.js' },
          { type: 'test', command: 'node --test tests/feat.test.js', status: 'passed' }
        ]
      }],
      known_gaps: [],
      verification_commands: [{ command: 'node --test tests/feat.test.js', last_status: 'passed' }]
    };
    await fs.writeFile(
      path.join(ledgerDir, 'implementation-ledger.md'),
      [
        '# Implementation Ledger - feat',
        '## Source Of Truth', 'PRD.',
        '## Intended Behavior Claims', 'One capability.',
        '## Implementation Evidence', 'Test file.',
        '## Verification Commands', 'Node test.',
        '## Known Gaps', 'None.',
        '## Handoff Notes', 'Ready.',
        '## Machine Ledger', '```json', JSON.stringify(ledger, null, 2), '```'
      ].join('\n')
    );
    const planDir = path.join(dir, '.aioson', 'plans', 'feat');
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(path.join(planDir, 'harness-contract.json'), JSON.stringify({
      feature: 'feat',
      governor: {},
      criteria: [{
        id: 'CAP-feat-verify-proof',
        description: 'CAP-feat-verify and AC-feat-01 executable proof',
        binary: true,
        verification: 'node --test tests/feat.test.js'
      }]
    }));
    const harness = await runHarnessCheck({
      args: [dir],
      options: { slug: 'feat', json: true, strict: true },
      logger: { log() {}, error() {} },
      t: () => undefined
    });
    assert.strictEqual(harness.ok, true, JSON.stringify(harness, null, 2));

    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'feat', classification: 'SMALL', sequence: ['qa'] },
      'qa'
    );

    assert.strictEqual(check.ok, true, JSON.stringify(check, null, 2));
  });

  it('qa activation does not auto-run security audit merely because the feature is MEDIUM', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    await fs.writeFile(
      path.join(dir, '.aioson', 'context', 'features.md'),
      '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| feat | in_progress | 2026-06-02 | — |\n'
    );
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
    assert.doesNotMatch(result.prompt, /Auto-ran `security:audit`/);
    const findingsPath = path.join(dir, '.aioson', 'context', 'security-findings-feat.json');
    await assert.rejects(() => fs.access(findingsPath));
  });

  it('MEDIUM QA does not require a security artifact unless risk triggered it', async () => {
    const dir = await setupProject({ classification: 'MEDIUM' });
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'prd-feat.md'), `---
classification: MEDIUM
product_scope: approved
prd_ready: approved
sheldon_review: not_requested
---
# PRD
## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-feat-01 | User sees result | User submits | required | Core promise |
## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-feat-01 | CAP-feat-01 | Result appears | node test |
`);
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'implementation-plan-feat.md'), `---
status: approved
---
# Plan
## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-feat-01 | 1 | src/feat.js, tests/feat.test.js | node --test |
`);
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'qa-report-feat.md'), '---\nverdict: PASS\n---\n# QA\n');
    await fs.writeFile(path.join(dir, 'src', 'feat.js'), 'module.exports = true;\n');
    await fs.writeFile(path.join(dir, 'tests', 'feat.test.js'), "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-feat-01',()=>assert.ok(true));\n");
    const check = await validateHandoffContract(
      dir,
      { mode: 'feature', featureSlug: 'feat', classification: 'MEDIUM', sequence: ['product', 'planner', 'dev', 'qa'] },
      'qa'
    );
    assert.equal(check.ok, true, JSON.stringify(check.missing));
    assert.equal(check.missing.some((line) => line.includes('security-findings-feat.json')), false);
  });

  it('MEDIUM feature workflow sequence routes dev directly to the QA review hub', () => {
    const config = buildDefaultWorkflowConfig();
    const seq = config.feature.MEDIUM;
    const devIdx = seq.indexOf('dev');
    const qaIdx = seq.indexOf('qa');
    assert.ok(devIdx < qaIdx, 'dev must come before qa');
    assert.ok(!seq.includes('pentester'), 'pentester is dynamically selected by QA and agent-execution manifest');
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
