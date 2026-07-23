'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { collectSystemFiles } = require('../src/commands/store-system');

test('build packages retain TypeScript server runtime without source or node_modules', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-system-build-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  await fs.mkdir(path.join(dir, 'server'), { recursive: true });
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'node_modules', 'tsx'), { recursive: true });
  await fs.writeFile(path.join(dir, 'server', 'server.ts'), 'export {}', 'utf8');
  await fs.writeFile(path.join(dir, 'src', 'main.ts'), 'export {}', 'utf8');
  await fs.writeFile(path.join(dir, 'node_modules', 'tsx', 'index.js'), 'module.exports = {}', 'utf8');

  const { files } = await collectSystemFiles(dir, { buildMode: true });

  assert.equal(files['server/server.ts'], 'export {}');
  assert.equal(files['src/main.ts'], undefined);
  assert.equal(files['node_modules/tsx/index.js'], undefined);
});
