'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  ARTIFACT_KINDS,
  coerceArtifactUri,
  coerceArtifactUris,
  writeHandoff,
  readHandoffProtocol,
  buildWorkflowHandoffProtocol,
  HANDOFF_PROTOCOL_RELATIVE_PATH
} = require('../src/session-handoff');

describe('handoff-protocol artifact_uris v2 — coercion', () => {
  it('coerces a string to a v2 object with default kind/agent/added_at', () => {
    const result = coerceArtifactUri('.aioson/context/prd-foo.md');
    assert.deepEqual(result, {
      path: '.aioson/context/prd-foo.md',
      kind: 'other',
      agent: 'unknown',
      added_at: null
    });
  });

  it('coerces a string with a fallbackAgent argument', () => {
    const result = coerceArtifactUri('.aioson/context/spec-foo.md', 'dev');
    assert.equal(result.agent, 'dev');
  });

  it('rejects empty strings (returns null)', () => {
    assert.equal(coerceArtifactUri(''), null);
    assert.equal(coerceArtifactUri('   '), null);
  });

  it('passes through a complete v2 object unchanged (semantically)', () => {
    const input = {
      path: '.aioson/context/prd-foo.md',
      kind: 'prd',
      agent: 'product',
      added_at: '2026-05-07T12:00:00Z'
    };
    assert.deepEqual(coerceArtifactUri(input), input);
  });

  it('normalizes unknown kind to "other"', () => {
    const result = coerceArtifactUri({
      path: '.aioson/context/x.md',
      kind: 'bogus',
      agent: 'dev'
    });
    assert.equal(result.kind, 'other');
  });

  it('fills missing agent from fallback', () => {
    const result = coerceArtifactUri(
      { path: '.aioson/context/x.md', kind: 'spec' },
      'analyst'
    );
    assert.equal(result.agent, 'analyst');
  });

  it('fills missing agent with "unknown" when no fallback', () => {
    const result = coerceArtifactUri({ path: '.aioson/context/x.md' });
    assert.equal(result.agent, 'unknown');
    assert.equal(result.kind, 'other');
    assert.equal(result.added_at, null);
  });

  it('rejects objects without a path (returns null)', () => {
    assert.equal(coerceArtifactUri({ kind: 'prd', agent: 'product' }), null);
    assert.equal(coerceArtifactUri({ path: '' }), null);
    assert.equal(coerceArtifactUri({ path: 123 }), null);
  });

  it('rejects null/undefined/non-array inputs to coerceArtifactUris', () => {
    assert.deepEqual(coerceArtifactUris(null), []);
    assert.deepEqual(coerceArtifactUris(undefined), []);
    assert.deepEqual(coerceArtifactUris('not-an-array'), []);
    assert.deepEqual(coerceArtifactUris({ path: 'x' }), []);
  });

  it('coerces a v1 string array (legacy) to v2 objects', () => {
    const v1 = [
      '.aioson/context/prd-foo.md',
      '.aioson/context/spec-foo.md'
    ];
    const result = coerceArtifactUris(v1, 'product');
    assert.equal(result.length, 2);
    assert.equal(result[0].path, '.aioson/context/prd-foo.md');
    assert.equal(result[0].kind, 'other');
    assert.equal(result[0].agent, 'product');
    assert.equal(result[0].added_at, null);
    assert.equal(result[1].agent, 'product');
  });

  it('handles mixed arrays (string + object) item-by-item', () => {
    const mixed = [
      '.aioson/context/prd-foo.md',
      { path: '.aioson/context/spec-foo.md', kind: 'spec', agent: 'analyst' }
    ];
    const result = coerceArtifactUris(mixed, 'dev');
    assert.equal(result.length, 2);
    assert.equal(result[0].agent, 'dev');
    assert.equal(result[0].kind, 'other');
    assert.equal(result[1].agent, 'analyst');
    assert.equal(result[1].kind, 'spec');
  });

  it('drops invalid entries silently', () => {
    const result = coerceArtifactUris([
      '.aioson/context/prd.md',
      null,
      { kind: 'prd' },
      { path: '.aioson/context/spec.md', kind: 'spec' }
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].path, '.aioson/context/prd.md');
    assert.equal(result[1].path, '.aioson/context/spec.md');
  });

  it('exposes the canonical kind enum', () => {
    assert.ok(ARTIFACT_KINDS.includes('prd'));
    assert.ok(ARTIFACT_KINDS.includes('spec'));
    assert.ok(ARTIFACT_KINDS.includes('research'));
    assert.ok(ARTIFACT_KINDS.includes('other'));
    assert.ok(Object.isFrozen(ARTIFACT_KINDS));
  });
});

describe('handoff-protocol artifact_uris v2 — writers always emit v2', () => {
  it('buildWorkflowHandoffProtocol emits v2 objects when caller passes strings', () => {
    const state = { mode: 'feature', classification: 'MEDIUM', featureSlug: 'agent-chain-continuity' };
    const protocol = buildWorkflowHandoffProtocol(state, 'product', 'analyst', {
      artifactUris: ['.aioson/context/prd-agent-chain-continuity.md']
    });
    assert.equal(protocol.artifact_uris.length, 1);
    const entry = protocol.artifact_uris[0];
    assert.equal(typeof entry, 'object');
    assert.equal(entry.path, '.aioson/context/prd-agent-chain-continuity.md');
    assert.equal(entry.kind, 'other');
    assert.equal(entry.agent, 'product');
    assert.equal(entry.added_at, null);
  });

  it('buildWorkflowHandoffProtocol emits v2 objects when caller passes v2 objects', () => {
    const state = { mode: 'feature', classification: 'MEDIUM', featureSlug: 'foo' };
    const protocol = buildWorkflowHandoffProtocol(state, 'analyst', 'architect', {
      artifactUris: [
        { path: '.aioson/context/spec-foo.md', kind: 'spec', agent: 'analyst', added_at: '2026-05-07T10:00:00Z' }
      ]
    });
    assert.deepEqual(protocol.artifact_uris[0], {
      path: '.aioson/context/spec-foo.md',
      kind: 'spec',
      agent: 'analyst',
      added_at: '2026-05-07T10:00:00Z'
    });
  });

  it('buildWorkflowHandoffProtocol returns [] for missing/invalid artifactUris', () => {
    const state = { mode: 'feature', classification: 'MEDIUM' };
    const a = buildWorkflowHandoffProtocol(state, 'dev', 'qa');
    const b = buildWorkflowHandoffProtocol(state, 'dev', 'qa', { artifactUris: 'nope' });
    assert.deepEqual(a.artifact_uris, []);
    assert.deepEqual(b.artifact_uris, []);
  });
});

describe('handoff-protocol artifact_uris v2 — read-side backwards compat', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-handoff-v2-'));
    await fs.mkdir(path.join(tmpDir, '.aioson', 'context'), { recursive: true });
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('readHandoffProtocol coerces a legacy v1 file (string array) to v2', async () => {
    const legacy = {
      version: '1.0',
      protocol_id: 'hnd-product-analyst-1',
      from: { agent_id: 'product', capability_transferred: 'define_product_scope' },
      to: { agent_id: 'analyst', capability_required: 'analyze_requirements' },
      artifact_uris: [
        '.aioson/context/prd-foo.md',
        '.aioson/context/features.md'
      ]
    };
    await fs.writeFile(
      path.join(tmpDir, HANDOFF_PROTOCOL_RELATIVE_PATH),
      JSON.stringify(legacy, null, 2)
    );

    const parsed = await readHandoffProtocol(tmpDir);
    assert.equal(parsed.artifact_uris.length, 2);
    assert.equal(typeof parsed.artifact_uris[0], 'object');
    assert.equal(parsed.artifact_uris[0].path, '.aioson/context/prd-foo.md');
    assert.equal(parsed.artifact_uris[0].kind, 'other');
    assert.equal(parsed.artifact_uris[0].agent, 'product');
    assert.equal(parsed.artifact_uris[0].added_at, null);
    assert.equal(parsed.artifact_uris[1].agent, 'product');
  });

  it('readHandoffProtocol passes through a v2 file without mutation (modulo enum normalization)', async () => {
    const v2 = {
      version: '1.0',
      protocol_id: 'hnd-analyst-architect-2',
      from: { agent_id: 'analyst', capability_transferred: 'analyze_requirements' },
      to: { agent_id: 'architect', capability_required: 'design_architecture' },
      artifact_uris: [
        {
          path: '.aioson/context/spec-foo.md',
          kind: 'spec',
          agent: 'analyst',
          added_at: '2026-05-07T11:00:00Z'
        }
      ]
    };
    await fs.writeFile(
      path.join(tmpDir, HANDOFF_PROTOCOL_RELATIVE_PATH),
      JSON.stringify(v2, null, 2)
    );

    const parsed = await readHandoffProtocol(tmpDir);
    assert.deepEqual(parsed.artifact_uris[0], v2.artifact_uris[0]);
  });

  it('writeHandoff round-trip preserves v2 schema on disk', async () => {
    const result = await writeHandoff(tmpDir, {
      lastAgent: '@product',
      lastStage: 'product',
      whatWasDone: 'PRD written',
      whatComesNext: 'Next stage: @analyst',
      nextAgent: '@analyst',
      contextFilesUpdated: ['.aioson/context/prd-foo.md'],
      featureSlug: 'foo',
      classification: 'MEDIUM',
      workflowMode: 'feature'
    });

    const reread = await readHandoffProtocol(tmpDir);
    assert.equal(reread.artifact_uris.length, 1);
    const entry = reread.artifact_uris[0];
    assert.equal(entry.path, '.aioson/context/prd-foo.md');
    assert.equal(entry.kind, 'other');
    assert.equal(entry.agent, 'product');
    assert.equal(entry.added_at, null);
    assert.equal(typeof result.protocol.artifact_uris[0], 'object');
  });
});
