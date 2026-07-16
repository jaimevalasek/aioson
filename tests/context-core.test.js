'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  parseYamlFrontmatter,
  validateContextData,
  validateProjectContextFile,
  isValidLanguageTag,
  normalizeLanguageTag,
  getInteractionLanguage
} = require('../src/context');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

describe('context.js — parseYamlFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const md = '---\nproject_name: aioson\nclassification: MEDIUM\nframework_installed: true\n---\n# Content';
    const result = parseYamlFrontmatter(md);
    assert.equal(result.ok, true);
    assert.equal(result.data.project_name, 'aioson');
    assert.equal(result.data.classification, 'MEDIUM');
    assert.equal(result.data.framework_installed, true);
  });

  it('parses frontmatter with quoted strings', () => {
    const md = '---\nproject_name: "aioson"\nclassification: \'MEDIUM\'\n---\n';
    const result = parseYamlFrontmatter(md);
    assert.equal(result.data.project_name, 'aioson');
    assert.equal(result.data.classification, 'MEDIUM');
  });

  it('rejects missing frontmatter', () => {
    const result = parseYamlFrontmatter('# No frontmatter\n');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_frontmatter');
  });

  it('rejects unclosed frontmatter', () => {
    const result = parseYamlFrontmatter('---\nproject_name: test\n');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unclosed_frontmatter');
  });

  it('rejects invalid frontmatter line', () => {
    const md = '---\nproject_name: test\ninvalid line without colon\n---\n';
    const result = parseYamlFrontmatter(md);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_frontmatter_line');
    assert.equal(result.line, 'invalid line without colon');
  });

  it('ignores comments and blank lines in frontmatter', () => {
    const md = '---\n# comment\nproject_name: test\n\nclassification: SMALL\n---\n';
    const result = parseYamlFrontmatter(md);
    assert.equal(result.ok, true);
    assert.equal(result.data.project_name, 'test');
    assert.equal(result.data.classification, 'SMALL');
  });

  it('handles CRLF line endings', () => {
    const md = '---\r\nproject_name: test\r\n---\r\n';
    const result = parseYamlFrontmatter(md);
    assert.equal(result.ok, true);
    assert.equal(result.data.project_name, 'test');
  });
});

describe('context.js — validateContextData', () => {
  it('returns no issues for valid complete data', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MEDIUM',
      conversation_language: 'pt-BR',
      aioson_version: '1.7.2'
    };
    const issues = validateContextData(data);
    assert.equal(issues.length, 0);
  });

  it('reports missing required fields', () => {
    const data = { project_name: 'test' };
    const issues = validateContextData(data);
    assert.ok(issues.length > 0);
    assert.ok(issues.some((i) => i.id === 'context:missing:classification'));
    assert.ok(issues.some((i) => i.id === 'context:missing:aioson_version'));
  });

  it('reports invalid classification', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'HUGE',
      conversation_language: 'en',
      aioson_version: '1.0'
    };
    const issues = validateContextData(data);
    assert.ok(issues.some((i) => i.id === 'context:classification:value'));
  });

  it('reports invalid project_type', () => {
    const data = {
      project_name: 'test',
      project_type: 'unknown_type',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      conversation_language: 'en',
      aioson_version: '1.0'
    };
    const issues = validateContextData(data);
    assert.ok(issues.some((i) => i.id === 'context:project_type:value'));
  });

  it('reports invalid profile', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'admin',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      conversation_language: 'en',
      aioson_version: '1.0'
    };
    const issues = validateContextData(data);
    assert.ok(issues.some((i) => i.id === 'context:profile:value'));
  });

  it('reports invalid framework_installed type', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: 'yes',
      classification: 'MICRO',
      conversation_language: 'en',
      aioson_version: '1.0'
    };
    const issues = validateContextData(data);
    assert.ok(issues.some((i) => i.id === 'context:framework_installed:type'));
  });

  it('reports invalid language tags', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      conversation_language: 'not_a_language!!!',
      interaction_language: 'also-invalid@123',
      aioson_version: '1.0'
    };
    const issues = validateContextData(data);
    assert.ok(issues.some((i) => i.id === 'context:conversation_language:format'));
    assert.ok(issues.some((i) => i.id === 'context:interaction_language:format'));
  });

  it('accepts the primary interaction language without requiring the legacy alias', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      interaction_language: 'pt-BR',
      aioson_version: '1.0'
    };

    assert.deepEqual(validateContextData(data), []);
  });

  it('keeps conversation_language as a valid legacy fallback', () => {
    const data = {
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      conversation_language: 'pt-BR',
      aioson_version: '1.0'
    };

    assert.deepEqual(validateContextData(data), []);
  });

  it('requires at least one interaction-language field', () => {
    const issues = validateContextData({
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      aioson_version: '1.0'
    });

    assert.ok(issues.some((issue) => issue.id === 'context:missing:interaction_language'));
  });

  it('rejects drift between primary and legacy language fields', () => {
    const issues = validateContextData({
      project_name: 'test',
      project_type: 'script',
      profile: 'developer',
      framework: 'Node.js',
      framework_installed: true,
      classification: 'MICRO',
      interaction_language: 'fr',
      conversation_language: 'pt-BR',
      aioson_version: '1.0'
    });

    assert.ok(issues.some((issue) => issue.id === 'context:language:mismatch'));
  });
});

describe('context.js — Language utilities', () => {
  it('isValidLanguageTag accepts valid BCP-47 tags', () => {
    assert.equal(isValidLanguageTag('en'), true);
    assert.equal(isValidLanguageTag('pt-BR'), true);
    assert.equal(isValidLanguageTag('zh-Hans-CN'), true);
    assert.equal(isValidLanguageTag('x'), false);
    assert.equal(isValidLanguageTag('123'), false);
    assert.equal(isValidLanguageTag(''), false);
  });

  it('normalizeLanguageTag returns fallback for invalid tags', () => {
    assert.equal(normalizeLanguageTag('pt-BR', 'en'), 'pt-BR');
    assert.equal(normalizeLanguageTag('invalid!!!', 'en'), 'en');
    assert.equal(normalizeLanguageTag('', 'fr'), 'fr');
    assert.equal(normalizeLanguageTag(null, 'es'), 'es');
  });

  it('normalizeLanguageTag converts underscores to hyphens', () => {
    assert.equal(normalizeLanguageTag('pt_BR'), 'pt-BR');
  });

  it('getInteractionLanguage prefers interaction_language over conversation_language', () => {
    assert.equal(getInteractionLanguage({ interaction_language: 'fr', conversation_language: 'pt-BR' }), 'fr');
    assert.equal(getInteractionLanguage({ conversation_language: 'pt-BR' }), 'pt-BR');
    assert.equal(getInteractionLanguage({}), 'en');
    assert.equal(getInteractionLanguage(null, 'es'), 'es');
  });
});

describe('context.js — validateProjectContextFile (filesystem)', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-test-'));
    await ensureDir(path.join(tmpDir, '.aioson', 'context'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns not exists when file is missing', async () => {
    const result = await validateProjectContextFile(tmpDir);
    assert.equal(result.exists, false);
    assert.equal(result.valid, false);
    assert.equal(result.data, null);
  });

  it('validates a correct project.context.md', async () => {
    const content = `---
project_name: test
project_type: script
profile: developer
framework: Node.js
framework_installed: true
classification: MEDIUM
conversation_language: en
aioson_version: 1.0.0
---
`;
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'project.context.md'), content);
    const result = await validateProjectContextFile(tmpDir);
    assert.equal(result.exists, true);
    assert.equal(result.parsed, true);
    assert.equal(result.valid, true);
    assert.equal(result.data.project_name, 'test');
    assert.equal(result.data.classification, 'MEDIUM');
    assert.equal(result.issues.length, 0);
  });

  it('returns invalid for malformed frontmatter', async () => {
    const content = `---
unclosed frontmatter
`;
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'project.context.md'), content);
    const result = await validateProjectContextFile(tmpDir);
    assert.equal(result.exists, true);
    assert.equal(result.parsed, false);
    assert.equal(result.valid, false);
    assert.equal(result.parseError, 'unclosed_frontmatter');
  });

  it('returns issues for missing required fields', async () => {
    const content = `---
project_name: test
---
`;
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'project.context.md'), content);
    const result = await validateProjectContextFile(tmpDir);
    assert.equal(result.exists, true);
    assert.equal(result.parsed, true);
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.some((i) => i.id === 'context:missing:classification'));
  });
});
