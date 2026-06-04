'use strict';

/**
 * Regression bundle for the agent-chain-continuity feature (17 ACs).
 *
 * One focused test per AC (AC-ACC-01 to AC-ACC-17). Each test exercises the
 * live code path or live workspace artifact and asserts the AC contract. The
 * unit suites under tests/dossier/, tests/dossier-add-research.test.js,
 * tests/dossier-audit.test.js, tests/handoff-contract-v2.test.js,
 * tests/agent-chain-continuity-phase3.test.js, tests/sync-agents-preflight.test.js
 * and tests/dev-resume.test.js cover edge cases; this bundle gives a single
 * traceable map from each AC to a passing assertion.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

const { activateStage } = require('../src/commands/workflow-next');
const { runFeatureClose } = require('../src/commands/feature-close');
const { runDossierAddResearch } = require('../src/commands/dossier-add-research');
const { runDossierAudit, CHAIN_AGENTS } = require('../src/commands/dossier-audit');
const { runDevResumeData } = require('../src/commands/dev-resume');
const { checkParity } = require('../src/commands/sync-agents-preflight');
const {
  ARTIFACT_KINDS,
  buildWorkflowHandoffProtocol,
  readHandoffProtocol,
  HANDOFF_PROTOCOL_RELATIVE_PATH
} = require('../src/session-handoff');
const {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  RESEARCH_VERDICTS
} = require('../src/dossier/schema');

function silentLogger() {
  return { log() {}, error() {}, warn() {} };
}

async function makeProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-acc-regression-'));
  await fs.mkdir(path.join(tmp, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, '.aioson', 'context', 'project.context.md'),
    '---\nclassification: MEDIUM\n---\n# context',
    'utf8'
  );
  return tmp;
}

async function writePrd(tmp, slug, classification = 'MEDIUM') {
  await fs.writeFile(
    path.join(tmp, '.aioson', 'context', `prd-${slug}.md`),
    `---\nclassification: "${classification}"\n---\n\n# PRD\n\n## Why\nbecause\n\n## Escopo do MVP\nthings\n`,
    'utf8'
  );
}

async function writeFeaturesMd(tmp, rows) {
  const lines = ['# Features', '', '| slug | status | started | completed |', '|------|--------|---------|-----------|'];
  for (const r of rows) {
    lines.push(`| ${r.slug} | ${r.status} | ${r.started || '—'} | ${r.completed || '—'} |`);
  }
  await fs.writeFile(path.join(tmp, '.aioson', 'context', 'features.md'), lines.join('\n') + '\n', 'utf8');
}

async function dossierExists(tmp, slug) {
  return fs
    .access(path.join(tmp, '.aioson', 'context', 'features', slug, 'dossier.md'))
    .then(() => true)
    .catch(() => false);
}

describe('agent-chain-continuity — AC regression bundle', () => {
  it('AC-ACC-01: auto-init triggers on first stage activation for SMALL/MEDIUM features', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'acc-01', 'MEDIUM');
      await activateStage(
        tmp,
        { mode: 'feature', classification: 'MEDIUM', featureSlug: 'acc-01', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );
      assert.equal(await dossierExists(tmp, 'acc-01'), true);
      const dossier = await fs.readFile(
        path.join(tmp, '.aioson', 'context', 'features', 'acc-01', 'dossier.md'),
        'utf8'
      );
      assert.match(dossier, /schema_version: "1\.\d+"/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-02: auto-init does NOT fire for MICRO features', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'acc-02', 'MICRO');
      await activateStage(
        tmp,
        { mode: 'feature', classification: 'MICRO', featureSlug: 'acc-02', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );
      assert.equal(await dossierExists(tmp, 'acc-02'), false);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-03: agent-templates.md prescribes @sheldon writes to Agent Trail (not Why)', async () => {
    const templates = await fs.readFile(
      path.join(REPO_ROOT, '.aioson', 'docs', 'dossier', 'agent-templates.md'),
      'utf8'
    );
    const sheldonStart = templates.indexOf('## @sheldon');
    assert.ok(sheldonStart > -1, 'agent-templates.md must include @sheldon section');
    const sheldonEnd = templates.indexOf('\n## @', sheldonStart + 1);
    const block = templates.slice(sheldonStart, sheldonEnd === -1 ? templates.length : sheldonEnd);
    assert.match(block, /Agent Trail/);
    assert.match(block, /Research Index/);
    assert.match(block, /no longer writes to .Why./);
  });

  it('AC-ACC-04: dossier:add-research dedupes by research-slug (idempotent + last-write-wins)', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'acc-04');
      await activateStage(
        tmp,
        { mode: 'feature', classification: 'MEDIUM', featureSlug: 'acc-04', current: null, next: 'product' },
        'en',
        'codex',
        'product',
        null
      );

      const opts = {
        slug: 'acc-04',
        'research-slug': 'r-one',
        agent: 'analyst',
        verdict: 'confirmed',
        'why-relevant': 'first',
        json: true
      };
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        const a = await runDossierAddResearch({ args: ['.'], options: opts });
        const b = await runDossierAddResearch({ args: ['.'], options: opts });
        const c = await runDossierAddResearch({
          args: ['.'],
          options: { ...opts, verdict: 'outdated', 'why-relevant': 'second' }
        });
        assert.equal(a.added, true);
        assert.equal(b.added, false);
        assert.equal(b.updated, false);
        assert.equal(c.updated, true);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-05: handoff-protocol.artifact_uris is an array of v2 objects', async () => {
    const protocol = buildWorkflowHandoffProtocol(
      { mode: 'feature', classification: 'MEDIUM', featureSlug: 'x' },
      'product',
      'analyst',
      { artifactUris: [{ path: '.aioson/context/prd-x.md', kind: 'prd', agent: 'product', added_at: '2026-05-07T10:00:00Z' }] }
    );
    assert.ok(Array.isArray(protocol.artifact_uris));
    for (const item of protocol.artifact_uris) {
      assert.equal(typeof item, 'object');
      for (const key of ['path', 'kind', 'agent', 'added_at']) {
        assert.ok(Object.prototype.hasOwnProperty.call(item, key), `artifact_uris item must have ${key}`);
      }
      assert.ok(ARTIFACT_KINDS.includes(item.kind));
    }
  });

  it('AC-ACC-06: handoff-protocol with legacy v1 strings is read without error', async () => {
    const tmp = await makeProject();
    try {
      const legacyProtocol = {
        version: '1.0',
        protocol_id: 'hnd-legacy',
        from: { agent_id: 'product', capability_transferred: 'define_product_scope' },
        to: { agent_id: 'analyst', capability_required: 'analyze_requirements' },
        artifact_uris: ['.aioson/context/prd-x.md', '.aioson/context/features.md']
      };
      await fs.writeFile(
        path.join(tmp, HANDOFF_PROTOCOL_RELATIVE_PATH),
        JSON.stringify(legacyProtocol, null, 2)
      );
      const parsed = await readHandoffProtocol(tmp);
      assert.equal(parsed.artifact_uris.length, 2);
      assert.equal(typeof parsed.artifact_uris[0], 'object');
      assert.equal(parsed.artifact_uris[0].path, '.aioson/context/prd-x.md');
      assert.equal(parsed.artifact_uris[0].kind, 'other');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-07: feature:close --verdict=PASS without a dossier auto-runs from-existing', async () => {
    const tmp = await makeProject();
    try {
      await writePrd(tmp, 'acc-07');
      await writeFeaturesMd(tmp, [{ slug: 'acc-07', status: 'in_progress', started: '2026-05-01' }]);
      const result = await runFeatureClose({
        args: [tmp],
        options: { feature: 'acc-07', verdict: 'PASS', json: true, 'no-archive': true },
        logger: silentLogger()
      });
      assert.equal(result.ok, true);
      assert.equal(await dossierExists(tmp, 'acc-07'), true);
      assert.ok(result.updates.some((u) => /dossier:.*synthesized from existing artifacts/.test(u)));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-08: feature:close with EBOOTSTRAPEMPTY writes a minimal-fallback dossier', async () => {
    const tmp = await makeProject();
    try {
      await writeFeaturesMd(tmp, [{ slug: 'acc-08', status: 'in_progress', started: '2026-05-01' }]);
      const result = await runFeatureClose({
        args: [tmp],
        options: { feature: 'acc-08', verdict: 'PASS', json: true, 'no-archive': true },
        logger: silentLogger()
      });
      assert.equal(result.ok, true);
      assert.equal(await dossierExists(tmp, 'acc-08'), true);
      const dossier = await fs.readFile(
        path.join(tmp, '.aioson', 'context', 'features', 'acc-08', 'dossier.md'),
        'utf8'
      );
      assert.match(dossier, /no source artifacts found at close time/);
      assert.ok(result.updates.some((u) => /dossier:.*minimal fallback/.test(u)));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-09: dev:resume-data emits 4-element payload for in-progress features', async () => {
    const tmp = await makeProject();
    try {
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'last-handoff.json'),
        JSON.stringify({
          feature_slug: 'acc-09',
          artifact_uris: [{ path: '.aioson/context/prd-acc-09.md', kind: 'prd', agent: 'product', added_at: null }]
        }),
        'utf8'
      );
      await writeFeaturesMd(tmp, [{ slug: 'acc-09', status: 'in_progress' }]);
      await writePrd(tmp, 'acc-09');
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_feature: acc-09\nactive_phase: 7\nnext_step: "Phase 7"\n---\nbody',
        'utf8'
      );
      const r = await runDevResumeData({ args: [tmp], options: { json: true } });
      assert.equal(r.ok, true);
      assert.equal(r.data.feature_slug, 'acc-09');
      assert.equal(r.data.current_phase, '7');
      assert.ok(r.data.artifacts_consumed.length >= 1);
      for (const key of ['feature_slug', 'classification', 'current_phase', 'artifacts_consumed', 'code_map_paths', 'sheldon_plan', 'next_step']) {
        assert.ok(Object.prototype.hasOwnProperty.call(r.data, key), `resume payload must include ${key}`);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-10: @dev prompt instructs drift detection by comparing path against code_map_paths', async () => {
    const dev = await fs.readFile(path.join(REPO_ROOT, '.aioson', 'agents', 'dev.md'), 'utf8');
    assert.match(dev, /code_map_paths/);
    assert.match(dev, /Drift detection/i);
    assert.match(dev, /3 options.*\(proceed/);
    assert.match(dev, /DRIFT:/);
  });

  it('AC-ACC-11: @dev prompt instructs drift detection for already-executed Sheldon plan steps', async () => {
    const dev = await fs.readFile(path.join(REPO_ROOT, '.aioson', 'agents', 'dev.md'), 'utf8');
    assert.match(dev, /Sheldon\s+plan\s+step.*already\s+ran.*without an Agent Trail entry/i);
  });

  it('AC-ACC-12: drift detection scope is limited to Code Map paths and Sheldon plan steps', async () => {
    const dev = await fs.readFile(path.join(REPO_ROOT, '.aioson', 'agents', 'dev.md'), 'utf8');
    const sectionStart = dev.indexOf('**Drift detection');
    const sectionEnd = dev.indexOf('**Per slice');
    assert.ok(sectionStart > -1 && sectionEnd > sectionStart);
    const block = dev.slice(sectionStart, sectionEnd);
    assert.match(block, /code_map_paths/);
    assert.match(block, /Sheldon/);
    assert.doesNotMatch(block, /every file modified/i);
  });

  it('AC-ACC-13: workspace ↔ template parity for the 9 chain agents has zero violations', async () => {
    const result = await runDossierAudit({
      args: [REPO_ROOT],
      options: { check: 'template-parity', json: true }
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
    assert.equal(result.checked.length, CHAIN_AGENTS.length);
  });

  it('AC-ACC-14: sync-agents preflight aborts when workspace has unpropagated edits', async () => {
    const tmp = await makeProject();
    try {
      await fs.mkdir(path.join(tmp, '.aioson', 'agents'), { recursive: true });
      await fs.mkdir(path.join(tmp, 'template', '.aioson', 'agents'), { recursive: true });
      const longer = '## Feature dossier\n- one\n- two\n- three\n- four\n\n';
      const shorter = '## Feature dossier\n- one\n\n';
      await fs.writeFile(
        path.join(tmp, '.aioson', 'agents', 'product.md'),
        `# Agent\n\n${longer}## Position\nx\n`,
        'utf8'
      );
      await fs.writeFile(
        path.join(tmp, 'template', '.aioson', 'agents', 'product.md'),
        `# Agent\n\n${shorter}## Position\nx\n`,
        'utf8'
      );
      const violations = checkParity(tmp);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].agent, 'product');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-15: dossier:audit --check=coverage flags in-progress SMALL/MEDIUM features without dossier', async () => {
    const tmp = await makeProject();
    try {
      await writeFeaturesMd(tmp, [{ slug: 'acc-15', status: 'in_progress', started: '2026-05-01' }]);
      await writePrd(tmp, 'acc-15', 'SMALL');
      const result = await runDossierAudit({
        args: [tmp],
        options: { check: 'coverage', json: true }
      });
      assert.equal(result.ok, false);
      assert.equal(result.missing_dossier.length, 1);
      assert.equal(result.missing_dossier[0].slug, 'acc-15');
      assert.equal(result.missing_dossier[0].classification, 'SMALL');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('AC-ACC-16: schema v1.2 reads v1.0 and v1.1 dossiers via SUPPORTED_SCHEMA_VERSIONS', async () => {
    assert.equal(SCHEMA_VERSION, '1.2');
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has('1.0'));
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has('1.1'));
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has('1.2'));
    assert.ok(RESEARCH_VERDICTS.has('confirmed'));
    assert.ok(RESEARCH_VERDICTS.has('has-alternatives'));
    assert.ok(RESEARCH_VERDICTS.has('outdated'));
    assert.ok(RESEARCH_VERDICTS.has('deprecated'));
  });

  it('AC-ACC-17: 5 telemetry event types are wired into the codebase', async () => {
    const expected = [
      'dossier_auto_initialized',
      'feature_close_dossier_synthesized',
      'dev_drift_detected',
      'dev_auto_resume',
      'sync_agents_parity_violation'
    ];

    const featureClose = await fs.readFile(
      path.join(REPO_ROOT, 'src', 'commands', 'feature-close.js'),
      'utf8'
    );
    assert.match(featureClose, /feature_close_dossier_synthesized/);

    const workflowNext = await fs.readFile(
      path.join(REPO_ROOT, 'src', 'commands', 'workflow-next.js'),
      'utf8'
    );
    assert.match(workflowNext, /dossier_auto_initialized/);

    const devMd = await fs.readFile(path.join(REPO_ROOT, '.aioson', 'agents', 'dev.md'), 'utf8');
    assert.match(devMd, /dev_auto_resume/);
    assert.match(devMd, /dev_drift_detected/);

    // sync_agents_parity_violation: emitted by sync-agents-preflight.js abort path.
    const syncPreflight = await fs.readFile(
      path.join(REPO_ROOT, 'src', 'commands', 'sync-agents-preflight.js'),
      'utf8'
    );
    assert.match(syncPreflight, /sync_agents_parity_violation/);
    assert.match(syncPreflight, /emitDossierEvent/);

    // sanity: every name accounted for above
    assert.equal(expected.length, 5);
  });
});
