'use strict';

/**
 * The session-start digest shows the decisions standing in two or more
 * projects (`memory.habits`), apart from this project's head and never listed
 * twice; a store with none pays no byte for the field.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-digest-habits-'));
const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

function makeProject(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), [
    '---', `project_name: "${name}"`, 'project_type: "web_app"', 'profile: "developer"', 'framework: "Node"',
    'framework_installed: true', 'classification: "MICRO"', 'interaction_language: "pt-BR"', 'conversation_language: "pt-BR"', '---', ''
  ].join('\n'));
  return dir;
}

function seedStore(home, identity, decisions) {
  const previous = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    // storage.js reads os.homedir() on every call, so the sandbox home applies.
    const { ensureStorageTree } = require('../src/operator-memory/storage');
    const { serializeDecision, decisionPath } = require('../src/operator-memory/decision');
    const { regenerateIndex } = require('../src/operator-memory/index-md');
    ensureStorageTree(identity);
    const now = new Date().toISOString();
    for (const decision of decisions) {
      fs.writeFileSync(decisionPath(identity, decision.slug), serializeDecision({
        signal_type: 'correction', promoted_at: now, last_reinforced: now, reinforcement_count: 1, category: 'default',
        source_agent: 'dev', quotes: ['não faça isso'], body: decision.title, title: decision.title, ...decision
      }));
    }
    regenerateIndex(identity);
  } finally {
    [process.env.HOME, process.env.USERPROFILE] = previous;
  }
}

function digest(home, identity, dir) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_OPERATOR_ID: identity };
  delete env.AIOSON_OPERATOR_MEMORY;
  const res = spawnSync(process.execPath, [CLI, 'context:digest', dir, '--task=ajustar commits', '--json'], { encoding: 'utf8', env });
  assert.equal(res.status, 0, res.stderr);
  return { parsed: JSON.parse(res.stdout), bytes: Buffer.byteLength(res.stdout.trim()) };
}

test('decisions standing in two or more projects head the digest as habits, once', () => {
  const home = fs.mkdtempSync(path.join(ROOT, 'home-'));
  const identity = 'digest-habits-bot';
  const dir = makeProject('habits-app');
  const two = { scope: 'operator', project_sets: [['pa1'], ['pb2']], project_names: ['a', 'b'] };
  seedStore(home, identity, [
    { slug: 'no-emoji-commits', title: 'Mensagens de commit sem emojis', ...two },
    ...[1, 2, 3, 4, 5, 6].map((i) => ({ slug: `habit-${i}`, title: `Hábito ${i} em todo projeto`, ...two })),
    { slug: 'one-project-rule', title: 'Regra de um projeto só', scope: 'operator', project_sets: [['pa1']], project_names: ['a'] }
  ]);
  const { parsed, bytes } = digest(home, identity, dir);
  const habits = Object.keys(parsed.memory.habits);
  assert.equal(habits.length, 5, 'at most five');
  for (const slug of habits) assert.ok(!(slug in parsed.memory.items), `${slug} listed twice`);
  assert.ok(!habits.includes('one-project-rule'), 'one project is no habit');
  assert.ok(bytes <= 3072, `digest is ${bytes} B (budget 3072)`);
});

test('a store with no habit has no habits field', () => {
  const home = fs.mkdtempSync(path.join(ROOT, 'home-'));
  const identity = 'digest-no-habits-bot';
  const dir = makeProject('plain-app');
  seedStore(home, identity, [{ slug: 'local-rule', title: 'Regra local', scope: 'operator', project_sets: [['pa1']], project_names: ['a'] }]);
  const { parsed } = digest(home, identity, dir);
  assert.equal('habits' in parsed.memory, false);
  assert.ok('local-rule' in parsed.memory.items);
});
