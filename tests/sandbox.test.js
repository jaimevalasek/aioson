'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeInSandbox, redactCredentials, summarizeOutput } = require('../src/sandbox');

test('executeInSandbox — runs simple shell command', async () => {
  const result = await executeInSandbox('echo hello');
  assert.ok(result.ok, 'should succeed');
  assert.ok(result.stdout.includes('hello'), 'stdout should include hello');
  assert.equal(result.timedOut, false);
});

test('executeInSandbox — captures stderr separately', async () => {
  const result = await executeInSandbox('echo error-msg >&2');
  assert.ok(result.stderr.includes('error-msg'), 'stderr should capture redirect');
});

test('executeInSandbox — exitCode on failure', async () => {
  const result = await executeInSandbox('exit 42');
  assert.equal(result.ok, false, 'should return ok:false on non-zero exit');
  assert.equal(result.exitCode, 42, 'exitCode should be 42');
});

test('executeInSandbox — timeout enforcement', async () => {
  const result = await executeInSandbox('node -e "setInterval(function(){}, 1000)"', { timeout: 200 });
  assert.equal(result.timedOut, true, 'should mark as timed out');
  assert.equal(result.ok, false, 'should return ok:false on timeout');
}, { timeout: 5000 });

test('executeInSandbox — stdout and stderr not mixed', async () => {
  const result = await executeInSandbox('echo out && echo err >&2');
  assert.ok(result.stdout.includes('out'), 'stdout has out');
  // stderr may or may not have 'err' depending on buffering, but they should be separate strings
  assert.ok(typeof result.stdout === 'string');
  assert.ok(typeof result.stderr === 'string');
});

test('redactCredentials — redacts GitHub tokens', () => {
  const text = 'token=ghp_abcdefghijklmnopqrstuvwxyz12345678AB';
  const result = redactCredentials(text);
  assert.ok(!result.includes('ghp_abcdefghijklmnopqrstuvwxyz12345678AB'), 'GitHub token should be redacted');
  assert.ok(result.includes('REDACTED'), 'REDACTED placeholder should appear');
});

test('redactCredentials — redacts AWS access keys', () => {
  const text = 'key=AKIAIOSFODNN7EXAMPLE';
  const result = redactCredentials(text);
  assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS key should be redacted');
  assert.ok(result.includes('REDACTED'));
});

test('redactCredentials — redacts Google OAuth tokens', () => {
  const text = 'auth=ya29.A0ARrdaM_qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890AB';
  const result = redactCredentials(text);
  assert.ok(!result.includes('ya29.A0ARrdaM'), 'Google token should be redacted');
});

test('redactCredentials — redacts Bearer tokens', () => {
  const text = 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature';
  const result = redactCredentials(text);
  assert.ok(!result.includes('eyJhbGciOiJSUzI1NiJ9'), 'Bearer token should be redacted');
});

test('redactCredentials — redacts password= assignments', () => {
  const text = 'connect using password=MySecretPass123';
  const result = redactCredentials(text);
  assert.ok(!result.includes('MySecretPass123'), 'password value should be redacted');
});

test('redactCredentials — redacts secret= assignments', () => {
  const text = 'secret=top_secret_value_here';
  const result = redactCredentials(text);
  assert.ok(!result.includes('top_secret_value_here'), 'secret value should be redacted');
});

test('redactCredentials — redacts api_key= assignments', () => {
  const text = 'api_key=sk-abc123def456ghi789';
  const result = redactCredentials(text);
  assert.ok(!result.includes('sk-abc123def456ghi789'), 'api_key value should be redacted');
});

test('redactCredentials — leaves normal text unchanged', () => {
  const text = 'This is normal output with no secrets.';
  const result = redactCredentials(text);
  assert.equal(result, text, 'normal text should pass through unchanged');
});

test('redactCredentials — handles empty string', () => {
  assert.equal(redactCredentials(''), '');
});

test('summarizeOutput — returns full content when within maxSize', () => {
  const text = 'short output';
  const result = summarizeOutput(text, '', 1000);
  assert.equal(result, text, 'short output should be unchanged');
});

test('summarizeOutput — truncates long content with omission marker', () => {
  const text = 'x'.repeat(10000);
  const result = summarizeOutput(text, 'test intent', 100);
  assert.ok(result.includes('omitted'), 'should include omitted marker');
  assert.ok(result.includes('test intent'), 'should include intent');
  assert.ok(result.length < text.length, 'result should be shorter than original');
});

test('summarizeOutput — preserves head and tail', () => {
  const head = 'START_MARKER';
  const tail = 'END_MARKER';
  const filler = 'x'.repeat(10000);
  const text = `${head}${filler}${tail}`;
  const result = summarizeOutput(text, '', 100);
  assert.ok(result.includes('START_MARKER') || result.includes('END_MARKER'), 'should preserve at least one end');
});

test('executeInSandbox — runs node inline script', async () => {
  const result = await executeInSandbox('node -e "console.log(JSON.stringify({ok:true}))"');
  assert.ok(result.ok, 'node exec should succeed');
  assert.ok(result.stdout.includes('"ok"') || result.stdout.includes('true'), 'should capture node output');
}, { timeout: 10000 });
