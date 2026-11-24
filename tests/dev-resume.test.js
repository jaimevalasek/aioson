'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildDevResumeData,
  extractDevStateFields,
  extractCodeMapPaths,
  deriveNextStepFromPlan,
  readCorrectionsStatus,
  listOpenCorrections,
  listOpenDevThreads
} = require('../src/lib/dev-resume');
const { runDevResumeData } = require('../src/commands/dev-resume');

async function makeProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dev-resume-'));
  await fs.mkdir(path.join(tmp, '.aioson', 'context'), { recursive: true });
  return tmp;
}

async function writeFeaturesMd(tmp, rows) {
  const lines = ['# Features', '', '| slug | status | started | completed |', '|------|--------|---------|-----------|'];
  for (const r of rows) {
    lines.push(`| ${r.slug} | ${r.status} | ${r.started || '—'} | ${r.completed || '—'} |`);
  }
  await fs.writeFile(path.join(tmp, '.aioson', 'context', 'features.md'), lines.join('\n') + '\n', 'utf8');
}

async function writeLastHandoff(tmp, payload) {
  await fs.writeFile(
    path.join(tmp, '.aioson', 'context', 'last-handoff.json'),
    JSON.stringify(payload, null, 2),
    'utf8'
  );
}

describe('dev-resume — helpers', () => {
  it('extractDevStateFields parses active_phase and next_step from frontmatter', () => {
    const raw = '---\nactive_feature: demo\nactive_phase: 3\nnext_step: "Phase 3.2 implementation"\nstatus: in_progress\n---\nbody';
    const out = extractDevStateFields(raw);
    assert.equal(out.active_feature, 'demo');
    assert.equal(out.active_phase, '3');
    assert.equal(out.next_step, 'Phase 3.2 implementation');
  });

  it('extractDevStateFields returns nulls when no frontmatter', () => {
    const out = extractDevStateFields('# no frontmatter here');
    assert.equal(out.active_phase, null);
    assert.equal(out.next_step, null);
  });

  it('extractCodeMapPaths reads file paths from a dossier ## Code Map', () => {
    const dossier = `---
feature_slug: x
---
## Code Map

\`\`\`yaml
files:
- path: src/a.js
  role: command-entry
- path: src/b.js
  role: util
modules: []
patterns: []
\`\`\`

## Agent Trail
`;
    const paths = extractCodeMapPaths(dossier);
    assert.deepEqual(paths, ['src/a.js', 'src/b.js']);
  });

  it('extractCodeMapPaths returns [] when no Code Map section', () => {
    assert.deepEqual(extractCodeMapPaths('# no code map'), []);
    assert.deepEqual(extractCodeMapPaths(null), []);
  });

  it('extractCodeMapPaths deduplicates repeated paths', () => {
    const dossier = `## Code Map

\`\`\`yaml
files:
- path: src/a.js
  role: command-entry
- path: src/a.js
  role: cli
modules: []
patterns: []
\`\`\`
`;
    assert.deepEqual(extractCodeMapPaths(dossier), ['src/a.js']);
  });

  it('deriveNextStepFromPlan returns first unchecked checklist item', () => {
    const plan = `# Plan

## Phase 1
- [x] Task one
- [ ] Task two
- [ ] Task three`;
    assert.equal(deriveNextStepFromPlan(plan), 'Task two');
  });

  it('deriveNextStepFromPlan returns null when no unchecked items', () => {
    const plan = `# Plan
- [x] all done
- [x] really`;
    assert.equal(deriveNextStepFromPlan(plan), null);
  });

  it('readCorrectionsStatus strips inline comments from the status value', () => {
    const raw = '---\nphase: 2\ncreated: 2026-06-09\nstatus: open   # open | in_progress | resolved\n---\n# Plan';
    assert.equal(readCorrectionsStatus(raw), 'open');
  });

  it('readCorrectionsStatus treats missing frontmatter or status as open (fail-safe)', () => {
    assert.equal(readCorrectionsStatus('# Corrections without frontmatter'), 'open');
    assert.equal(readCorrectionsStatus('---\nphase: 1\n---\nbody'), 'open');
  });

  it('readCorrectionsStatus reads resolved status', () => {
    const raw = '---\nstatus: resolved\n---\nbody';
    assert.equal(readCorrectionsStatus(raw), 'resolved');
  });
});

describe('buildDevResumeData', () => {
  it('returns null when last-handoff.json is missing', async () => {
    const tmp = await makeProject();
    try {
      const result = await buildDevResumeData(tmp);
      assert.equal(result, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when last-handoff.json has no feature_slug', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { version: 1, feature_slug: null });
      const result = await buildDevResumeData(tmp);
      assert.equal(result, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when feature is not in features.md', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'unknown-feat' });
      await writeFeaturesMd(tmp, []);
      const result = await buildDevResumeData(tmp);
      assert.equal(result, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when feature is done (not in_progress)', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'closed-feat' });
      await writeFeaturesMd(tmp, [{ slug: 'closed-feat', status: 'done' }]);
      const result = await buildDevResumeData(tmp);
      assert.equal(result, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns full resume data when feature is in_progress with all artifacts', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, {
        feature_slug: 'feat-active',
        artifact_uris: [
          { path: '.aioson/context/prd-feat-active.md', kind: 'prd', agent: 'product', added_at: null }
        ]
      });
      await writeFeaturesMd(tmp, [{ slug: 'feat-active', status: 'in_progress' }]);
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'prd-feat-active.md'),
        '---\nclassification: MEDIUM\n---\n# PRD',
        'utf8'
      );
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_feature: feat-active\nactive_phase: 5\nnext_step: "Implement phase 5"\n---\nbody',
        'utf8'
      );
      const featDir = path.join(tmp, '.aioson', 'context', 'features', 'feat-active');
      await fs.mkdir(featDir, { recursive: true });
      await fs.writeFile(
        path.join(featDir, 'dossier.md'),
        `---
feature_slug: feat-active
classification: MEDIUM
---
## Code Map

\`\`\`yaml
files:
- path: src/foo.js
  role: command-entry
- path: src/bar.js
  role: util
modules: []
patterns: []
\`\`\`

## Agent Trail
`,
        'utf8'
      );

      const result = await buildDevResumeData(tmp);
      assert.equal(result.feature_slug, 'feat-active');
      assert.equal(result.classification, 'MEDIUM');
      assert.equal(result.current_phase, '5');
      assert.equal(result.next_step, 'Implement phase 5');
      assert.deepEqual(result.code_map_paths, ['src/foo.js', 'src/bar.js']);
      assert.equal(result.artifacts_consumed.length, 1);
      assert.equal(result.artifacts_consumed[0].path, '.aioson/context/prd-feat-active.md');
      assert.equal(result.sheldon_plan, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('points to sheldon_plan when manifest exists', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-planned' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-planned', status: 'in_progress' }]);
      const planDir = path.join(tmp, '.aioson', 'plans', 'feat-planned');
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(path.join(planDir, 'manifest.md'), '# manifest\n- [ ] step one', 'utf8');

      const result = await buildDevResumeData(tmp);
      assert.equal(result.sheldon_plan, '.aioson/plans/feat-planned/manifest.md');
      assert.equal(result.next_step, 'step one');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('ignores dev-state phase and next_step when dev-state belongs to another feature', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'bridge-apps-integration-builder' });
      await writeFeaturesMd(tmp, [{ slug: 'bridge-apps-integration-builder', status: 'in_progress' }]);
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_feature: maintenance-harness-picker\nactive_phase: 7\nnext_step: "Old stale step"\nstatus: in_progress\n---\nbody',
        'utf8'
      );
      const planDir = path.join(tmp, '.aioson', 'plans', 'bridge-apps-integration-builder');
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(path.join(planDir, 'manifest.md'), '# manifest\n- [ ] Current bridge step', 'utf8');

      const result = await buildDevResumeData(tmp);

      assert.equal(result.feature_slug, 'bridge-apps-integration-builder');
      assert.equal(result.current_phase, 'unknown');
      assert.equal(result.next_step, 'Current bridge step');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('ignores dev-state phase and next_step when active_feature is missing', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-active' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-active', status: 'in_progress' }]);
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_phase: 5\nnext_step: "Ambiguous old step"\nstatus: in_progress\n---\nbody',
        'utf8'
      );
      const planDir = path.join(tmp, '.aioson', 'plans', 'feat-active');
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(path.join(planDir, 'manifest.md'), '# manifest\n- [ ] Plan-derived step', 'utf8');

      const result = await buildDevResumeData(tmp);

      assert.equal(result.current_phase, 'unknown');
      assert.equal(result.next_step, 'Plan-derived step');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('includes decision_rationale from last-handoff.json when present', async () => {
    const tmp = await makeProject();
    try {
      const rationale = [
        { agent: 'product', decision: 'extend existing module', alternatives_considered: null, rationale: 'reuses infra', confidence: 'confirmed' },
        { agent: 'architect', decision: 'SQLite over Postgres', alternatives_considered: null, rationale: 'no new deps', confidence: 'confirmed' }
      ];
      await writeLastHandoff(tmp, { feature_slug: 'feat-rationale', decision_rationale: rationale });
      await writeFeaturesMd(tmp, [{ slug: 'feat-rationale', status: 'in_progress' }]);

      const result = await buildDevResumeData(tmp);
      assert.ok(Array.isArray(result.decision_rationale), 'decision_rationale must be present');
      assert.equal(result.decision_rationale.length, 2);
      assert.equal(result.decision_rationale[0].agent, 'product');
      assert.equal(result.decision_rationale[1].decision, 'SQLite over Postgres');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('omits decision_rationale when empty or absent in handoff', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-no-rationale' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-no-rationale', status: 'in_progress' }]);

      const result = await buildDevResumeData(tmp);
      assert.equal(result.decision_rationale, undefined, 'key absent when no rationale');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('surfaces open corrections plans and overrides a stale next_step', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-corr' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-corr', status: 'in_progress' }]);
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_feature: feat-corr\nactive_phase: 2\nnext_step: "Handoff to @qa (Gate D)"\nstatus: implementation_done\n---\nbody',
        'utf8'
      );
      const planDir = path.join(tmp, '.aioson', 'plans', 'feat-corr');
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, 'corrections-2026-06-09.md'),
        '---\nphase: 2\ncreated: 2026-06-09\nstatus: open   # open | in_progress | resolved\n---\n# Corrections',
        'utf8'
      );

      const result = await buildDevResumeData(tmp);
      assert.deepEqual(result.open_corrections, ['.aioson/plans/feat-corr/corrections-2026-06-09.md']);
      assert.match(result.next_step, /Apply mandatory corrections from \.aioson\/plans\/feat-corr\/corrections-2026-06-09\.md/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('omits resolved corrections and keeps the dev-state next_step', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-resolved' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-resolved', status: 'in_progress' }]);
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_feature: feat-resolved\nactive_phase: 3\nnext_step: "Continue phase 3"\nstatus: in_progress\n---\nbody',
        'utf8'
      );
      const planDir = path.join(tmp, '.aioson', 'plans', 'feat-resolved');
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, 'corrections-2026-06-01.md'),
        '---\nstatus: resolved\n---\n# Corrections',
        'utf8'
      );

      const result = await buildDevResumeData(tmp);
      assert.equal(result.open_corrections, undefined);
      assert.equal(result.next_step, 'Continue phase 3');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('listOpenCorrections returns [] when the plans dir does not exist', async () => {
    const tmp = await makeProject();
    try {
      assert.deepEqual(await listOpenCorrections(tmp, 'no-such-feature'), []);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('handles feature in_progress without dossier or dev-state gracefully', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-bare' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-bare', status: 'in_progress' }]);

      const result = await buildDevResumeData(tmp);
      assert.equal(result.feature_slug, 'feat-bare');
      assert.equal(result.classification, null);
      assert.equal(result.current_phase, 'unknown');
      assert.deepEqual(result.code_map_paths, []);
      assert.deepEqual(result.artifacts_consumed, []);
      assert.equal(result.sheldon_plan, null);
      assert.equal(result.next_step, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('runDevResumeData CLI handler', () => {
  it('returns ok=true with data=null on cold start', async () => {
    const tmp = await makeProject();
    try {
      const r = await runDevResumeData({ args: [tmp], options: { json: true } });
      assert.equal(r.ok, true);
      assert.equal(r.data, null);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns ok=true with full data when feature active', async () => {
    const tmp = await makeProject();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'feat-x' });
      await writeFeaturesMd(tmp, [{ slug: 'feat-x', status: 'in_progress' }]);
      const r = await runDevResumeData({ args: [tmp], options: { json: true } });
      assert.equal(r.ok, true);
      assert.equal(r.data.feature_slug, 'feat-x');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

it('--capsule takes no value, so the path after it stays the project', () => {
  const { parseArgv } = require('../src/parser');
  const parsed = parseArgv(['node', 'aioson', 'dev:resume-data', '--capsule', '.', '--feature=orders', '--phase=1']);
  assert.equal(parsed.command, 'dev:resume-data');
  assert.equal(parsed.options.capsule, true);
  assert.deepEqual(parsed.args, ['.']);
});

// parallel-sessions (AC-parallel-sessions-25): with the @dev of one feature in
// one session and the @dev of another in a second one, each resume reads the
// state of its own feature — never the one that wrote or handed off last.
describe('dev-resume — one resume state per feature', () => {
  const { runStateSave } = require('../src/commands/state-save');
  const { runLiveStart } = require('../src/commands/live');
  const { bindSessionFeature } = require('../src/lib/session-feature');
  const { createTranslator } = require('../src/i18n');
  const silent = { log() {}, error() {} };
  const keyEnv = (key) => ({ AIOSON_LIVE_SESSION_KEY: key, AIOSON_LIVE_SESSION: key });

  async function makeTwoFeatureProject() {
    const tmp = await makeProject();
    await writeFeaturesMd(tmp, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'in_progress' }]);
    const write = (options) => runStateSave({ args: [tmp], options: { json: true, ...options }, logger: silent });
    await write({ feature: 'checkout', phase: '2', next: 'Checkout: payment webhook' });
    await write({ feature: 'billing', phase: '5', next: 'Billing: invoice PDF' });
    // The last handoff, one per project, is billing's.
    await writeLastHandoff(tmp, { feature_slug: 'billing', artifact_uris: ['.aioson/context/prd-billing.md'] });
    return tmp;
  }

  it('AC-parallel-sessions-25 --feature resumes that feature from its own state, whoever wrote last', async () => {
    const tmp = await makeTwoFeatureProject();
    try {
      const checkout = await buildDevResumeData(tmp, { feature: 'checkout', env: {} });
      assert.deepEqual(
        [checkout.feature_slug, checkout.current_phase, checkout.next_step],
        ['checkout', '2', 'Checkout: payment webhook']
      );
      assert.deepEqual(checkout.artifacts_consumed, [], 'the handoff of another feature is not this one\'s');

      const billing = await buildDevResumeData(tmp, { feature: 'billing', env: {} });
      assert.deepEqual(
        [billing.feature_slug, billing.current_phase, billing.next_step, billing.artifacts_consumed],
        ['billing', '5', 'Billing: invoice PDF', ['.aioson/context/prd-billing.md']]
      );

      const viaCommand = await runDevResumeData({ args: [tmp], options: { feature: 'checkout', json: true } });
      assert.equal(viaCommand.data.next_step, 'Checkout: payment webhook');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('AC-parallel-sessions-25 inside a live session the resume is for the feature of that session', async () => {
    const tmp = await makeTwoFeatureProject();
    try {
      const { t } = createTranslator('en');
      for (const key of ['session-a-key', 'session-b-key']) {
        await runLiveStart({
          args: [tmp],
          options: { tool: 'claude', 'tool-bin': process.execPath, 'no-launch': true, json: true, session: key, 'own-session': true, 'no-health-check': true, 'no-health': true },
          logger: silent,
          t
        });
      }
      await bindSessionFeature(tmp, 'checkout', { env: keyEnv('session-a-key') });
      await bindSessionFeature(tmp, 'billing', { env: keyEnv('session-b-key') });

      const inA = await buildDevResumeData(tmp, { env: keyEnv('session-a-key') });
      assert.deepEqual([inA.feature_slug, inA.current_phase, inA.next_step], ['checkout', '2', 'Checkout: payment webhook']);
      const inB = await buildDevResumeData(tmp, { env: keyEnv('session-b-key') });
      assert.deepEqual([inB.feature_slug, inB.current_phase, inB.next_step], ['billing', '5', 'Billing: invoice PDF']);

      // Outside a live session: the last handoff's feature, as before.
      const outside = await buildDevResumeData(tmp, { env: {} });
      assert.deepEqual([outside.feature_slug, outside.next_step], ['billing', 'Billing: invoice PDF']);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('a project-level state written before features had their own is still the resume of its feature', async () => {
    const tmp = await makeProject();
    try {
      await writeFeaturesMd(tmp, [{ slug: 'demo', status: 'in_progress' }]);
      await writeLastHandoff(tmp, { feature_slug: 'demo' });
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'dev-state.md'),
        '---\nactive_feature: demo\nactive_phase: 3\nnext_step: "legacy step"\nstatus: in_progress\n---\n',
        'utf8'
      );
      const data = await buildDevResumeData(tmp, { env: {} });
      assert.deepEqual([data.feature_slug, data.current_phase, data.next_step], ['demo', '3', 'legacy step']);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});

// Two chats on one folder: the project-level dev-state.md and the last handoff
// are one per project, so a chat that names no feature used to resume whatever
// the other chat wrote last. The resume now lists the threads that are open —
// a tracked feature and a Simple Plan alike — and says it is ambiguous.
describe('dev-resume — two chats on one folder', () => {
  const { runStateSave } = require('../src/commands/state-save');
  const silent = { log() {}, error() {} };

  async function twoThreads() {
    const tmp = await makeProject();
    await writeFeaturesMd(tmp, [{ slug: 'checkout', status: 'in_progress' }]);
    await fs.mkdir(path.join(tmp, '.aioson', 'context', 'simple-plans'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.aioson', 'context', 'simple-plans', 'fix-login.md'), '---\nstatus: in_progress\n---\n# Simple Plan - fix login\n', 'utf8');
    const write = (options) => runStateSave({ args: [tmp], options: { json: true, ...options }, logger: silent });
    await write({ feature: 'checkout', phase: '2', next: 'Checkout: payment webhook' });
    await write({ feature: 'fix-login', next: 'Fix the login redirect', context: 'simple-plan' });
    return tmp;
  }

  const cleanup = (tmp) => fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  it('lists both open threads and calls the resume ambiguous when the chat names no feature', async () => {
    const tmp = await twoThreads();
    try {
      const out = await runDevResumeData({ args: [tmp], options: { json: true } });
      assert.equal(out.ambiguous, true);
      assert.deepEqual(out.open_threads.map((t) => [t.feature, t.kind]).sort(), [['checkout', 'feature'], ['fix-login', 'simple-plan']]);
      const checkout = out.open_threads.find((t) => t.feature === 'checkout');
      assert.deepEqual([checkout.phase, checkout.next_step, checkout.stale], ['2', 'Checkout: payment webhook', false]);
      assert.match(out.note, /ask which one it continues/);
      assert.match(out.note, /parallel-sessions\.md/);
      // The project-level dev-state.md is the last writer's copy: it must not be what decides.
      const shared = await fs.readFile(path.join(tmp, '.aioson', 'context', 'dev-state.md'), 'utf8');
      assert.match(shared, /active_feature: fix-login/);
    } finally { await cleanup(tmp); }
  });

  it('keeps the human output one JSON document, the ambiguity inside it', async () => {
    const tmp = await twoThreads();
    try {
      await writeLastHandoff(tmp, { feature_slug: 'checkout' });
      const printed = [];
      const out = await runDevResumeData({ args: [tmp], options: {}, logger: { log: (line) => printed.push(line), error() {} } });
      assert.equal(out.data.feature_slug, 'checkout');
      assert.equal(printed.length, 1, 'one document, no prose around it');
      const document = JSON.parse(printed[0]);
      assert.equal(document.feature_slug, 'checkout');
      assert.equal(document.ambiguous, true);
      assert.equal(document.open_threads.length, 2);
    } finally { await cleanup(tmp); }
  });

  it('is not ambiguous once the chat names its feature', async () => {
    const tmp = await twoThreads();
    try {
      const out = await runDevResumeData({ args: [tmp], options: { json: true, feature: 'checkout' } });
      assert.equal(out.ambiguous, undefined);
      assert.equal(out.open_threads, undefined);
      assert.equal(out.data.feature_slug, 'checkout');
    } finally { await cleanup(tmp); }
  });

  it('says so even when no tracked feature is in progress (two Simple Plans, a cold start for the feature resume)', async () => {
    const tmp = await makeProject();
    try {
      await fs.mkdir(path.join(tmp, '.aioson', 'context', 'simple-plans'), { recursive: true });
      for (const slug of ['fix-a', 'fix-b']) {
        await fs.writeFile(path.join(tmp, '.aioson', 'context', 'simple-plans', `${slug}.md`), `# Simple Plan - ${slug}`, 'utf8');
      }
      const write = (options) => runStateSave({ args: [tmp], options: { json: true, ...options }, logger: silent });
      await write({ feature: 'fix-a', next: 'Fix A', context: 'simple-plan' });
      await write({ feature: 'fix-b', next: 'Fix B', context: 'simple-plan' });
      const printed = [];
      const out = await runDevResumeData({ args: [tmp], options: {}, logger: { log: (line) => printed.push(line), error() {} } });
      assert.equal(out.data, null);
      assert.equal(out.ambiguous, true);
      assert.ok(printed.some((line) => /No in-progress feature detected/.test(line)));
      assert.ok(printed.some((line) => /fix-a \(simple-plan\)/.test(line)) && printed.some((line) => /fix-b \(simple-plan\)/.test(line)));
    } finally { await cleanup(tmp); }
  });

  it('a single open thread, a stale one, and a closed feature never make a resume ambiguous', async () => {
    const tmp = await twoThreads();
    try {
      const ctx = path.join(tmp, '.aioson', 'context');
      // fix-login goes stale: untouched for weeks.
      const stale = path.join(ctx, 'features', 'fix-login', 'dev-state.md');
      await fs.writeFile(stale, (await fs.readFile(stale, 'utf8')).replace(/last_updated: .*/, 'last_updated: 2020-01-01'), 'utf8');
      const staleOnly = await runDevResumeData({ args: [tmp], options: { json: true } });
      assert.equal(staleOnly.ambiguous, undefined, 'one live thread and one stale thread: nothing to ask');
      assert.equal((await listOpenDevThreads(tmp)).find((t) => t.feature === 'fix-login').stale, true);

      // A plain file inside features/ is not a feature (and `<file>/dev-state.md` is ENOTDIR outside Windows).
      await fs.writeFile(path.join(ctx, 'features', 'notes'), 'a file whose name reads like a slug', 'utf8');
      assert.deepEqual((await listOpenDevThreads(tmp)).map((t) => t.feature).sort(), ['checkout', 'fix-login']);

      // checkout closes in the registry: its leftover state is no thread.
      await writeFeaturesMd(tmp, [{ slug: 'checkout', status: 'done' }]);
      assert.deepEqual((await listOpenDevThreads(tmp)).map((t) => t.feature), ['fix-login']);

      // A finished Simple Plan leaves its dev-state in_progress; the plan's own status closes the thread.
      const plan = path.join(ctx, 'simple-plans', 'fix-login.md');
      for (const status of ['done', 'abandoned', 'paused']) {
        await fs.writeFile(plan, `---\nstatus: ${status}\n---\n# Simple Plan - fix login\n`, 'utf8');
        assert.deepEqual(await listOpenDevThreads(tmp), [], `a ${status} Simple Plan is not an open thread`);
      }
      await fs.writeFile(plan, '---\nstatus: in_progress  # resumed\n---\n# Simple Plan - fix login\n', 'utf8');
      assert.deepEqual((await listOpenDevThreads(tmp)).map((t) => t.feature), ['fix-login']);
    } finally { await cleanup(tmp); }
  });

  it('a project with no dev state has no threads', async () => {
    const tmp = await makeProject();
    try {
      assert.deepEqual(await listOpenDevThreads(tmp), []);
      const out = await runDevResumeData({ args: [tmp], options: { json: true } });
      assert.equal(out.ambiguous, undefined);
    } finally { await cleanup(tmp); }
  });
});
