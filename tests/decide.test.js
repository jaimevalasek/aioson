'use strict';

// A decision is taken once: decide finds a recorded precedent without a model,
// a configured JEV only recommends (or says a human must decide), and --record
// writes a routed decision doc proven to reach the next agent who asks.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runDecide } = require('../src/commands/decide');
const { recommendChoice, slugOf } = require('../src/lib/decision-precedent');
const { loadJevConfig } = require('../src/lib/jev-config');

const quiet = { log() {}, error() {} };

async function makeProject(extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-decide-'));
  const files = { '.aioson/context/project.context.md': '---\nframework: Node.js\n---\n# Project', ...extra };
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), body, 'utf8');
  }
  return dir;
}

test('no precedent: the governing rules are listed and the decision is recorded once, proven at birth', async () => {
  const dir = await makeProject({
    '.aioson/rules/security-baseline.md': ['---', 'name: security-baseline', 'description: Authentication and secrets', 'triggers: [login, autenticação]', 'load_tier: trigger', '---', '# Security', '- Never store plain passwords.', ''].join('\n')
  });
  try {
    const question = 'Qual biblioteca usar para login e autenticação de usuários?';
    const first = await runDecide({ args: [dir], options: { question, options: 'Better Auth|sessão própria', json: true }, logger: quiet });
    assert.equal(first.status, 'undecided');
    assert.ok(first.governing.some((item) => item.path === '.aioson/rules/security-baseline.md'));

    const missingChoice = await runDecide({ args: [dir], options: { question, record: true, json: true }, logger: quiet });
    assert.equal(missingChoice.ok, false);
    assert.equal(missingChoice.status, 'choice_required');

    const recorded = await runDecide({
      args: [dir],
      options: { question, options: 'Better Auth|sessão própria', record: true, choice: 'Better Auth', why: 'Maintained, typed, already in the stack', by: '@dev', triggers: 'login,autenticação', json: true },
      logger: quiet
    });
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.path, `.aioson/docs/decisions/${slugOf(question)}.md`);
    assert.equal(recorded.birth_evals.failed, 0, JSON.stringify(recorded.birth_evals.results, null, 2));
    const doc = await fs.readFile(path.join(dir, recorded.path), 'utf8');
    assert.match(doc, /^aliases: \[Better Auth, sessão própria\]$/m, 'the options become retrieval aliases');
    assert.match(doc, /\*\*Better Auth\*\* — decided \d{4}-\d{2}-\d{2} by @dev\./);

    const again = await runDecide({ args: [dir], options: { question: 'Como implementar o login dos usuários?', json: true }, logger: quiet });
    assert.equal(again.status, 'precedent', 'a rephrased question that shares the triggers finds the precedent');
    assert.match(again.precedent[0].decided, /Better Auth/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('JEV recommends only when confident; otherwise it names a human decision; it never records', async () => {
  const dir = await makeProject({
    'aioson-models.json': JSON.stringify({ providers: { openrouter: { api_key: 'test-key-from-json' } }, jev: { enabled: true, route: 'openrouter', min_noul: 0.6 } })
  });
  try {
    const config = loadJevConfig(dir, {});
    const answer = (choice, confidence, probabilities) => async () => ({
      ok: true,
      status: 200,
      json: async () => ({ answers: { decide: { type: 'choice', choice, confidence, probabilities } } })
    });
    const confident = await recommendChoice({
      config, question: 'Which auth library?', options: ['Better Auth', 'own sessions'],
      fetchImpl: answer('option_0', 0.86, { option_0: 0.81, option_1: 0.14, needs_a_human: 0.05 })
    });
    assert.equal(confident.status, 'used');
    assert.equal(confident.recommended, 'Better Auth');

    const unsure = await recommendChoice({
      config, question: 'Which auth library?', options: ['Better Auth', 'own sessions'],
      fetchImpl: answer('option_1', 0.41, { option_1: 0.45, option_0: 0.4, needs_a_human: 0.15 })
    });
    assert.equal(unsure.recommended, null);
    assert.equal(unsure.proposed, 'own sessions');

    const human = await recommendChoice({
      config, question: 'Which auth library?', options: ['Better Auth', 'own sessions'],
      fetchImpl: answer('needs_a_human', 0.9, { needs_a_human: 0.9, option_0: 0.05, option_1: 0.05 })
    });
    assert.equal(human.needs_a_human, true);
    assert.equal(human.recommended, null);

    const down = await recommendChoice({ config, question: 'q', options: ['a', 'b'], fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    assert.equal(down.status, 'unavailable');
    await assert.rejects(fs.access(path.join(dir, '.aioson', 'docs', 'decisions')), 'a recommendation never writes a decision');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('decide is a CLI command with help in every locale, and --record never swallows the path', async () => {
  const bin = path.join(__dirname, '..', 'bin', 'aioson.js');
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const help = spawnSync(process.execPath, [bin, 'help', `--locale=${locale}`], { encoding: 'utf8' });
    assert.match(help.stdout, /aioson decide/, `${locale} help lists decide`);
  }
  const dir = await makeProject();
  try {
    const run = spawnSync(process.execPath, [bin, 'decide', '--record', dir, '--question=Which queue backend?', '--choice=Redis', '--triggers=queue', '--json'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    await fs.access(path.join(dir, '.aioson', 'docs', 'decisions', 'decision-which-queue-backend.md'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
