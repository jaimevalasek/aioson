'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  loadSkillRegistry,
  resolveSkillCatalog
} = require('../src/skills/registry');

const ROOT = path.resolve(__dirname, '..');
// The registry that ships is the template's: the workspace .aioson/skills/ is
// a local-only sync (gitignored), absent from a fresh checkout such as CI.
const SHIPPED_ROOT = path.join(ROOT, 'template');

test('process skill registry is valid, complete, and references existing tests', async () => {
  const loaded = await loadSkillRegistry(SHIPPED_ROOT);
  assert.equal(loaded.exists, true);
  assert.deepEqual(loaded.issues, []);

  const resolved = await resolveSkillCatalog(SHIPPED_ROOT);
  const processSkills = resolved.catalog.filter((skill) => skill.category === 'process');
  assert.equal(processSkills.length > 0, true);
  assert.equal(processSkills.every((skill) => skill.registry_declared), true);
  assert.equal(resolved.registry.issues.length, 0);

  for (const skill of processSkills.filter((entry) => entry.status === 'active')) {
    assert.equal(skill.owner_agents.length > 0, true, `${skill.id} has an owner`);
    assert.equal(skill.triggers.length > 0, true, `${skill.id} has a trigger`);
    assert.equal(skill.tests.length > 0, true, `${skill.id} has test evidence`);
    for (const testPath of skill.tests) {
      await fs.access(path.join(ROOT, ...testPath.split('/')));
    }
  }
});

test('secure-tdd is risk-triggered by Dev and simplify has an explicit replacement', async () => {
  const { catalog } = await resolveSkillCatalog(SHIPPED_ROOT);
  const secureTdd = catalog.find((skill) => skill.id === 'secure-tdd');
  const simplify = catalog.find((skill) => skill.id === 'simplify');
  const dev = await fs.readFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), 'utf8');

  assert.equal(secureTdd.load_tier, 'risk_triggered');
  assert.deepEqual(secureTdd.owner_agents, ['dev']);
  assert.match(dev, /skills\/process\/secure-tdd\/SKILL\.md/);
  assert.equal(simplify.status, 'deprecated');
  assert.equal(Boolean(simplify.replacement), true);
});

test('registry path typos are reported and cannot replace a discovered skill path by matching ID', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-skill-registry-'));
  try {
    const skillDir = path.join(projectDir, '.aioson', 'skills', 'process', 'demo-skill');
    const registryPath = path.join(projectDir, '.aioson', 'skills', 'registry.json');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: demo-skill\ndescription: Fixture\n---\n'
    );
    await fs.writeFile(registryPath, JSON.stringify({
      version: 1,
      skills: [{
        id: 'demo-skill',
        path: '.aioson/skills/process/typo/SKILL.md',
        owner_agents: ['dev'],
        triggers: ['fixture'],
        tests: ['tests/fixture.test.js'],
        status: 'active'
      }]
    }));

    const resolved = await resolveSkillCatalog(projectDir);
    const skill = resolved.catalog.find((entry) => entry.id === 'demo-skill');
    assert.equal(skill.path, '.aioson/skills/process/demo-skill/SKILL.md');
    assert.equal(skill.registry_declared, false);
    assert.ok(resolved.registry.issues.some((issue) => (
      issue.reason === 'registered_path_missing'
      && issue.path === '.aioson/skills/process/typo/SKILL.md'
    )));
  } finally {
    await fs.rm(projectDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50
    });
  }
});
