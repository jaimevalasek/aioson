'use strict';

/**
 * Regression tests for sdlc-process-upgrade (AC-SDLC-01 through AC-SDLC-40).
 * Covers: path contract, gate approval, preflight readiness, Sheldon RF-01,
 * manifest/plan precedence, and PM ownership.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runGateCheck } = require('../src/commands/gate-check');
const { runGateApprove } = require('../src/commands/gate-approve');
const { runArtifactValidate } = require('../src/commands/artifact-validate');
const {
  evaluateReadiness,
  detectStaleDevState,
  scanActiveManifest,
  buildContextPackage,
  parseFrontmatter
} = require('../src/preflight-engine');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sdlc-regress-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

function makeLogger() {
  const lines = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => lines.push(String(msg)),
    lines
  };
}

// ── AC-SDLC-01 / AC-SDLC-02: Path contract — canonical-path-contract.md ───────

test('path contract rule exists and contains docs/pt restriction', async () => {
  const rulePath = path.join(process.cwd(), '.aioson/rules/canonical-path-contract.md');
  const content = await fs.readFile(rulePath, 'utf8');
  assert.ok(content.includes('docs/pt/'), 'rule must mention docs/pt/');
  assert.ok(
    content.toLowerCase().includes('system documentation') || content.toLowerCase().includes('documentação'),
    'rule must describe docs/pt/ as system documentation'
  );
  assert.ok(
    content.toLowerCase().includes('not') || content.toLowerCase().includes('never') || content.toLowerCase().includes('nunca'),
    'rule must prohibit operational plans in docs/pt/'
  );
});

test('path contract rule distinguishes root plans/ from .aioson/plans/', async () => {
  const rulePath = path.join(process.cwd(), '.aioson/rules/canonical-path-contract.md');
  const content = await fs.readFile(rulePath, 'utf8');
  assert.ok(content.includes('plans/'), 'rule must mention plans/ root');
  assert.ok(content.includes('.aioson/plans/{slug}/'), 'rule must mention .aioson/plans/{slug}/');
});

test('canonical-path-contract is a universal rule (empty agents or absent)', async () => {
  const rulePath = path.join(process.cwd(), '.aioson/rules/canonical-path-contract.md');
  const content = await fs.readFile(rulePath, 'utf8');
  const fm = parseFrontmatter(content);
  // Universal rules have agents: [] or absent
  const agentsField = fm.agents || '';
  assert.ok(
    agentsField === '[]' || agentsField === '' || !fm.agents,
    'canonical-path-contract must be a universal rule (agents: [] or absent)'
  );
});

// ── AC-SDLC-03: project-map.md covers all agents ─────────────────────────────

test('project-map.md includes product/orchestrator/sheldon/pm/discover in agents list', async () => {
  const mapPath = path.join(process.cwd(), '.aioson/context/project-map.md');
  const content = await fs.readFile(mapPath, 'utf8');
  const fm = parseFrontmatter(content);
  const agentsList = fm.agents || '';
  for (const agent of ['product', 'orchestrator', 'sheldon', 'pm', 'discover']) {
    assert.ok(
      agentsList.includes(agent),
      `project-map.md must include agent: ${agent} in frontmatter agents list`
    );
  }
});

// ── AC-SDLC-06: gate:approve blocks when gate:check fails ────────────────────

test('gate:approve: blocks if gate:check fails (missing artifacts)', async () => {
  const tmpDir = await makeTmpDir();
  // No spec file, no requirements file — Gate A will fail
  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: 'my-feature', gate: 'A' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.ok(result.manual_fallback, 'must include manual fallback instructions');
});

// ── AC-SDLC-07: gate:approve writes flat frontmatter field ───────────────────

test('gate:approve: writes flat gate_requirements field when Gate A passes', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'my-feature';

  // Create requirements file (Gate A needs it)
  await writeFile(tmpDir, `.aioson/context/requirements-${slug}.md`, '# Requirements\nREQ-01\n');

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.field_written, 'gate_requirements');

  // Verify the spec file was written with flat field
  const specPath = path.join(tmpDir, `.aioson/context/spec-${slug}.md`);
  const specContent = await fs.readFile(specPath, 'utf8');
  assert.ok(specContent.includes('gate_requirements: approved'), 'spec must have flat gate_requirements field');
});

// ── AC-SDLC-08: manual fallback includes file, field, value ──────────────────

test('gate:approve: manual fallback shows exact file, field, and value', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'test-feature';

  const result = await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'C' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.manual_fallback.includes('spec-test-feature.md'), 'fallback must name the spec file');
  assert.ok(result.manual_fallback.includes('gate_plan'), 'fallback must name the flat field');
  assert.ok(result.manual_fallback.includes('approved'), 'fallback must show the target value');
});

// ── AC-SDLC-09: gate:approve uses flat frontmatter, not phase_gates ──────────

test('gate:approve: written spec uses flat fields, not nested phase_gates', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'flat-test';
  await writeFile(tmpDir, `.aioson/context/requirements-${slug}.md`, '# Requirements\n');

  await runGateApprove({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'A' },
    logger: makeLogger()
  });

  const specPath = path.join(tmpDir, `.aioson/context/spec-${slug}.md`);
  const specContent = await fs.readFile(specPath, 'utf8');
  assert.ok(!specContent.includes('phase_gates'), 'spec must NOT use phase_gates nested format');
  assert.ok(specContent.includes('gate_requirements: approved'), 'spec must use flat gate_requirements field');
});

// ── AC-SDLC-12: stale dev-state detection ────────────────────────────────────

test('detectStaleDevState: warns when active_feature differs from slug', () => {
  const devState = { exists: true, active_feature: 'old-feature', status: 'in_progress' };
  const warning = detectStaleDevState(devState, 'new-feature');
  assert.ok(warning !== null, 'must return a warning for mismatched feature');
  assert.ok(warning.includes('old-feature'), 'warning must name the stale feature');
});

test('detectStaleDevState: warns when dev-state is done', () => {
  const devState = { exists: true, active_feature: 'doc-refresh', status: 'done' };
  const warning = detectStaleDevState(devState, 'doc-refresh');
  assert.ok(warning !== null, 'must return a warning for done dev-state');
  assert.ok(warning.toLowerCase().includes('done') || warning.toLowerCase().includes('completed'), 'warning must mention done status');
});

test('detectStaleDevState: no warning when active_feature matches slug and is in_progress', () => {
  const devState = { exists: true, active_feature: 'checkout', status: 'in_progress' };
  const warning = detectStaleDevState(devState, 'checkout');
  assert.equal(warning, null, 'must not warn when dev-state belongs to the current feature');
});

// ── AC-SDLC-15/AC-SDLC-17: gate:check points to @pm when plan is missing ─────

test('gate:check Gate C: recommendation mentions @pm when plan is missing', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'missing-plan';

  // Gate A and B approved in spec — MEDIUM, the only classification where
  // implementation-plan-{slug}.md is required (AC-SDLC-15)
  await writeFile(tmpDir, `.aioson/context/project.context.md`, '---\nclassification: MEDIUM\n---\n# Context\n');
  await writeFile(tmpDir, `.aioson/context/spec-${slug}.md`,
    '---\nfeature: missing-plan\ngate_requirements: approved\ngate_design: approved\n---\n# Spec\n'
  );
  await writeFile(tmpDir, `.aioson/context/requirements-${slug}.md`, '# Requirements\n');
  await writeFile(tmpDir, `.aioson/context/architecture.md`, '# Architecture\n');
  // No implementation-plan — Gate C should fail pointing to @pm

  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'C' },
    logger: makeLogger()
  });

  assert.equal(result.result, 'BLOCKED', 'Gate C must be BLOCKED without implementation plan');
  assert.ok(
    result.recommendation.toLowerCase().includes('@pm') || result.recommendation.toLowerCase().includes('pm'),
    'recommendation must mention @pm as the agent to produce the plan'
  );
});

test('gate:check Gate C: blocks draft implementation plan', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'draft-plan';

  await writeFile(tmpDir, `.aioson/context/project.context.md`, '---\nclassification: MEDIUM\n---\n# Context\n');
  await writeFile(tmpDir, `.aioson/context/spec-${slug}.md`,
    '---\nfeature: draft-plan\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# Spec\n'
  );
  await writeFile(tmpDir, `.aioson/context/implementation-plan-${slug}.md`, '---\nstatus: draft\n---\n# Plan\n');

  const result = await runGateCheck({
    args: [tmpDir],
    options: { json: true, feature: slug, gate: 'C' },
    logger: makeLogger()
  });

  assert.equal(result.result, 'BLOCKED', 'Gate C must be blocked when implementation plan is draft');
  assert.ok(result.missing.some((m) => m.includes('@pm')), 'blocker must identify @pm as owner');
});

// ── AC-SDLC-19: preflight sheldon includes prd when it exists ────────────────

test('evaluateReadiness: sheldon is BLOCKED when prd is missing', () => {
  const artifacts = {
    project_context: { exists: true },
    prd: { exists: false },
    sheldon_enrichment: { exists: false },
    requirements: { exists: false },
    spec: { exists: false },
    architecture: { exists: false },
    implementation_plan: { exists: false },
    conformance: { exists: false },
    dev_state: { exists: false },
    features: { exists: false }
  };
  const result = evaluateReadiness(artifacts, {}, 'SMALL', 'sheldon', null, null);
  assert.equal(result.status, 'BLOCKED', 'sheldon must be BLOCKED without prd');
  assert.ok(result.blockers.some((b) => b.includes('prd')), 'blockers must mention prd');
});

test('evaluateReadiness: sheldon with prd and no enrichment is READY_WITH_WARNINGS', () => {
  const artifacts = {
    project_context: { exists: true },
    prd: { exists: true, path: 'prd-test.md' },
    sheldon_enrichment: { exists: false },
    requirements: { exists: false },
    spec: { exists: false },
    architecture: { exists: false },
    implementation_plan: { exists: false },
    conformance: { exists: false },
    dev_state: { exists: false },
    features: { exists: false }
  };
  const result = evaluateReadiness(artifacts, {}, 'SMALL', 'sheldon', null, null);
  assert.equal(result.status, 'READY_WITH_WARNINGS', 'sheldon with prd but no enrichment should be READY_WITH_WARNINGS');
});

// ── AC-SDLC-20: preflight orchestrator blocks without Gate C ─────────────────

test('evaluateReadiness: orchestrator is BLOCKED without Gate C', () => {
  const artifacts = {
    project_context: { exists: true },
    prd: { exists: true, path: 'prd.md' },
    sheldon_enrichment: { exists: false },
    requirements: { exists: true, path: 'requirements.md' },
    spec: { exists: true, path: 'spec.md' },
    architecture: { exists: true },
    implementation_plan: { exists: false },
    conformance: { exists: false },
    dev_state: { exists: false },
    features: { exists: false }
  };
  const phaseGates = { requirements: 'approved', design: 'approved', plan: 'pending', execution: 'pending' };
  const result = evaluateReadiness(artifacts, phaseGates, 'MEDIUM', 'orchestrator', null, 'my-feature');
  assert.equal(result.status, 'BLOCKED', 'orchestrator must be BLOCKED without Gate C');
  assert.ok(result.blockers.some((b) => b.toLowerCase().includes('gate c') || b.toLowerCase().includes('plan')), 'must mention Gate C blocker');
});

// ── AC-SDLC-22: artifact:validate shows next_missing and next_agent ───────────

test('artifact:validate: shows next_missing and next_agent when chain is incomplete', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'validate-test';
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# Context\n');
  // No prd file — prd should be next_missing, @product next_agent

  const result = await runArtifactValidate({
    args: [tmpDir],
    options: { json: true, feature: slug },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.ok(result.next_missing, 'must have next_missing field');
  assert.ok(result.next_agent, 'must have next_agent field');
  assert.ok(result.next_agent.includes('@product'), `next_agent must point to @product, got: ${result.next_agent}`);
});

// ── AC-SDLC-24/AC-SDLC-25: active manifest wins over implementation-plan ─────

test('scanActiveManifest: detects active manifest (status != done)', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'my-feature';
  await writeFile(
    tmpDir,
    `.aioson/plans/${slug}/manifest.md`,
    '---\nfeature: my-feature\nstatus: ready\n---\n# Manifest\n'
  );

  const result = await scanActiveManifest(tmpDir, slug);
  assert.equal(result.exists, true);
  assert.equal(result.is_active, true, 'manifest with status ready must be active');
});

test('scanActiveManifest: done manifest is not active', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'done-feature';
  await writeFile(
    tmpDir,
    `.aioson/plans/${slug}/manifest.md`,
    '---\nfeature: done-feature\nstatus: done\n---\n# Manifest\n'
  );

  const result = await scanActiveManifest(tmpDir, slug);
  assert.equal(result.exists, true);
  assert.equal(result.is_active, false, 'manifest with status done must not be active');
});

test('buildContextPackage: active manifest appears as PRIMARY for @dev when present', async () => {
  const artifacts = {
    project_context: { exists: true, path: '.aioson/context/project.context.md' },
    prd: { exists: false },
    sheldon_enrichment: { exists: false },
    requirements: { exists: false },
    spec: { exists: true, path: '.aioson/context/spec-feat.md' },
    architecture: { exists: false },
    implementation_plan: { exists: true, path: '.aioson/context/implementation-plan-feat.md' },
    conformance: { exists: false },
    dev_state: { exists: false },
    features: { exists: false }
  };
  const manifest = { exists: true, path: '.aioson/plans/feat/manifest.md', status: 'ready', is_active: true };
  const pkg = buildContextPackage('dev', 'feat', 'MEDIUM', artifacts, null, manifest);

  const manifestEntry = pkg.find((p) => p.includes('manifest.md'));
  assert.ok(manifestEntry, 'context package must include manifest');
  assert.ok(manifestEntry.includes('PRIMARY'), 'manifest entry must be labeled PRIMARY');

  const planEntry = pkg.find((p) => p.includes('implementation-plan-feat'));
  assert.ok(planEntry, 'context package must also include implementation-plan');
  assert.ok(planEntry.includes('supporting'), 'implementation-plan entry must be labeled supporting');
});

// ── AC-SDLC-32: @product hardconstraint — features.md registration ────────────

test('product.md: hard constraints include features.md registration requirement', async () => {
  const productPath = path.join(process.cwd(), '.aioson/agents/product.md');
  const content = await fs.readFile(productPath, 'utf8');
  assert.ok(
    content.includes('features.md') && (content.includes('Always register') || content.includes('every new feature')),
    'product.md must mandate features.md registration in hard constraints'
  );
});

// ── AC-SDLC-33: @product handoff is explicit ─────────────────────────────────

test('product.md: includes Handoff section with next agent and action', async () => {
  const productPath = path.join(process.cwd(), '.aioson/agents/product.md');
  const content = await fs.readFile(productPath, 'utf8');
  assert.ok(content.includes('## Handoff'), 'product.md must have a Handoff section');
  assert.ok(content.includes('Next agent:'), 'Handoff section must name the next agent');
  assert.ok(content.includes('Action:'), 'Handoff section must specify an action');
});

// ── AC-SDLC-29: Sheldon RF-01 lists PRDs first, checks status after ──────────

test('sheldon.md: RF-01 lists PRDs before checking status', async () => {
  const sheldonPath = path.join(process.cwd(), '.aioson/agents/sheldon.md');
  const content = await fs.readFile(sheldonPath, 'utf8');
  const sectionStart = content.indexOf('## PRD target detection (RF-01)');
  const sectionEnd = content.indexOf('## Re-entrance detection (RF-02)');
  const rf01 = content.slice(sectionStart, sectionEnd);

  // Step order matters: listing PRDs must come before status check
  const listIdx = rf01.indexOf('list all');
  const statusIdx = rf01.indexOf('check `features.md`');
  assert.ok(listIdx !== -1 && statusIdx !== -1, 'sheldon.md must have both list and status steps');
  assert.ok(listIdx < statusIdx, 'listing PRDs (step 3) must appear before status check (step 5) in RF-01');
});

test('sheldon.md: spec.md project-level explicitly not a done indicator', async () => {
  const sheldonPath = path.join(process.cwd(), '.aioson/agents/sheldon.md');
  const content = await fs.readFile(sheldonPath, 'utf8');
  assert.ok(
    content.includes('spec.md') && content.includes('NOT') || content.includes('not a done'),
    'sheldon.md must explicitly state that spec.md does not block enrichment'
  );
});

// ── AC-SDLC-16 fix (H-01): handoff-contract @pm is MEDIUM-only ───────────────

test('handoff-contract: pm artifacts require implementation-plan only for MEDIUM', async () => {
  const { CONTRACTS } = require('../src/handoff-contract');
  const pmContract = CONTRACTS.pm;

  // MEDIUM feature — plan required
  const mediumState = { mode: 'feature', featureSlug: 'checkout', classification: 'MEDIUM' };
  const mediumArtifacts = typeof pmContract.artifacts === 'function'
    ? pmContract.artifacts('.', mediumState)
    : pmContract.artifacts;
  assert.ok(
    mediumArtifacts.some((a) => a.includes('implementation-plan-checkout.md')),
    'MEDIUM feature: pm contract must require implementation-plan'
  );

  // SMALL feature — plan NOT required
  const smallState = { mode: 'feature', featureSlug: 'checkout', classification: 'SMALL' };
  const smallArtifacts = typeof pmContract.artifacts === 'function'
    ? pmContract.artifacts('.', smallState)
    : pmContract.artifacts;
  assert.equal(
    smallArtifacts.length,
    0,
    'SMALL feature: pm contract must NOT require implementation-plan'
  );

  // No classification — plan NOT required (safe default)
  const unknownState = { mode: 'feature', featureSlug: 'checkout' };
  const unknownArtifacts = typeof pmContract.artifacts === 'function'
    ? pmContract.artifacts('.', unknownState)
    : pmContract.artifacts;
  assert.equal(
    unknownArtifacts.length,
    0,
    'unknown classification: pm contract must NOT require implementation-plan (safe default)'
  );
});
