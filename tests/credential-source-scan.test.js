'use strict';

// A framing agent needed a logged-in screen, had no route it could load, and read .env
// to mint itself an admin session, against the rule in its own kernel. Nothing noticed:
// the rule was prose. The hooks see every shell command, so the read is flagged as it
// happens and agent:done reports it. The flag has to be computed on the full command,
// because the event keeps 200 characters and in that session .env began at character 200.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildEventFromPayload } = require('../src/commands/hooks-emit');
const { runAgentDone } = require('../src/commands/runtime');
const { credentialReadsSinceActivation, kernelForbidsCredentialSources, readsCredentialSource } = require('../src/lib/credential-source-scan');
const { listObservations } = require('../src/lib/observations');
const { openRuntimeDb } = require('../src/runtime-store');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-credential-home-'));

// The command of the incident, verbatim.
const INCIDENT = 'cd C:/dev/sample-app && sed -n \'95,135p\' lib/auth.ts; echo ---SET---; sed -n \'236,262p\' lib/auth.ts; echo ---ENVKEYS---; grep -o "^[A-Z_]*SESSION[A-Z_]*=\\|^AUTH_SECRET=\\|^JWT_SECRET=\\|^DATABASE_URL=" .env | head';

test('a shell command that reads a credential source is recognized', () => {
  for (const command of [
    INCIDENT,
    'cat .env',
    'cat "$ROOT/.env" | head',
    'cat ".env"',
    'head \'C:/x/.env\'',
    'type C:\\app\\.env',
    'sed -E \'s/=.*/=<redacted>/\' .env',
    'cut -d= -f1 .env | tr "\\n" " "',
    'grep -c "SIGNING_KEY" .env',
    'BASE=$(grep -m1 \'^DATABASE_URL=\' .env | sed -E \'s/x/y/\')',
    'head -3 C:/x/.env.local',
    'sed -n 1,5p .env',
    'grep -o AUTH_SECRET= .env | cut -d= -f1',
    'Get-Content .env -Raw',
    'type .env',
    'source .env && npm run dev',
    '. ./.env',
    'set -a; . .env; set +a',
    'node -e "require(\'fs\').readFileSync(\'.env\')"',
    'python -c "open(\'.env\').read()"',
    'node - <<EOF\nfs.readFileSync(\'.env\')\nEOF',
    'cat .env 2>/dev/null',
    'cat .env > copy.txt',
    'curl -H "Cookie: s=$(grep SECRET .env | cut -d= -f2)" https://example.test',
    'curl -H "Cookie: s=`grep SECRET .env`" https://example.test',
    'bash -c "cat .env"',
    'sh -c \'cat .env\'',
    'cmd /c type .env',
    'cat .env README.md',
    'cat .env.production.local',
    '. .env.local',
    'grep FOO < .env',
    'while read line; do echo x; done < .env',
    'source <(cat .env)',
    'cat \\\n  .env',
    'export $(cat .env | xargs)',
    'sudo cat .env',
    'FOO=1 cat .env',
    'env FOO=1 cat .env',
    'Select-String -Path .env -Pattern TOKEN',
    'gc .env',
    '[IO.File]::ReadAllText(\'.env\')',
    'echo "a << b"\ncat .env',
    'grep -e TOKEN .env',
    'awk -F= \'{print $1}\' .env'
  ]) assert.equal(readsCredentialSource(command), true, command);
});

test('naming the file, writing about it, or starting a process with it is no read', () => {
  for (const command of [
    'grep -n "\\.env" .gitignore',
    'grep -nE "^  (data/|.*\\.db|.*lock|.*\\.env|aioson-models|node_modules/|dist/" dry-run.log',
    'git diff origin/main..main --name-only | grep -iE "\\.env|secret|\\.pem|\\.key$" | head',
    'ls -a src-tauri | grep -E "^\\.env|build.rs"',
    'git ls-files -o | grep -iE \'secret|credential|\\.env\' ; echo done',
    'grep -E ".env|secret" list.txt',
    'grep -E ".env|secret"',
    'grep .env .gitignore',
    'sed -i \'s/x/fotografar exige ler o .env; o resto/\' MEMORY.md',
    'cat .env.example',
    'grep FOO .env.sample',
    'head .env.template',
    'cat .envrc',
    'git check-ignore .env',
    'git diff .env.example',
    'ls -la .env',
    'test -f .env && echo yes',
    'echo "see .env"',
    'node --env-file=.env x.js',
    'aioson browser:run . --script=x.json --save-state=.aioson/runtime/s.json',
    'cat > .env <<EOF\nA=1\nEOF',
    'cat template.txt > .env',
    'cat template.txt >> .env',
    'ls -a | grep .env',
    'ls -a | grep .env 2>/dev/null',
    'ls -a | grep 2>/dev/null .env',
    'rg .env',
    'grep -r .env .',
    'grep .env .gitignore',
    'find . -name .env',
    'cat .env.local.example',
    'cat > notes.md <<EOF\ngrep FOO .env\nEOF',
    'cat >> brief.md <<\'EOF\'\n- a chave fica em .env\nEOF',
    'printf \'%s\\n\' \'cunhar cookie exige ler o .env\' >> MEMORY.md',
    '',
    undefined
  ]) assert.equal(readsCredentialSource(command), false, String(command));
});

test('a heredoc ends where its terminator says, and the next line is a command again', () => {
  assert.equal(readsCredentialSource('cat > x.md <<EOF\nnote\nEOF\ncat .env'), true);
  assert.equal(readsCredentialSource('cat > x.md <<EOF\ncat .env'), false);
});

test('input built to be slow ends quickly', () => {
  const started = Date.now();
  readsCredentialSource(`${'cat '.repeat(50000)}\n${'grep x '.repeat(40000)}`);
  readsCredentialSource('cat '.repeat(1000000));
  readsCredentialSource(`.env ${'readFileSync('.repeat(100000)}`);
  readsCredentialSource(`.env ${'$('.repeat(90000)}`);
  readsCredentialSource(`.env ${'"'.repeat(150000)}`);
  readsCredentialSource(`bash -c "${'bash -c '.repeat(20000)} .env"`);
  readsCredentialSource(`.env\n${'cat .env.example '.repeat(10000)}`);
  assert.ok(Date.now() - started < 1500, `${Date.now() - started} ms`);
});

test('the rule is read from the agent\'s own kernel', () => {
  assert.equal(kernelForbidsCredentialSources('- Never execute SQL, restore databases, open credential sources, mint a session.'), true);
  assert.equal(kernelForbidsCredentialSources('# Agent @dev'), false);
  assert.equal(kernelForbidsCredentialSources(undefined), false);
  for (const name of ['briefing', 'refiner']) {
    const kernel = fs.readFileSync(path.join(__dirname, '..', 'template', '.aioson', 'agents', `${name}.md`), 'utf8');
    assert.equal(kernelForbidsCredentialSources(kernel), true, name);
  }
});

test('the hook flags the read on the full command, past where the event is cut', () => {
  assert.ok(INCIDENT.indexOf('.env') >= 200, 'the incident has to keep proving the cut');
  const event = buildEventFromPayload({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: INCIDENT }, tool_response: {}, session_id: 's1' }, 'claude');
  assert.equal(event.extra.credential_read, true);
  assert.ok(event.message.length <= 202);
  assert.ok(!event.message.includes('.env |'), 'the message alone could not have shown it');

  const harmless = buildEventFromPayload({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: {}, session_id: 's1' }, 'claude');
  assert.equal(harmless.extra.credential_read, undefined);
});

function env() {
  const out = { ...process.env, HOME, USERPROFILE: HOME };
  for (const key of Object.keys(out)) if (key.startsWith('AIOSON_LIVE')) delete out[key];
  return out;
}

function makeProject(t, kernels = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-credential-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  for (const [name, text] of Object.entries(kernels)) fs.writeFileSync(path.join(dir, '.aioson', 'agents', `${name}.md`), text, 'utf8');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function emit(dir, payload) {
  const result = spawnSync(process.execPath, [CLI, 'hooks:emit', dir, '--agent=dev', '--source=claude'], { input: JSON.stringify(payload), env: env(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

const activate = (dir, agent, sessionId = 's1') => emit(dir, { hook_event_name: 'UserPromptSubmit', prompt: `/aioson:agent:${agent}`, session_id: sessionId, cwd: dir });
const shell = (dir, command, sessionId = 's1') => emit(dir, { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { exit_code: 0 }, session_id: sessionId, cwd: dir });

async function reads(dir, agent) {
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    return credentialReadsSinceActivation(db, agent);
  } finally {
    db.close();
  }
}

const FORBIDS = '- Never execute SQL, open credential sources, or read files marked blocked.\n';

test('agent:done reports the read, keeps it as an observation, and the session still closes', async (t) => {
  const dir = makeProject(t, { briefing: FORBIDS });
  activate(dir, 'briefing');
  shell(dir, 'ls');
  shell(dir, INCIDENT);
  const lines = [];
  const done = await runAgentDone({ args: [dir], options: { agent: 'briefing', summary: 'done' }, logger: { log: (line) => lines.push(line), error() {} } });
  assert.equal(done.ok, true);
  assert.equal(done.context_brief.credential_reads.count, 1);
  assert.ok(lines.some((line) => /credential source read \(advisory\): 1 command/.test(line) && /logged-in-screens\.md/.test(line)), lines.join('\n'));
  const observed = await listObservations(dir, {});
  const items = observed.items || observed;
  assert.ok(items.some((item) => /@briefing read a credential source/.test(item.summary)), JSON.stringify(items));
});

test('a clean session says nothing', async (t) => {
  const dir = makeProject(t, { briefing: FORBIDS });
  activate(dir, 'briefing');
  shell(dir, 'aioson briefing:sources . --json');
  const lines = [];
  const done = await runAgentDone({ args: [dir], options: { agent: 'briefing', summary: 'done' }, logger: { log: (line) => lines.push(line), error() {} } });
  assert.equal(done.context_brief.credential_reads, null);
  assert.ok(!lines.some((line) => /credential source/.test(line)), lines.join('\n'));
});

test('an agent whose kernel has no such rule is not measured', async (t) => {
  const dir = makeProject(t, { dev: '# Agent @dev\n' });
  activate(dir, 'dev');
  shell(dir, 'cat .env');
  const done = await runAgentDone({ args: [dir], options: { agent: 'dev', summary: 'done' }, logger: { log() {}, error() {} } });
  assert.equal(done.context_brief.credential_reads, null);
});

test('the read belongs to the activation and the window it happened in', async (t) => {
  const dir = makeProject(t, { briefing: FORBIDS, refiner: FORBIDS, dev: '# Agent @dev\n' });

  // Before the activation: another agent's work on the same run.
  shell(dir, 'cat .env');
  activate(dir, 'briefing');
  assert.deepEqual(await reads(dir, 'briefing'), []);

  // After the next activation in the session: no longer this agent's.
  activate(dir, 'dev');
  shell(dir, 'cat .env');
  assert.deepEqual(await reads(dir, 'briefing'), []);

  // Another window on the project, with its own session.
  activate(dir, 'refiner', 'window-a');
  shell(dir, 'cat .env', 'window-b');
  assert.deepEqual(await reads(dir, 'refiner'), []);
  shell(dir, 'cat .env', 'window-a');
  assert.equal((await reads(dir, 'refiner')).length, 1);
  shell(dir, 'head .env', 'window-a');
  assert.deepEqual((await reads(dir, 'refiner')).map((message) => message.slice(0, 10)), ['$ cat .env', '$ head .en'], 'oldest first, so "the first" is the first');

  assert.deepEqual(await reads(dir, 'nobody'), []);
});

test('a broken store never affects the close', async (t) => {
  const dir = makeProject(t, { briefing: FORBIDS });
  const { resolveCredentialReads } = require('../src/lib/credential-source-scan');
  const broken = { prepare() { throw new Error('no table'); } };
  assert.equal(await resolveCredentialReads({ db: broken, targetDir: dir, agent: '@briefing' }), null);
  assert.equal(await resolveCredentialReads({ db: broken, targetDir: dir, agent: '@missing' }), null);
});
