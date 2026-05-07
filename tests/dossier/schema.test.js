'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  CANONICAL_AGENT_IDS,
  REQUIRED_SECTIONS,
  RESEARCH_VERDICTS,
  isValidSlug,
  isValidIsoDate,
  isCanonicalAgent,
  isAllowedAuthor,
  validateFrontmatter,
  assertFrontmatter
} = require('../../src/dossier/schema');

function validFrontmatter(overrides = {}) {
  return {
    feature_slug: 'feature-x',
    schema_version: '1.0',
    created_by: 'dossier-init',
    created_at: '2026-04-28T10:00:00Z',
    status: 'active',
    classification: 'MEDIUM',
    last_updated_by: 'dossier-init',
    last_updated_at: '2026-04-28T10:00:00Z',
    ...overrides
  };
}

describe('dossier/schema — constants', () => {
  it('exposes current schema version 1.2', () => {
    assert.equal(SCHEMA_VERSION, '1.2');
  });

  it('supports v1.0, v1.1 and v1.2 for backward-compatible reads', () => {
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has('1.0'));
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has('1.1'));
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has('1.2'));
    assert.equal(SUPPORTED_SCHEMA_VERSIONS.has('2.0'), false);
  });

  it('canonical agent set includes core SDLC chain', () => {
    for (const id of ['product', 'sheldon', 'analyst', 'architect', 'pm', 'orchestrator', 'dev', 'qa', 'ux-ui']) {
      assert.ok(CANONICAL_AGENT_IDS.has(id), `expected canonical agent: ${id}`);
    }
  });

  it('required sections cover the 6 dossier sections', () => {
    assert.deepEqual([...REQUIRED_SECTIONS], [
      'Why',
      'What',
      'Code Map',
      'Rules & Design-Docs aplicáveis',
      'Agent Trail',
      'Revision Requests'
    ]);
  });

  it('research verdicts enum matches researchs/ convention', () => {
    assert.deepEqual([...RESEARCH_VERDICTS].sort(), [
      'confirmed',
      'deprecated',
      'has-alternatives',
      'outdated'
    ]);
  });
});

describe('dossier/schema — isValidSlug', () => {
  it('accepts kebab-case', () => {
    assert.equal(isValidSlug('feature-x'), true);
    assert.equal(isValidSlug('feature-dossier'), true);
    assert.equal(isValidSlug('a'), true);
    assert.equal(isValidSlug('a1-b2'), true);
  });

  it('rejects camelCase, snake_case, leading hyphen, empty', () => {
    assert.equal(isValidSlug('FeatureX'), false);
    assert.equal(isValidSlug('feature_x'), false);
    assert.equal(isValidSlug('-feature'), false);
    assert.equal(isValidSlug(''), false);
    assert.equal(isValidSlug(null), false);
    assert.equal(isValidSlug(123), false);
  });
});

describe('dossier/schema — isValidIsoDate', () => {
  it('accepts ISO 8601 with Z', () => {
    assert.equal(isValidIsoDate('2026-04-28T10:00:00Z'), true);
    assert.equal(isValidIsoDate('2026-04-28T10:00:00.123Z'), true);
  });

  it('accepts ISO 8601 with offset', () => {
    assert.equal(isValidIsoDate('2026-04-28T10:00:00-03:00'), true);
  });

  it('rejects malformed dates', () => {
    assert.equal(isValidIsoDate('2026-04-28'), false);
    assert.equal(isValidIsoDate('not-a-date'), false);
    assert.equal(isValidIsoDate(''), false);
    assert.equal(isValidIsoDate(null), false);
  });
});

describe('dossier/schema — isCanonicalAgent / isAllowedAuthor', () => {
  it('recognizes canonical agents', () => {
    assert.equal(isCanonicalAgent('dev'), true);
    assert.equal(isCanonicalAgent('ux-ui'), true);
  });

  it('rejects unknown agents', () => {
    assert.equal(isCanonicalAgent('hacker'), false);
    assert.equal(isCanonicalAgent('dossier-init'), false);
  });

  it('isAllowedAuthor accepts pseudo-id dossier-init', () => {
    assert.equal(isAllowedAuthor('dossier-init'), true);
    assert.equal(isAllowedAuthor('dev'), true);
    assert.equal(isAllowedAuthor('hacker'), false);
  });
});

describe('dossier/schema — validateFrontmatter', () => {
  it('accepts a minimal valid frontmatter', () => {
    const result = validateFrontmatter(validFrontmatter());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects null/missing object', () => {
    const result = validateFrontmatter(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('reports each missing required field', () => {
    const result = validateFrontmatter({});
    assert.equal(result.valid, false);
    for (const field of [
      'feature_slug', 'schema_version', 'created_by', 'created_at',
      'status', 'classification', 'last_updated_by', 'last_updated_at'
    ]) {
      assert.ok(
        result.errors.some(e => e.includes(field)),
        `expected error mentioning ${field}; got: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it('rejects invalid slug', () => {
    const result = validateFrontmatter(validFrontmatter({ feature_slug: 'Feature_X' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('feature_slug')));
  });

  it('rejects unsupported schema_version', () => {
    const result = validateFrontmatter(validFrontmatter({ schema_version: '2.0' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('schema_version')));
  });

  it('rejects invalid status', () => {
    const result = validateFrontmatter(validFrontmatter({ status: 'archived' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('status')));
  });

  it('rejects invalid classification', () => {
    const result = validateFrontmatter(validFrontmatter({ classification: 'BIG' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('classification')));
  });

  it('rejects unknown author', () => {
    const result = validateFrontmatter(validFrontmatter({ created_by: 'unknown-agent' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('created_by')));
  });

  it('rejects malformed dates', () => {
    const result = validateFrontmatter(validFrontmatter({ created_at: '2026-04-28' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('created_at')));
  });
});

describe('dossier/schema — assertFrontmatter', () => {
  it('does not throw on valid frontmatter', () => {
    assert.doesNotThrow(() => assertFrontmatter(validFrontmatter()));
  });

  it('throws EDOSSIERSCHEMA on invalid', () => {
    try {
      assertFrontmatter({});
      assert.fail('expected throw');
    } catch (err) {
      assert.equal(err.code, 'EDOSSIERSCHEMA');
      assert.ok(Array.isArray(err.errors) && err.errors.length > 0);
    }
  });
});
