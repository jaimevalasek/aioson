'use strict';

// verify:artifact --kind=security-findings — the Pentester's session end runs
// the gate QA's Gate D runs on the same JSON (one judgment, two moments), plus
// the finding-level contract that gate never read. Replays the measured
// shapes: `<port>` placeholder endpoints (the most recent real run reached QA
// with them), owners naming a retired agent, legacy versions, uncorrected
// findings without a remediation record.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { verifyAgentArtifact, resolveAgentArtifact } = require('../src/artifact-kinds');
const { analyzeFindingsContract } = require('../src/lib/security/findings-contract');

const RUN_ID = '2026-10-10T12-00-00-000Z';
const TOP_10 = Array.from({ length: 10 }, (_, i) => `A${String(i + 1).padStart(2, '0')}:2025`);

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-sfg-'));
  fs.mkdirSync(path.join(root, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'api', 'orders.js'), 'module.exports = {};\n');
  return root;
}

function finding(overrides = {}) {
  return {
    id: 'SF-orders-01',
    feature_slug: 'orders',
    surface: 'app_target_ownership_idor',
    severity: 'medium',
    title: 'Order update skips the ownership predicate',
    hypothesis: 'Another user can patch an order they do not own.',
    preconditions: ['two local identities'],
    reproduction_steps: ['PATCH the order as the second identity'],
    evidence: ['tests/security/idor.test.js:12'],
    impact: 'Cross-account order edits.',
    affected_artifacts: ['src/api/orders.js'],
    affected_endpoints: [{ method: 'PATCH', url: 'http://127.0.0.1:3000/api/orders/:id' }],
    suggested_fix: 'Scope the update query by owner id.',
    recommended_owner: 'dev',
    recommended_gate_status: 'review',
    status: 'open',
    safe_to_reproduce: true,
    remediation: { status: 'deferred', summary: 'Needs the permission model decision; next: Dev.' },
    ...overrides
  };
}

function artifact(overrides = {}) {
  return {
    version: 2,
    feature_slug: 'orders',
    review_contract: {
      review_id: `pentester-orders-${RUN_ID}`,
      run_id: RUN_ID,
      scope_mode: 'on_demand',
      runtime_mode: 'local_runtime',
      target_mode: 'app_target',
      target_profiles: [],
      scope_target: 'feature',
      target_scope: 'src/api',
      report_mode: 'none',
      review_depth: 'focused',
      assurance_level: 'ASVS-L2',
      allowed_targets: ['src/api', 'localhost'],
      forbidden_targets: ['public targets'],
      attack_surfaces: [],
      standards: [{ id: 'owasp-top-10', version: '2025' }],
      tools: [],
      evidence_policy: 'safe-proof-only',
      findings_artifact_path: '.aioson/context/security-findings-orders.json'
    },
    threat_surfaces: [],
    coverage: TOP_10.map((id) => (id === 'A01:2025'
      ? { control_id: id, status: 'finding', finding_ids: ['SF-orders-01'], tested_paths: ['src/api/orders.js'],
        tested_endpoints: [{ method: 'PATCH', url: 'http://127.0.0.1:3000/api/orders/:id', status: 'finding' }], evidence: ['idor probe'] }
      : { control_id: id, status: 'not_applicable', not_applicable_reason: `No ${id} execution path in the reviewed scope.` })),
    findings: [finding()],
    limitations: [],
    report_bundle: null,
    ...overrides
  };
}

function write(root, data, rel = '.aioson/context/security-findings-orders.json') {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), JSON.stringify(data, null, 2));
}

async function verify(root, slug = 'orders') {
  return runVerifyArtifact({
    args: [root],
    options: { kind: 'security-findings', slug, advisory: true, suppressExitCode: true, json: true, 'no-persist': true },
    logger: { log() {}, error() {}, warn() {} }
  });
}

test('a well-formed v2 run passes, and open findings for QA are metrics, never issues', async () => {
  const root = tmpProject();
  write(root, artifact({ findings: [finding({ severity: 'high', recommended_gate_status: 'block', attack_path: 'second identity → PATCH → foreign order' })] }));
  const report = await verify(root);
  assert.deepEqual(report.issues, [], report.issues.join('\n'));
  assert.equal(report.ok, true);
  assert.equal(report.persisted, false, '--no-persist measures without writing');
  assert.equal(report.metrics.findings, 1);
  assert.equal(report.metrics.open_high_critical, 1);
  assert.equal(report.metrics.qa_blocking, 1, 'an open blocking high finding is QA\'s to adjudicate, not the Pentester\'s to repair');
  assert.equal(report.metrics.coverage.rows, 10);
  assert.equal(report.metrics.file, '.aioson/context/security-findings-orders.json');
});

test('placeholder endpoints fail exactly as QA\'s Gate D would, with a directed repair hint', async () => {
  const root = tmpProject();
  const data = artifact();
  data.coverage[0].tested_endpoints[0].url = 'http://127.0.0.1:<port>/api/orders/:id';
  data.findings[0].affected_endpoints = [{ method: 'PATCH', url: 'http://<host-lan-address>:4599/api/orders/:id' }];
  write(root, data);
  const report = await verify(root);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => /unsafe v2 coverage targets/.test(issue)), report.issues.join('\n'));
  assert.ok(report.issues.some((issue) => /unsafe v2 finding targets/.test(issue)));
  assert.ok(report.warnings.some((warning) => /absolute route/.test(warning) && /<port>/.test(warning)));
  // The absolute-route form the hint names is accepted.
  data.coverage[0].tested_endpoints[0].url = '/api/orders/:id';
  data.findings[0].affected_endpoints = [{ method: 'PATCH', url: '/api/orders/:id' }];
  write(root, data);
  assert.deepEqual((await verify(root)).issues, []);
});

test('finding vocabularies are provable from text: retired owners, unknown enums, legacy versions', async () => {
  const root = tmpProject();
  write(root, artifact({
    version: 1,
    findings: [
      finding({ id: 'SF-orders-01', recommended_owner: 'architect' }),
      finding({ id: 'SF-orders-02', recommended_owner: 'security-team', status: 'mitigated', severity: 'moderate', recommended_gate_status: 'warn' }),
      // Gate D compares with `===`: a capitalised value would never block at QA.
      finding({ id: 'SF-orders-03', severity: 'High', status: 'accepted', recommended_gate_status: undefined })
    ]
  }));
  const report = await verify(root);
  const text = report.issues.join('\n');
  assert.match(text, /artifact version 1 — the current contract is v2/);
  assert.match(text, /retired agent — write its successor: SF-orders-01 \(architect → planner\)/);
  assert.match(text, /recommended_owner outside pentester\|dev\|qa\|planner: SF-orders-02 \(security-team\)/);
  assert.match(text, /status outside .*SF-orders-02 \(mitigated\)/);
  assert.match(text, /severity outside .*SF-orders-02 \(moderate\), SF-orders-03 \(High\)/);
  assert.match(text, /recommended_gate_status outside note\|review\|block \(absent → the default.*SF-orders-02 \(warn\), SF-orders-03 \(absent\)/);
  assert.match(text, /status uses a legacy alias — write the current value: SF-orders-03 \(accepted → accepted_risk\)/);
});

test('records written by security:audit keep the scanner\'s shape: counted, never held to the authored contract', () => {
  const root = tmpProject();
  const scanner = {
    finding_id: 'security-audit-SEC-SBD-00-4e08cd',
    source: 'security-audit',
    control_id: 'SEC-SBD-00',
    severity: 'inconclusive',
    status: 'needs_validation',
    scope: `prd:${path.join(root, '.aioson/context/prd-orders.md')}`,
    affected_artifacts: [path.join(root, '.aioson/context/prd-orders.md')],
    preconditions: ['Artifact prd expected'],
    reproduction_steps: ['stat prd'],
    evidence: ['Artifact prd not found'],
    impact: 'Cannot audit feature without prd artifact.',
    suggested_fix: 'Generate prd via @product before running audit.',
    recommended_owner: 'product',
    recommended_gate_status: 'review',
    safe_to_reproduce: true,
    detected_by: 'security-audit@1.70.0'
  };
  const result = analyzeFindingsContract(artifact({ findings: [finding(), scanner] }), { targetDir: root });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.metrics.findings, 2);
  assert.equal(result.metrics.scanner_records, 1);
  // The scanner's vocabulary still holds for its own records.
  const broken = analyzeFindingsContract(artifact({ findings: [{ ...scanner, status: 'done', severity: 'severe' }] }), { targetDir: root });
  assert.match(broken.issues.join('\n'), /status outside .*\(done\)/);
  assert.match(broken.issues.join('\n'), /severity outside .*\(severe\)/);
  // Written by hand, the same values belong to the authored contract.
  const authored = analyzeFindingsContract(artifact({ findings: [finding({ severity: 'inconclusive', recommended_owner: 'product' })] }), { targetDir: root });
  assert.match(authored.issues.join('\n'), /severity outside .*\(inconclusive\)/);
  assert.match(authored.issues.join('\n'), /recommended_owner outside .*\(product\)/);
});

test('the human output prints the findings line, never the visual metrics line', async () => {
  const root = tmpProject();
  write(root, artifact());
  const lines = [];
  await runVerifyArtifact({
    args: [root],
    options: { kind: 'security-findings', slug: 'orders', advisory: true, suppressExitCode: true, 'no-persist': true },
    logger: { log: (line) => lines.push(String(line)), error() {}, warn() {} }
  });
  const text = lines.join('\n');
  assert.match(text, /verify:artifact — kind=security-findings slug=orders — OK/);
  assert.match(text, /findings 1 \| open high\/critical 0 \(QA-blocking 0, QA adjudicates\) \| corrections pending QA 0 \| deferred 1 \| coverage 10 row\(s\), 0 not_tested, complete/);
  assert.doesNotMatch(text, /tokens n\/a/);
});

test('contextual gaps are warnings with samples: remediation records, fields, high/critical proof, absent paths', () => {
  const root = tmpProject();
  const result = analyzeFindingsContract(artifact({
    findings: [
      finding({ id: 'SF-orders-01', remediation: undefined, reproduction_steps: [] }),
      finding({ id: 'SF-orders-02', status: 'needs_validation', remediation: undefined }),
      finding({ id: 'SF-orders-03', severity: 'critical', safe_to_reproduce: false, affected_artifacts: ['src/api/missing.js:42', 'CAP-orders-01', 'PATCH /api/orders/:id'] }),
      finding({ id: 'SF-orders-04', status: 'fixed', remediation: undefined })
    ]
  }), { targetDir: root });
  assert.deepEqual(result.issues, []);
  const text = result.warnings.join('\n');
  assert.match(text, /2 uncorrected finding\(s\) carry no remediation record.*SF-orders-01, SF-orders-02/);
  assert.doesNotMatch(text, /no remediation record.*SF-orders-04/, 'a closed finding needs no remediation record');
  assert.match(text, /reproduction_steps missing or empty on 1 finding\(s\): SF-orders-01/);
  assert.match(text, /without `attack_path`.*SF-orders-03/);
  assert.match(text, /without evidence or `safe_to_reproduce: true`.*SF-orders-03/);
  assert.match(text, /1 affected artifact path\(s\) do not exist.*SF-orders-03: src\/api\/missing\.js/);
  assert.doesNotMatch(text, /CAP-orders-01/, 'an artifact id is not a path');
  assert.doesNotMatch(text, /PATCH \/api/, 'a route is not a path');
});

test('a correction pending QA beside status fixed is not flagged — QA adjudicates by moving status', () => {
  const result = analyzeFindingsContract(artifact({
    findings: [finding({ status: 'fixed', remediation: { status: 'applied_pending_qa', summary: 'Owner scope added; re-probed.' } })]
  }), { targetDir: tmpProject() });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.warnings, []);
});

test('comprehensive not_tested coverage is an issue at the session end, as at Gate D', async () => {
  const root = tmpProject();
  const data = artifact();
  data.review_contract.review_depth = 'comprehensive';
  data.coverage[9] = { control_id: 'A10:2025', status: 'not_tested', not_tested_reason: 'Failure-injection fixture unavailable.' };
  write(root, data);
  const comprehensive = await verify(root);
  assert.ok(comprehensive.issues.some((issue) => /coverage remains incomplete \(1 not_tested/.test(issue)), comprehensive.issues.join('\n'));
  data.review_contract.review_depth = 'focused';
  write(root, data);
  const focused = await verify(root);
  assert.deepEqual(focused.issues, []);
  assert.ok(focused.warnings.some((warning) => /coverage remains incomplete/.test(warning)));
});

test('a missing artifact is named, a traversal slug is refused, and a closed feature is read from done/', async () => {
  const root = tmpProject();
  write(root, artifact(), '.aioson/escape/security-findings-x.json');
  const traversal = await verify(root, '../escape/x');
  assert.equal(traversal.ok, false);
  assert.match(traversal.issues[0], /invalid slug/);
  const missing = await verify(root);
  assert.equal(missing.ok, false);
  assert.match(missing.issues[0], /security findings not found: \.aioson\/context\/security-findings-orders\.json/);
  write(root, artifact(), '.aioson/context/done/orders/security-findings-orders.json');
  const closed = await verify(root);
  assert.deepEqual(closed.issues, []);
  assert.equal(closed.metrics.file, '.aioson/context/done/orders/security-findings-orders.json');
});

test('the pentester session end auto-fires the gate from --feature', async () => {
  assert.deepEqual(resolveAgentArtifact('@pentester'), { kind: 'security-findings', needs: 'slug', featureSlugged: true });
  const root = tmpProject();
  const data = artifact();
  data.findings[0].recommended_owner = 'architect';
  write(root, data);
  const fired = await verifyAgentArtifact({ targetDir: root, agent: 'pentester', options: { feature: 'orders' } });
  assert.equal(fired.kind, 'security-findings');
  assert.equal(fired.skipped, false);
  assert.equal(fired.ok, false);
  assert.match(fired.reason, /retired agent/);
});
