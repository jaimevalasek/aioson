'use strict';

// src/cli.js loads a command's module on its first call, so an invocation pays
// for the command it runs. Two ways that went wrong:
// - The quality predicate every later dispatch branch evaluates loaded the
//   whole quality subsystem (quality-audit, -run, -evals, -bench) for
//   hooks:emit, agent:done, op:list, observation:list and every unknown command.
// - `lazy(() => require(x), names)` read to static analysis as "every export of
//   x used", hiding dead exports from the quality gate. Each loader now
//   destructures the names it binds right at the require.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-cli-lazy-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME);
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;

// Preloaded into the spawned CLI: at exit, which src/commands modules it loaded.
function probe() {
  process.on('exit', () => {
    const sep = require('node:path').sep;
    const marker = `${sep}src${sep}commands${sep}`;
    const loaded = Object.keys(require.cache)
      .filter((file) => file.includes(marker))
      .map((file) => file.slice(file.lastIndexOf(marker) + marker.length).split(sep).join('/'));
    process.stderr.write(`\n[loaded-commands] ${JSON.stringify(loaded)}\n`);
  });
}
const PROBE = path.join(TMP, 'probe.js');
fs.writeFileSync(PROBE, `'use strict';\n(${probe.toString()})();\n`);

const PROJECT = path.join(TMP, 'project');
fs.mkdirSync(path.join(PROJECT, '.aioson', 'context'), { recursive: true });
fs.writeFileSync(
  path.join(PROJECT, '.aioson', 'context', 'project.context.md'),
  '---\nproject_name: "demo"\nproject_type: "api"\nprofile: "developer"\nframework: "node"\nframework_installed: true\nclassification: "MICRO"\nconversation_language: "en"\naioson_version: "1.74.0"\n---\n\n# Context\n'
);

function loadedCommands(args) {
  const run = spawnSync(process.execPath, ['--require', PROBE, BIN, ...args], {
    cwd: TMP,
    encoding: 'utf8',
    input: '',
    env: { ...process.env, HOME, USERPROFILE: HOME, AIOSON_OPERATOR_MEMORY: 'false' }
  });
  const match = /\[loaded-commands\] (\[.*\])/.exec(run.stderr);
  assert.ok(match, `the probe reported nothing: ${run.stderr}`);
  return JSON.parse(match[1]);
}

const QUALITY_MODULES = /^quality-/;

test('--version loads no command module', () => {
  assert.deepEqual(loadedCommands(['--version']), []);
});

test('a command dispatched after the quality branch does not load the quality subsystem', () => {
  const validate = loadedCommands(['context:validate', PROJECT, '--json']);
  assert.ok(validate.includes('context-validate.js'), JSON.stringify(validate));
  assert.deepEqual(validate.filter((file) => QUALITY_MODULES.test(file)), []);

  const observations = loadedCommands(['observation:list', PROJECT, '--json']);
  assert.ok(observations.includes('observe.js'), JSON.stringify(observations));
  assert.deepEqual(observations.filter((file) => QUALITY_MODULES.test(file)), [], JSON.stringify(observations));
});

test('every lazy binding destructures its names at the require site', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'cli.js'), 'utf8');
  const shape = /const\s*\{([^}]*)\}\s*=\s*lazy\(\(\) => \{ const \{ ([^}]*) \} = require\('([^']+)'\); return \{ ([^}]*) \}; \}\)/g;
  const names = (text) => text.split(',').map((name) => name.trim()).filter(Boolean);
  const bound = [];
  let bindings = 0;
  for (const [, outer, inner, modulePath, returned] of source.matchAll(shape)) {
    bindings += 1;
    assert.deepEqual(names(inner), names(outer), `${modulePath}: the loader destructures what the binding names`);
    assert.deepEqual(names(returned), names(inner), `${modulePath}: the loader returns what it destructured`);
    const loaded = require(path.join(ROOT, 'src', modulePath));
    for (const name of names(inner)) {
      assert.equal(typeof loaded[name], 'function', `${modulePath} exports ${name} as a function`);
    }
    bound.push(...names(outer));
  }
  assert.ok(bindings > 200, `found ${bindings} bindings`);
  assert.equal((source.match(/=\s*lazy\(/g) || []).length, bindings, 'every lazy() call has the destructuring shape');
  assert.equal((source.match(/require\('\.\/commands\//g) || []).length, bindings, 'every command module loads through a loader');
  assert.equal(new Set(bound).size, bound.length, 'no name is bound twice');

  // Every binding is only ever called: never passed, compared or inspected.
  const rest = source.replace(shape, '');
  for (const name of bound) {
    const nonCall = new RegExp(`(?<![\\w$.])${name}(?![\\w$])(?!\\s*\\()`);
    assert.doesNotMatch(rest, nonCall, `${name} is used other than as a direct call`);
  }
});
