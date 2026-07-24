'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPrivateIpAddress,
  assertSafeRemoteUrl,
  fetchPage
} = require('../src/web');

test('AC-premium-01 safe research rejects private and link-local addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.1.2', '172.16.0.1', '192.168.1.2', '::1', 'fd00::1']) {
    assert.equal(isPrivateIpAddress(address), true, address);
  }
  assert.equal(isPrivateIpAddress('203.0.113.10'), false);
});

test('safe research rejects localhost without performing DNS lookup', async () => {
  let lookups = 0;
  await assert.rejects(
    assertSafeRemoteUrl('http://localhost/admin', {
      lookup: async () => { lookups += 1; return [{ address: '203.0.113.10' }]; }
    }),
    /private remote host/i
  );
  assert.equal(lookups, 0);
});

test('safe research rejects a public hostname resolving to a private address before fetch', async () => {
  let fetchCalls = 0;
  await assert.rejects(
    fetchPage('https://example.test/source', {
      safeRemote: true,
      lookup: async () => [{ address: '127.0.0.1' }],
      fetch: async () => { fetchCalls += 1; throw new Error('must not fetch'); }
    }),
    /resolves to a private address/i
  );
  assert.equal(fetchCalls, 0);
});

test('safe research validates every redirect target and blocks private redirects', async () => {
  let fetchCalls = 0;
  await assert.rejects(
    fetchPage('https://example.test/source', {
      safeRemote: true,
      lookup: async () => [{ address: '203.0.113.10' }],
      fetch: async () => {
        fetchCalls += 1;
        return {
          status: 302,
          ok: false,
          url: 'https://example.test/source',
          headers: { get: (name) => name === 'location' ? 'http://127.0.0.1/admin' : null },
          text: async () => ''
        };
      }
    }),
    /private remote address/i
  );
  assert.equal(fetchCalls, 1);
});

test('safe research permits a bounded public response', async () => {
  const page = await fetchPage('https://example.test/source', {
    safeRemote: true,
    lookup: async () => [{ address: '203.0.113.10' }],
    fetch: async () => ({
      status: 200,
      ok: true,
      url: 'https://example.test/source',
      headers: { get: (name) => name === 'content-type' ? 'text/html' : null },
      text: async () => '<main>public evidence</main>'
    })
  });

  assert.equal(page.ok, true);
  assert.match(page.html, /public evidence/);
});
