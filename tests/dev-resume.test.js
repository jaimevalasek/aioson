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
  listOpenCorrections
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
