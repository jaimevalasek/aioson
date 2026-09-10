'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SECRET_PATTERNS, browserSecretPatterns, stripPublicStripeConfig, redactSecrets } = require('../src/lib/qa-secret-patterns');

// Every fake key is assembled at runtime so git:guard never sees a literal one.
const fill = (unit, length) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
const hits = (text) => SECRET_PATTERNS.filter(({ regex }) => regex.test(text)).map(({ name }) => name);
// What global_secrets / probeExposedSecrets do in the page: serialize, then test.
const inPage = (value) => {
  const serialized = JSON.stringify(value);
  return browserSecretPatterns().filter(({ regex, flags }) => new RegExp(regex, flags).test(serialized)).map(({ name }) => name);
};

test('keys minted after the original list are detected', () => {
  const awsSecret = fill('wJalrXUtnFEMI/K7MDENG+bPxRfiCY', 40);
  const cases = {
    'OpenAI key': ['sk-' + 'proj-' + fill('Ab3_Cd4-', 120), 'sk-' + 'svcacct-' + fill('Ab3_Cd4-', 120), 'sk-' + fill('a1B2', 48)],
    'Anthropic key': ['sk-' + 'ant-api03-' + fill('Ab3_Cd4-', 93) + 'AA'],
    'Stripe webhook secret': ['whsec' + '_' + fill('a1B2', 32)],
    'GitHub token': ['github' + '_pat_' + '11ABCDEFG0' + fill('y', 72), ...['gho', 'ghu', 'ghr', 'ghs', 'ghp'].map((prefix) => prefix + '_' + fill('Zz9', 36))],
    'AWS secret access key': ['AWS_SECRET_ACCESS_KEY' + '=' + awsSecret, JSON.stringify({ aws_secret_access_key: awsSecret })]
  };
  for (const [name, values] of Object.entries(cases)) {
    for (const value of values) assert.deepEqual(hits(value), [name], value.slice(0, 24));
  }
});

test('JSON-serialized globals match: a quote sits between every key and its colon', () => {
  const value = 'fake' + '-value-' + 'q'.repeat(16);
  // CSRF_SECRET signs the anti-forgery tokens: unlike csrfToken, it is a credential.
  for (const key of ['DATABASE_PASSWORD', 'API_SECRET', 'AUTH_TOKEN', 'jwtSecret', 'SECRET_KEY', 'CSRF_SECRET']) {
    assert.deepEqual(inPage({ [key]: value }), ['Generic secret'], key);
  }
});

test('lookalikes and public values stay out', () => {
  const benign = [
    'sk-this-is-not-an-actual-key-here', // kebab-case CSS class, the git:guard convention
    'task-' + fill('ABCDEF123', 30), // "sk-" inside a word
    'pk_live_' + fill('A1', 24), // Stripe publishable keys are public by design
    JSON.stringify({ STRIPE_PUBLISHABLE_KEY: 'pk_test_' + fill('B2', 24) }),
    JSON.stringify({ csrfToken: fill('c3D4', 40) }), // anti-forgery tokens are page data
    JSON.stringify({ 'X-CSRF-Token': fill('c3D4', 40) }),
    JSON.stringify({ tokenExpiry: '2026-09-10T00:00:00.000Z' }),
    JSON.stringify({ password: 'short' })
  ];
  for (const value of benign) assert.deepEqual(hits(value), [], value);
});

test('the public-key strip and every pattern stay linear on a 100K blob', () => {
  // The strip's unbounded key run backtracked quadratically: 80K word
  // characters took 16 s, synchronously, on every sensitive-file body.
  for (const blob of ['a'.repeat(100000), 'A.'.repeat(50000), 'sk-'.repeat(33334), 'key: '.repeat(20000)]) {
    const started = process.hrtime.bigint();
    stripPublicStripeConfig(blob);
    hits(blob);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 1000, `${blob.slice(0, 6)}... took ${ms.toFixed(0)} ms`);
  }
  const publicKey = 'pk_live_' + fill('A1', 24);
  assert.equal(stripPublicStripeConfig(`STRIPE_PUBLIC_KEY=${publicKey}\nPASSWORD=x`), '\nPASSWORD=x', 'only the public key and its assignment go');
});

test('redactSecrets blanks every detectable shape and keeps assignment keys readable', () => {
  const value = 'fake' + '-value-' + 'q'.repeat(16);
  const stripe = 'sk_live_' + fill('a1B2', 24);
  const out = redactSecrets(`stripe=${stripe} ${JSON.stringify({ AUTH_TOKEN: value })}`);
  assert.ok(!out.includes(stripe) && !out.includes(value), out);
  // aioson-secret: fixture
  assert.match(out, /"AUTH_TOKEN":"\[REDACTED\]"/);
  const publicKey = 'pk_live_' + fill('A1', 24);
  assert.equal(redactSecrets(publicKey), publicKey, 'public keys stay readable');
});
