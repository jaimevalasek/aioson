'use strict';

// Two registries, one lie: `feature:current` answered the feature the pulse
// named while the workflow stayed bound to the previous one, and a whole
// feature ran outside the kernel — `workflow:next --complete=dev` without
// `--expect-feature` answered "@dev is already completed" for the wrong
// feature. The binding now follows the registry, the previous feature's
// progress is archived and restored instead of erased, the mismatch names
// the registry, and the QA→Dev cycle budget is read per feature.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  loadOrCreateState,
  detectWorkflowMode,
  assertExpectedFeature,
  describeBinding,
  featureStateArchivePath,
  runWorkflowNext,
  STATE_RELATIVE_PATH,
  EVENTS_RELATIVE_PATH
} = require('../src/commands/workflow-next');
const { runWorkflowStatus } = require('../src/commands/workflow-status');
const { runReviewCycle } = require('../src/commands/review-cycle');
const { resolveActiveFeature } = require('../src/commands/feature-current');
const { createTranslator } = require('../src/i18n');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const OLD = 'play-refoundation';
const NEW = 'deploy-channel';
const { t: translate } = createTranslator('en');

async function project(t, { pulse = NEW, handoff = null } = {}) {
  // Nested in its own temp base: a slug that climbs out of the project lands
  // inside the base (and is caught there), never in the shared temp dir.
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-binding-'));
  t.after(() => fs.rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const dir = path.join(base, 'project');
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nproject_name: "binding"\nproject_type: "web_app"\nclassification: "MEDIUM"\ninteraction_language: "en"\n---\n# Project Context\n', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'features.md'), [
    '# Features', '',
    '| slug | status | started | completed |', '|---|---|---|---|',
    '| archived-one | paused | 2026-05-21 | — |',
    `| ${OLD} | in_progress | 2026-09-01 | — |`,
    `| ${NEW} | in_progress | 2026-09-02 | — |`, ''
  ].join('\n'), 'utf8');
  await setPulse(dir, pulse);
  if (handoff) await fs.writeFile(path.join(dir, '.aioson', 'context', 'last-handoff.json'), JSON.stringify({ feature_slug: handoff, workflow_mode: 'feature' }), 'utf8');
  return dir;
}

async function setPulse(dir, slug) {
  const file = path.join(dir, '.aioson', 'context', 'project-pulse.md');
  if (slug === null) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.writeFile(file, `---\nactive_feature: ${slug}\nupdated_at: 2026-09-03\n---\n# Project Pulse\n`, 'utf8');
}

const PROGRESS = {
  version: 1,
  mode: 'feature',
  classification: 'MEDIUM',
  sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
  current: 'qa',
  next: 'qa',
  completed: ['product', 'sheldon', 'dev'],
  skipped: ['planner'],
  featureSlug: OLD,
  detour: null,
  updatedAt: '2026-09-02T02:07:41.416Z'
};

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

test('the workflow binds to the feature the registry names: the pulse wins over the last handoff and the last feature in progress; without a pulse the old fallbacks hold; a pulse naming a paused feature is ignored', async (t) => {
  const dir = await project(t, { pulse: NEW, handoff: OLD });
  let mode = await detectWorkflowMode(dir);
  assert.equal(mode.featureSlug, NEW);
  assert.equal(mode.binding_source, 'pulse');
  assert.equal((await resolveActiveFeature(dir)).slug, NEW, 'the same feature feature:current answers');

  await setPulse(dir, null);
  mode = await detectWorkflowMode(dir);
  assert.equal(mode.featureSlug, OLD, 'the last handoff still wins when the pulse names nothing');
  assert.equal(mode.binding_source, 'last-handoff');

  await fs.rm(path.join(dir, '.aioson', 'context', 'last-handoff.json'));
  mode = await detectWorkflowMode(dir);
  assert.equal(mode.featureSlug, NEW, 'then the last feature in progress');
  assert.equal(mode.binding_source, 'features.md');

  await setPulse(dir, 'archived-one');
  mode = await detectWorkflowMode(dir);
  assert.equal(mode.featureSlug, NEW, 'a pulse naming a paused feature does not bind the workflow to it');
  assert.equal(mode.registry, 'archived-one');
  assert.equal(mode.binding_source, 'features.md');
});

test('when the registry moves, the binding moves with it: the previous feature\'s progress is archived (never erased), the new feature starts from its own artifacts, a binding_moved event is appended — and the progress comes back when the registry returns', async (t) => {
  const dir = await project(t, { pulse: OLD, handoff: OLD });
  const stateFile = path.join(dir, STATE_RELATIVE_PATH);
  await fs.writeFile(stateFile, `${JSON.stringify(PROGRESS, null, 2)}\n`, 'utf8');
  // What the engine makes of this progress when nothing moves — the same
  // reconciliation (a current Sheldon review, inferred artifacts) every
  // persisted state gets; a restore must land exactly here.
  const reference = await loadOrCreateState(dir, { persist: false });
  assert.equal(reference.state.featureSlug, OLD);
  assert.equal(reference.binding.moved, null);
  await setPulse(dir, NEW);

  // Preview (workflow:status): the move is computed, nothing is written.
  const preview = await loadOrCreateState(dir, { persist: false });
  assert.equal(preview.state.featureSlug, NEW);
  assert.deepEqual(preview.binding.moved, { from: OLD, to: NEW, mode: 'feature', archived: `.aioson/context/features/${OLD}/workflow.state.json`, persisted: false });
  assert.equal((await readJson(stateFile)).featureSlug, OLD, 'a preview leaves the state file alone');
  assert.equal(await fs.access(featureStateArchivePath(dir, OLD)).then(() => true).catch(() => false), false);
  assert.match(describeBinding(preview.binding)[0], /workflow binding moved: play-refoundation → deploy-channel \(feature registry: project-pulse\.md active_feature\); previous progress would be archived at/);

  // The real move.
  const moved = await loadOrCreateState(dir, { persist: true });
  assert.equal(moved.state.featureSlug, NEW);
  assert.deepEqual(moved.state.completed, [], 'the new feature is not "already completed" — it starts from its own artifacts');
  assert.equal(moved.binding.moved.persisted, true);
  const archived = await readJson(featureStateArchivePath(dir, OLD));
  assert.deepEqual(archived.completed, ['product', 'sheldon', 'dev']);
  assert.equal(archived.current, 'qa');
  assert.ok(archived.archived_at);
  assert.equal((await readJson(stateFile)).featureSlug, NEW);
  const events = (await fs.readFile(path.join(dir, EVENTS_RELATIVE_PATH), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const event = events.find((e) => e.event === 'binding_moved');
  assert.equal(event.from, OLD);
  assert.equal(event.to, NEW);
  assert.equal(event.source, 'pulse');
  assert.match(event.archived, /features\/play-refoundation\/workflow\.state\.json$/);

  // A second load stands still: nothing moves, nothing is archived twice.
  const still = await loadOrCreateState(dir, { persist: true });
  assert.equal(still.binding.moved, null);
  assert.equal(still.binding.restored, null);

  // The registry returns to the previous feature: its progress is restored and the archive consumed.
  await setPulse(dir, OLD);
  const back = await loadOrCreateState(dir, { persist: true });
  assert.equal(back.state.featureSlug, OLD);
  assert.deepEqual(back.state.completed, reference.state.completed, 'restored = as if it had never left (the archive is raw; the engine reconciles it like any persisted state)');
  assert.equal(back.state.next, reference.state.next);
  assert.deepEqual(back.binding.restored, { feature: OLD, from: `.aioson/context/features/${OLD}/workflow.state.json` });
  assert.equal(back.binding.moved.archived, null, 'the new feature had no progress: nothing to archive');
  assert.equal(await fs.access(featureStateArchivePath(dir, OLD)).then(() => true).catch(() => false), false, 'the archive is consumed on restore');
  assert.deepEqual((await readJson(stateFile)).completed, reference.state.completed);
  assert.match(describeBinding(back.binding)[1], /workflow progress restored for play-refoundation from/);
});

test('--expect-feature keeps guarding explicit continuation, and the mismatch names the registry and the command that moves it', async (t) => {
  const dir = await project(t, { pulse: NEW, handoff: OLD });
  const loaded = await loadOrCreateState(dir, { persist: false });
  assert.doesNotThrow(() => assertExpectedFeature(loaded.state, { 'expect-feature': NEW }, loaded.binding));
  assert.throws(() => assertExpectedFeature(loaded.state, { 'expect-feature': OLD }, loaded.binding), (error) => {
    assert.equal(error.code, 'WORKFLOW_FEATURE_MISMATCH');
    assert.match(error.message, /Expected feature: play-refoundation/);
    assert.match(error.message, /Active workflow: deploy-channel/);
    assert.match(error.message, /Feature registry: deploy-channel \(project-pulse\.md active_feature\)/);
    assert.match(error.message, /aioson pulse:update \. --feature=<slug>/);
    assert.match(error.message, /archived under \.aioson\/context\/features\/<slug>\/workflow\.state\.json and restored on return/);
    return true;
  });
});

test('workflow:status answers for the feature the registry names and says what moved; --json carries the binding', async (t) => {
  const dir = await project(t, { pulse: NEW, handoff: OLD });
  await fs.writeFile(path.join(dir, STATE_RELATIVE_PATH), `${JSON.stringify(PROGRESS, null, 2)}\n`, 'utf8');
  const lines = [];
  const logger = { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)), warn: () => {} };
  const result = await runWorkflowStatus({ args: [dir], options: {}, logger });
  assert.equal(result.featureSlug, NEW);
  assert.equal(result.binding.source, 'pulse');
  assert.equal(result.binding.moved.from, OLD);
  assert.ok(lines.some((line) => /Binding: project-pulse\.md active_feature/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /workflow binding moved: play-refoundation → deploy-channel/.test(line)), lines.join('\n'));
  assert.equal((await readJson(path.join(dir, STATE_RELATIVE_PATH))).featureSlug, OLD, 'status stays read-only');
});

test('review-cycle:status answers for the feature asked: a cycle file left by another feature is a stale_feature, and the budget is whole', async (t) => {
  const dir = await project(t, { pulse: NEW });
  await fs.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'runtime', 'qa-dev-cycle.json'), JSON.stringify({ slug: OLD, source: 'qa', target: 'dev', cycle: 3, max_cycles: 3, status: 'limit_reached' }), 'utf8');
  const logger = { log() {}, error() {} };
  const foreign = await runReviewCycle({ args: [dir], options: { sub: 'status', feature: NEW, json: true }, logger });
  assert.equal(foreign.ok, true);
  assert.equal(foreign.exists, false);
  assert.equal(foreign.state, null);
  assert.equal(foreign.stale_feature, OLD);
  assert.equal(foreign.remaining_cycles, foreign.max_cycles, 'the new feature starts with its full budget');
  assert.match(foreign.note, /belongs to play-refoundation/);
  const own = await runReviewCycle({ args: [dir], options: { sub: 'status', feature: OLD, json: true }, logger });
  assert.equal(own.exists, true);
  assert.equal(own.remaining_cycles, 0);
  assert.equal(own.stale_feature, undefined);
  const unscoped = await runReviewCycle({ args: [dir], options: { sub: 'status', json: true }, logger });
  assert.equal(unscoped.exists, true, 'without --feature the file is reported as it is');
});

const quiet = { log() {}, error() {}, warn() {} };
const exists = (file) => fs.access(file).then(() => true, () => false);

test('review-cycle reset/advance are feature-aware: another feature\'s PASS or FAIL never resets or overwrites a budget — it is parked and comes back', async (t) => {
  const dir = await project(t, { pulse: OLD });
  const cycle = (sub, feature) => runReviewCycle({ args: [dir], options: { sub, feature, plan: `.aioson/context/qa-report-${feature}.md`, json: true }, logger: quiet });
  const live = path.join(dir, '.aioson', 'runtime', 'qa-dev-cycle.json');
  const parkedOld = path.join(dir, '.aioson', 'runtime', 'review-cycles', OLD, 'qa-dev-cycle.json');

  assert.equal((await cycle('advance', OLD)).action, 'invoke_dev');
  assert.equal((await cycle('advance', OLD)).action, 'stop_cycle_limit', 'OLD exhausted its 1/1');

  // NEW's QA PASS resets NEW's cycle — it once deleted OLD's exhausted file.
  const reset = await cycle('reset', NEW);
  assert.equal(reset.removed, false);
  assert.equal(reset.stale_feature, OLD);
  assert.equal((await cycle('advance', OLD)).action, 'stop_cycle_limit');

  // NEW's QA FAIL takes the live file with its own budget; OLD's cycle is parked, not overwritten.
  const other = await cycle('advance', NEW);
  assert.equal(other.action, 'invoke_dev');
  assert.equal(other.cycle, 1);
  const parked = JSON.parse(await fs.readFile(parkedOld, 'utf8'));
  assert.equal(parked.slug, OLD);
  assert.equal(parked.status, 'limit_reached');
  const oldStatus = await cycle('status', OLD);
  assert.equal(oldStatus.exists, true);
  assert.equal(oldStatus.remaining_cycles, 0, 'OLD answers with its parked budget');

  // NEW passes (its reset leaves the parked budget alone); back on OLD the next FAIL stops at the limit.
  assert.equal((await cycle('reset', NEW)).removed, true);
  const back = await cycle('advance', OLD);
  assert.equal(back.action, 'stop_cycle_limit', 'OLD does not get a fresh cycle');
  assert.equal(JSON.parse(await fs.readFile(live, 'utf8')).slug, OLD);
  assert.equal(await exists(parkedOld), false, 'the parked cycle is live again');

  // Only an explicit reset of OLD frees its budget.
  assert.equal((await cycle('reset', OLD)).removed, true);
  assert.equal((await cycle('advance', OLD)).action, 'invoke_dev');

  // A foreign cycle whose slug cannot name a parking place is refused, never overwritten.
  await fs.writeFile(live, JSON.stringify({ slug: 'feat:x', source: 'qa', target: 'dev', cycle: 1, max_cycles: 1, status: 'limit_reached' }), 'utf8');
  const refused = await cycle('advance', NEW);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'foreign_cycle_unparkable');
  assert.equal(JSON.parse(await fs.readFile(live, 'utf8')).slug, 'feat:x');
});

function prdFor(slug) {
  return `---\nclassification: SMALL\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: pending\n---\n# ${slug}\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-${slug}-01 | User sees a saved result | User submits | required | Core promise |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-${slug}-01 | CAP-${slug}-01 | Saved result appears | integration test |\n`;
}

test('workflow:next keeps each feature\'s QA→Dev budget: after another feature\'s QA FAIL, the first feature\'s next FAIL still stops at [QA Cycle Limit Reached]', async (t) => {
  const dir = await project(t, { pulse: OLD });
  for (const slug of [OLD, NEW]) {
    await fs.writeFile(path.join(dir, '.aioson', 'context', `prd-${slug}.md`), prdFor(slug), 'utf8');
    await approveAndSealSheldonReview(dir, slug);
    await fs.writeFile(path.join(dir, '.aioson', 'context', `qa-report-${slug}.md`), '---\nverdict: FAIL\n---\n# QA Report\n\nBlocking defect.\n', 'utf8');
  }
  const atQa = (slug) => fs.writeFile(path.join(dir, STATE_RELATIVE_PATH), `${JSON.stringify({ ...PROGRESS, featureSlug: slug, current: 'qa', next: null, completed: ['product', 'sheldon', 'planner', 'dev'], skipped: [] }, null, 2)}\n`, 'utf8');
  const next = (options) => runWorkflowNext({ args: [dir], options: { tool: 'codex', ...options }, logger: quiet, t: translate });

  await atQa(OLD);
  assert.equal((await next({ complete: 'qa' })).reviewCycle.action, 'invoke_dev');
  await atQa(OLD);
  await assert.rejects(next({ complete: 'qa' }), /QA Cycle Limit Reached/);

  await setPulse(dir, NEW);
  await atQa(NEW);
  const other = await next({ complete: 'qa' });
  assert.equal(other.reviewCycle.action, 'invoke_dev');
  assert.equal(other.reviewCycle.cycle, 1, 'NEW has its own budget');

  await setPulse(dir, OLD);
  await atQa(OLD);
  await assert.rejects(next({ complete: 'qa' }), /QA Cycle Limit Reached/, 'OLD\'s exhausted budget survived NEW\'s FAIL');
});

test('the mismatch names where the binding really comes from: a fallback is never labeled the feature registry, and a pulse naming a feature not in_progress is said to be ignored', async (t) => {
  const dir = await project(t, { pulse: null });
  let loaded = await loadOrCreateState(dir, { persist: false });
  assert.equal(loaded.binding.source, 'features.md');
  assert.throws(() => assertExpectedFeature(loaded.state, { 'expect-feature': OLD }, loaded.binding), (error) => {
    assert.doesNotMatch(error.message, /Feature registry: deploy-channel \(features\.md\)/);
    assert.match(error.message, /Feature registry: none in effect — project-pulse\.md names no active_feature; the workflow is bound to deploy-channel by fallback \(the last in_progress row of features\.md\)/);
    assert.match(error.message, /aioson pulse:update \. --feature=<slug>` moves it \(the feature must be in_progress in features\.md\)/);
    return true;
  });

  await setPulse(dir, 'archived-one');
  loaded = await loadOrCreateState(dir, { persist: false });
  assert.throws(() => assertExpectedFeature(loaded.state, { 'expect-feature': 'archived-one' }, loaded.binding), (error) => {
    assert.doesNotMatch(error.message, /Feature registry: archived-one \(features\.md\)/);
    assert.match(error.message, /project-pulse\.md active_feature names archived-one, which is not in_progress in features\.md, so the binding ignores it/);
    return true;
  });
});

test('--expect-feature moving the binding leaves the loader\'s trace: a binding_moved event, past-tense lines, and the binding in the --json payload', async (t) => {
  const dir = await project(t, { pulse: NEW, handoff: OLD });
  await fs.writeFile(path.join(dir, STATE_RELATIVE_PATH), `${JSON.stringify(PROGRESS, null, 2)}\n`, 'utf8');
  const lines = [];
  const logger = { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)), warn: () => {} };

  const result = await runWorkflowNext({ args: [dir], options: { tool: 'codex', 'expect-feature': NEW }, logger, t: translate });

  assert.equal(result.featureSlug, NEW);
  assert.deepEqual((await readJson(featureStateArchivePath(dir, OLD))).completed, ['product', 'sheldon', 'dev']);
  const events = (await fs.readFile(path.join(dir, EVENTS_RELATIVE_PATH), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const event = events.find((entry) => entry.event === 'binding_moved');
  assert.ok(event, 'the move is in workflow.events.jsonl');
  assert.equal(event.from, OLD);
  assert.equal(event.to, NEW);
  assert.equal(event.archived, `.aioson/context/features/${OLD}/workflow.state.json`);
  assert.ok(lines.some((line) => /previous progress archived at \.aioson\/context\/features\/play-refoundation\/workflow\.state\.json/.test(line)), lines.join('\n'));
  assert.ok(!lines.some((line) => /would be archived/.test(line)), 'the archive was written: past tense');
  assert.equal(result.binding.moved.from, OLD);
  assert.equal(result.binding.moved.persisted, true);
});

test('an archive exists only for a slug that can name one: a climbing slug never writes outside the project — the archive is skipped with a warning', async (t) => {
  // workflow:status --repair with a live state whose slug climbs out of the project.
  const climbing = await project(t, { pulse: NEW });
  const escaped = path.join(path.dirname(climbing), 'escaped', 'workflow.state.json');
  await fs.writeFile(path.join(climbing, STATE_RELATIVE_PATH), `${JSON.stringify({ ...PROGRESS, featureSlug: '../../../../escaped' }, null, 2)}\n`, 'utf8');
  const lines = [];
  const status = await runWorkflowStatus({ args: [climbing], options: { repair: true }, logger: { log: (line) => lines.push(String(line)), error: () => {}, warn: () => {} } });
  assert.equal(await exists(escaped), false, 'nothing is written outside the project');
  assert.equal(status.featureSlug, NEW);
  assert.equal(status.binding.moved.archive_skipped, 'invalid_feature_slug');
  assert.equal(status.binding.moved.archived, null);
  assert.ok(lines.some((line) => /progress is NOT archived/.test(line)), lines.join('\n'));
  assert.equal((await readJson(path.join(climbing, STATE_RELATIVE_PATH))).featureSlug, NEW);

  // The rule underneath: the canonical feature slug, inside the features directory.
  const { resolveFeatureStateArchive } = require('../src/lib/workflow-binding');
  assert.equal(resolveFeatureStateArchive('/p', 'deploy-channel').ok, true);
  for (const bad of ['../../../../escaped', 'feat:x', 'Feature_X', '', '..']) {
    assert.equal(resolveFeatureStateArchive('/p', bad).ok, false, bad);
    assert.equal(featureStateArchivePath('/p', bad), null, bad);
  }
});

test('a slug no Windows directory can hold (feat:x) no longer kills every workflow:next on mkdir — the move completes and the archive is skipped with a warning', async (t) => {
  const colon = await project(t, { pulse: NEW });
  await fs.writeFile(path.join(colon, STATE_RELATIVE_PATH), `${JSON.stringify({ ...PROGRESS, featureSlug: 'feat:x' }, null, 2)}\n`, 'utf8');
  const result = await runWorkflowNext({ args: [colon], options: { tool: 'codex' }, logger: quiet, t: translate });
  assert.equal(await exists(path.join(colon, '.aioson', 'context', 'features', 'feat:x')), false);
  assert.equal(result.featureSlug, NEW, 'the move completes instead of dying on mkdir');
  assert.equal(result.binding.moved.archive_skipped, 'invalid_feature_slug');
  assert.match(describeBinding(result.binding)[1], /feat:x's progress is NOT archived/);
});
