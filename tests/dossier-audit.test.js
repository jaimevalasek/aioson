'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  runDossierAudit,
  CHAIN_AGENTS,
  extractSection,
  parseFeaturesTable,
  parseFrontmatterField,
  checkTemplateParity,
  checkCoverage
} = require('../src/commands/dossier-audit');

function withCwd(cwd, fn) {
  const original = process.cwd();
  process.chdir(cwd);
  try {
    return fn();
  } finally {
    process.chdir(original);
  }
}

async function makeProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-audit-'));
  await fs.mkdir(path.join(tmp, '.aioson', 'agents'), { recursive: true });
  await fs.mkdir(path.join(tmp, 'template', '.aioson', 'agents'), { recursive: true });
  await fs.mkdir(path.join(tmp, '.aioson', 'context'), { recursive: true });
  return tmp;
}

async function writeAgent(projectRoot, location, agent, body) {
  const dir = location === 'workspace'
    ? path.join(projectRoot, '.aioson', 'agents')
    : path.join(projectRoot, 'template', '.aioson', 'agents');
  await fs.writeFile(path.join(dir, `${agent}.md`), body, 'utf8');
}

const FEATURE_DOSSIER_BLOCK = `## Feature dossier
- entry: write Agent Trail when promoting a research
- entry: write Research Index when consulting researchs/

`;

function makeAgentMd(extraSection = '') {
  return `# Agent

## Mission
Do work.

${extraSection}## Position in the workflow
After @setup.
`;
}

describe('dossier:audit — utility helpers', () => {
  it('extractSection returns the header + body until next section', () => {
    const raw = '# T\n\n## A\nA-body\n\n## Feature dossier\nfd-body\n\n## B\nB-body';
    const sec = extractSection(raw, '## Feature dossier');
    assert.match(sec, /^## Feature dossier\n/);
    assert.match(sec, /fd-body/);
    assert.doesNotMatch(sec, /B-body/);
  });

  it('extractSection returns null when missing', () => {
    const raw = '# T\n\n## Mission\nm';
    assert.equal(extractSection(raw, '## Feature dossier'), null);
  });

  it('parseFeaturesTable parses the markdown table', () => {
    const raw = `# Features

| slug | status | started | completed |
|------|--------|---------|-----------|
| feat-a | done | 2026-04-10 | 2026-04-12 |
| feat-b | in_progress | 2026-05-01 | — |
`;
    const out = parseFeaturesTable(raw);
    assert.deepEqual(out, [
      { slug: 'feat-a', status: 'done' },
      { slug: 'feat-b', status: 'in_progress' }
    ]);
  });

  it('parseFrontmatterField reads quoted and unquoted values', () => {
    const raw = `---
classification: "MEDIUM"
project: foo
---

body`;
    assert.equal(parseFrontmatterField(raw, 'classification'), 'MEDIUM');
    assert.equal(parseFrontmatterField(raw, 'project'), 'foo');
    assert.equal(parseFrontmatterField(raw, 'missing'), null);
  });
});

describe('dossier:audit --check=template-parity', () => {
  it('reports zero violations when workspace and template match', async () => {
    const tmp = await makeProject();
    try {
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }
      const result = await checkTemplateParity({ projectRoot: tmp, agents: CHAIN_AGENTS });
      assert.equal(result.violations.length, 0);
      assert.equal(result.checked.length, CHAIN_AGENTS.length);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('flags workspace_only when section exists in workspace but not template', async () => {
    const tmp = await makeProject();
    try {
      await writeAgent(tmp, 'workspace', 'product', makeAgentMd(FEATURE_DOSSIER_BLOCK));
      await writeAgent(tmp, 'template', 'product', makeAgentMd(''));
      const result = await checkTemplateParity({ projectRoot: tmp, agents: ['product'] });
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].kind, 'workspace_only');
      assert.equal(result.violations[0].agent, 'product');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('flags workspace_ahead when workspace section is longer than template', async () => {
    const tmp = await makeProject();
    try {
      const longer = `## Feature dossier
- one
- two
- three
- four

`;
      const shorter = `## Feature dossier
- one

`;
      await writeAgent(tmp, 'workspace', 'analyst', makeAgentMd(longer));
      await writeAgent(tmp, 'template', 'analyst', makeAgentMd(shorter));
      const result = await checkTemplateParity({ projectRoot: tmp, agents: ['analyst'] });
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].kind, 'workspace_ahead');
      assert.ok(result.violations[0].workspace_chars > result.violations[0].template_chars);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('flags template_ahead when template is longer than workspace', async () => {
    const tmp = await makeProject();
    try {
      const longer = `## Feature dossier
- one
- two
- three

`;
      const shorter = `## Feature dossier
- one

`;
      await writeAgent(tmp, 'workspace', 'qa', makeAgentMd(shorter));
      await writeAgent(tmp, 'template', 'qa', makeAgentMd(longer));
      const result = await checkTemplateParity({ projectRoot: tmp, agents: ['qa'] });
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].kind, 'template_ahead');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('full runDossierAudit returns ok=false on parity violations and ok=true on parity match', async () => {
    const tmp = await makeProject();
    try {
      const body = makeAgentMd(FEATURE_DOSSIER_BLOCK);
      for (const agent of CHAIN_AGENTS) {
        await writeAgent(tmp, 'workspace', agent, body);
        await writeAgent(tmp, 'template', agent, body);
      }
      const ok = await withCwd(tmp, () =>
        runDossierAudit({ args: ['.'], options: { check: 'template-parity', json: true } })
      );
      assert.equal(ok.ok, true);
      assert.equal(ok.violations.length, 0);

      await writeAgent(tmp, 'workspace', 'product', makeAgentMd(FEATURE_DOSSIER_BLOCK + 'extra\n\n'));
      const fail = await withCwd(tmp, () =>
        runDossierAudit({ args: ['.'], options: { check: 'template-parity', json: true } })
      );
      assert.equal(fail.ok, false);
      assert.equal(fail.violations.length, 1);
      assert.equal(fail.violations[0].kind, 'workspace_ahead');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('dossier:audit --check=coverage', () => {
  it('returns ok=true when all in-progress SMALL/MEDIUM features have a dossier', async () => {
    const tmp = await makeProject();
    try {
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'features.md'),
        `# Features

| slug | status | started | completed |
|------|--------|---------|-----------|
| feat-a | in_progress | 2026-05-01 | — |
`,
        'utf8'
      );
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'prd-feat-a.md'),
        `---
classification: "MEDIUM"
---
content`,
        'utf8'
      );
      const featDir = path.join(tmp, '.aioson', 'context', 'features', 'feat-a');
      await fs.mkdir(featDir, { recursive: true });
      await fs.writeFile(path.join(featDir, 'dossier.md'), 'present', 'utf8');

      const result = await checkCoverage({ projectRoot: tmp });
      assert.equal(result.missing_dossier.length, 0);
      assert.equal(result.features_checked.length, 1);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('reports SMALL/MEDIUM in-progress features without a dossier', async () => {
    const tmp = await makeProject();
    try {
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'features.md'),
        `# Features

| slug | status | started | completed |
|------|--------|---------|-----------|
| feat-small | in_progress | 2026-05-01 | — |
| feat-medium | in_progress | 2026-05-02 | — |
| feat-micro | in_progress | 2026-05-03 | — |
| feat-done | done | 2026-04-01 | 2026-04-02 |
`,
        'utf8'
      );
      await fs.writeFile(path.join(tmp, '.aioson', 'context', 'prd-feat-small.md'), `---\nclassification: SMALL\n---`, 'utf8');
      await fs.writeFile(path.join(tmp, '.aioson', 'context', 'prd-feat-medium.md'), `---\nclassification: MEDIUM\n---`, 'utf8');
      await fs.writeFile(path.join(tmp, '.aioson', 'context', 'prd-feat-micro.md'), `---\nclassification: MICRO\n---`, 'utf8');

      const result = await checkCoverage({ projectRoot: tmp });
      const missingSlugs = result.missing_dossier.map((m) => m.slug).sort();
      assert.deepEqual(missingSlugs, ['feat-medium', 'feat-small']);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('skips MICRO features and done features from missing-dossier report', async () => {
    const tmp = await makeProject();
    try {
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'features.md'),
        `# Features

| slug | status |
|------|--------|
| micro-feat | in_progress |
| done-feat | done |
`,
        'utf8'
      );
      await fs.writeFile(path.join(tmp, '.aioson', 'context', 'prd-micro-feat.md'), `---\nclassification: MICRO\n---`, 'utf8');
      await fs.writeFile(path.join(tmp, '.aioson', 'context', 'prd-done-feat.md'), `---\nclassification: MEDIUM\n---`, 'utf8');
      const result = await checkCoverage({ projectRoot: tmp });
      assert.equal(result.missing_dossier.length, 0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('handles missing features.md gracefully', async () => {
    const tmp = await makeProject();
    try {
      const result = await checkCoverage({ projectRoot: tmp });
      assert.equal(result.features_md_missing, true);
      assert.deepEqual(result.missing_dossier, []);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('dossier:audit — top-level dispatch', () => {
  it('rejects missing --check', async () => {
    const tmp = await makeProject();
    try {
      const r = await withCwd(tmp, () =>
        runDossierAudit({ args: ['.'], options: { json: true } })
      );
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'missing_check');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects unknown --check', async () => {
    const tmp = await makeProject();
    try {
      const r = await withCwd(tmp, () =>
        runDossierAudit({ args: ['.'], options: { check: 'unknown-mode', json: true } })
      );
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'unknown_check');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('runs --check=coverage end-to-end', async () => {
    const tmp = await makeProject();
    try {
      await fs.writeFile(
        path.join(tmp, '.aioson', 'context', 'features.md'),
        `# Features\n\n| slug | status |\n|------|--------|\n| f | in_progress |\n`,
        'utf8'
      );
      await fs.writeFile(path.join(tmp, '.aioson', 'context', 'prd-f.md'), `---\nclassification: SMALL\n---`, 'utf8');
      const r = await withCwd(tmp, () =>
        runDossierAudit({ args: ['.'], options: { check: 'coverage', json: true } })
      );
      assert.equal(r.ok, false);
      assert.equal(r.missing_dossier.length, 1);
      assert.equal(r.missing_dossier[0].slug, 'f');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
