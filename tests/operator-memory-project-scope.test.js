'use strict';

/**
 * Operator decisions are scoped to the project they were said in until they are
 * seen in a second project or their quote names every project.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-scope-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'scope-test-bot';

const {
  namesCrossProjectScope,
  normalizeRemoteUrl,
  resolveProjectScope,
  decideScope,
  parseList
} = require('../src/operator-memory/project-scope');
const { readDecision, serializeDecision, decisionPath } = require('../src/operator-memory/decision');
const { captureSignal, readProposal } = require('../src/operator-memory/proposal');
const { ensureStorageTree, getStorageRoot } = require('../src/operator-memory/storage');
const { regenerateIndex } = require('../src/operator-memory/index-md');
const { runOpCapture } = require('../src/commands/op-capture');
const { runOpList } = require('../src/commands/op-list');
const { runOpPromote } = require('../src/commands/op-promote');
const { preflightLoad } = require('../src/operator-memory/loader');

const IDENTITY = 'scope-test-bot';
ensureStorageTree(IDENTITY);

const silent = () => ({ log: () => {}, error: () => {}, warn: () => {} });

function makeCheckout(name, remote) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aioson-scope-${name}-`));
  fs.mkdirSync(path.join(dir, '.git'));
  const config = remote ? `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n` : '[core]\n\tbare = false\n';
  fs.writeFileSync(path.join(dir, '.git', 'config'), config);
  return dir;
}

async function inDir(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

const capture = (dir, options) => inDir(dir, () => runOpCapture({ args: [], options: { json: true, 'source-agent': 'dev', ...options }, logger: silent() }));
const listSlugs = async (dir, options = {}) => {
  const result = await inDir(dir, () => runOpList({ args: [], options: { json: true, 'titles-only': true, ...options }, logger: silent() }));
  return result.items.map((item) => item.slug);
};

test('namesCrossProjectScope: explicit every-project phrasing in pt-BR, en and es', () => {
  for (const text of [
    'em todos os meus projetos use pnpm',
    'vale para qualquer projeto',
    'Em todos os projetos, nunca commite direto na main',
    'faça isso em qualquer projeto',
    'independente do projeto',
    'in all my projects prefer vitest',
    'every project should use conventional commits',
    'across projects, keep the changelog',
    'en todos mis proyectos usa pnpm'
  ]) {
    assert.equal(namesCrossProjectScope(text), true, text);
  }
});

test('namesCrossProjectScope: bare "sempre"/"always" and whole-project phrasing stay local', () => {
  for (const text of [
    'sempre use pnpm',
    'nunca commite sem rodar os testes',
    'use semicolons everywhere',
    'refatore todo o projeto',
    'rode todos os testes do projeto',
    'update all the project files',
    'always run the linter'
  ]) {
    assert.equal(namesCrossProjectScope(text), false, text);
  }
});

test('namesCrossProjectScope: mentioning other projects by contrast or distribution does not widen', () => {
  // These say the opposite of "everywhere": widening on them would leak a local
  // rule into every project. Staying local is the recoverable side.
  for (const text of [
    'diferente dos outros projetos, aqui usamos tabs',
    'unlike other projects, this one uses tabs',
    'each project has its own config, here we keep it in .env',
    'cada projeto tem sua config; aqui fica no .env',
    'en otros proyectos uso npm, aquí pnpm',
    'cada proyecto tiene su propio lint'
  ]) {
    assert.equal(namesCrossProjectScope(text), false, text);
  }
});

test('normalizeRemoteUrl strips scheme, credentials, port and .git; refuses local paths', () => {
  assert.equal(normalizeRemoteUrl('https://user:p%40ss@github.com:443/Acme/API.git'), 'github.com/acme/api');
  assert.equal(normalizeRemoteUrl('git@github.com:Acme/API.git'), 'github.com/acme/api');
  assert.equal(normalizeRemoteUrl('ssh://git@gitlab.example.com/group/sub/repo/'), 'gitlab.example.com/group/sub/repo');
  assert.equal(normalizeRemoteUrl('C:/repos/api'), null);
  assert.equal(normalizeRemoteUrl('file:///srv/git/api.git'), null);
  assert.equal(normalizeRemoteUrl('/srv/git/api.git'), null);
});

test('resolveProjectScope: two checkouts of one remote are one project; a worktree follows its main checkout', () => {
  const a = makeCheckout('a', 'https://github.com/acme/api.git');
  const b = makeCheckout('b', 'git@github.com:Acme/api.git');
  const c = makeCheckout('c', 'https://github.com/acme/web.git');
  assert.equal(resolveProjectScope(a).key, resolveProjectScope(b).key);
  assert.notEqual(resolveProjectScope(a).key, resolveProjectScope(c).key);
  assert.equal(resolveProjectScope(a).name, 'api');

  const worktreeGitDir = path.join(a, '.git', 'worktrees', 'wt');
  fs.mkdirSync(worktreeGitDir, { recursive: true });
  fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n');
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-scope-wt-'));
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${worktreeGitDir}\n`);
  assert.equal(resolveProjectScope(wt).key, resolveProjectScope(a).key);

  const local = makeCheckout('local', null);
  const scope = resolveProjectScope(local);
  assert.equal(scope.source, 'path');
  assert.match(scope.key, /^p[0-9a-f]{16}$/, 'the key can never parse as a number');
});

test('decideScope: breadth counts distinct projects; a requested project scope needs a known project', () => {
  assert.equal(decideScope({ projectKeys: ['p1'] }), 'project');
  assert.equal(decideScope({ projectKeys: ['p1', 'p2'] }), 'operator');
  assert.equal(decideScope({ projectKeys: ['p1'], explicit: true }), 'operator');
  assert.equal(decideScope({ projectKeys: [] }), 'operator');
  assert.equal(decideScope({ projectKeys: [], requested: 'project' }), 'operator');
  assert.equal(decideScope({ projectKeys: ['p1', 'p2'], requested: 'project' }), 'project');
});

test('a correction said in one project binds only there until a second project repeats it', async () => {
  const api = makeCheckout('api', 'https://github.com/acme/api.git');
  const web = makeCheckout('web', 'https://github.com/acme/web.git');

  const first = await capture(api, { signal: 'correction', quote: 'aqui não use Tailwind', proposal: 'nao usar tailwind neste frontend' });
  assert.equal(first.promoted, true);
  assert.equal(first.scope, 'project');
  const slug = first.slug;
  assert.equal(readDecision(IDENTITY, slug).scope, 'project');

  assert.ok((await listSlugs(api)).includes(slug), 'visible where it was said');
  assert.ok(!(await listSlugs(web)).includes(slug), 'hidden in another project');
  assert.ok((await listSlugs(web, { all: true })).includes(slug), '--all lists every project');

  const index = fs.readFileSync(path.join(getStorageRoot(IDENTITY), 'MEMORY.md'), 'utf8');
  assert.match(index, new RegExp(`decisions/${slug}\\.md\\) — correction, reinforced \\S+ — only in project api`));

  const again = await capture(api, { signal: 'correction', quote: 'de novo: sem Tailwind', proposal: 'nao usar tailwind neste frontend' });
  assert.equal(again.reinforced, true);
  assert.equal(again.scope, 'project', 'repetition inside one project is not breadth');

  const second = await capture(web, { signal: 'correction', quote: 'sem Tailwind aqui também', proposal: 'nao usar tailwind neste frontend' });
  assert.equal(second.reinforced, true);
  assert.equal(second.scope, 'operator');
  assert.ok((await listSlugs(web)).includes(slug), 'widened decisions apply everywhere');
  const widened = readDecision(IDENTITY, slug);
  assert.equal(widened.scope, 'operator');
  assert.equal(widened.projects.split(',').length, 2);
});

test('a quote that names every project is operator-wide on its first promotion', async () => {
  const api = makeCheckout('api2', 'https://github.com/acme/api2.git');
  const result = await capture(api, { signal: 'authorization', quote: 'em todos os meus projetos pode commitar sem perguntar', proposal: 'commit autonomo em qualquer repo apos aprovacao' });
  assert.equal(result.promoted, true);
  assert.equal(result.scope, 'operator');
});

test('confirmations detected once in each of two projects promote operator-wide', async () => {
  const one = makeCheckout('one', 'https://github.com/acme/one.git');
  const two = makeCheckout('two', 'https://github.com/acme/two.git');
  const proposal = 'preferir node test runner nativo';
  const first = await capture(one, { signal: 'confirmation', quote: 'isso, node --test', proposal });
  assert.equal(first.promoted, false);
  const second = await capture(two, { signal: 'confirmation', quote: 'de novo node --test', proposal });
  assert.equal(second.promoted, true);
  assert.equal(second.scope, 'operator');
});

test('--scope=operator promotes operator-wide; an invalid --scope is refused', async () => {
  const api = makeCheckout('api3', 'https://github.com/acme/api3.git');
  const explicit = await capture(api, { signal: 'exclusion', quote: 'nunca use yarn', proposal: 'nunca usar yarn como gerenciador', scope: 'operator' });
  assert.equal(explicit.scope, 'operator');
  const refused = await capture(api, { signal: 'exclusion', quote: 'x', proposal: 'qualquer coisa', scope: 'global' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /invalid --scope/);
});

test('a decision written before scoping (no scope field) stays visible in every project', async () => {
  const slug = 'legacy-unscoped-decision';
  const now = new Date().toISOString();
  fs.writeFileSync(decisionPath(IDENTITY, slug), serializeDecision({
    slug, signal_type: 'authorization', promoted_at: now, last_reinforced: now, reinforcement_count: 0,
    category: 'autonomy', source_agent: 'dev', quotes: ['pode'], body: 'legacy decision', title: 'legacy decision'
  }));
  regenerateIndex(IDENTITY);
  const elsewhere = makeCheckout('elsewhere', 'https://github.com/acme/elsewhere.git');
  assert.ok((await listSlugs(elsewhere)).includes(slug));
  assert.equal(readDecision(IDENTITY, slug).scope, undefined);
});

test('preflightLoad for a project root leaves out decisions scoped to another project', async () => {
  const api = makeCheckout('api5', 'https://github.com/acme/api5.git');
  const web = makeCheckout('web5', 'https://github.com/acme/web5.git');
  const local = await capture(api, { signal: 'correction', quote: 'aqui nada de styled-components', proposal: 'nao usar styled-components neste frontend' });
  assert.equal(local.scope, 'project');
  const task = 'migrar o frontend para fora de styled-components';
  const inApi = preflightLoad(IDENTITY, task, { projectRoot: api, detectConflicts: false });
  assert.ok(inApi.matches.some((m) => m.slug === local.slug), 'matched where it was said');
  const inWeb = preflightLoad(IDENTITY, task, { projectRoot: web, detectConflicts: false });
  assert.ok(!inWeb.matches.some((m) => m.slug === local.slug), 'left out in another project');
  const anywhere = preflightLoad(IDENTITY, task, { detectConflicts: false });
  assert.ok(anywhere.matches.some((m) => m.slug === local.slug), 'no project given: every decision, as before');
});

test('op:promote --scope=project binds a proposal captured before projects were recorded to the current project', async () => {
  const api = makeCheckout('api4', 'https://github.com/acme/api4.git');
  const web = makeCheckout('web4', 'https://github.com/acme/web4.git');
  const slug = 'legacy-proposal-without-projects';
  captureSignal({ identity: IDENTITY, slug, signal_type: 'exclusion', quote: 'sem yarn', proposal: 'nunca usar yarn aqui', source_agent: 'dev' });
  assert.equal(parseList(readProposal(IDENTITY, slug).projects).length, 0, 'the proposal names no project');

  const promoted = await inDir(api, () => runOpPromote({ args: [slug], options: { json: true, scope: 'project' }, logger: silent() }));
  assert.equal(promoted.ok, true, promoted.error);
  assert.equal(promoted.scope, 'project', 'never downgraded to operator in silence');
  assert.equal(readDecision(IDENTITY, slug).projects, resolveProjectScope(api).key);
  assert.ok((await listSlugs(api)).includes(slug), 'visible where it was promoted');
  assert.ok(!(await listSlugs(web)).includes(slug), 'hidden elsewhere');
});
