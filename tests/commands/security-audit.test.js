'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { runSecurityAudit } = require('../../src/commands/security-audit');
const { EXIT_CODES } = require('../../src/lib/security/exit-codes');
const { openRuntimeDb } = require('../../src/runtime-store');

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

let prevCwd;
let prevExitCode;
let root;

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-secaudit-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

function buildAttackSurfaceSection({ surfaces = [], attackSurfaceRows = [] } = {}) {
  if (attackSurfaceRows.length > 0) {
    return [
      '## Attack Surface Map',
      '',
      '| Surface | Current feature value |',
      '|---|---|',
      ...attackSurfaceRows.map(([label, value]) => `| ${label} | ${value} |`),
      ''
    ].join('\n');
  }
  if (surfaces.length > 0) {
    return `## Attack Surface Map\n\n${surfaces.map((s) => `- ${s}`).join('\n')}\n`;
  }
  return '';
}

async function writeArtifacts(
  dir,
  slug,
  { classification = 'MEDIUM', surfaces = [], attackSurfaceRows = [], specControls = [], specNotes = [] } = {}
) {
  const ctx = path.join(dir, '.aioson', 'context');
  const surfacesText = buildAttackSurfaceSection({ surfaces, attackSurfaceRows });
  const reqContent = `---\nclassification: "${classification}"\n---\n# Requirements ${slug}\n\n${surfacesText}`;
  const specLines = [
    `---\nfeature: ${slug}\n---`,
    `# Spec ${slug}`,
    '',
    ...specNotes,
    ...specControls.map((c) => `- ${c}: covered`)
  ];
  const specContent = `${specLines.join('\n')}\n`;
  const prdContent = `# PRD ${slug}\n`;
  await fs.writeFile(path.join(ctx, `prd-${slug}.md`), prdContent);
  await fs.writeFile(path.join(ctx, `requirements-${slug}.md`), reqContent);
  await fs.writeFile(path.join(ctx, `spec-${slug}.md`), specContent);
}

describe('security:audit', () => {
  beforeEach(() => {
    prevCwd = process.cwd();
    prevExitCode = process.exitCode;
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    process.exitCode = prevExitCode;
    if (root) {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      root = null;
    }
  });

  it('requires --slug', async () => {
    root = await makeProject();
    const r = await runSecurityAudit({
      args: [root],
      options: { json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BAD_INPUT);
    assert.equal(r.reason, 'missing_slug');
  });

  it('returns BAD_INPUT when slug has no artifacts', async () => {
    root = await makeProject();
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'ghost', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BAD_INPUT);
    assert.equal(r.reason, 'slug_artifacts_missing');
  });

  it('passes (exit 0) on a feature with no sensitive surfaces at MEDIUM', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'csv-export', { classification: 'MEDIUM', surfaces: [], specControls: [] });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'csv-export', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS, 'no sensitive surfaces → no audit blockers');
  });

  it('blocks (exit 10) on MEDIUM auth feature missing SEC-SBD-08 evidence', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'login', {
      classification: 'MEDIUM',
      surfaces: ['authenticated_endpoints', 'roles'],
      specControls: []
    });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'login', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.BLOCKING);
    assert.ok(r.summary.high >= 1);
  });

  it('passes when MEDIUM auth feature spec mentions required controls', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'login', {
      classification: 'MEDIUM',
      surfaces: ['authenticated_endpoints', 'roles'],
      specControls: ['SEC-SBD-03', 'SEC-SBD-08']
    });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'login', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS);
  });

  it('does NOT block MICRO even with missing controls', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'login', {
      classification: 'MICRO',
      surfaces: ['authenticated_endpoints'],
      specControls: []
    });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'login', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS, 'MICRO is advisory and must not block');
  });

  it('writes review_contract block for @qa to consume', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'login', {
      classification: 'MEDIUM',
      surfaces: ['authenticated_endpoints'],
      specControls: ['SEC-SBD-03', 'SEC-SBD-08']
    });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'login', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    const written = JSON.parse(await fs.readFile(r.artifactPath, 'utf8'));
    assert.equal(written.schema_version, '1.0.0');
    assert.equal(written.review_contract.scope_mode, 'feature');
    assert.equal(written.review_contract.evidence_policy, 'high_critical_require_reproduction');
    assert.ok(written.review_contract.findings_artifact_path.includes('security-findings-login.json'));
  });

  it('passes when Attack Surface Map marks all surfaces as not introduced', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'meta-feature', {
      classification: 'MEDIUM',
      attackSurfaceRows: [
        ['Authenticated endpoints', 'None introduced by this feature.'],
        ['Owned resources', 'No new resource introduced in this feature.'],
        ['Financial state changes', 'Future generated apps only.'],
        ['Uploads', 'No new upload surface.'],
        ['External URLs', 'N/A for this feature.'],
        ['Secrets or credentials', 'Future generated apps only.'],
        ['Storage boundaries', 'Not applicable in this phase.'],
        ['Pentester trigger', 'skip']
      ]
    });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'meta-feature', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS);
    assert.equal(r.summary.high, 0);
  });

  it('passes on meta-feature requirements when spec declares no sensitive attack surface', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'secure-by-default', {
      classification: 'MEDIUM',
      attackSurfaceRows: [
        ['Authenticated endpoints', 'None introduced by this feature. This feature defines controls for future generated apps.'],
        ['Roles', 'Agent roles: analyst, architect, dev, qa, pentester. Human role: developer using CLI.'],
        ['Owned resources', 'Future app resources requiring IDOR/ownership checks. No new app resource in AIOSON core Phase 1.'],
        ['Financial state changes', 'Future generated apps; no AIOSON core money state in Phase 1.'],
        ['Uploads', 'Future generated apps; no upload endpoint in AIOSON core Phase 1.'],
        ['External URLs', 'Future generated apps; baseline must require sanitization policy when present.'],
        ['Secrets or credentials', 'CLI/project repositories; security:scan later verifies hardcoded secrets and .env leakage.'],
        ['Storage boundaries', '.aioson/context/, .aioson/rules/, template sync, runtime SQLite.'],
        ['Pentester trigger', 'Conditional for future features with auth/money/ownership; not required for Phase 1 implementation itself.']
      ],
      specNotes: ['- Feature has no sensitive attack surface.']
    });
    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'secure-by-default', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });
    assert.equal(r.exitCode, EXIT_CODES.PASS);
    assert.equal(r.summary.high, 0);
  });

  it('emits security_audit_completed runtime event with audit metadata', async () => {
    root = await makeProject();
    await writeArtifacts(root, 'login', {
      classification: 'MEDIUM',
      surfaces: ['authenticated_endpoints'],
      specControls: ['SEC-SBD-03', 'SEC-SBD-08']
    });

    const r = await runSecurityAudit({
      args: [root],
      options: { slug: 'login', json: true, now: '2026-04-28T00:00:00.000Z' },
      logger: silentLogger()
    });

    const runtime = await openRuntimeDb(root, { mustExist: true });
    try {
      const event = runtime.db.prepare(`
        SELECT event_type, status, payload_json
        FROM execution_events
        WHERE event_type = 'security_audit_completed'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get();

      assert.equal(event.event_type, 'security_audit_completed');
      assert.equal(event.status, 'completed');
      const payload = JSON.parse(event.payload_json);
      assert.equal(payload.slug, 'login');
      assert.equal(payload.exitCode, r.exitCode);
      assert.equal(payload.findingsCount, r.findingsCount);
    } finally {
      runtime.db.close();
    }
  });
});
