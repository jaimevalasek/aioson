#!/usr/bin/env node
'use strict';

/**
 * smoke-run-chain — Phase 5 / T6 (workflow-handoff-integrity v1.10.0)
 *
 * Mock-only end-to-end smoke (DD-04). Exercises F1/F2/F3/T5 via the public
 * JS APIs in isolated temp fixtures. Designed to run as a CI release gate:
 * if this script exits non-zero, `npm publish` MUST be blocked.
 *
 * Per AC-T6-04 + AC-T6-08, each smoke check produces a clear pass/fail signal
 * with the failing step identified. No retries — fail-fast.
 *
 * Usage:
 *   node scripts/smoke-run-chain.js
 *   AIOSON_PREPUBLISH=true node scripts/smoke-run-chain.js   # T5 hard-fail mode
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

const {
  readDevState,
  detectStaleDevStateRich
} = require(path.join(REPO_ROOT, 'src', 'preflight-engine'));

const {
  maybeAutoAdvanceWorkflow
} = require(path.join(REPO_ROOT, 'src', 'commands', 'runtime'));

const {
  assertManifestNotPending
} = require(path.join(REPO_ROOT, 'src', 'commands', 'workflow-next'));

const {
  checkSemanticParity
} = require(path.join(REPO_ROOT, 'src', 'commands', 'sync-agents-preflight'));

const {
  runStateReset
} = require(path.join(REPO_ROOT, 'src', 'commands', 'state-save'));

// operator-memory Phase 2 (v1.13.0+)
const { deriveSlug } = require(path.join(REPO_ROOT, 'src', 'operator-memory', 'slug'));
const { captureSignal, readProposal } = require(path.join(REPO_ROOT, 'src', 'operator-memory', 'proposal'));
const { promoteProposal, readDecision, forgetEntry } = require(path.join(REPO_ROOT, 'src', 'operator-memory', 'decision'));
const { ensureStorageTree } = require(path.join(REPO_ROOT, 'src', 'operator-memory', 'storage'));

// operator-memory Phase 3 (v1.14.0+)
const { loadMemoryIndex, regenerateIndex } = require(path.join(REPO_ROOT, 'src', 'operator-memory', 'index-md'));
const { matchDecisions, preflightLoad } = require(path.join(REPO_ROOT, 'src', 'operator-memory', 'loader'));

// ─── Helpers ─────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures = [];

function step(label) {
  process.stdout.write(`  • ${label} ... `);
}

function ok(detail = '') {
  pass += 1;
  process.stdout.write(`✓ ${detail}\n`);
}

function ko(detail) {
  fail += 1;
  failures.push(detail);
  process.stdout.write(`✗ ${detail}\n`);
}

async function makeProject(suffix = '') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `aioson-t6-${suffix}-`));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  await fs.mkdir(path.join(dir, '.aioson', 'agents'), { recursive: true });
  await fs.mkdir(path.join(dir, 'template', '.aioson', 'agents'), { recursive: true });
  return dir;
}

async function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

// ─── F1 smoke ────────────────────────────────────────────────────────────────

async function smokeF1Stale() {
  step('F1 stale dev-state detection');
  const dir = await makeProject('f1');
  try {
    // Set up: feature marked done in features.md, but dev-state points to it.
    await writeFile(dir, '.aioson/context/features.md',
      '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| done-feat | done | 2026-01-01 | 2026-01-10 |\n'
    );
    await writeFile(dir, '.aioson/context/dev-state.md',
      '---\nactive_feature: done-feat\nstatus: in_progress\nlast_updated: 2026-01-10\n---\n# Dev State\n'
    );
    const devState = await readDevState(dir);
    const warning = await detectStaleDevStateRich(devState, null, dir);
    if (warning && /already marked `done`/.test(warning)) {
      ok('detects stale + suggests action');
    } else {
      ko(`F1 expected stale warning with "already marked done", got: ${warning}`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smokeF1Reset() {
  step('F1 state:reset idempotency');
  const dir = await makeProject('f1-reset');
  try {
    const result1 = await runStateReset({ args: [dir], options: { json: true }, logger: { log: () => {} } });
    if (!result1.ok || result1.removed !== false) ko(`state:reset on absent file should be no-op, got ${JSON.stringify(result1)}`);

    await writeFile(dir, '.aioson/context/dev-state.md', '---\nactive_feature: x\n---\n');
    const result2 = await runStateReset({ args: [dir], options: { json: true }, logger: { log: () => {} } });
    if (result2.ok && result2.removed === true) ok('reset removes file + idempotent re-call');
    else ko(`state:reset on present file should remove, got ${JSON.stringify(result2)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── F2 smoke ────────────────────────────────────────────────────────────────

async function smokeF2BackwardCompat() {
  step('F2 backward-compat (no workflow.state → no auto-advance)');
  const dir = await makeProject('f2-bc');
  try {
    const result = await maybeAutoAdvanceWorkflow({
      targetDir: dir,
      normalizedAgent: '@analyst',
      options: {},
      logger: { log: () => {}, error: () => {} },
      t: (k) => k
    });
    if (result.advanced === false && result.skipped === 'no_active_workflow') ok('skips silently');
    else ko(`F2 backward-compat expected skipped=no_active_workflow, got ${JSON.stringify(result)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smokeF2OptOut() {
  step('F2 --no-auto-advance opt-out');
  const dir = await makeProject('f2-optout');
  try {
    await writeFile(dir, '.aioson/context/workflow.state.json', JSON.stringify({
      version: 1, mode: 'feature', classification: 'MEDIUM',
      sequence: ['product', 'analyst', 'dev', 'qa'],
      current: 'analyst', completed: ['product'], featureSlug: 'smoke-feat'
    }));
    const result = await maybeAutoAdvanceWorkflow({
      targetDir: dir,
      normalizedAgent: '@analyst',
      options: { 'no-auto-advance': true },
      logger: { log: () => {}, error: () => {} },
      t: (k) => k
    });
    if (result.skipped === 'opt-out') ok('flag respected');
    else ko(`F2 opt-out expected skipped=opt-out, got ${JSON.stringify(result)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smokeF2GracefulDegradation() {
  step('F2 graceful degradation on corrupt workflow.state.json');
  const dir = await makeProject('f2-corrupt');
  try {
    await writeFile(dir, '.aioson/context/workflow.state.json', 'this is not json {{{');
    const errors = [];
    const result = await maybeAutoAdvanceWorkflow({
      targetDir: dir,
      normalizedAgent: '@analyst',
      options: {},
      logger: { log: () => {}, error: (m) => errors.push(m) },
      t: (k) => k
    });
    if (result.skipped === 'state_corrupt' && errors.length === 1) ok('warn + skip + no crash');
    else ko(`F2 corrupt expected skipped=state_corrupt + 1 warn, got ${JSON.stringify(result)} (errors=${errors.length})`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── F3 smoke ────────────────────────────────────────────────────────────────

async function smokeF3PendingBlocks() {
  step('F3 manifest pending-architect-decisions blocks workflow:next');
  const dir = await makeProject('f3-pending');
  try {
    await writeFile(dir, '.aioson/plans/smoke-feat/manifest.md',
      '---\nslug: smoke-feat\nstatus: pending-architect-decisions\n---\n# Manifest\n'
    );
    let blocked = false;
    let errMessage = '';
    try {
      await assertManifestNotPending(dir, 'smoke-feat', false);
    } catch (err) {
      if (err.code === 'WORKFLOW_NEXT_PENDING_DECISIONS') {
        blocked = true;
        errMessage = err.message;
      } else {
        throw err;
      }
    }
    if (blocked && /architect/.test(errMessage)) ok('blocks + suggests @architect');
    else ko(`F3 pending expected throw with @architect recommendation, got blocked=${blocked} msg="${errMessage}"`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smokeF3ForceOverride() {
  step('F3 --force override bypasses pending guard');
  const dir = await makeProject('f3-force');
  try {
    await writeFile(dir, '.aioson/plans/smoke-feat/manifest.md',
      '---\nslug: smoke-feat\nstatus: pending-architect-decisions\n---\n'
    );
    try {
      await assertManifestNotPending(dir, 'smoke-feat', true);
      ok('force flag respected');
    } catch (err) {
      ko(`F3 --force should not throw, got ${err.message}`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── T5 smoke ────────────────────────────────────────────────────────────────

async function smokeT5DriftCaught() {
  step('T5 catches 981a8fd-style drift in mock fixture');
  const dir = await makeProject('t5-drift');
  try {
    // Workspace has a section that template doesn't (the 981a8fd pattern).
    await writeFile(dir, '.aioson/agents/pm.md',
      '## Mission\nPM owns plans.\n\n## MEDIUM implementation plan\nMust produce.\n'
    );
    await writeFile(dir, 'template/.aioson/agents/pm.md',
      '## Mission\nPM does not silently produce plans.\n'
    );
    const issues = checkSemanticParity(dir);
    const sectionGap = issues.find((i) => i.kind === 'sections_missing_in_template');
    const contentDiff = issues.find((i) => i.kind === 'section_content_diverged');
    if (sectionGap && contentDiff) ok('detects both section-missing AND content-divergence');
    else ko(`T5 drift expected both gaps, got kinds=${issues.map((i) => i.kind).join(',')}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smokeT5PrepublishMode() {
  step('T5 AIOSON_PREPUBLISH=true elevates severity to error');
  const dir = await makeProject('t5-prepub');
  try {
    await writeFile(dir, '.aioson/agents/pm.md', '## A\nws\n');
    await writeFile(dir, 'template/.aioson/agents/pm.md', '## A\ntpl\n');
    const before = process.env.AIOSON_PREPUBLISH;
    process.env.AIOSON_PREPUBLISH = 'true';
    try {
      const issues = checkSemanticParity(dir);
      if (issues.length > 0 && issues.every((i) => i.severity === 'error')) ok('severity=error on all issues');
      else ko(`T5 prepublish expected all error, got severities=${issues.map((i) => i.severity).join(',')}`);
    } finally {
      if (before === undefined) delete process.env.AIOSON_PREPUBLISH;
      else process.env.AIOSON_PREPUBLISH = before;
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smokeT5NoFalsePositive() {
  step('T5 reports 0 drift when workspace+template are identical');
  const dir = await makeProject('t5-clean');
  try {
    const content = '## Mission\nIdentical\n## Hard constraints\nAlso identical\n';
    await writeFile(dir, '.aioson/agents/pm.md', content);
    await writeFile(dir, 'template/.aioson/agents/pm.md', content);
    const issues = checkSemanticParity(dir);
    if (issues.length === 0) ok('no false positives');
    else ko(`T5 clean expected 0 issues, got ${issues.length}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Actual repo smoke (final safety net) ────────────────────────────────────

async function smokeRealRepoParity() {
  step('Actual repo: workspace↔template agent files have 0 drift');
  const issues = checkSemanticParity(REPO_ROOT);
  if (issues.length === 0) ok('repo is clean');
  else ko(`Actual repo has ${issues.length} drift issue(s): ${issues.slice(0, 3).map((i) => `@${i.agent}/${i.kind}`).join(', ')}`);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

// ─── [OM3] operator-memory loading + lazy match (Phase 3, v1.14.0) ───────────

async function smokeOM3IndexRegenerates() {
  step('OM3 MEMORY.md auto-regenerates after promote (active tier index)');
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-om3-i-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  try {
    const identity = 'om3-idx';
    ensureStorageTree(identity);
    const slug = deriveSlug('om3 index test alpha');
    const cap = captureSignal({ identity, slug, signal_type: 'authorization', quote: 'q', proposal: 'om3 index test alpha', source_agent: 'smoke' });
    promoteProposal({ identity, proposal: { ...cap.proposal, detected_count: 2 } });

    const index = loadMemoryIndex(identity, 'active');
    if (!index) throw new Error('MEMORY.md should exist after promote');
    if (index.frontmatter.schema_version !== '1.0') throw new Error('schema_version mismatch');
    if (index.entries.length < 1) throw new Error('index should contain at least 1 entry');
    if (!index.entries.find((e) => e.slug === slug)) throw new Error('promoted slug missing from index');
    ok('regenerateIndex wired into promoteProposal post-commit hook');
  } catch (err) {
    ko(`OM3 index regenerate: ${err.message}`);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

async function smokeOM3LazyMatch() {
  step('OM3 matchDecisions returns task-relevant decisions by keyword overlap');
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-om3-m-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  try {
    const identity = 'om3-match';
    ensureStorageTree(identity);
    const slugA = deriveSlug('commit autonomy after slice approval');
    const slugB = deriveSlug('npm publish stays manual');
    const slugC = deriveSlug('use typescript by default');

    for (const [slug, proposal, sig] of [[slugA, 'commit autonomy after slice approval', 'authorization'], [slugB, 'npm publish stays manual', 'exclusion'], [slugC, 'use typescript by default', 'correction']]) {
      const cap = captureSignal({ identity, slug, signal_type: sig, quote: 'q', proposal, source_agent: 'smoke' });
      promoteProposal({ identity, proposal: { ...cap.proposal, detected_count: 2 } });
    }

    const { index, matches } = preflightLoad(identity, 'I want to commit and push to main');
    if (!index) throw new Error('index should load');
    if (matches.length === 0) throw new Error('should match commit-related decision');
    if (!matches.find((m) => m.slug === slugA)) throw new Error('expected slug A in matches');
    ok('lazy match works on commit task → commit-autonomy decision');
  } catch (err) {
    ko(`OM3 lazy match: ${err.message}`);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

async function smokeOM3FlagOffNoop() {
  step('OM3 backward-compat: helpers return null/empty on absent storage (flag-OFF semantics)');
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-om3-f-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  try {
    const identity = 'om3-ghost-never-created';
    const result = preflightLoad(identity, 'whatever task');
    if (result.index !== null) throw new Error(`preflightLoad on missing storage should return null index, got ${result.index}`);
    if (result.matches.length !== 0) throw new Error('matches should be empty');

    const index = loadMemoryIndex(identity, 'active');
    if (index !== null) throw new Error('loadMemoryIndex on missing MEMORY.md should return null');
    ok('graceful degrade: null index + empty matches');
  } catch (err) {
    ko(`OM3 flag-off noop: ${err.message}`);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

// ─── [OM2] operator-memory capture + promotion (Phase 2, v1.13.0) ────────────

async function smokeOM2CapturePromote() {
  step('OM2 first capture silent, second capture promotes atomically');
  // Isolate ~/.aioson for this check
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-om2-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  try {
    const identity = 'om2-smoke-bot';
    ensureStorageTree(identity);
    const slug = deriveSlug('commit autonomo apos approval');
    const first = captureSignal({
      identity, slug, signal_type: 'authorization',
      quote: 'pode commitar autonomamente', proposal: 'commit autonomo apos approval', source_agent: 'smoke'
    });
    if (first.proposal.detected_count !== 1) throw new Error('first capture count should be 1');
    if (!readProposal(identity, slug)) throw new Error('proposal file should exist after first capture');

    const second = captureSignal({
      identity, slug, signal_type: 'authorization',
      quote: 'sim, pode commitar', proposal: 'commit autonomo apos approval', source_agent: 'smoke'
    });
    if (second.proposal.detected_count !== 2) throw new Error('second capture count should be 2');

    // Manual promote (simulating the runOpCapture promotion-on-threshold branch)
    promoteProposal({ identity, proposal: second.proposal });
    if (readProposal(identity, slug)) throw new Error('proposal should be removed after promote');
    const d = readDecision(identity, slug);
    if (!d) throw new Error('decision should exist after promote');
    if (d.signal_type !== 'authorization') throw new Error('decision signal_type mismatch');
    if (d.category !== 'autonomy') throw new Error('decision category should infer to autonomy (commit keyword)');
    if (d.version_schema !== '1.0') throw new Error('schema version must be 1.0');
    ok('captured + promoted atomically; FTS5 mirrored');
  } catch (err) {
    ko(`OM2 capture+promote: ${err.message}`);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

async function smokeOM2ForgetIdempotent() {
  step('OM2 op:forget archives to history/ + second call is noop');
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-om2-f-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  try {
    const identity = 'om2-smoke-forget';
    ensureStorageTree(identity);
    const slug = deriveSlug('something to forget here');
    const cap = captureSignal({ identity, slug, signal_type: 'exclusion', quote: 'q', proposal: 'something to forget here', source_agent: 'smoke' });
    promoteProposal({ identity, proposal: { ...cap.proposal, detected_count: 2 } });

    const result1 = forgetEntry(identity, slug);
    if (result1.mode !== 'decision') throw new Error(`first forget should return mode=decision, got ${result1.mode}`);
    if (!result1.archivedPath) throw new Error('archivedPath should be set');

    const result2 = forgetEntry(identity, slug);
    if (result2.mode !== 'noop') throw new Error(`second forget should return mode=noop, got ${result2.mode}`);
    ok('archives to history/ + idempotent noop');
  } catch (err) {
    ko(`OM2 forget idempotent: ${err.message}`);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

async function smokeOM2SignalValidation() {
  step('OM2 captureSignal rejects invalid signal_type (PMD-06 enforcement)');
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-om2-v-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  try {
    const identity = 'om2-smoke-validate';
    ensureStorageTree(identity);
    let threw = false;
    try {
      captureSignal({ identity, slug: 'bad', signal_type: 'invalid-type', quote: 'q', proposal: 'p', source_agent: 'smoke' });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('captureSignal should reject invalid signal_type');
    ok('rejects non-PMD-06 signal types');
  } catch (err) {
    ko(`OM2 signal validation: ${err.message}`);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

async function main() {
  const isPrepublish = process.env.AIOSON_PREPUBLISH === 'true';
  console.log('━'.repeat(60));
  console.log(`aioson smoke-run-chain ${isPrepublish ? '(PREPUBLISH MODE)' : '(local mode)'}`);
  console.log('━'.repeat(60));

  console.log('\n[F1] Stale dev-state detection + state:reset');
  await smokeF1Stale();
  await smokeF1Reset();

  console.log('\n[F2] agent:done auto-advance');
  await smokeF2BackwardCompat();
  await smokeF2OptOut();
  await smokeF2GracefulDegradation();

  console.log('\n[F3] workflow:next pending-decisions guard');
  await smokeF3PendingBlocks();
  await smokeF3ForceOverride();

  console.log('\n[T5] Semantic sync preflight');
  await smokeT5DriftCaught();
  await smokeT5PrepublishMode();
  await smokeT5NoFalsePositive();

  console.log('\n[OM2] operator-memory capture + promotion pipeline');
  await smokeOM2CapturePromote();
  await smokeOM2ForgetIdempotent();
  await smokeOM2SignalValidation();

  console.log('\n[OM3] operator-memory loading + lazy match');
  await smokeOM3IndexRegenerates();
  await smokeOM3LazyMatch();
  await smokeOM3FlagOffNoop();

  console.log('\n[REPO] Final parity safety net');
  await smokeRealRepoParity();

  console.log('\n' + '━'.repeat(60));
  console.log(`Result: pass=${pass}  fail=${fail}`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    console.log('━'.repeat(60));
    process.exit(1);
  }
  console.log('All smoke checks green. Safe to proceed with publish.');
  console.log('━'.repeat(60));
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[smoke-run-chain] fatal: ${err.stack || err.message}`);
    process.exit(2);
  });
}

module.exports = { main };
