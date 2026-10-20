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

const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  namesCrossProjectScope,
  normalizeRemoteUrl,
  configValue,
  resolveProjectScope,
  decideScope,
  parseList,
  projectSets
} = require('../src/operator-memory/project-scope');
const { deriveSlug } = require('../src/operator-memory/slug');
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
  assert.equal(projectSets(widened).length, 2, 'two disjoint identity sets: two projects');
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
  assert.ok(parseList(readDecision(IDENTITY, slug).projects).includes(resolveProjectScope(api).key));
  assert.ok((await listSlugs(api)).includes(slug), 'visible where it was promoted');
  assert.ok(!(await listSlugs(web)).includes(slug), 'hidden elsewhere');
});

// ─── identity sets: one project under several names ───

const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-scope-sets-'));
const remotesConfig = (remotes) => Object.entries(remotes).map(([name, url]) => `[remote "${name}"]\n\turl = ${url}\n`).join('');
const hashKey = (identity) => `p${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;

function makeProject(parent, name, gitConfig) {
  const dir = path.join(parent, name);
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# config\n');
  if (typeof gitConfig === 'string') {
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'config'), gitConfig);
  }
  return dir;
}

async function withHome(home, fn) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('namesCrossProjectScope: a negation, a distributive possessive or a here-word keeps a marker local', () => {
  for (const text of [
    'isso não vale para todos os projetos',
    'isso não vale para todos os projetos, só aqui',
    'nem todos os projetos usam Tailwind; este não usa',
    'this does not apply to every project',
    'this does not apply to every project, only this one',
    'not in all my projects — just this repo',
    'every project has its own lint config',
    'every project has its own lint config; here we use eslint',
    'todo projeto tem sua config',
    'todo projeto tem sua config; aqui fica no .env',
    'diferente de todos os projetos que tenho, aqui usamos tabs',
    'in all the projects I use npm, but here use pnpm',
    'no en todos los proyectos',
    'no en todos los proyectos, solo en este',
    'unlike any project I have, this one uses tabs',
    'qualquer projeto que eu abrir com docker... não, só este'
  ]) {
    assert.equal(namesCrossProjectScope(text), false, text);
  }
  // A negated action is still a scope.
  for (const text of ['nunca use yarn em qualquer projeto', 'não use yarn, em todos os projetos', 'never push to main in any repo']) {
    assert.equal(namesCrossProjectScope(text), true, text);
  }
});

test('only the user\'s words name the scope: a paraphrase that says "any repo" stays project-scoped', async () => {
  const dir = makeCheckout('paraphrase', 'https://github.com/acme/paraphrase.git');
  const result = await capture(dir, { signal: 'exclusion', quote: 'nunca dê push na main sem eu aprovar', proposal: 'never push to main in any repo without approval' });
  assert.equal(result.promoted, true);
  assert.equal(result.scope, 'project');
});

test('normalizeRemoteUrl: one repository through every door, never a query or a fragment', () => {
  assert.equal(normalizeRemoteUrl('https://www.github.com/Acme/API'), 'github.com/acme/api');
  assert.equal(normalizeRemoteUrl('ssh://git@ssh.github.com:443/acme/api.git'), 'github.com/acme/api');
  for (const url of [
    'https://dev.azure.com/Org/Proj/_git/Repo',
    'https://org@dev.azure.com/org/proj/_git/repo',
    'git@ssh.dev.azure.com:v3/org/proj/repo',
    'https://org.visualstudio.com/proj/_git/repo',
    'https://org.visualstudio.com/DefaultCollection/proj/_git/repo',
    'org@vs-ssh.visualstudio.com:v3/org/proj/repo'
  ]) {
    assert.equal(normalizeRemoteUrl(url), 'dev.azure.com/org/proj/repo', url);
  }
  assert.equal(normalizeRemoteUrl('https://gitlab.example.com/group/repo.git?private_token=glpat-SECRET#readme'), 'gitlab.example.com/group/repo');
  assert.equal(configValue('"git@github.com:acme/api.git"'), 'git@github.com:acme/api.git');
  assert.equal(configValue('https://github.com/acme/api.git # mirror'), 'https://github.com/acme/api.git');
  assert.equal(configValue('https://github.com/acme/api.git ; old one'), 'https://github.com/acme/api.git');
});

test('resolveProjectScope: a quoted or commented url is the same project, and no token reaches the display name', () => {
  const box = sandbox();
  const plain = makeProject(box, 'plain', remotesConfig({ origin: 'https://github.com/acme/quoted.git' }));
  const quoted = makeProject(box, 'quoted', remotesConfig({ origin: '"git@github.com:acme/quoted.git"' }));
  const commented = makeProject(box, 'commented', remotesConfig({ origin: 'https://github.com/acme/quoted.git # mirror' }));
  assert.equal(resolveProjectScope(quoted).key, resolveProjectScope(plain).key);
  assert.equal(resolveProjectScope(commented).key, resolveProjectScope(plain).key);
  const tokened = makeProject(box, 'tokened', remotesConfig({ origin: 'https://gitlab.example.com/group/repo.git?private_token=glpat-SECRET123' }));
  assert.equal(resolveProjectScope(tokened).name, 'repo');
});

test('resolveProjectScope: upstream never identifies a project; the only own remote does', () => {
  const box = sandbox();
  const starter = 'https://github.com/acme/starter.git';
  const a = makeProject(box, 'client-a', remotesConfig({ origin: 'git@github.com:me/client-a.git', upstream: starter }));
  const b = makeProject(box, 'client-b', remotesConfig({ origin: 'git@github.com:me/client-b.git', upstream: starter }));
  assert.notEqual(resolveProjectScope(a).key, resolveProjectScope(b).key, 'two clients of one starter are two projects');
  assert.equal(resolveProjectScope(a).name, 'client-a');
  const lone = makeProject(box, 'lone', remotesConfig({ github: 'git@github.com:me/lone.git' }));
  assert.equal(resolveProjectScope(lone).source, 'remote');
  assert.equal(resolveProjectScope(lone).name, 'lone');
  assert.equal(resolveProjectScope(makeProject(box, 'from-starter', remotesConfig({ upstream: starter }))).source, 'path');
  const twoForeign = makeProject(box, 'two', remotesConfig({ github: 'git@github.com:me/two.git', gitlab: 'git@gitlab.com:me/two.git' }));
  assert.equal(resolveProjectScope(twoForeign).source, 'path');
});

test('resolveProjectScope: the walk stops at the home directory, and two projects of one repository stay two', async () => {
  const box = sandbox();
  const home = path.join(box, 'home');
  fs.mkdirSync(path.join(home, '.git'), { recursive: true });
  fs.writeFileSync(path.join(home, '.git', 'config'), remotesConfig({ origin: 'git@github.com:me/dotfiles.git' }));
  const x = makeProject(home, 'proj-x', null);
  const y = makeProject(home, 'proj-y', null);
  await withHome(home, () => {
    assert.equal(resolveProjectScope(x).source, 'path', 'a home versioned as dotfiles is not this project');
    assert.notEqual(resolveProjectScope(x).key, resolveProjectScope(y).key);
  });
  const mono = path.join(box, 'mono');
  fs.mkdirSync(path.join(mono, '.git'), { recursive: true });
  fs.writeFileSync(path.join(mono, '.git', 'config'), remotesConfig({ origin: 'git@github.com:acme/mono.git' }));
  const api = makeProject(path.join(mono, 'packages'), 'api', null);
  const web = makeProject(path.join(mono, 'packages'), 'web', null);
  assert.equal(resolveProjectScope(api).source, 'remote');
  assert.notEqual(resolveProjectScope(api).key, resolveProjectScope(web).key, 'the path inside the repository joins its identity');
  assert.equal(resolveProjectScope(api).name, 'api');
});

test('a decision said before the first remote still applies after it, and repeating it there is not breadth', async () => {
  const box = sandbox();
  const fresh = makeProject(box, 'fresh', '[core]\n\tbare = false\n');
  const other = makeCheckout('other-fresh', 'https://github.com/acme/other-fresh.git');
  const proposal = 'nao usar tailwind neste app novo';
  const first = await capture(fresh, { signal: 'correction', quote: 'aqui não use Tailwind', proposal });
  assert.equal(first.scope, 'project');
  fs.writeFileSync(path.join(fresh, '.git', 'config'), `[core]\n\tbare = false\n${remotesConfig({ origin: 'git@github.com:me/fresh.git' })}`);
  assert.ok((await listSlugs(fresh)).includes(first.slug), 'still applies where it was said');
  const again = await capture(fresh, { signal: 'correction', quote: 'de novo: sem Tailwind', proposal });
  assert.equal(again.scope, 'project', 'one project under two names is not breadth');
  assert.equal(projectSets(readDecision(IDENTITY, first.slug)).length, 1);
  assert.ok(!(await listSlugs(other)).includes(first.slug), 'never reaches another project');
});

test('adding an upstream remote keeps the project identity', async () => {
  const box = sandbox();
  const fork = makeProject(box, 'fork', remotesConfig({ origin: 'git@github.com:me/lib.git' }));
  const before = resolveProjectScope(fork).key;
  const decided = await capture(fork, { signal: 'exclusion', quote: 'nunca rode o deploy aqui', proposal: 'nunca rodar deploy neste fork' });
  fs.writeFileSync(path.join(fork, '.git', 'config'), remotesConfig({ origin: 'git@github.com:me/lib.git', upstream: 'https://github.com/org/lib.git' }));
  assert.equal(resolveProjectScope(fork).key, before);
  assert.ok((await listSlugs(fork)).includes(decided.slug));
});

test('a worktree of a repository without a remote is the same project as its main checkout', async () => {
  const box = sandbox();
  const main = makeProject(box, 'main', '[core]\n\tbare = false\n');
  const gitDir = path.join(main, '.git', 'worktrees', 'wt');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'commondir'), '../..\n');
  const wt = makeProject(box, 'wt', null);
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gitDir}\n`);
  assert.equal(resolveProjectScope(wt).key, resolveProjectScope(main).key);
  const proposal = 'sem orm neste repositorio local';
  const first = await capture(main, { signal: 'correction', quote: 'aqui sem ORM', proposal });
  const again = await capture(wt, { signal: 'correction', quote: 'aqui sem ORM', proposal });
  assert.equal(again.scope, 'project');
  assert.ok((await listSlugs(wt)).includes(first.slug));
});

test('a decision recorded before identity sets reads back unchanged and keeps matching where it was said', async () => {
  const box = sandbox();
  const writeLegacy = (proposal, projects, name) => {
    const slug = deriveSlug(proposal);
    const now = new Date().toISOString();
    const text = [
      '---', `slug: ${slug}`, 'signal_type: exclusion', `promoted_at: ${now}`, `last_reinforced: ${now}`,
      'reinforcement_count: 0', 'superseded_by: null', 'category: default', 'source_agent: dev',
      'quotes:', "  - 'nunca rode isso aqui'", 'version_schema: "1.0"', 'deprecated_by: null',
      'scope: project', `projects: '${projects}'`, `project_names: '${name}'`, '---', '',
      `# ${proposal}`, '', proposal, '', '## Trigger quotes', '- "nunca rode isso aqui"', ''
    ].join('\n');
    fs.writeFileSync(decisionPath(IDENTITY, slug), text);
    regenerateIndex(IDENTITY);
    return { slug, text };
  };
  const unrelated = makeCheckout('legacy-unrelated', 'https://github.com/acme/legacy-unrelated.git');

  // Keyed then by `upstream` first, one key per project.
  const fork = makeProject(box, 'legacy-fork', remotesConfig({ origin: 'git@github.com:me/legacy-lib.git', upstream: 'https://github.com/org/legacy-lib.git' }));
  const legacyKey = hashKey('remote:github.com/org/legacy-lib');
  const proposal = 'nunca rodar migrations destrutivas neste fork';
  const { slug, text } = writeLegacy(proposal, legacyKey, 'legacy-lib');
  const read = readDecision(IDENTITY, slug);
  assert.equal(read.scope, 'project');
  assert.equal(read.projects, legacyKey);
  assert.equal(read.project_sets, undefined);
  assert.equal(fs.readFileSync(decisionPath(IDENTITY, slug), 'utf8'), text, 'reading never rewrites the file');
  assert.ok((await listSlugs(fork)).includes(slug), 'the legacy key still matches its checkout');
  assert.ok(!(await listSlugs(unrelated)).includes(slug));
  const again = await capture(fork, { signal: 'exclusion', quote: 'de novo: nada de migration destrutiva', proposal });
  assert.equal(again.reinforced, true);
  assert.equal(again.scope, 'project', 'migrated on re-detection, never counted as breadth');
  const sets = projectSets(readDecision(IDENTITY, slug));
  assert.equal(sets.length, 1);
  assert.ok(sets[0].includes(legacyKey) && sets[0].includes(resolveProjectScope(fork).key));

  // Keyed then by its path.
  const local = makeProject(box, 'legacy-local', '[core]\n');
  const folded = path.resolve(local).replace(/\\/g, '/');
  const pathKey = hashKey(`path:${process.platform === 'win32' ? folded.toLowerCase() : folded}`);
  const byPath = writeLegacy('nunca usar docker neste projeto local', pathKey, 'legacy-local');
  assert.ok((await listSlugs(local)).includes(byPath.slug));
  assert.ok(!(await listSlugs(unrelated)).includes(byPath.slug));
});

test('a multi-line verbatim quote is kept on one line and the decision keeps its scope', async () => {
  const dir = makeCheckout('multiline', 'https://github.com/acme/multiline.git');
  const elsewhere = makeCheckout('multiline-else', 'https://github.com/acme/multiline-else.git');
  const result = await capture(dir, { signal: 'correction', quote: 'Neste repo:\n---\nnão use Tailwind, use CSS modules', proposal: 'css modules em vez de tailwind\nneste repo' });
  const decision = readDecision(IDENTITY, result.slug);
  assert.equal(decision.scope, 'project');
  assert.deepEqual(decision.quotes, ['Neste repo: --- não use Tailwind, use CSS modules']);
  assert.ok(!(await listSlugs(elsewhere)).includes(result.slug));
});

test('--scope=project is refused where there is neither an AIOSON root nor a git checkout', async () => {
  const home = sandbox();
  const downloads = path.join(home, 'Downloads');
  fs.mkdirSync(downloads);
  await withHome(home, async () => {
    const captured = await capture(downloads, { signal: 'exclusion', quote: 'x', proposal: 'nunca usar yarn nesta pasta', scope: 'project' });
    assert.equal(captured.ok, false);
    assert.match(captured.error, /--scope=project needs a project/);
    ensureStorageTree(IDENTITY);
    captureSignal({ identity: IDENTITY, slug: 'unanchored-proposal', signal_type: 'exclusion', quote: 'q', proposal: 'p', source_agent: 'dev' });
    const promoted = await inDir(downloads, () => runOpPromote({ args: ['unanchored-proposal'], options: { json: true, scope: 'project' }, logger: silent() }));
    assert.equal(promoted.ok, false);
    assert.match(promoted.error, /--scope=project needs a project/);
  });
});

test('the widening message reports only a real move to every project', async () => {
  const lines = [];
  const logger = { log: (line) => lines.push(line), error: () => {}, warn: () => {} };
  const run = (name) => inDir(makeCheckout(name, `https://github.com/acme/${name}.git`), () => runOpCapture({
    args: [],
    options: { signal: 'authorization', quote: 'pode rodar npm test sem perguntar', proposal: 'rodar npm test sem perguntar antes', 'source-agent': 'dev' },
    logger
  }));
  await run('wide-one');
  lines.length = 0;
  await run('wide-two');
  assert.match(lines.join('\n'), /now applies in every project/, 'project to operator is news');
  lines.length = 0;
  await run('wide-three');
  assert.doesNotMatch(lines.join('\n'), /now applies in every project/, 'already operator-wide');
});

test('the lines op:capture and op:promote print follow the project\'s interaction_language', async () => {
  const box = sandbox();
  const withLanguage = (name, language) => {
    const dir = makeProject(box, name, remotesConfig({ origin: `git@github.com:acme/${name}.git` }));
    if (language) fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), `---\ninteraction_language: ${language}\n---\n`);
    return dir;
  };
  const say = async (dir, proposal) => {
    const lines = [];
    const logger = { log: (line) => lines.push(line), error: () => {}, warn: () => {} };
    await inDir(dir, () => runOpCapture({ args: [], options: { signal: 'correction', quote: 'aqui não', proposal, 'source-agent': 'dev' }, logger }));
    return lines.join('\n');
  };
  assert.match(await say(withLanguage('lang-pt', 'pt-BR'), 'sem jquery no projeto pt'), /só no projeto lang-pt\). aioson op:forget \S+ p\/ desfazer\./);
  assert.match(await say(withLanguage('lang-es', 'es'), 'sem jquery no projeto es'), /solo en el proyecto lang-es/);
  assert.match(await say(withLanguage('lang-none', null), 'sem jquery no projeto en'), /^✔ Memory: '.+' \(only in project lang-none\)\. Undo: aioson op:forget \S+$/);

  const pt = withLanguage('lang-pt-promote', 'pt-BR');
  captureSignal({ identity: IDENTITY, slug: 'promote-line-pt', signal_type: 'confirmation', quote: 'q', proposal: 'linha em portugues', source_agent: 'dev' });
  const lines = [];
  await inDir(pt, () => runOpPromote({ args: ['promote-line-pt'], options: { scope: 'project' }, logger: { log: (line) => lines.push(line), error: () => {} } }));
  assert.match(lines.join('\n'), /só no projeto lang-pt-promote\)/);
});

test('op:* commands resolve the project from their [path] argument, the working directory only without one', async () => {
  const parent = sandbox();
  const api = makeProject(parent, 'todo-api', remotesConfig({ origin: 'git@github.com:me/todo-api.git' }));
  const proposal = 'sem orm na todo api';
  const captured = await inDir(parent, () => runOpCapture({ args: ['todo-api'], options: { json: true, signal: 'correction', quote: 'aqui sem ORM', proposal, 'source-agent': 'dev' }, logger: silent() }));
  assert.equal(captured.scope, 'project');
  const sets = projectSets(readDecision(IDENTITY, captured.slug));
  assert.deepEqual(sets, [resolveProjectScope(api).keys], 'bound to the project the path names, not to the folder the shell is in');

  const listFrom = async (args) => (await inDir(parent, () => runOpList({ args, options: { json: true, 'titles-only': true }, logger: silent() }))).items.map((item) => item.slug);
  assert.ok((await listFrom(['todo-api'])).includes(captured.slug));
  assert.ok(!(await listFrom([])).includes(captured.slug), 'the parent folder is another project');

  captureSignal({ identity: IDENTITY, slug: 'path-arg-proposal', signal_type: 'confirmation', quote: 'q', proposal: 'promovida pelo caminho', source_agent: 'dev' });
  const promoted = await inDir(parent, () => runOpPromote({ args: ['todo-api', 'path-arg-proposal'], options: { json: true, scope: 'project' }, logger: silent() }));
  assert.equal(promoted.scope, 'project');
  assert.ok(parseList(readDecision(IDENTITY, 'path-arg-proposal').projects).includes(resolveProjectScope(api).key));

  const { runOpShow } = require('../src/commands/op-show');
  const { runOpForget } = require('../src/commands/op-forget');
  const { runOpIdentity } = require('../src/commands/op-identity');
  const { runOpMigrate } = require('../src/commands/op-migrate');
  assert.equal((await inDir(parent, () => runOpShow({ args: ['todo-api', captured.slug], options: { json: true }, logger: silent() }))).kind, 'decision');
  assert.equal((await inDir(parent, () => runOpIdentity({ args: ['todo-api', 'show'], options: { json: true }, logger: silent() }))).identity, IDENTITY);
  fs.writeFileSync(path.join(api, '.aioson', 'context', 'user-profile.md'), '---\nverbosity: concise\n---\n');
  assert.equal((await inDir(parent, () => runOpMigrate({ args: ['todo-api'], options: { json: true }, logger: silent() }))).migrated, 1, 'the profile of the project the path names');
  assert.equal((await inDir(parent, () => runOpForget({ args: ['todo-api', 'path-arg-proposal'], options: { json: true }, logger: silent() }))).mode, 'decision');

  for (const run of [
    () => runOpList({ args: ['no-such-project'], options: { json: true }, logger: silent() }),
    () => runOpCapture({ args: ['no-such-project'], options: { json: true, signal: 'correction', quote: 'x', proposal: 'y' }, logger: silent() }),
    () => runOpPromote({ args: ['no-such-project', 'path-arg-proposal'], options: { json: true }, logger: silent() })
  ]) {
    const refused = await inDir(parent, run);
    assert.equal(refused.ok, false);
    assert.match(refused.error, /no-such-project is not a directory/);
  }
});

test('op:list --titles-only is lean: no empty field, dates as days, one compact line on stdout', () => {
  const dir = makeCheckout('lean', 'https://github.com/acme/lean.git');
  const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'aioson.js'), 'op:list', '.', '--json', '--titles-only'], { cwd: dir, env: process.env, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim().split('\n').length, 1, 'compact JSON: one line');
  const parsed = JSON.parse(res.stdout);
  assert.ok(parsed.items.length > 0);
  for (const item of parsed.items) {
    assert.ok(item.slug);
    for (const [key, value] of Object.entries(item)) assert.ok(value !== null && value !== '', `${item.slug}.${key} is empty`);
    if (item.last_reinforced) assert.match(item.last_reinforced, /^\d{4}-\d{2}-\d{2}$/);
  }
});
