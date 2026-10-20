'use strict';

// @briefing and @refiner start with `context:search … --json`. Every hit
// repeated the absolute projectDir, carried relPath and path twice and empty
// metadata arrays, and package.must_read duplicated every result in full:
// 18.6 KB / 39.5 KB per call, the refiner's past a host's 30k tool-output cap.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runContextSearch } = require('../src/commands/context-search');

test('context:search --json carries each hit once, without projectDir, duplicate path or empty metadata', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-search-compact-'));
  try {
    await fs.mkdir(path.join(tmp, '.aioson', 'rules'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.aioson', 'rules', 'briefing-sources.md'), [
      '---',
      'description: Briefing sources are pinned with a fingerprint',
      'agents: [briefing, refiner]',
      'triggers: [briefing, sources]',
      '---',
      '# Briefing sources',
      '',
      'Every briefing source is pinned with its fingerprint.'
    ].join('\n'), 'utf8');

    const result = await runContextSearch({
      args: [tmp],
      options: { query: 'briefing sources fingerprint', agent: 'refiner', mode: 'planning', json: true, force: true },
      logger: { log() {} }
    });

    assert.equal(result.ok, true);
    assert.ok(result.results.length > 0);
    const hit = result.results.find((item) => item.relPath === '.aioson/rules/briefing-sources.md');
    assert.ok(hit, JSON.stringify(result.results));
    for (const item of result.results) {
      assert.equal('projectDir' in item, false, 'projectDir repeated the absolute project root on every hit');
      assert.ok(!('path' in item) || item.path !== item.relPath, 'path duplicated relPath');
      for (const value of Object.values(item.metadata || {})) {
        assert.ok(!(Array.isArray(value) && value.length === 0) && value !== '' && value != null, `empty metadata kept: ${JSON.stringify(item.metadata)}`);
      }
    }
    const relPaths = new Set(result.results.map((item) => item.relPath));
    const bucketed = [...result.package.must_read, ...result.package.should_read, ...result.package.maybe];
    assert.ok(bucketed.length > 0);
    for (const ref of bucketed) {
      assert.equal(typeof ref, 'string', 'buckets reference results instead of duplicating them');
      assert.ok(relPaths.has(ref), ref);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
