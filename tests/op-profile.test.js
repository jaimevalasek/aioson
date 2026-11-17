'use strict';

/**
 * aioson op:profile — what the operator usually chooses across the projects
 * this machine recorded, the defaults a new project is offered (clear
 * majorities only), projects behind the CLI, and decisions standing in two or
 * more projects. Measured first on a real machine: 66 projects, web_app 55,
 * Node 44, pt-BR 66, Autopilot on 34 of 35, 62 behind the CLI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-profile-'));
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME);
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
process.env.AIOSON_OPERATOR_ID = 'profile-bot';
delete process.env.AIOSON_PROJECT_REGISTRY;
delete process.env.AIOSON_OPERATOR_MEMORY;

const { recordProjects, registryPath } = require('../src/lib/project-registry');
const { buildPortfolio, loadHabits, tallyField, isBehind } = require('../src/lib/operator-portfolio');
const { runOpProfile } = require('../src/commands/op-profile');
const { serializeDecision, decisionPath } = require('../src/operator-memory/decision');
const { ensureStorageTree } = require('../src/operator-memory/storage');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
let counter = 0;

function makeProject(parent, fields = {}) {
  counter += 1;
  const dir = path.join(parent, fields.dir || `project-${counter}`);
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  const data = {
    project_name: fields.name || `Project ${counter}`,
    project_type: 'web_app',
    profile: 'developer',
    framework: 'Node',
    classification: 'MICRO',
    interaction_language: 'pt-BR',
    design_skill: 'interface-design',
    aioson_version: '1.81.0',
    ...fields
  };
  delete data.dir;
  delete data.name;
  const lines = Object.entries(data).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${typeof v === 'boolean' ? v : `"${v}"`}`);
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), ['---', ...lines, '---', '', '# Project Context', ''].join('\n'));
  return dir;
}

function freshHome() {
  const home = fs.mkdtempSync(path.join(ROOT, 'h-'));
  const work = fs.mkdtempSync(path.join(ROOT, 'w-'));
  return { home, work };
}

const silent = () => ({ log() {}, error() {}, warn() {} });

test('choices are tallied per field; "Node" and "Node.js" are one framework, shown as most spelled', async () => {
  const rows = [
    { data: { framework: 'Node' } }, { data: { framework: 'Node' } }, { data: { framework: 'Node.js' } },
    { data: { framework: 'Next.js' } }, { data: { framework: '' } }
  ];
  assert.deepEqual(tallyField(rows, 'framework'), [{ value: 'Node', count: 3 }, { value: 'Next.js', count: 1 }]);
  assert.deepEqual(tallyField([{ data: { auto_handoff: true } }, { data: { auto_handoff: 'false' } }, { data: {} }], 'auto_handoff'),
    [{ value: 'false', count: 1 }, { value: 'true', count: 1 }]);
});

test('a default is offered only on a clear majority of projects that hold the choice', async () => {
  const { home, work } = freshHome();
  const dirs = [
    makeProject(work, { framework: 'Node', auto_handoff: true, test_runner: 'vitest' }),
    makeProject(work, { framework: 'Node.js', auto_handoff: true }),
    makeProject(work, { framework: 'Node', auto_handoff: true }),
    makeProject(work, { framework: 'Laravel', classification: 'MEDIUM' }),
    makeProject(work, { framework: 'Next.js', project_type: 'site' })
  ];
  await recordProjects(dirs, { home });
  const portfolio = buildPortfolio({ home });
  assert.equal(portfolio.projects, 5);
  assert.deepEqual(portfolio.suggested.framework, { value: 'Node', count: 3, of: 5 });
  assert.deepEqual(portfolio.suggested.project_type, { value: 'web_app', count: 4, of: 5 });
  assert.deepEqual(portfolio.suggested.interaction_language, { value: 'pt-BR', count: 5, of: 5 });
  assert.deepEqual(portfolio.suggested.auto_handoff, { value: 'true', count: 3, of: 3 }, '3 of 5 hold it: a majority of those');
  assert.equal(portfolio.suggested.test_runner, undefined, 'one project of five holds a runner: no default');
  assert.equal(portfolio.suggested.classification, undefined, 'size is measured per project, never suggested');
  assert.equal(portfolio.suggested.design_skill, undefined, 'the visual system is never a setup default');
  assert.equal(portfolio.choices.classification[0].value, 'MICRO', 'but shown');

  const excluded = buildPortfolio({ home, exclude: dirs[0] });
  assert.equal(excluded.projects, 4, 'a project being set up does not vote for itself');
});

test('fewer than three projects, or no majority, offers no default', async () => {
  const { home, work } = freshHome();
  await recordProjects([makeProject(work), makeProject(work)], { home });
  assert.deepEqual(buildPortfolio({ home }).suggested, {});
  const split = freshHome();
  await recordProjects(['Node', 'Laravel', 'Rails', 'Django'].map((framework) => makeProject(split.work, { framework })), { home: split.home });
  assert.equal(buildPortfolio({ home: split.home }).suggested.framework, undefined);
});

test('projects behind the CLI are counted, the oldest named first', async () => {
  const { home, work } = freshHome();
  await recordProjects([
    makeProject(work, { name: 'Current', aioson_version: '1.81.0' }),
    makeProject(work, { name: 'Old', aioson_version: '1.7.2' }),
    makeProject(work, { name: 'Recent', aioson_version: '1.80.1' }),
    makeProject(work, { name: 'Unknown', aioson_version: undefined })
  ], { home });
  const { outdated } = buildPortfolio({ home, cliVersion: '1.81.0' });
  assert.equal(outdated.count, 2);
  assert.deepEqual(outdated.oldest.map((entry) => entry.name), ['Old', 'Recent']);
  assert.equal(isBehind('1.9.0', '1.10.0'), true, 'numeric, not lexical');
  assert.equal(isBehind('1.81.0', '1.81.0'), false);
});

test('habits: operator-wide decisions seen in two projects or said for every project; never one project\'s, a pre-scope one or an archived one', () => {
  const identity = 'habits-bot';
  ensureStorageTree(identity);
  const now = new Date().toISOString();
  const write = (slug, extra) => fs.writeFileSync(decisionPath(identity, slug), serializeDecision({
    slug, signal_type: 'correction', promoted_at: now, last_reinforced: now, reinforcement_count: 1, category: 'default',
    source_agent: 'dev', quotes: ['não use emojis'], body: `Habit ${slug}`, title: `Habit ${slug}`, ...extra
  }));
  write('two-projects', { scope: 'operator', project_sets: [['pa1'], ['pb2']], project_names: ['a', 'b'] });
  write('said-everywhere', { scope: 'operator', quotes: ['em todos os meus projetos sem emojis'], project_sets: [['pa1']], project_names: ['a'] });
  write('one-project', { scope: 'project', project_sets: [['pa1']], project_names: ['a'] });
  write('operator-one-project', { scope: 'operator', project_sets: [['pa1']], project_names: ['a'] });
  write('pre-scope', {});
  const old = new Date(Date.now() - 400 * 864e5).toISOString();
  fs.writeFileSync(decisionPath(identity, 'aged-permission'), serializeDecision({
    slug: 'aged-permission', signal_type: 'authorization', promoted_at: old, last_reinforced: old, reinforcement_count: 0, category: 'default',
    source_agent: 'dev', quotes: ['sempre'], body: 'aged', title: 'aged', scope: 'operator', project_sets: [['pa1'], ['pb2']], project_names: ['a', 'b']
  }));
  assert.deepEqual(loadHabits(identity).map((habit) => habit.slug).sort(), ['said-everywhere', 'two-projects']);
  assert.equal(loadHabits(identity).find((h) => h.slug === 'two-projects').projects, 2);
  assert.deepEqual(loadHabits(null), []);
});

test('op:profile --scan imports the projects under a folder and answers with the portfolio', async () => {
  const work = fs.mkdtempSync(path.join(ROOT, 'scan-'));
  for (let i = 0; i < 3; i += 1) makeProject(path.join(work, i === 2 ? 'clients' : '.'), { dir: `scan-app-${i}` });
  makeProject(path.join(work, 'node_modules'), { dir: 'dependency' });
  const result = await runOpProfile({ args: [], options: { json: true, scan: work }, logger: silent() });
  assert.equal(result.ok, true);
  assert.deepEqual([result.scanned.found, result.scanned.added], [3, 3]);
  assert.ok(result.projects >= 3);
  assert.equal(result.registry, registryPath());
  assert.ok(result.suggested.framework);
  assert.ok(Array.isArray(result.habits));

  const again = await runOpProfile({ args: [], options: { json: true, scan: work }, logger: silent() });
  assert.equal(again.scanned.added, 0, 'a second scan adds nothing new');
});

test('op:profile refuses a scan without a folder and a depth out of range', async () => {
  const noFolder = await runOpProfile({ args: [], options: { json: true, scan: true }, logger: silent() });
  assert.equal(noFolder.ok, false);
  assert.match(noFolder.error, /--scan needs a folder/);
  const badDepth = await runOpProfile({ args: [], options: { json: true, scan: ROOT, depth: '9' }, logger: silent() });
  assert.equal(badDepth.ok, false);
  assert.match(badDepth.error, /--depth/);
});

test('op:profile speaks the project language and says how to fill an empty list', async () => {
  const { work } = freshHome();
  const project = makeProject(work, { interaction_language: 'pt-BR' });
  const emptyHome = fs.mkdtempSync(path.join(ROOT, 'empty-'));
  const lines = [];
  const env = { ...process.env, HOME: emptyHome, USERPROFILE: emptyHome };
  const res = spawnSync(process.execPath, [CLI, 'op:profile', project], { encoding: 'utf8', env });
  assert.equal(res.status, 0, res.stderr);
  lines.push(...res.stdout.split(/\r?\n/));
  assert.match(lines[0], /nenhum projeto registrado ainda.*--scan=<pasta>/);

  const json = spawnSync(process.execPath, [CLI, 'op:profile', project, '--json'], { encoding: 'utf8', env });
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).projects, 0);
});

test('op:profile --help is side-effect free', async () => {
  const home = fs.mkdtempSync(path.join(ROOT, 'help-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const res = spawnSync(process.execPath, [CLI, 'op:profile', '--help', '--json'], { encoding: 'utf8', env, cwd: home });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).ok, true);
  assert.equal(fs.existsSync(path.join(home, '.aioson')), false);
});
