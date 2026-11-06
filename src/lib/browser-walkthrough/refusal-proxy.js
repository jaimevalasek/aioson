'use strict';

/**
 * Keeps a browser on this machine while a run handles a test credential or keeps a
 * session.
 *
 * Two rounds of guards on navigation each left a way out: a route that 302s after
 * the address check, a 307 that keeps the body, a new tab, a WebSocket, a service
 * worker. Each race closed showed another, because the page was still able to reach
 * the network. So the run takes that away: the browser gets a proxy that answers 403
 * to everything, and only loopback bypasses it. Nothing the page does can leave, in
 * any channel, and there is no race left to win.
 *
 * It fails closed, because a flag can stop working in silence: one that Chromium still
 * accepts and ignores was measured sending a TURN username out. So the browser has to
 * show both before the first page: a host that cannot exist reaches the proxy, and a
 * WebRTC call to a local socket sends nothing. A browser that fails either is not used.
 */

const dgram = require('node:dgram');
const http = require('node:http');

const PROBE_HOST = 'network-containment-check.invalid';
const MAX_HOSTS = 50;
const REFUSAL = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

// `host:port` for a tunnel, an absolute url for the rest. Only the host is kept: the
// path and the query can hold what the page was trying to send.
function hostOfRequest(req) {
  const target = String(req.url || '');
  try {
    if (req.method === 'CONNECT') return new URL(`http://${target}`).hostname;
    return new URL(target).hostname;
  } catch {
    return '';
  }
}

async function startRefusalProxy() {
  const hosts = new Set();
  let probed = false;
  const note = (req) => {
    const host = hostOfRequest(req);
    if (host === PROBE_HOST) probed = true;
    else if (host && hosts.size < MAX_HOSTS) hosts.add(host);
  };
  const server = http.createServer((req, res) => {
    note(req);
    req.resume();
    res.writeHead(403, { 'content-type': 'text/plain', connection: 'close' });
    res.end('Refused: the pages of this walkthrough only reach loopback.\n');
  });
  const refuseSocket = (req, socket) => {
    note(req);
    socket.on('error', () => {});
    socket.end(REFUSAL);
  };
  server.on('connect', refuseSocket);
  server.on('upgrade', refuseSocket);
  server.on('clientError', (error, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  // It answers nothing: a packet arriving here is already the failure.
  let udpSeen = false;
  const udp = dgram.createSocket('udp4');
  udp.on('message', () => { udpSeen = true; });
  try {
    await new Promise((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    // The caller got no proxy to close, and a listening server holds the process.
    udp.close();
    server.close();
    throw error;
  }
  udp.on('error', () => {});
  return {
    port: server.address().port,
    udpPort: udp.address().port,
    hosts: () => [...hosts],
    probed: () => probed,
    udpSeen: () => udpSeen,
    close: () => new Promise((resolve) => {
      udp.close();
      server.closeAllConnections();
      server.close(() => resolve());
    })
  };
}

/**
 * `<-loopback>` is what makes 127.0.0.0/8 go through the proxy at all: Chromium
 * exempts it by default. The exact local names then bypass it. The resolver rule
 * closes DNS, which would otherwise carry a host name out with no connection.
 * WebRTC is the channel a proxy does not see. On Chrome and Edge 156 only
 * `--webrtc-ip-handling-policy` stops it; the `--force-` spelling is accepted and does
 * nothing there. `containmentFailure` holds the run to the result, not to the spelling.
 */
function containmentArgs(port) {
  return [
    `--proxy-server=http://127.0.0.1:${port}`,
    '--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1]',
    '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1], EXCLUDE ::1'
  ];
}

// Runs in the page. It ends when gathering does, or at the limit if a packet went out.
function stunCall(port) {
  return new Promise((resolve) => {
    const Call = globalThis.RTCPeerConnection;
    if (!Call) return resolve();
    const call = new Call({ iceServers: [{ urls: `stun:127.0.0.1:${port}` }] });
    const done = () => { call.close(); resolve(); };
    call.onicegatheringstatechange = () => { if (call.iceGatheringState === 'complete') done(); };
    call.createDataChannel('probe');
    call.createOffer().then((offer) => call.setLocalDescription(offer)).catch(done);
    setTimeout(done, 1500);
    return undefined;
  });
}

/** What is wrong with this browser's containment, or null when both proofs hold. */
async function containmentFailure(context, proxy) {
  const page = await context.newPage();
  try {
    // Which of the two it is cannot be told from here: a slow machine also ends this way.
    const answer = await page.goto(`http://${PROBE_HOST}/`, { timeout: 5000 }).then(() => '', (error) => String(error && error.message || error).split('\n')[0]);
    if (!proxy.probed()) return `the probe never reached the refusal proxy${answer ? ` (${answer})` : ''}, so the browser may be ignoring it or the machine too slow to tell`;
    await page.evaluate(stunCall, proxy.udpPort);
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    return proxy.udpSeen() ? 'the browser sent WebRTC traffic past the refusal proxy, so the run could reach other hosts' : null;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { containmentArgs, containmentFailure, startRefusalProxy };
