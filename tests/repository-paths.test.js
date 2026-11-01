'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { loadRepositoryPathPolicy } = require('../src/lib/repository-paths');

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-repository-paths-'));
  const project = path.join(workspace, 'play');
  const cloud = path.join(workspace, 'cloud');
  const other = path.join(workspace, 'cloud-other');
  for (const root of [project, cloud, other]) await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(project, '.aioson'));
  await fs.writeFile(path.join(cloud, 'src/api.js'), 'module.exports = true;');
  const configure = (roots) => fs.writeFile(path.join(project, '.aioson/repository-roots.json'), JSON.stringify({ version: 1, roots }));
  return { project, cloud, other, configure };
}

test('external paths require an explicit project-owned root and keep exact file states', async () => {
  const { project, cloud, configure } = await fixture();
  let policy = await loadRepositoryPathPolicy(project);
  assert.equal((await policy.inspect('../cloud/src/api.js')).safe, false);
  await configure(['../cloud']);
  policy = await loadRepositoryPathPolicy(project);
  assert.deepEqual(policy.issues, []);
  const existing = await policy.inspect('../cloud/src/api.js');
  assert.equal(existing.safe, true);
  assert.equal(existing.exists, true);
  assert.ok(existing.stat.isFile());
  assert.deepEqual(await policy.inspect('../cloud/src/new/deep/api.js'), { safe: true, exists: false });
  assert.equal((await policy.inspect('src/local.js')).safe, true);
  for (const candidate of ['../cloud-other/src/api.js', '../cloud/../../outside.js', '../cloud', cloud, 'C:relative.js', 'C:\\outside.js', '\\\\host\\share\\file.js']) {
    assert.equal((await policy.inspect(candidate)).safe, false, candidate);
  }
});

test('invalid declarations fail closed, including ancestors and missing roots', async () => {
  const { project, configure } = await fixture();
  for (const roots of [['..'], ['../missing'], [42], [''], ['/']]) {
    await configure(roots);
    const policy = await loadRepositoryPathPolicy(project);
    assert.equal(policy.issues[0]?.check, 'repository_roots_invalid');
    assert.equal((await policy.inspect('src/local.js')).safe, false);
  }
  await fs.writeFile(path.join(project, '.aioson/repository-roots.json'), '{bad json');
  assert.equal((await loadRepositoryPathPolicy(project)).issues[0]?.check, 'repository_roots_invalid');
});

test('realpath containment protects existing files and missing create paths through links', async () => {
  const { project, cloud, other, configure } = await fixture();
  await configure(['../cloud']);
  await fs.writeFile(path.join(other, 'src/api.js'), 'outside');
  await fs.symlink(path.join(other, 'src'), path.join(cloud, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const policy = await loadRepositoryPathPolicy(project);
  assert.equal((await policy.inspect('../cloud/escape/api.js')).safe, false);
  assert.equal((await policy.inspect('../cloud/escape/missing/nested.js')).safe, false);
  await fs.symlink(path.join(cloud, 'missing'), path.join(cloud, 'dangling'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await policy.inspect('../cloud/dangling/new.js')).safe, false);
  await fs.writeFile(path.join(cloud, 'src/not-a-directory'), 'file');
  assert.equal((await policy.inspect('../cloud/src/not-a-directory/new.js')).safe, false);
});
