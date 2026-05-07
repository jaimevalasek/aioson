'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  addResearch,
  parseResearchIndexBlock,
  parseYamlResearchIndex,
  serializeResearchIndex,
  validateResearchEntry,
  insertResearchIndexSection,
  SECTION_HEADER,
  WHY_RELEVANT_MAX
} = require('../../src/dossier/research-index-store');

const FROZEN_NOW = () => new Date('2026-05-07T12:00:00.000Z');

async function makeFixtureDossier(rawContent) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dossier-rix-'));
  const ctx = path.join(tmp, 'context');
  const featDir = path.join(ctx, 'features', 'feature-x');
  await fs.mkdir(featDir, { recursive: true });
  await fs.writeFile(path.join(featDir, 'dossier.md'), rawContent, 'utf8');
  return { tmp, contextDir: ctx };
}

const DOSSIER_WITH_INDEX = `---
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

_(vazio — populado via dossier:link-rule)_

## Research Index

\`\`\`yaml
researchs: []
\`\`\`

## Agent Trail

_(vazio)_

## Revision Requests

_(vazio)_
`;

const DOSSIER_WITHOUT_INDEX_V11 = `---
feature_slug: feature-y
schema_version: "1.1"
created_by: dossier-init
created_at: 2026-05-07T10:00:00Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-05-07T10:00:00Z
---

## Why
y

## What
y

## Code Map

\`\`\`yaml
files: []
modules: []
patterns: []
\`\`\`

## Rules & Design-Docs aplicáveis

_(vazio)_

## Agent Trail

_(vazio)_

## Revision Requests

_(vazio)_
`;

describe('research-index-store — parser', () => {
  it('locates section block and YAML range', () => {
    const parsed = parseResearchIndexBlock(DOSSIER_WITH_INDEX);
    assert.ok(parsed, 'should locate the block');
    assert.ok(parsed.codeStart < parsed.codeEnd);
    const yaml = DOSSIER_WITH_INDEX.slice(parsed.codeStart, parsed.codeEnd);
    assert.match(yaml, /^researchs:\s*\[\]/);
  });

  it('returns null when section is absent', () => {
    assert.equal(parseResearchIndexBlock(DOSSIER_WITHOUT_INDEX_V11), null);
  });

  it('does not match yaml block from another section', () => {
    // Code Map block is also yaml — make sure the parser does not return it.
    const parsed = parseResearchIndexBlock(DOSSIER_WITHOUT_INDEX_V11);
    assert.equal(parsed, null, 'should not pick up Code Map yaml');
  });
});

describe('research-index-store — yaml round-trip', () => {
  it('parses and re-serializes empty list', () => {
    const parsed = parseYamlResearchIndex('researchs: []');
    assert.deepEqual(parsed.researchs, []);
    assert.equal(serializeResearchIndex(parsed), 'researchs: []');
  });

  it('parses single entry with all fields', () => {
    const yamlText = `researchs:
- slug: tool-first-agent-workflows-2026
  verdict: confirmed
  agent_who_added: sheldon
  why_relevant: tool-first vs prompt-first decision
  added_at: 2026-05-07T14:32:00Z
  summary_path: researchs/tool-first-agent-workflows-2026/summary.md`;
    const parsed = parseYamlResearchIndex(yamlText);
    assert.equal(parsed.researchs.length, 1);
    assert.equal(parsed.researchs[0].slug, 'tool-first-agent-workflows-2026');
    assert.equal(parsed.researchs[0].verdict, 'confirmed');
    assert.equal(parsed.researchs[0].agent_who_added, 'sheldon');
  });

  it('round-trips multiple entries preserving keys order', () => {
    const original = {
      researchs: [
        {
          slug: 'a',
          verdict: 'confirmed',
          agent_who_added: 'sheldon',
          why_relevant: 'why a',
          added_at: '2026-05-07T10:00:00Z',
          summary_path: 'researchs/a/summary.md'
        },
        {
          slug: 'b',
          verdict: 'outdated',
          agent_who_added: 'analyst',
          why_relevant: 'why b',
          added_at: '2026-05-07T11:00:00Z',
          summary_path: 'researchs/b/summary.md'
        }
      ]
    };
    const yamlText = serializeResearchIndex(original);
    const reparsed = parseYamlResearchIndex(yamlText);
    assert.deepEqual(reparsed, original);
  });
});

describe('research-index-store — validation', () => {
  it('accepts a complete valid entry', () => {
    const errors = validateResearchEntry({
      slug: 'good-slug',
      verdict: 'confirmed',
      agent_who_added: 'sheldon',
      why_relevant: 'short reason',
      summary_path: 'researchs/good-slug/summary.md'
    });
    assert.deepEqual(errors, []);
  });

  it('rejects bad slug', () => {
    const errors = validateResearchEntry({
      slug: 'BadSlug',
      verdict: 'confirmed',
      agent_who_added: 'sheldon',
      why_relevant: 'r',
      summary_path: 'p'
    });
    assert.ok(errors.some(e => e.includes('slug must be kebab-case')));
  });

  it('rejects unknown verdict', () => {
    const errors = validateResearchEntry({
      slug: 'a',
      verdict: 'maybe',
      agent_who_added: 'sheldon',
      why_relevant: 'r',
      summary_path: 'p'
    });
    assert.ok(errors.some(e => e.includes('verdict must be one of')));
  });

  it('rejects non-canonical agent', () => {
    const errors = validateResearchEntry({
      slug: 'a',
      verdict: 'confirmed',
      agent_who_added: 'random-agent',
      why_relevant: 'r',
      summary_path: 'p'
    });
    assert.ok(errors.some(e => e.includes('agent_who_added must be a canonical agent id')));
  });

  it('rejects why_relevant longer than max', () => {
    const errors = validateResearchEntry({
      slug: 'a',
      verdict: 'confirmed',
      agent_who_added: 'sheldon',
      why_relevant: 'x'.repeat(WHY_RELEVANT_MAX + 1),
      summary_path: 'p'
    });
    assert.ok(errors.some(e => e.includes(`≤ ${WHY_RELEVANT_MAX} chars`)));
  });
});

describe('research-index-store — addResearch', () => {
  it('adds a new entry to existing Research Index section', async () => {
    const { contextDir } = await makeFixtureDossier(DOSSIER_WITH_INDEX);
    const result = await addResearch({
      slug: 'feature-x',
      contextDir,
      researchSlug: 'tool-first-agent-workflows-2026',
      verdict: 'confirmed',
      agent: 'sheldon',
      whyRelevant: 'tool-first vs prompt-first',
      now: FROZEN_NOW
    });
    assert.equal(result.added, true);
    assert.equal(result.updated, false);

    const raw = await fs.readFile(
      path.join(contextDir, 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    assert.match(raw, /slug: tool-first-agent-workflows-2026/);
    assert.match(raw, /verdict: confirmed/);
    assert.match(raw, /summary_path: researchs\/tool-first-agent-workflows-2026\/summary\.md/);
  });

  it('inserts the section when absent (legacy v1.1 dossier)', async () => {
    const { contextDir } = await makeFixtureDossier(
      DOSSIER_WITHOUT_INDEX_V11.replace('feature-y', 'feature-y').replace(/feature-y/g, 'feature-x')
    );
    const result = await addResearch({
      slug: 'feature-x',
      contextDir,
      researchSlug: 'mcp-a2a-agent-security-2026',
      verdict: 'has-alternatives',
      agent: 'analyst',
      whyRelevant: 'security review',
      now: FROZEN_NOW
    });
    assert.equal(result.added, true);

    const raw = await fs.readFile(
      path.join(contextDir, 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    assert.match(raw, new RegExp(SECTION_HEADER));
    assert.match(raw, /slug: mcp-a2a-agent-security-2026/);
    // Section must be placed before Agent Trail
    const indexPos = raw.indexOf(SECTION_HEADER);
    const trailPos = raw.indexOf('## Agent Trail');
    assert.ok(indexPos > 0 && trailPos > indexPos, 'Research Index must precede Agent Trail');
  });

  it('is idempotent for identical entries', async () => {
    const { contextDir } = await makeFixtureDossier(DOSSIER_WITH_INDEX);
    const args = {
      slug: 'feature-x',
      contextDir,
      researchSlug: 'r1',
      verdict: 'confirmed',
      agent: 'sheldon',
      whyRelevant: 'reason',
      now: FROZEN_NOW
    };
    const first = await addResearch(args);
    const second = await addResearch(args);
    assert.equal(first.added, true);
    assert.equal(second.added, false);
    assert.equal(second.updated, false);
  });

  it('updates verdict last-write-wins, preserving agent_who_added and added_at', async () => {
    const { contextDir } = await makeFixtureDossier(DOSSIER_WITH_INDEX);
    await addResearch({
      slug: 'feature-x',
      contextDir,
      researchSlug: 'r1',
      verdict: 'confirmed',
      agent: 'sheldon',
      whyRelevant: 'first',
      now: () => new Date('2026-05-07T10:00:00Z')
    });
    const second = await addResearch({
      slug: 'feature-x',
      contextDir,
      researchSlug: 'r1',
      verdict: 'outdated',
      agent: 'analyst',
      whyRelevant: 'second',
      now: () => new Date('2026-05-07T11:00:00Z')
    });
    assert.equal(second.added, false);
    assert.equal(second.updated, true);

    const raw = await fs.readFile(
      path.join(contextDir, 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    // verdict changed
    assert.match(raw, /verdict: outdated/);
    // agent_who_added preserved (sheldon, not analyst)
    assert.match(raw, /agent_who_added: sheldon/);
    // added_at preserved (10:00 first write)
    assert.match(raw, /added_at: 2026-05-07T10:00:00.000Z/);
  });

  it('rejects when feature dossier is missing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dossier-rix-'));
    const ctx = path.join(tmp, 'context');
    await fs.mkdir(ctx, { recursive: true });
    await assert.rejects(
      () =>
        addResearch({
          slug: 'no-feature',
          contextDir: ctx,
          researchSlug: 'r1',
          verdict: 'confirmed',
          agent: 'sheldon',
          whyRelevant: 'r',
          now: FROZEN_NOW
        }),
      err => err && err.code === 'EDOSSIERMISSING'
    );
  });

  it('honors explicit summary_path override', async () => {
    const { contextDir } = await makeFixtureDossier(DOSSIER_WITH_INDEX);
    await addResearch({
      slug: 'feature-x',
      contextDir,
      researchSlug: 'r1',
      verdict: 'confirmed',
      agent: 'sheldon',
      whyRelevant: 'r',
      summaryPath: 'custom/path/summary.md',
      now: FROZEN_NOW
    });
    const raw = await fs.readFile(
      path.join(contextDir, 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    assert.match(raw, /summary_path: custom\/path\/summary\.md/);
  });
});

describe('research-index-store — insertResearchIndexSection helper', () => {
  it('inserts before Agent Trail when present', () => {
    const raw = `# header\n\n## Rules & Design-Docs aplicáveis\n\nx\n\n## Agent Trail\n\ny\n`;
    const out = insertResearchIndexSection(raw, 'researchs: []');
    const idx = out.indexOf(SECTION_HEADER);
    const trail = out.indexOf('## Agent Trail');
    assert.ok(idx < trail);
    assert.match(out, /researchs: \[\]/);
  });

  it('falls back to append at end when Agent Trail is missing', () => {
    const raw = `# header\n\n## Why\n\ntext\n`;
    const out = insertResearchIndexSection(raw, 'researchs: []');
    assert.match(out, /## Research Index/);
    assert.ok(out.length > raw.length);
  });
});
