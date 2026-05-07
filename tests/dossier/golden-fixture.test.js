'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../../src/dossier/store');
const {
  REQUIRED_SECTIONS,
  REQUIRED_FRONTMATTER_FIELDS,
  validateFrontmatter,
  SUPPORTED_SCHEMA_VERSIONS
} = require('../../src/dossier/schema');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'dossier', 'feature-x.dossier.md');

describe('dossier — golden fixture v1.0 (AC-F1-09)', () => {
  it('fixture file is present', () => {
    assert.equal(fs.existsSync(FIXTURE_PATH), true);
  });

  it('frontmatter parses and passes schema validation', () => {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const parsed = store.parseFrontmatter(raw);
    assert.equal(parsed.ok, true, `parser failed: ${parsed.reason}`);

    const result = validateFrontmatter(parsed.data);
    assert.equal(result.valid, true, `schema errors: ${JSON.stringify(result.errors)}`);

    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      assert.ok(parsed.data[field], `frontmatter missing field: ${field}`);
    }
    // Golden fixture exercises v1.0 — must remain readable by the current parser.
    assert.equal(parsed.data.schema_version, '1.0');
    assert.ok(SUPPORTED_SCHEMA_VERSIONS.has(parsed.data.schema_version));
  });

  it('fixture exposes all 6 required sections', () => {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const sections = store.parseSections(raw);
    for (const name of REQUIRED_SECTIONS) {
      assert.ok(name in sections, `fixture missing section: ${name}`);
    }
  });

  it('Code Map block is YAML with empty arrays for v1.0', () => {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const sections = store.parseSections(raw);
    const codeMap = sections['Code Map'];
    assert.match(codeMap, /```yaml[\s\S]*files:\s*\[\][\s\S]*modules:\s*\[\][\s\S]*patterns:\s*\[\][\s\S]*```/);
  });
});
