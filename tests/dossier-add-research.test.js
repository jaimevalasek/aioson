'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runDossierAddResearch } = require('../src/commands/dossier-add-research');

const DOSSIER_TEMPLATE = `---
feature_slug: feature-x
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-07T10:00:00Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-07T10:00:00Z
---

## Why
something

## What
something

## Code Map

\`\`\`yaml
files: []
modules: []
patterns: []
\`\`\`

## Rules & Design-Docs aplicáveis

_(vazio)_

## Research Index

\`\`\`yaml
researchs: []
\`\`\`

## Agent Trail

_(vazio)_

## Revision Requests

_(vazio)_
`;

async function setupTmpProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-add-research-'));
  const ctxDir = path.join(tmp, '.aioson', 'context');
  const featureDir = path.join(ctxDir, 'features', 'feature-x');
  await fs.mkdir(featureDir, { recursive: true });
  await fs.writeFile(path.join(featureDir, 'dossier.md'), DOSSIER_TEMPLATE, 'utf8');
  return { tmp, ctxDir, featureDir };
}

function withCwd(cwd, fn) {
  const original = process.cwd();
  process.chdir(cwd);
  try {
    return fn();
  } finally {
    process.chdir(original);
  }
}

describe('dossier:add-research command', () => {
  it('adds a research entry with default summary path', async () => {
    const { tmp, featureDir } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: {
            slug: 'feature-x',
            'research-slug': 'auth-providers-2026',
            agent: 'analyst',
            verdict: 'confirmed',
            'why-relevant': 'Aligns with PRD §4 stack decision',
            json: true
          }
        })
      );
      assert.equal(result.ok, true);
      assert.equal(result.added, true);
      assert.equal(result.updated, false);

      const written = await fs.readFile(path.join(featureDir, 'dossier.md'), 'utf8');
      assert.match(written, /slug: auth-providers-2026/);
      assert.match(written, /verdict: confirmed/);
      assert.match(written, /agent_who_added: analyst/);
      assert.match(written, /summary_path: researchs\/auth-providers-2026\/summary\.md/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('honors explicit --summary-path', async () => {
    const { tmp, featureDir } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: {
            slug: 'feature-x',
            'research-slug': 'kv-store-2026',
            agent: 'architect',
            verdict: 'has-alternatives',
            'why-relevant': 'Two viable options identified',
            'summary-path': 'docs/research/kv-store/summary.md',
            json: true
          }
        })
      );
      assert.equal(result.ok, true);
      assert.equal(result.added, true);
      const written = await fs.readFile(path.join(featureDir, 'dossier.md'), 'utf8');
      assert.match(written, /summary_path: docs\/research\/kv-store\/summary\.md/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('is idempotent — repeated identical add returns added=false, updated=false', async () => {
    const { tmp } = await setupTmpProject();
    try {
      const opts = {
        slug: 'feature-x',
        'research-slug': 'auth-providers-2026',
        agent: 'analyst',
        verdict: 'confirmed',
        'why-relevant': 'Aligns with PRD §4 stack decision',
        json: true
      };
      const first = await withCwd(tmp, () => runDossierAddResearch({ args: ['.'], options: opts }));
      const second = await withCwd(tmp, () => runDossierAddResearch({ args: ['.'], options: opts }));
      assert.equal(first.added, true);
      assert.equal(second.added, false);
      assert.equal(second.updated, false);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('updates verdict last-write-wins on existing entry', async () => {
    const { tmp, featureDir } = await setupTmpProject();
    try {
      const baseOpts = {
        slug: 'feature-x',
        'research-slug': 'auth-providers-2026',
        agent: 'analyst',
        verdict: 'confirmed',
        'why-relevant': 'Initial reason',
        json: true
      };
      await withCwd(tmp, () => runDossierAddResearch({ args: ['.'], options: baseOpts }));
      const second = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { ...baseOpts, verdict: 'outdated', 'why-relevant': 'Re-reviewed: stale' }
        })
      );
      assert.equal(second.ok, true);
      assert.equal(second.updated, true);
      const written = await fs.readFile(path.join(featureDir, 'dossier.md'), 'utf8');
      assert.match(written, /verdict: outdated/);
      assert.doesNotMatch(written, /verdict: confirmed/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects missing feature slug', async () => {
    const { tmp } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { 'research-slug': 'x', agent: 'analyst', verdict: 'confirmed', 'why-relevant': 'r', json: true }
        })
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'missing_slug');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects invalid feature slug', async () => {
    const { tmp } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { slug: 'NotKebab', 'research-slug': 'x', agent: 'analyst', verdict: 'confirmed', 'why-relevant': 'r', json: true }
        })
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'invalid_slug');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects non-canonical agent', async () => {
    const { tmp } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { slug: 'feature-x', 'research-slug': 'x', agent: 'bogus-agent', verdict: 'confirmed', 'why-relevant': 'r', json: true }
        })
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'invalid_agent');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects unknown verdict', async () => {
    const { tmp } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { slug: 'feature-x', 'research-slug': 'x', agent: 'analyst', verdict: 'maybe', 'why-relevant': 'r', json: true }
        })
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'invalid_verdict');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects missing why-relevant', async () => {
    const { tmp } = await setupTmpProject();
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { slug: 'feature-x', 'research-slug': 'x', agent: 'analyst', verdict: 'confirmed', json: true }
        })
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'missing_why_relevant');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns not_found when dossier is missing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-no-dossier-'));
    await fs.mkdir(path.join(tmp, '.aioson', 'context'), { recursive: true });
    try {
      const result = await withCwd(tmp, () =>
        runDossierAddResearch({
          args: ['.'],
          options: { slug: 'no-such-feature', 'research-slug': 'x', agent: 'analyst', verdict: 'confirmed', 'why-relevant': 'r', json: true }
        })
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'not_found');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
