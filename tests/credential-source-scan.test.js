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
    'awk -F= \'{print $1}\' .env',
    'if grep -q KEY .env; then echo y; fi',
    'for k in A B; do grep "^$k=" .env; done',
    '! grep -q KEY .env',
    '{ cat .env; }',
    'sudo -u www-data cat .env',
    'timeout 5 cat .env',
    'docker exec app cat .env',
    'docker compose exec app sh -c "cat .env"',
    'kubectl exec pod -- cat .env',
    'ssh prod cat .env',
    'ssh prod "cd /var/www && cat .env"',
    'cat apps/*/.env',
    'cat .ENV',
    'grep -eKEY .env',
    'grep --regexp=KEY .env',
    'grep --regexp KEY .env',
    'grep -F KEY .env',
    'grep -f patterns.txt .env',
    'grep -f .env list.txt',
    'sed -ne \'s/a/b/p\' .env',
    'rg -g "*.ts" KEY .env',
    'Select-String -Pattern KEY .env',
    'curl -H "Cookie: s=$(grep "^SESSION=" .env | cut -d= -f2)" https://example.test',
    'cat "$(pwd)/.env"',
    'cat $(pwd)/.env',
    'cat "my project/.env"',
    'sh -ec "cat .env"',
    'bash -c "cat \\".env\\""',
    'bash -lc \'cat .env\'',
    'pwsh -NoProfile -Command "Get-Content .env"',
    'php -r "echo file_get_contents(\'.env\');"',
    'ruby -e "puts File.read(\'.env\')"',
    'cat > x.conf <<EOF\nTOKEN=$(grep TOKEN .env | cut -d= -f2)\nEOF',
    'cat <<EOF\n`cat .env`\nEOF',
    'git commit -m "$(cat <<\'EOF\'\nmessage\nEOF\n)"; cat .env',
    'FOO=$(cat .env)',
    'diff <(cat .env) other',
    '(cat .env)',
    'echo $((1+2)) && cat .env',
    'bat .env',
    'cat .env\\\n  README.md',
    'cat a#b .env',
    'grep -F KEY .env',
    'x=$((1<<2))\ncat .env',
    'echo "$((1<<2))"\ncat .env',
    '((i<<2))\ncat .env',
    'for ((i=0;i<3;i++)); do cat .env; done',
    'x=$((cat .env) | wc -l)',
    'x=$((cat .env) | (wc -l))',
    'x=$(cat <<EOF\nbody\nEOF)\ncat .env',
    'ssh prod \'cat "/srv/app/.env"\'',
    'ssh prod \'cat < /srv/app/.env\'',
    'cat ${ENV_FILE:-.env}',
    'grep KEY .env*',
    'cat .env.*',
    'cat .env.$NODE_ENV',
    'cat .env.${NODE_ENV}',
    'ssh prod <<\'EOF\'\ncat .env\nEOF',
    'bash <<EOF\ncat .env\nEOF',
    'sudo -u deploy docker exec -i app sh <<EOF\ncat .env\nEOF',
    'sudo bash <<\'EOF\'\ncat .env\nEOF',
    'cat C:\\\\app\\\\.env',
    'wsl cat .env',
    'winpty cat .env',
    'eval cat .env',
    'eval "cat .env"',
    'busybox cat .env'
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
    'git commit -m "$(cat <<\'EOF\'\nfix\n\nsource .env stays in the deploy script\nEOF\n)"',
    'gh pr create --body "$(cat <<\'EOF\'\ncat .env\nEOF\n)"',
    'git commit -m "title\n\nhead .env used to be fine\ncat .env too"',
    'cat > notes.md <<\'EOF\'\n$(cat .env)\nEOF',
    'cat > notes.md <<\\EOF\n$(cat .env)\nEOF',
    'echo "literal \\$(cat .env)"',
    'grep -e secret -e .env .gitignore',
    'git ls-files | grep -e key -e .env',
    'grep -A 2 .env README.md',
    'grep -n -C 2 .env docs/setup.md',
    'rg -C 3 .env docs/',
    'rg -g "*.md" .env docs/',
    'grep --include "*.md" -r .env docs/',
    'head -3 a.txt  # .env later',
    'sort a.txt # then .env',
    'cat a.txt # cat .env',
    'docker build . -f Dockerfile --env-file .env',
    'ssh prod "ls -a | grep .env"',
    'echo cat .env',
    'sudo tee .env',
    'grep -ne secret -ne .env .gitignore',
    'grep -F .env list.txt',
    'ssh prod "cat /etc/hosts; ls -la /srv/app/.env"',
    'rg --max-depth 2 .env docs',
    'cat <<\'EOF\'\ncat .env\nEOF',
    'tee notes.md <<EOF\ncat .env\nEOF',
    'x=$((1<<2))\necho .env',
    '',
    undefined
  ]) assert.equal(readsCredentialSource(command), false, String(command));
});

test('a heredoc ends where its terminator says, and the next line is a command again', () => {
  assert.equal(readsCredentialSource('cat > x.md <<EOF\nnote\nEOF\ncat .env'), true);
  assert.equal(readsCredentialSource('cat > x.md <<EOF\ncat .env'), false);
  assert.equal(readsCredentialSource('cat > x.md <<-EOF\n\tnote\n\tEOF\ncat .env'), true, 'a dash lets the terminator be indented');
  assert.equal(readsCredentialSource('cat <<A <<B\nfirst\nA\nsecond\nB\ncat .env'), true, 'two on a line are read in order');
  assert.equal(readsCredentialSource('cat <<A <<B\nfirst\nA\ncat .env\nB'), false);
  assert.equal(readsCredentialSource('grep x <<< ".env"'), false, 'a here-string is data');
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
  readsCredentialSource(`.env ${'('.repeat(150000)}`);
  readsCredentialSource(`.env ${'`'.repeat(150000)}`);
  readsCredentialSource(`.env <<EOF\n${'$('.repeat(90000)}`);
  readsCredentialSource(`.env ${'<<A '.repeat(40000)}\nx`);
  readsCredentialSource(`.env ${'\\'.repeat(150000)}`);
  readsCredentialSource(`.env ${'$(('.repeat(60000)}`);
  readsCredentialSource(`.env ${'(('.repeat(90000)}`);
  readsCredentialSource(`.env ${'sudo '.repeat(40000)} x`);
  readsCredentialSource(`${'bash <<A\n'.repeat(20000)}.env`);
  readsCredentialSource(`.env\ncat ${'a '.repeat(10000)}${'<<A '.repeat(10000)}`);
  readsCredentialSource(`cat ${'${a:-'.repeat(40000)} .env`);
  readsCredentialSource(`.env ${'cat <<A\n$('.repeat(20000)}`);
  readsCredentialSource(`.env ${'${a'.repeat(60000)}`);
  // Eight copies sharing one core took 3.9 s, and the quadratic inputs this guards took 8 and 39 s.
  assert.ok(Date.now() - started < 6000, `${Date.now() - started} ms`);
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
