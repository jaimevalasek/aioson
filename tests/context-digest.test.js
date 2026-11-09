'use strict';

/**
 * Every session started by reading project.context.md in full, running
 * context:validate --json, reading the learnings index and running the
 * operator-memory recall: about 10 KB on a real project before the first
 * answer, most of it read again by the activated agent's kernel. The gateway
 * now points at one compact read, `context:digest`, and it must keep every
 * binding verdict and say how to open what it cut.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-digest-home-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'digest-bot';

const { serializeDecision, decisionPath } = require('../src/operator-memory/decision');
const { ensureStorageTree } = require('../src/operator-memory/storage');
const { regenerateIndex } = require('../src/operator-memory/index-md');
const { buildSessionDigest, ESSENTIAL_FIELDS, MEMORY_TOP } = require('../src/lib/session-digest');
const { validateProjectContextFile } = require('../src/context');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const DAY_MS = 24 * 60 * 60 * 1000;

const CONTEXT = [
  '---',
  'project_name: "Invoices"',
  'project_type: "web_app"',
  'profile: "developer"',
  'framework: "Laravel"',
  'framework_installed: true',
  'classification: "SMALL"',
  'interaction_language: "en"',
  'conversation_language: "en"',
  'design_skill: "interface-design"',
  'test_runner: "pest"',
  'web3_enabled: false',
  'aioson_version: "1.79.0"',
  '---',
  '',
  '# Project context',
  '',
  '## Stack',
  '- Laravel 11, MySQL',
  '',
  '## Services',
  '- Queues: Redis',
  '',
  '## Notes',
  '- Invoices are immutable once sent.',
  ''
].join('\n');

function makeProject(context = CONTEXT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-digest-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'learnings'), { recursive: true });
  if (context !== null) fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), context);
  for (const rule of ['naming.md', 'forms.md', 'README.md']) fs.writeFileSync(path.join(dir, '.aioson', 'rules', rule), `# ${rule}\n`);
  const lessons = Array.from({ length: 10 }, (_, i) => `- \`gotchas/lesson-${i}.md\` — lesson ${i} about the billing export${i === 7 ? ' and the dokploy deploy volume' : ''}.`);
  fs.writeFileSync(path.join(dir, '.aioson', 'learnings', 'INDEX.md'), `# Project learnings\n\n${lessons.join('\n')}\n`);
  return dir;
}

function seedMemory() {
  const identity = 'digest-bot';
  ensureStorageTree(identity);
  const seed = (slug, daysAgo, body, signal = 'authorization') => {
    const at = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
    fs.writeFileSync(decisionPath(identity, slug), serializeDecision({
      slug, signal_type: signal, promoted_at: at, last_reinforced: at, reinforcement_count: 0,
      category: 'default', source_agent: 'dev', quotes: ['q'], body, title: body
    }));
  };
  for (let i = 0; i < 45; i += 1) seed(`fresh-decision-${String(i).padStart(2, '0')}`, i, `Keep the invoice numbering rule number ${i} for every new invoice series`);
  seed('deploy-with-dokploy-volume', 300, 'Deploy with Dokploy and keep the uploads volume mounted');
  regenerateIndex(identity);
}
seedMemory();

const digestOf = (dir, task) => {
  const res = spawnSync(process.execPath, [CLI, 'context:digest', dir, `--task=${task}`, '--json'], { encoding: 'utf8', env: process.env });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim().split('\n').length, 1, 'one compact line');
  return { digest: JSON.parse(res.stdout), bytes: Buffer.byteLength(res.stdout.trim()) };
};

test('the digest is one compact line under 3 KB and keeps every verdict it replaces', async () => {
  const dir = makeProject();
  const { digest, bytes } = digestOf(dir, 'deploy the app with dokploy');
  assert.ok(bytes <= 3072, `digest is ${bytes} B (budget 3072)`);

  const validation = await validateProjectContextFile(dir);
  assert.equal(digest.valid, validation.valid, 'the same validator decides');
  for (const field of ESSENTIAL_FIELDS) assert.equal(digest.project[field], validation.data[field], `${field} carried`);
  assert.deepEqual(digest.project.sections, ['Stack', 'Services', 'Notes'], 'every section of the full file is named');
  assert.match(digest.project.full, /^\.aioson\/context\/project\.context\.md \(\d+ B\): read it when the task touches a listed section/);
  assert.equal(digest.rules, 2, 'Markdown rules counted, README aside');
  assert.match(digest.routing, /\.aioson\/docs\/gateway\/agent-routing\.md/);
});

test('memory: the decision the task names is in, even ranked far below the head, and the rest is counted', () => {
  const dir = makeProject();
  const { digest } = digestOf(dir, 'deploy the app with dokploy');
  const slugs = Object.keys(digest.memory.items);
  assert.ok(slugs.includes('deploy-with-dokploy-volume'), 'a 300-day-old matching decision is shown');
  assert.ok(slugs.includes('fresh-decision-00'), 'the top-ranked head is kept beside the match');
  assert.equal(digest.memory.total, 46);
  assert.match(digest.memory.more, new RegExp(`^${46 - slugs.length} more: aioson op:list \\. --json --titles-only --match=`));
  assert.equal(digest.memory.body, 'aioson op:show <slug>');

  const plain = digestOf(dir, '').digest;
  assert.equal(Object.keys(plain.memory.items).length, MEMORY_TOP, 'no task: the head alone');
  assert.ok(!('deploy-with-dokploy-volume' in plain.memory.items));
});

test('learnings: the lines the task matches are shown, the rest counted with the index path', () => {
  const dir = makeProject();
  const { digest } = digestOf(dir, 'deploy the app with dokploy');
  assert.equal(digest.learnings.total, 10);
  assert.deepEqual(digest.learnings.matched, ['- `gotchas/lesson-7.md` — lesson 7 about the billing export and the dokploy deploy volume.']);
  assert.match(digest.learnings.rest, /read \.aioson\/learnings\/INDEX\.md when the task or files change \(9 line\(s\) not shown\)/);
});

test('learnings: the line sharing the most task words comes first, and a linked line is its link alone', () => {
  const dir = makeProject();
  const description = 'x'.repeat(900);
  const lines = [
    ...Array.from({ length: 8 }, (_, i) => `- [Deploy note ${i}](gotchas/deploy-${i}.md) — ${description}`),
    '1. [The dokploy volume was lost on deploy](gotchas/dokploy-volume.md) — the uploads volume must stay mounted',
    `- ${'plain deploy line without a link '.repeat(8)}end`
  ];
  fs.writeFileSync(path.join(dir, '.aioson', 'learnings', 'INDEX.md'), `# Project learnings\n\n${lines.join('\n')}\n`);
  const { digest, bytes } = digestOf(dir, 'deploy the app with dokploy and its uploads volume');
  assert.equal(digest.learnings.total, 10, 'a numbered line is a line of the index');
  assert.equal(digest.learnings.matched.length, 6);
  assert.equal(digest.learnings.matched[0], '- [The dokploy volume was lost on deploy](gotchas/dokploy-volume.md)', 'four shared words outrank one, wherever the line sits');
  assert.deepEqual(digest.learnings.matched.slice(1), [0, 1, 2, 3, 4].map((i) => `- [Deploy note ${i}](gotchas/deploy-${i}.md)`), 'ties keep the order of the index');
  assert.match(digest.learnings.rest, /\(4 line\(s\) not shown\)/);
  assert.ok(bytes <= 3072, `six matched lessons with 900-char descriptions still fit: ${bytes} B`);

  fs.writeFileSync(path.join(dir, '.aioson', 'learnings', 'INDEX.md'), `# Project learnings\n\n${lines[9]}\n`);
  const [plain] = digestOf(dir, 'deploy').digest.learnings.matched;
  assert.ok(plain.length <= 161 && plain.endsWith('…') && !/\s…$/.test(plain), `a line without a link is cut at a word: ${plain}`);
});

test('rules in subfolders count, and a fenced heading is not a section', () => {
  const dir = makeProject(CONTEXT.replace('## Notes', '```md\n## Not a section\n```\n\n## Notes'));
  fs.mkdirSync(path.join(dir, '.aioson', 'rules', 'backend', '.drafts'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'rules', 'backend', 'queues.md'), '# queues\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'rules', 'backend', 'README.md'), '# readme\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'rules', 'backend', '.drafts', 'draft.md'), '# draft\n');
  const { digest } = digestOf(dir, 'x');
  assert.equal(digest.rules, 3, 'the selector loads rules recursively: the count is the same set');
  assert.deepEqual(digest.project.sections, ['Stack', 'Services', 'Notes']);

  const nested = makeProject();
  for (const rule of ['naming.md', 'forms.md']) fs.rmSync(path.join(nested, '.aioson', 'rules', rule));
  fs.mkdirSync(path.join(nested, '.aioson', 'rules', 'ui'));
  fs.writeFileSync(path.join(nested, '.aioson', 'rules', 'ui', 'forms.md'), '# forms\n');
  assert.equal(digestOf(nested, 'x').digest.rules, 1, 'rules only in a subfolder are still announced');
});

test('an invalid or missing context is a verdict that names setup, never a silent pass', async () => {
  const invalid = await buildSessionDigest(makeProject(CONTEXT.replace('framework: "Laravel"\n', '').replace('classification: "SMALL"\n', 'classification: "HUGE"\n')), { task: 'x' });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.reason, 'invalid_fields');
  assert.ok(invalid.issues.length > 0);
  assert.match(invalid.next, /\/setup \(\.aioson\/agents\/setup\.md\)/);
  assert.equal(invalid.project, undefined, 'no essentials from a contract that failed');

  const missing = await buildSessionDigest(makeProject(null), { task: 'x' });
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, 'missing_file');
});

test('AIOSON_OPERATOR_MEMORY=false keeps memory out', async () => {
  const digest = await buildSessionDigest(makeProject(), { task: 'deploy', env: { AIOSON_OPERATOR_MEMORY: 'false' } });
  assert.deepEqual(digest.memory, { off: true });
});

test('every gateway starts the session at the digest and keeps the setup and validation binding', () => {
  for (const name of ['CLAUDE.md', 'AGENTS.md', 'OPENCODE.md']) {
    const content = fs.readFileSync(path.join(__dirname, '..', 'template', name), 'utf8');
    assert.match(content, /^1\. Run `aioson context:digest \. --task="<task words>" --json` first; validity is its `context:validate` verdict, never eyeballed\./m, name);
    // The request verbatim inside double quotes runs its backticks and $( ) in the shell.
    assert.doesNotMatch(content, /="<(?:request|prompt|message)>"/, `${name}: a flag never takes the raw request`);
    assert.match(content, /Invalid or no CLI: read `\.aioson\/context\/project\.context\.md`; still invalid after an objectively inferable repair, /, name);
    assert.match(content, /`must_load` is binding/, name);
    assert.match(content, /--titles-only --match="<words>"/, name);
    assert.doesNotMatch(content, /Run `aioson op:list --json --titles-only`;/, `${name}: no unconditional 40-title recall`);
  }
});
