'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  analyzeSquadPilot,
  computePilotFingerprint,
  PILOT_STATUSES,
  PILOT_DOC_SECTIONS
} = require('../src/lib/squad-pilot-lint');
const { runSquadPilotApprove } = require('../src/commands/squad-pilot-approve');
const { runVerifyArtifact, availableKinds } = require('../src/commands/verify-artifact');
const { AGENT_ARTIFACT_KIND } = require('../src/artifact-kinds');

const ROOT = path.join(__dirname, '..');
const SLUG = 'demo-squad';

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-squad-pilot-'));
}

const GOOD_DOC = `# Pilot — Demo Squad

## Pilot task

One complete cinematic landing for a fictional studio.

## Validations

- \`npx serve output/${SLUG}/pilot\`: entrypoint opened, PASS (exit 0)

## Binds

Layout language, motion, states, interaction contracts.

## Does not bind

Backend integration, full page set, scale.
`;

function writePilotFixture(dir, {
  mode = 'software',
  lane = 'standard',
  pilot = { status: 'draft', task: 'One cinematic landing', entrypoint: `output/${SLUG}/pilot/index.html` },
  doc = GOOD_DOC,
  entryContent = '<!doctype html><h1>Pilot</h1>',
  omitPilotBlock = false,
  omitDoc = false,
  omitDeliverable = false
} = {}) {
  const squadDir = path.join(dir, '.aioson', 'squads', SLUG);
  fs.mkdirSync(path.join(squadDir, 'docs'), { recursive: true });
  const manifest = {
    schemaVersion: '2.0',
    slug: SLUG,
    name: 'Demo Squad',
    mode,
    mission: 'Build cinematic sites',
    goal: 'Ship the flagship vertical',
    deliveryLane: lane
  };
  if (!omitPilotBlock) manifest.pilot = pilot;
  fs.writeFileSync(path.join(squadDir, 'squad.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (!omitDoc) fs.writeFileSync(path.join(squadDir, 'docs', 'PILOT.md'), doc, 'utf8');
  if (!omitDeliverable) {
    const pilotDir = path.join(dir, 'output', SLUG, 'pilot');
    fs.mkdirSync(pilotDir, { recursive: true });
    fs.writeFileSync(path.join(pilotDir, 'index.html'), entryContent, 'utf8');
  }
  return dir;
}

test('the status enum and mandatory doc sections are pinned', () => {
  assert.deepEqual(PILOT_STATUSES, ['not_applicable', 'pending', 'draft', 'approved']);
  assert.deepEqual(PILOT_DOC_SECTIONS, ['Pilot task', 'Validations', 'Binds', 'Does not bind']);
});

test('a well-formed draft pilot measures clean', () => {
  const dir = writePilotFixture(tmpDir());
  const result = analyzeSquadPilot({ targetDir: dir, slug: SLUG });
  assert.deepEqual(result.issues, []);
  assert.equal(result.metrics.status, 'draft');
  assert.equal(result.metrics.deliverable_files, 1);
});

test('not_applicable is legal for content mode and an issue for deliverable mode', () => {
  const content = writePilotFixture(tmpDir(), { mode: 'content', pilot: { status: 'not_applicable' }, omitDoc: true, omitDeliverable: true });
  assert.deepEqual(analyzeSquadPilot({ targetDir: content, slug: SLUG }).issues, []);

  const software = writePilotFixture(tmpDir(), { mode: 'software', pilot: { status: 'not_applicable' }, omitDoc: true, omitDeliverable: true });
  assert.ok(analyzeSquadPilot({ targetDir: software, slug: SLUG }).issues.some((i) => i.includes('cannot record pilot.status: not_applicable')));
});

test('a missing pilot block is an issue for deliverable mode and a warning otherwise', () => {
  const software = writePilotFixture(tmpDir(), { omitPilotBlock: true, omitDoc: true, omitDeliverable: true });
  assert.ok(analyzeSquadPilot({ targetDir: software, slug: SLUG }).issues.some((i) => i.includes('has no pilot block')));

  const research = writePilotFixture(tmpDir(), { mode: 'research', omitPilotBlock: true, omitDoc: true, omitDeliverable: true });
  const result = analyzeSquadPilot({ targetDir: research, slug: SLUG });
  assert.deepEqual(result.issues, []);
  assert.ok(result.warnings.some((w) => w.includes('not_applicable')));
});

test('pending defers only on the quick lane, and only with a concrete reason', () => {
  const bare = writePilotFixture(tmpDir(), { pilot: { status: 'pending' }, omitDoc: true, omitDeliverable: true });
  assert.ok(analyzeSquadPilot({ targetDir: bare, slug: SLUG }).issues.some((i) => i.includes('pilot pending')));

  const quick = writePilotFixture(tmpDir(), { lane: 'quick', pilot: { status: 'pending', deferReason: 'ephemeral scan squad' }, omitDoc: true, omitDeliverable: true });
  const quickResult = analyzeSquadPilot({ targetDir: quick, slug: SLUG });
  assert.deepEqual(quickResult.issues, []);
  assert.ok(quickResult.warnings.some((w) => w.includes('pilot deferred')));

  for (const lane of ['standard', 'premium', 'regulated']) {
    const dir = writePilotFixture(tmpDir(), { lane, pilot: { status: 'pending', deferReason: 'speed' }, omitDoc: true, omitDeliverable: true });
    assert.ok(
      analyzeSquadPilot({ targetDir: dir, slug: SLUG }).issues.some((i) => i.includes(`"${lane}" cannot defer`)),
      `${lane} must not defer a pilot`
    );
  }
});

test('the entrypoint must exist and stay contained under output/{slug}/pilot/', () => {
  const escaped = writePilotFixture(tmpDir(), {
    pilot: { status: 'draft', task: 't', entrypoint: 'output/other/pilot/index.html' }
  });
  assert.ok(analyzeSquadPilot({ targetDir: escaped, slug: SLUG }).issues.some((i) => i.includes('must live under')));

  const missing = writePilotFixture(tmpDir(), {
    pilot: { status: 'draft', task: 't', entrypoint: `output/${SLUG}/pilot/missing.html` }
  });
  assert.ok(analyzeSquadPilot({ targetDir: missing, slug: SLUG }).issues.some((i) => i.includes('does not exist on disk')));
});

test('PILOT.md sections, command evidence, and deliverable placeholders are enforced', () => {
  const noSection = writePilotFixture(tmpDir(), { doc: GOOD_DOC.replace('## Does not bind', '## Fora do escopo') });
  assert.ok(analyzeSquadPilot({ targetDir: noSection, slug: SLUG }).issues.some((i) => i.includes('## Does not bind')));

  const noEvidence = writePilotFixture(tmpDir(), { doc: GOOD_DOC.replace(/- `npx serve.*$/m, 'Everything worked well.') });
  assert.ok(analyzeSquadPilot({ targetDir: noEvidence, slug: SLUG }).issues.some((i) => i.includes('exact executed command')));

  const placeholder = writePilotFixture(tmpDir(), { entryContent: '<!doctype html><h1>TODO finish hero</h1>' });
  assert.ok(analyzeSquadPilot({ targetDir: placeholder, slug: SLUG }).issues.some((i) => i.includes('placeholder content')));

  const empty = writePilotFixture(tmpDir(), { omitDeliverable: true });
  assert.ok(analyzeSquadPilot({ targetDir: empty, slug: SLUG }).issues.some((i) => i.includes('pilot deliverable is empty')));
});

test('approved requires fingerprint and approved_at, and detects a stale deliverable', () => {
  const dir = writePilotFixture(tmpDir(), {
    pilot: { status: 'approved', task: 't', entrypoint: `output/${SLUG}/pilot/index.html` }
  });
  const missingFp = analyzeSquadPilot({ targetDir: dir, slug: SLUG });
  assert.ok(missingFp.issues.some((i) => i.includes('missing its fingerprint')));
  assert.ok(missingFp.issues.some((i) => i.includes('missing approved_at')));

  const computed = computePilotFingerprint(dir, SLUG);
  const manifestPath = path.join(dir, '.aioson', 'squads', SLUG, 'squad.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.pilot.fingerprint = computed.fingerprint;
  manifest.pilot.approved_at = '2026-08-12T12:00:00.000Z';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  assert.deepEqual(analyzeSquadPilot({ targetDir: dir, slug: SLUG }).issues, []);

  fs.writeFileSync(path.join(dir, 'output', SLUG, 'pilot', 'index.html'), '<!doctype html><h1>Edited after freeze</h1>', 'utf8');
  assert.ok(analyzeSquadPilot({ targetDir: dir, slug: SLUG }).issues.some((i) => i.includes('fingerprint is stale')));
});

test('squad:pilot-approve freezes a clean draft and re-freezes a stale approval', async () => {
  const dir = writePilotFixture(tmpDir());
  const logger = makeLogger();
  const res = await runSquadPilotApprove({ args: [dir], options: { squad: SLUG, json: true }, logger });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.status, 'approved');
  assert.match(res.fingerprint, /^sha256:[0-9a-f]{64}$/);

  const manifestPath = path.join(dir, '.aioson', 'squads', SLUG, 'squad.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.pilot.status, 'approved');
  assert.equal(manifest.pilot.fingerprint, computePilotFingerprint(dir, SLUG).fingerprint);
  assert.ok(manifest.pilot.approved_at);

  // Edit after freeze → lint reports stale → re-approve is the documented fix.
  fs.writeFileSync(path.join(dir, 'output', SLUG, 'pilot', 'index.html'), '<!doctype html><h1>v2</h1>', 'utf8');
  assert.ok(analyzeSquadPilot({ targetDir: dir, slug: SLUG }).issues.some((i) => i.includes('stale')));
  const again = await runSquadPilotApprove({ args: [dir], options: { squad: SLUG, json: true }, logger });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.deepEqual(analyzeSquadPilot({ targetDir: dir, slug: SLUG }).issues, []);
});

test('squad:pilot-approve refuses gate failures and non-approvable statuses', async () => {
  const logger = makeLogger();
  const dirty = writePilotFixture(tmpDir(), { entryContent: '<!doctype html><h1>TODO</h1>' });
  const failed = await runSquadPilotApprove({ args: [dirty], options: { squad: SLUG }, logger });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'pilot_gate_failed');

  const pending = writePilotFixture(tmpDir(), { pilot: { status: 'pending' }, omitDoc: true, omitDeliverable: true });
  const notApprovable = await runSquadPilotApprove({ args: [pending], options: { squad: SLUG }, logger });
  assert.equal(notApprovable.error, 'pilot_not_approvable');

  const missing = await runSquadPilotApprove({ args: [tmpDir()], options: { squad: SLUG }, logger });
  assert.equal(missing.error, 'manifest_missing');
  assert.equal((await runSquadPilotApprove({ args: [tmpDir()], options: {}, logger })).error, 'missing_slug');
});

// ── adapter and bridge wiring ──

test('kind=squad-pilot is registered, requires a slug, and is bridged from @squad', async () => {
  assert.ok(availableKinds().includes('squad-pilot'));
  assert.equal(AGENT_ARTIFACT_KIND.squad.kind, 'squad-pilot');
  assert.equal(AGENT_ARTIFACT_KIND.squad.needs, 'slug');
  // The pilot's session end also measures its visual floor when it is a web surface.
  assert.deepEqual(AGENT_ARTIFACT_KIND.squad.also.map((m) => m.kind), ['squad-package', 'visual']);

  const logger = makeLogger();
  const res = await runVerifyArtifact({ args: ['.'], options: { kind: 'squad-pilot', json: true, suppressExitCode: true }, logger });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'missing_slug');
});

test('kind=squad-pilot measures a real fixture end to end', async () => {
  const dir = writePilotFixture(tmpDir());
  const logger = makeLogger();
  const res = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'squad-pilot', slug: SLUG, json: true, advisory: true, suppressExitCode: true },
    logger
  });
  assert.equal(res.ok, true, JSON.stringify(res.issues));
  assert.equal(res.metrics.status, 'draft');
});

// ── kernel, docs, and template parity pins ──

test('the squad kernel carries the pilot contract', async () => {
  const kernel = await fsp.readFile(path.join(ROOT, '.aioson', 'agents', 'squad.md'), 'utf8');
  assert.match(kernel, /@squad pilot <slug>.*squad-pilot\.md/);
  assert.match(kernel, /--kind=squad-pilot --slug=<slug> --advisory/);
  assert.match(kernel, /freeze belongs exclusively to the user/);
  assert.match(kernel, /pilot-gate\.md/);
  assert.match(kernel, /agent:done \. --agent=squad --slug=<slug>/);
});

test('pilot module, task, and domain seeds exist with template parity', async () => {
  // Workspace copies of these are tracked, so they must stay byte-identical to
  // the template. tasks/, skills/, and schemas/ are gitignored in the workspace
  // (installed kit) — for those the template copy is the canonical one.
  for (const rel of ['.aioson/docs/squad/pilot-gate.md', '.aioson/agents/squad.md']) {
    const workspace = await fsp.readFile(path.join(ROOT, rel), 'utf8');
    const template = await fsp.readFile(path.join(ROOT, 'template', rel), 'utf8');
    assert.equal(workspace, template, `template parity broken for ${rel}`);
  }

  const gate = await fsp.readFile(path.join(ROOT, 'template', '.aioson', 'docs', 'squad', 'pilot-gate.md'), 'utf8');
  assert.match(gate, /Approval by artifact, not by prose/);
  assert.match(gate, /## Domain distillation/);

  const task = await fsp.readFile(path.join(ROOT, 'template', '.aioson', 'tasks', 'squad-pilot.md'), 'utf8');
  assert.match(task, /squad:pilot-approve/);
  assert.match(task, /never approve/i);

  for (const domain of ['cinematic-web', 'crm-operational']) {
    const seed = await fsp.readFile(path.join(ROOT, 'template', '.aioson', 'skills', 'squad', 'domains', `${domain}.md`), 'utf8');
    assert.match(seed, /## Pilot flagship/, `${domain} seed must define its pilot flagship`);
  }

  const schema = JSON.parse(await fsp.readFile(path.join(ROOT, 'template', '.aioson', 'schemas', 'squad-manifest.schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.pilot.properties.status.enum, PILOT_STATUSES);
});
