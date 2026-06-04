'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  parseFrontmatter,
  readFileSafe,
  fileExists,
  detectFramework,
  detectTestRunner,
  loadProjectContext,
  scanArtifacts,
  scanActiveManifest,
  parseGatesFromSpec,
  readPhaseGates,
  readDevState,
  readProjectPulse,
  detectClassification,
  parseAgentList,
  appliesToAgent,
  discoverRules,
  discoverDesignDocs,
  buildContextPackage,
  evaluateReadiness,
  detectStaleDevState,
  extractSpecVersion,
  extractLastCheckpoint,
  GATE_NAMES,
  GATE_ALIASES
} = require('../src/preflight-engine');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-engine-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

// ── parseFrontmatter ──────────────────────────────────────────────────────────

test('parseFrontmatter: returns empty object when no frontmatter', () => {
  const result = parseFrontmatter('# Hello\nNo frontmatter here');
  assert.deepEqual(result, {});
});

test('parseFrontmatter: parses simple key-value pairs', () => {
  const content = '---\nclassification: SMALL\nframework: Laravel\n---\n# Spec';
  const result = parseFrontmatter(content);
  assert.equal(result.classification, 'SMALL');
  assert.equal(result.framework, 'Laravel');
});

test('parseFrontmatter: strips quotes from values', () => {
  const content = '---\ntitle: "My Project"\nname: \'test\'\n---';
  const result = parseFrontmatter(content);
  assert.equal(result.title, 'My Project');
  assert.equal(result.name, 'test');
});

test('parseFrontmatter: handles CRLF line endings', () => {
  const content = '---\r\nkey: value\r\n---\r\n';
  const result = parseFrontmatter(content);
  assert.equal(result.key, 'value');
});

// ── readFileSafe ──────────────────────────────────────────────────────────────

test('readFileSafe: returns null for nonexistent file', async () => {
  const result = await readFileSafe('/nonexistent/path/file.md');
  assert.equal(result, null);
});

test('readFileSafe: returns content for existing file', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'test.md', 'hello world');
  const result = await readFileSafe(path.join(tmpDir, 'test.md'));
  assert.equal(result, 'hello world');
});

// ── fileExists ────────────────────────────────────────────────────────────────

test('fileExists: returns false for missing file', async () => {
  const exists = await fileExists('/nonexistent/file.md');
  assert.equal(exists, false);
});

test('fileExists: returns true for existing file', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'exists.md', 'content');
  const exists = await fileExists(path.join(tmpDir, 'exists.md'));
  assert.equal(exists, true);
});

// ── detectFramework ───────────────────────────────────────────────────────────

test('detectFramework: returns null when no recognizable files', async () => {
  const tmpDir = await makeTmpDir();
  const result = await detectFramework(tmpDir);
  assert.equal(result, null);
});

test('detectFramework: detects Laravel from composer.json', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'composer.json', '{"require":{"laravel/framework":"^10.0"}}');
  const result = await detectFramework(tmpDir);
  assert.equal(result, 'Laravel');
});

test('detectFramework: detects Next.js from package.json', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'package.json', '{"dependencies":{"next":"^14.0","react":"^18.0"}}');
  const result = await detectFramework(tmpDir);
  assert.equal(result, 'Next.js');
});

test('detectFramework: detects Django from requirements.txt', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'requirements.txt', 'django==4.2\npsycopg2==2.9\n');
  const result = await detectFramework(tmpDir);
  assert.equal(result, 'Django');
});

test('detectFramework: detects Rails from Gemfile', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'Gemfile', "source 'https://rubygems.org'\ngem 'rails', '~> 7.0'\n");
  const result = await detectFramework(tmpDir);
  assert.equal(result, 'Rails');
});

// ── detectTestRunner ──────────────────────────────────────────────────────────

test('detectTestRunner: returns null when no test config', async () => {
  const tmpDir = await makeTmpDir();
  const result = await detectTestRunner(tmpDir);
  assert.equal(result, null);
});

test('detectTestRunner: detects PHPUnit from phpunit.xml', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'phpunit.xml', '<phpunit></phpunit>');
  const result = await detectTestRunner(tmpDir);
  assert.ok(result);
  assert.ok(result.name.includes('Pest') || result.name.includes('PHPUnit'));
});

test('detectTestRunner: detects Jest from jest.config.js', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'jest.config.js', 'module.exports = {}');
  const result = await detectTestRunner(tmpDir);
  assert.ok(result);
  assert.equal(result.name, 'Jest');
});

test('detectTestRunner: detects Vitest from vitest.config.ts', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'vitest.config.ts', 'export default {}');
  const result = await detectTestRunner(tmpDir);
  assert.ok(result);
  assert.equal(result.name, 'Vitest');
});

test('detectTestRunner: detects from package.json test script with jest', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'package.json', '{"scripts":{"test":"jest --coverage"}}');
  const result = await detectTestRunner(tmpDir);
  assert.ok(result);
  assert.equal(result.name, 'Jest');
});

// ── loadProjectContext ────────────────────────────────────────────────────────

test('loadProjectContext: returns exists=false when no file', async () => {
  const tmpDir = await makeTmpDir();
  const result = await loadProjectContext(tmpDir);
  assert.equal(result.exists, false);
});

test('loadProjectContext: parses frontmatter from project.context.md', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md',
    '---\nclassification: SMALL\nframework: Laravel\n---\n# Project');
  const result = await loadProjectContext(tmpDir);
  assert.equal(result.exists, true);
  assert.equal(result.data.classification, 'SMALL');
  assert.equal(result.data.framework, 'Laravel');
});

// ── scanArtifacts ─────────────────────────────────────────────────────────────

test('scanArtifacts: all exists=false when context dir is empty', async () => {
  const tmpDir = await makeTmpDir();
  const result = await scanArtifacts(tmpDir, 'checkout');
  assert.equal(result.project_context.exists, false);
  assert.equal(result.prd.exists, false);
  assert.equal(result.spec.exists, false);
});

test('scanArtifacts: detects existing prd and spec files', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '# PRD');
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nversion: 2\n---\n# Spec');
  const result = await scanArtifacts(tmpDir, 'checkout');
  assert.equal(result.project_context.exists, true);
  assert.equal(result.prd.exists, true);
  assert.equal(result.spec.exists, true);
  assert.equal(result.spec.frontmatter.version, '2');
});

test('scanArtifacts: prefers slugged design-doc and readiness for feature context', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/design-doc.md', '# Project Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness.md', '# Project Readiness');
  await writeFile(tmpDir, '.aioson/context/design-doc-checkout.md', '# Checkout Design Doc');
  await writeFile(tmpDir, '.aioson/context/readiness-checkout.md', '# Checkout Readiness');

  const result = await scanArtifacts(tmpDir, 'checkout');

  assert.equal(result.design_doc.exists, true);
  assert.ok(result.design_doc.path.endsWith('design-doc-checkout.md'));
  assert.equal(result.readiness.exists, true);
  assert.ok(result.readiness.path.endsWith('readiness-checkout.md'));
});

// ── parseGatesFromSpec ────────────────────────────────────────────────────────

test('parseGatesFromSpec: returns empty object for empty content', () => {
  assert.deepEqual(parseGatesFromSpec(''), {});
});

test('parseGatesFromSpec: parses explicit gate fields from frontmatter', () => {
  const content = '---\ngate_requirements: approved\ngate_design: pending\ngate_plan: approved\ngate_execution: pending\n---';
  const gates = parseGatesFromSpec(content);
  assert.equal(gates.requirements, 'approved');
  assert.equal(gates.design, 'pending');
  assert.equal(gates.plan, 'approved');
  assert.equal(gates.execution, 'pending');
});

test('parseGatesFromSpec: parses gate approval lines in body', () => {
  const content = '# Spec\n\nGate A (requirements): approved\nGate C (plan): approved\n';
  const gates = parseGatesFromSpec(content);
  assert.equal(gates.requirements, 'approved');
  assert.equal(gates.plan, 'approved');
});

// ── readPhaseGates ────────────────────────────────────────────────────────────

test('readPhaseGates: returns empty object when spec file missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await readPhaseGates(tmpDir, 'checkout');
  assert.deepEqual(result, {});
});

test('readPhaseGates: reads gates from spec file', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\ngate_requirements: approved\ngate_plan: approved\n---');
  const gates = await readPhaseGates(tmpDir, 'checkout');
  assert.equal(gates.requirements, 'approved');
  assert.equal(gates.plan, 'approved');
});

// ── readDevState ──────────────────────────────────────────────────────────────

test('readDevState: returns exists=false when file missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await readDevState(tmpDir);
  assert.equal(result.exists, false);
});

test('readDevState: reads active_feature and next_step', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/dev-state.md',
    '---\nactive_feature: checkout\nactive_phase: 3\nnext_step: "Implement webhook"\n---');
  const result = await readDevState(tmpDir);
  assert.equal(result.exists, true);
  assert.equal(result.active_feature, 'checkout');
  assert.equal(result.active_phase, '3');
  assert.equal(result.next_step, 'Implement webhook');
});

// ── readProjectPulse ──────────────────────────────────────────────────────────

test('readProjectPulse: returns exists=false when file missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await readProjectPulse(tmpDir);
  assert.equal(result.exists, false);
});

test('readProjectPulse: reads last_agent and last_gate', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project-pulse.md',
    '---\nlast_agent: dev\nlast_gate: "Gate C: approved"\n---');
  const result = await readProjectPulse(tmpDir);
  assert.equal(result.exists, true);
  assert.equal(result.last_agent, 'dev');
});

// ── detectClassification ──────────────────────────────────────────────────────

test('detectClassification: returns null when no context', async () => {
  const tmpDir = await makeTmpDir();
  const result = await detectClassification(tmpDir, null);
  assert.equal(result, null);
});

test('detectClassification: reads from project.context.md', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---');
  const result = await detectClassification(tmpDir, null);
  assert.equal(result, 'MEDIUM');
});

test('detectClassification: reads from spec frontmatter when context has no classification', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '# Project'); // no frontmatter
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nclassification: SMALL\n---');
  const result = await detectClassification(tmpDir, 'checkout');
  assert.equal(result, 'SMALL');
});

// ── discoverRules ─────────────────────────────────────────────────────────────

test('parseAgentList: parses inline YAML arrays', () => {
  assert.deepEqual(parseAgentList('[dev, architect]'), ['dev', 'architect']);
  assert.deepEqual(parseAgentList('[]'), []);
  assert.deepEqual(parseAgentList(undefined), null);
});

test('appliesToAgent: treats missing agents and empty agents as universal', () => {
  assert.equal(appliesToAgent({}, 'dev'), true);
  assert.equal(appliesToAgent({ agents: '[]' }, 'dev'), true);
  assert.equal(appliesToAgent({ agents: '[architect]' }, 'dev'), false);
  assert.equal(appliesToAgent({ agents: '[dev, architect]' }, 'dev'), true);
});

test('discoverRules: returns empty array when rules dir missing', async () => {
  const tmpDir = await makeTmpDir();
  const result = await discoverRules(tmpDir, 'dev');
  assert.deepEqual(result, []);
});

test('discoverRules: returns universal rules for any agent', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/rules/my-rule.md', '# Rule');
  const result = await discoverRules(tmpDir, 'dev');
  assert.ok(result.includes('my-rule.md'));
});

test('discoverRules: treats agents empty array as universal', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/rules/canonical-path-contract.md',
    '---\nagents: []\n---\n# Canonical Path Contract');
  const result = await discoverRules(tmpDir, 'product');
  assert.ok(result.includes('canonical-path-contract.md'));
});

test('discoverRules: ignores README.md', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/rules/README.md', '# Agent Rules');
  await writeFile(tmpDir, '.aioson/rules/my-rule.md', '# Rule');
  const result = await discoverRules(tmpDir, 'dev');
  assert.ok(result.includes('my-rule.md'));
  assert.ok(!result.includes('README.md'));
});

test('discoverRules: skips non-md files', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/rules/rule.md', '# Rule');
  await writeFile(tmpDir, '.aioson/rules/ignore.txt', 'ignored');
  const result = await discoverRules(tmpDir, 'dev');
  assert.ok(result.includes('rule.md'));
  assert.ok(!result.includes('ignore.txt'));
});

// ── discoverDesignDocs ────────────────────────────────────────────────────────

test('discoverDesignDocs: returns design governance docs for any agent when universal', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/design-docs/file-size.md',
    '---\nagents: []\n---\n# File Size');
  const result = await discoverDesignDocs(tmpDir, 'dev');
  assert.deepEqual(result, ['.aioson/design-docs/file-size.md']);
});

test('discoverDesignDocs: filters agent-specific governance docs', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/design-docs/dev-only.md',
    '---\nagents: [dev]\n---\n# Dev only');
  const result = await discoverDesignDocs(tmpDir, 'architect');
  assert.deepEqual(result, []);
});

// ── buildContextPackage ───────────────────────────────────────────────────────

test('buildContextPackage: includes project.context if exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project.context.md', '---\n---');
  const artifacts = await scanArtifacts(tmpDir, 'checkout');
  const pkg = buildContextPackage('dev', 'checkout', 'SMALL', artifacts, { exists: false });
  assert.ok(pkg.some((p) => p && p.includes('project.context.md')));
});

test('buildContextPackage: includes spec when exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nversion: 1\n---');
  const artifacts = await scanArtifacts(tmpDir, 'checkout');
  const pkg = buildContextPackage('dev', 'checkout', 'SMALL', artifacts, { exists: false });
  assert.ok(pkg.some((p) => p && p.includes('spec-checkout.md')));
});

// ── evaluateReadiness ─────────────────────────────────────────────────────────

test('evaluateReadiness: BLOCKED when project_context missing', () => {
  const artifacts = {
    project_context: { exists: false },
    spec: { exists: true },
    prd: { exists: false },
    requirements: { exists: false }
  };
  const result = evaluateReadiness(artifacts, {}, 'SMALL', 'dev');
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((b) => b.includes('project.context.md')));
});

test('evaluateReadiness: READY when all conditions met for dev', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: true },
    prd: { exists: true },
    requirements: { exists: true },
    design_doc: { exists: true },
    readiness: { exists: true }
  };
  const gates = { plan: 'approved' };
  const result = evaluateReadiness(artifacts, gates, 'SMALL', 'dev');
  assert.equal(result.status, 'READY');
  assert.equal(result.blockers.length, 0);
});

test('evaluateReadiness: BLOCKED when dev spec missing', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: false },
    prd: { exists: true },
    requirements: { exists: true },
    design_doc: { exists: true },
    readiness: { exists: true }
  };
  const result = evaluateReadiness(artifacts, { plan: 'approved' }, 'SMALL', 'dev');
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((b) => b.includes('spec')));
});

test('evaluateReadiness: BLOCKED when dev lacks discovery-design-doc artifacts', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: true },
    prd: { exists: true },
    requirements: { exists: true },
    design_doc: { exists: false },
    readiness: { exists: false }
  };
  const result = evaluateReadiness(artifacts, { plan: 'approved' }, 'SMALL', 'dev');
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((b) => b.includes('design-doc.md')));
  assert.ok(result.blockers.some((b) => b.includes('readiness.md')));
});

test('evaluateReadiness: analyst can proceed with warning for unframed feature discovery', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: false },
    prd: { exists: false },
    requirements: { exists: false }
  };
  const result = evaluateReadiness(artifacts, {}, 'SMALL', 'analyst', { exists: false }, 'code-tab-ide-ux');
  assert.equal(result.status, 'READY_WITH_WARNINGS');
  assert.equal(result.blockers.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('not framed yet')));
});

// ── extractSpecVersion / extractLastCheckpoint ────────────────────────────────

test('extractSpecVersion: returns null when artifact not exists', () => {
  assert.equal(extractSpecVersion({ exists: false }), null);
});

test('extractSpecVersion: reads version from frontmatter', () => {
  const artifact = { exists: true, frontmatter: { version: '3' }, content: '' };
  assert.equal(extractSpecVersion(artifact), '3');
});

test('extractLastCheckpoint: returns null when not exists', () => {
  assert.equal(extractLastCheckpoint({ exists: false }), null);
});

test('extractLastCheckpoint: reads from frontmatter', () => {
  const artifact = {
    exists: true,
    frontmatter: { last_checkpoint: 'Payment service done' },
    content: ''
  };
  assert.equal(extractLastCheckpoint(artifact), 'Payment service done');
});

test('extractLastCheckpoint: scans content if not in frontmatter', () => {
  const artifact = {
    exists: true,
    frontmatter: {},
    content: 'last_checkpoint: "Webhook handler"'
  };
  const result = extractLastCheckpoint(artifact);
  // Engine strips surrounding quotes from the value
  assert.ok(result && result.includes('Webhook handler'));
});

// ── GATE_NAMES / GATE_ALIASES ─────────────────────────────────────────────────

test('GATE_NAMES: has all 4 gates', () => {
  assert.equal(GATE_NAMES.A, 'requirements');
  assert.equal(GATE_NAMES.B, 'design');
  assert.equal(GATE_NAMES.C, 'plan');
  assert.equal(GATE_NAMES.D, 'execution');
});

test('GATE_ALIASES: maps gate names to letters', () => {
  assert.equal(GATE_ALIASES.requirements, 'A');
  assert.equal(GATE_ALIASES.plan, 'C');
});

// ── Phase 2 fixes: evaluateReadiness for qa ───────────────────────────────────

test('evaluateReadiness: qa BLOCKED when Gate C not approved for SMALL', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: true },
    prd: { exists: true },
    requirements: { exists: true },
    design_doc: { exists: true },
    readiness: { exists: true }
  };
  const gates = { plan: 'pending' };
  const result = evaluateReadiness(artifacts, gates, 'SMALL', 'qa');
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((b) => b.includes('Gate C')));
});

test('evaluateReadiness: qa READY when Gate C approved for SMALL', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: true },
    prd: { exists: true },
    requirements: { exists: true },
    design_doc: { exists: true },
    readiness: { exists: true }
  };
  const gates = { plan: 'approved' };
  const result = evaluateReadiness(artifacts, gates, 'SMALL', 'qa');
  assert.equal(result.status, 'READY');
});

test('evaluateReadiness: qa skips Gate C check for MICRO', () => {
  const artifacts = {
    project_context: { exists: true },
    spec: { exists: true },
    prd: { exists: true },
    requirements: { exists: true }
  };
  const gates = { plan: 'pending' };
  const result = evaluateReadiness(artifacts, gates, 'MICRO', 'qa');
  assert.equal(result.status, 'READY');
});

// ── scanActiveManifest — phase table parsing (AC-SDLC-27) ────────────────────

test('scanActiveManifest: returns exists=false when no manifest file', async () => {
  const tmpDir = await makeTmpDir();
  const result = await scanActiveManifest(tmpDir, 'no-such-feature');
  assert.equal(result.exists, false);
});

test('scanActiveManifest: is_active=true when manifest status is ready', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md', '---\nstatus: ready\n---\n# Manifest\n');
  const result = await scanActiveManifest(tmpDir, 'feat');
  assert.equal(result.exists, true);
  assert.equal(result.is_active, true);
});

test('scanActiveManifest: is_active=false when manifest status is done', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md', '---\nstatus: done\n---\n# Manifest\n');
  const result = await scanActiveManifest(tmpDir, 'feat');
  assert.equal(result.exists, true);
  assert.equal(result.is_active, false);
});

test('scanActiveManifest: is_active=false when manifest status is complete', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md', '---\nstatus: complete\n---\n# Manifest\n');
  const result = await scanActiveManifest(tmpDir, 'feat');
  assert.equal(result.is_active, false);
});

test('scanActiveManifest: next_pending_phase is null when no phase table', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md',
    '---\nstatus: ready\n---\n# Manifest\nNo phase table here.\n');
  const result = await scanActiveManifest(tmpDir, 'feat');
  assert.equal(result.exists, true);
  assert.equal(result.next_pending_phase, null);
});

test('scanActiveManifest: next_pending_phase is first non-done phase from table', async () => {
  const tmpDir = await makeTmpDir();
  const manifestContent = `---
status: ready
---

# Manifest

## Phase table

| Phase | File | Status | Purpose |
|---|---|---|---|
| 1 | \`plan-phase-one.md\` | done | Phase one purpose |
| 2 | \`plan-phase-two.md\` | done | Phase two purpose |
| 3 | \`plan-phase-three.md\` | pending | Phase three purpose |
| 4 | \`plan-phase-four.md\` | pending | Phase four purpose |
`;

  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md', manifestContent);
  const result = await scanActiveManifest(tmpDir, 'feat');

  assert.equal(result.exists, true);
  assert.equal(result.is_active, true);
  assert.ok(result.next_pending_phase, 'must have next_pending_phase');
  assert.equal(result.next_pending_phase.phase, 3, 'next pending phase must be 3 (phases 1 and 2 are done)');
  assert.ok(result.next_pending_phase.file.includes('plan-phase-three'), `file must be phase-three, got: ${result.next_pending_phase.file}`);
  assert.equal(result.next_pending_phase.status, 'pending');
});

test('scanActiveManifest: next_pending_phase is null when all phases are done', async () => {
  const tmpDir = await makeTmpDir();
  const manifestContent = `---
status: ready
---

# Manifest

| Phase | File | Status | Purpose |
|---|---|---|---|
| 1 | \`plan-one.md\` | done | Done phase |
| 2 | \`plan-two.md\` | qa_approved | QA approved phase |
`;

  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md', manifestContent);
  const result = await scanActiveManifest(tmpDir, 'feat');

  assert.equal(result.next_pending_phase, null, 'next_pending_phase must be null when all phases done');
});

test('scanActiveManifest: phases array contains all parsed phases', async () => {
  const tmpDir = await makeTmpDir();
  const manifestContent = `---
status: ready
---

| Phase | File | Status | Purpose |
|---|---|---|---|
| 1 | \`plan-alpha.md\` | done | Alpha |
| 2 | \`plan-beta.md\` | pending | Beta |
`;

  await writeFile(tmpDir, '.aioson/plans/feat/manifest.md', manifestContent);
  const result = await scanActiveManifest(tmpDir, 'feat');

  assert.ok(Array.isArray(result.phases), 'phases must be an array');
  assert.equal(result.phases.length, 2, 'must have 2 phases');
  assert.equal(result.phases[0].phase, 1);
  assert.equal(result.phases[0].status, 'done');
  assert.equal(result.phases[1].phase, 2);
  assert.equal(result.phases[1].status, 'pending');
});

// ── detectStaleDevState ───────────────────────────────────────────────────────

test('detectStaleDevState: returns null when dev-state does not exist', () => {
  const result = detectStaleDevState({ exists: false }, 'checkout');
  assert.equal(result, null);
});

test('detectStaleDevState: returns null when active_feature matches slug and is active', () => {
  const devState = { exists: true, active_feature: 'checkout', status: 'in_progress' };
  const result = detectStaleDevState(devState, 'checkout');
  assert.equal(result, null);
});

test('detectStaleDevState: warns when active_feature differs from slug', () => {
  const devState = { exists: true, active_feature: 'billing', status: 'in_progress' };
  const result = detectStaleDevState(devState, 'checkout');
  assert.ok(result !== null, 'must warn for feature mismatch');
  assert.ok(result.includes('billing'), 'warning must name the stale feature');
});

test('detectStaleDevState: warns when status is done', () => {
  const devState = { exists: true, active_feature: 'checkout', status: 'done' };
  const result = detectStaleDevState(devState, 'checkout');
  assert.ok(result !== null, 'must warn when dev-state is done');
  assert.ok(result.toLowerCase().includes('done') || result.toLowerCase().includes('complet'), 'warning must mention done status');
});

// ── Phase 2 fixes: extractLastCheckpoint last occurrence ──────────────────────

test('extractLastCheckpoint: returns last occurrence when multiple exist', () => {
  const artifact = {
    exists: true,
    frontmatter: {},
    content: 'last_checkpoint: "Outdated value"\n\n# Notes\nlast_checkpoint: "Latest value"'
  };
  const result = extractLastCheckpoint(artifact);
  assert.ok(result && result.includes('Latest'));
  assert.ok(!result.includes('Outdated'));
});

// ── Phase 2 fixes: detectTestRunner — node:test and test:unit ─────────────────

test('detectTestRunner: detects node:test from package.json scripts', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'package.json', JSON.stringify({
    scripts: { test: 'node --test tests/' }
  }));
  const result = await detectTestRunner(tmpDir);
  assert.ok(result);
  assert.equal(result.name, 'node:test');
});

test('detectTestRunner: detects jest from test:unit script', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, 'package.json', JSON.stringify({
    scripts: { 'test:unit': 'jest --coverage', 'test:e2e': 'cypress run' }
  }));
  const result = await detectTestRunner(tmpDir);
  assert.ok(result);
  assert.equal(result.name, 'Jest');
  assert.equal(result.command, 'npm run test:unit');
});
