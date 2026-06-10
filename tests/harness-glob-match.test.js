'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  normalizePath,
  validateGlobPattern,
  matchGlob,
  matchAny
} = require('../src/harness/glob-match');

describe('harness/glob-match — normalizePath (EC-6)', () => {
  test('converts backslashes to forward slashes', () => {
    assert.strictEqual(normalizePath('src\\harness\\scope-guard.js'), 'src/harness/scope-guard.js');
  });

  test('strips leading ./', () => {
    assert.strictEqual(normalizePath('./src/cli.js'), 'src/cli.js');
  });

  test('handles null/undefined safely', () => {
    assert.strictEqual(normalizePath(null), '');
    assert.strictEqual(normalizePath(undefined), '');
  });
});

describe('harness/glob-match — validateGlobPattern (D1 strict subset)', () => {
  test('accepts the strict subset', () => {
    for (const p of ['*.pem', '.env*', 'secrets/**', '**/billing/**', 'src/*/index.js', 'file?.txt', '**']) {
      assert.strictEqual(validateGlobPattern(p).ok, true, `expected valid: ${p}`);
    }
  });

  test('rejects extglob and character classes with explicit reason', () => {
    for (const p of ['*.{js,ts}', 'src/[abc].js', '!(secret)', '+(a|b)', 'foo(bar)', 'a!b']) {
      const result = validateGlobPattern(p);
      assert.strictEqual(result.ok, false, `expected invalid: ${p}`);
      assert.match(result.reason, /unsupported glob syntax/);
    }
  });

  test('rejects empty and non-string patterns', () => {
    assert.strictEqual(validateGlobPattern('').ok, false);
    assert.strictEqual(validateGlobPattern('   ').ok, false);
    assert.strictEqual(validateGlobPattern(42).ok, false);
    assert.strictEqual(validateGlobPattern(null).ok, false);
  });
});

describe('harness/glob-match — matchGlob semantics', () => {
  test('* does not cross separators', () => {
    assert.strictEqual(matchGlob('src/*.js', 'src/cli.js'), true);
    assert.strictEqual(matchGlob('src/*.js', 'src/commands/cli.js'), false);
  });

  test('? matches exactly one non-separator char', () => {
    assert.strictEqual(matchGlob('file?.txt', 'file1.txt'), true);
    assert.strictEqual(matchGlob('file?.txt', 'file12.txt'), false);
    assert.strictEqual(matchGlob('a?b', 'a/b'), false);
  });

  test('** crosses separators', () => {
    assert.strictEqual(matchGlob('**/billing/**', 'src/billing/charge.js'), true);
    assert.strictEqual(matchGlob('**/billing/**', 'billing/charge.js'), true);
    assert.strictEqual(matchGlob('**/billing/**', 'src/app/billing/deep/x.js'), true);
    assert.strictEqual(matchGlob('**/billing/**', 'src/notbilling/x.js'), false);
  });

  test('trailing /** requires content inside the dir', () => {
    assert.strictEqual(matchGlob('secrets/**', 'secrets/api.key'), true);
    assert.strictEqual(matchGlob('secrets/**', 'secrets/deep/nested.txt'), true);
    assert.strictEqual(matchGlob('secrets/**', 'secrets'), false);
    assert.strictEqual(matchGlob('secrets/**', 'other/secrets.txt'), false);
  });

  test('pattern without slash matches basename at any depth (gitignore-style)', () => {
    assert.strictEqual(matchGlob('*.pem', 'server.pem'), true);
    assert.strictEqual(matchGlob('*.pem', 'certs/deep/server.pem'), true);
    assert.strictEqual(matchGlob('.env*', '.env'), true);
    assert.strictEqual(matchGlob('.env*', 'config/.env.production'), true);
    assert.strictEqual(matchGlob('package-lock.json', 'package-lock.json'), true);
    assert.strictEqual(matchGlob('*.pem', 'server.pem.bak'), false);
  });

  test('matches with Windows separators on both sides (EC-6)', () => {
    assert.strictEqual(matchGlob('secrets/**', 'secrets\\api.key'), true);
    assert.strictEqual(matchGlob('secrets\\**', 'secrets/api.key'), true);
    assert.strictEqual(matchGlob('**\\billing\\**', 'src\\billing\\x.js'), true);
  });

  test('literal dots are not regex wildcards', () => {
    assert.strictEqual(matchGlob('*.key', 'apixkey'), false);
    assert.strictEqual(matchGlob('a.b', 'axb'), false);
  });
});

describe('harness/glob-match — matchAny', () => {
  test('returns the first matching pattern', () => {
    assert.strictEqual(matchAny(['*.pem', 'secrets/**'], 'secrets/x.txt'), 'secrets/**');
    assert.strictEqual(matchAny(['*.pem', 'secrets/**'], 'a/b.pem'), '*.pem');
  });

  test('returns null when nothing matches or list invalid', () => {
    assert.strictEqual(matchAny(['*.pem'], 'src/cli.js'), null);
    assert.strictEqual(matchAny(null, 'src/cli.js'), null);
  });
});
