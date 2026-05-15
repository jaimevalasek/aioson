'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// Schemas moved from docs/en/schemas/ to docs/en/5-reference/schemas/ in
// commit 20ac2fa (2026-05-07) as part of the docs/en 5-layer restructure
// that mirrors docs/pt. The test wasn't updated alongside the `git mv`.
const SCHEMAS_DIR = path.join(ROOT, 'docs/en/5-reference/schemas');
const INDEX_FILE = path.join(SCHEMAS_DIR, 'index.json');

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

test('json schema index is valid and references existing schema files', async () => {
  const index = await readJson(INDEX_FILE);
  assert.equal(index.schema_version, '1.0.0');
  assert.equal(Array.isArray(index.schemas), true);
  assert.equal(index.schemas.length >= 23, true);

  const expectedIds = new Set([
    'init',
    'install',
    'update',
    'info',
    'agents',
    'agent_prompt',
    'locale_apply',
    'setup_context',
    'i18n_add',
    'doctor',
    'context_validate',
    'smoke',
    'mcp_init',
    'mcp_doctor',
    'parallel_init',
    'package_test',
    'workflow_plan',
    'parallel_assign',
    'parallel_status',
    'parallel_doctor',
    'parallel_merge',
    'parallel_guard',
    'cli_error'
  ]);

  const seen = new Set();
  for (const item of index.schemas) {
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.command, 'string');
    assert.equal(typeof item.file, 'string');
    seen.add(item.id);

    const schemaPath = path.join(SCHEMAS_DIR, item.file);
    await assert.doesNotReject(() => fs.access(schemaPath));
  }

  for (const id of expectedIds) {
    assert.equal(seen.has(id), true, `schema id missing: ${id}`);
  }
});

test('json schema files expose required metadata', async () => {
  const files = await fs.readdir(SCHEMAS_DIR);
  const schemaFiles = files.filter((file) => file.endsWith('.schema.json'));
  assert.equal(schemaFiles.length >= 23, true);

  for (const file of schemaFiles) {
    const schema = await readJson(path.join(SCHEMAS_DIR, file));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(typeof schema.$id, 'string');
    assert.equal(typeof schema.title, 'string');
    assert.equal(schema.type, 'object');
    assert.equal(Array.isArray(schema.required), true);
    assert.equal(schema.required.includes('ok'), true);
  }
});
