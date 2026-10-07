'use strict';

// Knowledge is born tested: rule:new and doc:new prove, through the real brief
// builder, that the new file reaches every agent it names and stays out of an
// agent it does not name and of an unrelated task.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AGENT_MODES, birthScenarios, examplePath, BIRTH_FILE } = require('../src/lib/knowledge-birth');
const { runRuleNew, runDocNew } = require('../src/commands/rule-new');
const { runContextEvals } = require('../src/lib/context-evals');

const quiet = { log() {}, error() {} };

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-knowledge-birth-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nframework: Node.js\n---\n# Project', 'utf8');
  return dir;
}

function frontmatter(overrides = {}) {
  return {
    name: 'module-layout',
    description: 'Where module files and subfolders are created',
    agents: ['planner', 'dev'],
    modes: ['planning', 'executing'],
    triggers: ['folder structure'],
    task_types: [],
    paths: [],
    load_tier: 'trigger',
    ...overrides
  };
}

test('birth scenarios: reach for every named agent, the nearest unnamed agent and an unrelated task stay out', () => {
  const scenarios = birthScenarios({ relPath: '.aioson/rules/module-layout.md', frontmatter: frontmatter() });
  assert.deepEqual(scenarios.map((s) => s.name), [
    'module-layout :: reaches planner',
    'module-layout :: reaches dev',
    'module-layout :: stays out of qa',
    'module-layout :: stays out of an unrelated task'
  ]);
  assert.equal(scenarios[0].mode, 'planning');
  assert.equal(scenarios[1].mode, 'executing');
  assert.match(scenarios[0].task, /^folder structure: /, 'the synthesized task leads with a declared trigger');

  const withExamples = birthScenarios({
    relPath: '.aioson/rules/module-layout.md',
    frontmatter: frontmatter(),
    examples: ['create the folders for the customers module', 'split the orders module into subfolders']
  });
  assert.ok(withExamples.some((s) => s.name === 'module-layout :: reaches planner (example 2)'));
  assert.equal(withExamples.find((s) => s.name === 'module-layout :: stays out of qa').task, 'create the folders for the customers module');

  const always = birthScenarios({ relPath: 'x.md', frontmatter: frontmatter({ load_tier: 'always' }) });
  assert.equal(always.some((s) => s.name.endsWith('unrelated task')), false, 'an always-loaded file is meant to appear everywhere');
  const universal = birthScenarios({ relPath: 'x.md', frontmatter: frontmatter({ agents: [] }) });
  assert.equal(universal.some((s) => s.name.includes('stays out of qa')), false, 'no agents declared: nobody to exclude');
});

test('the birth mode map matches the modes each main-cycle kernel consults in', async () => {
  for (const [agent, modes] of Object.entries(AGENT_MODES)) {
    const kernel = await fs.readFile(path.join(__dirname, '..', 'template', '.aioson', 'agents', `${agent}.md`), 'utf8');
    const used = [...kernel.matchAll(new RegExp(`context:(?:brief|select) \\. --agent=${agent} --mode=(planning|executing)`, 'g'))].map((m) => m[1]);
    for (const mode of used) assert.ok(modes.includes(mode), `${agent} consults in ${mode}; AGENT_MODES says [${modes.join(', ')}]`);
  }
});

test('examplePath turns a glob into a concrete path the glob matches', () => {
  assert.equal(examplePath('src/modulos/**'), 'src/modulos/example/example.js');
  assert.equal(examplePath('app/Http/Controllers/*.php'), 'app/Http/Controllers/example.php');
  assert.equal(examplePath('**/*.ts'), 'example/example.ts');
  assert.equal(examplePath(''), '');
});

test('a DEV-only doc is born proven — and the words an agent really uses are tested at birth', async () => {
  const dir = await makeProject();
  try {
    const docOptions = {
      name: 'customer-integration',
      folder: 'dev',
      description: 'Reuse the existing customer integration before writing a new one',
      agents: 'dev',
      triggers: 'customer integration,integração de clientes',
      examples: 'integrar o cadastro de clientes com o ERP|connect the orders flow to the customer integration',
      json: true
    };
    // "integrar o cadastro" is how an agent phrases it; no declared trigger says that.
    const first = await runDocNew({ args: [dir], options: docOptions, logger: quiet });
    assert.equal(first.ok, true);
    const missed = first.birth_evals.results.find((s) => s.name === 'customer-integration :: reaches dev');
    assert.equal(missed.passed, false);
    assert.equal(missed.failures[0].cause, 'below_threshold');
    assert.ok(missed.failures[0].suggestion, 'the miss comes with the frontmatter fix');

    const result = await runDocNew({
      args: [dir],
      options: { ...docOptions, triggers: `${docOptions.triggers},cadastro de clientes`, force: true },
      logger: quiet
    });
    assert.equal(result.path, '.aioson/docs/dev/customer-integration.md');
    assert.equal(result.birth_evals.failed, 0, JSON.stringify(result.birth_evals.results, null, 2));
    assert.ok(result.birth_evals.passed >= 4);

    const content = await fs.readFile(path.join(dir, result.path), 'utf8');
    assert.match(content, /^agents: \[dev\]$/m);
    assert.match(content, /## When to consult/);
    assert.doesNotMatch(content, /^priority:/m, 'docs carry no rule priority');

    const corpus = JSON.parse(await fs.readFile(path.join(dir, BIRTH_FILE), 'utf8'));
    const before = corpus.scenarios.length;
    await runDocNew({ args: [dir], options: { name: 'customer-integration', folder: 'dev', agents: 'dev', triggers: 'customer integration', force: true, json: true }, logger: quiet });
    const after = JSON.parse(await fs.readFile(path.join(dir, BIRTH_FILE), 'utf8')).scenarios;
    assert.ok(after.length <= before && after.every((s) => s.name.startsWith('customer-integration :: ')), 'a re-scaffold replaces its scenarios, never duplicates them');

    const evals = await runContextEvals(dir, { coverage: false });
    assert.equal(evals.totals.failed, 0, 'context:evals keeps re-proving the born scenarios');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a PLANNER + DEV rule is born proven; a mode nobody plans in is caught at birth with the fix', async () => {
  const dir = await makeProject();
  try {
    const good = await runRuleNew({
      args: [dir],
      options: { name: 'module-layout', agents: 'planner,dev', triggers: 'folder structure,estrutura de pastas', paths: 'src/modules/**', json: true },
      logger: quiet
    });
    assert.equal(good.birth_evals.failed, 0, JSON.stringify(good.birth_evals.results, null, 2));

    const broken = await runRuleNew({
      args: [dir],
      options: { name: 'naming-plan', agents: 'planner', modes: 'executing', triggers: 'file names', json: true },
      logger: quiet
    });
    const reach = broken.birth_evals.results.find((s) => s.name === 'naming-plan :: reaches planner');
    assert.equal(reach.passed, false);
    assert.equal(reach.failures[0].cause, 'mode_filter');
    assert.match(reach.failures[0].suggestion, /widen modes/);

    const skipped = await runRuleNew({ args: [dir], options: { name: 'quiet-rule', agents: 'dev', triggers: 'x', 'no-evals': true, json: true }, logger: quiet });
    assert.equal(skipped.birth_evals, undefined, '--no-evals writes the file without proving it');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('doc:new is a CLI command with help in every locale, and --no-evals never swallows the path', async () => {
  const bin = path.join(__dirname, '..', 'bin', 'aioson.js');
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const help = spawnSync(process.execPath, [bin, 'help', `--locale=${locale}`], { encoding: 'utf8' });
    assert.match(help.stdout, /aioson doc:new/, `${locale} help lists doc:new`);
  }
  const dir = await makeProject();
  try {
    const run = spawnSync(process.execPath, [bin, 'doc:new', '--no-evals', dir, '--name=release-notes', '--agents=dev', '--triggers=release notes', '--json'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    await fs.access(path.join(dir, '.aioson', 'docs', 'release-notes.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
